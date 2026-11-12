import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Calendar,
  Columns,
  CreditCard,
  Download,
  FileText,
  Grid,
  Image as ImageIcon,
  IndianRupee,
  LayoutGrid,
  Printer,
  QrCode,
  Rows,
  Smartphone,
  Store,
  TrendingUp,
} from "lucide-react";

type ReportOrder = {
  id: string;
  code: string;
  status: string;
  paymentMethod: "upi" | "cash" | "razorpay";
  paymentStatus: string;
  amountPaise: number;
  createdAt: string;
  options: {
    paperSize: string;
    colour: boolean;
    duplex: boolean;
    copies: number;
    photoLayout?: string;
  };
  files: Array<{ name: string; pageCount: number; mediaType: string }>;
};

type Rate = {
  blackWhiteSimplexPaise: number;
  colourSimplexPaise: number;
  blackWhiteDuplexSheetPaise: number;
  colourDuplexSheetPaise: number;
};

type ReportShop = {
  enabledPaperSizes: string[];
  colourEnabled: boolean;
  duplexEnabled: boolean;
  rates: Record<string, Rate>;
};

type Period = 7 | 30 | 365;

const money = (paise: number) => `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;

const photoLayoutList = [
  { key: "single", label: "1 per page", icon: Smartphone },
  { key: "four", label: "4 per page", icon: LayoutGrid },
  { key: "six", label: "6 per page", icon: Grid },
  { key: "nine", label: "9 per page", icon: Grid },
  { key: "two_stack", label: "2 per page · Stacked", icon: Rows },
  { key: "two_side_by_side", label: "2 per page · Side by side", icon: Columns },
] as const;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("Sign in required.");
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Could not load shop reports.");
  return body;
}

function printPages(order: ReportOrder) {
  return order.files.reduce((sum, file) => sum + file.pageCount, 0) * (order.options?.copies ?? 1);
}

function paymentShare(orders: ReportOrder[], method: string, totalRevenue: number) {
  const matching = orders.filter((order) => order.paymentStatus === "paid" && order.paymentMethod === method);
  const amount = matching.reduce((sum, order) => sum + order.amountPaise, 0);
  return {
    amount,
    count: matching.length,
    percent: totalRevenue ? Math.round((amount / totalRevenue) * 100) : 0,
  };
}

export function ReportsDashboardPage() {
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [shop, setShop] = useState<ReportShop | null>(null);
  const [range, setRange] = useState<Period>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      getJson<{ orders: ReportOrder[] }>("/api/shops/orders"),
      getJson<{ shop: ReportShop }>("/api/shops/me"),
    ])
      .then(([orderData, shopData]) => {
        setOrders(orderData.orders || []);
        setShop(shopData.shop || null);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load shop reports."))
      .finally(() => setLoading(false));
  }, []);

  const now = Date.now();
  const periodMs = range * 86_400_000;
  const currentStart = now - periodMs;
  const previousStart = currentStart - periodMs;

  const currentOrders = orders.filter((order) => new Date(order.createdAt).getTime() >= currentStart);
  const previousOrders = orders.filter((order) => {
    const created = new Date(order.createdAt).getTime();
    return created >= previousStart && created < currentStart;
  });

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

  const getPercentDiff = (curr: number, prev: number) => {
    if (prev === 0) return { label: curr > 0 ? "New" : "0%", isPositive: true };
    const diff = Math.round(((curr - prev) / prev) * 100);
    return { label: `${Math.abs(diff)}%`, isPositive: diff >= 0 };
  };

  const periodLabel = range === 7 ? "Last 7 days" : range === 30 ? "Last 30 days" : "Last 12 months";

  // Revenue bars
  const revenueBars = useMemo(() => {
    if (range === 365) {
      return Array.from({ length: 12 }, (_, index) => {
        const date = new Date();
        date.setMonth(date.getMonth() - 11 + index, 1);
        const amount = paidPrinted
          .filter((order) => {
            const created = new Date(order.createdAt);
            return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth();
          })
          .reduce((sum, order) => sum + order.amountPaise, 0);
        return { label: date.toLocaleDateString(undefined, { month: "short" }), amount };
      });
    }
    const count = range === 7 ? 7 : 30;
    return Array.from({ length: count }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (count - 1 - index));
      const amount = paidPrinted
        .filter((order) => new Date(order.createdAt).toDateString() === date.toDateString())
        .reduce((sum, order) => sum + order.amountPaise, 0);
      return {
        label: range === 7 ? date.toLocaleDateString(undefined, { weekday: "short" }) : date.getDate() % 5 === 1 ? String(date.getDate()) : "",
        amount,
      };
    });
  }, [paidPrinted, range]);

  const maxRevenue = Math.max(1, ...revenueBars.map((bar) => bar.amount));

  // Payment methods
  const methodTotals = [
    {
      method: "upi",
      label: "UPI",
      description: "Straight to your UPI ID",
      iconType: "upi",
      ...paymentShare(printed, "upi", revenue),
    },
    {
      method: "razorpay",
      label: "Razorpay",
      description: "To your wallet",
      iconType: "razorpay",
      ...paymentShare(printed, "razorpay", revenue),
    },
    {
      method: "cash",
      label: "Cash",
      description: "Collected at the counter",
      iconType: "cash",
      ...paymentShare(printed, "cash", revenue),
    },
  ];

  // Pages by paper, colour & sides
  const pageRows = (shop?.enabledPaperSizes ?? ["A4"]).flatMap((paperSize) =>
    [false, ...(shop?.colourEnabled !== false ? [true] : [])].map((colour) => {
      const matching = printed.filter((order) => order.options.paperSize === paperSize && order.options.colour === colour);
      const singleSide = matching.filter((order) => !order.options.duplex);
      const bothSides = matching.filter((order) => order.options.duplex);
      const sumPages = (items: ReportOrder[]) => items.reduce((sum, order) => sum + printPages(order), 0);
      const duplexSheets = bothSides.reduce(
        (sum, order) => sum + order.files.reduce((fileSum, file) => fileSum + Math.ceil(file.pageCount / 2), 0) * (order.options.copies ?? 1),
        0
      );
      const rate = shop?.rates?.[paperSize];
      const oneSideRate = rate ? (colour ? rate.colourSimplexPaise : rate.blackWhiteSimplexPaise) : 0;
      const bothSideRate = rate ? (colour ? rate.colourDuplexSheetPaise : rate.blackWhiteDuplexSheetPaise) : 0;
      return {
        paperSize,
        colour,
        oneSidePages: sumPages(singleSide),
        bothSidePages: sumPages(bothSides),
        duplexSheets,
        revenue: matching.filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.amountPaise, 0),
        oneSideRate,
        bothSideRate,
      };
    })
  );

  const paperRevenue = (shop?.enabledPaperSizes ?? ["A4"]).map((paperSize) => {
    const matchingRows = pageRows.filter((row) => row.paperSize === paperSize);
    const rev = matchingRows.reduce((sum, row) => sum + row.revenue, 0);
    const totalPgs = matchingRows.reduce((sum, row) => sum + row.oneSidePages + row.bothSidePages, 0);
    return {
      paperSize,
      pages: totalPgs,
      revenue: rev,
      percent: revenue ? Math.round((rev / revenue) * 100) : 0,
    };
  });

  // Uploads
  const documentFiles = currentOrders.flatMap((order) => order.files).filter((file) => file.mediaType === "application/pdf").length;
  const photoFiles = currentOrders.flatMap((order) => order.files).filter((file) => file.mediaType.startsWith("image/")).length;
  const uploadTotal = documentFiles + photoFiles;

  const layoutCounts = currentOrders
    .filter((order) => order.files.some((file) => file.mediaType.startsWith("image/")))
    .reduce((result, order) => {
      const key = order.options.photoLayout ?? "single";
      return { ...result, [key]: (result[key] ?? 0) + 1 };
    }, {} as Record<string, number>);

  // Orders by hour of day
  const hours = Array.from({ length: 24 }, (_, hour) => printed.filter((order) => new Date(order.createdAt).getHours() === hour).length);
  const peakCount = Math.max(0, ...hours);
  const peakHour = peakCount ? `${String(hours.findIndex((count) => count === peakCount)).padStart(2, "0")}:00` : "—";

  function exportCsv() {
    const rows = [
      ["Order", "Date", "Payment method", "Payment status", "Paper", "Colour", "Sides", "Pages", "Copies", "Revenue"],
      ...printed.map((order) => [
        order.code,
        order.createdAt,
        order.paymentMethod,
        order.paymentStatus,
        order.options.paperSize,
        order.options.colour ? "Colour" : "B&W",
        order.options.duplex ? "Both sides" : "One side",
        printPages(order),
        order.options.copies ?? 1,
        (order.amountPaise / 100).toFixed(2),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `printly-reports-${range}days.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="workspace-loading" style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#64748b" }}>
        <Printer size={22} className="spin" />
        <span style={{ fontSize: 14, fontWeight: 500 }}>Loading reports…</span>
      </div>
    );
  }

  const kpis = [
    {
      title: "Revenue",
      value: money(revenue),
      diff: getPercentDiff(revenue, previousRevenue),
      icon: CreditCard,
    },
    {
      title: "Orders",
      value: String(printed.length),
      diff: getPercentDiff(printed.length, previousPrinted.length),
      icon: FileText,
    },
    {
      title: "Pages printed",
      value: String(pages),
      diff: getPercentDiff(pages, previousPages),
      icon: Printer,
    },
    {
      title: "Avg order value",
      value: money(average),
      diff: getPercentDiff(average, previousAverage),
      icon: BarChart2,
    },
  ];

  return (
    <div className="workspace-page" style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <main className="settings-main reports-page-main" style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 80px" }}>
        {/* Header Row */}
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: 0, fontFamily: "Manrope, sans-serif", letterSpacing: "-0.5px" }}>
              Reports
            </h1>
            <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>
              Earnings, orders and pages — broken down by paper, colour, sides, uploads and payment method.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button
              type="button"
              onClick={exportCsv}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 16px",
                borderRadius: 8,
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                color: "#1e293b",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                transition: "all 0.15s",
              }}
            >
              <Download size={14} style={{ color: "#64748b" }} /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 16px",
                borderRadius: 8,
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                color: "#1e293b",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                transition: "all 0.15s",
              }}
            >
              <FileText size={14} style={{ color: "#64748b" }} /> Download PDF
            </button>
          </div>
        </header>

        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Filter Period Row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "inline-flex", padding: 3, background: "#f1f5f9", borderRadius: 8, gap: 2 }}>
            {([7, 30, 365] as const).map((days) => {
              const active = range === days;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => setRange(days)}
                  style={{
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    background: active ? "#ffffff" : "transparent",
                    color: active ? "#0f172a" : "#64748b",
                    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {days === 365 ? "12 months" : `${days} days`}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 13, fontWeight: 500 }}>
            <Calendar size={14} />
            <span>{periodLabel}</span>
          </div>
        </div>

        {/* Top 4 KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 20 }}>
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.title}
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: "18px 20px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>{kpi.title}</span>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "#ecfdf5",
                      color: "#10b981",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Icon size={16} />
                  </div>
                </div>
                <div style={{ margin: "10px 0 6px" }}>
                  <b style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", fontFamily: "Manrope, sans-serif" }}>
                    {kpi.value}
                  </b>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#10b981", fontWeight: 600 }}>
                  <TrendingUp size={13} />
                  <span>{kpi.diff.label} vs previous period</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Section 1: Revenue Chart & Payment Methods */}
        <div style={{ display: "grid", gridTemplateColumns: "1.9fr 1.1fr", gap: 16, marginBottom: 16 }}>
          {/* Revenue Card */}
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>Revenue</h2>
                <p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 0" }}>{periodLabel} — earnings from printed orders</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <b style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", fontFamily: "Manrope, sans-serif" }}>
                  {money(revenue)}
                </b>
                <div style={{ fontSize: 11, color: "#64748b" }}>Total</div>
              </div>
            </div>

            {printed.length > 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: range === 7 ? 16 : 6, height: 210, paddingTop: 10 }}>
                {revenueBars.map((bar, index) => {
                  const heightPercent = Math.max(4, Math.round((bar.amount / maxRevenue) * 100));
                  return (
                    <div
                      key={`${bar.label}-${index}`}
                      title={`${bar.label}: ${money(bar.amount)}`}
                      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}
                    >
                      <div
                        style={{
                          width: "100%",
                          maxWidth: range === 7 ? 42 : 12,
                          height: `${heightPercent}%`,
                          background: bar.amount > 0 ? "#10b981" : "#e2e8f0",
                          borderRadius: 4,
                          transition: "height 0.2s ease",
                        }}
                      />
                      <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, whiteSpace: "nowrap" }}>
                        {bar.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 210, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
                No printed orders in this period yet.
              </div>
            )}
          </div>

          {/* Payment Methods Card */}
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>Payment methods</h2>
              <p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 0" }}>How customers paid</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {methodTotals.map((item) => {
                const isUpi = item.iconType === "upi";
                const isRazorpay = item.iconType === "razorpay";
                const isCash = item.iconType === "cash";

                const iconBg = isUpi ? "#f3e8ff" : isRazorpay ? "#e0f2fe" : "#fef3c7";
                const iconColor = isUpi ? "#9333ea" : isRazorpay ? "#0284c7" : "#d97706";
                const IconComponent = isUpi ? QrCode : isRazorpay ? CreditCard : Store;

                return (
                  <div key={item.method} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 9,
                          background: iconBg,
                          color: iconColor,
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <IconComponent size={18} />
                      </div>
                      <div>
                        <b style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{item.label}</b>
                        <p style={{ fontSize: 11, color: "#64748b", margin: "2px 0 0" }}>{item.description}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <b style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                        {money(item.amount)} · {item.percent}%
                      </b>
                      <p style={{ fontSize: 11, color: "#64748b", margin: "2px 0 0" }}>
                        {item.count} {item.count === 1 ? "order" : "orders"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Section 2: Pages by paper, colour & sides + Uploads */}
        <div style={{ display: "grid", gridTemplateColumns: "1.9fr 1.1fr", gap: 16, marginBottom: 16 }}>
          {/* Pages by paper, colour & sides Card */}
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>Pages by paper, colour & sides</h2>
              <p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 0" }}>Priced with your current rates</p>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <th style={{ padding: "8px 0", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>PRINT</th>
                    <th style={{ padding: "8px 0", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center" }}>ONE SIDE</th>
                    <th style={{ padding: "8px 0", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center" }}>BOTH SIDES</th>
                    <th style={{ padding: "8px 0", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>REVENUE</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={`${row.paperSize}-${row.colour}`} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "14px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: row.colour ? "linear-gradient(135deg, #a855f7, #ec4899, #3b82f6)" : "#0f172a",
                            }}
                          />
                          <b style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                            {row.paperSize} · {row.colour ? "Colour" : "B&W"}
                          </b>
                        </div>
                        <span style={{ fontSize: 11, color: "#64748b", marginLeft: 16 }}>
                          {money(row.oneSideRate)}/page · {money(row.bothSideRate)}/sheet
                        </span>
                      </td>
                      <td style={{ padding: "14px 0", textAlign: "center", fontSize: 13, color: "#0f172a" }}>
                        {row.oneSidePages} pg
                      </td>
                      <td style={{ padding: "14px 0", textAlign: "center" }}>
                        <div style={{ fontSize: 13, color: "#0f172a" }}>{row.bothSidePages} pg</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{row.duplexSheets} sheets</div>
                      </td>
                      <td style={{ padding: "14px 0", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                        {money(row.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paper summary pill box */}
            {paperRevenue.map((item) => (
              <div
                key={item.paperSize}
                style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: "1.5px solid #10b981",
                      display: "grid",
                      placeItems: "center",
                      color: "#10b981",
                    }}
                  >
                    <FileText size={15} />
                  </div>
                  <b style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{item.paperSize}</b>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    {item.pages} pages · {item.percent}% of revenue
                  </span>
                </div>
                <b style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", fontFamily: "Manrope, sans-serif" }}>
                  {money(item.revenue)}
                </b>
              </div>
            ))}
          </div>

          {/* Uploads Card */}
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>Uploads</h2>
              <p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 0" }}>Documents vs photos</p>
            </div>

            {/* Mini Stat Split Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              <div
                style={{
                  border: "1px solid #f1f5f9",
                  borderRadius: 8,
                  background: "#fafafa",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: "#ffe4e6",
                    color: "#e11d48",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <FileText size={16} />
                </div>
                <div>
                  <b style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{documentFiles}</b>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    Documents · {uploadTotal ? Math.round((documentFiles / uploadTotal) * 100) : 0}%
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #f1f5f9",
                  borderRadius: 8,
                  background: "#fafafa",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: "#e0f2fe",
                    color: "#0284c7",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <ImageIcon size={16} />
                </div>
                <div>
                  <b style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{photoFiles}</b>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    Photos · {uploadTotal ? Math.round((photoFiles / uploadTotal) * 100) : 0}%
                  </div>
                </div>
              </div>
            </div>

            {/* Photos per page header */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
              PHOTOS PER PAGE
            </div>

            {/* Photo layouts list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {photoLayoutList.map((item) => {
                const count = layoutCounts[item.key] ?? 0;
                const LayoutIcon = item.icon;
                return (
                  <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          background: "#f1f5f9",
                          color: "#64748b",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <LayoutIcon size={13} />
                      </div>
                      <span style={{ fontSize: 12, color: "#334155", fontWeight: 500 }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      {count} {count === 1 ? "order" : "orders"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Section 3: Orders by hour of day (Full Width) */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>Orders by hour of day</h2>
              <p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 0" }}>
                All 24 hours — your busiest times ({periodLabel.toLowerCase()})
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <b style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", fontFamily: "Manrope, sans-serif" }}>
                {peakHour}
              </b>
              <div style={{ fontSize: 11, color: "#64748b" }}>Peak hour</div>
            </div>
          </div>

          {printed.length > 0 ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140, paddingTop: 10 }}>
              {hours.map((count, hour) => {
                const heightPercent = peakCount > 0 ? Math.max(4, Math.round((count / peakCount) * 100)) : 4;
                return (
                  <div
                    key={hour}
                    title={`${String(hour).padStart(2, "0")}:00 — ${count} orders`}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: `${heightPercent}%`,
                        background: count > 0 ? "#10b981" : "#e2e8f0",
                        borderRadius: 3,
                        transition: "height 0.2s ease",
                      }}
                    />
                    <span style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>
                      {hour % 3 === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
              No printed orders in this period yet.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
