import { useEffect, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type SubscriptionInfo = { plan: string; startedAt: string; expiresAt: string; orderLimit: number; ordersUsed: number; expired: boolean };
type PlanKey = "starter" | "pro" | "premium";
type Plan = { name: string; amountPaise: number; orderLimit: number };
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (response.status === 401) { window.location.assign("/login"); throw new Error("Sign in required."); }
  const body = response.status === 204 ? undefined : await response.json() as { error?: string };
  if (!response.ok) throw new Error(body?.error ?? "Request failed.");
  return body as T;
}

export function SubscriptionPage() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [plans, setPlans] = useState<Record<PlanKey, Plan> | null>(null);
  const [upiId, setUpiId] = useState("");
  const [pending, setPending] = useState<{ plan: PlanKey; status: string } | null>(null);
  const [selected, setSelected] = useState<PlanKey>("starter");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    try {
      const data = await api<{ subscription: SubscriptionInfo; plans: Record<PlanKey, Plan>; platformUpiId: string; pendingRequest: { plan: PlanKey; status: string } | null }>("/api/shops/subscription");
      setSubscription(data.subscription); setPlans(data.plans); setUpiId(data.platformUpiId); setPending(data.pendingRequest);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load subscription."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function submitRequest() {
    setBusy(true); setError(""); setNotice("");
    try { await api("/api/shops/subscription/requests", { method: "POST", body: JSON.stringify({ plan: selected, paymentReference: reference }) }); setPending({ plan: selected, status: "pending" }); setNotice("Payment request sent. Your plan activates after manual verification."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send the request."); }
    finally { setBusy(false); }
  }
  if (loading || !subscription || !plans) return <div className="workspace-loading"><LoaderCircle className="spin" size={22} /> Loading subscription…</div>;
  const chosen = plans[selected];
  const paymentUrl = upiId ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=Printly&am=${(chosen.amountPaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Printly ${chosen.name} plan`)}` : "";
  return <div className="workspace-page"><header className="workspace-header"><a className="brand" href="/"><span className="brand-mark"><QrCode size={20} /></span><span>printly.</span></a><a className="back-link" href="/dashboard/settings"><ArrowLeft size={15} /> Shop settings</a></header><main className="settings-main"><div className="eyebrow"><span className="eyebrow-dot" /> SHOP MANAGEMENT</div><h1>Subscription</h1><p>Plan payments are sent to Printly by UPI and activated after manual verification.</p>{error && <div className="form-alert" role="alert">{error}</div>}{notice && <div className="success-alert" role="status"><Check size={15} />{notice}</div>}<section className="settings-card"><h2>Current plan: {subscription.plan.toUpperCase()}</h2><p>{subscription.ordersUsed} of {subscription.orderLimit} orders used · expires {new Date(subscription.expiresAt).toLocaleDateString()}</p>{subscription.expired && <p className="form-alert">This plan has expired or reached its order limit. New customer orders are paused.</p>}</section><section className="settings-card"><h2>Choose a yearly plan</h2><div className="order-filter-tabs">{(Object.keys(plans) as PlanKey[]).map((key) => <button type="button" key={key} className={selected === key ? "active" : ""} onClick={() => setSelected(key)}>{plans[key].name} · ₹{(plans[key].amountPaise / 100).toFixed(0)}</button>)}</div><p>{chosen.orderLimit.toLocaleString()} orders · 1 year · no auto-renewal</p>{upiId ? <><div className="upi-id-card"><span>PRINTLY UPI</span><b>{upiId}</b><span>Amount: ₹{(chosen.amountPaise / 100).toFixed(2)}</span></div><div className="customer-upi-qr"><QRCodeSVG value={paymentUrl} size={176} includeMargin /><a className="button button-dark" href={paymentUrl}>Open UPI app</a></div><label>UPI transaction reference<input required minLength={6} maxLength={80} value={reference} onChange={(event) => setReference(event.target.value)} /></label><button className="button button-dark" type="button" disabled={busy || Boolean(pending)} onClick={() => void submitRequest()}>{busy ? "Sending…" : pending ? "Payment awaiting review" : "Submit payment for review"}</button><small>Do not submit until you have paid the displayed amount to the Printly UPI ID.</small></> : <p>Subscription checkout is not configured. Set PLATFORM_UPI_ID to enable plan requests.</p>}</section></main></div>;
}

type AdminRequest = { _id: string; plan: PlanKey; amountPaise: number; paymentReference: string; createdAt: string; shopId: { displayName: string; slug: string } };
export function AdminSubscriptionReviewPage() {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void api<{ requests: AdminRequest[] }>("/api/admin/subscriptions").then((body) => setRequests(body.requests)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load review queue.")); }, []);
  async function review(item: AdminRequest, action: "approve" | "reject") {
    try { await api(`/api/admin/subscriptions/${item._id}`, { method: "PATCH", body: JSON.stringify({ action }) }); setRequests((current) => current.filter((request) => request._id !== item._id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not review request."); }
  }
  return <div className="workspace-page"><header className="workspace-header"><a className="brand" href="/"><QrCode size={20} /> printly.</a></header><main className="settings-main"><h1>Plan payment reviews</h1><p>Verify the payment reference in the platform UPI account before approving.</p>{error && <div className="form-alert" role="alert">{error}</div>}{requests.map((item) => <article className="merchant-order-card" key={item._id}><b>{item.shopId?.displayName ?? "Shop"} · {item.plan.toUpperCase()}</b><p>₹{(item.amountPaise / 100).toFixed(2)} · UTR {item.paymentReference}</p><small>{new Date(item.createdAt).toLocaleString()}</small><div className="merchant-order-actions"><button className="primary" type="button" onClick={() => void review(item, "approve")}>Approve</button><button className="danger" type="button" onClick={() => void review(item, "reject")}>Reject</button></div></article>)}{requests.length === 0 && !error && <p>No pending subscription requests.</p>}</main></div>;
}
