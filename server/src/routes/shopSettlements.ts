import { Router, type NextFunction, type Request, type Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { DailySettlement } from "../models/DailySettlement.js";
import { Shop } from "../models/Shop.js";

export const shopSettlementsRouter = Router();

function requireOwner(request: Request, response: Response, next: NextFunction) {
  if (!request.session.userId || !isValidObjectId(request.session.userId)) {
    response.status(401).json({ error: "Sign in to view your settlements." });
    return;
  }
  next();
}

shopSettlementsRouter.use(requireOwner);

shopSettlementsRouter.get("/", async (request, response, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId }).select("_id upiId settlementUpiId settlementQrDataUrl");
    if (!shop) { response.status(404).json({ error: "Shop not found." }); return; }
    const settlements = await DailySettlement.find({ shopId: shop._id }).sort({ dateKey: -1 }).limit(90).populate("sentBy", "ownerName email").populate("receivedBy", "ownerName email");
    response.json({ upiId: shop.settlementUpiId || shop.upiId || "", settlements });
  } catch (error) { next(error); }
});

shopSettlementsRouter.post("/:id/confirm-received", async (request, response, next) => {
  if (!isValidObjectId(request.params.id)) { response.status(400).json({ error: "Invalid settlement." }); return; }
  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId }).select("_id");
    if (!shop) { response.status(404).json({ error: "Shop not found." }); return; }
    const settlement = await DailySettlement.findOneAndUpdate(
      { _id: new Types.ObjectId(request.params.id), shopId: shop._id, status: "sent" },
      { $set: { status: "received", receivedAt: new Date(), receivedBy: new Types.ObjectId(request.session.userId) } },
      { new: true, runValidators: true },
    );
    if (!settlement) { response.status(409).json({ error: "This transfer is not awaiting your receipt confirmation." }); return; }
    response.json({ message: settlement.paymentMode !== "live" ? "Simulated receipt confirmed. No money was transferred." : "Settlement receipt confirmed.", settlement });
  } catch (error) { next(error); }
});
