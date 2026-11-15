import { model, Schema } from "mongoose";

const dailySettlementSchema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
  dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  amountPaise: { type: Number, required: true, min: 1 },
  orderCount: { type: Number, required: true, min: 1 },
  orderIds: { type: [{ type: Schema.Types.ObjectId, ref: "PrintOrder" }], required: true },
  shopName: { type: String, required: true, maxlength: 100 },
  upiId: { type: String, default: "", maxlength: 100 },
  paymentMode: { type: String, enum: ["test", "live"], default: "test", required: true },
  status: { type: String, enum: ["pending", "sent", "received"], default: "pending", required: true, index: true },
  transferReference: { type: String, maxlength: 40 },
  sentAt: { type: Date },
  sentBy: { type: Schema.Types.ObjectId, ref: "User" },
  sentByMethod: { type: String, enum: ["private_admin_link"] },
  receivedAt: { type: Date },
  receivedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

dailySettlementSchema.index({ shopId: 1, dateKey: 1 }, { unique: true });
dailySettlementSchema.index({ status: 1, dateKey: -1 });

export const DailySettlement = model("DailySettlement", dailySettlementSchema);
