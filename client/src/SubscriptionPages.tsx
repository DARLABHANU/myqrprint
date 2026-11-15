import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Crown,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type SubscriptionPlanId = "demo" | "starter" | "pro" | "premium";
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

type SubscriptionRequestItem = {
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

const formatRupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

export function SubscriptionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [pendingRequest, setPendingRequest] = useState<SubscriptionRequestItem | null>(null);
  const [history, setHistory] = useState<SubscriptionRequestItem[]>([]);
  const [plans, setPlans] = useState<Record<SubscriptionPlanId, PlanConfig> | null>(null);
  const [platformPayment, setPlatformPayment] = useState<{ upiId: string; accountName: string }>({
    upiId: "daarlabhanumurthy@okaxis",
    accountName: "UrQrPrint Platform",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<SubscriptionPlanId>("pro");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [utrInput, setUtrInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

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
      setPendingRequest(data.pendingRequest);
      setHistory(data.history ?? []);
      setPlans(data.availablePlans);
      if (data.platformPayment) setPlatformPayment(data.platformPayment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscription.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const selectedPlan = useMemo(() => {
    if (!plans) return null;
    return plans[selectedPlanId] ?? plans.pro;
  }, [plans, selectedPlanId]);

  const payableAmountPaise = useMemo(() => {
    if (!selectedPlan) return 0;
    return billingCycle === "annual" ? selectedPlan.annualPricePaise : selectedPlan.monthlyPricePaise;
  }, [selectedPlan, billingCycle]);

  const upiIntentUri = useMemo(() => {
    const amount = (payableAmountPaise / 100).toFixed(2);
    const pa = encodeURIComponent(platformPayment.upiId);
    const pn = encodeURIComponent(platformPayment.accountName);
    const tn = encodeURIComponent(`UrQrPrint ${selectedPlan?.name ?? ""} Plan`);
    return `upi://pay?pa=${pa}&pn=${pn}&am=${amount}&cu=INR&tn=${tn}`;
  }, [platformPayment, payableAmountPaise, selectedPlan]);

  async function handleSubmitRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!utrInput.trim() || utrInput.trim().length < 6) {
      setError("Please enter a valid 12-digit UPI Reference / UTR Number from your payment receipt.");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/shops/subscription/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          plan: selectedPlanId,
          billingCycle,
          utr: utrInput.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to submit subscription request.");
      setSuccess("Subscription payment submitted! We will verify the UTR and activate your plan shortly.");
      setModalOpen(false);
      setUtrInput("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelRequest() {
    if (!window.confirm("Cancel this pending subscription verification request?")) return;
    try {
      const response = await fetch("/api/shops/subscription/cancel-request", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Could not cancel request.");
      setSuccess("Pending request cancelled.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel request.");
    }
  }

  function copyUpiId() {
    navigator.clipboard.writeText(platformPayment.upiId).then(() => {
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2500);
    }).catch(() => {});
  }

  return (
    <div className="workspace-page">
      <main className="settings-main" style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 60px" }}>
        <header className="support-page-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1>Shop Subscription & Plans</h1>
            <p>Manage your UrQrPrint plan, view order quotas, and upgrade your shop capacity.</p>
          </div>
          <button
            type="button"
            className="button button-dark"
            onClick={() => setModalOpen(true)}
            style={{ padding: "10px 18px", gap: 8, fontSize: 13 }}
          >
            <Crown size={16} /> Upgrade / Change Plan
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
            {/* Pending Request Alert */}
            {pendingRequest && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                  padding: "16px 20px",
                  borderRadius: 12,
                  background: "#fffbf0",
                  border: "1px solid #fce8b3",
                  color: "#8a5806",
                  marginBottom: 20,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Clock3 size={24} style={{ color: "#c67d0a", flexShrink: 0 }} />
                  <div>
                    <b style={{ fontSize: 14 }}>Subscription Verification Pending</b>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6e4708" }}>
                      We received your payment of <b>{formatRupees(pendingRequest.amountPaise)}</b> for the{" "}
                      <b>{pendingRequest.plan.toUpperCase()}</b> ({pendingRequest.billingCycle}) plan (UTR:{" "}
                      <code style={{ background: "#fef0c7", padding: "1px 6px", borderRadius: 4 }}>{pendingRequest.utr}</code>).
                      Admin review usually takes 15–30 minutes.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCancelRequest}
                  style={{
                    border: "1px solid #d99a25",
                    background: "#fff",
                    color: "#8a5806",
                    padding: "6px 14px",
                    borderRadius: 7,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Cancel Request
                </button>
              </div>
            )}

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
                      {subscription.ordersUsed} <span style={{ fontSize: 14, color: "#94a3b8" }}>/ {subscription.orderLimit >= 100000 ? "Unlimited" : subscription.orderLimit}</span>
                    </b>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: 20 }}>
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
                </div>

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
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 750, fontFamily: "Manrope, sans-serif" }}>Available Subscription Tiers</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>Choose the plan that fits your walk-in print volume.</p>
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
                    <span>Annual</span>
                    <span style={{ fontSize: 10, fontWeight: 700, background: "#dcfce7", color: "#15803d", padding: "1px 6px", borderRadius: 4 }}>
                      Save ~17%
                    </span>
                  </button>
                </div>
              </div>

              {plans && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                  {(["starter", "pro", "premium"] as const).map((planKey) => {
                    const plan = plans[planKey];
                    if (!plan) return null;
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
                        {plan.popular && (
                          <div
                            style={{
                              position: "absolute",
                              top: -11,
                              left: "50%",
                              transform: "translateX(-50%)",
                              background: "#0aa579",
                              color: "#fff",
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: 0.5,
                              textTransform: "uppercase",
                              padding: "2px 10px",
                              borderRadius: 20,
                            }}
                          >
                            Most Popular
                          </div>
                        )}
                        <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, fontFamily: "Manrope, sans-serif" }}>{plan.name}</h3>
                        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b", minHeight: 32 }}>{plan.description}</p>

                        <div style={{ marginBottom: 16 }}>
                          <span style={{ fontSize: 28, fontWeight: 800, fontFamily: "Manrope, sans-serif", color: "#078c68" }}>
                            {formatRupees(pricePaise)}
                          </span>
                          <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>
                            {billingCycle === "annual" ? "/ year" : "/ month"}
                          </span>
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                            <b>{plan.orderLimit >= 100000 ? "Unlimited" : plan.orderLimit.toLocaleString("en-IN")}</b> customer orders / mo
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
                          onClick={() => {
                            setSelectedPlanId(planKey);
                            setModalOpen(true);
                          }}
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
                          {isCurrent ? "Renew Current Plan" : `Select ${plan.name}`}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Request / Payment History Table */}
            <section className="settings-card" style={{ padding: 0, borderRadius: 14, overflow: "hidden", border: "1px solid #e2e8ef", background: "#fff" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, fontFamily: "Manrope, sans-serif" }}>Subscription History</h3>
                <p style={{ margin: "3px 0 0", fontSize: 11, color: "#64748b" }}>Past subscription upgrade requests and payment verification records.</p>
              </div>

              {history.length === 0 ? (
                <div style={{ padding: "30px 20px", textAlign: "center", color: "#94a3b8", fontSize: 12 }}>
                  No previous subscription payment requests on record.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", color: "#64748b", borderBottom: "1px solid #e2e8ef" }}>
                        <th style={{ padding: "10px 18px", fontWeight: 600 }}>Date</th>
                        <th style={{ padding: "10px 18px", fontWeight: 600 }}>Plan</th>
                        <th style={{ padding: "10px 18px", fontWeight: 600 }}>Cycle</th>
                        <th style={{ padding: "10px 18px", fontWeight: 600 }}>Amount</th>
                        <th style={{ padding: "10px 18px", fontWeight: 600 }}>UTR / Ref No.</th>
                        <th style={{ padding: "10px 18px", fontWeight: 600 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item) => (
                        <tr key={item._id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "12px 18px", color: "#64748b" }}>
                            {new Date(item.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td style={{ padding: "12px 18px", fontWeight: 600 }}>{item.plan.toUpperCase()}</td>
                          <td style={{ padding: "12px 18px", textTransform: "capitalize", color: "#64748b" }}>{item.billingCycle}</td>
                          <td style={{ padding: "12px 18px", fontWeight: 600 }}>{formatRupees(item.amountPaise)}</td>
                          <td style={{ padding: "12px 18px" }}>
                            <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{item.utr}</code>
                          </td>
                          <td style={{ padding: "12px 18px" }}>
                            {item.status === "approved" && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#15803d", fontWeight: 600, fontSize: 11 }}>
                                <CheckCircle2 size={13} /> Approved
                              </span>
                            )}
                            {item.status === "pending" && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#b45309", fontWeight: 600, fontSize: 11 }}>
                                <Clock3 size={13} /> Pending
                              </span>
                            )}
                            {item.status === "rejected" && (
                              <span
                                title={item.rejectionReason}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#b91c1c", fontWeight: 600, fontSize: 11 }}
                              >
                                <XCircle size={13} /> Rejected {item.rejectionReason && `(${item.rejectionReason})`}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* Payment & Checkout Modal */}
        {modalOpen && selectedPlan && (
          <div className="subscription-modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
            <div
              className="subscription-plan-dialog"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
              style={{ maxWidth: 840 }}
            >
              <header>
                <div>
                  <h2>Upgrade to {selectedPlan.name} Plan</h2>
                  <p>Complete payment using any UPI app and enter the UTR reference number below.</p>
                </div>
                <button type="button" className="subscription-modal-close" onClick={() => setModalOpen(false)}>
                  <X size={18} />
                </button>
              </header>

              <div className="subscription-plan-dialog-body" style={{ gridTemplateColumns: "1.1fr 0.9fr" }}>
                {/* Left: UPI QR Code & Instructions */}
                <div style={{ padding: 18, background: "#fff", borderRadius: 12, border: "1px solid #e2e8ef" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#64748b" }}>
                      Scan & Pay with UPI
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#078c68" }}>
                      {formatRupees(payableAmountPaise)}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", background: "#f8fafc", borderRadius: 10, border: "1px dashed #cbd5e1" }}>
                    <div style={{ padding: 10, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                      <QRCodeSVG value={upiIntentUri} size={168} level="M" />
                    </div>
                    <small style={{ marginTop: 10, fontSize: 11, color: "#64748b" }}>Scan with GPay, PhonePe, Paytm, or BHIM</small>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Platform UPI ID</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#f1f5f9", borderRadius: 7, border: "1px solid #e2e8ef" }}>
                      <code style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", flex: 1 }}>{platformPayment.upiId}</code>
                      <button
                        type="button"
                        onClick={copyUpiId}
                        style={{ border: 0, background: "transparent", color: "#078c68", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600 }}
                      >
                        <Copy size={13} /> {copiedUpi ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <small style={{ display: "block", marginTop: 4, fontSize: 10, color: "#94a3b8" }}>
                      Account Name: <b>{platformPayment.accountName}</b>
                    </small>
                  </div>
                </div>

                {/* Right: UTR Form */}
                <div className="subscription-checkout-panel" style={{ alignSelf: "stretch" }}>
                  <h3 style={{ fontSize: 16 }}>Confirm Your Payment</h3>
                  <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 16px" }}>
                    Once you transfer <b>{formatRupees(payableAmountPaise)}</b> via UPI, enter the 12-digit transaction UTR / Reference number from your banking or UPI app.
                  </p>

                  <form onSubmit={handleSubmitRequest}>
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                        Selected Tier & Billing Cycle
                      </label>
                      <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 7, border: "1px solid #e2e8ef", fontSize: 12 }}>
                        <b>{selectedPlan.name}</b> · {billingCycle === "annual" ? "Annual (365 days)" : "Monthly (30 days)"} · <b>{formatRupees(payableAmountPaise)}</b>
                      </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <label htmlFor="utrInput" style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                        UPI Reference / UTR Number <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        id="utrInput"
                        type="text"
                        required
                        placeholder="e.g. 412389123456"
                        value={utrInput}
                        onChange={(e) => setUtrInput(e.target.value)}
                        style={{
                          width: "100%",
                          height: 38,
                          padding: "0 10px",
                          borderRadius: 7,
                          border: "1px solid #cbd5e1",
                          fontSize: 13,
                          fontFamily: "monospace",
                        }}
                      />
                      <small style={{ display: "block", marginTop: 4, fontSize: 10, color: "#94a3b8" }}>
                        Found in your GPay / PhonePe payment receipt under "UPI transaction ID" or "UTR".
                      </small>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="button button-dark"
                      style={{ width: "100%", height: 40, fontSize: 13, gap: 8 }}
                    >
                      {submitting ? "Submitting..." : "Submit for Verification"} <ArrowRight size={15} />
                    </button>
                    <small style={{ display: "block", textAlign: "center", marginTop: 10, fontSize: 10, color: "#94a3b8" }}>
                      Admin verification takes 15–30 minutes during business hours.
                    </small>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export function AdminSubscriptionReviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState<SubscriptionRequestItem[]>([]);
  const [recent, setRecent] = useState<SubscriptionRequestItem[]>([]);
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
  const [overridePlan, setOverridePlan] = useState<SubscriptionPlanId>("pro");
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
                    <option value="starter">Starter (300 orders/mo)</option>
                    <option value="pro">Professional (1,500 orders/mo)</option>
                    <option value="premium">Enterprise (Unlimited)</option>
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
