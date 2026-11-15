import "./env.js";
import mongoose from "mongoose";
import { refreshDailySettlementRequests } from "./services/dailySettlements.js";

const mongoUri = process.env.MONGODB_URI ?? "";

if (!mongoUri) {
  throw new Error("MONGODB_URI is required to refresh daily settlements.");
}

try {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15_000 });
  await refreshDailySettlementRequests();
  console.log("[UrQrPrint] Daily settlement requests refreshed successfully.");
} catch (error) {
  console.error("[UrQrPrint] Could not refresh daily settlement requests:", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
