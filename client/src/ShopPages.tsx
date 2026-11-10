import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, CircleHelp, Clock3, CreditCard, Printer, QrCode, Settings2, ShieldCheck, Store } from "lucide-react";

type Order = { code: string; status: string; paymentStatus: string; paymentMethod: string; amountPaise: number; createdAt: string; files: Array<{ pageCount: number }> };
type Shop = { displayName: string; isOnline: boolean; slug: string };
type PrinterStatus = { _id: string; name: string; status: string; protocol: string };
const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export function ShopOverviewPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [shop, setShop] = useState<Shop | null>(null);
  const [printers, setPrinters] = useState<PrinterStatus[]>([]);
  const [error, setError] = useState("");
  const [onlineBusy, setOnlineBusy] = useState(false);
  useEffect(() => {
    void Promise.all([
      fetch("/api/shops/orders", { credentials: "same-origin" }),
      fetch("/api/shops/me", { credentials: "same-origin" }),
      fetch("/api/shops/printers", { credentials: "same-origin" }),
    ]).then(async ([ordersResponse, shopResponse, printerResponse]) => {
      if (ordersResponse.status === 401 || shopResponse.status === 401 || printerResponse.status === 401) { window.location.assign("/login"); return; }
      if (!ordersResponse.ok || !shopResponse.ok || !printerResponse.ok) throw new Error("Could not load your shop overview.");
      const [orderBody, shopBody, printerBody] = await Promise.all([ordersResponse.json() as Promise<{ orders: Order[] }>, shopResponse.json() as Promise<{ shop: Shop }>, printerResponse.json() as Promise<{ printers: PrinterStatus[] }>]);
      setOrders(orderBody.orders); setShop(shopBody.shop);
      setPrinters(printerBody.printers);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load overview."));
  }, []);
  const todayOrders = useMemo(() => orders.filter((order) => new Date(order.createdAt).toDateString() === new Date().toDateString()), [orders]);
  const pending = todayOrders.filter((order) => ["awaiting_payment", "awaiting_cash", "needs_approval", "queued", "failed"].includes(order.status));
  const earnings = todayOrders.filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.amountPaise, 0);
  const pages = todayOrders.reduce((sum, order) => sum + order.files.reduce((total, file) => total + file.pageCount, 0), 0);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    const amount = orders.filter((order) => new Date(order.createdAt).toDateString() === date.toDateString() && order.paymentStatus === "paid").reduce((sum, order) => sum + order.amountPaise, 0);
    return { day: date.toLocaleDateString(undefined, { weekday: "short" }), amount };
  });
  const max = Math.max(1, ...week.map((day) => day.amount));
  async function toggleShopOnline() {
    if (!shop) return; setOnlineBusy(true); setError("");
    try { const response = await fetch("/api/shops/online", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isOnline: !shop.isOnline }) }); const body = await response.json() as { isOnline?: boolean; error?: string }; if (!response.ok || body.isOnline === undefined) throw new Error(body.error ?? "Could not update shop status."); setShop({ ...shop, isOnline: body.isOnline }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update shop status."); }
    finally { setOnlineBusy(false); }
  }
  return <div className="workspace-page"><header className="workspace-header"><a className="brand" href="/"><span className="brand-mark"><Store size={20} /></span><span>printly.</span></a><nav className="workspace-top-links"><a href="/dashboard/settings">Shop settings</a><a href="/dashboard/support">Help & support</a></nav></header><main className="settings-main">
    <div className="eyebrow"><span className="eyebrow-dot" /> YOUR COUNTER, ONLINE</div><h1>{shop ? `Welcome, ${shop.displayName}` : "Shop overview"}</h1><p>Here’s a quick view of your shop’s order activity.</p>{error && <div className="form-alert" role="alert">{error}</div>}
    <div className="order-count-strip"><span>Shop status <b>{shop?.isOnline ? "Online" : "Offline"}</b><button className="qr-secondary-button" disabled={!shop || onlineBusy} type="button" onClick={() => void toggleShopOnline()}>{onlineBusy ? "Saving…" : shop?.isOnline ? "Take shop offline" : "Bring shop online"}</button></span><span>Today’s earnings <b>{money(earnings)}</b></span><span>Orders today <b>{todayOrders.length}</b></span><span>Pages today <b>{pages}</b></span><span>Needs attention <b>{pending.length}</b></span></div>
    <section className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><BarChart3 size={18}/></span><div><h2>Confirmed earnings · last 7 days</h2><p>Only manually confirmed direct UPI and cash payments are included.</p></div></div><div className="overview-bars">{week.map((day) => <div className="overview-bar-column" key={day.day}><b>{money(day.amount)}</b><div className="overview-bar-track"><i style={{ height: `${Math.max(4, day.amount / max * 100)}%` }}/></div><small>{day.day}</small></div>)}</div></section>
    <section className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><Clock3 size={18}/></span><div><h2>Recent orders</h2><p>Latest activity from your customer order page.</p></div></div>{orders.slice(0, 6).map((order) => <article className="merchant-order-card" key={order.code}><div className="merchant-order-heading"><b>#{order.code}</b><time>{new Date(order.createdAt).toLocaleString()}</time></div><div className="merchant-order-summary"><span>{order.status.replaceAll("_", " ")}</span><span>{order.paymentStatus}</span><b>{money(order.amountPaise)}</b></div></article>)}{orders.length === 0 && <p>No orders yet. Share your QR code to receive the first one.</p>}<a className="button button-dark" href="/dashboard/orders">Open print jobs <ArrowRight size={15}/></a></section>
    <section className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><Printer size={18}/></span><div><h2>Printer status</h2><p>Configured devices and their current connection state.</p></div><a href="/dashboard/printers">Manage</a></div>{printers.length ? printers.map((printer) => <div className="merchant-order-summary" key={printer._id}><b>{printer.name}</b><span>{printer.protocol === "ipp" ? "Agent pending" : "Simulation"}</span><span>{printer.status}</span></div>) : <p>No printers configured. Add a simulated printer or configure a network printer.</p>}</section>
    <div className="overview-shortcuts"><a href="/dashboard/orders"><Printer/>Print jobs</a><a href="/dashboard/qr-code"><QrCode/>Shop QR code</a><a href="/dashboard/printers"><Printer/>Add a printer</a><a href="/dashboard/reports"><BarChart3/>Reports</a><a href="/dashboard/settings"><Settings2/>Shop settings</a><a href="/dashboard/payments"><CreditCard/>Payments</a><a href="/dashboard/support"><CircleHelp/>Help & support</a></div>
    <section className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><ShieldCheck size={18}/></span><div><h2>About your wallet</h2><p>Printly records payments you confirm, but customer UPI payments go directly to your shop and cash is collected at your counter. This build does not hold a withdrawable wallet balance or initiate payouts.</p></div></div><a href="/dashboard/payments">Review payment records <ArrowRight size={15}/></a></section>
  </main></div>;
}

const guides = [
  ["Set up your shop", "Add your shop name, address, contact information, and customer order link. Switch the shop online when you are ready to accept jobs."],
  ["Set print prices", "Enable the paper sizes you offer, set B&W and colour prices, and choose whether double-sided printing is available. Use the quote calculator to check an example."],
  ["Share your QR code", "Open Shop settings → Customer QR & sharing. Download a poster, print or save it as PDF, copy the customer link, or share it through WhatsApp."],
  ["Review and print jobs", "Open Print jobs to inspect uploaded files and print options. Verify UPI payments in your own payment app before confirming them. Cash is confirmed after collection at the counter."],
  ["Manage file privacy", "Choose a pending-file retention period in Shop settings. Completed or cancelled uploads are removed by the cleanup process; keep jobs active while you still need their files."],
  ["Configure printers", "Add simulated printers to explore routing, or save a network printer address for later. Physical printing needs a compatible desktop print agent, which is not included in this build yet."],
];

export function ShopSupportPage() {
  return <div className="workspace-page"><header className="workspace-header"><a className="brand" href="/"><span className="brand-mark"><CircleHelp size={20}/></span><span>printly.</span></a><a className="back-link" href="/dashboard">Dashboard</a></header><main className="settings-main"><div className="eyebrow"><span className="eyebrow-dot"/> SHOP MANAGEMENT</div><h1>Help & support</h1><p>Guides for setting up your shop and handling customer print jobs.</p><div className="overview-shortcuts"><a href="/dashboard/orders"><Printer/>Open print jobs</a><a href="/dashboard/settings"><Settings2/>Shop settings</a><a href="/dashboard/reports"><BarChart3/>Reports</a></div>{guides.map(([title, content], index) => <details className="support-guide" key={title}><summary><span>{String(index + 1).padStart(2, "0")}</span>{title}</summary><p>{content}</p></details>)}<section className="settings-card"><h2>Contact support</h2><p>Support email and phone are not configured for this local development build. For account-specific issues, use the project owner’s configured support channel.</p></section></main></div>;
}

export function ShopWalletPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/shops/orders", { credentials: "same-origin" }).then(async (response) => { if (response.status === 401) { window.location.assign("/login"); return; } if (!response.ok) throw new Error("Could not load payment activity."); const body = await response.json() as { orders: Order[] }; setOrders(body.orders); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load payment activity.")); }, []);
  const confirmed = orders.filter((order) => order.paymentStatus === "paid");
  const total = confirmed.reduce((sum, order) => sum + order.amountPaise, 0);
  return <div className="workspace-page"><header className="workspace-header"><a className="brand" href="/"><span className="brand-mark"><CreditCard size={20}/></span><span>printly.</span></a><a className="back-link" href="/dashboard">Dashboard</a></header><main className="settings-main"><div className="eyebrow"><span className="eyebrow-dot"/> SHOP MANAGEMENT</div><h1>Wallet & earnings</h1><p>Payment activity confirmed by your shop.</p>{error && <div className="form-alert">{error}</div>}<section className="settings-card"><h2>Confirmed receipts · {money(total)}</h2><p>These are payment records, not a wallet balance. UPI payments go to your UPI account and cash is collected in person, so Printly cannot withdraw or pay out these amounts.</p><a href="/dashboard/payments">Open payment records <ArrowRight size={15}/></a></section><section className="settings-card"><h2>Withdrawal requests</h2><p>Withdrawals require funds to be held by a payment provider. This local build uses direct UPI and cash at counter and has no payment-provider balance or payout integration.</p></section><div className="merchant-order-list">{confirmed.slice(0,30).map((order) => <article className="merchant-order-card" key={order.code}><div className="merchant-order-heading"><b>#{order.code}</b><time>{new Date(order.createdAt).toLocaleString()}</time></div><div className="merchant-order-summary"><span>{order.paymentStatus}</span><span>{order.paymentMethod}</span><b>{money(order.amountPaise)}</b></div></article>)}</div></main></div>;
}
