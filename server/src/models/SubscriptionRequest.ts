import { model, Schema } from "mongoose";

const subscriptionRequestSchema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  plan: { type: String, enum: ["starter", "pro", "premium"], required: true },
  amountPaise: { type: Number, required: true },
  paymentReference: { type: String, required: true, trim: true, maxlength: 80 },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", required: true },
  reviewedAt: { type: Date },
}, { timestamps: true });

subscriptionRequestSchema.index({ ownerId: 1, status:  1, createdAt: -1 });
export const SubscriptionRequest = model("SubscriptionRequest", subscriptionRequestSchema);
