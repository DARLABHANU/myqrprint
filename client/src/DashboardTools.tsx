import { useEffect, useState } from "react";
import { ArrowLeft, Download, QrCode } from "lucide-react";

type ReportOrder = { code: string; status: string; paymentMethod: string; paymentStatus: string; amountPaise: number; createdAt: string; options?: { paperSize: string; colour: boolean; duplex: boolean; photoLayout?: string }; files: Array<{ name: string; pageCount: number; mediaType: string }> };

export function DashboardTools({ kind }: { kind: "payments" | "reports" }) {
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [range, setRange] = useState<7 | 30 | 365>(30);
  const [method, setMethod] = useState("all");
  const [paymentState, setPaymentState] = useState("all");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/shops/orders", { credentials: "same-origin" }).then(async (response) => {
      if (response.status === 401) { window.location.assign("/login"); return; }
      if (!response.ok) throw new Error("Could not load shop orders.");
      const body = await response.json() as { orders: ReportOrder[] };
      setOrders(body.orders);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load data."));
  }, []);
  const cutoff = Date.now() - range * 24 * 60 * 60 * 1000;
  const rangedOrders = orders.filter((order) => {
    const created = new Date(order.createdAt).getTime();
    return created >= cutoff && (!dateFrom || created >= new Date(`${dateFrom}T00:00:00`).getTime()) && (!dateTo || created <= new Date(`${dateTo}T23:59:59.999`).getTime());
  });
  const visibleOrders = rangedOrders.filter((order) => {
    if (method !== "all" && order.paymentMethod !== method) return false;
    if (paymentState !== "all" && order.paymentStatus !== paymentState) return false;
    const search = query.trim().toLowerCase();
    return !search || order.code.toLowerCase().includes(search) || order.files.some((file) => file.name.toLowerCase().includes(search));
  });
  const paid = rangedOrders.filter((order) => order.paymentStatus === "paid");
  const paymentTotals = paid.reduce((totals, order) => ({ ...totals, [order.paymentMethod]: (totals[order.paymentMethod] ?? 0) + order.amountPaise }), {} as Record<string, number>);
  const uploadTypes = rangedOrders.reduce((totals, order) => {
    const isPhoto = order.files.some((file) => file.mediaType.startsWith("image/"));
    const type = isPhoto ? "Photo orders" : "PDF orders";
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
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const todayCollected = orders.filter((order) => order.paymentStatus === "paid" && new Date(order.createdAt) >= todayStart).reduce((sum, order) => sum + order.amountPaise, 0);
  const monthCollected = orders.filter((order) => order.paymentStatus === "paid" && new Date(order.createdAt) >= monthStart).reduce((sum, order) => sum + order.amountPaise, 0);
  const avgOrder = paid.length ? Math.round(paid.reduce((sum, order) => sum + order.amountPaise, 0) / paid.length) : 0;
  const hourCounts = Array.from({ length: 24 }, (_, hour) => rangedOrders.filter((order) => new Date(order.createdAt).getHours() === hour).length);
  const photoLayouts = rangedOrders.filter((order) => order.options?.photoLayout).reduce((totals, order) => { const layout = order.options?.photoLayout ?? "unknown"; return { ...totals, [layout]: (totals[layout] ?? 0) + 1 }; }, {} as Record<string, number>);
  const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
  function exportCsv() {
    const rows = [["Order", "Date", "Method", "Payment status", "Job status", "Amount"], ...visibleOrders.map((o) => [o.code, o.createdAt, o.paymentMethod, o.paymentStatus, o.status, (o.amountPaise / 100).toFixed(2)])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `printly-${kind}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="workspace-page"><header className="workspace-header"><a className="brand" href="/"><span className="brand-mark"><QrCode size={20} /></span><span>printly.</span></a><a className="back-link" href="/dashboard"><ArrowLeft size={15} /> Dashboard</a></header><main className="settings-main"><div className="eyebrow"><span className="eyebrow-dot" /> SHOP MANAGEMENT</div><h1>{kind === "payments" ? "Payment records" : "Shop reports"}</h1><p>{kind === "payments" ? "Direct UPI and cash amounts confirmed by the shopkeeper." : "Order activity and confirmed earnings for the selected period."}</p>{error && <p role="alert">{error}</p>}{kind === "payments" && <div className="order-count-strip"><span>Today collected <b>{money(todayCollected)}</b></span><span>This month <b>{money(monthCollected)}</b></span><span>UPI <b>{money(paymentTotals.upi ?? 0)}</b></span><span>Cash <b>{money(paymentTotals.cash ?? 0)}</b></span></div>}<div className="order-filter-tabs">{([7, 30, 365] as const).map((days) => <button key={days} type="button" className={range === days ? "active" : ""} onClick={() => setRange(days)}>{days === 365 ? "12 months" : `${days} days`}</button>)}</div><div className="order-search-controls"><label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label><label>Search order or file<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pickup code or filename" /></label>{kind === "payments" && <><label>Method<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="all">All methods</option><option value="upi">UPI</option><option value="cash">Cash</option></select></label><label>Payment state<select value={paymentState} onChange={(event) => setPaymentState(event.target.value)}><option value="all">All states</option><option value="paid">Confirmed</option><option value="unverified">Unverified</option><option value="awaiting_cash">Awaiting cash</option></select></label></>}</div><button type="button" className="button button-dark" onClick={exportCsv}><Download size={15} /> Export CSV</button>{kind === "reports" && <button type="button" className="button qr-secondary-button" onClick={() => window.print()}>Print / Save PDF</button>}<div className="order-count-strip"><span><b>{rangedOrders.length}</b> orders</span><span><b>{paid.length}</b> paid</span><span><b>{money(paid.reduce((sum, order) => sum + order.amountPaise, 0))}</b> confirmed</span><span><b>{rangedOrders.reduce((sum, order) => sum + order.files.reduce((n, file) => n + file.pageCount, 0), 0)}</b> source pages</span>{kind === "reports" && <span>Avg. order value <b>{money(avgOrder)}</b></span>}</div>{kind === "reports" && <><div className="report-chart-card"><h2>Revenue trend</h2><div className="overview-bars">{trend.map((item) => <div className="overview-bar-column" key={item.label}><b>{money(item.amount)}</b><div className="overview-bar-track"><i style={{height:`${Math.max(4,item.amount/trendMax*100)}%`}}/></div><small>{item.label}</small></div>)}</div></div><section className="settings-card"><h2>Orders by hour</h2><div className="hour-chart">{hourCounts.map((count, hour) => <div className="hour-bar" title={`${hour}:00 · ${count} orders`} key={hour}><i style={{height:`${Math.max(3,count/Math.max(1,...hourCounts)*100)}%`}}/><small>{hour % 3 === 0 ? `${String(hour).padStart(2,"0")}:00` : ""}</small></div>)}</div></section><div className="order-count-strip"><span>UPI <b>{money(paymentTotals.upi ?? 0)}</b></span><span>Cash <b>{money(paymentTotals.cash ?? 0)}</b></span><span>PDF orders <b>{uploadTypes["PDF orders"] ?? 0}</b></span><span>Photo orders <b>{uploadTypes["Photo orders"] ?? 0}</b></span></div><div className="order-count-strip"><span>By paper {Object.entries(paperTotals).map(([key,value]) => <b key={key}>{key}: {value} · </b>)}</span><span>{Object.entries(colourTotals).map(([key,value]) => <b key={key}>{key}: {value} · </b>)}</span></div><section className="settings-card"><h2>Photo layout usage</h2>{Object.entries(photoLayouts).length ? Object.entries(photoLayouts).map(([key,value]) => <p key={key}>{key.replaceAll("_", " ")}: <b>{value}</b></p>) : <p>No photo-layout orders in this period.</p>}</section></>}<div className="merchant-order-list">{kind === "payments" && <p>To confirm cash or UPI receipts, open the related job and use its payment action. Printly does not collect or verify funds automatically.</p>}{visibleOrders.map((order) => <article className="merchant-order-card" key={order.code}><div className="merchant-order-heading"><b>#{order.code}</b><time>{new Date(order.createdAt).toLocaleString()}</time></div><div className="merchant-order-summary"><span>{order.paymentMethod.toUpperCase()} · {order.paymentStatus}</span><span>{order.status} · {order.files.reduce((sum, file) => sum + file.pageCount, 0)} pages</span><b>{money(order.amountPaise)}</b></div><a href="/dashboard/orders">Manage order</a></article>)}{visibleOrders.length === 0 && !error && <p>No matching orders for this period.</p>}</div></main></div>;
}
