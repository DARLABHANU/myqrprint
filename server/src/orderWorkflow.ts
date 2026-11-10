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
export type MerchantOrderAction = "confirm_payment" | "approve_order" | "start_printing" | "mark_printed" | "mark_failed" | "requeue" | "reject" | "cancel";

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
      return { ...current, status: "needs_approval", paymentStatus: "paid" };
    case "approve_order":
      if (current.status !== "needs_approval" || current.paymentStatus !== "paid") {
        throw new Error("Only a payment-confirmed order can be approved for printing.");
      }
      return { ...current, status: "queued" };
    case "start_printing":
      if (current.status !== "queued" || current.paymentStatus !== "paid") {
        throw new Error("Only paid orders in the queue can be started.");
      }
      return { ...current, status: "printing" };
    case "mark_printed":
      if (current.status !== "printing") {
        throw new Error("Only an order being printed can be marked ready.");
      }
      return { ...current, status: "printed" };
    case "mark_failed":
      if (current.status !== "printing") {
        throw new Error("Only an order being printed can be marked as failed.");
      }
      return { ...current, status: "failed" };
    case "requeue":
      if (current.status !== "failed" || current.paymentStatus !== "paid") {
        throw new Error("Only a paid failed order can be returned to the queue.");
      }
      return { ...current, status: "queued" };
    case "reject":
      if (current.status !== "awaiting_payment" && current.status !== "awaiting_cash" && current.status !== "needs_approval") {
        throw new Error("This order can no longer be rejected.");
      }
      return { ...current, status: "rejected" };
    case "cancel":
      if (!["awaiting_payment", "awaiting_cash", "needs_approval", "queued", "failed"].includes(current.status)) {
        throw new Error("This order can no longer be cancelled.");
      }
      return { ...current, status: "cancelled" };
  }
}
