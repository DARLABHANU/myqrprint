import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, CircleAlert, ExternalLink, LockKeyhole, LogOut, RefreshCw, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type ShopSummary = { displayName: string; slug: string; ownerName: string; mobile: string; email: string; upiId?: string; settlementUpiId?: string; settlementQrDataUrl?: string };
type Settlement = {
  _id: string;
  dateKey: string;
  amountPaise: number;
  orderCount: number;
  status: "pending" | "sent" | "received";
  paymentMode?: "test" | "live";
  upiId: string;
  upiQrDataUrl?: string;
  transferReference?: string;
  sentAt?: string;
  receivedAt?: string;
  shopId: ShopSummary;
};
const formatMoney = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const formatDate = (key: string) => new Date(`${key}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function AdminSettlementsPage() {
  const [access, setAccess] = useState<{ token: string; expiresAt: number } | null>(() => {
    try {
      const saved = sessionStorage.getItem("urqrprint-admin-settlement-access");
      const parsed = saved ? JSON.parse(saved) as { token?: string; expiresAt?: number } : null;
      return parsed?.token && parsed.expiresAt && parsed.expiresAt > Date.now() ? { token: parsed.token, expiresAt: parsed.expiresAt } : null;
    } catch { return null; }
  });
  const accessToken = access?.token ?? "";
  const [dateKey, setDateKey] = useState("");
  const [rows, setRows] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [references, setReferences] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  function lockPage(message = "") {
    sessionStorage.removeItem("urqrprint-admin-settlement-access");
    setAccess(null); setRows([]); setError(""); setAuthError(message);
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAuthBusy(true); setAuthError("");
    try {
      const response = await fetch("/api/admin/settlements/access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }), cache: "no-store",
      });
      const body = await response.json() as { accessToken?: string; expiresAt?: number; error?: string };
      if (!response.ok || !body.accessToken || !body.expiresAt) throw new Error(body.error || "Could not unlock admin settlements.");
      const nextAccess = { token: body.accessToken, expiresAt: body.expiresAt };
      sessionStorage.setItem("urqrprint-admin-settlement-access", JSON.stringify(nextAccess));
      setAccess(nextAccess); setPassword("");
    } catch (reason) { setAuthError(reason instanceof Error ? reason.message : "Could not unlock admin settlements."); }
    finally { setAuthBusy(false); }
  }

  async function load(date?: string) {
    if (!accessToken) {
      setRows([]); setDateKey(date ?? ""); setLoading(false); return;
    }
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/settlements${date ? `?date=${encodeURIComponent(date)}` : ""}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const body = await response.json() as { dateKey?: string; settlements?: Settlement[]; error?: string };
      if (response.status === 401) { lockPage(body.error || "Admin session expired. Enter the password again."); return; }
      if (!response.ok) throw new Error(body.error || "Could not load settlement requests.");
      setDateKey(body.dateKey ?? date ?? ""); setRows(body.settlements ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load settlement requests."); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (accessToken) void load(); }, [accessToken]);

  const totals = useMemo(() => rows.reduce((result, row) => {
    result[row.status] += row.amountPaise;
    result[`${row.status}Count`] += 1;
    return result;
  }, { pending: 0, sent: 0, received: 0, pendingCount: 0, sentCount: 0, receivedCount: 0 }), [rows]);
  const hasTestPayments = rows.some((row) => row.paymentMode !== "live");

  async function markSent(row: Settlement) {
    if (!accessToken) { setError("Open the private settlement URL provided to the administrator."); return; }
    const simulation = row.paymentMode !== "live";
    const reference = (references[row._id] ?? "").trim();
    if ((!simulation && !(row.upiId || row.shopId?.settlementUpiId)) || !reference) { setError(!reference ? (simulation ? "Enter a simulation reference first." : "Enter the transfer UTR/reference first.") : "This shop needs a settlement UPI ID before it can be settled."); return; }
    const confirmMessage = simulation
      ? `Simulate a transfer of ${formatMoney(row.amountPaise)} for ${row.shopId.displayName}? No money will move. The shopkeeper can confirm the simulated receipt.`
      : `Confirm you transferred ${formatMoney(row.amountPaise)} to ${row.shopId.displayName}? The shopkeeper will be asked to confirm receipt.`;
    if (!window.confirm(confirmMessage)) return;
    setBusyId(row._id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/settlements/${row._id}/mark-sent`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ transferReference: reference, expectedAmountPaise: row.amountPaise, ...(simulation ? { simulation: true } : {}) }) });
      const body = await response.json() as { error?: string };
      if (response.status === 401) { lockPage(body.error || "Admin session expired. Enter the password again."); return; }
      if (!response.ok) throw new Error(body.error || "Could not record this transfer.");
      setNotice(simulation ? `Simulated transfer of ${formatMoney(row.amountPaise)} recorded for ${row.shopId.displayName}. No money moved.` : `Transfer of ${formatMoney(row.amountPaise)} recorded for ${row.shopId.displayName}.`);
      await load(dateKey);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not record this transfer."); }
    finally { setBusyId(""); }
  }

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex, nofollow, noarchive";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  return <main className="admin-settlements-page">
    {!accessToken && <div className="settlement-access-backdrop"><section className="settlement-access-dialog" role="dialog" aria-modal="true" aria-labelledby="settlement-access-title"><div className="settlement-access-icon"><LockKeyhole size={21}/></div><small>ADMIN ONLY</small><h1 id="settlement-access-title">Unlock daily settlements</h1><p>Enter the admin password to view shop payout requests and transfer details.</p><form onSubmit={(event) => void unlock(event)}><label htmlFor="settlement-admin-password">Admin password</label><input id="settlement-admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required/><button type="submit" disabled={authBusy || password.length === 0}>{authBusy ? "Checking…" : "Open settlements"}</button></form>{authError && <div className="form-alert" role="alert">{authError}</div>}</section></div>}
    <header className="admin-settlements-top"><span/><b>UrQrPrint · Admin</b>{accessToken && <button type="button" onClick={() => lockPage()}><LogOut size={14}/> Lock page</button>}</header>
    <div className="admin-settlements-content">
      <header className="admin-settlements-heading"><div><small>SHOP PAYOUTS · MANUAL TRANSFER</small><h1>Daily settlements</h1><p>Review yesterday’s captured Razorpay collections, transfer the exact gross amount to each shop’s UPI ID, then record the transfer reference.</p></div><button type="button" onClick={() => void load(dateKey)} disabled={loading}><RefreshCw size={15}/> Refresh</button></header>
      {error && <div className="form-alert" role="alert">{error}</div>}{notice && <div className="settlement-notice"><Check size={15}/>{notice}</div>}
      <section className="settlement-summary-grid"><article><span>{hasTestPayments ? "Test-mode total · simulation only" : `Awaiting transfer · ${totals.pendingCount}`}</span><b>{formatMoney(totals.pending)}</b></article><article><span>{hasTestPayments ? "Simulated · awaiting shop confirmation" : "Sent · awaiting shop confirmation"} · {totals.sentCount}</span><b>{formatMoney(totals.sent)}</b></article><article><span>{hasTestPayments ? "Simulation confirmed" : "Receipt confirmed"} · {totals.receivedCount}</span><b>{formatMoney(totals.received)}</b></article></section>
      <section className="settings-card settlement-list-card"><header className="wallet-card-heading"><div><h2>Settlement requests</h2><p>Amounts are gross captured Razorpay payments. No fee deduction is configured.</p></div><label className="settlement-date-field">Business date<input type="date" value={dateKey} onChange={(event) => { const value = event.target.value; setDateKey(value); if (value) void load(value); }}/></label></header>
        {loading ? <div className="wallet-history-empty">Loading settlement requests…</div> : rows.length === 0 ? <div className="wallet-history-empty"><Wallet size={24}/><b>No captured Razorpay collections for this date</b><span>Requests are created automatically after the business day closes in India time.</span></div> : <div className="settlement-admin-list">{rows.map((row) => {
          const testMode = row.paymentMode !== "live";
          const settlementUpiId = row.upiId || row.shopId?.settlementUpiId || row.shopId?.upiId || "";
          const uploadedQr = row.upiQrDataUrl || row.shopId?.settlementQrDataUrl || "";
          const upiLink = !testMode && settlementUpiId ? `upi://pay?${new URLSearchParams({ pa: settlementUpiId, pn: row.shopId.displayName, am: (row.amountPaise / 100).toFixed(2), cu: "INR", tn: `UrQrPrint settlement ${row.dateKey}` })}` : "";
          return <article className="settlement-admin-row" key={row._id}>
            <div className="settlement-shop-heading"><div><small>{formatDate(row.dateKey)} · {row.orderCount} Razorpay order{row.orderCount === 1 ? "" : "s"}</small><h3>{row.shopId?.displayName ?? "Shop"}</h3><p>{row.shopId?.ownerName} · {row.shopId?.mobile} · {row.shopId?.email}</p></div><span className={`settlement-status ${testMode ? "test" : row.status}`}>{testMode ? row.status === "pending" ? "Test mode · no real funds" : row.status === "sent" ? "Simulated · awaiting confirmation" : "Simulation confirmed" : row.status === "pending" ? "Awaiting transfer" : row.status === "sent" ? "Awaiting shop confirmation" : "Receipt confirmed"}</span></div>
            <div className="settlement-transfer-details"><div className="settlement-amount"><small>{testMode ? row.status === "pending" ? "Test amount · simulation only" : "Simulated amount · no payout" : "Exact transfer amount"}</small><b>{formatMoney(row.amountPaise)}</b><span>{testMode ? "Razorpay test payment · no money moved" : "Gross captured amount · no fee deduction"}</span></div><div className="settlement-upi"><small>Shop settlement UPI ID</small><b>{settlementUpiId || "Not configured"}</b>{upiLink && <a href={upiLink}><ExternalLink size={13}/> Open UPI app</a>}{uploadedQr && <img className="settlement-shop-uploaded-qr" src={uploadedQr} alt={`Uploaded UPI QR for ${row.shopId?.displayName || "shop"}`}/>}</div>{row.status === "pending" && !testMode && settlementUpiId && <QRCodeSVG className="settlement-upi-qr" value={upiLink} size={108} level="M" includeMargin/>}</div>
            {row.status === "pending" && testMode && <div className="settlement-test-notice"><CircleAlert size={14}/> Test payment only. Use “Simulate transfer” to exercise shop confirmation; this will not send or record real money.</div>}
            {row.status === "pending" && <div className="settlement-mark-form"><label>{testMode ? "Simulation reference (not a bank UTR)" : "Transfer UTR / reference"}<input value={references[row._id] ?? ""} onChange={(event) => setReferences((current) => ({ ...current, [row._id]: event.target.value }))} minLength={6} maxLength={40} placeholder={testMode ? "e.g. TEST-SETTLEMENT-001" : "Enter bank / UPI transfer reference"}/></label><button type="button" disabled={busyId === row._id || (!testMode && !settlementUpiId) || (references[row._id] ?? "").trim().length < 6} onClick={() => void markSent(row)}><Check size={15}/>{busyId === row._id ? "Saving…" : testMode ? "Simulate transfer" : "Mark transfer sent"}</button>{!testMode && !settlementUpiId && <p><CircleAlert size={14}/> Ask the shopkeeper to add a settlement UPI ID in Payment settings before settling.</p>}</div>}
            {row.status !== "pending" && <div className="settlement-reference"><span>{testMode ? "Simulation reference · not a bank UTR" : "Transfer reference"}</span><b>{row.transferReference || "—"}</b>{testMode && <span>No real money moved.</span>}{row.sentAt && <span>{testMode ? "Simulated " : "Sent "}{new Date(row.sentAt).toLocaleString()}</span>}{row.receivedAt && <span>{testMode ? "Shop confirmed simulation " : "Shop confirmed "}{new Date(row.receivedAt).toLocaleString()}</span>}</div>}
          </article>;
        })}</div>}
      </section>
    </div>
  </main>;
}
