import { model, Schema, type InferSchemaType } from "mongoose";

const subscriptionPaymentSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: String, enum: ["starter"], required: true },
    billingCycle: { type: String, enum: ["monthly", "annual"], required: true },
    durationMonths: { type: Number, required: true, enum: [1, 12] },
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR", required: true },
    razorpayOrderId: { type: String, required: true, unique: true, index: true },
    razorpayPaymentId: { type: String, sparse: true, unique: true, index: true },
    paymentMode: { type: String, enum: ["test", "live"], required: true },
    status: { type: String, enum: ["pending", "activating", "paid", "failed"], default: "pending", index: true },
    paidAt: { type: Date },
    activatedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

subscriptionPaymentSchema.index({ ownerId: 1, createdAt: -1 });

export type SubscriptionPaymentDocument = InferSchemaType<typeof subscriptionPaymentSchema>;
export const SubscriptionPayment = model("SubscriptionPayment", subscriptionPaymentSchema);
