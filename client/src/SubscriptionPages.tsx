import { useEffect, useState } from "react";
import { Check, LoaderCircle, QrCode, RefreshCw, Zap, Clock3 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type SubscriptionInfo = { plan: string; startedAt: string; expiresAt: string; orderLimit: number; ordersUsed: number; expired: boolean };
type PlanKey = "starter" | "pro" | "premium";
type Plan = { name: string; amountPaise: number; orderLimit: number };
type SubscriptionHistory = { plan: string; startedAt: string; expiresAt?: string; orderLimit: number; ordersUsed: number; amountPaise: number; status: string; isCurrent: boolean };
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
  const [history, setHistory] = useState<SubscriptionHistory[]>([]);
  const [selected, setSelected] = useState<PlanKey>("starter");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    try {
      const data = await api<{ subscription: SubscriptionInfo; plans: Record<PlanKey, Plan>; platformUpiId: string; pendingRequest: { plan: PlanKey; status: string } | null; history?: SubscriptionHistory[] }>("/api/shops/subscription");
      setSubscription(data.subscription); setPlans(data.plans); setUpiId(data.platformUpiId); setPending(data.pendingRequest); setHistory(data.history ?? []);
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
  const dayMs = 86_400_000; const now = Date.now(); const start = new Date(subscription.startedAt).getTime(); const expiry = new Date(subscription.expiresAt).getTime(); const totalDays = Math.max(1, Math.ceil((expiry - start) / dayMs)); const daysLeft = Math.max(0, Math.ceil((expiry - now) / dayMs)); const ordersLeft = Math.max(0, subscription.orderLimit - subscription.ordersUsed); const usagePercent = Math.min(100, subscription.ordersUsed / Math.max(1, subscription.orderLimit) * 100); const dayPercent = Math.min(100, (totalDays - daysLeft) / totalDays * 100);
  const features = ["Your own shop QR code — customers order from their phone, no app", "PDFs and photos — up to 10 files per order", "Page range, copies, B&W / colour, single / both sides", "Your own rates for A4, Legal, A3 and A5 paper", "Photo layouts — 1, 2, 4, 6 or 9 photos per page", "Bulk discounts on big orders", "UPI payment and pay at counter", "Auto print with the desktop app — several printers, automatic routing", "Live new-order pop-up and sound alert", "Accept, reject, edit and retry orders", "Customer files deleted after printing", "Dashboard, reports and payment records"];
  return <div className="workspace-page"><main className="settings-main subscription-page-main"><header className="subscription-heading"><div><h1>My subscription</h1><p>Your plan, upgrades and invoices.</p></div><button type="button" onClick={() => { setLoading(true); void load(); }}><RefreshCw size={14}/> Refresh</button></header>
    {error && <div className="form-alert" role="alert">{error}</div>}{notice && <div className="success-alert" role="status"><Check size={15} />{notice}</div>}
    <section className="subscription-current"><small>Current plan</small><h2>{subscription.plan === "demo" ? "Free Demo" : subscription.plan.toUpperCase()}</h2><p>{subscription.plan === "demo" ? "Free · 7 days · 50 print orders" : `${subscription.orderLimit.toLocaleString()} print orders · 1 year`}</p><span>Every feature included</span><div className="subscription-time-left"><Clock3 size={14}/>{daysLeft} days left · ends {new Date(subscription.expiresAt).toLocaleDateString()}</div><button type="button" onClick={() => document.getElementById("subscription-plans")?.scrollIntoView({behavior:"smooth"})}><Zap size={15}/> Upgrade</button></section>
    <section className="settings-card subscription-usage"><header><h2>Usage</h2><p>Started {new Date(subscription.startedAt).toLocaleDateString()} · ends {new Date(subscription.expiresAt).toLocaleDateString()}</p></header><div className="usage-summary"><article><small>Days left</small><b>{daysLeft}</b><span>of {totalDays} days</span></article><article><small>Print orders left</small><b>{ordersLeft}</b><span>of {subscription.orderLimit}</span></article></div><div className="usage-meter"><div><span>Print orders</span><b>{subscription.ordersUsed} of {subscription.orderLimit} used</b></div><i><span style={{width:`${usagePercent}%`}}/></i><small>{ordersLeft} print orders left</small></div><div className="usage-meter"><div><span>Days</span><b>{Math.max(0,totalDays-daysLeft)} of {totalDays} used</b></div><i><span style={{width:`${dayPercent}%`}}/></i><small>{daysLeft} days left — plan ends on {new Date(subscription.expiresAt).toLocaleDateString()} or when print orders run out, whichever comes first</small></div>{subscription.expired && <p className="form-alert">This plan has expired or reached its order limit. New customer orders are paused.</p>}</section>
    <section className="settings-card subscription-features"><header><div><h2>What’s included</h2><p>Every plan has every feature</p></div></header><ul>{features.map(feature=><li key={feature}><Check size={15}/>{feature}</li>)}</ul></section>
    <section className="settings-card subscription-history"><header><div><h2>Plan history</h2><p>Every plan you have had</p></div></header>{history.length ? <div className="subscription-table-wrap"><table><thead><tr><th>Plan</th><th>Started</th><th>Ends</th><th>Print orders</th><th>Paid</th><th>Status</th></tr></thead><tbody>{history.map((item,index)=><tr key={`${item.plan}-${item.startedAt}-${index}`}><td>{item.plan === "demo"?"Free Demo":item.plan.toUpperCase()}</td><td>{new Date(item.startedAt).toLocaleDateString()}</td><td>{item.expiresAt?new Date(item.expiresAt).toLocaleDateString():"—"}</td><td>{item.ordersUsed} / {item.orderLimit}</td><td>{item.amountPaise ? `₹${(item.amountPaise/100).toFixed(0)}` : "Free"}</td><td><span className={`subscription-status ${item.status}`}>{item.status}</span></td></tr>)}</tbody></table></div>:<p>No plan history yet.</p>}</section>
    <section className="settings-card subscription-invoices"><header><div><h2>Invoices</h2><p>Plan purchases</p></div></header><p>No invoices yet — plan purchases show up here.</p></section>
    <section id="subscription-plans" className="settings-card subscription-plan-picker"><h2>Upgrade your plan</h2><p>Pay by UPI and send the reference for manual verification.</p><div className="subscription-plan-cards">{(Object.keys(plans) as PlanKey[]).map(key=><button type="button" key={key} className={selected===key?"selected":""} onClick={()=>setSelected(key)}><small>{plans[key].name}</small><b>₹{(plans[key].amountPaise/100).toFixed(0)}</b><span>{plans[key].orderLimit.toLocaleString()} orders · 1 year</span></button>)}</div>{upiId ? <><div className="upi-id-card"><span>PRINTLY UPI</span><b>{upiId}</b><span>Amount: ₹{(chosen.amountPaise/100).toFixed(2)}</span></div><div className="customer-upi-qr"><QRCodeSVG value={paymentUrl} size={176} includeMargin/><a className="button button-dark" href={paymentUrl}>Open UPI app</a></div><label>UPI transaction reference<input required minLength={6} maxLength={80} value={reference} onChange={event=>setReference(event.target.value)}/></label><button className="button button-dark" type="button" disabled={busy||Boolean(pending)} onClick={()=>void submitRequest()}>{busy?"Sending…":pending?"Payment awaiting review":"Submit payment for review"}</button><small>Do not submit until you have paid the displayed amount to the Printly UPI ID.</small></>:<p>Subscription checkout is not configured. Set PLATFORM_UPI_ID to enable plan requests.</p>}</section>
  </main></div>;
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
