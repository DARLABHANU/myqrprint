import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, Building2, CircleHelp, Clock3, CreditCard, Printer, QrCode, Settings2, ShieldCheck, Smartphone, Store } from "lucide-react";

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
  return <div className="workspace-page"><main className="settings-main wallet-management-main">
    <div className="wallet-page-heading"><div><small>MERCHANT FINANCE</small><h1>Withdraw earnings</h1><p>Customer payments in Printly go directly to your shop. Printly does not hold these funds in a wallet.</p></div><a className="wallet-view-payments" href="/dashboard/payments"><CreditCard size={15}/> View payments</a></div>
    {error && <div className="form-alert" role="alert">{error}</div>}
    <section className="wallet-balance-card"><span>Wallet balance</span><b>₹0.00</b><small>No customer funds are held by Printly and available to withdraw.</small></section>
    <section className="settings-card wallet-withdrawal-card"><div className="wallet-card-heading"><div><h2>New withdrawal</h2><p>Choose where to receive a payout from your Printly wallet.</p></div><small>Minimum ₹100 · credited within 24 hours</small></div>
      <div className="wallet-field-label">Receive money by</div><div className="wallet-destination-options"><button type="button" className="selected" disabled><Smartphone size={16}/> UPI</button><button type="button" disabled><Building2 size={16}/> Bank account</button></div>
      <p className="wallet-destination-note">Payout destination: unavailable until a payout provider is connected.</p>
      <label className="wallet-amount-field">Gross amount · minimum ₹100<input type="number" min="100" step="1" disabled placeholder="₹ Minimum ₹100"/></label>
      <div className="wallet-fee-summary"><div><span>Gross amount</span><b>₹0.00</b></div><div><span>Processing fee</span><b>—</b></div><div className="wallet-net-row"><span>You receive</span><b>₹0.00</b></div></div>
      <button type="button" className="wallet-request-button" disabled>Request withdrawal</button>
      <div className="wallet-unavailable-note"><ShieldCheck size={15}/><span>Withdrawals are unavailable because Printly has no payout-provider balance configured. The confirmed direct payments below are paid to your shop, not deposited in this wallet.</span></div>
    </section>
    <section className="settings-card wallet-history-card"><div className="wallet-card-heading"><div><h2>Withdrawal history</h2><p>₹0.00 withdrawn so far</p></div></div><div className="wallet-history-empty"><Building2 size={24}/><b>No withdrawal history</b><span>Completed payout requests will appear here.</span></div></section>
    <section className="settings-card wallet-receipts-card"><div className="wallet-card-heading"><div><h2>Confirmed customer payments</h2><p>These payments were received directly by your shop.</p></div><a href="/dashboard/payments">View all <ArrowRight size={14}/></a></div>{confirmed.length ? <div className="merchant-order-list">{confirmed.slice(0,10).map((order) => <article className="merchant-order-card" key={order.code}><div className="merchant-order-heading"><b>#{order.code}</b><time>{new Date(order.createdAt).toLocaleString()}</time></div><div className="merchant-order-summary"><span>{order.paymentMethod === "upi" ? "UPI" : "Cash at counter"} · Confirmed</span><b>{money(order.amountPaise)}</b></div></article>)}</div> : <p>No confirmed customer payments yet.</p>}</section>
  </main></div>;
}
