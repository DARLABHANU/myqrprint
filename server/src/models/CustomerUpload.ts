import { model, Schema } from "mongoose";

const customerUploadSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    originalName: { type: String, required: true, maxlength: 128 },
    storageKey: { type: String, required: true, unique: true },
    mediaType: { type: String, enum: ["application/pdf", "image/jpeg", "image/png", "image/webp"], required: true },
    kind: { type: String, enum: ["document", "photo"], required: true },
    sizeBytes: { type: Number, required: true, min: 1 },
    pageCount: { type: Number, required: true, min: 1 },
    state: { type: String, enum: ["temporary", "attached"], default: "temporary", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "PrintOrder" },
    cloudinaryUrl: { type: String },
    cloudinaryPublicId: { type: String },
    cloudinaryResourceType: { type: String },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

customerUploadSchema.index({ shopId: 1, sessionId: 1, state: 1 });

export const CustomerUpload = model("CustomerUpload", customerUploadSchema);
