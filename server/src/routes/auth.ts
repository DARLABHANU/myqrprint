import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Shop } from "../models/Shop.js";
import { User } from "../models/User.js";
import { isMailConfigured, sendAccountEmail } from "../services/mail.js";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(12).max(128),
});

const registerSchema = credentialsSchema.extend({
  ownerName: z.string().trim().min(2).max(100),
  shopName: z.string().trim().min(2).max(100),
  mobile: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/),
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
const emailSchema = z.object({ email: z.string().email().max(254).transform((value) => value.toLowerCase().trim()) });
const tokenSchema = z.string().regex(/^[a-f\d]{64}$/i);

authRouter.post("/register", authLimiter, async (request, response, next) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Check the form fields and try again.", details: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    if (!isMailConfigured() && process.env.NODE_ENV === "production") {
      response.status(503).json({ error: "Account email delivery is not configured." });
      return;
    }
    const { ownerName, shopName, mobile, email, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = randomBytes(32).toString("hex");
    const user = await User.create({
      ownerName,
      email,
      passwordHash,
      termsAcceptedAt: new Date(),
      ...(isMailConfigured() || process.env.NODE_ENV === "production"
        ? { emailVerificationTokenHash: digest(verificationToken), emailVerificationExpiresAt: new Date(Date.now() + 30 * 60 * 1000) }
        : { emailVerifiedAt: new Date() }),
    });

    try {
      await Shop.create({
        ownerId: user._id,
        slug: makeSlug(shopName),
        displayName: shopName,
        ownerName,
        mobile,
        email,
      });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }

    if (!user.emailVerifiedAt) {
      if (isMailConfigured()) {
        const link = new URL("/verify-email", request.get("origin") ?? "http://localhost:5173");
        link.searchParams.set("email", email);
        link.searchParams.set("token", verificationToken);
        try {
          await sendAccountEmail(email, "Verify your Printly email", `Verify your email within 30 minutes: ${link.toString()}`);
        } catch (mailError) {
          // Do not leave an unverified account behind when delivery fails; that
          // would make a retry look like a duplicate registration.
          await Shop.deleteOne({ ownerId: user._id });
          await User.deleteOne({ _id: user._id });
          const code = typeof mailError === "object" && mailError !== null && "code" in mailError
            ? String(mailError.code)
            : "unknown";
          console.error("Account verification email could not be delivered:", code);
          response.status(503).json({ error: "Email delivery is unavailable from the current server. Registration was not completed; please try again later or contact support." });
          return;
        }
      }
      response.status(201).json({ user: { id: String(user._id), ownerName, email }, verificationRequired: true, ...(!isMailConfigured() ? { verificationToken } : {}) });
      return;
    }
    await regenerateSession(request, String(user._id));
    response.status(201).json({ user: { id: String(user._id), ownerName, email }, verificationRequired: false });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      response.status(409).json({ error: "An account with this email already exists." });
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
    const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
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
  const userId = request.session.pendingTwoFactorUserId;
  if (!parsed.success || !userId || !isValidObjectId(userId)) { response.status(400).json({ error: "Enter the six-digit sign-in code." }); return; }
  try {
    const user = await User.findById(userId).select("ownerName email twoFactorEnabled +loginCodeHash +loginCodeExpiresAt");
    if (!user || !user.twoFactorEnabled || !user.loginCodeHash || !user.loginCodeExpiresAt || user.loginCodeExpiresAt <= new Date() || user.loginCodeHash !== digest(parsed.data.code)) {
      response.status(401).json({ error: "That sign-in code is invalid or expired." }); return;
    }
    user.loginCodeHash = undefined; user.loginCodeExpiresAt = undefined; await user.save();
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
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) { response.status(401).json({ error: "Current password is incorrect." }); return; }
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
