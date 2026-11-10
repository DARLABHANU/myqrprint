import { model, Schema } from "mongoose";

const orderFileSchema = new Schema(
  {
    uploadId: { type: Schema.Types.ObjectId, ref: "CustomerUpload", required: true },
    originalName: { type: String, required: true },
    mediaType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    pageCount: { type: Number, required: true },
  },
  { _id: false },
);

const orderEventSchema = new Schema(
  {
    type: { type: String, required: true },
    actorType: { type: String, enum: ["customer", "merchant", "system"], required: true },
    timestamp: { type: Date, required: true },
    note: { type: String, maxlength: 240 },
  },
  { _id: false },
);

const printOrderSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    publicCode: { type: String, required: true, unique: true, index: true },
    customerSessionId: { type: String, required: true, index: true },
    idempotencyKey: { type: String, required: true },
    status: {
      type: String,
      enum: ["awaiting_payment", "awaiting_cash", "needs_approval", "queued", "printing", "printed", "failed", "rejected", "cancelled", "expired"],
      required: true,
    },
    paymentMethod: { type: String, enum: ["upi", "cash"], required: true },
    paymentStatus: { type: String, enum: ["unverified", "awaiting_cash", "paid"], required: true },
    paymentClaimedAt: { type: Date },
    paymentReference: { type: String, maxlength: 80 },
    customerName: { type: String, maxlength: 100 },
    customerMobile: { type: String, maxlength: 20 },
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR", required: true },
    options: {
      paperSize: { type: String, enum: ["A3", "A4", "A5", "Legal"], required: true },
      colour: { type: Boolean, required: true },
      duplex: { type: Boolean, required: true },
      copies: { type: Number, required: true, min: 1, max: 100 },
      orientation: { type: String, enum: ["portrait", "landscape"], default: "portrait" },
      pageRange: { type: String, maxlength: 400 },
      photoLayout: { type: String, enum: ["single", "two_stack", "two_side_by_side", "four", "six", "nine"] },
    },
    files: { type: [orderFileSchema], required: true },
    events: { type: [orderEventSchema], required: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

printOrderSchema.index(
  { shopId: 1, customerSessionId: 1, idempotencyKey: 1 },
  { unique: true },
);
printOrderSchema.index({ shopId: 1, status: 1, createdAt: -1 });

export const PrintOrder = model("PrintOrder", printOrderSchema);
