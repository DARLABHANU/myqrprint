import { model, Schema, type InferSchemaType } from "mongoose";

const paperRateSchema = new Schema(
  {
    blackWhiteSimplexPaise: { type: Number, required: true, min: 0 },
    colourSimplexPaise: { type: Number, required: true, min: 0 },
    blackWhiteDuplexSheetPaise: { type: Number, required: true, min: 0 },
    colourDuplexSheetPaise: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const shopSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true, maxlength: 100 },
    ownerName: { type: String, required: true, trim: true, maxlength: 100 },
    logoDataUrl: { type: String, default: "", maxlength: 900000 },
    mobile: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, required: true, lowercase: true, trim: true },
    address: { type: String, default: "", trim: true, maxlength: 300 },
    city: { type: String, default: "", trim: true, maxlength: 100 },
    state: { type: String, default: "", trim: true, maxlength: 100 },
    pincode: { type: String, default: "", trim: true, maxlength: 12 },
    gstin: { type: String, default: "", trim: true, uppercase: true, maxlength: 15 },
    upiId: { type: String, default: "", trim: true, maxlength: 100 },
    upiEnabled: { type: Boolean },
    settlementUpiId: { type: String, default: "", trim: true, maxlength: 100 },
    settlementQrDataUrl: { type: String, default: "", maxlength: 700000 },
    razorpayEnabled: { type: Boolean, default: true },
    cashEnabled: { type: Boolean, default: true },
    autoPrint: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    locationLockEnabled: { type: Boolean, default: false },
    locationLatitude: { type: Number, min: -90, max: 90 },
    locationLongitude: { type: Number, min: -180, max: 180 },
    locationRadiusMeters: { type: Number, default: 200, min: 50, max: 5000 },
    notificationPreferences: {
      newOrder: { type: Boolean, default: true },
      printFailed: { type: Boolean, default: true },
      uploadSound: { type: Boolean, default: false },
      customerUploadVoice: { type: Boolean, default: true },
      dailyEmail: { type: Boolean, default: false },
    },
    lastDailySummaryDate: { type: String, default: "" },
    bulkDiscountMinPages: { type: Number, default: 0, min: 0, max: 100000 },
    bulkDiscountPercent: { type: Number, default: 0, min: 0, max: 90 },
    discountTiers: { type: [{ minUnits: { type: Number, min: 1, max: 1000000 }, maxUnits: { type: Number, min: 1, max: 1000000 }, percent: { type: Number, min: 0, max: 90 } }], default: [] },
    discountGroups: { type: [{ paperSize: { type: String, enum: ["all", "A3", "A4", "A5", "Legal"], default: "all" }, ranges: [{ minPages: { type: Number, min: 1, max: 1000000 }, maxPages: { type: Number, min: 1, max: 1000000 }, percent: { type: Number, min: 0, max: 90 } }] }], default: [] },
    collectCustomerName: { type: Boolean, default: false },
    collectCustomerMobile: { type: Boolean, default: false },
    fileRetentionHours: { type: Number, default: 24, min: 0.25, max: 720 },
    subscriptionPlan: { type: String, enum: ["demo", "starter", "pro", "premium"], default: "demo" },
    subscriptionBillingCycle: { type: String, enum: ["monthly", "annual"] },
    subscriptionStartedAt: { type: Date, default: Date.now },
    subscriptionExpiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    subscriptionOrderLimit: { type: Number, default: 50, min: 0 },
    subscriptionOrdersUsed: { type: Number, default: 0, min: 0 },
    enabledPaperSizes: {
      type: [{ type: String, enum: ["A3", "A4", "A5", "Legal"] }],
      default: ["A4"],
    },
    colourEnabled: { type: Boolean, default: false },
    duplexEnabled: { type: Boolean, default: false },
    rates: {
      type: Map,
      of: paperRateSchema,
      default: () => new Map(),
    },
    maxCopies: { type: Number, default: 100, min: 1, max: 100 },
  },
  { timestamps: true, minimize: false },
);

export type ShopDocument = InferSchemaType<typeof shopSchema>;
export const Shop = model("Shop", shopSchema);
