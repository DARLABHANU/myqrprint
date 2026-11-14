import { z } from "zod";

export const paperSizes = ["A3", "A4", "A5", "Legal"] as const;
export const printOrderStatuses = [
  "awaiting_payment",
  "awaiting_cash",
  "needs_approval",
  "queued",
  "printing",
  "submitted",
  "printed",
  "failed",
  "rejected",
  "cancelled",
  "expired",
] as const;
export const paymentMethods = ["upi", "cash", "razorpay"] as const;
export const paymentStatuses = ["unverified", "awaiting_cash", "paid"] as const;

export const paperSizeSchema = z.enum(paperSizes);
export const printOrderStatusSchema = z.enum(printOrderStatuses);
export const printOptionsSchema = z.object({
  paperSize: paperSizeSchema,
  colour: z.boolean(),
  duplex: z.boolean(),
  copies: z.number().int().min(1).max(100),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  pageRange: z.string().max(400).optional(),
  photoLayout: z.enum(["single", "two_stack", "two_side_by_side", "four", "six", "nine"]).optional(),
}).strict();

export const printerCapabilitiesSchema = z.object({
  paperSizes: z.array(paperSizeSchema).min(1).max(paperSizes.length),
  supportsColour: z.boolean(),
  supportsDuplex: z.boolean(),
}).strict();

export const discoveredPrinterSchema = z.object({
  systemName: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200),
  isDefault: z.boolean().default(false),
  status: z.enum(["ready", "offline"]).default("ready"),
  capabilities: printerCapabilitiesSchema,
}).strict();

export const agentHeartbeatSchema = z.object({
  agentVersion: z.string().trim().min(1).max(40),
  printers: z.array(discoveredPrinterSchema).max(100),
}).strict();

export const leasedPrintJobSchema = z.object({
  leaseId: z.string().min(1),
  orderId: z.string().min(1),
  orderCode: z.string().min(1),
  printerId: z.string().min(1),
  printerSystemName: z.string().min(1),
  options: printOptionsSchema,
  files: z.array(z.object({
    uploadId: z.string().min(1),
    name: z.string(),
    mediaType: z.string(),
    pageCount: z.number().int().positive(),
    // API returns same-origin relative URLs so the agent can use its configured backend URL.
    downloadUrl: z.string().min(1).max(1000),
  }).strict()).min(1).max(10),
  attempt: z.number().int().positive(),
}).strict();

export const printJobResultSchema = z.object({
  leaseId: z.string().min(1),
  outcome: z.enum(["submitted", "failed"]),
  spoolerJobIds: z.array(z.string().max(120)).max(10).default([]),
  errorCode: z.string().trim().max(80).optional(),
  errorMessage: z.string().trim().max(240).optional(),
}).strict().superRefine((value, context) => {
  if (value.outcome === "failed" && !value.errorMessage) {
    context.addIssue({ code: "custom", path: ["errorMessage"], message: "A failed job must include a reason." });
  }
});

export type PaperSize = typeof paperSizes[number];
export type PrintOrderStatus = typeof printOrderStatuses[number];
export type PrintOptions = z.infer<typeof printOptionsSchema>;
export type DiscoveredPrinter = z.infer<typeof discoveredPrinterSchema>;
export type AgentHeartbeat = z.infer<typeof agentHeartbeatSchema>;
export type LeasedPrintJob = z.infer<typeof leasedPrintJobSchema>;
export type PrintJobResult = z.infer<typeof printJobResultSchema>;
