import mongoose from "mongoose";
import { Shop } from "../models/Shop.js";
import { SubscriptionPayment } from "../models/SubscriptionPayment.js";

function addCalendarMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export async function activateCapturedSubscription(input: {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
}) {
  const session = await mongoose.startSession();
  let result: { found: boolean; matched?: boolean; expiresAt?: Date } = { found: false };
  try {
    await session.withTransaction(async () => {
      const payment = await SubscriptionPayment.findOneAndUpdate(
        { razorpayOrderId: input.orderId, status: "pending", amountPaise: input.amount, currency: input.currency },
        { $set: { status: "activating" } },
        { new: true, session },
      );
      if (!payment) return;
      result = { found: true, matched: true };

      const shop = await Shop.findById(payment.shopId).session(session);
      if (!shop) throw new Error("Subscription payment refers to a missing shop.");
      const now = new Date();
      const expiryBase = shop.subscriptionExpiresAt && shop.subscriptionExpiresAt > now
        ? new Date(shop.subscriptionExpiresAt)
        : now;
      const expiresAt = addCalendarMonths(expiryBase, payment.durationMonths);

      shop.subscriptionPlan = payment.plan;
      shop.subscriptionBillingCycle = payment.billingCycle;
      shop.subscriptionStartedAt = now;
      shop.subscriptionExpiresAt = expiresAt;
      shop.subscriptionOrderLimit = 0; // zero means no plan quota
      shop.subscriptionOrdersUsed = 0;
      await shop.save({ session });

      payment.status = "paid";
      payment.razorpayPaymentId = input.paymentId;
      payment.paidAt = now;
      payment.activatedAt = now;
      payment.expiresAt = expiresAt;
      await payment.save({ session });
      result = { found: true, matched: true, expiresAt };
    });
  } finally {
    await session.endSession();
  }
  if (!result.found) {
    const existing = await SubscriptionPayment.findOne({ razorpayOrderId: input.orderId });
    if (existing) {
      if (existing.amountPaise !== input.amount || existing.currency !== input.currency) return { found: true, matched: false };
      if (existing.status === "paid") return { found: true, matched: true, expiresAt: existing.expiresAt ?? undefined };
    }
  }
  return result;
}
