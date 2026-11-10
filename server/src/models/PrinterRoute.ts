import { model, Schema } from "mongoose";

const printerRouteSchema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
  paperSize: { type: String, enum: ["A3", "A4", "A5", "Legal"], required: true },
  colour: { type: Boolean, required: true },
  duplex: { type: Boolean, required: true },
  printerId: { type: Schema.Types.ObjectId, ref: "ShopPrinter", required: true },
}, { timestamps: true });

printerRouteSchema.index({ shopId: 1, paperSize: 1, colour: 1, duplex: 1 }, { unique: true });
export const PrinterRoute = model("PrinterRoute", printerRouteSchema);
