import { Router, type NextFunction, type Request, type Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Shop } from "../models/Shop.js";
import { AgentDevice } from "../models/AgentDevice.js";
import { requireDesktopAgent } from "../agentAccess.js";
import { User } from "../models/User.js";
import { calculateQuote } from "../pricing.js";

export const shopsRouter = Router();

const paperSizes = ["A3", "A4", "A5", "Legal"] as const;
const agentOnlineWindowMs = 30 * 1000;
const rateSchema = z.object({
  blackWhiteSimplexPaise: z.number().int().min(0).max(100_000_000),
  colourSimplexPaise: z.number().int().min(0).max(100_000_000),
  blackWhiteDuplexSheetPaise: z.number().int().min(0).max(100_000_000),
  colourDuplexSheetPaise: z.number().int().min(0).max(100_000_000),
});
const shopSettingsSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  ownerName: z.string().trim().min(2).max(100),
  logoDataUrl: z.string().max(700000).refine((value) => value === "" || /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value), "Upload a PNG, JPG or WEBP logo."),
  mobile: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/),
  address: z.string().trim().max(300),
  city: z.string().trim().max(100),
  state: z.string().trim().max(100),
  pincode: z.string().trim().max(12),
  gstin: z.string().trim().max(15).transform((value) => value.toUpperCase()).refine((value) => value === "" || /^[0-9A-Z]{15}$/.test(value), "Enter a valid 15-character GSTIN."),
  upiId: z.string().trim().max(100).refine(
    (value) => value === "" || /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9.-]{2,64}$/.test(value),
    "Enter a valid UPI ID, for example shop@bank.",
  ),
  upiEnabled: z.boolean(),
  cashEnabled: z.boolean(),
  autoPrint: z.boolean().default(false),
  isOnline: z.boolean(),
  locationLockEnabled: z.boolean(),
  locationLatitude: z.number().min(-90).max(90).optional(),
  locationLongitude: z.number().min(-180).max(180).optional(),
  locationRadiusMeters: z.number().int().min(50).max(5000),
  notificationPreferences: z.object({ newOrder: z.boolean(), printFailed: z.boolean(), uploadSound: z.boolean(), customerUploadVoice: z.boolean(), dailyEmail: z.boolean() }).strict(),
  bulkDiscountMinPages: z.number().int().min(0).max(100000),
  bulkDiscountPercent: z.number().min(0).max(90),
  discountTiers: z.array(z.object({ minUnits: z.number().int().min(1).max(1000000), maxUnits: z.number().int().min(1).max(1000000), percent: z.number().min(0).max(90) }).strict()).max(20),
  discountGroups: z.array(z.object({
    paperSize: z.enum(["all", ...paperSizes]),
    ranges: z.array(z.object({ minPages: z.number().int().min(1).max(1000000), maxPages: z.number().int().min(1).max(1000000).nullable().optional(), percent: z.number().min(0).max(90) }).strict()).max(50),
  }).strict()).max(20),
  collectCustomerName: z.boolean(),
  collectCustomerMobile: z.boolean(),
  fileRetentionHours: z.number().min(0.25).max(720),
  enabledPaperSizes: z.array(z.enum(paperSizes)).min(1).max(4),
  colourEnabled: z.boolean(),
  duplexEnabled: z.boolean(),
  maxCopies: z.number().int().min(1).max(100),
  rates: z.record(z.enum(paperSizes), rateSchema),
}).superRefine((value, context) => {
  if (value.upiEnabled && !value.upiId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["upiId"], message: "Enter your UPI ID before enabling UPI." });
  }
  if (!value.cashEnabled && !(value.upiEnabled && value.upiId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["upiId"],
      message: "Add a UPI ID or enable cash at counter.",
    });
  }
  if (value.locationLockEnabled && (value.locationLatitude === undefined || value.locationLongitude === undefined)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["locationLatitude"], message: "Set the shop location before enabling location lock." });

  for (const paperSize of value.enabledPaperSizes) {
    const rates = value.rates[paperSize];
    if (!rates) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rates", paperSize],
        message: "Add rates for every enabled paper size.",
      });
      continue;
    }
    if (rates.blackWhiteSimplexPaise <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rates", paperSize, "blackWhiteSimplexPaise"],
        message: "A black-and-white single-sided rate is required.",
      });
    }
    if (value.colourEnabled && rates.colourSimplexPaise <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rates", paperSize, "colourSimplexPaise"],
        message: "A colour single-sided rate is required when colour is enabled.",
      });
    }
    if (value.duplexEnabled && rates.blackWhiteDuplexSheetPaise <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rates", paperSize, "blackWhiteDuplexSheetPaise"],
        message: "A black-and-white duplex sheet rate is required when duplex is enabled.",
      });
    }
    if (value.colourEnabled && value.duplexEnabled && rates.colourDuplexSheetPaise <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rates", paperSize, "colourDuplexSheetPaise"],
        message: "A colour duplex sheet rate is required when colour and duplex are enabled.",
      });
    }
  }
  value.discountTiers.forEach((tier, index) => {
    if (tier.maxUnits < tier.minUnits) context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountTiers", index, "maxUnits"], message: "Maximum units must be at least the minimum." });
  });
  value.discountGroups.forEach((group, groupIndex) => group.ranges.forEach((range, rangeIndex) => {
    if (range.maxPages != null && range.maxPages < range.minPages) context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountGroups", groupIndex, "ranges", rangeIndex, "maxPages"], message: "Maximum pages must be at least the minimum." });
  }));
});

const quoteSchema = z.object({
  paperSize: z.enum(paperSizes),
  pageCount: z.number().int().min(1).max(1000),
  copies: z.number().int().min(1).max(100),
  colour: z.boolean(),
  duplex: z.boolean(),
});

function requireOwner(request: Request, response: Response, next: NextFunction) {
  if (!request.session.userId || !isValidObjectId(request.session.userId)) {
    response.status(401).json({ error: "Sign in to manage your shop." });
    return;
  }
  next();
}

shopsRouter.use(requireOwner);

shopsRouter.patch("/online", requireDesktopAgent, async (request, response, next) => {
  const parsed = z.object({ isOnline: z.boolean() }).strict().safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Choose whether your shop is online." }); return; }
  try {
    const shop = await Shop.findOneAndUpdate({ ownerId: request.session.userId }, { $set: { isOnline: parsed.data.isOnline } }, { new: true }).select("isOnline");
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    response.json({ isOnline: shop.isOnline });
  } catch (error) { next(error); }
});

shopsRouter.patch("/notifications", requireDesktopAgent, async (request, response, next) => {
  const parsed = z.object({
    newOrder: z.boolean().optional(),
    printFailed: z.boolean().optional(),
    uploadSound: z.boolean().optional(),
    customerUploadVoice: z.boolean().optional(),
    dailyEmail: z.boolean().optional(),
  }).strict().refine((value) => Object.keys(value).length > 0).safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Choose at least one notification preference." }); return; }
  try {
    const updates = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [`notificationPreferences.${key}`, value]));
    const shop = await Shop.findOneAndUpdate({ ownerId: request.session.userId }, { $set: updates }, { new: true }).select("notificationPreferences");
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    response.json({ notificationPreferences: shop.notificationPreferences });
  } catch (error) { next(error); }
});

shopsRouter.get("/me", async (request, response, next) => {
  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId });
    if (!shop) {
      response.status(404).json({ error: "Shop settings were not found." });
      return;
    }
    const onlineSince = new Date(Date.now() - agentOnlineWindowMs);
    const agentOnline = Boolean(await AgentDevice.exists({ shopId: shop._id, status: "online", lastSeenAt: { $gte: onlineSince } }));
    response.json({ shop, agentOnline });
  } catch (error) {
    next(error);
  }
});

shopsRouter.put("/me", requireDesktopAgent, async (request, response, next) => {
  const parsed = shopSettingsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Some settings need attention.",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  try {
    const shop = await Shop.findOneAndUpdate(
      { ownerId: request.session.userId },
      { $set: parsed.data },
      { new: true, runValidators: true },
    );
    if (!shop) {
      response.status(404).json({ error: "Shop settings were not found." });
      return;
    }
    await User.updateOne({ _id: request.session.userId }, { $set: { ownerName: parsed.data.ownerName } });
    response.json({ shop });
  } catch (error) {
    next(error);
  }
});

shopsRouter.post("/quote", async (request, response, next) => {
  const parsed = quoteSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Check the print options and try again." });
    return;
  }

  try {
    const shop = await Shop.findOne({ ownerId: request.session.userId });
    if (!shop) {
      response.status(404).json({ error: "Shop settings were not found." });
      return;
    }
    const options = parsed.data;
    if (!shop.enabledPaperSizes.includes(options.paperSize)) {
      response.status(400).json({ error: "That paper size is not enabled for this shop." });
      return;
    }
    if (options.colour && !shop.colourEnabled) {
      response.status(400).json({ error: "Colour printing is not enabled for this shop." });
      return;
    }
    if (options.duplex && !shop.duplexEnabled) {
      response.status(400).json({ error: "Double-sided printing is not enabled for this shop." });
      return;
    }
    if (options.copies > shop.maxCopies) {
      response.status(400).json({ error: `This shop allows up to ${shop.maxCopies} copies.` });
      return;
    }

    const rates = shop.rates.get(options.paperSize);
    if (!rates) {
      response.status(400).json({ error: "Pricing is not configured for that paper size." });
      return;
    }
    const rate = options.duplex
      ? options.colour ? rates.colourDuplexSheetPaise : rates.blackWhiteDuplexSheetPaise
      : options.colour ? rates.colourSimplexPaise : rates.blackWhiteSimplexPaise;
    if (rate <= 0) {
      response.status(400).json({ error: "Pricing is not configured for that print option." });
      return;
    }
    const result = calculateQuote(options.pageCount, options.copies, rate, options.duplex);
    response.json({
      ...result,
      currency: "INR",
    });
  } catch (error) {
    next(error);
  }
});
