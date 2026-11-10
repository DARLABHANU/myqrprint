import { model, Schema } from "mongoose";

const shopPrinterSchema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  address: { type: String, default: "", trim: true, maxlength: 200 },
  protocol: { type: String, enum: ["simulated", "ipp"], default: "simulated", required: true },
  supportsColour: { type: Boolean, default: false },
  supportsDuplex: { type: Boolean, default: false },
  paperSizes: { type: [{ type: String, enum: ["A3", "A4", "A5", "Legal"] }], default: ["A4"] },
  status: { type: String, enum: ["ready", "offline"], default: "offline", required: true },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

export const ShopPrinter = model("ShopPrinter", shopPrinterSchema);
