import { model, Schema } from "mongoose";

const pendingRegistrationSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    ownerName: { type: String, required: true, trim: true, maxlength: 100 },
    shopName: { type: String, required: true, trim: true, maxlength: 100 },
    mobile: { type: String, required: true, trim: true, maxlength: 20 },
    passwordHash: { type: String, required: true, select: false },
    termsAcceptedAt: { type: Date, required: true },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    lastSentAt: { type: Date, required: true },
    attempts: { type: Number, required: true, default: 0, min: 0, max: 5 },
  },
  { timestamps: true },
);

export const PendingRegistration = model("PendingRegistration", pendingRegistrationSchema);
