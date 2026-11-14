import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { markRazorpayPaymentCaptured, verifyWebhookSignature } from "../services/razorpay.js";

export const razorpayWebhookRouter = Router();

const eventSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string(),
        order_id: z.string(),
        amount: z.number().int().positive(),
        currency: z.string(),
        status: z.string(),
      }).passthrough(),
    }).optional(),
  }).optional(),
}).passthrough();

razorpayWebhookRouter.post("/", async (request: Request, response: Response, next: NextFunction) => {
  if (!Buffer.isBuffer(request.body)) {
    response.status(400).json({ error: "Expected the raw Razorpay webhook body." });
    return;
  }
  const signature = request.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(request.body, signature)) {
    response.status(401).json({ error: "Razorpay webhook signature is invalid." });
    return;
  }
  try {
    const parsedJson: unknown = JSON.parse(request.body.toString("utf8"));
    const parsed = eventSchema.safeParse(parsedJson);
    if (!parsed.success) {
      response.status(400).json({ error: "Razorpay webhook payload is invalid." });
      return;
    }
    if (parsed.data.event !== "payment.captured") {
      response.status(200).json({ received: true });
      return;
    }
    const payment = parsed.data.payload?.payment?.entity;
    if (!payment || payment.status !== "captured") {
      response.status(400).json({ error: "Razorpay captured-payment details are missing." });
      return;
    }
    const result = await markRazorpayPaymentCaptured({
      orderId: payment.order_id,
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
    });
    if (result.found && !result.matched) {
      response.status(400).json({ error: "Razorpay payment did not match the print order." });
      return;
    }
    if (!result.found) console.warn("Razorpay captured webhook did not match a Printly order.", payment.order_id);
    response.status(200).json({ received: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      response.status(400).json({ error: "Razorpay webhook JSON is invalid." });
      return;
    }
    next(error);
  }
});
