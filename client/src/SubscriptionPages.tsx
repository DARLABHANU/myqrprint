import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Crown,
  RefreshCw,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { subscriptionPricing } from "@printly/contracts";

type SubscriptionPlanId = "demo" | "starter";
type BillingCycle = "monthly" | "annual";

type PlanConfig = {
  id: SubscriptionPlanId;
  name: string;
  badge?: string;
  monthlyPricePaise: number;
  annualPricePaise: number;
  orderLimit: number;
  description: string;
  popular?: boolean;
  features: string[];
};

type SubscriptionState = {
  plan: SubscriptionPlanId;
  planName: string;
  startedAt: string;
  expiresAt: string;
  isExpired: boolean;
  daysRemaining: number;
  orderLimit: number;
  ordersUsed: number;
  ordersRemaining: number;
  usagePercentage: number;
};

type LegacySubscriptionRequestItem = {
  _id: string;
  plan: SubscriptionPlanId;
  billingCycle: BillingCycle;
  amountPaise: number;
  utr: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  createdAt: string;
  shopId?: { displayName?: string; slug?: string; city?: string };
  ownerId?: { ownerName?: string; email?: string; mobile?: string };
};

type RazorpayCheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (result: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayCheckoutInstance = { open: () => void; on: (event: string, callback: (detail: { error?: { description?: string } }) => void) => void };
type RazorpayCheckoutConstructor = new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
declare global { interface Window { Razorpay?: RazorpayCheckoutConstructor } }

async function loadSubscriptionCheckout() {
  if (!window.Razorpay) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Razorpay checkout could not load."));
      document.head.appendChild(script);
    });
  }
  if (!window.Razorpay) throw new Error("Razorpay checkout is not available in this browser.");
  return window.Razorpay;
}

type SubscriptionPaymentItem = {
  _id: string;
  billingCycle: BillingCycle;
  amountPaise: number;
  status: "pending" | "activating" | "paid" | "failed";
  paymentMode: "test" | "live";
  razorpayPaymentId?: string;
  createdAt: string;
  expiresAt?: string;
};

const formatRupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

const subscriptionPlans: Record<SubscriptionPlanId, PlanConfig> = {
  demo: {
    id: "demo",
    name: "Free Trial",
    monthlyPricePaise: 0,
    annualPricePaise: 0,
    orderLimit: 50,
    description: "7-day trial for up to 50 print orders",
    features: ["Up to 50 print orders", "7 days validity"],
  },
  starter: {
    id: "starter",
    name: "UrQrPrint Subscription",
    ...subscriptionPricing.starter,
    orderLimit: 0,
    description: "Full access for the selected billing period",
    features: [
      "Unlimited customer print orders",
      "Printer routing and auto-print controls",
      "Shop dashboard, reports, and QR page",
      "Secure Razorpay checkout",
      "Manual renewal; no automatic charge",
    ],
  },
};

export function SubscriptionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [subscriptionPayments, setSubscriptionPayments] = useState<SubscriptionPaymentItem[]>([]);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [submitting, setSubmitting] = useState(false);
  const paidPlanActive = Boolean(subscription && subscription.plan !== "demo" && !subscription.isExpired);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/shops/subscription", { credentials: "same-origin" });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok) throw new Error("Could not load subscription details.");
      const data = await response.json();
      setSubscription(data.subscription);
      setSubscriptionPayments(data.subscriptionPayments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscription.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function startSubscriptionCheckout(cycle: BillingCycle = billingCycle) {
    const expectedAmountPaise = cycle === "annual"
      ? subscriptionPlans.starter.annualPricePaise
      : subscriptionPlans.starter.monthlyPricePaise;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/shops/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ billingCycle: cycle }),
      });
      const data = await response.json().catch(() => ({} as { error?: string; checkout?: { amount?: number; currency?: string; orderId?: string } }));
      if (!response.ok) throw new Error(data.error || "Could not start subscription checkout.");
      if (!data.checkout?.orderId || !data.checkout.keyId || data.checkout.currency !== "INR" || data.checkout.amount !== expectedAmountPaise) {
        throw new Error("Subscription pricing has not updated on the payment server yet. Checkout was stopped to prevent charging the wrong amount.");
      }
      const Razorpay = await loadSubscriptionCheckout();
      const pollForPayment = () => {
        const startedAt = Date.now();
        const poll = async () => {
          if (Date.now() - startedAt > 2 * 60 * 1000) return;
          try {
            const statusResponse = await fetch(`/api/shops/subscription/payments/${encodeURIComponent(data.checkout.orderId)}`, { credentials: "same-origin" });
            if (statusResponse.ok) {
              const status = await statusResponse.json();
              if (status.status === "paid") {
                setSuccess(`Payment confirmed. Your plan is active until ${status.expiresAt ? new Date(status.expiresAt).toLocaleDateString("en-IN") : "the displayed expiry date"}.`);
                setSubmitting(false);
                await loadData();
                return;
              }
            }
          } catch { /* Retry status check while webhook delivery completes. */ }
          if (Date.now() - startedAt < 2 * 60 * 1000) window.setTimeout(() => void poll(), 3000);
        };
        window.setTimeout(() => void poll(), 3000);
      };
      const checkout = new Razorpay({
        key: data.checkout.keyId,
        order_id: data.checkout.orderId,
        amount: data.checkout.amount,
        currency: data.checkout.currency,
        name: data.checkout.name,
        description: data.checkout.description,
        prefill: data.checkout.prefill,
        theme: { color: "#079d72" },
        handler: (result) => { void (async () => {
          try {
            const verifyResponse = await fetch("/api/shops/subscription/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify(result),
            });
            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok) throw new Error(verifyData.error || "Payment verification is pending.");
            setSuccess(`Payment confirmed. Your plan is active until ${verifyData.expiresAt ? new Date(verifyData.expiresAt).toLocaleDateString("en-IN") : "the displayed expiry date"}.`);
            await loadData();
          } catch (verifyError) {
            setError(verifyError instanceof Error ? verifyError.message : "Could not verify subscription payment.");
          } finally {
            setSubmitting(false);
          }
        })(); },
        modal: { ondismiss: () => { setSubmitting(false); pollForPayment(); } },
      });
      checkout.on("payment.failed", (detail) => {
        setError(detail.error?.description || "Subscription payment failed. No plan change was made.");
        setSubmitting(false);
      });
      checkout.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
      setSubmitting(false);
    } finally {
      // Keep the submit state while the hosted checkout is open.
    }
  }

  return (
    <div className="workspace-page">
      <main className="settings-main" style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 60px" }}>
        <header className="support-page-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1>Shop Subscription & Plans</h1>
            <p>Start with 7 days and 50 print orders, then choose monthly or annual access.</p>
          </div>
          <button
            type="button"
            className="button button-dark"
            onClick={() => void startSubscriptionCheckout()}
            style={{ padding: "10px 18px", gap: 8, fontSize: 13 }}
          >
            <Crown size={16} /> {paidPlanActive ? "Renew / extend plan" : "Choose a paid plan"}
          </button>
        </header>

        {error && <div className="form-alert" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
        {success && <div className="success-alert" role="status" style={{ marginBottom: 16 }}><CheckCircle2 size={16} /> {success}</div>}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
            <RefreshCw size={24} className="spin" style={{ margin: "0 auto 12px" }} />
            <p>Loading subscription details...</p>
          </div>
        ) : (
          <>
            {/* Current Plan Card */}
            {subscription && (
              <section
                className="settings-card"
                style={{
                  padding: 24,
                  borderRadius: 14,
                  border: "1px solid #e2e8ef",
                  background: "#fff",
                  marginBottom: 24,
                  boxShadow: "0 4px 14px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                          background: subscription.plan === "demo" ? "#f1f5f9" : "#e8f8f1",
                          color: subscription.plan === "demo" ? "#475569" : "#078c68",
                        }}
                      >
                        {subscription.planName}
                      </span>
                      {subscription.isExpired ? (
                        <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#fee2e2", color: "#b91c1c" }}>
                          Expired
                        </span>
                      ) : (
                        <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#e0f2fe", color: "#0369a1" }}>
                          Active ({subscription.daysRemaining} days left)
                        </span>
                      )}
                    </div>
                    <h2 style={{ margin: "6px 0 4px", fontSize: 24, fontWeight: 800, fontFamily: "Manrope, sans-serif" }}>
                      Current Plan: {subscription.planName}
                    </h2>
                    <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                      {subscription.isExpired
                        ? `Your plan expired on ${new Date(subscription.expiresAt).toLocaleDateString("en-IN")}. Please upgrade or renew to keep receiving customer orders.`
                        : `Valid until ${new Date(subscription.expiresAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}.`}
                    </p>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Order Capacity Used</div>
                    <b style={{ fontSize: 22, fontFamily: "Manrope, sans-serif", color: "#1e293b" }}>
                      {subscription.ordersUsed} <span style={{ fontSize: 14, color: "#94a3b8" }}>/ {subscription.orderLimit <= 0 || subscription.orderLimit >= 100000 ? "Unlimited" : subscription.orderLimit}</span>
                    </b>
                  </div>
                </div>

                {subscription.orderLimit > 0 && <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                    <span>Monthly Quota Usage</span>
                    <span>{subscription.usagePercentage}% used ({subscription.ordersRemaining} orders remaining)</span>
                  </div>
                  <div style={{ width: "100%", height: 10, background: "#f1f5f9", borderRadius: 5, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${subscription.usagePercentage}%`,
                        background: subscription.usagePercentage > 90 ? "#ef4444" : subscription.usagePercentage > 75 ? "#f59e0b" : "#10b981",
                        borderRadius: 5,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>}

                {subscription.isExpired && (
                  <div
                    style={{
                      marginTop: 18,
                      padding: "12px 16px",
                      borderRadius: 8,
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      color: "#991b1b",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <AlertTriangle size={16} />
                    <span>Customer orders are currently paused for your shop because your plan expired. Select a plan below to reactivate.</span>
                  </div>
                )}
              </section>
            )}

            {/* Plan Tiers Grid */}
            <section style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 750, fontFamily: "Manrope, sans-serif" }}>Choose your subscription</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>Choose one month for ₹50 or 12 months for ₹500.</p>
                </div>

                {/* Monthly / Annual Toggle */}
              <div style={{ display: "inline-flex", background: "#f1f5f9", padding: 3, borderRadius: 10, border: "1px solid #e2e8ef" }}>
                  <button
                    type="button"
                    onClick={() => setBillingCycle("monthly")}
                    style={{
                      border: 0,
                      background: billingCycle === "monthly" ? "#fff" : "transparent",
                      color: billingCycle === "monthly" ? "#0f172a" : "#64748b",
                      fontWeight: billingCycle === "monthly" ? 700 : 500,
                      padding: "6px 14px",
                      borderRadius: 7,
                      fontSize: 12,
                      cursor: "pointer",
                      boxShadow: billingCycle === "monthly" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle("annual")}
                    style={{
                      border: 0,
                      background: billingCycle === "annual" ? "#fff" : "transparent",
                      color: billingCycle === "annual" ? "#0f172a" : "#64748b",
                      fontWeight: billingCycle === "annual" ? 700 : 500,
                      padding: "6px 14px",
                      borderRadius: 7,
                      fontSize: 12,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: billingCycle === "annual" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    <span>12 months</span>
                    <span style={{ fontSize: 10, fontWeight: 700, background: "#dcfce7", color: "#15803d", padding: "1px 6px", borderRadius: 4 }}>
                      Save ₹100
                    </span>
                  </button>
                </div>
              </div>

              {(
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                  {(["starter"] as const).map((planKey) => {
                    const plan = subscriptionPlans[planKey];
                    const pricePaise = billingCycle === "annual" ? plan.annualPricePaise : plan.monthlyPricePaise;
                    const isCurrent = subscription?.plan === planKey && !subscription?.isExpired;
                    return (
                      <article
                        key={planKey}
                        style={{
                          position: "relative",
                          padding: "24px 20px 20px",
                          borderRadius: 14,
                          background: "#fff",
                          border: plan.popular ? "2px solid #0aa579" : "1px solid #e2e8ef",
                          boxShadow: plan.popular ? "0 8px 24px rgba(10,165,121,0.09)" : "0 2px 8px rgba(0,0,0,0.02)",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, fontFamily: "Manrope, sans-serif" }}>UrQrPrint subscription</h3>
                        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b", minHeight: 32 }}>Full access to your shop for the selected billing period.</p>

                        <div style={{ marginBottom: 16 }}>
                          <span style={{ fontSize: 28, fontWeight: 800, fontFamily: "Manrope, sans-serif", color: "#078c68" }}>
                            {formatRupees(pricePaise)}
                          </span>
                          <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>
                            {billingCycle === "annual" ? "/ 12 months" : "/ 1 month"}
                          </span>
                          {billingCycle === "annual" && <div style={{ fontSize: 11, color: "#15803d", marginTop: 4 }}>Save ₹100 compared with paying monthly</div>}
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                            Unlimited customer print orders while active
                          </div>
                        </div>

                        <ul style={{ margin: "0 0 24px", padding: 0, listStyle: "none", display: "grid", gap: 10, fontSize: 12, color: "#475569", flex: 1 }}>
                          {plan.features.map((feature) => (
                            <li key={feature} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                              <Check size={15} style={{ color: "#079d72", flexShrink: 0, marginTop: 2 }} />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>

                        <button
                          type="button"
                          className={`button ${plan.popular ? "button-dark" : ""}`}
                          disabled={submitting}
                          onClick={() => void startSubscriptionCheckout(billingCycle)}
                          style={{
                            width: "100%",
                            padding: "11px 0",
                            fontSize: 13,
                            fontWeight: 700,
                            border: plan.popular ? "none" : "1px solid #cbd5e1",
                            background: plan.popular ? "#0aa579" : isCurrent ? "#f8fafc" : "#fff",
                            color: plan.popular ? "#fff" : isCurrent ? "#64748b" : "#1e293b",
                            cursor: "pointer",
                          }}
                        >
                          {submitting
                            ? "Opening Razorpay…"
                            : isCurrent
                              ? `Extend ${billingCycle === "annual" ? "12-month" : "monthly"} plan`
                              : `Choose ${billingCycle === "annual" ? "12-month" : "monthly"} plan`}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="settings-card" style={{ marginTop: 18, padding: 0, borderRadius: 14, overflow: "hidden", border: "1px solid #e2e8ef", background: "#fff" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, fontFamily: "Manrope, sans-serif" }}>Razorpay subscription payments</h3>
                <p style={{ margin: "3px 0 0", fontSize: 11, color: "#64748b" }}>Confirmed payments and selected plan terms.</p>
              </div>
              {subscriptionPayments.length === 0 ? (
                <div style={{ padding: "25px 20px", textAlign: "center", color: "#94a3b8", fontSize: 12 }}>No Razorpay subscription payments yet.</div>
              ) : subscriptionPayments.map((payment) => (
                <div key={payment._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "13px 20px", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}>
                  <div><b>{payment.billingCycle === "annual" ? "12-month plan" : "Monthly plan"}</b><div style={{ color: "#64748b", marginTop: 3 }}>{new Date(payment.createdAt).toLocaleDateString("en-IN")} · {payment.paymentMode === "live" ? "Live payment" : "Test payment"}</div></div>
                  <b>{formatRupees(payment.amountPaise)}</b>
                  <span style={{ color: payment.status === "paid" ? "#15803d" : payment.status === "failed" ? "#b91c1c" : "#b45309", fontWeight: 700 }}>{payment.status === "paid" ? `Active until ${payment.expiresAt ? new Date(payment.expiresAt).toLocaleDateString("en-IN") : "confirmed"}` : payment.status === "failed" ? "Payment failed · no plan change" : payment.status === "activating" ? "Confirming payment…" : "Payment pending"}</span>
                </div>
              ))}
            </section>
          </>
        )}

      </main>
    </div>
  );
}

export function AdminSubscriptionReviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState<LegacySubscriptionRequestItem[]>([]);
  const [recent, setRecent] = useState<LegacySubscriptionRequestItem[]>([]);
  const [stats, setStats] = useState({
    pendingCount: 0,
    totalShops: 0,
    activePaidCount: 0,
    totalRevenuePaise: 0,
  });
  const [allShops, setAllShops] = useState<Array<{ slug: string; displayName: string; subscriptionPlan: string }>>([]);

  // Manual Override Modal
  const [overrideModal, setOverrideModal] = useState(false);
  const [overrideSlug, setOverrideSlug] = useState("");
  const [overridePlan, setOverridePlan] = useState<SubscriptionPlanId>("starter");
  const [overrideDays, setOverrideDays] = useState(30);

  async function loadAdminData() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/subscriptions", { credentials: "same-origin" });
      if (response.status === 401 || response.status === 403) {
        setError("Admin access required. Please sign in with an authorized admin account (e.g. daarlabhanumurthy@gmail.com).");
        setLoading(false);
        return;
      }
      if (!response.ok) throw new Error("Could not load admin subscriptions data.");
      const data = await response.json();
      setPending(data.pending ?? []);
      setRecent(data.recent ?? []);
      setStats(data.stats);
      setAllShops(data.allShops ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdminData();
  }, []);

  async function handleApprove(id: string) {
    if (!window.confirm("Approve this subscription payment and immediately activate the plan for this shop?")) return;
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/subscriptions/${id}/approve`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Approval failed.");
      setSuccess(data.message || "Subscription approved and activated.");
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
    }
  }

  async function handleReject(id: string) {
    const reason = window.prompt("Enter rejection reason for this request (e.g. UTR not found in bank records):", "UTR not received in bank account");
    if (!reason) return;
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/subscriptions/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Rejection failed.");
      setSuccess("Subscription request rejected.");
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejection failed.");
    }
  }

  async function handleOverrideSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!overrideSlug) {
      setError("Please choose a shop.");
      return;
    }
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/subscriptions/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          shopSlug: overrideSlug,
          plan: overridePlan,
          durationDays: overrideDays,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Manual override failed.");
      setSuccess(data.message || "Shop subscription updated.");
      setOverrideModal(false);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override failed.");
    }
  }

  return (
    <div className="workspace-page" style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 80px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 750, color: "#078c68", background: "#dcfce7", padding: "2px 8px", borderRadius: 4, letterSpacing: 0.8 }}>
                PLATFORM ADMIN
              </span>
              <a href="/dashboard" style={{ fontSize: 11, color: "#64748b", textDecoration: "none" }}>← Back to Shop Dashboard</a>
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, fontFamily: "Manrope, sans-serif", color: "#0f172a" }}>
              Subscription Review & Verification
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Review shopkeeper UTR submissions, approve active plans, and manage platform quotas.
            </p>
          </div>

          <button
            type="button"
            className="button button-dark"
            onClick={() => setOverrideModal(true)}
            style={{ padding: "9px 16px", gap: 8, fontSize: 12 }}
          >
            <Zap size={15} /> Manual Shop Override
          </button>
        </header>

        {error && <div className="form-alert" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
        {success && <div className="success-alert" role="status" style={{ marginBottom: 16 }}><CheckCircle2 size={16} /> {success}</div>}

        {/* Stats KPIs */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 28 }}>
          <article style={{ padding: 20, borderRadius: 12, background: "#fff", border: "1px solid #e2e8ef" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: 12 }}>
              <span>Pending Review</span>
              <Clock3 size={18} style={{ color: stats.pendingCount > 0 ? "#f59e0b" : "#94a3b8" }} />
            </div>
            <b style={{ display: "block", fontSize: 28, fontWeight: 800, fontFamily: "Manrope, sans-serif", color: stats.pendingCount > 0 ? "#d97706" : "#0f172a", marginTop: 8 }}>
              {stats.pendingCount}
            </b>
          </article>

          <article style={{ padding: 20, borderRadius: 12, background: "#fff", border: "1px solid #e2e8ef" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: 12 }}>
              <span>Active Paid Shops</span>
              <Crown size={18} style={{ color: "#0aa579" }} />
            </div>
            <b style={{ display: "block", fontSize: 28, fontWeight: 800, fontFamily: "Manrope, sans-serif", color: "#0f172a", marginTop: 8 }}>
              {stats.activePaidCount}
            </b>
          </article>

          <article style={{ padding: 20, borderRadius: 12, background: "#fff", border: "1px solid #e2e8ef" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: 12 }}>
              <span>Total Subscription Revenue</span>
              <CreditCard size={18} style={{ color: "#0aa579" }} />
            </div>
            <b style={{ display: "block", fontSize: 28, fontWeight: 800, fontFamily: "Manrope, sans-serif", color: "#078c68", marginTop: 8 }}>
              {formatRupees(stats.totalRevenuePaise)}
            </b>
          </article>

          <article style={{ padding: 20, borderRadius: 12, background: "#fff", border: "1px solid #e2e8ef" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: 12 }}>
              <span>Registered Shops</span>
              <ShieldCheck size={18} style={{ color: "#64748b" }} />
            </div>
            <b style={{ display: "block", fontSize: 28, fontWeight: 800, fontFamily: "Manrope, sans-serif", color: "#0f172a", marginTop: 8 }}>
              {stats.totalShops}
            </b>
          </article>
        </section>

        {loading ? (
          <div style={{ padding: 50, textAlign: "center", color: "#64748b" }}>Loading admin requests...</div>
        ) : (
          <>
            {/* Pending Requests Table */}
            <section style={{ borderRadius: 14, overflow: "hidden", background: "#fff", border: "1px solid #e2e8ef", marginBottom: 32 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8ef", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, fontFamily: "Manrope, sans-serif" }}>
                    Pending Verification Requests ({pending.length})
                  </h2>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>Verify the 12-digit UTR in your UPI/Bank app, then approve or reject.</p>
                </div>
                <button type="button" onClick={loadAdminData} style={{ border: 0, background: "transparent", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                  <RefreshCw size={13} /> Refresh
                </button>
              </div>

              {pending.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  <CheckCircle2 size={32} style={{ color: "#10b981", margin: "0 auto 8px" }} />
                  <p>All subscription payments verified! No pending requests.</p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", color: "#64748b", borderBottom: "1px solid #e2e8ef" }}>
                        <th style={{ padding: "12px 18px", fontWeight: 600 }}>Shop & Owner</th>
                        <th style={{ padding: "12px 18px", fontWeight: 600 }}>Plan & Cycle</th>
                        <th style={{ padding: "12px 18px", fontWeight: 600 }}>Amount</th>
                        <th style={{ padding: "12px 18px", fontWeight: 600 }}>Submitted UTR</th>
                        <th style={{ padding: "12px 18px", fontWeight: 600 }}>Submitted</th>
                        <th style={{ padding: "12px 18px", fontWeight: 600, textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((req) => (
                        <tr key={req._id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "14px 18px" }}>
                            <b style={{ color: "#0f172a" }}>{req.shopId?.displayName ?? "Shop"}</b>
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                              {req.ownerId?.ownerName ?? "Owner"} · {req.ownerId?.email ?? ""} · {req.ownerId?.mobile ?? ""}
                            </div>
                            <small style={{ color: "#94a3b8" }}>/{req.shopId?.slug ?? ""}</small>
                          </td>
                          <td style={{ padding: "14px 18px" }}>
                            <span style={{ fontWeight: 700, color: "#0aa579", textTransform: "uppercase" }}>{req.plan}</span>
                            <div style={{ fontSize: 11, color: "#64748b", textTransform: "capitalize" }}>{req.billingCycle}</div>
                          </td>
                          <td style={{ padding: "14px 18px", fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
                            {formatRupees(req.amountPaise)}
                          </td>
                          <td style={{ padding: "14px 18px" }}>
                            <code style={{ fontSize: 13, fontWeight: 700, background: "#fef0c7", color: "#8a5806", padding: "3px 8px", borderRadius: 4 }}>
                              {req.utr}
                            </code>
                          </td>
                          <td style={{ padding: "14px 18px", color: "#64748b" }}>
                            {new Date(req.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            <div style={{ fontSize: 10 }}>{new Date(req.createdAt).toLocaleDateString("en-IN")}</div>
                          </td>
                          <td style={{ padding: "14px 18px", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => handleApprove(req._id)}
                                style={{
                                  border: "1px solid #10b981",
                                  background: "#10b981",
                                  color: "#fff",
                                  padding: "6px 14px",
                                  borderRadius: 6,
                                  fontWeight: 700,
                                  fontSize: 12,
                                  cursor: "pointer",
                                }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReject(req._id)}
                                style={{
                                  border: "1px solid #ef4444",
                                  background: "#fff",
                                  color: "#ef4444",
                                  padding: "6px 12px",
                                  borderRadius: 6,
                                  fontWeight: 600,
                                  fontSize: 12,
                                  cursor: "pointer",
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Recent History Table */}
            <section style={{ borderRadius: 14, overflow: "hidden", background: "#fff", border: "1px solid #e2e8ef" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8ef" }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, fontFamily: "Manrope, sans-serif" }}>
                  Recent Approvals & Decisions
                </h2>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", color: "#64748b", borderBottom: "1px solid #e2e8ef" }}>
                      <th style={{ padding: "10px 18px", fontWeight: 600 }}>Shop</th>
                      <th style={{ padding: "10px 18px", fontWeight: 600 }}>Plan</th>
                      <th style={{ padding: "10px 18px", fontWeight: 600 }}>Amount</th>
                      <th style={{ padding: "10px 18px", fontWeight: 600 }}>UTR</th>
                      <th style={{ padding: "10px 18px", fontWeight: 600 }}>Decision</th>
                      <th style={{ padding: "10px 18px", fontWeight: 600 }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((item) => (
                      <tr key={item._id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 18px" }}>
                          <b>{item.shopId?.displayName ?? "Shop"}</b>
                        </td>
                        <td style={{ padding: "10px 18px", textTransform: "capitalize" }}>{item.plan} ({item.billingCycle})</td>
                        <td style={{ padding: "10px 18px", fontWeight: 600 }}>{formatRupees(item.amountPaise)}</td>
                        <td style={{ padding: "10px 18px" }}>
                          <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 3 }}>{item.utr}</code>
                        </td>
                        <td style={{ padding: "10px 18px" }}>
                          {item.status === "approved" ? (
                            <span style={{ color: "#16a34a", fontWeight: 600 }}>Approved</span>
                          ) : (
                            <span style={{ color: "#dc2626", fontWeight: 600 }}>Rejected {item.rejectionReason && `(${item.rejectionReason})`}</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 18px", color: "#64748b" }}>
                          {new Date(item.createdAt).toLocaleDateString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* Manual Override Modal */}
        {overrideModal && (
          <div className="subscription-modal-backdrop" role="presentation" onClick={() => setOverrideModal(false)}>
            <div
              className="subscription-plan-dialog"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
              style={{ maxWidth: 500 }}
            >
              <header>
                <div>
                  <h2>Manual Shop Subscription Override</h2>
                  <p>Directly adjust or extend any registered shop's plan and expiry date.</p>
                </div>
                <button type="button" className="subscription-modal-close" onClick={() => setOverrideModal(false)}>
                  <X size={18} />
                </button>
              </header>

              <form onSubmit={handleOverrideSubmit} style={{ padding: 20 }}>
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="shopSlugSelect" style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Select Shop</label>
                  <select
                    id="shopSlugSelect"
                    value={overrideSlug}
                    onChange={(e) => setOverrideSlug(e.target.value)}
                    required
                    style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 7, border: "1px solid #cbd5e1" }}
                  >
                    <option value="">-- Choose Shop --</option>
                    {allShops.map((shop) => (
                      <option key={shop.slug} value={shop.slug}>
                        {shop.displayName} (/{shop.slug}) - Currently: {shop.subscriptionPlan}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="overridePlanSelect" style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Target Plan</label>
                  <select
                    id="overridePlanSelect"
                    value={overridePlan}
                    onChange={(e) => setOverridePlan(e.target.value as SubscriptionPlanId)}
                    style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 7, border: "1px solid #cbd5e1" }}
                  >
                    <option value="demo">Demo / Free Trial</option>
                    <option value="starter">UrQrPrint (Unlimited)</option>
                  </select>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label htmlFor="overrideDurationSelect" style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Duration (Days from Now)</label>
                  <select
                    id="overrideDurationSelect"
                    value={overrideDays}
                    onChange={(e) => setOverrideDays(Number(e.target.value))}
                    style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 7, border: "1px solid #cbd5e1" }}
                  >
                    <option value={7}>7 Days (Trial)</option>
                    <option value={30}>30 Days (1 Month)</option>
                    <option value={90}>90 Days (3 Months)</option>
                    <option value={180}>180 Days (6 Months)</option>
                    <option value={365}>365 Days (1 Year)</option>
                  </select>
                </div>

                <button type="submit" className="button button-dark" style={{ width: "100%", height: 40, fontSize: 13 }}>
                  Apply Override Immediately
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
