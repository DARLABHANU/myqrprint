import { AgentDevice } from "../models/AgentDevice.js";
import { Shop } from "../models/Shop.js";
import { ShopPrinter } from "../models/ShopPrinter.js";

export const agentPresenceWindowMs = 30 * 1000;

/** Close shop availability when its last connected desktop agent stops heartbeating. */
export async function expireDisconnectedAgents(now = new Date()): Promise<void> {
  const staleBefore = new Date(now.getTime() - agentPresenceWindowMs);
  const staleAgents = await AgentDevice.find({
    status: "online",
    $or: [
      { lastSeenAt: { $lt: staleBefore } },
      { lastSeenAt: { $exists: false } },
    ],
  }).select("_id").lean();
  const staleAgentIds = staleAgents.map((agent) => agent._id);

  if (staleAgentIds.length) {
    await Promise.all([
      AgentDevice.updateMany(
        { _id: { $in: staleAgentIds }, status: "online", $or: [{ lastSeenAt: { $lt: staleBefore } }, { lastSeenAt: { $exists: false } }] },
        { $set: { status: "offline" } },
      ),
      ShopPrinter.updateMany(
        { agentDeviceId: { $in: staleAgentIds }, protocol: "windows" },
        { $set: { status: "offline" } },
      ),
    ]);
  }

  const activeShopIds = await AgentDevice.distinct("shopId", {
    status: "online",
    lastSeenAt: { $gte: staleBefore },
  });
  const result = await Shop.updateMany(
    { isOnline: true, _id: { $nin: activeShopIds } },
    { $set: { isOnline: false } },
  );

  if (result.modifiedCount) {
    console.info(`[AGENT] Set ${result.modifiedCount} shop(s) offline because no desktop agent is connected.`);
  }
}
