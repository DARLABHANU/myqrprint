import { useEffect, useState } from "react";
import { Check, Download, LoaderCircle, X } from "lucide-react";

type ReportOrder = {
  id: string; code: string; status: string; paymentMethod: string; paymentStatus: string;
  amountPaise: number; createdAt: string;
  options?: { paperSize: string; colour: boolean; duplex: boolean; photoLayout?: string };
  files: Array<{ name: string; pageCount: number; mediaType: string }>;
};
const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
function collectionBetween(items: ReportOrder[], start: Date, end: Date, method?: string) {
  return items.filter((order) => order.paymentStatus === "paid" && new Date(order.createdAt) >= start && new Date(order.createdAt) < end && (!method || order.paymentMethod === method)).reduce((sum, order) => sum + order.amountPaise, 0);
}

export function DashboardTools({ kind }: { kind: "payments" | "reports" }) {
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [range, setRange] = useState<7 | 30 | 365>(30);
  const [method, setMethod] = useState("all");
  const [paymentState, setPaymentState] = useState("all");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState<10 | 25 | 50 | 100>(10);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cashDialog, setCashDialog] = useState(false);
  const [busyOrder, setBusyOrder] = useState("");
  const [cashOrderCode, setCashOrderCode] = useState("");
  const [cashNote, setCashNote] = useState("");

  async function loadOrders() {
    const response = await fetch("/api/shops/orders", { credentials: "same-origin" });
    if (response.status === 401) { window.location.assign("/login"); return; }
    if (!response.ok) throw new Error("Could not load shop orders.");
    const body = await response.json() as { orders: ReportOrder[] };
    setOrders(body.orders);
  }
  useEffect(() => { void loadOrders().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load data.")); }, []);

  const cutoff = Date.now() - range * 86_400_000;
  const rangedOrders = orders.filter((order) => {
    const created = new Date(order.createdAt).getTime();
    return created >= cutoff && (!dateFrom || created >= new Date(`${dateFrom}T00:00:00`).getTime()) && (!dateTo || created <= new Date(`${dateTo}T23:59:59.999`).getTime());
  });
  const visibleOrders = rangedOrders.filter((order) => {
    if (method !== "all" && order.paymentMethod !== method) return false;
    if (paymentState === "cancelled" && order.status !== "cancelled") return false;
    if (paymentState !== "all" && paymentState !== "cancelled" && order.paymentStatus !== paymentState) return false;
    const search = query.trim().toLowerCase();
    return !search || order.code.toLowerCase().includes(search) || order.files.some((file) => file.name.toLowerCase().includes(search));
  });
  const paid = rangedOrders.filter((order) => order.paymentStatus === "paid");
  const paymentTotals = paid.reduce((totals, order) => ({ ...totals, [order.paymentMethod]: (totals[order.paymentMethod] ?? 0) + order.amountPaise }), {} as Record<string, number>);
  const uploadTypes = rangedOrders.reduce((totals, order) => {
    const type = order.files.some((file) => file.mediaType.startsWith("image/")) ? "Photo orders" : "PDF orders";
    return { ...totals, [type]: (totals[type] ?? 0) + 1 };
  }, {} as Record<string, number>);
  const paperTotals = rangedOrders.reduce((totals, order) => { const key = order.options?.paperSize ?? "Unknown"; return { ...totals, [key]: (totals[key] ?? 0) + 1 }; }, {} as Record<string, number>);
  const colourTotals = { "B&W": rangedOrders.filter((order) => !order.options?.colour).length, Colour: rangedOrders.filter((order) => order.options?.colour).length, "Single-sided": rangedOrders.filter((order) => !order.options?.duplex).length, Duplex: rangedOrders.filter((order) => order.options?.duplex).length };
  const trend = Array.from({ length: range === 7 ? 7 : 12 }, (_, index) => {
    const day = new Date();
    if (range === 7) day.setDate(day.getDate() - (6 - index)); else day.setMonth(day.getMonth() - (11 - index), 1);
    const amount = paid.filter((order) => { const d = new Date(order.createdAt); return range === 7 ? d.toDateString() === day.toDateString() : d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth(); }).reduce((sum, order) => sum + order.amountPaise, 0);
    return { label: range === 7 ? day.toLocaleDateString(undefined, { weekday: "short" }) : day.toLocaleDateString(undefined, { month: "short" }), amount };
  });
  const trendMax = Math.max(1, ...trend.map((item) => item.amount));
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(todayStart.getDate() + 1);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(todayStart.getDate() - 1);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const nextMonthStart = new Date(monthStart); nextMonthStart.setMonth(monthStart.getMonth() + 1);
  const previousMonthStart = new Date(monthStart); previousMonthStart.setMonth(monthStart.getMonth() - 1);
  const todayCollected = collectionBetween(orders, todayStart, tomorrowStart);
  const yesterdayCollected = collectionBetween(orders, yesterdayStart, todayStart);
  const monthCollected = collectionBetween(orders, monthStart, nextMonthStart);
  const lastMonthCollected = collectionBetween(orders, previousMonthStart, monthStart);
  const monthUpi = collectionBetween(orders, monthStart, nextMonthStart, "upi");
  const monthCash = collectionBetween(orders, monthStart, nextMonthStart, "cash");
  const monthPaidOrders = orders.filter((order) => order.paymentStatus === "paid" && new Date(order.createdAt) >= monthStart && new Date(order.createdAt) < nextMonthStart);
  const upiPaidOrders = monthPaidOrders.filter((order) => order.paymentMethod === "upi").length;
  const cashPaidOrders = monthPaidOrders.filter((order) => order.paymentMethod === "cash").length;
  const percentageLabel = (current: number, previous: number) => `${current >= previous ? "▲" : "▼"} ${previous === 0 ? current > 0 ? "New" : "0%" : `${Math.round(Math.abs(current - previous) / previous * 100)}%`} vs previous period`;
  const avgOrder = paid.length ? Math.round(paid.reduce((sum, order) => sum + order.amountPaise, 0) / paid.length) : 0;
  const hourCounts = Array.from({ length: 24 }, (_, hour) => rangedOrders.filter((order) => new Date(order.createdAt).getHours() === hour).length);
  const photoLayouts = rangedOrders.filter((order) => order.options?.photoLayout).reduce((totals, order) => { const layout = order.options?.photoLayout ?? "unknown"; return { ...totals, [layout]: (totals[layout] ?? 0) + 1 }; }, {} as Record<string, number>);
  const awaitingCash = orders.filter((order) => order.paymentMethod === "cash" && order.paymentStatus !== "paid");
  const pageCount = Math.max(1, Math.ceil(visibleOrders.length / pageSize));
  const pagedOrders = visibleOrders.slice((page - 1) * pageSize, page * pageSize);

  function exportCsv() {
    const rows = [["Order", "Date", "Method", "Payment status", "Job status", "Amount"], ...visibleOrders.map((o) => [o.code, o.createdAt, o.paymentMethod, o.paymentStatus, o.status, (o.amountPaise / 100).toFixed(2)])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `printly-${kind}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  async function confirmCash(order: ReportOrder, note = "") {
    setBusyOrder(order.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/shops/orders/${encodeURIComponent(order.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm_payment", ...(note.trim() ? { note: note.trim() } : {}) }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not record cash payment.");
      await loadOrders(); setNotice(`Cash payment for order #${order.code} recorded.`);
      setCashDialog(false); setCashOrderCode(""); setCashNote("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not record cash payment."); }
    finally { setBusyOrder(""); }
  }
  async function updatePayment(order: ReportOrder, action: "confirm_payment" | "cancel") {
    if (action === "cancel" && order.paymentStatus === "paid" && !window.confirm("This payment is already confirmed. Cancelling will not refund the customer; continue only if you will arrange any refund separately.")) return;
    if (action === "confirm_payment" && !window.confirm(`Confirm that you received ${money(order.amountPaise)} for order #${order.code}? Verify the payment in your account first.`)) return;
    setBusyOrder(order.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/shops/orders/${encodeURIComponent(order.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not update payment.");
      await loadOrders(); setNotice(action === "cancel" ? `Order #${order.code} cancelled.` : `Payment for order #${order.code} confirmed.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update payment."); }
    finally { setBusyOrder(""); }
  }

  return <div className="workspace-page" style={{ background: "#f8fafc", minHeight: "100vh" }}><main className="settings-main" style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 80px" }}>
    <div className="settings-title-row dashboard-tools-title"><div><h1>{kind === "payments" ? "Payments" : "Reports"}</h1><p>{kind === "payments" ? "Every order’s payment — mark UPI and cash payments as collected, or cancel them." : "Order activity and confirmed earnings for the selected period."}</p></div><div className="dashboard-tool-actions"><button type="button" className="button qr-secondary-button" onClick={exportCsv}><Download size={15} /> Export CSV</button>{kind === "payments" && <button type="button" className="button button-dark" onClick={() => setCashDialog(true)}>Record cash payment</button>}{kind === "reports" && <button type="button" className="button qr-secondary-button" onClick={() => window.print()}>Download PDF</button>}</div></div>
    {error && <p className="form-alert" role="alert">{error}</p>}{notice && <p className="success-alert" role="status"><Check size={15}/>{notice}</p>}
    {kind === "payments" && <div className="payment-kpi-grid"><article><small>Today collected</small><b>{money(todayCollected)}</b><span>{percentageLabel(todayCollected, yesterdayCollected)}</span></article><article><small>This month</small><b>{money(monthCollected)}</b><span>{percentageLabel(monthCollected, lastMonthCollected)}</span></article><article><small>UPI · this month</small><b>{money(monthUpi)}</b><span>{upiPaidOrders} paid · {monthCollected ? Math.round(monthUpi / monthCollected * 100) : 0}% of collected</span></article><article><small>Cash · this month</small><b>{money(monthCash)}</b><span>{cashPaidOrders} paid · {monthCollected ? Math.round(monthCash / monthCollected * 100) : 0}% of collected</span></article></div>}
    {kind === "reports" && <div className="order-filter-tabs">{([7, 30, 365] as const).map((days) => <button key={days} type="button" className={range === days ? "active" : ""} onClick={() => { setRange(days); setPage(1); }}>{days === 365 ? "12 months" : `${days} days`}</button>)}</div>}
    {kind === "payments" && <section className="payments-transactions"><div className="payments-transactions-heading"><h2>Transactions</h2><p>Record of every payment</p></div><div className="order-search-controls payment-filters"><label>Method<select value={method} onChange={(event) => { setMethod(event.target.value); setPage(1); }}><option value="all">All methods</option><option value="upi">UPI</option><option value="cash">Cash</option></select></label><label>Payment state<select value={paymentState} onChange={(event) => { setPaymentState(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="paid">Paid</option><option value="unverified">Pending</option><option value="awaiting_cash">Awaiting cash</option><option value="cancelled">Cancelled</option></select></label><label>From<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label><label>To<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label></div></section>}
    {kind === "reports" && <div className="order-search-controls"><label>From<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label><label>To<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label><label>Search order or file<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search file name or order id…" /></label></div>}
    {kind === "reports" && <><div className="order-count-strip"><span><b>{rangedOrders.length}</b> orders</span><span><b>{paid.length}</b> paid</span><span><b>{money(paid.reduce((sum, order) => sum + order.amountPaise, 0))}</b> confirmed</span><span><b>{rangedOrders.reduce((sum, order) => sum + order.files.reduce((n, file) => n + file.pageCount, 0), 0)}</b> source pages</span><span>Avg. order value <b>{money(avgOrder)}</b></span></div><div className="report-chart-card"><h2>Revenue trend</h2><div className="overview-bars">{trend.map((item) => <div className="overview-bar-column" key={item.label}><b>{money(item.amount)}</b><div className="overview-bar-track"><i style={{ height: `${Math.max(4, item.amount / trendMax * 100)}%` }} /></div><small>{item.label}</small></div>)}</div></div><section className="settings-card"><h2>Orders by hour</h2><div className="hour-chart">{hourCounts.map((count, hour) => <div className="hour-bar" title={`${hour}:00 · ${count} orders`} key={hour}><i style={{ height: `${Math.max(3, count / Math.max(1, ...hourCounts) * 100)}%` }} /><small>{hour % 3 === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}</small></div>)}</div></section><div className="order-count-strip"><span>UPI <b>{money(paymentTotals.upi ?? 0)}</b></span><span>Cash <b>{money(paymentTotals.cash ?? 0)}</b></span><span>PDF orders <b>{uploadTypes["PDF orders"] ?? 0}</b></span><span>Photo orders <b>{uploadTypes["Photo orders"] ?? 0}</b></span></div><section className="settings-card"><h2>Order breakdown</h2><div className="report-breakdown-grid"><div><b>Paper size</b>{Object.entries(paperTotals).map(([key, value]) => <p key={key}>{key}<strong>{value}</strong></p>)}</div><div><b>Print options</b>{Object.entries(colourTotals).map(([key, value]) => <p key={key}>{key}<strong>{value}</strong></p>)}</div><div><b>Photo layouts</b>{Object.entries(photoLayouts).length ? Object.entries(photoLayouts).map(([key, value]) => <p key={key}>{key.replaceAll("_", " ")}<strong>{value}</strong></p>) : <p>No photo orders</p>}</div></div></section></>}
    {kind === "payments" && <section className="payments-table-section"><div className="payment-table-wrap"><table className="payment-table"><thead><tr><th>Transaction</th><th>Order</th><th>Method</th><th>Amount</th><th>Status</th><th>Date</th><th /></tr></thead><tbody>{pagedOrders.map((order) => <tr key={order.id}><td>—</td><td><b>#{order.code}</b><small>{order.files.map((file) => file.name).join(", ")}</small></td><td>{order.paymentMethod === "upi" ? "UPI" : order.paymentMethod === "razorpay" ? "Razorpay" : "Cash"}</td><td><b>{money(order.amountPaise)}</b></td><td><span className={`order-status-pill status-${order.status === "cancelled" ? "cancelled" : order.paymentStatus}`}>{order.status === "cancelled" ? "Cancelled" : order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "awaiting_cash" ? "Pending" : "Pending"}</span></td><td>{new Date(order.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td><td className="payment-row-actions"><a href={`/dashboard/orders?order=${encodeURIComponent(order.id)}`}>View</a>{order.paymentStatus !== "paid" && !["cancelled", "rejected", "expired", "printed"].includes(order.status) && <button type="button" disabled={Boolean(busyOrder)} onClick={() => void updatePayment(order, "confirm_payment")}>{busyOrder === order.id ? "Saving…" : "Mark collected"}</button>}{!["cancelled", "rejected", "expired", "printed"].includes(order.status) && <button type="button" className="payment-cancel" disabled={Boolean(busyOrder)} onClick={() => void updatePayment(order, "cancel")}>Cancel</button>}</td></tr>)}</tbody></table>{pagedOrders.length === 0 && <p className="payment-table-empty">No matching transactions.</p>}</div></section>}
    {kind === "reports" && <section className="settings-card report-print-list"><h2>Orders in selected period</h2><div className="merchant-order-list">{pagedOrders.map((order) => <article className="merchant-order-card" key={order.id}><div className="merchant-order-heading"><b>#{order.code}</b><time>{new Date(order.createdAt).toLocaleString()}</time></div><div className="merchant-order-summary"><span>{order.paymentMethod.toUpperCase()} · {order.paymentStatus}</span><span>{order.status} · {order.files.reduce((sum, file) => sum + file.pageCount, 0)} pages</span><b>{money(order.amountPaise)}</b></div></article>)}{pagedOrders.length === 0 && <p>No orders for this period.</p>}</div></section>}
    <div className="order-pagination"><label>Rows per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as typeof pageSize); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><span>{visibleOrders.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, visibleOrders.length)} of {visibleOrders.length}</span><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div>
  </main>
  {cashDialog && <div className="shop-modal-backdrop" role="presentation" onClick={() => !busyOrder && setCashDialog(false)}><section className="shop-modal cash-record-modal" role="dialog" aria-modal="true" aria-labelledby="cash-dialog-title" onClick={(event) => event.stopPropagation()}><div className="settings-title-row"><div><h2 id="cash-dialog-title">Record cash payment</h2><p>Mark an order’s cash as collected at the counter — it then prints.</p></div><button type="button" className="shop-modal-close" aria-label="Close" disabled={Boolean(busyOrder)} onClick={() => setCashDialog(false)}><X size={18}/></button></div>{awaitingCash.length ? <form className="cash-record-form" onSubmit={(event) => { event.preventDefault(); const code = cashOrderCode.trim().replace(/^#/, "").toLowerCase(); const order = awaitingCash.find((candidate) => candidate.code.toLowerCase() === code); if (!order) { setError("No pending cash order matches that order id."); return; } void confirmCash(order, cashNote); }}><label>Order id<input required value={cashOrderCode} onChange={(event) => setCashOrderCode(event.target.value)} placeholder={`#${awaitingCash[0]?.code ?? "1001"}`} /></label><label>Note (optional)<textarea value={cashNote} maxLength={300} onChange={(event) => setCashNote(event.target.value)} placeholder="e.g. Gave 2 extra copies" /></label><div className="cash-record-actions"><button type="button" disabled={Boolean(busyOrder)} onClick={() => setCashDialog(false)}>Cancel</button><button className="button button-dark" type="submit" disabled={Boolean(busyOrder)}>{busyOrder ? <LoaderCircle className="spin" size={14}/> : <Check size={14}/>} Save payment</button></div></form> : <div className="orders-empty"><b>No cash payments to record</b><p>Orders using cash at counter will appear here until you mark them received.</p></div>}</section></div>}
  </div>;
}
