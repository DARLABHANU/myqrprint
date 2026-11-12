import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import multer, { type FileFilterCallback } from "multer";
import mongoose from "mongoose";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { z } from "zod";
import {
  calculateCustomerQuote,
  createPickupCode,
  PHOTO_LAYOUTS,
  sanitizeOriginalName,
} from "../customerOrder.js";
import { CustomerUpload } from "../models/CustomerUpload.js";
import { PrintOrder } from "../models/PrintOrder.js";
import { Shop } from "../models/Shop.js";

export const publicShopsRouter = Router();

const uploadDirectory = join(process.cwd(), "data", "uploads");
const uploadLimitBytes = 25 * 1024 * 1024;
const supportedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const uploadStorage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    mkdir(uploadDirectory, { recursive: true })
      .then(() => callback(null, uploadDirectory))
      .catch((error: unknown) => callback(error instanceof Error ? error : new Error("Could not prepare private upload storage."), uploadDirectory));
  },
  filename: (_request, _file, callback) => callback(null, `${randomUUID()}.upload`),
});

const receiveUploads = multer({
  storage: uploadStorage,
  limits: { fileSize: uploadLimitBytes, files: 10, fields: 2, fieldSize: 64 },
  fileFilter: (_request, file, callback: FileFilterCallback) => {
    if (!supportedMimeTypes.includes(file.mimetype)) {
      callback(new Error("Unsupported file type. Upload PDF, JPG, PNG, or WEBP files."));
      return;
    }
    callback(null, true);
  },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { trustProxy: false },
});
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { trustProxy: false },
});

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);
const optionsSchema = z.object({
  paperSize: z.enum(["A3", "A4", "A5", "Legal"]),
  colour: z.boolean(),
  duplex: z.boolean(),
  copies: z.number().int().min(1).max(100),
  orientation: z.enum(["portrait", "landscape"]).optional(),
  pageRange: z.string().max(400).optional(),
  photoLayout: z.enum(PHOTO_LAYOUTS).optional(),
}).strict();
const quoteSchema = z.object({
  uploadIds: z.array(objectIdSchema).min(1).max(10),
  options: optionsSchema,
}).strict();
const orderSchema = quoteSchema.extend({
  paymentMethod: z.enum(["upi", "cash"]),
  customerName: z.string().trim().max(100).optional(),
  customerMobile: z.string().trim().max(20).optional(),
  customerLatitude: z.number().min(-90).max(90).optional(),
  customerLongitude: z.number().min(-180).max(180).optional(),
}).strict();
const paymentClaimSchema = z.object({
  reference: z.string().trim().max(80).optional(),
}).strict();

type DetectedFile = {
  mediaType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  extension: ".pdf" | ".jpg" | ".png" | ".webp";
  kind: "document" | "photo";
  pageCount: number;
};

type SharpImage = ReturnType<typeof sharp>;
type SharpMetadata = Awaited<ReturnType<SharpImage["metadata"]>>;

function isRequestError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

class UploadValidationError extends Error {}

function slugOrRespond(request: Request, response: Response): string | undefined {
  const parsed = slugSchema.safeParse(request.params.slug);
  if (!parsed.success) {
    response.status(404).json({ error: "This shop page was not found." });
    return undefined;
  }
  return parsed.data;
}

function publicShop(shop: InstanceType<typeof Shop> | null) {
  if (!shop) return null;
  const record = shop.toObject({ flattenMaps: true });
  return {
    slug: record.slug,
    displayName: record.displayName,
    logoDataUrl: record.logoDataUrl ?? "",
    address: [record.address, record.city, record.state, record.pincode].filter(Boolean).join(", "),
    upiId: record.upiId,
    cashEnabled: record.cashEnabled,
    enabledPaperSizes: record.enabledPaperSizes,
    colourEnabled: record.colourEnabled,
    duplexEnabled: record.duplexEnabled,
    maxCopies: record.maxCopies,
    collectCustomerName: record.collectCustomerName,
    collectCustomerMobile: record.collectCustomerMobile,
    customerUploadVoice: record.notificationPreferences?.customerUploadVoice ?? true,
    fileRetentionHours: record.fileRetentionHours,
    locationLockEnabled: record.locationLockEnabled,
    locationRadiusMeters: record.locationRadiusMeters,
    rates: record.rates,
  };
}

function ensureCustomerSession(request: Request): Promise<void> {
  request.session.customerFlow = true;
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()));
  });
}

async function findSessionUploads(
  request: Request,
  shopId: mongoose.Types.ObjectId,
  uploadIds: string[],
) {
  if (new Set(uploadIds).size !== uploadIds.length) {
    throw new Error("The same uploaded file cannot be added twice.");
  }
  const uploads = await CustomerUpload.find({
    _id: { $in: uploadIds },
    shopId,
    sessionId: request.sessionID,
    state: "temporary",
    expiresAt: { $gt: new Date() },
  });
  if (uploads.length !== uploadIds.length) {
    throw new Error("One or more uploads expired or no longer belong to this order.");
  }
  return uploads;
}

async function detectAndValidateFile(file: Express.Multer.File): Promise<DetectedFile> {
  const bytes = await readFile(file.path);
  const extension = extname(file.originalname).toLowerCase();

  if (
    bytes.length >= 5 &&
    bytes.subarray(0, 5).toString("ascii") === "%PDF-"
  ) {
    if (extension !== ".pdf") throw new UploadValidationError("The file extension does not match its PDF content.");
    if (file.mimetype !== "application/pdf") {
      throw new UploadValidationError("The declared file type does not match its content.");
    }
    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    } catch (error) {
      if (error instanceof Error && ["PasswordException", "EncryptedPDFError"].includes(error.name)) {
        throw error;
      }
      throw new UploadValidationError("This PDF is damaged or cannot be read.");
    }
    const pageCount = pdf.getPageCount();
    if (pageCount < 1 || pageCount > 1000) throw new UploadValidationError("PDFs must contain between 1 and 1,000 pages.");
    return { mediaType: "application/pdf", extension: ".pdf", kind: "document", pageCount };
  }

  let image: SharpImage;
  let metadata: SharpMetadata;
  try {
    image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: "error", animated: false });
    metadata = await image.metadata();
  } catch {
    throw new UploadValidationError("This file is damaged or cannot be read as an image.");
  }
  const imageTypes = {
    jpeg: { mediaType: "image/jpeg", extension: ".jpg" },
    png: { mediaType: "image/png", extension: ".png" },
    webp: { mediaType: "image/webp", extension: ".webp" },
  } as const;
  const imageFormat = metadata.format;
  if (imageFormat !== "jpeg" && imageFormat !== "png" && imageFormat !== "webp") {
    throw new UploadValidationError("Unsupported file content. Upload PDF, JPG, PNG, or WEBP files.");
  }
  const detected = imageTypes[imageFormat];
  if (extension !== detected.extension && !(imageFormat === "jpeg" && extension === ".jpeg")) {
    throw new UploadValidationError("The file extension does not match its image content.");
  }
  if (file.mimetype !== detected.mediaType) {
    throw new UploadValidationError("The declared file type does not match its content.");
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > 25_000_000) {
    throw new UploadValidationError("Images must have valid dimensions and be no larger than 25 megapixels.");
  }
  if (metadata.pages && metadata.pages > 1) {
    throw new UploadValidationError("Animated or multi-frame images are not supported.");
  }
  try {
    await image.stats();
  } catch {
    throw new UploadValidationError("This image is damaged or cannot be decoded.");
  }
  return {
    mediaType: detected.mediaType,
    extension: detected.extension,
    kind: "photo",
    pageCount: 1,
  };
}

async function cleanupPaths(paths: string[]): Promise<void> {
  const results = await Promise.allSettled(paths.map((path) => unlink(path)));
  for (const result of results) {
    if (result.status === "rejected" && !isRequestError(result.reason, "ENOENT")) {
      console.error("Could not remove a rejected upload:", result.reason);
    }
  }
}

function uploadMiddleware(request: Request, response: Response, next: NextFunction) {
  void ensureCustomerSession(request)
    .then(() => {
      receiveUploads.array("files", 10)(request, response, async (error: unknown) => {
        if (error) {
          const received = request.files as Express.Multer.File[] | undefined;
          if (received?.length) await cleanupPaths(received.map((file) => file.path));
          if (error instanceof multer.MulterError) {
            const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
            response.status(status).json({
              error: error.code === "LIMIT_FILE_SIZE"
                ? "Each file must be no larger than 25 MB."
                : "Upload no more than 10 files in one request.",
            });
            return;
          }
          if (error instanceof Error) {
            response.status(400).json({ error: error.message });
            return;
          }
          next(error);
          return;
        }
        next();
      });
    })
    .catch(next);
}

publicShopsRouter.get("/:slug", async (request, response, next) => {
  const slug = slugOrRespond(request, response);
  if (!slug) return;
  try {
    const shop = await Shop.findOne({ slug, isOnline: { $ne: false } });
    if (!shop) {
      response.status(404).json({ error: "This shop is currently unavailable." });
      return;
    }
    response.json({ shop: publicShop(shop) });
  } catch (error) {
    next(error);
  }
});

publicShopsRouter.post("/:slug/uploads", uploadLimiter, uploadMiddleware, async (request, response, next) => {
  const slug = slugOrRespond(request, response);
  if (!slug) return;
  const files = (request.files ?? []) as Express.Multer.File[];
  const paths = files.map((file) => file.path);
  const createdUploadIds: mongoose.Types.ObjectId[] = [];
  let storageKeys: string[] = [];

  try {
    const mode = z.enum(["document", "photo"]).safeParse(request.body.mode);
    if (!mode.success || files.length < 1) {
      await cleanupPaths(paths);
      response.status(400).json({ error: "Choose PDF documents or photos and select at least one file." });
      return;
    }
    const shop = await Shop.findOne({ slug, isOnline: { $ne: false } });
    if (!shop) {
      await cleanupPaths(paths);
      response.status(404).json({ error: "This shop is currently unavailable." });
      return;
    }
    const existingCount = await CustomerUpload.countDocuments({
      shopId: shop._id,
      sessionId: request.sessionID,
      state: "temporary",
      expiresAt: { $gt: new Date() },
    });
    if (existingCount + files.length > 10) {
      await cleanupPaths(paths);
      response.status(400).json({ error: "An order can contain up to 10 files." });
      return;
    }

    const validated: Array<{ file: Express.Multer.File; detected: DetectedFile }> = [];
    for (const file of files) {
      const detected = await detectAndValidateFile(file);
      if (detected.kind !== mode.data) {
        await cleanupPaths(paths);
        response.status(400).json({ error: `Upload only ${mode.data === "document" ? "PDF documents" : "JPG, PNG, or WEBP photos"} in this mode.` });
        return;
      }
      validated.push({ file, detected });
    }

    const staged = validated.map(({ file, detected }) => ({
      file,
      detected,
      storageKey: `${randomUUID()}${detected.extension}`,
      originalName: sanitizeOriginalName(file.originalname),
    }));
    storageKeys = staged.map((item) => item.storageKey);
    for (const [index, item] of staged.entries()) {
      const finalPath = join(uploadDirectory, item.storageKey);
      await rename(item.file.path, finalPath);
      item.file.path = finalPath;
      paths[index] = finalPath;
    }

    const expiresAt = new Date(Date.now() + shop.fileRetentionHours * 60 * 60 * 1000);
    const documents = staged.map(({ file, detected, storageKey, originalName }) => ({
      shopId: shop._id,
      sessionId: request.sessionID,
      originalName,
      storageKey,
      mediaType: detected.mediaType,
      kind: detected.kind,
      sizeBytes: file.size,
      pageCount: detected.pageCount,
      state: "temporary" as const,
      expiresAt,
    }));
    const uploads = await CustomerUpload.create(documents);
    createdUploadIds.push(...uploads.map((upload) => upload._id));
    response.status(201).json({
      uploads: uploads.map((upload) => ({
        id: String(upload._id),
        name: upload.originalName,
        kind: upload.kind,
        pageCount: upload.pageCount,
        sizeBytes: upload.sizeBytes,
      })),
    });
  } catch (error) {
    const cleanupTasks: Promise<unknown>[] = [cleanupPaths(paths)];
    if (createdUploadIds.length) {
      cleanupTasks.push(CustomerUpload.deleteMany({ _id: { $in: createdUploadIds } }).exec());
    }
    if (storageKeys.length) {
      cleanupTasks.push(CustomerUpload.deleteMany({ storageKey: { $in: storageKeys } }).exec());
    }
    const cleanupResults = await Promise.allSettled(cleanupTasks);
    for (const result of cleanupResults) {
      if (result.status === "rejected") {
        console.error("Could not fully roll back a failed customer upload:", result.reason);
      }
    }
    if (error instanceof Error && ["PasswordException", "EncryptedPDFError"].includes(error.name)) {
      response.status(400).json({ error: "Password-protected PDFs are not supported." });
      return;
    }
    if (error instanceof UploadValidationError) {
      response.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

publicShopsRouter.delete("/:slug/uploads/:uploadId", async (request, response, next) => {
  const slug = slugOrRespond(request, response);
  if (!slug) return;
  const uploadId = objectIdSchema.safeParse(request.params.uploadId);
  if (!uploadId.success) {
    response.status(404).json({ error: "Upload not found." });
    return;
  }
  try {
    const shop = await Shop.findOne({ slug, isOnline: { $ne: false } }).select("_id");
    const upload = shop ? await CustomerUpload.findOne({
      _id: uploadId.data,
      shopId: shop._id,
      sessionId: request.sessionID,
      state: "temporary",
    }) : null;
    if (!upload) {
      response.status(404).json({ error: "Upload not found." });
      return;
    }
    await unlink(join(uploadDirectory, upload.storageKey));
    await upload.deleteOne();
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

publicShopsRouter.post("/:slug/quote", async (request, response, next) => {
  const slug = slugOrRespond(request, response);
  if (!slug) return;
  const parsed = quoteSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Check the uploaded files and print options." });
    return;
  }
  try {
    const shop = await Shop.findOne({ slug, isOnline: { $ne: false } });
    if (!shop) {
      response.status(404).json({ error: "This shop is currently unavailable." });
      return;
    }
    const uploads = await findSessionUploads(request, shop._id, parsed.data.uploadIds);
    const quote = calculateCustomerQuote(shop, uploads, parsed.data.options);
    response.json({ quote: { ...quote, amount: (quote.amountPaise / 100).toFixed(2) } });
  } catch (error) {
    if (error instanceof Error && error.name !== "MongoServerError") {
      response.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

publicShopsRouter.post("/:slug/orders", orderLimiter, async (request, response, next) => {
  const slug = slugOrRespond(request, response);
  if (!slug) return;
  const parsed = orderSchema.safeParse(request.body);
  const idempotencyKey = z.string().uuid().safeParse(request.get("Idempotency-Key"));
  if (!parsed.success || !idempotencyKey.success) {
    response.status(400).json({ error: "Check the order details and try again." });
    return;
  }

  let createdOrderId: mongoose.Types.ObjectId | undefined;
  let orderShopId: mongoose.Types.ObjectId | undefined;
  try {
    const shop = await Shop.findOne({ slug, isOnline: { $ne: false } });
    if (!shop) {
      response.status(404).json({ error: "This shop is currently unavailable." });
      return;
    }
    const nowCheck = new Date();
    if (shop.subscriptionExpiresAt && new Date(shop.subscriptionExpiresAt).getTime() < nowCheck.getTime()) {
      response.status(403).json({
        error: "This print shop is currently not accepting new orders (subscription expired). Please notify the shopkeeper.",
      });
      return;
    }
    if (
      typeof shop.subscriptionOrderLimit === "number" &&
      shop.subscriptionOrderLimit > 0 &&
      (shop.subscriptionOrdersUsed ?? 0) >= shop.subscriptionOrderLimit
    ) {
      response.status(403).json({
        error: "This print shop has reached its maximum order capacity for the current billing cycle. Please notify the shopkeeper.",
      });
      return;
    }
    orderShopId = shop._id;
    if (parsed.data.customerName && !shop.collectCustomerName) {
      response.status(400).json({ error: "This shop does not collect customer names." });
      return;
    }
    if (parsed.data.customerMobile && !shop.collectCustomerMobile) {
      response.status(400).json({ error: "This shop does not collect customer mobile numbers." });
      return;
    }
    const existing = await PrintOrder.findOne({
      shopId: shop._id,
      customerSessionId: request.sessionID,
      idempotencyKey: idempotencyKey.data,
    });
    if (existing) {
      response.status(200).json({
        order: {
          code: existing.publicCode,
          status: existing.status,
          paymentMethod: existing.paymentMethod,
          paymentStatus: existing.paymentStatus,
          amountPaise: existing.amountPaise,
        },
      });
      return;
    }
    if (parsed.data.paymentMethod === "upi" && !shop.upiId) {
      response.status(400).json({ error: "UPI is not enabled for this shop." });
      return;
    }
    if (parsed.data.paymentMethod === "cash" && !shop.cashEnabled) {
      response.status(400).json({ error: "Cash at counter is not enabled for this shop." });
      return;
    }

    if (shop.locationLockEnabled) {
      if (parsed.data.customerLatitude === undefined || parsed.data.customerLongitude === undefined || shop.locationLatitude == null || shop.locationLongitude == null) {
        response.status(400).json({ error: "This shop only accepts orders placed from nearby. Allow location access and try again at the shop." }); return;
      }
      const radians = (degrees: number) => degrees * Math.PI / 180;
      const latDelta = radians(parsed.data.customerLatitude - shop.locationLatitude);
      const lonDelta = radians(parsed.data.customerLongitude - shop.locationLongitude);
      const haversine = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(shop.locationLatitude)) * Math.cos(radians(parsed.data.customerLatitude)) * Math.sin(lonDelta / 2) ** 2;
      const distanceMeters = 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
      if (distanceMeters > (shop.locationRadiusMeters ?? 200)) { response.status(403).json({ error: "You appear to be outside this shop’s order area. Please scan the QR code while at the shop." }); return; }
    }

    const uploads = await findSessionUploads(request, shop._id, parsed.data.uploadIds);
    const quote = calculateCustomerQuote(shop, uploads, parsed.data.options);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + shop.fileRetentionHours * 60 * 60 * 1000);
    const status = parsed.data.paymentMethod === "upi" ? "awaiting_payment" : "awaiting_cash";
    let order: InstanceType<typeof PrintOrder> | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        order = await PrintOrder.create({
          shopId: shop._id,
          publicCode: createPickupCode(),
          customerSessionId: request.sessionID,
          idempotencyKey: idempotencyKey.data,
          status,
          paymentMethod: parsed.data.paymentMethod,
          paymentStatus: parsed.data.paymentMethod === "upi" ? "unverified" : "awaiting_cash",
          customerName: parsed.data.customerName,
          customerMobile: parsed.data.customerMobile,
          amountPaise: quote.amountPaise,
          currency: "INR",
          options: parsed.data.options,
          files: uploads.map((upload) => ({
            uploadId: upload._id,
            originalName: upload.originalName,
            mediaType: upload.mediaType,
            sizeBytes: upload.sizeBytes,
            pageCount: upload.pageCount,
          })),
          events: [{ type: "order_created", actorType: "customer", timestamp: now }],
          expiresAt,
        });
        break;
      } catch (error) {
        if (!isDuplicateKeyError(error) || attempt === 2) throw error;
      }
    }
    if (!order) throw new Error("Could not create the order.");
    createdOrderId = order._id;

    const claimed = await CustomerUpload.updateMany(
      { _id: { $in: uploads.map((upload) => upload._id) }, sessionId: request.sessionID, state: "temporary" },
      { $set: { state: "attached", orderId: order._id, expiresAt } },
    );
    if (claimed.modifiedCount !== uploads.length) {
      await CustomerUpload.updateMany(
        { orderId: order._id },
        { $set: { state: "temporary" }, $unset: { orderId: 1 } },
      );
      await order.deleteOne();
      createdOrderId = undefined;
      response.status(409).json({ error: "An upload was already used. Please refresh and check your order." });
      return;
    }

    await Shop.updateOne({ _id: shop._id }, { $inc: { subscriptionOrdersUsed: 1 } });

    response.status(201).json({
      order: {
        code: order.publicCode,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        amountPaise: order.amountPaise,
      },
    });
  } catch (error) {
    if (createdOrderId) {
      const rollbackResults = await Promise.allSettled([
        CustomerUpload.updateMany(
          { orderId: createdOrderId },
          { $set: { state: "temporary" }, $unset: { orderId: 1 } },
        ).exec(),
        PrintOrder.deleteOne({ _id: createdOrderId }).exec(),
      ]);
      const rollbackFailure = rollbackResults.find((result) => result.status === "rejected");
      if (rollbackFailure?.status === "rejected") {
        console.error("Could not fully roll back a failed customer order:", rollbackFailure.reason);
        next(rollbackFailure.reason);
        return;
      }
    }
    if (isDuplicateKeyError(error)) {
      try {
        const existing = orderShopId ? await PrintOrder.findOne({
          shopId: orderShopId,
          customerSessionId: request.sessionID,
          idempotencyKey: idempotencyKey.data,
        }) : null;
        if (existing) {
          response.status(200).json({
            order: {
              code: existing.publicCode,
              status: existing.status,
              paymentMethod: existing.paymentMethod,
              paymentStatus: existing.paymentStatus,
              amountPaise: existing.amountPaise,
            },
          });
          return;
        }
      } catch (lookupError) {
        next(lookupError);
        return;
      }
      response.status(409).json({ error: "This order request was already received." });
      return;
    }
    if (error instanceof Error && !("name" in error && error.name === "MongoServerError")) {
      response.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

publicShopsRouter.get("/:slug/orders/:code", orderLimiter, async (request, response, next) => {
  const slug = slugOrRespond(request, response);
  if (!slug) return;
  const code = z.string().regex(/^[A-F0-9]{8}$/).safeParse(request.params.code);
  if (!code.success) {
    response.status(404).json({ error: "Order not found." });
    return;
  }
  try {
    const shop = await Shop.findOne({ slug }).select("_id");
    const order = shop ? await PrintOrder.findOne({
      shopId: shop._id,
      publicCode: code.data,
      customerSessionId: request.sessionID,
    }).select("publicCode status paymentMethod paymentStatus amountPaise updatedAt") : null;
    if (!order) {
      response.status(404).json({ error: "Order not found." });
      return;
    }
    response.json({
      order: {
        code: order.publicCode,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        amountPaise: order.amountPaise,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

publicShopsRouter.post("/:slug/orders/:code/payment-claim", orderLimiter, async (request, response, next) => {
  const slug = slugOrRespond(request, response);
  if (!slug) return;
  const code = z.string().regex(/^[A-F0-9]{8}$/).safeParse(request.params.code);
  const parsed = paymentClaimSchema.safeParse(request.body);
  if (!code.success || !parsed.success) {
    response.status(400).json({ error: "Check the payment reference and try again." });
    return;
  }
  try {
    const shop = await Shop.findOne({ slug }).select("_id");
    if (!shop) {
      response.status(404).json({ error: "Order not found." });
      return;
    }
    const order = await PrintOrder.findOne({
      shopId: shop._id,
      publicCode: code.data,
      customerSessionId: request.sessionID,
      paymentMethod: "upi",
      status: "awaiting_payment",
    });
    if (!order) {
      response.status(404).json({ error: "Order not found or no longer awaiting UPI payment." });
      return;
    }
    order.paymentClaimedAt = new Date();
    if (parsed.data.reference) order.paymentReference = parsed.data.reference;
    order.events.push({
      type: "customer_reported_payment",
      actorType: "customer",
      timestamp: new Date(),
      note: "Customer reported payment; merchant verification is still required.",
    });
    await order.save();
    response.json({
      status: order.status,
      paymentStatus: order.paymentStatus,
      message: "Thanks. Your shopkeeper still needs to verify the payment.",
    });
  } catch (error) {
    next(error);
  }
});
