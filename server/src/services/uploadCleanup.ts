import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { CustomerUpload } from "../models/CustomerUpload.js";
import { PrintOrder } from "../models/PrintOrder.js";

const uploadDirectory = join(process.cwd(), "data", "uploads");

async function removeFile(storageKey: string): Promise<void> {
  try {
    await unlink(join(uploadDirectory, storageKey));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

export async function cleanupExpiredUploads(): Promise<void> {
  const now = new Date();
  const expiredUploads = await CustomerUpload.find({ expiresAt: { $lte: now } }).select("_id storageKey orderId");
  const expiredOrderIds = [...new Set(expiredUploads.flatMap((upload) => upload.orderId ? [String(upload.orderId)] : []))];
  const pendingStatuses = ["awaiting_payment", "awaiting_cash"] as const;
  const terminalStatuses = ["printed", "rejected", "cancelled", "expired"] as const;

  if (expiredOrderIds.length) {
    await PrintOrder.updateMany(
      { _id: { $in: expiredOrderIds }, status: { $in: pendingStatuses } },
      {
        $set: { status: "expired" },
        $push: { events: { type: "expired", actorType: "system", timestamp: now, note: "Pending order file retention expired." } },
      },
    );
  }

  const deletableOrderIds = new Set(
    (await PrintOrder.find({ _id: { $in: expiredOrderIds }, status: { $in: [...pendingStatuses, ...terminalStatuses] } }).select("_id status"))
      .map((order) => String(order._id)),
  );
  const uploadsToDelete = expiredUploads.filter(
    (upload) => !upload.orderId || deletableOrderIds.has(String(upload.orderId)),
  );

  for (const upload of uploadsToDelete) {
    await removeFile(upload.storageKey);
  }
  if (uploadsToDelete.length) {
    await CustomerUpload.deleteMany({ _id: { $in: uploadsToDelete.map((upload) => upload._id) } });
  }
}
