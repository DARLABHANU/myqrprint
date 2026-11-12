import { Router, type NextFunction, type Request, type Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { Shop } from "../models/Shop.js";
import { SubscriptionRequest } from "../models/SubscriptionRequest.js";
import { User } from "../models/User.js";
import { SUBSCRIPTION_PLANS, type SubscriptionPlanId } from "../subscriptionConfig.js";

export const adminSubscriptionsRouter = Router();

async function requireAdmin(request: Request, response: Response, next: NextFunction) {
  if (!request.session.userId || !isValidObjectId(request.session.userId)) {
    response.status(401).json({ error: "Sign in with an admin account." });
    return;
  }

  try {
    const user = await User.findById(request.session.userId);
    if (!user) {
      response.status(401).json({ error: "User record not found." });
      return;
    }

    const adminEmail = (process.env.ADMIN_EMAIL || "daarlabhanumurthy@gmail.com").toLowerCase().trim();
    const isAdmin = user.role === "admin" || user.email.toLowerCase().trim() === adminEmail;

    if (!isAdmin) {
      response.status(403).json({ error: "Admin access required for subscription management." });
      return;
    }

    response.locals.adminUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

adminSubscriptionsRouter.use(requireAdmin);

adminSubscriptionsRouter.get("/", async (_request, response, next) => {
  try {
    const [pending, recent, shopsCount, paidShopsCount, revenueAgg, allShops] = await Promise.all([
      SubscriptionRequest.find({ status: "pending" })
        .populate("shopId", "displayName slug city upiId")
        .populate("ownerId", "ownerName email mobile")
        .sort({ createdAt: -1 }),
      SubscriptionRequest.find({ status: { $ne: "pending" } })
        .populate("shopId", "displayName slug")
        .populate("ownerId", "ownerName email")
        .sort({ updatedAt: -1 })
        .limit(40),
      Shop.countDocuments(),
      Shop.countDocuments({ subscriptionPlan: { $in: ["starter", "pro", "premium"] } }),
      SubscriptionRequest.aggregate([
        { $match: { status: "approved" } },
        { $group: { _id: null, total: { $sum: "$amountPaise" } } },
      ]),
      Shop.find().select("displayName slug subscriptionPlan subscriptionExpiresAt subscriptionOrdersUsed subscriptionOrderLimit").sort({ createdAt: -1 }).limit(100),
    ]);

    const totalRevenuePaise = revenueAgg[0]?.total ?? 0;

    response.json({
      pending,
      recent,
      stats: {
        pendingCount: pending.length,
        totalShops: shopsCount,
        activePaidCount: paidShopsCount,
        totalRevenuePaise,
      },
      allShops,
      availablePlans: SUBSCRIPTION_PLANS,
    });
  } catch (error) {
    next(error);
  }
});

adminSubscriptionsRouter.post("/:id/approve", async (request, response, next) => {
  const requestId = z.string().refine(isValidObjectId).safeParse(request.params.id);
  if (!requestId.success) {
    response.status(400).json({ error: "Invalid request ID." });
    return;
  }

  try {
    const subRequest = await SubscriptionRequest.findOne({ _id: requestId.data, status: "pending" });
    if (!subRequest) {
      response.status(404).json({ error: "Pending subscription request not found." });
      return;
    }

    const shop = await Shop.findById(subRequest.shopId);
    if (!shop) {
      response.status(404).json({ error: "Associated shop no longer exists." });
      return;
    }

    const planConfig = SUBSCRIPTION_PLANS[subRequest.plan as SubscriptionPlanId] ?? SUBSCRIPTION_PLANS.starter;
    const durationDays = subRequest.billingCycle === "annual" ? 365 : 30;
    const now = new Date();

    let newExpiresAt: Date;
    if (shop.subscriptionExpiresAt && new Date(shop.subscriptionExpiresAt).getTime() > now.getTime()) {
      newExpiresAt = new Date(new Date(shop.subscriptionExpiresAt).getTime() + durationDays * 86400000);
    } else {
      newExpiresAt = new Date(now.getTime() + durationDays * 86400000);
    }

    shop.subscriptionPlan = subRequest.plan;
    shop.subscriptionExpiresAt = newExpiresAt;
    shop.subscriptionOrderLimit = planConfig.orderLimit;
    shop.subscriptionOrdersUsed = 0;
    shop.subscriptionStartedAt = now;
    await shop.save();

    subRequest.status = "approved";
    subRequest.reviewedBy = new Types.ObjectId(request.session.userId);
    subRequest.reviewedAt = now;
    await subRequest.save();

    response.json({
      message: `Plan ${subRequest.plan.toUpperCase()} approved and activated until ${newExpiresAt.toISOString().slice(0, 10)}.`,
      shop,
      request: subRequest,
    });
  } catch (error) {
    next(error);
  }
});

adminSubscriptionsRouter.post("/:id/reject", async (request, response, next) => {
  const requestId = z.string().refine(isValidObjectId).safeParse(request.params.id);
  if (!requestId.success) {
    response.status(400).json({ error: "Invalid request ID." });
    return;
  }

  const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });
  const parsed = reasonSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Please provide a valid rejection reason." });
    return;
  }

  try {
    const subRequest = await SubscriptionRequest.findOne({ _id: requestId.data, status: "pending" });
    if (!subRequest) {
      response.status(404).json({ error: "Pending subscription request not found." });
      return;
    }

    subRequest.status = "rejected";
    subRequest.rejectionReason = parsed.data.reason;
    subRequest.reviewedBy = new Types.ObjectId(request.session.userId);
    subRequest.reviewedAt = new Date();
    await subRequest.save();

    response.json({ message: "Subscription request rejected.", request: subRequest });
  } catch (error) {
    next(error);
  }
});

adminSubscriptionsRouter.post("/override", async (request, response, next) => {
  const overrideSchema = z.object({
    shopSlug: z.string().trim().min(2),
    plan: z.enum(["demo", "starter", "pro", "premium"]),
    durationDays: z.number().int().min(1).max(1000),
    orderLimit: z.number().int().min(10).max(1000000).optional(),
  });

  const parsed = overrideSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid override parameters." });
    return;
  }

  try {
    const shop = await Shop.findOne({ slug: parsed.data.shopSlug.toLowerCase() });
    if (!shop) {
      response.status(404).json({ error: `Shop with slug "${parsed.data.shopSlug}" was not found.` });
      return;
    }

    const planConfig = SUBSCRIPTION_PLANS[parsed.data.plan];
    const newExpiresAt = new Date(Date.now() + parsed.data.durationDays * 86400000);

    shop.subscriptionPlan = parsed.data.plan;
    shop.subscriptionExpiresAt = newExpiresAt;
    shop.subscriptionOrderLimit = parsed.data.orderLimit ?? planConfig.orderLimit;
    shop.subscriptionOrdersUsed = 0;
    shop.subscriptionStartedAt = new Date();
    await shop.save();

    response.json({
      message: `Shop "${shop.displayName}" updated to ${parsed.data.plan.toUpperCase()} plan for ${parsed.data.durationDays} days.`,
      shop,
    });
  } catch (error) {
    next(error);
  }
});
