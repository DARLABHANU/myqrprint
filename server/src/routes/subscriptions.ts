import { Router, type NextFunction, type Request, type Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Shop } from "../models/Shop.js";
import { SubscriptionPayment } from "../models/SubscriptionPayment.js";
import { activateCapturedSubscription } from "../services/subscriptions.js";
import { captureRazorpayPayment, createRazorpayOrder, fetchRazorpayPayment, getRazorpayMode, isRazorpayEnabled, razorpayPublicKeyId, verifyCheckoutSignature } from "../services/razorpay.js";
import { SUBSCRIPTION_PLANS, type SubscriptionPlanId } from "../subscriptionConfig.js";

export const subscriptionsRouter = Router();

function requireOwner(request: Request, response: Response, next: NextFunction) {
  if (!request.session.userId || !isValidObjectId(request.session.userId)) {
    response.status(401).json({ error: "Sign in to manage your shop subscription." });
    return;
  }
  next();
}

subscriptionsRouter.use(requireOwner);

const checkoutSchema = z.object({ billingCycle: z.enum(["monthly", "annual"]) }).strict();
const verifySchema = z.object({
  razorpayOrderId: z.string().min(1).max(100),
  razorpayPaymentId: z.string().min(1).max(100),
  razorpaySignature: z.string().min(1).max(200),
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
    const ordersRemaining = orderLimit > 0 ? Math.max(0, orderLimit - ordersUsed) : 0;
    const currentPlanId = (shop.subscriptionPlan as SubscriptionPlanId) || "demo";
    const currentPlan = SUBSCRIPTION_PLANS[currentPlanId] ?? SUBSCRIPTION_PLANS.demo;

    const subscriptionPayments = await SubscriptionPayment.find({ ownerId: request.session.userId }).sort({ createdAt: -1 }).limit(20).lean();

    response.json({
      subscription: {
        plan: currentPlanId,
        planName: currentPlan.name,
        billingCycle: shop.subscriptionBillingCycle ?? null,
        startedAt: shop.subscriptionStartedAt ?? shop.createdAt,
        expiresAt,
        isExpired,
        daysRemaining,
        orderLimit,
        ordersUsed,
        ordersRemaining,
        usagePercentage: orderLimit > 0 ? Math.min(100, Math.round((ordersUsed / orderLimit) * 100)) : 0,
      },
      pendingRequest: null,
      history: [],
      subscriptionPayments,
      availablePlans: { demo: SUBSCRIPTION_PLANS.demo, starter: SUBSCRIPTION_PLANS.starter },
    });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/subscription/checkout", async (request, response, next) => {
  const parsed = checkoutSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Choose monthly or annual billing." });
    return;
  }
  if (!isRazorpayEnabled()) {
    response.status(503).json({ error: "Subscription checkout is temporarily unavailable." });
    return;
  }
  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId });
    if (!shop) {
      response.status(404).json({ error: "Shop not found." });
      return;
    }
    const plan = SUBSCRIPTION_PLANS.starter;
    const amountPaise = parsed.data.billingCycle === "annual" ? plan.annualPricePaise : plan.monthlyPricePaise;
    const receipt = `sub_${shop._id.toString().slice(-12)}_${Date.now()}`;
    const gatewayOrder = await createRazorpayOrder({
      amountPaise,
      receipt,
      notes: { purpose: "shop_subscription", shopId: shop._id.toString(), ownerId: String(request.session.userId) },
    });
    const payment = await SubscriptionPayment.create({
      shopId: shop._id,
      ownerId: request.session.userId,
      plan: "starter",
      billingCycle: parsed.data.billingCycle,
      durationMonths: parsed.data.billingCycle === "annual" ? 12 : 1,
      amountPaise,
      razorpayOrderId: gatewayOrder.id,
      paymentMode: getRazorpayMode() ?? "test",
    });
    response.status(201).json({
      paymentId: payment._id,
      checkout: {
        keyId: razorpayPublicKeyId(),
        orderId: gatewayOrder.id,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        name: "UrQrPrint",
        description: `${plan.name} ${parsed.data.billingCycle === "annual" ? "annual" : "monthly"} plan`,
        prefill: { name: shop.ownerName, email: shop.email, contact: shop.mobile },
      },
    });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.get("/subscription/payments/:orderId", async (request, response, next) => {
  const orderId = z.string().min(1).max(100).safeParse(request.params.orderId);
  if (!orderId.success) {
    response.status(400).json({ error: "Invalid subscription order." });
    return;
  }
  try {
    const payment = await SubscriptionPayment.findOne({ razorpayOrderId: orderId.data, ownerId: request.session.userId }).lean();
    if (!payment) {
      response.status(404).json({ error: "Subscription payment not found." });
      return;
    }
    response.json({ status: payment.status, expiresAt: payment.expiresAt ?? null });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/subscription/verify", async (request, response, next) => {
  const parsed = verifySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Razorpay returned invalid subscription payment details." });
    return;
  }
  try {
    const paymentRecord = await SubscriptionPayment.findOne({
      razorpayOrderId: parsed.data.razorpayOrderId,
      ownerId: request.session.userId,
    });
    if (!paymentRecord) {
      response.status(404).json({ error: "Subscription checkout was not found." });
      return;
    }
    if (paymentRecord.status === "paid") {
      response.json({ message: "Payment confirmed and subscription activated.", expiresAt: paymentRecord.expiresAt });
      return;
    }
    if (!verifyCheckoutSignature(parsed.data.razorpayOrderId, parsed.data.razorpayPaymentId, parsed.data.razorpaySignature)) {
      response.status(400).json({ error: "Razorpay payment signature could not be verified." });
      return;
    }
    let gatewayPayment = await fetchRazorpayPayment(parsed.data.razorpayPaymentId);
    if (gatewayPayment.order_id !== paymentRecord.razorpayOrderId
      || gatewayPayment.amount !== paymentRecord.amountPaise
      || gatewayPayment.currency !== paymentRecord.currency) {
      response.status(400).json({ error: "Razorpay payment does not match this subscription." });
      return;
    }
    if (gatewayPayment.status === "authorized") {
      gatewayPayment = await captureRazorpayPayment(gatewayPayment.id, paymentRecord.amountPaise);
    }
    if (gatewayPayment.status !== "captured") {
      response.status(409).json({ error: "Payment is not captured yet. Wait a moment and refresh subscription status." });
      return;
    }
    const activation = await activateCapturedSubscription({
      orderId: gatewayPayment.order_id,
      paymentId: gatewayPayment.id,
      amount: gatewayPayment.amount,
      currency: gatewayPayment.currency,
    });
    if (!activation.found || !activation.matched) {
      response.status(409).json({ error: "Payment was received, but subscription activation needs support review." });
      return;
    }
    response.json({ message: "Payment confirmed and subscription activated.", expiresAt: activation.expiresAt });
  } catch (error) {
    next(error);
  }
});
