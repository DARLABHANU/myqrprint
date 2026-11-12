export type OrderStatus =
  | "awaiting_payment"
  | "awaiting_cash"
  | "needs_approval"
  | "queued"
  | "printing"
  | "printed"
  | "failed"
  | "rejected"
  | "cancelled"
  | "expired";

export type PaymentStatus = "unverified" | "awaiting_cash" | "paid";
export type MerchantOrderAction = "confirm_payment" | "approve_order" | "mark_ready" | "requeue" | "reject" | "cancel";

export type OrderState = {
  status: OrderStatus;
  paymentMethod: "upi" | "cash";
  paymentStatus: PaymentStatus;
};

export function transitionMerchantOrder(
  current: OrderState,
  action: MerchantOrderAction,
): OrderState {
  switch (action) {
    case "confirm_payment":
      if (current.status !== "awaiting_payment" && current.status !== "awaiting_cash") {
        throw new Error("Payment can only be confirmed for an order awaiting payment.");
      }
      return { ...current, status: "queued", paymentStatus: "paid" };
    case "approve_order":
      if ((current.status !== "needs_approval" && current.status !== "queued") || current.paymentStatus !== "paid") {
        throw new Error("Only a payment-confirmed order can enter fulfillment queue.");
      }
      return { ...current, status: "queued" };
    case "mark_ready":
      if ((current.status !== "queued" && current.status !== "printing") || current.paymentStatus !== "paid") {
        throw new Error("Only a paid order in manual fulfillment can be marked ready.");
      }
      return { ...current, status: "printed" };
    case "requeue":
      if (current.status !== "failed" || current.paymentStatus !== "paid") {
        throw new Error("Only a paid order with a previous fulfillment issue can be returned to the manual queue.");
      }
      return { ...current, status: "queued" };
    case "reject":
      if (current.status !== "awaiting_payment" && current.status !== "awaiting_cash" && current.status !== "needs_approval") {
        throw new Error("This order can no longer be rejected.");
      }
      return { ...current, status: "rejected" };
    case "cancel":
      if (!["awaiting_payment", "awaiting_cash", "needs_approval", "queued", "printing", "failed"].includes(current.status)) {
        throw new Error("This order can no longer be cancelled.");
      }
      return { ...current, status: "cancelled" };
  }
}
