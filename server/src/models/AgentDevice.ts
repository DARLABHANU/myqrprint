import { model, Schema } from "mongoose";

const agentDeviceSchema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
  deviceName: { type: String, required: true, trim: true, maxlength: 120 },
  agentVersion: { type: String, required: true, trim: true, maxlength: 40 },
  tokenHash: { type: String, required: true, unique: true, select: false },
  tokenExpiresAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ["online", "offline", "revoked"], default: "offline", required: true, index: true },
  lastSeenAt: { type: Date },
  revokedAt: { type: Date },
}, { timestamps: true });

agentDeviceSchema.index({ shopId:  1, status: 1, lastSeenAt: -1 });
export const AgentDevice = model("AgentDevice", agentDeviceSchema);
