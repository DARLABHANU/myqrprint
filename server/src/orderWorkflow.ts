export type OrderStatus =
  | "awaiting_payment"
  | "awaiting_cash"
  | "needs_approval"
  | "queued"
  | "printing"
  | "submitted"
  | "printed"
  | "failed"
  | "rejected"
  | "cancelled"
  | "expired";

export type PaymentStatus = "unverified" | "awaiting_cash" | "paid";
export type MerchantOrderAction = "confirm_payment" | "approve_order" | "reject" | "cancel";

export function statusForAgentPrintOutcome(outcome: "printed" | "submitted" | "failed"): OrderStatus {
  return outcome === "failed" ? "failed" : "printed";
}

export type OrderState = {
  status: OrderStatus;
  paymentMethod: "upi" | "cash" | "pay_here" | "razorpay";
  paymentStatus: PaymentStatus;
};

export function transitionMerchantOrder(
  current: OrderState,
  action: MerchantOrderAction,
  options: { autoPrint?: boolean } = {},
): OrderState {
  switch (action) {
    case "confirm_payment":
      if (current.status !== "awaiting_payment" && current.status !== "awaiting_cash") {
        throw new Error("Payment can only be confirmed for an order awaiting payment.");
      }
      return {
        ...current,
        status: ["upi", "razorpay"].includes(current.paymentMethod) && !options.autoPrint ? "needs_approval" : "queued",
        paymentStatus: "paid",
      };
    case "approve_order":
      if ((current.status !== "needs_approval" && current.status !== "queued") || current.paymentStatus !== "paid") {
        throw new Error("Only a payment-confirmed order can enter the print queue.");
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
