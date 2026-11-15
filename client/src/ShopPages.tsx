import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, CreditCard, Crown, FileText, Printer, Settings, Wallet, PlayCircle, Download, MessageCircle, Phone, Mail, Maximize2, Check, RefreshCw } from "lucide-react";
import { useCallback } from "react";

type Order = { id?: string; code: string; status: string; paymentStatus: string; paymentMethod: string; amountPaise: number; createdAt: string; options?: { colour: boolean; copies: number }; files: Array<{ name?: string; pageCount: number }> };
type Shop = { displayName: string; ownerName?: string; slug: string };
const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export function ShopOverviewPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void Promise.all([
      fetch("/api/shops/orders", { credentials: "same-origin" }),
      fetch("/api/shops/me", { credentials: "same-origin" }),
    ]).then(async ([ordersResponse, shopResponse]) => {
      if (ordersResponse.status === 401 || shopResponse.status === 401) { window.location.assign("/login"); return; }
      if (!ordersResponse.ok || !shopResponse.ok) throw new Error("Could not load your shop overview.");
      const [orderBody, shopBody] = await Promise.all([ordersResponse.json() as Promise<{ orders: Order[] }>, shopResponse.json() as Promise<{ shop: Shop }>]);
      setOrders(orderBody.orders); setShop(shopBody.shop);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load overview."));
  }, []);
  const todayOrders = useMemo(() => orders.filter((order) => new Date(order.createdAt).toDateString() === new Date().toDateString()), [orders]);
  const pending = todayOrders.filter((order) => ["awaiting_payment", "awaiting_cash", "needs_approval", "queued", "failed"].includes(order.status));
  const earnings = todayOrders.filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.amountPaise, 0);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    const amount = orders.filter((order) => new Date(order.createdAt).toDateString() === date.toDateString() && order.paymentStatus === "paid").reduce((sum, order) => sum + order.amountPaise, 0);
    return { day: date.toLocaleDateString(undefined, { weekday: "short" }), amount };
  });
  const max = Math.max(1, ...week.map((day) => day.amount));
  const weekTotal = week.reduce((sum, day) => sum + day.amount, 0);
  const statusLabel = (status: string) => ({ awaiting_payment: "UPI pending", awaiting_cash: "Cash due", needs_approval: "Needs approval", queued: "Print queue", printing: "Printing", submitted: "Sent to printer", printed: "Ready for pickup", failed: "Print failed · retry available", rejected: "Rejected", cancelled: "Cancelled", expired: "Expired" }[status] ?? status.replaceAll("_", " "));
  const timeAgo = (date: string) => { const mins = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 60000)); return mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`; };
  return <div className="workspace-page overview-workspace"><main className="settings-main overview-main">
    <header className="overview-welcome"><div><h1>Welcome, {(shop?.ownerName ?? shop?.displayName ?? "there").split(" ")[0]} 👋</h1><p>Today’s shop activity at a glance.</p></div><div className="overview-actions"><a className="overview-action" href="https://www.youtube.com/playlist?list=PLSF3VCpMK5cU" target="_blank" rel="noreferrer"><PlayCircle size={15}/>How to set up</a><a className="overview-action" href="/dashboard/qr-code"><Download size={15}/>Download QR</a><a className="overview-action" href="/dashboard/subscription"><Crown size={15}/>Subscription</a><a className="overview-action primary" href="/dashboard/printers"><Settings size={15}/>Printers & agent</a></div></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
    <section className="overview-kpis"><article><div><span>Paid orders today</span><CreditCard size={17}/></div><b>{money(earnings)}</b></article><article><div><span>Customer orders today</span><FileText size={17}/></div><b>{todayOrders.length}</b></article><article><div><span>Orders ready for pickup</span><Printer size={17}/></div><b>{todayOrders.filter((order) => order.status === "printed").length}</b></article><article><div><span>Orders needing attention</span><Clock3 size={17}/></div><b>{pending.length}</b></article></section>
    <section className="overview-wallet-banner"><span className="overview-wallet-icon"><Wallet size={20}/></span><div><small>Razorpay online collections</small><b>Settled to your shop separately</b><small className="overview-wallet-note">Check Daily settlements for transfer status. Cash is collected at your counter.</small></div><a href="/dashboard/settlements">Daily settlements <ArrowRight size={15}/></a></section>
    <section className="settings-card overview-week-card"><header><div><h2>Earnings this week</h2><p>Daily revenue from print orders</p></div><div><b>{money(weekTotal)}</b><small>7-day total</small></div></header><div className="overview-chart"><div className="overview-y-axis"><span>{money(max)}</span><span>{money(max * .75)}</span><span>{money(max * .5)}</span><span>{money(max * .25)}</span><span>₹0</span></div><div className="overview-chart-area">{week.map((day) => <div className="overview-chart-column" key={day.day}><div className="overview-chart-track"><i style={{height:`${day.amount ? Math.max(5, day.amount / max * 100) : 0}%`}} title={money(day.amount)}/></div><small>{day.day}</small></div>)}</div></div></section>
    <section className="settings-card overview-printers-card"><header><div><h2>Printers & agent</h2><p>Windows desktop agent and print routing.</p></div></header><div className="overview-printers-empty"><p>Pair your Windows PC to dispatch print jobs to Microsoft Print to PDF or connected printers.</p><a href="/dashboard/printers">Manage printers</a></div></section>
    <section className="settings-card overview-jobs-card"><header><div><h2>Recent customer orders</h2><p>Review payment status and manage manual fulfillment.</p></div><a href="/dashboard/orders">View all <ArrowRight size={14}/></a></header>{orders.length ? <div className="overview-jobs-table-wrap"><table><thead><tr><th>Order</th><th>File</th><th>Pages</th><th>Amount</th><th>Payment</th><th>Status</th></tr></thead><tbody>{orders.slice(0,6).map((order)=><tr key={order.code}><td><a href={`/dashboard/orders?order=${encodeURIComponent(order.id ?? order.code)}`}>#{order.code}</a></td><td><b>{order.files[0]?.name ?? "Uploaded file"}</b><small>{timeAgo(order.createdAt)}</small></td><td>{order.files.reduce((sum,file)=>sum+file.pageCount,0)*(order.options?.copies??1)} · {order.options?.colour?"Colour":"B&W"}</td><td><b>{money(order.amountPaise)}</b></td><td>{order.paymentMethod === "cash" ? "Cash" : order.paymentMethod === "razorpay" ? "Razorpay" : "UPI"}</td><td><span className={`overview-order-status ${order.status}`}>{statusLabel(order.status)}</span></td></tr>)}</tbody></table></div> : <div className="overview-jobs-empty"><p>No customer orders yet. Share your QR code to receive an order.</p><a href="/dashboard/qr-code">Download your QR</a></div>}</section>
  </main></div>;
}

const guides = [
  { title: "Create your account", summary: "Register a shop account to configure your public order page and manage incoming requests.", steps: ["Open the Register page and fill in your name, shop name, email, mobile and a password.", "Enter the 6-digit code we email you to verify your account.", "You can then sign in and complete your shop profile.", "Every new shop receives an automatic 7-day free trial with 50 customer orders."], image: "/guide/01-register.webp", alt: "The Register your shop form" },
  { title: "Fill in your shop profile", summary: "Your shop name, logo and address are shown to customers and printed on your QR poster.", steps: ["Open My Profile → Shop profile.", "Upload your logo — it is saved straight away.", "Fill in your address and city, then click Save profile."], link: ["Open Shop profile", "/dashboard/settings/profile"], image: "/guide/04-shop-profile.webp", alt: "My Profile → Shop profile" },
  { title: "Set paper sizes and print rates", summary: "Customers see the exact price as soon as they upload — it comes from these rates.", steps: ["Open Setting → Page setting.", "Turn on the paper sizes you offer (A4, Legal …).", "Enter your Black & White and Colour rates — one side per page, both sides per sheet.", "Click Save changes at the bottom. Optional: add bulk discounts in Setting → Discount setting."], link: ["Open Page setting", "/dashboard/setting/page"], image: "/guide/05-page-setting.webp", alt: "Setting → Page setting with print rates" },
  { title: "Choose how customers pay", summary: "Enable Razorpay checkout for online payments or let customers pay cash at your counter.", steps: ["Open Setting → Payment setting.", "Enable Razorpay checkout, Pay at counter, or both.", "Razorpay payments are confirmed by the gateway. Collect cash at pickup and confirm it in the order.", "Razorpay collections are settled to shops separately by the platform administrator. Add your settlement UPI ID and optional QR in Payment setting."], link: ["Open Payment setting", "/dashboard/setting/payment"], image: "/guide/06-payment-setting.webp", alt: "Setting → Payment setting" },
  { title: "Connect computer & printers", summary: "Sign in to the Windows desktop app with your shop account to connect printers and receive print jobs.", steps: ["Install and open the UrQrPrint desktop agent on the Windows computer connected to your printers.", "Sign in with the same shop email and password you use on the website. The app connects this computer to your shop automatically.", "The agent discovers Windows printers, including Microsoft Print to PDF, and reports their live status to your website dashboard.", "Set the shop online in the desktop app, then configure paper and colour routing from the agent."], link: ["Open Printers", "/dashboard/printers"], image: "/guide/07-printers.webp", alt: "Printer management and routing" },
  { title: "Put up your QR code", summary: "Customers scan this QR with their phone camera to send you files — no app needed.", steps: ["Open My QR code.", "Pick a size (A4, A5 or sticker) and a design.", "Click PDF or Print poster, and stick it on your counter or door.", "You can also share your shop link on WhatsApp."], link: ["Open My QR code", "/dashboard/qr-code"], image: "/guide/08-qr-code.webp", alt: "My QR code page with the poster maker" },
  { title: "How a customer orders", summary: "What your customer sees after scanning the QR on their phone.", steps: ["Upload PDFs or photos (up to 10 files).", "Choose paper size, B&W / colour, one or both sides and copies — the price updates live.", "Pay with Razorpay when enabled, or choose Pay at counter.", "They get an order number — it is also the pickup code they tell you at the counter."], image: "/guide/09-customer-page.webp", alt: "The customer upload page on a phone" },
  { title: "Handle customer orders", summary: "Review payments and monitor print jobs through pickup.", steps: ["Razorpay confirms online payments; collect cash at the counter and confirm it in the order.", "If auto-print is off, approve a paid order. When it is on, verified paid orders enter the printer queue automatically.", "Make sure the desktop agent is signed in, online, and connected to the required printer. Review any failed job and retry after fixing the issue.", "Mark the order ready for pickup after printing. Files are scheduled for deletion at completion or after the configured retention time."], link: ["Open Orders", "/dashboard/orders"], image: "/guide/10-print-jobs.webp", alt: "Order list with status tabs" },
  { title: "Track payments and reports", summary: "See what you earned — by day, payment method and paper size.", steps: ["Payments: every paid order, UPI and cash, with filters.", "Reports: earnings, orders and busy hours for a period.", "Overview: today’s earnings, jobs and printers at a glance."], link: ["Open Payments", "/dashboard/payments"], image: "/guide/11-payments.webp", alt: "Payments page" },
  { title: "Subscription & plans", summary: "Choose a plan and keep customer orders available for your shop.", steps: ["Open My subscription to view your plan and expiry date.", "Every new shop starts with a 7-day free trial for up to 50 print orders.", "Choose ₹50 for one month or ₹500 for 12 months; annual billing saves ₹100.", "Pay securely with Razorpay. The plan activates after payment is verified.", "Paid plans include unlimited print orders and renew manually; they do not auto-charge."], link: ["Open My subscription", "/dashboard/subscription"], image: "/guide/13-subscription.webp", alt: "Shop subscription and plan chooser" },
];

export function ShopSupportPage() {
  const [step, setStep] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const current = guides[step];
  return <div className="workspace-page"><main className="settings-main support-page-main"><header className="support-page-heading"><div><h1>Help & support</h1><p>Setup, printer or payment — get help with your shop workspace.</p></div></header>
    <section className="support-contact-grid"><article><span><MessageCircle size={14}/> WhatsApp</span><b>Chat with support</b><small>+91 82386 94300</small><a href="https://wa.me/918238694300?text=Hi%2C%20I%20need%20help%20with%20my%20shop%20dashboard." target="_blank" rel="noreferrer">Chat now <ArrowRight size={13}/></a></article><article><span><Phone size={14}/> Phone</span><b>Call support</b><small>+91 82386 94300</small><a href="tel:+918238694300">Call <ArrowRight size={13}/></a></article><article><span><Mail size={14}/> Email</span><b>Email support</b><small>jakasaniyasagar99@gmail.com</small><a href="mailto:jakasaniyasagar99@gmail.com?subject=UrQrPrint%20shop%20support">Send email <ArrowRight size={13}/></a></article></section>
    <section className="settings-card support-video-card"><header><div><h2>Video guides</h2><p>Watch how to set up your shop and connect a Windows computer.</p></div></header><div className="support-video-grid"><a href="https://www.youtube.com/watch?v=mu9Dbao_fag" target="_blank" rel="noreferrer"><img src="https://i.ytimg.com/vi/mu9Dbao_fag/hqdefault.jpg" alt=""/><span>8:34 · Setup</span><b>Register your shop</b><small>Watch video <ArrowRight size={13}/></small></a><a href="https://www.youtube.com/watch?v=hu4i013HuiU" target="_blank" rel="noreferrer"><img src="https://i.ytimg.com/vi/hu4i013HuiU/hqdefault.jpg" alt=""/><span>Printer setup</span><b>Connect your computer and printers</b><small>Watch video <ArrowRight size={13}/></small></a></div></section>
    <section className="settings-card support-guide-card"><header><div><h2>User guide</h2><p>Set up and run your shop in 10 steps</p></div><span>Step {step + 1} of {guides.length}</span></header><div className="support-guide-layout"><nav aria-label="User guide steps">{guides.map((guide, index) => <button type="button" className={step === index ? "active" : ""} key={guide.title} onClick={() => setStep(index)}><span>{index + 1}</span>{guide.title}</button>)}</nav><article><small>STEP {String(step + 1).padStart(2, "0")}</small><h3>{current.title}</h3><p>{current.summary}</p><ol className="support-guide-steps">{current.steps.map((instruction, index) => <li key={instruction}><span>{index + 1}</span>{instruction}</li>)}</ol>{current.link && <a className="support-guide-open-link" href={current.link[1]}>{current.link[0]} <ArrowRight size={14}/></a>}<button type="button" className="support-guide-image-button" onClick={() => setEnlarged(true)} aria-label={`Enlarge screenshot: ${current.alt}`}><img src={current.image} alt={current.alt}/><span><Maximize2 size={13}/> Zoom</span></button><div className="support-guide-actions"><button type="button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Previous</button><button type="button" disabled={step === guides.length - 1} onClick={() => setStep((value) => Math.min(guides.length - 1, value + 1))}>Next step <ArrowRight size={14}/></button></div></article></div></section>
    {enlarged && <div className="support-guide-lightbox" role="presentation" onClick={() => setEnlarged(false)}><div role="dialog" aria-modal="true" aria-label={`Guide screenshot: ${current.alt}`} onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setEnlarged(false)}>Close</button><img src={current.image} alt={current.alt}/></div></div>}
  </main></div>;
}

export function ShopWalletPage() {
  type SettlementRow = { _id: string; dateKey: string; amountPaise: number; orderCount: number; status: "pending" | "sent" | "received"; paymentMode?: "test" | "live"; transferReference?: string; sentAt?: string; receivedAt?: string; upiId: string };
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [upiId, setUpiId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/shops/settlements", { credentials: "same-origin" });
      const body = await response.json() as { settlements?: SettlementRow[]; upiId?: string; error?: string };
      if (response.status === 401) { window.location.assign("/login"); return; }
      if (!response.ok) throw new Error(body.error || "Could not load daily settlements.");
      setRows(body.settlements ?? []); setUpiId(body.upiId ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load daily settlements."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function confirmReceived(row: SettlementRow) {
    const simulation = row.paymentMode !== "live";
    const confirmMessage = simulation
      ? `Confirm the simulated receipt of ₹${(row.amountPaise / 100).toFixed(2)} for ${row.dateKey}? This is a test only; no money was transferred.`
      : `Confirm that you received ₹${(row.amountPaise / 100).toFixed(2)} for ${row.dateKey}?`;
    if (!window.confirm(confirmMessage)) return;
    setBusyId(row._id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/shops/settlements/${row._id}/confirm-received`, { method: "POST", credentials: "same-origin" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not confirm the settlement receipt.");
      setNotice(simulation ? `Simulated receipt confirmed for ₹${(row.amountPaise / 100).toFixed(2)}. No money was transferred.` : `Receipt confirmed for ₹${(row.amountPaise / 100).toFixed(2)}.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not confirm the settlement receipt."); }
    finally { setBusyId(""); }
  }
  return <div className="workspace-page"><main className="settings-main wallet-management-main">
    <div className="wallet-page-heading"><div><small>SHOP PAYOUTS</small><h1>Daily settlements</h1><p>Review daily settlement requests and confirm receipt after the admin records a transfer.</p></div><button className="wallet-view-payments" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
    {error && <div className="form-alert" role="alert">{error}</div>}{notice && <div className="settlement-notice"><Check size={15}/>{notice}</div>}
    <div className="settlement-shop-info"><Wallet size={17}/><span>Settlement destination UPI ID</span><b>{upiId || "Not set — add one in Payment setting"}</b>{!upiId && <a href="/dashboard/setting/payment">Open Payment setting <ArrowRight size={13}/></a>}</div>
    <section className="settings-card settlement-shop-history"><header className="wallet-card-heading"><div><h2>Settlement history</h2><p>Only captured Razorpay customer payments are included. Amounts shown are gross, before any gateway charges.</p></div><small>{rows.length} record{rows.length === 1 ? "" : "s"}</small></header>
      {loading ? <div className="wallet-history-empty">Loading your settlement history…</div> : rows.length === 0 ? <div className="wallet-history-empty"><Wallet size={24}/><b>No daily settlement requests yet</b><span>Settlements appear after a day with captured Razorpay payments closes.</span></div> : <div className="settlement-shop-list">{rows.map((row) => { const simulation = row.paymentMode !== "live"; return <article key={row._id} className="settlement-shop-row"><div className="settlement-shop-row-top"><div><small>Business date</small><b>{new Date(`${row.dateKey}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</b><span>{row.orderCount} captured Razorpay order{row.orderCount === 1 ? "" : "s"}</span></div><span className={`settlement-status ${simulation ? "test" : row.status}`}>{simulation ? row.status === "pending" ? "Test mode · no real funds" : row.status === "sent" ? "Simulated · confirm receipt" : "Simulation confirmed" : row.status === "pending" ? "Admin transfer pending" : row.status === "sent" ? "Payment sent · confirm receipt" : "Payment received"}</span></div><div className="settlement-shop-row-bottom"><b>₹{(row.amountPaise / 100).toFixed(2)}</b>{row.status === "sent" && <div><small>{simulation ? "Simulation reference · not a bank UTR:" : "UTR / transfer reference:"} <b>{row.transferReference || "Not provided"}</b>{simulation && <span> No money moved.</span>}</small><button type="button" disabled={busyId === row._id} onClick={() => void confirmReceived(row)}><Check size={14}/>{busyId === row._id ? "Saving…" : simulation ? "Confirm simulated receipt" : "Confirm payment received"}</button></div>}{row.status === "pending" && <small>{simulation ? "Test payment only. No real money was received." : "Waiting for the admin to transfer this amount."}</small>}{row.status === "received" && <small>{simulation ? "Simulated receipt confirmed · no real money moved" : `Confirmed on ${row.receivedAt ? new Date(row.receivedAt).toLocaleString() : "—"}`}</small>}</div></article>; })}</div>}
    </section>
  </main></div>;
}
