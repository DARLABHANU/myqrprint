import { model, Schema, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    ownerName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // New accounts use email OTP sign-in. Keep this optional for accounts that
    // already have a password or choose to set one through password recovery.
    passwordHash: { type: String, required: false, select: false },
    termsAcceptedAt: { type: Date, required: true },
    emailVerifiedAt: { type: Date },
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpiresAt: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    twoFactorEnabled: { type: Boolean, default: false },
    loginCodeHash: { type: String, select: false },
    loginCodeExpiresAt: { type: Date, select: false },
    loginCodeSentAt: { type: Date, select: false },
    loginCodeAttempts: { type: Number, default: 0, min: 0, max: 5, select: false },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
