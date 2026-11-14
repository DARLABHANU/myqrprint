import { createHmac, timingSafeEqual } from "node:crypto";
import { PrintOrder } from "../models/PrintOrder.js";
import { Shop } from "../models/Shop.js";

const razorpayApi = "https://api.razorpay.com/v1";

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

export type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
};

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay test credentials are not configured on the backend.");
  if (!keyId.startsWith("rzp_test_")) throw new Error("This build accepts Razorpay test-mode credentials only.");
  return { keyId, keySecret };
}

function authorizationHeader() {
  const { keyId, keySecret } = credentials();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function razorpayRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${razorpayApi}${path}`, {
    ...init,
    headers: {
      Authorization: authorizationHeader(),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as { error?: { description?: string } } & T;
  if (!response.ok) {
    console.error("Razorpay API request failed:", response.status, body.error?.description ?? "No error detail.");
    throw new Error("Razorpay could not process this payment. Please try again.");
  }
  return body;
}

export function isRazorpayEnabled(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_ID?.trim().startsWith("rzp_test_")
    && process.env.RAZORPAY_KEY_SECRET
    && process.env.RAZORPAY_WEBHOOK_SECRET,
  );
}

export function razorpayPublicKeyId(): string {
  return credentials().keyId;
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const { keySecret } = credentials();
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function createRazorpayOrder(input: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  return razorpayRequest<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes,
    }),
  });
}

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  return razorpayRequest<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function captureRazorpayPayment(paymentId: string, amountPaise: number): Promise<RazorpayPayment> {
  return razorpayRequest<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: "POST",
    body: JSON.stringify({ amount: amountPaise, currency: "INR" }),
  });
}

export async function markRazorpayPaymentCaptured(input: {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
}) {
  const order = await PrintOrder.findOne({ razorpayOrderId: input.orderId });
  if (!order) return { found: false as const };
  if (order.amountPaise !== input.amount || order.currency !== input.currency) {
    console.error("Rejected a Razorpay captured event with an amount/currency mismatch for order", order.publicCode);
    return { found: true as const, matched: false as const };
  }
  const shop = await Shop.findById(order.shopId).select("autoPrint");
  if (!shop) return { found: true as const, matched: false as const };
  if (order.paymentStatus !== "paid") {
    order.razorpayPaymentId = input.paymentId;
    order.paymentReference = input.paymentId;
    order.paymentStatus = "paid";
    if (["awaiting_payment", "awaiting_cash"].includes(order.status)) {
      order.status = shop.autoPrint ? "queued" : "needs_approval";
    }
    const latePayment = ["cancelled", "rejected", "expired"].includes(order.status);
    order.events.push({
      type: latePayment ? "razorpay_payment_captured_after_order_ended" : "razorpay_payment_captured",
      actorType: "system",
      timestamp: new Date(),
      note: latePayment
        ? `Payment ${input.paymentId} was captured after the order ended; refund review is required.`
        : `Razorpay payment ${input.paymentId} was verified as captured.`,
    });
    await order.save();
  } else if (order.razorpayPaymentId && order.razorpayPaymentId !== input.paymentId) {
    console.error("Rejected a second Razorpay payment for already-paid Printly order", order.publicCode);
    return { found: true as const, matched: false as const };
  }
  return { found: true as const, matched: true as const, order };
}
