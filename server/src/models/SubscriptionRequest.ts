import { model, Schema, type InferSchemaType } from "mongoose";

const subscriptionRequestSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: String, enum: ["starter", "pro", "premium"], required: true },
    billingCycle: { type: String, enum: ["monthly", "annual"], default: "monthly" },
    amountPaise: { type: Number, required: true, min: 0 },
    utr: { type: String, required: true, trim: true, minlength: 6, maxlength: 40 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    rejectionReason: { type: String, default: "", trim: true, maxlength: 300 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);

export type SubscriptionRequestDocument = InferSchemaType<typeof subscriptionRequestSchema>;
export const SubscriptionRequest = model("SubscriptionRequest", subscriptionRequestSchema);

