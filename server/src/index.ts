import "./env.js";
import mongoose from "mongoose";
import { app } from "./app.js";
import { cleanupExpiredUploads } from "./services/uploadCleanup.js";
import { sendDailyShopSummaries } from "./services/dailySummary.js";

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI ?? "";

if (!mongoUri) {
  throw new Error("MONGODB_URI is required. Set it in server/.env.");
}

async function start() {
  console.log("[Printly Server] Connecting to database...");
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log("[Printly Server] Connected to MongoDB.");
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
    console.log(`[Printly Server] API listening on http://localhost:${port}`);
  });
}

start().catch((error: unknown) => {
  console.error("Unable to start the API:", error);
  process.exitCode = 1;
});
