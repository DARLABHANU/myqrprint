import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { calculateCustomerQuote, PHOTO_LAYOUTS } from "../customerOrder.js";
import { CustomerUpload } from "../models/CustomerUpload.js";
import { PrintOrder } from "../models/PrintOrder.js";
import { Shop } from "../models/Shop.js";
import { transitionMerchantOrder } from "../orderWorkflow.js";

export const merchantOrdersRouter = Router();

const uploadDirectory = join(process.cwd(), "data", "uploads");
const actionSchema = z.object({
  action: z.enum(["confirm_payment", "approve_order", "mark_ready", "requeue", "reject", "cancel"]),
  note: z.string().trim().max(300).optional(),
}).strict();
const optionsSchema = z.object({
  paperSize: z.enum(["A3", "A4", "A5", "Legal"]),
  colour: z.boolean(),
  duplex: z.boolean(),
  copies: z.number().int().min(1).max(100),
  orientation: z.enum(["portrait", "landscape"]).optional(),
  pageRange: z.string().max(400).optional(),
  photoLayout: z.enum(PHOTO_LAYOUTS).optional(),
}).strict();
const statusSchema = z.enum([
  "awaiting_payment",
  "awaiting_cash",
  "needs_approval",
  "queued",
  "printing",
  "printed",
  "failed",
  "rejected",
  "cancelled",
  "expired",
]);

function requireOwner(request: Request, response: Response, next: NextFunction) {
  if (!request.session.userId || !isValidObjectId(request.session.userId)) {
    response.status(401).json({ error: "Sign in to manage your orders." });
    return;
  }
  next();
}

merchantOrdersRouter.use(requireOwner);

async function findOwnerShop(request: Request) {
  return Shop.findOne({ ownerId: request.session.userId }).select("_id notificationPreferences fileRetentionHours");
}

function orderSummary(order: InstanceType<typeof PrintOrder>, availableUploads: Set<string>) {
  return {
    id: String(order._id),
    code: order.publicCode,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paymentClaimedAt: order.paymentClaimedAt,
    paymentReference: order.paymentReference,
    customerName: order.customerName,
    customerMobile: order.customerMobile,
    amountPaise: order.amountPaise,
    currency: order.currency,
    options: order.options,
    files: order.files.map((file) => ({
      uploadId: String(file.uploadId),
      name: file.originalName,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
      pageCount: file.pageCount,
      available: availableUploads.has(String(file.uploadId)),
    })),
    events: order.events.map((event) => ({
      type: event.type,
      actorType: event.actorType,
      timestamp: event.timestamp,
      note: event.note,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

merchantOrdersRouter.get("/orders", async (request, response, next) => {
  const parsedStatus = request.query.status === undefined
    ? undefined
    : statusSchema.safeParse(request.query.status);
  if (parsedStatus && !parsedStatus.success) {
    response.status(400).json({ error: "Choose a valid order status." });
    return;
  }
  try {
      const shop = await findOwnerShop(request);
    if (!shop) {
      response.status(404).json({ error: "Shop settings were not found." });
      return;
    }
    const orders = await PrintOrder.find({
      shopId: shop._id,
      ...(parsedStatus?.success ? { status: parsedStatus.data } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(1000);
    const uploadIds = orders.flatMap((order) => order.files.map((file) => file.uploadId));
    const availableUploads = await CustomerUpload.find({
      _id: { $in: uploadIds },
      shopId: shop._id,
      state: "attached",
    }).select("_id");
    const availableIds = new Set(availableUploads.map((upload) => String(upload._id)));
    response.json({ orders: orders.map((order) => orderSummary(order, availableIds)) });
  } catch (error) {
    next(error);
  }
});

merchantOrdersRouter.patch("/orders/:orderId", async (request, response, next) => {
  const orderId = z.string().refine(isValidObjectId).safeParse(request.params.orderId);
  const parsedBody = actionSchema.safeParse(request.body);
  if (!orderId.success || !parsedBody.success) {
    response.status(400).json({ error: "Choose a valid order action." });
    return;
  }
  try {
    const shop = await findOwnerShop(request);
    if (!shop) {
      response.status(404).json({ error: "Order not found." });
      return;
    }
    const order = await PrintOrder.findOne({ _id: orderId.data, shopId: shop._id });
    if (!order) {
      response.status(404).json({ error: "Order not found." });
      return;
    }
    let nextState;
    try {
      nextState = transitionMerchantOrder(order, parsedBody.data.action);
    } catch (error) {
      response.status(409).json({
        error: error instanceof Error ? error.message : "This order cannot be changed in its current state.",
      });
      return;
    }

    order.status = nextState.status;
    order.paymentStatus = nextState.paymentStatus;
    if (["printed", "rejected", "cancelled"].includes(nextState.status)) {
      await CustomerUpload.updateMany({ orderId: order._id, state: "attached" }, { $set: { expiresAt: new Date() } });
    }
    order.events.push({
      type: parsedBody.data.action,
      actorType: "merchant",
      timestamp: new Date(),
      note: parsedBody.data.action === "confirm_payment"
        ? `Shopkeeper manually confirmed ${order.paymentMethod === "upi" ? "UPI payment" : "cash"}.${parsedBody.data.note ? ` ${parsedBody.data.note}` : ""}`
        : ["reject", "cancel"].includes(parsedBody.data.action) && nextState.paymentStatus === "paid"
          ? "Order ended after payment confirmation; merchant must arrange any refund directly."
          : undefined,
    });
    await order.save();
    if (parsedBody.data.action === "requeue") {
      const expiresAt = new Date(Date.now() + Number(shop.fileRetentionHours ?? 24) * 60 * 60 * 1000);
      await CustomerUpload.updateMany({ orderId: order._id, state: "attached" }, { $set: { expiresAt } });
    }
    const availableUploads = await CustomerUpload.find({
      _id: { $in: order.files.map((file) => file.uploadId) },
      shopId: shop._id,
      state: "attached",
    }).select("_id");
    response.json({
      order: orderSummary(order, new Set(availableUploads.map((upload) => String(upload._id)))),
    });
  } catch (error) {
    next(error);
  }
});

merchantOrdersRouter.patch("/orders/:orderId/options", async (request, response, next) => {
  const orderId = z.string().refine(isValidObjectId).safeParse(request.params.orderId);
  const parsedOptions = optionsSchema.safeParse(request.body);
  if (!orderId.success || !parsedOptions.success) {
    response.status(400).json({ error: "Check the print options and try again." });
    return;
  }
  try {
    const shop = await findOwnerShop(request);
    if (!shop) {
      response.status(404).json({ error: "Shop settings were not found." });
      return;
    }
    const [order, fullShop] = await Promise.all([
      PrintOrder.findOne({ _id: orderId.data, shopId: shop._id }),
      Shop.findById(shop._id),
    ]);
    if (!order || !fullShop) {
      response.status(404).json({ error: "Order not found." });
      return;
    }
    if (order.paymentStatus === "paid" || !["awaiting_payment", "awaiting_cash"].includes(order.status)) {
      response.status(409).json({ error: "Print options can only be edited before payment is confirmed." });
      return;
    }
    const quote = calculateCustomerQuote(
      fullShop,
      order.files.map((file) => ({
        kind: file.mediaType.startsWith("image/") ? "photo" as const : "document" as const,
        pageCount: file.pageCount,
      })),
      parsedOptions.data,
    );
    order.options = { ...parsedOptions.data, orientation: parsedOptions.data.orientation ?? "portrait" };
    order.amountPaise = quote.amountPaise;
    order.events.push({
      type: "options_updated",
      actorType: "merchant",
      timestamp: new Date(),
      note: `Print options updated; revised total ₹${(quote.amountPaise / 100).toFixed(2)}.`,
    });
    await order.save();
    const availableUploads = await CustomerUpload.find({
      _id: { $in: order.files.map((file) => file.uploadId) },
      shopId: shop._id,
      state: "attached",
    }).select("_id");
    response.json({
      order: orderSummary(order, new Set(availableUploads.map((upload) => String(upload._id)))),
    });
  } catch (error) {
    if (error instanceof Error && error.name !== "MongoServerError") {
      response.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

merchantOrdersRouter.get("/orders/:orderId/files/:uploadId", async (request, response, next) => {
  const orderId = z.string().refine(isValidObjectId).safeParse(request.params.orderId);
  const uploadId = z.string().refine(isValidObjectId).safeParse(request.params.uploadId);
  if (!orderId.success || !uploadId.success) {
    response.status(404).json({ error: "File not found." });
    return;
  }
  try {
    const shop = await findOwnerShop(request);
    if (!shop) {
      response.status(404).json({ error: "File not found." });
      return;
    }
    const order = await PrintOrder.findOne({ _id: orderId.data, shopId: shop._id }).select("_id files");
    const file = order?.files.find((item) => String(item.uploadId) === uploadId.data);
    if (!order || !file) {
      response.status(404).json({ error: "File not found." });
      return;
    }
    const upload = await CustomerUpload.findOne({
      _id: uploadId.data,
      shopId: shop._id,
      orderId: order._id,
      state: "attached",
    }).select("storageKey");
    if (!upload) {
      response.status(410).json({ error: "The private file has expired." });
      return;
    }
    const filePath = join(uploadDirectory, upload.storageKey);
    try {
      await stat(filePath);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        response.status(410).json({ error: "The private file is no longer available." });
        return;
      }
      throw error;
    }
    response.setHeader("Content-Type", file.mediaType);
    response.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    createReadStream(filePath).pipe(response);
  } catch (error) {
    next(error);
  }
});
