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
  termsAccepted: z.literal(true),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
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
    const { ownerName, shopName, mobile, email } = parsed.data;
    if (await User.exists({ email })) {
      response.status(409).json({ error: "An account with this email already exists. Sign in with an email code instead." });
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
    response.status(200).json({ otpRequired: true, message: "A six-digit verification code has been sent to your email." });
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
    const pending = await PendingRegistration.findOne({ email: parsed.data.email }).select("+codeHash");
    if (!pending || pending.expiresAt <= new Date() || pending.attempts >= 5) {
      response.status(400).json({ error: "That registration code is invalid or expired. Request a new code." }); return;
    }
    if (!matchesDigest(parsed.data.code, pending.codeHash)) {
      pending.attempts += 1;
      await pending.save();
      response.status(400).json({ error: pending.attempts >= 5 ? "Too many incorrect codes. Request a new one." : "That code is incorrect. Check it and try again." });
      return;
    }
    const { ownerName, shopName, mobile, email, termsAcceptedAt } = pending;
    const user = await User.create({ ownerName, email, termsAcceptedAt, emailVerifiedAt: new Date() });
    try {
      await Shop.create({ ownerId: user._id, slug: makeSlug(shopName), displayName: shopName, ownerName, mobile, email });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }
    await PendingRegistration.deleteOne({ _id: pending._id });
    await regenerateSession(request, String(user._id));
    response.status(201).json({ user: { id: String(user._id), ownerName, email } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      response.status(409).json({ error: "An account with this email already exists. Sign in with an email code instead." });
      return;
    }
    next(error);
  }
});

authRouter.post("/login/request-code", authLimiter, async (request, response, next) => {
  const parsed = emailSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Enter a valid email address." }); return; }
  if (!isMailConfigured()) { response.status(503).json({ error: "Email delivery is not configured." }); return; }
  try {
    const user = await User.findOne({ email: parsed.data.email }).select("ownerName email emailVerifiedAt");
    if (user) {
      const codeState = await User.findById(user._id).select("+loginCodeSentAt");
      if (codeState?.loginCodeSentAt && Date.now() - codeState.loginCodeSentAt.getTime() < 60_000) {
        response.json({ otpRequired: true, message: "If a verified account exists for this email, a sign-in code has been sent. Wait a minute before requesting another." });
        return;
      }
      const code = makeOtp();
      user.loginCodeHash = digest(code);
      user.loginCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      user.loginCodeSentAt = new Date();
      user.loginCodeAttempts = 0;
      await user.save();
      request.session.pendingOtpUserId = String(user._id);
      await new Promise<void>((resolve, reject) => request.session.save((error) => error ? reject(error) : resolve()));
      try {
        await sendAccountEmail(user.email, "Your Printly sign-in code", `Your Printly sign-in code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`);
      } catch (error) {
        user.loginCodeHash = undefined; user.loginCodeExpiresAt = undefined; await user.save();
        request.session.pendingOtpUserId = undefined;
        throw error;
      }
    }
    response.json({ otpRequired: true, message: "If a verified account exists for this email, a sign-in code has been sent." });
  } catch (error) { next(error); }
});

authRouter.post("/login", authLimiter, async (request, response, next) => {
  const parsed = credentialsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid email and password." });
    return;
  }

  try {
    const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");
    if (!user || !user.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      response.status(401).json({ error: "Email or password is incorrect." });
      return;
    }
    if (!user.emailVerifiedAt) {
      response.status(403).json({ error: "Verify your email before signing in." });
      return;
    }
    if (user.twoFactorEnabled) {
      if (!isMailConfigured()) { response.status(503).json({ error: "Email delivery must be configured before enabling two-step verification." }); return; }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      user.loginCodeHash = digest(code);
      user.loginCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
      request.session.pendingTwoFactorUserId = String(user._id);
      await new Promise<void>((resolve, reject) => request.session.save((error) => error ? reject(error) : resolve()));
      await sendAccountEmail(user.email, "Your Printly sign-in code", `Your sign-in code is ${code}. It expires in 10 minutes.`);
      response.json({ twoFactorRequired: true });
      return;
    }
    await regenerateSession(request, String(user._id));
    response.json({ user: { id: String(user._id), ownerName: user.ownerName, email: user.email } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login/verify-code", authLimiter, async (request, response, next) => {
  const parsed = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(request.body);
  const otpUserId = request.session.pendingOtpUserId;
  const twoFactorUserId = request.session.pendingTwoFactorUserId;
  const userId = otpUserId ?? twoFactorUserId;
  if (!parsed.success || !userId || !isValidObjectId(userId)) { response.status(400).json({ error: "Enter the six-digit sign-in code." }); return; }
  try {
    const user = await User.findById(userId).select("ownerName email twoFactorEnabled emailVerifiedAt +loginCodeHash +loginCodeExpiresAt +loginCodeAttempts");
    if (!user || (!otpUserId && !user.emailVerifiedAt) || (twoFactorUserId && !user.twoFactorEnabled) || !user.loginCodeHash || !user.loginCodeExpiresAt || user.loginCodeExpiresAt <= new Date() || (user.loginCodeAttempts ?? 0) >= 5) {
      response.status(401).json({ error: "That sign-in code is invalid or expired." }); return;
    }
    if (!matchesDigest(parsed.data.code, user.loginCodeHash)) {
      user.loginCodeAttempts = (user.loginCodeAttempts ?? 0) + 1;
      await user.save();
      response.status(401).json({ error: user.loginCodeAttempts >= 5 ? "Too many incorrect codes. Request a new one." : "That sign-in code is incorrect." });
      return;
    }
    user.loginCodeHash = undefined; user.loginCodeExpiresAt = undefined; user.loginCodeAttempts = 0;
    if (otpUserId && !user.emailVerifiedAt) user.emailVerifiedAt = new Date();
    await user.save();
    request.session.pendingOtpUserId = undefined;
    request.session.pendingTwoFactorUserId = undefined;
    await regenerateSession(request, String(user._id));
    response.json({ user: { id: String(user._id), ownerName: user.ownerName, email: user.email } });
  } catch (error) { next(error); }
});

authRouter.post("/two-factor", async (request, response, next) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(request.body);
  const userId = request.session.userId;
  if (!parsed.success || !userId || !isValidObjectId(userId)) { response.status(400).json({ error: "Sign in and choose a valid setting." }); return; }
  if (parsed.data.enabled && !isMailConfigured()) { response.status(503).json({ error: "Configure SMTP email delivery before enabling two-step verification." }); return; }
  try {
    const user = await User.findByIdAndUpdate(userId, { $set: { twoFactorEnabled: parsed.data.enabled } }, { new: true }).select("twoFactorEnabled");
    if (!user) { response.status(404).json({ error: "Account not found." }); return; }
    response.json({ enabled: user.twoFactorEnabled });
  } catch (error) { next(error); }
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
    const user = await User.findById(userId).select("ownerName email twoFactorEnabled");
    if (!user) {
      request.session.destroy(() => undefined);
      response.status(401).json({ error: "Sign in to continue." });
      return;
    }
    response.json({ user: { id: String(user._id), ownerName: user.ownerName, email: user.email, twoFactorEnabled: user.twoFactorEnabled } });
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
