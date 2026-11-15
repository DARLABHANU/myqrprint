import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { DailySettlement } from "../models/DailySettlement.js";
import { Shop } from "../models/Shop.js";
import { previousIndiaDateKey } from "../services/dailySettlements.js";

export const adminSettlementsRouter = Router();
const accessTokenLifetimeMs = 12 * 60 * 60 * 1000;

const adminAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many password attempts. Wait 15 minutes and try again." },
});

function signAccessToken(expiresAt: number, nonce: string, secret: string) {
  const payload = `${expiresAt}.${nonce}`;
  const signature = createHmac("sha256", secret).update(`admin-settlements:${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

adminSettlementsRouter.post("/access", adminAccessLimiter, (request, response) => {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  const configuredPassword = process.env.ADMIN_SETTLEMENT_PASSWORD ?? "";
  const signingSecret = process.env.ADMIN_SETTLEMENT_TOKEN?.trim() ?? "";
  const body = z.object({ password: z.string().min(1).max(256) }).strict().safeParse(request.body);

  if (configuredPassword.length < 12 || signingSecret.length < 32) {
    response.status(503).json({ error: "Admin settlement access is not configured on the server." });
    return;
  }
  if (!body.success) {
    response.status(400).json({ error: "Enter the admin password." });
    return;
  }

  const expectedPassword = Buffer.from(configuredPassword);
  const suppliedPassword = Buffer.from(body.data.password);
  if (expectedPassword.length !== suppliedPassword.length || !timingSafeEqual(expectedPassword, suppliedPassword)) {
    response.status(401).json({ error: "Incorrect password. Try again." });
    return;
  }

  const expiresAt = Date.now() + accessTokenLifetimeMs;
  const nonce = randomBytes(16).toString("base64url");
  response.json({ accessToken: signAccessToken(expiresAt, nonce, signingSecret), expiresAt });
});

function requireAdminAccess(request: Request, response: Response, next: NextFunction) {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  const signingSecret = process.env.ADMIN_SETTLEMENT_TOKEN?.trim() ?? "";
  const authorization = request.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (signingSecret.length < 32) {
    response.status(503).json({ error: "Admin settlement access is not configured on the server." });
    return;
  }

  const parts = accessToken.split(".");
  const expiresAt = Number(parts[0]);
  const nonce = parts[1] ?? "";
  const suppliedSignature = Buffer.from(parts[2] ?? "");
  const now = Date.now();
  if (parts.length !== 3 || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + accessTokenLifetimeMs || nonce.length < 16) {
    response.status(401).json({ error: "Admin session expired. Enter the password again." });
    return;
  }
  const expectedSignature = Buffer.from(createHmac("sha256", signingSecret).update(`admin-settlements:${expiresAt}.${nonce}`).digest("base64url"));
  if (expectedSignature.length !== suppliedSignature.length || !timingSafeEqual(expectedSignature, suppliedSignature)) {
    response.status(401).json({ error: "Admin session expired. Enter the password again." });
    return;
  }
  next();
}

adminSettlementsRouter.use(requireAdminAccess);

adminSettlementsRouter.get("/", async (request, response, next) => {
  try {
    const parsedDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(request.query.date);
    const dateKey = parsedDate.success ? parsedDate.data : previousIndiaDateKey();
    const settlements = await DailySettlement.find({ dateKey })
      .populate("shopId", "displayName slug ownerName mobile email upiId settlementUpiId settlementQrDataUrl")
      .populate("sentBy", "ownerName email")
      .populate("receivedBy", "ownerName email")
      .sort({ status: 1, shopName: 1 });
    response.json({ dateKey, settlements });
  } catch (error) { next(error); }
});

adminSettlementsRouter.post("/:id/mark-sent", async (request, response, next) => {
  const id = z.string().refine(isValidObjectId).safeParse(request.params.id);
  const body = z.object({ transferReference: z.string().trim().min(6).max(40), expectedAmountPaise: z.number().int().positive(), simulation: z.boolean().optional() }).strict().safeParse(request.body);
  if (!id.success || !body.success) {
    response.status(400).json({ error: "Enter a valid settlement and UPI transfer reference (6–40 characters)." });
    return;
  }
  try {
    const pending = await DailySettlement.findById(id.data).select("shopId amountPaise status paymentMode");
    if (!pending || pending.status !== "pending") { response.status(409).json({ error: "This settlement is no longer awaiting payment." }); return; }
    const isTestMode = pending.paymentMode !== "live" || process.env.RAZORPAY_KEY_ID?.trim().startsWith("rzp_test_");
    if (isTestMode && body.data.simulation !== true) {
      response.status(409).json({ error: "This request contains Razorpay test-mode payments. Use the simulation action; no real money was received." });
      return;
    }
    if (!isTestMode && body.data.simulation === true) {
      response.status(409).json({ error: "Simulation is only available for test-mode settlements." });
      return;
    }
    if (pending.amountPaise !== body.data.expectedAmountPaise) { response.status(409).json({ error: "The settlement total changed. Refresh the page and verify the current amount before transferring." }); return; }
    const shop = await Shop.findById(pending.shopId).select("upiId settlementUpiId");
    if (!isTestMode && !(shop?.settlementUpiId?.trim() || shop?.upiId?.trim())) { response.status(409).json({ error: "Ask the shopkeeper to add a settlement UPI ID before recording the transfer." }); return; }
    const settlement = await DailySettlement.findOneAndUpdate(
      { _id: id.data, status: "pending", amountPaise: body.data.expectedAmountPaise },
      { $set: { status: "sent", transferReference: body.data.transferReference, sentAt: new Date(), sentByMethod: isTestMode ? "test_simulation" : "private_admin_link" } },
      { new: true, runValidators: true },
    ).populate("shopId", "displayName slug upiId settlementUpiId settlementQrDataUrl");
    if (!settlement) { response.status(409).json({ error: "This settlement is no longer awaiting payment." }); return; }
    response.json({ message: isTestMode ? "Test transfer simulated. No money moved; the shopkeeper can confirm the simulated receipt." : "Transfer recorded. The shopkeeper can now confirm receipt.", settlement });
  } catch (error) { next(error); }
});
