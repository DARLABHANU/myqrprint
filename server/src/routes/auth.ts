import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
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
    console.log(`[AUTH] Registration request for: ${email} (Shop: "${shopName}", Owner: "${ownerName}")`);
    if (await User.exists({ email })) {
      console.warn(`[AUTH] Registration rejected: User ${email} already exists`);
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
      await sendAccountEmail(email, "Your Printly registration code", `Your Printly verification code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`);
    } catch (mailError) {
      await PendingRegistration.deleteOne({ email });
      const code = typeof mailError === "object" && mailError !== null && "code" in mailError ? String(mailError.code) : "unknown";
      console.error("Registration code email could not be delivered:", code);
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
    console.log(`[AUTH] Verifying registration OTP for: ${parsed.data.email}`);
    const pending = await PendingRegistration.findOne({ email: parsed.data.email }).select("+codeHash +passwordHash");
    if (!pending || pending.expiresAt <= new Date() || pending.attempts >= 5) {
      console.warn(`[AUTH] OTP rejected for ${parsed.data.email}: ${!pending ? "Not found" : pending.attempts >= 5 ? "Too many attempts" : "Expired"}`);
      response.status(400).json({ error: "That registration code is invalid or expired. Request a new code." }); return;
    }
    if (!matchesDigest(parsed.data.code, pending.codeHash)) {
      pending.attempts += 1;
      await pending.save();
      console.warn(`[AUTH] Incorrect OTP for ${parsed.data.email}. Attempt ${pending.attempts} of 5.`);
      response.status(400).json({ error: pending.attempts >= 5 ? "Too many incorrect codes. Request a new one." : "That code is incorrect. Check it and try again." });
      return;
    }
    const { ownerName, shopName, mobile, email, termsAcceptedAt, passwordHash } = pending;
    if (!passwordHash) {
      response.status(400).json({ error: "This registration is incomplete. Start again and choose a password." });
      return;
    }
    const user = await User.create({ ownerName, email, passwordHash, termsAcceptedAt, emailVerifiedAt: new Date() });
    let shop;
    try {
      shop = await Shop.create({ ownerId: user._id, slug: makeSlug(shopName), displayName: shopName, ownerName, mobile, email });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }
    await PendingRegistration.deleteOne({ _id: pending._id });
    await regenerateSession(request, String(user._id));
    console.log(`[AUTH] Registration completed! User created (ID: ${user._id}), Shop created: "${shop.displayName}" (${shop.slug}).`);
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
    console.log(`[AUTH] Login attempt for: ${parsed.data.email}`);
    const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");
    if (!user || !user.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      console.warn(`[AUTH] Login failed: invalid credentials for ${parsed.data.email}`);
      response.status(401).json({ error: "Email or password is incorrect." });
      return;
    }
    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
      await user.save();
    }
    await regenerateSession(request, String(user._id));
    console.log(`[AUTH] Login successful: User ${user.email} (ID: ${user._id})`);
    response.json({ user: { id: String(user._id), ownerName: user.ownerName, email: user.email } });
  } catch (error) {
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
    const user = await User.findOne({ email: parsed.data.email }).select("+emailVerificationTokenHash +emailVerificationExpiresAt");
    if (user && !user.emailVerifiedAt && isMailConfigured()) {
      const token = randomBytes(32).toString("hex");
      user.emailVerificationTokenHash = digest(token);
      user.emailVerificationExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      const link = new URL("/verify-email", request.get("origin") ?? "http://localhost:5173");
      link.searchParams.set("email", user.email); link.searchParams.set("token", token);
      await sendAccountEmail(user.email, "Verify your Printly email", `Verify your email within 30 minutes: ${link.toString()}`);
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
      const link = new URL("/reset-password", request.get("origin") ?? "http://localhost:5173");
      link.searchParams.set("email", user.email); link.searchParams.set("token", token);
      await sendAccountEmail(user.email, "Reset your Printly password", `Reset your password within 30 minutes: ${link.toString()}`);
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
