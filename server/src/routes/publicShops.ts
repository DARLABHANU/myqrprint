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
import { AgentDevice } from "../models/AgentDevice.js";
import { PrintOrder } from "../models/PrintOrder.js";
import { Shop } from "../models/Shop.js";
import { captureRazorpayPayment, createRazorpayOrder, fetchRazorpayPayment, getRazorpayMode, isRazorpayEnabled, markRazorpayPaymentCaptured, RazorpayApiError, razorpayPublicKeyId, verifyCheckoutSignature } from "../services/razorpay.js";
import {
  deleteFromCloudinary,
  isCloudinaryEnabled,
  uploadToCloudinary,
} from "../services/cloudinary.js";

export const publicShopsRouter = Router();

const uploadDirectory = join(process.cwd(), "data", "uploads");
const uploadLimitBytes = 25 * 1024 * 1024;
const supportedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const agentOnlineWindowMs = 30 * 1000;

async function findOrderAcceptingShop(slug: string) {
  const shop = await Shop.findOne({ slug, isOnline: true });
  if (!shop) return null;
  const now = Date.now();
  if ((shop.subscriptionExpiresAt && shop.subscriptionExpiresAt.getTime() <= now)
    || (shop.subscriptionOrderLimit > 0 && shop.subscriptionOrdersUsed >= shop.subscriptionOrderLimit)) return null;
  const agent = await AgentDevice.exists({
    shopId: shop._id,
    status: "online",
    lastSeenAt: { $gte: new Date(Date.now() - agentOnlineWindowMs) },
  });
  return agent ? shop : null;
}

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
  limit: process.env.NODE_ENV === "production" ? 40 : 999,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { trustProxy: false },
});
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === "production" ? 30 : 999,
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
  paymentMethod: z.enum(["upi", "cash", "pay_here", "razorpay"]),
  customerName: z.string().trim().max(100).optional(),
  customerMobile: z.string().trim().max(20).optional(),
  customerLatitude: z.number().min(-90).max(90).optional(),
  customerLongitude: z.number().min(-180).max(180).optional(),
}).strict();
const paymentClaimSchema = z.object({
  reference: z.string().trim().max(80).optional(),
}).strict();
const razorpayVerificationSchema = z.object({
  razorpayOrderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  razorpaySignature: z.string().regex(/^[a-f\d]{64}$/i),
}).strict();

function customerOrderResponse(order: InstanceType<typeof PrintOrder>) {
  return {
    order: {
      code: order.publicCode,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      amountPaise: order.amountPaise,
    },
    ...(order.paymentMethod === "razorpay" && order.paymentStatus !== "paid" && order.status === "awaiting_payment" && order.razorpayOrderId && isRazorpayEnabled()
      ? { razorpay: { keyId: razorpayPublicKeyId(), orderId: order.razorpayOrderId, amount: order.amountPaise, currency: order.currency } }
      : {}),
  };
}

async function ensureRazorpayOrder(order: InstanceType<typeof PrintOrder>, shop: InstanceType<typeof Shop>) {
  if (order.razorpayOrderId) return;
  const gatewayOrder = await createRazorpayOrder({
    amountPaise: order.amountPaise,
    receipt: order.publicCode,
    notes: { printlyOrderCode: order.publicCode, shopSlug: shop.slug },
  });
  if (gatewayOrder.amount !== order.amountPaise || gatewayOrder.currency !== "INR") {
    throw new Error("Razorpay returned an order with an unexpected amount or currency.");
  }
  order.razorpayOrderId = gatewayOrder.id;
  await order.save();
}

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
    // Customer UPI transfers are disabled; payments go through Razorpay or cash.
    upiId: "",
    cashEnabled: record.cashEnabled,
    razorpayEnabled: isRazorpayEnabled() && record.razorpayEnabled !== false,
    razorpayMode: isRazorpayEnabled() ? getRazorpayMode() : null,
    subscriptionAvailable: !((record.subscriptionExpiresAt && new Date(record.subscriptionExpiresAt).getTime() <= Date.now())
      || (record.subscriptionOrderLimit > 0 && record.subscriptionOrdersUsed >= record.subscriptionOrderLimit)),
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
    const shop = await findOrderAcceptingShop(slug);
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
    const shop = await findOrderAcceptingShop(slug);
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

    // Upload to Cloudinary if configured
    const cloudinaryMetadata: Array<{ url?: string; publicId?: string; resourceType?: string }> = [];
    if (isCloudinaryEnabled()) {
      for (const item of staged) {
        try {
          const res = await uploadToCloudinary({
            filePath: item.file.path,
            originalName: item.originalName,
            mediaType: item.detected.mediaType,
            publicId: item.storageKey.replace(/\.[^/.]+$/, ""),
          });
          cloudinaryMetadata.push({ url: res.secureUrl, publicId: res.publicId, resourceType: res.resourceType });
        } catch (uploadErr) {
          console.warn("[Cloudinary] Upload notice (falling back to local storage):", uploadErr);
          cloudinaryMetadata.push({});
        }
      }
    }

    const expiresAt = new Date(Date.now() + shop.fileRetentionHours * 60 * 60 * 1000);
    const documents = staged.map(({ file, detected, storageKey, originalName }, index) => {
      const cMeta = cloudinaryMetadata[index] ?? {};
      return {
        shopId: shop._id,
        sessionId: request.sessionID,
        originalName,
        storageKey,
        mediaType: detected.mediaType,
        kind: detected.kind,
        sizeBytes: file.size,
        pageCount: detected.pageCount,
        state: "temporary" as const,
        cloudinaryUrl: cMeta.url,
        cloudinaryPublicId: cMeta.publicId,
        cloudinaryResourceType: cMeta.resourceType,
        expiresAt,
      };
    });
    const uploads = await CustomerUpload.create(documents);
    createdUploadIds.push(...uploads.map((upload) => upload._id));
    response.status(201).json({
      uploads: uploads.map((upload) => ({
        id: String(upload._id),
        name: upload.originalName,
        kind: upload.kind,
        pageCount: upload.pageCount,
        sizeBytes: upload.sizeBytes,
        previewUrl: upload.cloudinaryUrl || undefined,
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
    await unlink(join(uploadDirectory, upload.storageKey)).catch(() => {});
    if (upload.cloudinaryPublicId) {
      await deleteFromCloudinary(upload.cloudinaryPublicId, upload.cloudinaryResourceType ?? "image").catch(() => {});
    }
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
    const shop = await findOrderAcceptingShop(slug);
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
  const isLocalTestRequest = process.env.NODE_ENV !== "production"
    && ["localhost", "127.0.0.1", "::1"].includes(request.hostname);
  if (parsed.data.paymentMethod === "pay_here" && !isLocalTestRequest) {
    response.status(403).json({ error: "Test payments are only available in local development." });
    return;
  }
  if (parsed.data.paymentMethod === "razorpay" && !isRazorpayEnabled()) {
    response.status(503).json({ error: "Razorpay checkout is not configured yet." });
    return;
  }

  let createdOrderId: mongoose.Types.ObjectId | undefined;
  let orderShopId: mongoose.Types.ObjectId | undefined;
  try {
    const shop = await findOrderAcceptingShop(slug);
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
      if (existing.paymentMethod === "razorpay") await ensureRazorpayOrder(existing, shop);
      response.status(200).json(customerOrderResponse(existing));
      return;
    }
    if (parsed.data.paymentMethod === "upi") {
      response.status(400).json({ error: "Direct UPI checkout is unavailable. Choose Razorpay or cash at counter." });
      return;
    }
    if (parsed.data.paymentMethod === "cash" && !shop.cashEnabled) {
      response.status(400).json({ error: "Cash at counter is not enabled for this shop." });
      return;
    }
    if (parsed.data.paymentMethod === "razorpay" && (!isRazorpayEnabled() || shop.razorpayEnabled === false)) {
      response.status(503).json({ error: "Razorpay checkout is not configured yet." });
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
    const isPayHere = parsed.data.paymentMethod === "pay_here";
    const isRazorpay = parsed.data.paymentMethod === "razorpay";
    const status = isPayHere ? "queued" : ["upi", "razorpay"].includes(parsed.data.paymentMethod) ? "awaiting_payment" : "awaiting_cash";
    const paymentStatus = isPayHere ? "paid" : ["upi", "razorpay"].includes(parsed.data.paymentMethod) ? "unverified" : "awaiting_cash";
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
          ...(isRazorpay ? { paymentMode: getRazorpayMode() ?? "test" } : {}),
          paymentStatus,
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
          events: [
            { type: "order_created", actorType: "customer", timestamp: now },
            ...(isPayHere ? [{ type: "instant_payment_received", actorType: "customer" as const, timestamp: now, note: "Paid instantly via Pay Here. Queued for auto-printing." }] : []),
          ...(isRazorpay ? [{ type: "razorpay_checkout_created", actorType: "system" as const, timestamp: now, note: `Awaiting verified Razorpay ${getRazorpayMode() ?? ""} payment.`.trim() }] : []),
          ],
          expiresAt,
        });
        break;
      } catch (error) {
        if (!isDuplicateKeyError(error) || attempt === 2) throw error;
      }
    }
    if (!order) throw new Error("Could not create the order.");
    createdOrderId = order._id;
    if (isRazorpay) await ensureRazorpayOrder(order, shop);

    const claimed = await CustomerUpload.updateMany(
      { _id: { $in: uploads.map((upload) => upload._id) }, sessionId: request.sessionID, state: "temporary" },
      { $set: { state: "attached", orderId: order._id, expiresAt } },
    );
    // In dev or rapid orders, ensure all uploads stay attached to the order
    if (claimed.modifiedCount !== uploads.length) {
      await CustomerUpload.updateMany(
        { _id: { $in: uploads.map((upload) => upload._id) } },
        { $set: { state: "attached", orderId: order._id, expiresAt } },
      );
    }

    // Only completed online payments, counter cash orders and the local-only test shortcut consume trial quota.
    // An abandoned or failed Razorpay checkout does not count as a customer print order.
    if (isPayHere || parsed.data.paymentMethod === "cash") {
      await Shop.updateOne({ _id: shop._id }, { $inc: { subscriptionOrdersUsed: 1 } });
    }

    response.status(201).json(customerOrderResponse(order));
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
          if (existing.paymentMethod === "razorpay") {
            const existingShop = orderShopId ? await Shop.findById(orderShopId) : null;
            if (existingShop) await ensureRazorpayOrder(existing, existingShop);
          }
          response.status(200).json(customerOrderResponse(existing));
          return;
        }
      } catch (lookupError) {
        next(lookupError);
        return;
      }
      response.status(409).json({ error: "This order request was already received." });
      return;
    }
    if (error instanceof RazorpayApiError) {
      response.status(error.statusCode === 401 ? 503 : 502).json({ error: error.message });
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

publicShopsRouter.post("/:slug/orders/:code/razorpay/checkout", orderLimiter, async (request, response, next) => {
  const slug = slugOrRespond(request, response);
  if (!slug) return;
  const code = z.string().regex(/^[A-F0-9]{8}$/).safeParse(request.params.code);
  if (!code.success || !isRazorpayEnabled()) {
    response.status(code.success ? 503 : 400).json({ error: "Razorpay checkout is unavailable." });
    return;
  }
  try {
    const shop = await Shop.findOne({ slug });
    const order = shop ? await PrintOrder.findOne({
      shopId: shop._id,
      publicCode: code.data,
      customerSessionId: request.sessionID,
      paymentMethod: "razorpay",
    }) : null;
    if (!shop || !order) {
      response.status(404).json({ error: "Order not found." });
      return;
    }
    if (order.paymentStatus === "paid") {
      response.status(409).json({ error: "This order has already been paid." });
      return;
    }
    if (order.status !== "awaiting_payment") {
      response.status(409).json({ error: "This order is no longer awaiting payment." });
      return;
    }
    await ensureRazorpayOrder(order, shop);
    response.json(customerOrderResponse(order));
  } catch (error) {
    next(error);
  }
});

publicShopsRouter.post("/:slug/orders/:code/razorpay/verify", orderLimiter, async (request, response, next) => {
  const slug = slugOrRespond(request, response);
  if (!slug) return;
  const code = z.string().regex(/^[A-F0-9]{8}$/).safeParse(request.params.code);
  const parsed = razorpayVerificationSchema.safeParse(request.body);
  if (!code.success || !parsed.success) {
    response.status(400).json({ error: "Razorpay returned invalid payment details." });
    return;
  }
  try {
    const shop = await Shop.findOne({ slug });
    const order = shop ? await PrintOrder.findOne({
      shopId: shop._id,
      publicCode: code.data,
      customerSessionId: request.sessionID,
      paymentMethod: "razorpay",
    }) : null;
    if (!shop || !order || !order.razorpayOrderId) {
      response.status(404).json({ error: "Razorpay order not found." });
      return;
    }
    if (parsed.data.razorpayOrderId !== order.razorpayOrderId) {
      response.status(400).json({ error: "The payment does not match this print order." });
      return;
    }
    if (!verifyCheckoutSignature(parsed.data.razorpayOrderId, parsed.data.razorpayPaymentId, parsed.data.razorpaySignature)) {
      response.status(400).json({ error: "Razorpay payment signature could not be verified." });
      return;
    }

    let payment = await fetchRazorpayPayment(parsed.data.razorpayPaymentId);
    if (payment.order_id !== order.razorpayOrderId || payment.amount !== order.amountPaise || payment.currency !== order.currency) {
      response.status(400).json({ error: "Razorpay payment amount or order does not match." });
      return;
    }
    if (payment.status === "authorized") {
      payment = await captureRazorpayPayment(payment.id, order.amountPaise);
    }
    if (payment.status !== "captured") {
      response.status(409).json({ error: "Payment is not captured yet. Keep this page open while we confirm it." });
      return;
    }
    const result = await markRazorpayPaymentCaptured({
      orderId: payment.order_id,
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
    });
    if (!result.found || !result.matched || !result.order) {
      response.status(409).json({ error: "Payment confirmation needs review. Contact the shop before paying again." });
      return;
    }
    response.json({ order: customerOrderResponse(result.order).order });
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
