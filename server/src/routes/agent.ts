import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { agentHeartbeatSchema, printJobResultSchema } from "@printly/contracts";
import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { AgentDevice } from "../models/AgentDevice.js";
import { CustomerUpload } from "../models/CustomerUpload.js";
import { PrintOrder } from "../models/PrintOrder.js";
import { PrinterRoute } from "../models/PrinterRoute.js";
import { Shop } from "../models/Shop.js";
import { ShopPrinter } from "../models/ShopPrinter.js";
import { pipeCloudinaryStream } from "../services/cloudinary.js";
import { requireDesktopAgent } from "../agentAccess.js";
import { statusForAgentPrintOutcome } from "../orderWorkflow.js";

export const agentRouter = Router();
const authenticatedAgentRouter = Router();
const shopOwnerRouter = Router();
const uploadDirectory = join(process.cwd(), "data", "uploads");
const printLeaseMs = 10 * 60 * 1000;
const onlineWindowMs = 5 * 60 * 1000;

const connectionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: "Too many desktop connection attempts. Wait before trying again." },
});

const revokeSchema = z.object({ deviceId: z.string().refine(isValidObjectId) }).strict();
const fileParamsSchema = z.object({
  orderId: z.string().refine(isValidObjectId),
  uploadId: z.string().refine(isValidObjectId),
}).strict();

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function requireShopOwner(request: Request, response: Response, next: NextFunction) {
  if (!request.session.userId || !isValidObjectId(request.session.userId)) {
    response.status(401).json({ error: "Sign in to connect a computer." });
    return;
  }
  next();
}

async function requireAgent(request: Request, response: Response, next: NextFunction) {
  const authorization = request.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{40,160})$/.exec(authorization);
  if (!match) {
    response.status(401).json({ error: "This computer is not connected. Sign in to your shop in the desktop app." });
    return;
  }
  try {
    const agent = await AgentDevice.findOne({
      tokenHash: hashSecret(match[1]),
      status: { $ne: "revoked" },
    });
    if (!agent) {
      response.status(401).json({ error: "The computer connection expired or was revoked. Sign in again in the desktop app." });
      return;
    }
    response.locals.agent = agent;
    next();
  } catch (error) { next(error); }
}

shopOwnerRouter.post("/connect", requireShopOwner, connectionLimiter, async (request, response, next) => {
  const parsed = z.object({ deviceName: z.string().trim().min(1).max(120), agentVersion: z.string().trim().min(1).max(40) }).strict().safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "The desktop app sent invalid connection details." }); return; }
  try {
    const now = new Date();
    const shop = await Shop.findOne({ ownerId: request.session.userId }).select("_id displayName");
    if (!shop) { response.status(404).json({ error: "No shop is linked to this account." }); return; }

    const accessToken = randomBytes(48).toString("base64url");
    let agent = await AgentDevice.findOne({ shopId: shop._id, deviceName: parsed.data.deviceName });
    if (agent) {
      agent.agentVersion = parsed.data.agentVersion;
      agent.tokenHash = hashSecret(accessToken);
      agent.tokenExpiresAt = undefined;
      agent.status = "online";
      agent.lastSeenAt = now;
      agent.revokedAt = undefined;
      await agent.save();
    } else {
      agent = await AgentDevice.create({
        shopId: shop._id,
        deviceName: parsed.data.deviceName,
        agentVersion: parsed.data.agentVersion,
        tokenHash: hashSecret(accessToken),
        status: "online",
        lastSeenAt: now,
      });
    }

    // A fresh desktop sign-in always starts offline; the shopkeeper explicitly enables it in the agent.
    await Shop.updateOne({ _id: shop._id }, { $set: { isOnline: false } });

    // Link existing Windows printers for this shop to this signed-in desktop.
    await ShopPrinter.updateMany(
      { shopId: shop._id, protocol: "windows" },
      { $set: { agentDeviceId: agent._id, status: "ready" } }
    );
    response.status(201).json({
      deviceId: String(agent._id),
      deviceName: agent.deviceName,
      accessToken,
      shop: { id: String(shop._id), displayName: shop.displayName },
    });
  } catch (error) { next(error); }
});

authenticatedAgentRouter.use(requireAgent);

authenticatedAgentRouter.patch("/shop-online", async (request, response, next) => {
  const parsed = z.object({ isOnline: z.boolean() }).strict().safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Choose whether your shop is online." }); return; }
  const agent = response.locals.agent as InstanceType<typeof AgentDevice>;
  try {
    const now = new Date();
    const shop = await Shop.findByIdAndUpdate(agent.shopId, { $set: { isOnline: parsed.data.isOnline } }, { new: true }).select("isOnline");
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    agent.status = "online";
    agent.lastSeenAt = now;
    await agent.save();
    response.json({ isOnline: shop.isOnline, agentOnline: true });
  } catch (error) { next(error); }
});

authenticatedAgentRouter.post("/disconnect", async (_request, response, next) => {
  const agent = response.locals.agent as InstanceType<typeof AgentDevice>;
  try {
    const now = new Date();
    agent.status = "revoked";
    agent.revokedAt = now;
    await agent.save();
    await Promise.all([
      Shop.updateOne({ _id: agent.shopId }, { $set: { isOnline: false } }),
      ShopPrinter.updateMany({ shopId: agent.shopId, agentDeviceId: agent._id }, { $set: { status: "offline" } }),
    ]);
    response.status(204).end();
  } catch (error) { next(error); }
});

authenticatedAgentRouter.get("/me", (_request, response) => {
  const agent = response.locals.agent as InstanceType<typeof AgentDevice>;
  response.json({
    device: { id: String(agent._id), deviceName: agent.deviceName, agentVersion: agent.agentVersion, status: agent.status, lastSeenAt: agent.lastSeenAt },
  });
});

authenticatedAgentRouter.post("/heartbeat", async (request, response, next) => {
  const parsed = agentHeartbeatSchema.safeParse(request.body);
  if (!parsed.success) {
    console.warn("[AGENT] Invalid heartbeat payload:", parsed.error.issues);
    response.status(400).json({ error: "The computer sent an invalid printer list." });
    return;
  }
  const agent = response.locals.agent as InstanceType<typeof AgentDevice>;
  try {
    const now = new Date();
    agent.agentVersion = parsed.data.agentVersion;
    agent.status = "online";
    agent.lastSeenAt = now;
    await agent.save();

    const discoveredNames = parsed.data.printers.map((printer) => printer.systemName);
    await ShopPrinter.updateMany(
      { shopId: agent.shopId, agentDeviceId: agent._id, protocol: "windows", ...(discoveredNames.length ? { systemName: { $nin: discoveredNames } } : {}) },
      { $set: { status: "offline" } },
    );
    for (const printer of parsed.data.printers) {
      await ShopPrinter.findOneAndUpdate(
        { shopId: agent.shopId, agentDeviceId: agent._id, systemName: printer.systemName },
        { $set: {
          name: printer.displayName.slice(0, 80),
          systemName: printer.systemName,
          isDefault: printer.isDefault,
          protocol: "windows",
          address: "",
          supportsColour: printer.capabilities.supportsColour,
          supportsDuplex: printer.capabilities.supportsDuplex,
          paperSizes: printer.capabilities.paperSizes,
          status: "ready",
        } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }
    response.json({ accepted: parsed.data.printers.length, lastSeenAt: now.toISOString() });
  } catch (error) { next(error); }
});

authenticatedAgentRouter.get("/jobs/next", async (request, response, next) => {
  const agent = response.locals.agent as InstanceType<typeof AgentDevice>;
  try {
    const now = new Date();
    agent.lastSeenAt = now;
    agent.status = "online";
    await agent.save();

    const shopAvailability = await Shop.findById(agent.shopId).select("isOnline");
    if (!shopAvailability?.isOnline) { response.status(204).end(); return; }

    const staleJobs = await PrintOrder.find({ shopId: agent.shopId, status: "printing", agentLeaseExpiresAt: { $lte: now } }).limit(50);
    const shop = staleJobs.length ? await Shop.findById(agent.shopId).select("fileRetentionHours") : null;
    for (const stale of staleJobs) {
      stale.status = "failed";
      stale.agentLeaseId = undefined;
      stale.agentLeaseExpiresAt = undefined;
      stale.events.push({ type: "agent_lease_expired", actorType: "system", timestamp: now, note: "The desktop agent stopped responding before reporting a print result." });
      await stale.save();
      if (shop) {
        await CustomerUpload.updateMany(
          { _id: { $in: stale.files.map((file) => file.uploadId) }, orderId: stale._id, state: "attached" },
          { $set: { expiresAt: new Date(now.getTime() + Number(shop.fileRetentionHours ?? 24) * 60 * 60 * 1000) } },
        );
      }
    }

    const candidates = await PrintOrder.find({
      shopId: agent.shopId,
      status: "queued",
      paymentStatus: "paid",
    }).sort({ createdAt: 1 }).limit(40);
    // Queue check performed
    for (const candidate of candidates) {
      const options = candidate.options!;
      const route = await PrinterRoute.findOne({ shopId: agent.shopId, paperSize: options.paperSize, colour: options.colour, duplex: options.duplex });
      if (!route) continue;
      // A job is only eligible for the printer the shop explicitly routed it to.
      // Never silently send it to a different/default printer or another PC.
      const printer = await ShopPrinter.findOne({
        _id: route.printerId,
        shopId: agent.shopId,
        agentDeviceId: agent._id,
        protocol: "windows",
        status: "ready",
        systemName: { $type: "string", $ne: "" },
      });
      if (!printer?.systemName) continue;
      const leaseId = randomUUID();
      const claimed = await PrintOrder.findOneAndUpdate(
        { _id: candidate._id, shopId: agent.shopId, status: candidate.status, paymentStatus: "paid" },
        { $set: {
          status: "printing",
          assignedPrinterId: printer._id,
          agentDeviceId: agent._id,
          agentLeaseId: leaseId,
          agentLeaseExpiresAt: new Date(now.getTime() + printLeaseMs),
        }, $inc: { printAttempts: 1 }, $push: { events: { type: "agent_job_claimed", actorType: "system", timestamp: now, note: `Sent to ${printer.name}.` } } },
        { new: true },
      );
      if (!claimed) continue;
      const uploads = await CustomerUpload.find({ _id: { $in: claimed.files.map((file) => file.uploadId) }, shopId: agent.shopId, orderId: claimed._id, state: "attached" }).select("_id originalName mediaType pageCount");
      if (uploads.length !== claimed.files.length) {
        claimed.status = "failed";
        claimed.agentLeaseId = undefined;
        claimed.agentLeaseExpiresAt = undefined;
        claimed.events.push({ type: "agent_job_failed", actorType: "system", timestamp: new Date(), note: "One or more order files are no longer available." });
        await claimed.save();
        continue;
      }
      response.json({
        leaseId,
        orderId: String(claimed._id),
        orderCode: claimed.publicCode,
        printerId: String(printer._id),
        printerSystemName: printer.systemName,
        options: claimed.options,
        attempt: claimed.printAttempts,
        files: uploads.map((upload) => ({
          uploadId: String(upload._id),
          name: upload.originalName,
          mediaType: upload.mediaType,
          pageCount: upload.pageCount,
          downloadUrl: `/api/agent/jobs/${String(claimed._id)}/files/${String(upload._id)}?lease=${encodeURIComponent(leaseId)}`,
        })),
      });
      return;
    }
    response.status(204).end();
  } catch (error) { next(error); }
});

authenticatedAgentRouter.get("/jobs/:orderId/files/:uploadId", async (request, response, next) => {
  const parsedParams = fileParamsSchema.safeParse(request.params);
  const lease = z.string().uuid().safeParse(request.query.lease);
  if (!parsedParams.success || !lease.success) { response.status(400).json({ error: "The print file request is invalid." }); return; }
  const agent = response.locals.agent as InstanceType<typeof AgentDevice>;
  try {
    const order = await PrintOrder.findOne({ _id: parsedParams.data.orderId, shopId: agent.shopId, status: "printing", agentDeviceId: agent._id, agentLeaseId: lease.data, agentLeaseExpiresAt: { $gt: new Date() } });
    const linkedFile = order?.files.find((file) => String(file.uploadId) === parsedParams.data.uploadId);
    const upload = linkedFile ? await CustomerUpload.findOne({ _id: parsedParams.data.uploadId, shopId: agent.shopId, orderId: order!._id, state: "attached" }).select("mediaType originalName storageKey cloudinaryUrl") : null;
    if (!upload) { response.status(404).json({ error: "The file is no longer available for this print job." }); return; }
    response.setHeader("Content-Type", upload.mediaType);
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(upload.originalName)}`);
    response.setHeader("Cache-Control", "private, no-store");

    const filePath = join(uploadDirectory, upload.storageKey);
    let localExists = false;
    try {
      await stat(filePath);
      localExists = true;
    } catch {}

    if (localExists) {
      createReadStream(filePath).on("error", next).pipe(response);
    } else if (upload.cloudinaryUrl) {
      await pipeCloudinaryStream(upload.cloudinaryUrl, response);
    } else {
      response.status(404).json({ error: "The file is no longer available on disk or cloud." });
    }
  } catch (error) { next(error); }
});

authenticatedAgentRouter.post("/jobs/:orderId/result", async (request, response, next) => {
  const orderId = z.string().refine(isValidObjectId).safeParse(request.params.orderId);
  const parsed = printJobResultSchema.safeParse(request.body);
  if (!orderId.success || !parsed.success) { response.status(400).json({ error: "The print result is invalid." }); return; }
  const agent = response.locals.agent as InstanceType<typeof AgentDevice>;
  try {
    const now = new Date();
    const order = await PrintOrder.findOne({ _id: orderId.data, shopId: agent.shopId, status: "printing", agentDeviceId: agent._id, agentLeaseId: parsed.data.leaseId, agentLeaseExpiresAt: { $gt: now } });
    if (!order) { response.status(409).json({ error: "This print attempt expired or has already been reported." }); return; }
    const shop = await Shop.findById(agent.shopId).select("fileRetentionHours");
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    const printSucceeded = parsed.data.outcome !== "failed";
    order.status = statusForAgentPrintOutcome(parsed.data.outcome);
    order.agentLeaseId = undefined;
    order.agentLeaseExpiresAt = undefined;
    const detail = printSucceeded
      ? `Windows reported the print job completed on attempt ${order.printAttempts}.`
      : (parsed.data.errorMessage ?? "The Windows printer reported an error.").slice(0, 240);
    order.events.push({ type: printSucceeded ? "agent_print_completed" : "agent_print_failed", actorType: "system", timestamp: now, note: detail });
    await order.save();
    await CustomerUpload.updateMany(
      { _id: { $in: order.files.map((file) => file.uploadId) }, orderId: order._id, state: "attached" },
      { $set: { expiresAt: new Date(now.getTime() + Number(shop.fileRetentionHours) * 60 * 60 * 1000) } },
    );
    response.json({ orderId: String(order._id), status: order.status, note: detail });
  } catch (error) { next(error); }
});

shopOwnerRouter.get("/devices", requireShopOwner, async (request, response, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId }).select("_id");
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    const devices = await AgentDevice.find({ shopId: shop._id, status: { $ne: "revoked" } }).select("deviceName agentVersion status lastSeenAt createdAt").sort({ lastSeenAt: -1 });
    const staleBefore = Date.now() - onlineWindowMs;
    response.json({ devices: devices.map((device) => ({
      id: String(device._id),
      deviceName: device.deviceName,
      agentVersion: device.agentVersion,
      status: device.lastSeenAt && device.lastSeenAt.getTime() >= staleBefore ? "online" : "offline",
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
    })) });
  } catch (error) { next(error); }
});

shopOwnerRouter.delete("/devices/:deviceId", requireShopOwner, requireDesktopAgent, async (request, response, next) => {
  const parsed = revokeSchema.safeParse({ deviceId: request.params.deviceId });
  if (!parsed.success) { response.status(400).json({ error: "Choose a valid connected computer." }); return; }
  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId }).select("_id");
    const device = shop ? await AgentDevice.findOne({ _id: parsed.data.deviceId, shopId: shop._id, status: { $ne: "revoked" } }) : null;
    if (!device) { response.status(404).json({ error: "Connected computer not found." }); return; }
    device.status = "revoked";
    device.revokedAt = new Date();
    await device.save();
    await ShopPrinter.updateMany({ shopId: device.shopId, agentDeviceId: device._id }, { $set: { status: "offline" } });
    response.status(204).end();
  } catch (error) { next(error); }
});

// Owner endpoints must be checked with the web session before bearer-authenticated agent routes.
agentRouter.use(shopOwnerRouter);
agentRouter.use(authenticatedAgentRouter);
