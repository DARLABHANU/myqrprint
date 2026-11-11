import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Image, Printer } from "lucide-react";

type ReportOrder = {
  id: string; code: string; status: string; paymentMethod: "upi" | "cash"; paymentStatus: string;
  amountPaise: number; createdAt: string;
  options: { paperSize: string; colour: boolean; duplex: boolean; copies: number; photoLayout?: string };
  files: Array<{ name: string; pageCount: number; mediaType: string }>;
};
type Rate = { blackWhiteSimplexPaise: number; colourSimplexPaise: number; blackWhiteDuplexSheetPaise: number; colourDuplexSheetPaise: number };
type ReportShop = { enabledPaperSizes: string[]; colourEnabled: boolean; duplexEnabled: boolean; rates: Record<string, Rate> };
type Period = 7 | 30 | 365;
const money = (paise: number) => `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;
const photoLayouts = [["single", "1 per page"], ["four", "4 per page"], ["six", "6 per page"], ["nine", "9 per page"], ["two_stack", "2 per page · Stacked"], ["two_side_by_side", "2 per page · Side by side"]] as const;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (response.status === 401) { window.location.assign("/login"); throw new Error("Sign in required."); }
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Could not load shop reports.");
  return body;
}

function printPages(order: ReportOrder) { return order.files.reduce((sum, file) => sum + file.pageCount, 0) * (order.options?.copies ?? 1); }
function paymentShare(orders: ReportOrder[], method: "upi" | "cash", revenue: number) {
  const matching = orders.filter((order) => order.paymentStatus === "paid" && order.paymentMethod === method);
  const amount = matching.reduce((sum, order) => sum + order.amountPaise, 0);
  return { amount, count: matching.length, percent: revenue ? Math.round(amount / revenue * 100) : 0 };
}

export function ReportsDashboardPage() {
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [shop, setShop] = useState<ReportShop | null>(null);
  const [range, setRange] = useState<Period>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([getJson<{ orders: ReportOrder[] }>("/api/shops/orders"), getJson<{ shop: ReportShop }>("/api/shops/me")])
      .then(([orderData, shopData]) => { setOrders(orderData.orders); setShop(shopData.shop); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load shop reports."))
      .finally(() => setLoading(false));
  }, []);

  const now = Date.now();
  const periodMs = range * 86_400_000;
  const currentStart = now - periodMs;
  const previousStart = currentStart - periodMs;
  const currentOrders = orders.filter((order) => new Date(order.createdAt).getTime() >= currentStart);
  const previousOrders = orders.filter((order) => { const created = new Date(order.createdAt).getTime(); return created >= previousStart && created < currentStart; });
  const printed = currentOrders.filter((order) => order.status === "printed");
  const previousPrinted = previousOrders.filter((order) => order.status === "printed");
  const paidPrinted = printed.filter((order) => order.paymentStatus === "paid");
  const previousPaidPrinted = previousPrinted.filter((order) => order.paymentStatus === "paid");
  const revenue = paidPrinted.reduce((sum, order) => sum + order.amountPaise, 0);
  const previousRevenue = previousPaidPrinted.reduce((sum, order) => sum + order.amountPaise, 0);
  const pages = printed.reduce((sum, order) => sum + printPages(order), 0);
  const previousPages = previousPrinted.reduce((sum, order) => sum + printPages(order), 0);
  const average = printed.length ? Math.round(revenue / printed.length) : 0;
  const previousAverage = previousPrinted.length ? Math.round(previousRevenue / previousPrinted.length) : 0;
  const percentLabel = (current: number, previous: number) => `${current >= previous ? "↗" : "↘"} ${previous === 0 ? current > 0 ? "New" : "0%" : `${Math.round(Math.abs(current - previous) / previous * 100)}%`} vs previous period`;
  const periodLabel = range === 7 ? "Last 7 days" : range === 30 ? "Last 30 days" : "Last 12 months";

  const revenueBars = useMemo(() => {
    if (range === 365) return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(); date.setMonth(date.getMonth() - 11 + index, 1);
      const amount = paidPrinted.filter((order) => { const created = new Date(order.createdAt); return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth(); }).reduce((sum, order) => sum + order.amountPaise, 0);
      return { label: date.toLocaleDateString(undefined, { month: "short" }), amount };
    });
    const count = range === 7 ? 7 : 30;
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (count - 1 - index));
      const amount = paidPrinted.filter((order) => new Date(order.createdAt).toDateString() === date.toDateString()).reduce((sum, order) => sum + order.amountPaise, 0);
      return { label: range === 7 ? date.toLocaleDateString(undefined, { weekday: "short" }) : date.getDate() % 5 === 1 ? String(date.getDate()) : "", amount };
    });
  }, [paidPrinted, range]);
  const maxRevenue = Math.max(1, ...revenueBars.map((bar) => bar.amount));
  const methodTotals = [
    { method: "upi", label: "UPI", description: "Paid directly to your shop", icon: "upi" as const, ...paymentShare(printed, "upi", revenue) },
    { method: "cash", label: "Cash", description: "Collected at the counter", icon: "cash" as const, ...paymentShare(printed, "cash", revenue) },
  ];
  const pageRows = (shop?.enabledPaperSizes ?? ["A4"]).flatMap((paperSize) => [false, ...(shop?.colourEnabled ? [true] : [])].map((colour) => {
    const matching = printed.filter((order) => order.options.paperSize === paperSize && order.options.colour === colour);
    const singleSide = matching.filter((order) => !order.options.duplex);
    const bothSides = matching.filter((order) => order.options.duplex);
    const sumPages = (items: ReportOrder[]) => items.reduce((sum, order) => sum + printPages(order), 0);
    const duplexSheets = bothSides.reduce((sum, order) => sum + order.files.reduce((fileSum, file) => fileSum + Math.ceil(file.pageCount / 2), 0) * (order.options.copies ?? 1), 0);
    const rate = shop?.rates?.[paperSize];
    const oneSideRate = rate ? colour ? rate.colourSimplexPaise : rate.blackWhiteSimplexPaise : 0;
    const bothSideRate = rate ? colour ? rate.colourDuplexSheetPaise : rate.blackWhiteDuplexSheetPaise : 0;
    return { paperSize, colour, oneSidePages: sumPages(singleSide), bothSidePages: sumPages(bothSides), duplexSheets, revenue: matching.filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.amountPaise, 0), oneSideRate, bothSideRate };
  }));
  const paperRevenue = (shop?.enabledPaperSizes ?? ["A4"]).map((paperSize) => ({ paperSize, revenue: pageRows.filter((row) => row.paperSize === paperSize).reduce((sum, row) => sum + row.revenue, 0) }));
  const documentFiles = currentOrders.flatMap((order) => order.files).filter((file) => file.mediaType === "application/pdf").length;
  const photoFiles = currentOrders.flatMap((order) => order.files).filter((file) => file.mediaType.startsWith("image/")).length;
  const uploadTotal = documentFiles + photoFiles;
  const layoutCounts = currentOrders.filter((order) => order.files.some((file) => file.mediaType.startsWith("image/"))).reduce((result, order) => { const key = order.options.photoLayout ?? "single"; return { ...result, [key]: (result[key] ?? 0) + 1 }; }, {} as Record<string, number>);
  const hours = Array.from({ length: 24 }, (_, hour) => printed.filter((order) => new Date(order.createdAt).getHours() === hour).length);
  const peakCount = Math.max(0, ...hours);
  const peakHour = peakCount ? `${String(hours.findIndex((count) => count === peakCount)).padStart(2, "0")}:00` : "—";

  function exportCsv() {
    const rows = [["Order", "Date", "Payment method", "Payment status", "Paper", "Colour", "Sides", "Pages", "Copies", "Revenue"], ...printed.map((order) => [order.code, order.createdAt, order.paymentMethod, order.paymentStatus, order.options.paperSize, order.options.colour ? "Colour" : "B&W", order.options.duplex ? "Both sides" : "One side", printPages(order), order.options.copies ?? 1, (order.amountPaise / 100).toFixed(2)])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "printly-reports.csv"; link.click(); URL.revokeObjectURL(url);
  }

  if (loading) return <div className="workspace-loading"><Printer size={20}/> Loading reports…</div>;
  return <div className="workspace-page"><main className="settings-main reports-page-main">
    <header className="reports-page-heading"><div><h1>Reports</h1><p>Earnings, orders and pages — broken down by paper, colour, sides, uploads and payment method.</p></div><div className="reports-actions"><button type="button" onClick={exportCsv}><Download size={14}/> Export CSV</button><button type="button" onClick={() => window.print()}><FileText size={14}/> Download PDF</button></div></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
    <div className="reports-period-row"><div className="reports-period-tabs">{([7, 30, 365] as const).map((days) => <button key={days} type="button" className={range === days ? "active" : ""} onClick={() => setRange(days)}>{days === 365 ? "12 months" : `${days} days`}</button>)}</div><span>▦ &nbsp;{periodLabel}</span></div>
    <div className="report-kpi-grid"><article><div><small>Revenue</small><b>{money(revenue)}</b></div><span>{percentLabel(revenue, previousRevenue)}</span></article><article><div><small>Orders</small><b>{printed.length}</b></div><span>{percentLabel(printed.length, previousPrinted.length)}</span></article><article><div><small>Pages printed</small><b>{pages}</b></div><span>{percentLabel(pages, previousPages)}</span></article><article><div><small>Avg order value</small><b>{money(average)}</b></div><span>{percentLabel(average, previousAverage)}</span></article></div>
    <section className="report-chart-card reports-revenue-card"><div className="reports-card-heading"><div><h2>Revenue</h2><p>{periodLabel} — earnings from printed orders</p></div><div><b>{money(revenue)}</b><small>Total</small></div></div>{printed.length ? <div className={`reports-revenue-bars${range === 30 ? " is-month" : ""}`}>{revenueBars.map((bar, index) => <div className="reports-revenue-bar" key={`${bar.label}-${index}`} title={`${bar.label} · ${money(bar.amount)}`}><b>{money(bar.amount)}</b><span><i style={{ height: `${Math.max(3, bar.amount / maxRevenue * 100)}%` }}/></span><small>{bar.label}</small></div>)}</div> : <div className="report-empty-message">No printed orders in this period yet.</div>}</section>
    <section className="settings-card report-card"><div className="reports-card-heading"><div><h2>Payment methods</h2><p>How customers paid for printed orders</p></div></div>{methodTotals.map((method) => <div className="report-method-row" key={method.method}><span className={`report-method-icon ${method.icon}`}>{method.icon === "upi" ? "▦" : "▣"}</span><div className="report-method-info"><div><b>{method.label}</b><strong>{money(method.amount)} · {method.percent}%</strong></div><small>{method.description}</small><i><span style={{ width: `${method.percent}%` }}/></i><small>{method.count} {method.count === 1 ? "order" : "orders"}</small></div></div>)}</section>
    <section className="settings-card report-card"><div className="reports-card-heading"><div><h2>Pages by paper, colour & sides</h2><p>Priced with your current rates</p></div></div><div className="reports-page-table-wrap"><table className="reports-page-table"><thead><tr><th>Print</th><th>One side</th><th>Both sides</th><th>Revenue</th></tr></thead><tbody>{pageRows.map((row) => <tr key={`${row.paperSize}-${row.colour}`}><td><b><i className={row.colour ? "colour-dot" : "bw-dot"}/>{row.paperSize} · {row.colour ? "Colour" : "B&W"}</b><small>{money(row.oneSideRate)}/page · {money(row.bothSideRate)}/sheet</small></td><td>{row.oneSidePages} pg</td><td>{row.bothSidePages} pg<small>{row.duplexSheets} sheets</small></td><td><b>{money(row.revenue)}</b></td></tr>)}</tbody></table></div><div className="report-paper-summary">{paperRevenue.map((item) => <div key={item.paperSize}><span>{item.paperSize}</span><b>{money(item.revenue)}</b><small>0 pages · {revenue ? Math.round(item.revenue / revenue * 100) : 0}% of revenue</small></div>)}</div></section>
    <section className="settings-card report-card"><div className="reports-card-heading"><div><h2>Uploads</h2><p>Documents vs photos</p></div></div><div className="report-upload-bar"><i style={{ width: `${uploadTotal ? documentFiles / uploadTotal * 100 : 0}%` }}/><i style={{ width: `${uploadTotal ? photoFiles / uploadTotal * 100 : 0}%` }}/></div><div className="report-upload-split"><div><span className="report-file-icon document"><FileText size={14}/></span><b>{documentFiles}</b><small>Documents · {uploadTotal ? Math.round(documentFiles / uploadTotal * 100) : 0}%</small></div><div><span className="report-file-icon photo"><Image size={14}/></span><b>{photoFiles}</b><small>Photos · {uploadTotal ? Math.round(photoFiles / uploadTotal * 100) : 0}%</small></div></div><h3 className="report-subheading">Photos per page</h3><div className="report-layout-list">{photoLayouts.map(([key, label]) => { const count = layoutCounts[key] ?? 0; return <div key={key}><span>{label}</span><i><b style={{ width: `${uploadTotal ? count / Math.max(1, photoFiles) * 100 : 0}%` }}/></i><small>{count} {count === 1 ? "order" : "orders"}</small></div>; })}</div></section>
    <section className="settings-card report-card"><div className="reports-card-heading"><div><h2>Orders by hour of day</h2><p>All 24 hours — your busiest times ({periodLabel.toLowerCase()})</p></div><div><b>{peakHour}</b><small>Peak hour</small></div></div>{printed.length ? <div className="hour-chart">{hours.map((count, hour) => <div className="hour-bar" title={`${String(hour).padStart(2, "0")}:00 · ${count} orders`} key={hour}><i style={{ height: `${Math.max(3, count / Math.max(1, ...hours) * 100)}%` }}/><small>{hour % 3 === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}</small></div>)}</div> : <div className="report-empty-message">No printed orders in this period yet.</div>}</section>
  </main></div>;
}
