import { Router, type NextFunction, type Request, type Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Shop } from "../models/Shop.js";
import { SubscriptionRequest } from "../models/SubscriptionRequest.js";
import {
  PLATFORM_ACCOUNT_NAME,
  PLATFORM_UPI_ID,
  SUBSCRIPTION_PLANS,
  type BillingCycle,
  type SubscriptionPlanId,
} from "../subscriptionConfig.js";

export const subscriptionsRouter = Router();

function requireOwner(request: Request, response: Response, next: NextFunction) {
  if (!request.session.userId || !isValidObjectId(request.session.userId)) {
    response.status(401).json({ error: "Sign in to manage your shop subscription." });
    return;
  }
  next();
}

subscriptionsRouter.use(requireOwner);

const requestSchema = z.object({
  plan: z.enum(["starter", "pro", "premium"]),
  billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
  utr: z.string().trim().min(6, "Enter a valid UPI Reference / UTR Number.").max(40),
}).strict();

subscriptionsRouter.get("/subscription", async (request, response, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId });
    if (!shop) {
      response.status(404).json({ error: "Shop not found." });
      return;
    }

    const now = new Date();
    const expiresAt = shop.subscriptionExpiresAt ? new Date(shop.subscriptionExpiresAt) : new Date(now.getTime() + 7 * 86400000);
    const isExpired = expiresAt.getTime() < now.getTime();
    const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000));
    const orderLimit = shop.subscriptionOrderLimit ?? 50;
    const ordersUsed = shop.subscriptionOrdersUsed ?? 0;
    const ordersRemaining = Math.max(0, orderLimit - ordersUsed);
    const currentPlanId = (shop.subscriptionPlan as SubscriptionPlanId) || "demo";
    const currentPlan = SUBSCRIPTION_PLANS[currentPlanId] ?? SUBSCRIPTION_PLANS.demo;

    const [pendingRequest, history] = await Promise.all([
      SubscriptionRequest.findOne({ shopId: shop._id, status: "pending" }).sort({ createdAt: -1 }),
      SubscriptionRequest.find({ shopId: shop._id }).sort({ createdAt: -1 }).limit(10),
    ]);

    response.json({
      subscription: {
        plan: currentPlanId,
        planName: currentPlan.name,
        startedAt: shop.subscriptionStartedAt ?? shop.createdAt,
        expiresAt,
        isExpired,
        daysRemaining,
        orderLimit,
        ordersUsed,
        ordersRemaining,
        usagePercentage: Math.min(100, Math.round((ordersUsed / Math.max(1, orderLimit)) * 100)),
      },
      pendingRequest,
      history,
      availablePlans: SUBSCRIPTION_PLANS,
      platformPayment: {
        upiId: PLATFORM_UPI_ID,
        accountName: PLATFORM_ACCOUNT_NAME,
      },
    });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/subscription/request", async (request, response, next) => {
  const parsed = requestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid subscription request." });
    return;
  }

  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId });
    if (!shop) {
      response.status(404).json({ error: "Shop not found." });
      return;
    }

    const existingPending = await SubscriptionRequest.findOne({ shopId: shop._id, status: "pending" });
    if (existingPending) {
      response.status(409).json({
        error: `You already have a pending verification request for ${existingPending.plan.toUpperCase()} (UTR: ${existingPending.utr}). Wait for admin approval or cancel it first.`,
      });
      return;
    }

    const targetPlan = SUBSCRIPTION_PLANS[parsed.data.plan as SubscriptionPlanId];
    if (!targetPlan) {
      response.status(400).json({ error: "Invalid subscription plan selected." });
      return;
    }

    const amountPaise = parsed.data.billingCycle === "annual" ? targetPlan.annualPricePaise : targetPlan.monthlyPricePaise;

    const newRequest = await SubscriptionRequest.create({
      shopId: shop._id,
      ownerId: request.session.userId,
      plan: parsed.data.plan,
      billingCycle: parsed.data.billingCycle,
      amountPaise,
      utr: parsed.data.utr,
      status: "pending",
    });

    response.status(201).json({
      message: "Subscription payment submitted! We will verify the UTR and activate your plan shortly.",
      request: newRequest,
    });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/subscription/cancel-request", async (request, response, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId });
    if (!shop) {
      response.status(404).json({ error: "Shop not found." });
      return;
    }

    const result = await SubscriptionRequest.findOneAndDelete({ shopId: shop._id, status: "pending" });
    if (!result) {
      response.status(404).json({ error: "No pending subscription request found to cancel." });
      return;
    }

    response.json({ message: "Pending subscription request cancelled." });
  } catch (error) {
    next(error);
  }
});

