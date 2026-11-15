import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { createHash, createPublicKey, randomBytes, randomInt, timingSafeEqual, verify as verifySignature } from "node:crypto";
import rateLimit from "express-rate-limit";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Shop } from "../models/Shop.js";
import { User } from "../models/User.js";
import { PendingRegistration } from "../models/PendingRegistration.js";
import { isMailConfigured, sendAccountEmail } from "../services/mail.js";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(12).max(128),
});

const registerSchema = z.object({
  ownerName: z.string().trim().min(2).max(100),
  shopName: z.string().trim().min(2).max(100),
  mobile: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/),
  email: z.string().email().max(254).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(12).max(128),
  termsAccepted: z.literal(true),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
});

function regenerateSession(request: Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      request.session.userId = userId;
      request.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });
}

function makeSlug(shopName: string): string {
  const base = shopName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "print-shop";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const matchesDigest = (value: string, hash: string) => {
  const actual = Buffer.from(digest(value), "hex");
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const makeOtp = () => String(randomInt(100000, 1_000_000));
const emailSchema = z.object({ email: z.string().email().max(254).transform((value) => value.toLowerCase().trim()) });
const tokenSchema = z.string().regex(/^[a-f\d]{64}$/i);

function accountLink(path: string, query: Record<string, string>): string {
  const configuredOrigin = process.env.PUBLIC_WEB_ORIGIN?.trim();
  const defaultOrigin = process.env.NODE_ENV === "production" ? "https://www.urqrprint.shop" : "http://localhost:5173";
  const origin = new URL(configuredOrigin || defaultOrigin);
  if (!['https:', 'http:'].includes(origin.protocol) || (process.env.NODE_ENV === "production" && origin.protocol !== "https:")) {
    throw new Error("PUBLIC_WEB_ORIGIN must be an HTTPS website URL in production.");
  }
  const link = new URL(path, origin.origin);
  for (const [key, value] of Object.entries(query)) link.searchParams.set(key, value);
  return link.toString();
}

type GoogleJwk = { kid: string; kty: string; n: string; e: string; alg?: string; use?: string; [key: string]: unknown };
type GoogleClaims = { iss?: string; aud?: string; sub?: string; email?: string; email_verified?: boolean; name?: string; exp?: number; nonce?: string };
let googleJwks: GoogleJwk[] = [];
let googleJwksExpiresAt = 0;

async function verifyGoogleCredential(credential: string, expectedNonce: string): Promise<GoogleClaims | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error("Google sign-in is not configured on the server.");
  const parts = credential.split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
  let claims: GoogleClaims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as typeof header;
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as GoogleClaims;
  } catch { return null; }
  if (header.alg !== "RS256" || !header.kid) return null;
  if (googleJwksExpiresAt <= Date.now()) {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Google sign-in verification is temporarily unavailable.");
    const body = await response.json() as { keys?: GoogleJwk[] };
    if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error("Google sign-in verification is temporarily unavailable.");
    googleJwks = body.keys;
    const maxAge = Number(/max-age=(\d+)/i.exec(response.headers.get("cache-control") ?? "")?.[1] ?? 3600);
    googleJwksExpiresAt = Date.now() + Math.min(maxAge, 24 * 60 * 60) * 1000;
  }
  const jwk = googleJwks.find((key) => key.kid === header.kid && key.use !== "enc");
  if (!jwk) return null;
  let signatureValid = false;
  try {
    signatureValid = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    );
  } catch { return null; }
  const issuerValid = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  const audienceValid = claims.aud === clientId;
  const timeValid = typeof claims.exp === "number" && claims.exp > Math.floor(Date.now() / 1000);
  if (!signatureValid || !issuerValid || !audienceValid || !timeValid || claims.email_verified !== true || !claims.sub || !claims.email || claims.nonce !== expectedNonce) return null;
  return { ...claims, email: claims.email.toLowerCase().trim() };
}

authRouter.post("/register", authLimiter, async (request, response, next) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Check the form fields and try again.", details: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    if (!isMailConfigured()) {
      response.status(503).json({ error: "Account email delivery is not configured." });
      return;
    }
    const { ownerName, shopName, mobile, email, password } = parsed.data;
    console.log("[AUTH] Registration request received.");
    if (await User.exists({ email })) {
      console.warn("[AUTH] Registration rejected: account already exists.");
      response.status(409).json({ error: "An account with this email already exists. Sign in with your password or reset it." });
      return;
    }
    let pending = await PendingRegistration.findOne({ email });
    if (pending && Date.now() - pending.lastSentAt.getTime() < 60_000) {
      response.status(429).json({ error: "A code was sent recently. Wait a minute before requesting another." });
      return;
    }
    const code = makeOtp();
    if (!pending) pending = new PendingRegistration({ email });
    pending.ownerName = ownerName;
    pending.shopName = shopName;
    pending.mobile = mobile;
    pending.passwordHash = await bcrypt.hash(password, 12);
    pending.termsAcceptedAt = new Date();
    pending.codeHash = digest(code);
    pending.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    pending.lastSentAt = new Date();
    pending.attempts = 0;
    await pending.save();
    try {
      await sendAccountEmail(email, "Your UrQrPrint registration code", `Your UrQrPrint verification code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`);
    } catch (mailError) {
      await PendingRegistration.deleteOne({ email });
      const code = typeof mailError === "object" && mailError !== null && "code" in mailError ? String(mailError.code) : "unknown";
      console.error("Registration code email could not be delivered.");
      response.status(503).json({ error: "The verification code could not be sent. Check the email delivery settings and try again." });
      return;
    }
    response.status(200).json({ otpRequired: true, message: "A 6-digit OTP has been sent to your email." });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      response.status(409).json({ error: "An account with this email already exists. If an earlier signup did not finish, open Email verification and resend the link after email delivery is configured; otherwise sign in." });
      return;
    }
    next(error);
  }
});

authRouter.post("/register/verify-code", authLimiter, async (request, response, next) => {
  const parsed = emailSchema.extend({ code: z.string().regex(/^\d{6}$/) }).safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Enter the email address and six-digit code." }); return; }
  try {
    console.log("[AUTH] Registration code verification requested.");
    const pending = await PendingRegistration.findOne({ email: parsed.data.email }).select("+codeHash +passwordHash");
    if (!pending || pending.expiresAt <= new Date() || pending.attempts >= 5) {
      console.warn(`[AUTH] Registration code rejected: ${!pending ? "not found" : pending.attempts >= 5 ? "attempt limit reached" : "expired"}.`);
      response.status(400).json({ error: "That registration code is invalid or expired. Request a new code." }); return;
    }
    if (!matchesDigest(parsed.data.code, pending.codeHash)) {
      pending.attempts += 1;
      await pending.save();
      console.warn(`[AUTH] Registration code mismatch. Attempt ${pending.attempts} of 5.`);
      response.status(400).json({ error: pending.attempts >= 5 ? "Too many incorrect codes. Request a new one." : "That code is incorrect. Check it and try again." });
      return;
    }
    const { ownerName, shopName, mobile, email, termsAcceptedAt, passwordHash } = pending;
    if (!passwordHash) {
      response.status(400).json({ error: "This registration is incomplete. Start again and choose a password." });
      return;
    }
    const user = await User.create({ ownerName, email, passwordHash, termsAcceptedAt, emailVerifiedAt: new Date() });
    const trialStartedAt = new Date();
    let shop;
    try {
      shop = await Shop.create({
        ownerId: user._id,
        slug: makeSlug(shopName),
        displayName: shopName,
        ownerName,
        mobile,
        email,
        subscriptionPlan: "demo",
        subscriptionStartedAt: trialStartedAt,
        subscriptionExpiresAt: new Date(trialStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        subscriptionOrderLimit: 50,
        subscriptionOrdersUsed: 0,
      });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }
    await PendingRegistration.deleteOne({ _id: pending._id });
    await regenerateSession(request, String(user._id));
    console.log(`[AUTH] Registration completed. User ID: ${user._id}; shop ID: ${shop._id}.`);
    response.status(201).json({ user: { id: String(user._id), ownerName, email } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      response.status(409).json({ error: "An account with this email already exists. Sign in with your password or reset it." });
      return;
    }
    next(error);
  }
});

authRouter.post("/login", authLimiter, async (request, response, next) => {
  const parsed = credentialsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid email and password." });
    return;
  }

  try {
    console.log("[AUTH] Login attempt received.");
    const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");
    if (!user || !user.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      console.warn("[AUTH] Login failed: invalid credentials.");
      response.status(401).json({ error: "Email or password is incorrect." });
      return;
    }
    if (!user.emailVerifiedAt) {
      response.status(403).json({ error: "Verify your email before signing in. Use the resend verification option to get a fresh link." });
      return;
    }
    await regenerateSession(request, String(user._id));
    console.log(`[AUTH] Login successful. User ID: ${user._id}.`);
    response.json({ user: { id: String(user._id), ownerName: user.ownerName, email: user.email } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/google", authLimiter, async (request, response, next) => {
  const parsed = z.object({ credential: z.string().min(100).max(10000), nonce: z.string().uuid() }).strict().safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Google did not return a valid sign-in credential." }); return; }
  try {
    const claims = await verifyGoogleCredential(parsed.data.credential, parsed.data.nonce);
    if (!claims) { response.status(401).json({ error: "Google sign-in could not be verified. Please try again." }); return; }
    const user = await User.findOne({ email: claims.email });
    if (!user) {
      response.status(404).json({ error: "No UrQrPrint account uses this Google email. Create an account with email OTP first, then continue with Google." });
      return;
    }
    if (!user.emailVerifiedAt) {
      // Google asserted this email as verified; this is a trusted identity proof.
      user.emailVerifiedAt = new Date();
      await user.save();
    }
    await regenerateSession(request, String(user._id));
    response.json({ user: { id: String(user._id), ownerName: user.ownerName, email: user.email } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/google/register", authLimiter, async (request, response, next) => {
  const parsed = z.object({
    credential: z.string().min(100).max(10000),
    nonce: z.string().uuid(),
    ownerName: z.string().trim().min(2).max(100),
    shopName: z.string().trim().min(2).max(100),
    mobile: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/),
    termsAccepted: z.literal(true),
  }).strict().safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Complete your shop details and accept the Terms and Privacy Notice before continuing." }); return; }
  try {
    const claims = await verifyGoogleCredential(parsed.data.credential, parsed.data.nonce);
    if (!claims) { response.status(401).json({ error: "Google sign-in could not be verified. Please try again." }); return; }
    if (await User.exists({ email: claims.email })) {
      response.status(409).json({ error: "An account with this Google email already exists. Continue from the sign-in page." });
      return;
    }
    const user = await User.create({ ownerName: parsed.data.ownerName, email: claims.email, termsAcceptedAt: new Date(), emailVerifiedAt: new Date() });
    const trialStartedAt = new Date();
    let shop;
    try {
      shop = await Shop.create({
        ownerId: user._id,
        slug: makeSlug(parsed.data.shopName),
        displayName: parsed.data.shopName,
        ownerName: parsed.data.ownerName,
        mobile: parsed.data.mobile,
        email: claims.email,
        subscriptionPlan: "demo",
        subscriptionStartedAt: trialStartedAt,
        subscriptionExpiresAt: new Date(trialStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        subscriptionOrderLimit: 50,
        subscriptionOrdersUsed: 0,
      });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }
    await regenerateSession(request, String(user._id));
    response.status(201).json({ user: { id: String(user._id), ownerName: user.ownerName, email: user.email }, shop: { id: String(shop._id), slug: shop.slug } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      response.status(409).json({ error: "An account with this Google email already exists. Continue from the sign-in page." });
      return;
    }
    next(error);
  }
});

authRouter.post("/change-password", authLimiter, async (request, response, next) => {
  const parsed = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) }).strict().safeParse(request.body);
  const userId = request.session.userId;
  if (!parsed.success || !userId || !isValidObjectId(userId)) { response.status(400).json({ error: "Sign in and provide a valid current and new password." }); return; }
  try {
    const user = await User.findById(userId).select("+passwordHash");
    if (!user || !user.passwordHash || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) { response.status(401).json({ error: "Current password is incorrect." }); return; }
    user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await user.save();
    response.json({ changed: true });
  } catch (error) { next(error); }
});

authRouter.post("/verify-email", authLimiter, async (request, response, next) => {
  const parsed = emailSchema.extend({ token: tokenSchema }).safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Enter the email and verification token from your message." }); return; }
  try {
    const user = await User.findOne({ email: parsed.data.email }).select("+emailVerificationTokenHash +emailVerificationExpiresAt");
    if (!user || !user.emailVerificationTokenHash || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt <= new Date() || user.emailVerificationTokenHash !== digest(parsed.data.token)) {
      response.status(400).json({ error: "That verification link is invalid or expired. Request a new one." }); return;
    }
    user.emailVerifiedAt = new Date();
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    await user.save();
    response.json({ verified: true });
  } catch (error) { next(error); }
});

authRouter.post("/resend-verification", authLimiter, async (request, response, next) => {
  const parsed = emailSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Enter a valid email address." }); return; }
  try {
    if (!isMailConfigured()) { response.status(503).json({ error: "Account email delivery is not configured." }); return; }
    const user = await User.findOne({ email: parsed.data.email }).select("+emailVerificationTokenHash +emailVerificationExpiresAt");
    if (user && !user.emailVerifiedAt) {
      const token = randomBytes(32).toString("hex");
      user.emailVerificationTokenHash = digest(token);
      user.emailVerificationExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      await sendAccountEmail(user.email, "Verify your UrQrPrint email", `Verify your email within 30 minutes: ${accountLink("/verify-email", { email: user.email, token })}`);
    }
    response.json({ message: "If the account needs verification, a new link has been sent." });
  } catch (error) { next(error); }
});

authRouter.post("/forgot-password", authLimiter, async (request, response, next) => {
  const parsed = emailSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Enter a valid email address." }); return; }
  try {
    const user = await User.findOne({ email: parsed.data.email }).select("+passwordResetTokenHash +passwordResetExpiresAt");
    if (user && isMailConfigured()) {
      const token = randomBytes(32).toString("hex");
      user.passwordResetTokenHash = digest(token);
      user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      await sendAccountEmail(user.email, "Reset your UrQrPrint password", `Reset your password within 30 minutes: ${accountLink("/reset-password", { email: user.email, token })}`);
    }
    response.json({ message: "If an account exists for that email, password reset instructions have been sent." });
  } catch (error) { next(error); }
});

authRouter.post("/reset-password", authLimiter, async (request, response, next) => {
  const parsed = emailSchema.extend({ token: tokenSchema, password: z.string().min(12).max(128) }).safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Check the email, reset token, and new password." }); return; }
  try {
    const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash +passwordResetTokenHash +passwordResetExpiresAt");
    if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiresAt || user.passwordResetExpiresAt <= new Date() || user.passwordResetTokenHash !== digest(parsed.data.token)) {
      response.status(400).json({ error: "That reset link is invalid or expired. Request another one." }); return;
    }
    user.passwordHash = await bcrypt.hash(parsed.data.password, 12);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();
    response.json({ reset: true });
  } catch (error) { next(error); }
});

authRouter.get("/me", async (request, response, next) => {
  const userId = request.session.userId;
  if (!userId || !isValidObjectId(userId)) {
    response.status(401).json({ error: "Sign in to continue." });
    return;
  }
  try {
    const user = await User.findById(userId).select("ownerName email");
    if (!user) {
      request.session.destroy(() => undefined);
      response.status(401).json({ error: "Sign in to continue." });
      return;
    }
    response.json({ user: { id: String(user._id), ownerName: user.ownerName, email: user.email } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (request, response, next) => {
  request.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    response.clearCookie("printly.sid", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    response.status(204).end();
  });
});
