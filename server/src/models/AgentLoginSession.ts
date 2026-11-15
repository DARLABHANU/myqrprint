import { model, Schema } from "mongoose";

const agentLoginSessionSchema = new Schema({
  stateHash: { type: String, required: true, unique: true },
  pollTokenHash: { type: String, required: true },
  deviceName: { type: String, required: true, trim: true, maxlength: 120 },
  agentVersion: { type: String, required: true, trim: true, maxlength: 40 },
  status: { type: String, enum: ["pending", "completed", "issuing", "consumed"], default: "pending", required: true },
  shopId: { type: Schema.Types.ObjectId, ref: "Shop" },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

export const AgentLoginSession = model("AgentLoginSession", agentLoginSessionSchema);
