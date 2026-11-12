import { randomBytes } from "node:crypto";
import type { ShopDocument } from "./models/Shop.js";
import { calculateQuote } from "./pricing.js";

export const PHOTO_LAYOUTS = ["single", "two_stack", "two_side_by_side", "four", "six", "nine"] as const;
export type PhotoLayout = (typeof PHOTO_LAYOUTS)[number];

export type CustomerPrintOptions = {
  paperSize: "A3" | "A4" | "A5" | "Legal";
  colour: boolean;
  duplex: boolean;
  copies: number;
  orientation?: "portrait" | "landscape";
  pageRange?: string;
  photoLayout?: PhotoLayout;
};

export function countSelectedPages(pageRange: string | undefined, totalPages: number): number {
  if (!pageRange?.trim()) return totalPages;
  const selected = new Set<number>();
  for (const part of pageRange.split(",")) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part.trim());
    if (!match) throw new Error("Enter pages like 1-3, 5.");
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > totalPages) throw new Error(`Choose pages between 1 and ${totalPages}.`);
    for (let page = start; page <= end; page++) selected.add(page);
  }
  if (!selected.size) throw new Error("Select at least one page.");
  return selected.size;
}

export function getPhotoSlots(layout: PhotoLayout): number {
  switch (layout) {
    case "single":
      return 1;
    case "two_stack":
    case "two_side_by_side":
      return 2;
    case "four":
      return 4;
    case "six":
      return 6;
    case "nine":
      return 9;
  }
}

export function calculateCustomerQuote(
  shop: ShopDocument,
  uploads: Array<{ kind: "document" | "photo"; pageCount: number }>,
  options: CustomerPrintOptions,
) {
  if (!shop.enabledPaperSizes.includes(options.paperSize)) {
    throw new Error("That paper size is not enabled for this shop.");
  }
  if (options.colour && !shop.colourEnabled) {
    throw new Error("Colour printing is not enabled for this shop.");
  }
  if (options.duplex && !shop.duplexEnabled) {
    throw new Error("Double-sided printing is not enabled for this shop.");
  }
  if (options.copies > shop.maxCopies) {
    throw new Error(`This shop allows up to ${shop.maxCopies} copies.`);
  }

  const isPhotoOrder = uploads.every((upload) => upload.kind === "photo");
  if (!isPhotoOrder && uploads.some((upload) => upload.kind === "photo")) {
    throw new Error("Upload either PDF documents or photos in one order, not both.");
  }
  if (isPhotoOrder && !options.photoLayout) {
    throw new Error("Choose a photo layout.");
  }
  if (!isPhotoOrder && options.photoLayout) {
    throw new Error("Photo layouts can only be used with image uploads.");
  }
  if (isPhotoOrder && options.duplex) {
    throw new Error("Double-sided printing is not available for photo layouts.");
  }

  const rates = shop.rates.get(options.paperSize);
  if (!rates) {
    throw new Error("Pricing is not configured for that paper size.");
  }
  const ratePaise = options.duplex
    ? options.colour ? rates.colourDuplexSheetPaise : rates.blackWhiteDuplexSheetPaise
    : options.colour ? rates.colourSimplexPaise : rates.blackWhiteSimplexPaise;
  if (!Number.isSafeInteger(ratePaise) || ratePaise <= 0) {
    throw new Error("Pricing is not configured for that print option.");
  }

  const sourcePages = uploads.reduce((sum, upload) => sum + upload.pageCount, 0);
  if (isPhotoOrder && options.pageRange?.trim()) throw new Error("Page ranges are available for PDF documents only.");
  const selectedPages = isPhotoOrder ? sourcePages : countSelectedPages(options.pageRange, sourcePages);
  const billablePages = isPhotoOrder
    ? Math.ceil(selectedPages / getPhotoSlots(options.photoLayout!))
    : selectedPages;
  const quote = calculateQuote(billablePages, options.copies, ratePaise, options.duplex);
  const discountUnits = billablePages * options.copies;
  const matchingTier = (shop.discountTiers ?? []).filter((tier) => tier.minUnits != null && tier.maxUnits != null && tier.percent != null && discountUnits >= tier.minUnits && discountUnits <= tier.maxUnits).reduce((best, tier) => Math.max(best, tier.percent ?? 0), 0);
  const matchingPaperDiscount = (shop.discountGroups ?? []).filter((group) => group.paperSize === "all" || group.paperSize === options.paperSize)
    .flatMap((group) => group.ranges)
    .filter((range) => range.minPages != null && discountUnits >= range.minPages && (range.maxPages == null || discountUnits <= range.maxPages))
    .reduce((best, range) => Math.max(best, range.percent ?? 0), 0);
  const discountPercent = Math.max(matchingTier, matchingPaperDiscount, shop.bulkDiscountMinPages > 0 && discountUnits >= shop.bulkDiscountMinPages ? shop.bulkDiscountPercent : 0);
  const discountPaise = Math.floor((quote.amountPaise * discountPercent) / 100);
  const amountPaise = quote.amountPaise - discountPaise;
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new Error("The requested order total is outside the supported range.");
  }
  return {
    ...quote,
    amountPaise,
    discountPaise,
    discountPercent,
    sourcePages,
    selectedPages,
    currency: "INR",
    photoLayout: options.photoLayout,
  };
}

export function createPickupCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function sanitizeOriginalName(originalName: string): string {
  const basename = originalName.split(/[\\/]/).pop() ?? "upload";
  return basename.replace(/[\u0000-\u001f\u007f]/g, "_").slice(0, 128) || "upload";
}
