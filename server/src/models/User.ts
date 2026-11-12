import { model, Schema, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    ownerName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: false, select: false },
    termsAcceptedAt: { type: Date, required: true },
    role: { type: String, enum: ["owner", "admin"], default: "owner" },
    emailVerifiedAt: { type: Date },
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpiresAt: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
