import { model, Schema } from "mongoose";

const agentPairingCodeSchema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
  codeHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, index: true },
  usedAt: { type: Date },
}, { timestamps: true });

agentPairingCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AgentPairingCode = model("AgentPairingCode", agentPairingCodeSchema);
