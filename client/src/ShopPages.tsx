import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, Clock3, CreditCard, FileText, Printer, ShieldCheck, Smartphone, Wallet, PlayCircle, Download } from "lucide-react";

type Order = { id?: string; code: string; status: string; paymentStatus: string; paymentMethod: string; amountPaise: number; createdAt: string; options?: { colour: boolean; copies: number }; files: Array<{ name?: string; pageCount: number }> };
type Shop = { displayName: string; ownerName?: string; slug: string };
type PrinterStatus = { _id: string; name: string; status: string; protocol: string };
const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export function ShopOverviewPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [shop, setShop] = useState<Shop | null>(null);
  const [printers, setPrinters] = useState<PrinterStatus[]>([]);
  const [error, setError] = useState("");
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
  const pages = todayOrders.filter((order) => order.status === "printed").reduce((sum, order) => sum + order.files.reduce((total, file) => total + file.pageCount, 0) * (order.options?.copies ?? 1), 0);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    const amount = orders.filter((order) => new Date(order.createdAt).toDateString() === date.toDateString() && order.paymentStatus === "paid").reduce((sum, order) => sum + order.amountPaise, 0);
    return { day: date.toLocaleDateString(undefined, { weekday: "short" }), amount };
  });
  const max = Math.max(1, ...week.map((day) => day.amount));
  const weekTotal = week.reduce((sum, day) => sum + day.amount, 0);
  const availablePrinters = printers.filter((printer) => printer.status === "ready").length;
  const statusLabel = (status: string) => ({ awaiting_payment: "UPI pending", awaiting_cash: "Cash due", needs_approval: "Needs approval", queued: "Queued", printing: "Printing", printed: "Printed", failed: "Failed", rejected: "Rejected", cancelled: "Cancelled", expired: "Expired" }[status] ?? status.replaceAll("_", " "));
  const timeAgo = (date: string) => { const mins = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 60000)); return mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`; };
  return <div className="workspace-page overview-workspace"><main className="settings-main overview-main">
    <header className="overview-welcome"><div><h1>Welcome, {(shop?.ownerName ?? shop?.displayName ?? "there").split(" ")[0]} 👋</h1><p>Today’s shop activity at a glance.</p></div><div className="overview-actions"><a className="overview-action" href="https://www.youtube.com/playlist?list=PLSF3VCpMK5cU" target="_blank" rel="noreferrer"><PlayCircle size={15}/>How to set up</a><a className="overview-action" href="/dashboard/qr-code"><Download size={15}/>Download QR</a><a className="overview-action primary" href="/dashboard/printers"><span>＋</span>Add printer</a></div></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
    <section className="overview-kpis"><article><div><span>Today’s earnings</span><CreditCard size={17}/></div><b>{money(earnings)}</b></article><article><div><span>Print jobs today</span><FileText size={17}/></div><b>{todayOrders.length}</b></article><article><div><span>Pages printed</span><Printer size={17}/></div><b>{pages}</b></article><article><div><span>Pending jobs</span><Clock3 size={17}/></div><b>{pending.length}</b></article></section>
    <section className="overview-wallet-banner"><span className="overview-wallet-icon"><Wallet size={20}/></span><div><small>Wallet balance</small><b>₹0</b><small className="overview-wallet-note">Printly does not hold withdrawable funds.</small></div><a href="/dashboard/withdraw">Wallet details <ArrowRight size={15}/></a></section>
    <section className="settings-card overview-week-card"><header><div><h2>Earnings this week</h2><p>Daily revenue from print orders</p></div><div><b>{money(weekTotal)}</b><small>7-day total</small></div></header><div className="overview-chart"><div className="overview-y-axis"><span>{money(max)}</span><span>{money(max * .75)}</span><span>{money(max * .5)}</span><span>{money(max * .25)}</span><span>₹0</span></div><div className="overview-chart-area">{week.map((day) => <div className="overview-chart-column" key={day.day}><div className="overview-chart-track"><i style={{height:`${day.amount ? Math.max(5, day.amount / max * 100) : 0}%`}} title={money(day.amount)}/></div><small>{day.day}</small></div>)}</div></div></section>
    <section className="settings-card overview-printers-card"><header><div><h2>Printers</h2><p>{availablePrinters} of {printers.length} available</p></div><a href="/dashboard/printers">Manage printers <ArrowRight size={14}/></a></header>{printers.length ? <div className="overview-printer-list">{printers.map((printer) => <article key={printer._id}><span className={`overview-printer-dot ${printer.status}`}/><div><b>{printer.name}</b><small>{printer.protocol === "ipp" ? "Network printer" : "Simulated printer"}</small></div><span className={`overview-printer-state ${printer.status}`}>{printer.status === "ready" ? "Ready" : "Offline"}</span></article>)}</div> : <div className="overview-printers-empty"><p>No printers added yet</p><a href="/dashboard/printers">Manage printers</a></div>}</section>
    <section className="settings-card overview-jobs-card"><header><div><h2>Recent print jobs</h2><p>Live queue — files auto-delete after printing</p></div><a href="/dashboard/orders">View all <ArrowRight size={14}/></a></header>{orders.length ? <div className="overview-jobs-table-wrap"><table><thead><tr><th>Order</th><th>File</th><th>Pages</th><th>Amount</th><th>Payment</th><th>Status</th></tr></thead><tbody>{orders.slice(0,6).map((order)=><tr key={order.code}><td><a href={`/dashboard/orders?order=${encodeURIComponent(order.id ?? order.code)}`}>#{order.code}</a></td><td><b>{order.files[0]?.name ?? "Uploaded file"}</b><small>{timeAgo(order.createdAt)}</small></td><td>{order.files.reduce((sum,file)=>sum+file.pageCount,0)*(order.options?.copies??1)} · {order.options?.colour?"Colour":"B&W"}</td><td><b>{money(order.amountPaise)}</b></td><td>{order.paymentMethod === "cash" ? "Cash" : "UPI"}</td><td><span className={`overview-order-status ${order.status}`}>{statusLabel(order.status)}</span></td></tr>)}</tbody></table></div> : <div className="overview-jobs-empty"><p>No print jobs yet. Share your QR code to receive your first order.</p><a href="/dashboard/qr-code">Download your QR</a></div>}</section>
  </main></div>;
}

const guides = [
  ["Create your account", "Register your shop with your name, shop name, email, mobile number, and password. Verify the six-digit code sent to your email. Your demo starts after verification."],
  ["Fill in your shop profile", "Add your public shop name, phone, address, city, state, and PIN code. These details help customers identify your counter and pickup location."],
  ["Set paper sizes and print rates", "Choose the paper sizes you offer, enable colour or both-sided printing where available, and set a rate for each print combination."],
  ["Choose how customers pay", "Add your shop UPI ID for direct payment or enable cash at the counter. Verify UPI payments in your own payment app before confirming an order."],
  ["Connect your printers", "The Printers page lets you save printer capabilities and routing rules. Physical printing and PC discovery need the Printly desktop agent, which is not available in this build yet."],
  ["Put up your QR code", "Open My QR code to copy your customer link, share it on WhatsApp, or create and download a counter poster."],
  ["How a customer orders", "Customers scan the shop QR, upload a PDF or photos, choose print options, review the estimate, and submit their order."],
  ["Handle print orders", "Use Print jobs to review the uploaded files and settings. Accept or reject jobs, update their status, and confirm payment after you receive it."],
  ["Track payments and reports", "Payments records the order payment status. Reports summarizes completed jobs, pages, revenue, payment methods, and uploaded file types."],
  ["Your plan and renewing", "My subscription shows your plan, order usage, expiry, plan history, and available upgrade options."],
];

export function ShopSupportPage() {
  const [step, setStep] = useState(0);
  const [video, title, detail] = step === 4 ? ["https://www.youtube.com/watch?v=A9XypZ1avjI", "Connect your printers", "Connect your printer and set up automatic printing"] : ["https://www.youtube.com/playlist?list=PLSF3VCpMK5cU", "Register your shop", "Set up your shop and dashboard"];
  return <div className="workspace-page"><main className="settings-main support-page-main"><header className="support-page-heading"><div><h1>Help & support</h1><p>Setup, printer or payment — get help with your shop workspace.</p></div></header>
    <section className="support-contact-grid"><article><span>WhatsApp</span><b>Chat with support</b><small>Support contact is not configured yet</small><button type="button" disabled>Chat now</button></article><article><span>Phone</span><b>Call support</b><small>Support contact is not configured yet</small><button type="button" disabled>Call</button></article><article><span>Email</span><b>Email support</b><small>Support contact is not configured yet</small><button type="button" disabled>Send email</button></article></section>
    <section className="settings-card support-video-card"><header><div><h2>Video guides</h2><p>Step-by-step tutorials</p></div></header><div className="support-video-grid"><a href="https://www.youtube.com/playlist?list=PLSF3VCpMK5cU" target="_blank" rel="noreferrer"><span>Setup</span><b>Register your shop</b><small>Open setup playlist <ArrowRight size={13}/></small></a><a href="https://www.youtube.com/watch?v=A9XypZ1avjI" target="_blank" rel="noreferrer"><span>Printers</span><b>Connect your printer & auto print</b><small>Watch printer guide <ArrowRight size={13}/></small></a></div></section>
    <section className="settings-card support-guide-card"><header><div><h2>User guide</h2><p>Set up and run your shop in 10 steps</p></div><span>Step {step + 1} of {guides.length}</span></header><div className="support-guide-layout"><nav aria-label="User guide steps">{guides.map(([title], index) => <button type="button" className={step === index ? "active" : ""} key={title} onClick={() => setStep(index)}><span>{index + 1}</span>{title}</button>)}</nav><article><small>STEP {String(step + 1).padStart(2, "0")}</small><h3>{guides[step][0]}</h3><p>{guides[step][1]}</p><div className="support-guide-actions"><button type="button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Previous</button><button type="button" disabled={step === guides.length - 1} onClick={() => setStep((value) => Math.min(guides.length - 1, value + 1))}>Next step <ArrowRight size={14}/></button></div>{step === 4 && <a className="support-guide-video-link" href={video} target="_blank" rel="noreferrer">{title}: {detail}</a>}</article></div></section>
  </main></div>;
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
