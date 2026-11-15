import "./env.js";
import mongoose from "mongoose";
import { app } from "./app.js";
import { cleanupExpiredUploads } from "./services/uploadCleanup.js";
import { sendDailyShopSummaries } from "./services/dailySummary.js";
import { isCloudinaryEnabled } from "./services/cloudinary.js";
import { expireDisconnectedAgents } from "./services/agentPresence.js";
import { refreshDailySettlementRequests } from "./services/dailySettlements.js";

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI ?? "";

if (!mongoUri) {
  throw new Error("MONGODB_URI is required. Set it in server/.env.");
}

async function start() {
  console.log("[UrQrPrint Server] Connecting to database...");
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log("[UrQrPrint Server] Connected to MongoDB.");
  if (isCloudinaryEnabled()) {
    console.log("[UrQrPrint Server] Cloudinary media storage connected and active.");
  } else {
    console.log("[UrQrPrint Server] Cloudinary not configured; using local storage.");
  }
  await expireDisconnectedAgents();
  await refreshDailySettlementRequests();
  const settlementsTimer = setInterval(() => {
    void refreshDailySettlementRequests().catch((error: unknown) => {
      console.error("Could not refresh daily shop settlements:", error);
    });
  }, 60 * 1000);
  settlementsTimer.unref();
  const agentPresenceTimer = setInterval(() => {
    void expireDisconnectedAgents().catch((error: unknown) => {
      console.error("Could not expire disconnected desktop agents:", error);
    });
  }, 10 * 1000);
  agentPresenceTimer.unref();
  await cleanupExpiredUploads();
  const cleanupTimer = setInterval(() => {
    void cleanupExpiredUploads().catch((error: unknown) => {
      console.error("Could not clean up expired customer uploads:", error);
    });
  }, 10 * 60 * 1000);
  cleanupTimer.unref();
  const summaryTimer = setInterval(() => {
    void sendDailyShopSummaries().catch((error: unknown) => console.error("Could not send daily shop summaries:", error));
  }, 60 * 1000);
  summaryTimer.unref();
  app.listen(port, "0.0.0.0", () => {
    console.log(`[UrQrPrint Server] API listening on http://localhost:${port}`);
  });
}

start().catch((error: unknown) => {
  console.error("Unable to start the API:", error);
  process.exitCode = 1;
});
