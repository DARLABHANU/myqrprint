import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  LoaderCircle,
  LogOut,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Settings2,
  Store,
  X,
} from "lucide-react";

type OrderStatus =
  | "awaiting_payment"
  | "awaiting_cash"
  | "needs_approval"
  | "queued"
  | "printing"
  | "printed"
  | "failed"
  | "rejected"
  | "cancelled"
  | "expired";

type MerchantOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  paymentMethod: "upi" | "cash";
  paymentStatus: "unverified" | "awaiting_cash" | "paid";
  paymentClaimedAt?: string;
  paymentReference?: string;
  customerName?: string;
  customerMobile?: string;
  amountPaise: number;
  options: {
    paperSize: string;
    colour: boolean;
    duplex: boolean;
    copies: number;
    photoLayout?: string;
    orientation?: "portrait" | "landscape";
    pageRange?: string;
  };
  files: Array<{
    uploadId: string;
    name: string;
    mediaType: string;
    sizeBytes: number;
    pageCount: number;
    available: boolean;
  }>;
  events: Array<{ type: string; actorType: string; timestamp: string; note?: string }>;
  createdAt: string;
};

type ShopInfo = {
  displayName: string;
  enabledPaperSizes: string[];
  colourEnabled: boolean;
  duplexEnabled: boolean;
  maxCopies: number;
  notificationPreferences?: { newOrder: boolean; printFailed: boolean; uploadSound: boolean; dailyEmail: boolean };
};
type OrderOptions = MerchantOrder["options"];
type Action = "confirm_payment" | "approve_order" | "start_printing" | "mark_printed" | "mark_failed" | "requeue" | "reject" | "cancel";
type Filter = "all" | "payment" | "approval" | "queue" | "printing" | "printed" | "failed" | "completed";

const photoLayouts = [
  { value: "single", label: "1 photo per page" },
  { value: "two_stack", label: "2 photos, stacked" },
  { value: "two_side_by_side", label: "2 photos, side by side" },
  { value: "four", label: "4 photos per page" },
  { value: "six", label: "6 photos per page" },
  { value: "nine", label: "9 photos per page" },
];

const statusLabels: Record<OrderStatus, string> = {
  awaiting_payment: "UPI payment to verify",
  awaiting_cash: "Cash due at counter",
  needs_approval: "Needs approval",
  queued: "In print queue",
  printing: "Printing",
  printed: "Ready for pickup",
  failed: "Print issue",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};

const filterLabels: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All orders" },
  { id: "payment", label: "Needs payment" },
  { id: "approval", label: "Needs approval" },
  { id: "queue", label: "Print queue" },
  { id: "printing", label: "Printing" },
  { id: "printed", label: "Ready for pickup" },
  { id: "failed", label: "Failed" },
  { id: "completed", label: "Closed" },
];

const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

async function responseError(response: Response) {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

function visibleInFilter(order: MerchantOrder, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "payment":
      return order.status === "awaiting_payment" || order.status === "awaiting_cash";
    case "approval":
      return order.status === "needs_approval";
    case "queue":
      return order.status === "queued" || order.status === "failed";
    case "printing":
      return order.status === "printing";
    case "printed":
      return order.status === "printed";
    case "failed":
      return order.status === "failed";
    case "completed":
      return order.status === "printed" || order.status === "rejected" || order.status === "cancelled" || order.status === "expired";
  }
}

function availableActions(order: MerchantOrder): Array<{ action: Action; label: string; primary?: boolean }> {
  switch (order.status) {
    case "awaiting_payment":
      return [
        { action: "confirm_payment", label: "Confirm UPI received", primary: true },
        { action: "reject", label: "Reject order" },
        { action: "cancel", label: "Cancel order" },
      ];
    case "awaiting_cash":
      return [
        { action: "confirm_payment", label: "Confirm cash received", primary: true },
        { action: "reject", label: "Reject order" },
        { action: "cancel", label: "Cancel order" },
      ];
    case "needs_approval":
      return [
        { action: "approve_order", label: "Approve for printing", primary: true },
        { action: "reject", label: "Reject order" },
        { action: "cancel", label: "Cancel order" },
      ];
    case "queued":
      return [{ action: "start_printing", label: "Start printing", primary: true }, { action: "cancel", label: "Cancel order" }];
    case "printing":
      return [
        { action: "mark_printed", label: "Ready for pickup", primary: true },
        { action: "mark_failed", label: "Report print issue" },
      ];
    case "failed":
      return [{ action: "requeue", label: "Return to queue", primary: true }, { action: "cancel", label: "Cancel order" }];
    default:
      return [];
  }
}

export function OrderManagementPage() {
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const knownOrderCodes = useRef<Set<string> | null>(null);
  const knownStatuses = useRef<Map<string, OrderStatus> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingOrderId, setEditingOrderId] = useState("");
  const [draftOptions, setDraftOptions] = useState<OrderOptions | null>(null);

  const loadOrders = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const [orderResponse, shopResponse] = await Promise.all([
        fetch("/api/shops/orders", { credentials: "same-origin" }),
        fetch("/api/shops/me", { credentials: "same-origin" }),
      ]);
      if (orderResponse.status === 401 || shopResponse.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!orderResponse.ok) throw new Error(await responseError(orderResponse));
      if (!shopResponse.ok) throw new Error(await responseError(shopResponse));
      const orderBody = await orderResponse.json() as { orders: MerchantOrder[] };
      const shopBody = await shopResponse.json() as { shop: ShopInfo };
      setOrders(orderBody.orders);
      const currentCodes = new Set(orderBody.orders.map((order) => order.code));
      const preferences = shopBody.shop.notificationPreferences;
      if (!background && preferences) setAlertsEnabled(preferences.newOrder || preferences.printFailed || preferences.uploadSound);
      if (knownOrderCodes.current && background && alertsEnabled) {
        const incoming = orderBody.orders.filter((order) => !knownOrderCodes.current?.has(order.code));
        const failedNow = orderBody.orders.filter((order) => knownStatuses.current?.get(order.code) !== "failed" && order.status === "failed");
        if (incoming.length && preferences?.newOrder) {
          const message = `${incoming.length} new order${incoming.length === 1 ? "" : "s"}: ${incoming.map((order) => `#${order.code}`).join(", ")}`;
          setNotice(message);
          if ("Notification" in window && Notification.permission === "granted") new Notification("Printly · New order", { body: message });
        }
        if (failedNow.length && preferences?.printFailed) {
          const message = `${failedNow.length} print job${failedNow.length === 1 ? "" : "s"} failed: ${failedNow.map((order) => `#${order.code}`).join(", ")}`;
          setNotice(message);
          if ("Notification" in window && Notification.permission === "granted") new Notification("Printly · Print issue", { body: message });
        }
        if ((incoming.length && preferences?.uploadSound) || (failedNow.length && preferences?.printFailed)) {
          try {
            const AudioContextClass = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (AudioContextClass) {
              const audio = new AudioContextClass();
              const oscillator = audio.createOscillator();
              const gain = audio.createGain();
              oscillator.frequency.value = 880;
              gain.gain.value = 0.08;
              oscillator.connect(gain); gain.connect(audio.destination); oscillator.onended = () => { void audio.close(); }; oscillator.start(); oscillator.stop(audio.currentTime + 0.16);
            }
          } catch { /* Browser audio may be unavailable until the dashboard is interacted with. */ }
        }
      }
      knownOrderCodes.current = currentCodes;
      knownStatuses.current = new Map(orderBody.orders.map((order) => [order.code, order.status]));
      setShop(shopBody.shop);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the order queue.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [alertsEnabled]);

  useEffect(() => {
    void loadOrders();
    const timer = window.setInterval(() => void loadOrders(true), 30_000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

  const matchingOrders = useMemo(() => orders.filter((order) => {
    if (!visibleInFilter(order, filter)) return false;
    const needle = search.trim().toLowerCase();
    if (needle && !order.code.toLowerCase().includes(needle) && !order.files.some((file) => file.name.toLowerCase().includes(needle))) return false;
    const created = new Date(order.createdAt).getTime();
    if (dateFrom && created < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
    if (dateTo && created > new Date(`${dateTo}T23:59:59.999`).getTime()) return false;
    return true;
  }), [dateFrom, dateTo, filter, orders, search]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(matchingOrders.length / pageSize));
  const visibleOrders = matchingOrders.slice((page - 1) * pageSize, page * pageSize);
  const counts = useMemo(() => ({
    payment: orders.filter((order) => order.status === "awaiting_payment" || order.status === "awaiting_cash").length,
    approval: orders.filter((order) => order.status === "needs_approval").length,
    queue: orders.filter((order) => order.status === "queued" || order.status === "failed").length,
    printing: orders.filter((order) => order.status === "printing").length,
  }), [orders]);

  async function updateOrder(order: MerchantOrder, action: Action) {
    if ((action === "reject" || action === "cancel") && order.paymentStatus === "paid") {
      const confirmed = window.confirm("This order's payment is already confirmed. This action will not refund it. Continue only if you will arrange any refund directly with the customer.");
      if (!confirmed) return;
    }
    setBusyOrderId(order.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/shops/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const result = await response.json() as { order: MerchantOrder };
      setOrders((current) => current.map((item) => item.id === order.id ? result.order : item));
      setNotice(action === "confirm_payment"
        ? "Payment confirmed manually. Review the order and approve it for printing."
        : action === "approve_order"
          ? "Order approved and moved to the print queue."
          : "Order status updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this order.");
    } finally {
      setBusyOrderId("");
    }
  }

  async function saveOrderOptions(order: MerchantOrder) {
    if (!draftOptions) return;
    setBusyOrderId(order.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/shops/orders/${encodeURIComponent(order.id)}/options`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftOptions),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const result = await response.json() as { order: MerchantOrder };
      setOrders((current) => current.map((item) => item.id === order.id ? result.order : item));
      setEditingOrderId("");
      setDraftOptions(null);
      setNotice("Print options and total updated before payment.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update print options.");
    } finally {
      setBusyOrderId("");
    }
  }

  async function logout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error(await responseError(response));
      window.location.assign("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out.");
    }
  }

  function printReceipt(order: MerchantOrder) {
    const receipt = window.open("", "_blank", "width=620,height=760");
    if (!receipt) { setError("Allow pop-ups to print the order receipt."); return; }
    receipt.document.title = `Printly order ${order.code}`;
    const style = receipt.document.createElement("style");
    style.textContent = "body{font:15px Arial,sans-serif;color:#17241f;max-width:680px;margin:32px auto;padding:20px}h1{font-size:24px}.muted{color:#637068}.line{border-top:1px solid #dfe7df;margin:16px 0;padding-top:12px}.total{font-size:22px;font-weight:bold}@media print{button{display:none}}";
    receipt.document.head.append(style);
    const main = receipt.document.createElement("main");
    const heading = receipt.document.createElement("h1"); heading.textContent = shop?.displayName ?? "Printly shop";
    const title = receipt.document.createElement("h2"); title.textContent = `Order #${order.code}`;
    const date = receipt.document.createElement("p"); date.className = "muted"; date.textContent = new Date(order.createdAt).toLocaleString();
    const customer = receipt.document.createElement("p"); customer.textContent = [order.customerName, order.customerMobile].filter(Boolean).join(" · ") || "Customer details not collected";
    const options = receipt.document.createElement("p"); options.textContent = `${order.options.paperSize} · ${order.options.colour ? "Colour" : "B&W"} · ${order.options.duplex ? "Duplex" : "Simplex"} · ${order.options.copies} copies${order.options.pageRange ? ` · Pages ${order.options.pageRange}` : ""}`;
    const files = receipt.document.createElement("div"); files.className = "line";
    for (const file of order.files) { const row = receipt.document.createElement("p"); row.textContent = `${file.name} · ${file.pageCount} pages${file.available ? "" : " · file expired"}`; files.append(row); }
    const total = receipt.document.createElement("p"); total.className = "line total"; total.textContent = `Total ${money(order.amountPaise)}`;
    const payment = receipt.document.createElement("p"); payment.textContent = `${order.paymentMethod.toUpperCase()} · ${order.paymentStatus} · ${statusLabels[order.status]}`;
    const printButton = receipt.document.createElement("button"); printButton.textContent = "Print / Save receipt"; printButton.onclick = () => receipt.print();
    main.append(heading, title, date, customer, options, files, total, payment, printButton);
    receipt.document.body.replaceChildren(main); receipt.focus();
  }

  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <a className="brand" href="/"><span className="brand-mark"><QrCode size={20} /></span><span>printly<span className="brand-period">.</span></span></a>
        <div className="workspace-header-right">
          <span className="workspace-greeting">{shop?.displayName ?? "Shop workspace"}</span>
          <button className="logout-button" onClick={() => void logout()} type="button"><LogOut size={15} /> Sign out</button>
        </div>
      </header>
      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <div className="sidebar-shop"><span><Store size={18} /></span><div><b>{shop?.displayName ?? "Your print shop"}</b><small>Shop workspace</small></div></div>
          <div className="sidebar-label">SHOP MANAGEMENT</div>
          <a className="sidebar-link" href="/dashboard">Overview</a>
          <a className="sidebar-link" href="/dashboard/settings"><Printer size={17} /> Shop settings</a>
          <a className="sidebar-link active" href="/dashboard/orders"><Clock3 size={17} /> Orders</a>
          <a className="sidebar-link" href="/dashboard/payments">Payment records</a>
          <a className="sidebar-link" href="/dashboard/reports">Reports</a>
          <a className="sidebar-link" href="/dashboard/printers">Printers & routing</a>
          <a className="sidebar-link" href="/dashboard/qr-code">My QR code</a>
          <a className="sidebar-link" href="/dashboard/subscription">Subscription</a>
          <a className="sidebar-link" href="/dashboard/withdraw">Wallet & earnings</a>
          <a className="sidebar-link" href="/dashboard/support">Help & support</a>
          <div className="sidebar-help"><CircleHelp size={17} /><b>Payment safety</b><p>UPI receipts are not verified automatically. Confirm payment only after checking your account.</p></div>
        </aside>
        <main className="settings-main order-workspace-main">
          <div className="settings-breadcrumb"><span>Shop management</span><ChevronRight size={13} /><b>Orders</b></div>
          <div className="settings-title-row order-title-row">
            <div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR COUNTER, ONLINE</div><h1>Order queue</h1><p>Review files, confirm payment, and move jobs through printing.</p></div>
            <div><button className="order-refresh-button" type="button" onClick={async () => { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); setAlertsEnabled((enabled) => !enabled); }}>{alertsEnabled ? "Disable alerts" : "Enable new-order alerts"}</button><button className="order-refresh-button" type="button" disabled={refreshing} onClick={() => void loadOrders(true)}><RefreshCw className={refreshing ? "spin" : ""} size={14} /> Refresh</button></div>
          </div>
          {error && <div className="form-alert settings-alert" role="alert">{error}</div>}
          {notice && <div className="success-alert" role="status"><Check size={16} />{notice}</div>}
          <div className="order-count-strip">
            <span><b>{counts.payment}</b> awaiting payment</span>
            <span><b>{counts.approval}</b> awaiting approval</span>
            <span><b>{counts.queue}</b> in queue</span>
            <span><b>{counts.printing}</b> printing</span>
          </div>
          <div className="order-filter-tabs" role="tablist" aria-label="Filter orders">
            {filterLabels.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={filter === item.id ? "active" : ""} onClick={() => { setFilter(item.id); setPage(1); }}>{item.label}</button>)}
          </div>
          <div className="order-search-controls">
            <label>Search order or file<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Pickup code or filename" /></label>
            <label>From<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label>
            <label>To<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label>
          </div>
          {loading ? <div className="workspace-loading"><LoaderCircle className="spin" size={22} /> Loading orders…</div>
            : visibleOrders.length === 0 ? <div className="orders-empty"><Printer size={24} /><b>{orders.length ? "No orders in this view" : "No customer orders yet"}</b><p>{orders.length ? "Choose another filter to see more orders." : "New orders from your customer page will appear here."}</p></div>
              : <><div className="merchant-order-list">
                {visibleOrders.map((order) => <article className="merchant-order-card" key={order.id}>
                  <div className="merchant-order-heading">
                    <div><span className="merchant-order-code">#{order.code}</span><span className={`order-status-pill status-${order.status}`}>{statusLabels[order.status]}</span></div>
                    <time>{new Date(order.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
                  </div>
                  <div className="merchant-order-summary">
                    <b>{money(order.amountPaise)}</b>
                    {(order.customerName || order.customerMobile) && <span>Customer: {[order.customerName, order.customerMobile].filter(Boolean).join(" · ")}</span>}
                    <span>{order.paymentMethod === "upi" ? "Direct UPI" : "Cash at counter"} · {order.paymentStatus === "paid" ? "Payment confirmed" : "Not confirmed"}</span>
                    <span>{order.options.paperSize} · {order.options.colour ? "Colour" : "B&W"} · {order.options.duplex ? "Double-sided" : "Single-sided"} · {order.options.copies} {order.options.copies === 1 ? "copy" : "copies"}</span>
                    {order.options.photoLayout && <span>Photo layout: {order.options.photoLayout.replaceAll("_", " ")}</span>}
                  </div>
                  <button className="order-edit-toggle" type="button" onClick={() => printReceipt(order)}><Printer size={13} /> View / print receipt</button>
                  {(order.status === "awaiting_payment" || order.status === "awaiting_cash") && <button className="order-edit-toggle" type="button" onClick={() => {
                    if (editingOrderId === order.id) {
                      setEditingOrderId("");
                      setDraftOptions(null);
                    } else {
                      setEditingOrderId(order.id);
                      setDraftOptions({ ...order.options });
                    }
                  }}><Settings2 size={13} />{editingOrderId === order.id ? "Close options" : "Edit print options"}</button>}
                  {editingOrderId === order.id && draftOptions && <div className="order-edit-panel">
                    <label>Paper size<select value={draftOptions.paperSize} onChange={(event) => setDraftOptions({ ...draftOptions, paperSize: event.target.value })}>{(shop?.enabledPaperSizes ?? []).map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
                    <label>Copies<input type="number" min="1" max={shop?.maxCopies ?? 100} value={draftOptions.copies} onChange={(event) => setDraftOptions({ ...draftOptions, copies: Number(event.target.value) })} /></label>
                    {shop?.colourEnabled && <label className="order-edit-check"><input type="checkbox" checked={draftOptions.colour} onChange={(event) => setDraftOptions({ ...draftOptions, colour: event.target.checked })} /> Colour</label>}
                    {!order.files.every((file) => file.mediaType.startsWith("image/")) && shop?.duplexEnabled && <label className="order-edit-check"><input type="checkbox" checked={draftOptions.duplex} onChange={(event) => setDraftOptions({ ...draftOptions, duplex: event.target.checked })} /> Double-sided</label>}
                    {order.files.every((file) => file.mediaType.startsWith("image/")) && <label>Photo layout<select value={draftOptions.photoLayout ?? "single"} onChange={(event) => setDraftOptions({ ...draftOptions, photoLayout: event.target.value })}>{photoLayouts.map((layout) => <option key={layout.value} value={layout.value}>{layout.label}</option>)}</select></label>}
                    <p>The server recalculates the total. The customer page will show the updated price.</p>
                    <button className="order-edit-save" type="button" disabled={busyOrderId === order.id} onClick={() => void saveOrderOptions(order)}>{busyOrderId === order.id ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Save options</button>
                  </div>}
                  {order.paymentClaimedAt && <div className="payment-claim-note">
                    <Clock3 size={14} />
                    <span>{order.paymentStatus === "paid" ? "Shopkeeper confirmed the UPI payment" : "Customer reports UPI payment"}{order.paymentReference ? ` · Ref: ${order.paymentReference}` : ""}{order.paymentStatus === "paid" ? "." : ". Verify in your UPI account before confirming."}</span>
                  </div>}
                  <div className="merchant-order-files">
                    <b>Print files</b>
                    {order.files.filter((file) => file.available).map((file) => <div className="merchant-order-file" key={file.uploadId}>
                      <span><b>{file.name}</b><small>{file.pageCount} {file.pageCount === 1 ? "page" : "pages"} · {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</small></span>
                      <a href={`/api/shops/orders/${encodeURIComponent(order.id)}/files/${encodeURIComponent(file.uploadId)}`}><ArrowDownToLine size={14} /> Download</a>
                    </div>)}
                    {!order.files.some((file) => file.available) && <small className="order-file-expired">Private file retention expired; the original upload is no longer available.</small>}
                  </div>
                  <div className="merchant-order-actions">
                    {availableActions(order).map(({ action, label, primary }) => <button key={action} type="button" className={primary ? "primary" : action === "reject" || action === "cancel" || action === "mark_failed" ? "danger" : ""} disabled={busyOrderId === order.id} onClick={() => void updateOrder(order, action)}>
                      {busyOrderId === order.id ? <LoaderCircle className="spin" size={14} /> : action === "requeue" ? <RotateCcw size={14} /> : action === "reject" ? <X size={14} /> : action === "mark_printed" || action === "confirm_payment" ? <Check size={14} /> : <Printer size={14} />}
                      {label}
                    </button>)}
                  </div>
                  {order.events.length > 0 && <details className="order-event-history">
                    <summary>Order history ({order.events.length})</summary>
                    <ol>{[...order.events].reverse().map((event, index) => <li key={`${event.type}-${event.timestamp}-${index}`}><b>{event.type.replaceAll("_", " ")}</b><time>{new Date(event.timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>{event.note && <small>{event.note}</small>}</li>)}</ol>
                  </details>}
                </article>)}
              </div><div className="order-pagination"><span>{matchingOrders.length} matching orders</span><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button></div></>}
        </main>
      </div>
      <footer className="workspace-footer"><a href="/">printly.</a><span>Thoughtful tools for your local print shop.</span><span>Payments confirmed manually</span></footer>
    </div>
  );
}
