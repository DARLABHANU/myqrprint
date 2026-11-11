import { Router, type NextFunction, type Request, type Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Shop } from "../models/Shop.js";
import { SubscriptionRequest } from "../models/SubscriptionRequest.js";
import { User } from "../models/User.js";
import { PrintOrder } from "../models/PrintOrder.js";

export const subscriptionsRouter = Router();
const plans = {
  starter: { name: "Starter", amountPaise: 9900, orderLimit: 500 },
  pro: { name: "Pro", amountPaise: 49900, orderLimit: 3000 },
  premium: { name: "Premium", amountPaise: 99900, orderLimit: 7000 },
} as const;
const planSchema = z.enum(["starter", "pro", "premium"]);
const referenceSchema = z.object({ plan: planSchema, paymentReference: z.string().trim().min(6).max(80) }).strict();

function requireLogin(request: Request, response: Response, next: NextFunction) {
  if (!request.session.userId || !isValidObjectId(request.session.userId)) { response.status(401).json({ error: "Sign in to manage your subscription." }); return; }
  next();
}

subscriptionsRouter.get("/shops/subscription", requireLogin, async (request, response, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId });
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    const pending = await SubscriptionRequest.findOne({ ownerId: request.session.userId, status: "pending" }).sort({ createdAt: -1 });
    const history = await SubscriptionRequest.find({ ownerId: request.session.userId }).sort({ createdAt: -1 }).limit(100).lean();
    const orderHistory = await PrintOrder.find({ shopId: shop._id }).select("createdAt status amountPaise").sort({ createdAt: -1 }).limit(5000).lean();
    response.json({
      subscription: { plan: shop.subscriptionPlan, startedAt: shop.subscriptionStartedAt, expiresAt: shop.subscriptionExpiresAt, orderLimit: shop.subscriptionOrderLimit, ordersUsed: shop.subscriptionOrdersUsed, expired: shop.subscriptionExpiresAt <= new Date() || shop.subscriptionOrdersUsed >= shop.subscriptionOrderLimit },
      plans,
      platformUpiId: process.env.PLATFORM_UPI_ID ?? "",
      pendingRequest: pending ? { plan: pending.plan, status: pending.status, createdAt: pending.createdAt } : null,
      history: [
        { plan: shop.subscriptionPlan, startedAt: shop.subscriptionStartedAt, expiresAt: shop.subscriptionExpiresAt, orderLimit: shop.subscriptionOrderLimit, ordersUsed: shop.subscriptionOrdersUsed, amountPaise: 0, status: shop.subscriptionExpiresAt > new Date() && shop.subscriptionOrdersUsed < shop.subscriptionOrderLimit ? "active" : "expired", isCurrent: true },
        ...history.filter((item) => item.status !== "pending").map((item) => ({ plan: item.plan, startedAt: item.createdAt, expiresAt: item.reviewedAt, orderLimit: plans[item.plan].orderLimit, ordersUsed: 0, amountPaise: item.amountPaise, status: item.status, isCurrent: false })),
      ],
      invoices: [],
      usage: { ordersToday: orderHistory.filter((order) => new Date(order.createdAt).toDateString() === new Date().toDateString()).length },
    });
  } catch (error) { next(error); }
});

subscriptionsRouter.post("/shops/subscription/requests", requireLogin, async (request, response, next) => {
  const parsed = referenceSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Choose a plan and enter the UPI reference number." }); return; }
  if (!process.env.PLATFORM_UPI_ID) { response.status(503).json({ error: "Plan payments are not configured yet." }); return; }
  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId }).select("_id");
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    const existing = await SubscriptionRequest.findOne({ ownerId: request.session.userId, status: "pending" });
    if (existing) { response.status(409).json({ error: "A plan payment request is already awaiting review." }); return; }
    const plan = plans[parsed.data.plan];
    const paymentRequest = await SubscriptionRequest.create({ shopId: shop._id, ownerId: request.session.userId, plan: parsed.data.plan, amountPaise: plan.amountPaise, paymentReference: parsed.data.paymentReference });
    response.status(201).json({ request: { id: String(paymentRequest._id), plan: paymentRequest.plan, status: paymentRequest.status } });
  } catch (error) { next(error); }
});

async function requirePlatformAdmin(request: Request, response: Response): Promise<boolean> {
  if (!request.session.userId || !process.env.PLATFORM_ADMIN_EMAIL) { response.status(403).json({ error: "Platform admin access is not configured." }); return false; }
  const user = await User.findById(request.session.userId).select("email");
  if (!user || user.email.toLowerCase() !== process.env.PLATFORM_ADMIN_EMAIL.toLowerCase()) { response.status(403).json({ error: "Platform admin access required." }); return false; }
  return true;
}

subscriptionsRouter.get("/admin/subscriptions", async (request, response, next) => {
  try {
    if (!await requirePlatformAdmin(request, response)) return;
    const requests = await SubscriptionRequest.find({ status: "pending" }).populate("shopId", "displayName slug").sort({ createdAt: 1 }).limit(200);
    response.json({ requests });
  } catch (error) { next(error); }
});

subscriptionsRouter.patch("/admin/subscriptions/:requestId", async (request, response, next) => {
  const id = z.string().refine(isValidObjectId).safeParse(request.params.requestId);
  const action = z.enum(["approve", "reject"]).safeParse(request.body?.action);
  if (!id.success || !action.success) { response.status(400).json({ error: "Choose a valid review action." }); return; }
  try {
    if (!await requirePlatformAdmin(request, response)) return;
    const item = await SubscriptionRequest.findOne({ _id: id.data, status: "pending" });
    if (!item) { response.status(404).json({ error: "Pending payment request not found." }); return; }
    if (action.data === "approve") {
      const plan = plans[item.plan];
      const now = new Date();
      await Shop.updateOne({ _id: item.shopId }, { $set: { subscriptionPlan: item.plan, subscriptionStartedAt: now, subscriptionExpiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000), subscriptionOrderLimit: plan.orderLimit, subscriptionOrdersUsed: 0, isOnline: true } });
      item.status = "approved";
    } else item.status = "rejected";
    item.reviewedAt = new Date();
    await item.save();
    response.json({ status: item.status });
  } catch (error) { next(error); }
});
