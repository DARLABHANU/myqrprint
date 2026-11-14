import { createHash } from "node:crypto";
import { isValidObjectId } from "mongoose";
import type { NextFunction, Request, Response } from "express";
import { AgentDevice } from "./models/AgentDevice.js";
import { Shop } from "./models/Shop.js";

export async function requireDesktopAgent(request: Request, response: Response, next: NextFunction) {
  const userId = request.session.userId;
  const token = request.get("x-printly-agent-token") ?? "";
  if (!userId || !isValidObjectId(userId) || !/^[A-Za-z0-9_-]{40,160}$/.test(token)) {
    response.status(403).json({ error: "Printer and job controls are available in the connected desktop agent." });
    return;
  }
  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [agent, shop] = await Promise.all([
      AgentDevice.findOne({ tokenHash, status: { $ne: "revoked" }, tokenExpiresAt: { $gt: new Date() } }).select("shopId"),
      Shop.findOne({ ownerId: userId }).select("_id"),
    ]);
    if (!agent || !shop || String(agent.shopId) !== String(shop._id)) {
      response.status(403).json({ error: "Printer and job controls are available in the connected desktop agent." });
      return;
    }
    response.locals.desktopAgent = agent;
    next();
  } catch (error) {
    next(error);
  }
}
