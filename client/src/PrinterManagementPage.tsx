import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, LoaderCircle, Plus, Printer, Save, Trash2 } from "lucide-react";

type PrinterItem = { _id: string; name: string; address: string; protocol: "simulated" | "ipp"; status: "ready" | "offline"; supportsColour: boolean; supportsDuplex: boolean; paperSizes: string[] };
type PrintRoute = { paperSize: string; colour: boolean; duplex: boolean; printerId: string };
type ShopOptions = { enabledPaperSizes: string[]; colourEnabled: boolean; duplexEnabled: boolean };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (response.status === 401) { window.location.assign("/login"); throw new Error("Sign in required."); }
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? "Request failed."); }
  return (response.status === 204 ? undefined : response.json()) as Promise<T>;
}

export function PrinterManagementPage() {
  const [printers, setPrinters] = useState<PrinterItem[]>([]);
  const [routes, setRoutes] = useState<PrintRoute[]>([]);
  const [shop, setShop] = useState<ShopOptions | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [protocol, setProtocol] = useState<"simulated" | "ipp">("simulated");
  const [supportsColour, setSupportsColour] = useState(false);
  const [supportsDuplex, setSupportsDuplex] = useState(false);
  const [paperSizes, setPaperSizes] = useState<string[]>(["A4"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const [printerData, shopData] = await Promise.all([
        json<{ printers: PrinterItem[]; routes: Array<PrintRoute & { printerId: string }> }>("/api/shops/printers"),
        json<{ shop: ShopOptions }>("/api/shops/me"),
      ]);
      setPrinters(printerData.printers);
      setRoutes(printerData.routes.map((route) => ({ ...route, printerId: String(route.printerId) })));
      setShop(shopData.shop);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load printers."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const combinations = useMemo(() => {
    if (!shop) return [];
    return shop.enabledPaperSizes.flatMap((paperSize) => [false, ...(shop.colourEnabled ? [true] : [])].flatMap((colour) => [false, ...(shop.duplexEnabled ? [true] : [])].map((duplex) => ({ paperSize, colour, duplex }))));
  }, [shop]);

  async function addPrinter(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const result = await json<{ printer: PrinterItem }>("/api/shops/printers", { method: "POST", body: JSON.stringify({ name, protocol, address, supportsColour, supportsDuplex, paperSizes }) });
      setPrinters((current) => [...current, result.printer]); setName(""); setAddress(""); setSupportsColour(false); setSupportsDuplex(false); setPaperSizes(["A4"]); setNotice(protocol === "ipp" ? "IPP printer saved. A print agent will be needed to test connectivity." : "Simulated printer added.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add printer."); }
    finally { setSaving(false); }
  }

  function updateRoute(key: string, printerId: string) {
    const [paperSize, colour, duplex] = key.split(":");
    setRoutes((current) => {
      const rest = current.filter((route) => `${route.paperSize}:${route.colour}:${route.duplex}` !== key);
      return printerId ? [...rest, { paperSize, colour: colour === "true", duplex: duplex === "true", printerId }] : rest;
    });
  }

  async function saveRoutes() {
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await json<{ routes: PrintRoute[] }>("/api/shops/printer-routes", { method: "PUT", body: JSON.stringify({ routes }) });
      setRoutes(result.routes.map((route) => ({ ...route, printerId: String(route.printerId) }))); setNotice("Routing rules saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save routes."); }
    finally { setSaving(false); }
  }

  async function toggleSimulated(printer: PrinterItem) {
    try {
      const result = await json<{ printer: PrinterItem }>(`/api/shops/printers/${printer._id}/status`, { method: "PATCH", body: JSON.stringify({ status: printer.status === "ready" ? "offline" : "ready" }) });
      setPrinters((current) => current.map((item) => item._id === printer._id ? result.printer : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update printer status."); }
  }

  async function removePrinter(printer: PrinterItem) {
    try {
      await json<void>(`/api/shops/printers/${printer._id}`, { method: "DELETE" });
      setPrinters((current) => current.filter((item) => item._id !== printer._id));
      setRoutes((current) => current.filter((route) => route.printerId !== printer._id));
      setNotice("Printer removed. Its routing rules were cleared.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove printer."); }
  }

  if (loading) return <div className="workspace-loading"><LoaderCircle className="spin" size={24} /> Loading printer setup…</div>;
  return <div className="workspace-page"><header className="workspace-header"><a className="brand" href="/"><span className="brand-mark"><Printer size={20} /></span><span>printly.</span></a><a className="back-link" href="/dashboard/orders"><ArrowLeft size={15} /> Orders</a></header><main className="settings-main">
    <div className="eyebrow"><span className="eyebrow-dot" /> SHOP MANAGEMENT</div><h1>Printers & routing</h1><p>Configure simulated printers now, or save a phone’s IPP address for the future print agent.</p>
    <div className="payment-note"><Printer size={16} /> This page stores printer settings only. It does not send print jobs yet; the Windows print agent will connect this setup to a printer later.</div>
    {error && <div className="form-alert settings-alert" role="alert">{error}</div>}{notice && <div className="success-alert" role="status">{notice}</div>}
    <section className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><Printer size={18} /></span><div><h2>Registered printers</h2><p>IPP entries are saved as pending until an agent can verify them.</p></div></div>
      {printers.length ? printers.map((printer) => <article className="merchant-order-card" key={printer._id}><div className="merchant-order-heading"><b>{printer.name}</b><span className={`order-status-pill ${printer.status === "ready" ? "status-printed" : "status-awaiting_cash"}`}>{printer.protocol === "ipp" ? "Agent pending" : `Simulation ${printer.status}`}</span></div><div className="merchant-order-summary"><span>{printer.protocol === "ipp" ? printer.address : "Simulated printer · no physical output"}</span><span>{printer.paperSizes?.join(", ") ?? "A4"} · {printer.supportsColour ? "Colour" : "B&W"} · {printer.supportsDuplex ? "Duplex" : "Single-sided"}</span></div><div className="merchant-order-actions">{printer.protocol === "simulated" && <button type="button" onClick={() => void toggleSimulated(printer)}>Set {printer.status === "ready" ? "offline" : "ready"}</button>}<button type="button" className="danger" onClick={() => void removePrinter(printer)}><Trash2 size={14} /> Remove</button></div></article>) : <p>No printers registered yet.</p>}
      <form className="settings-fields two-col" onSubmit={(event) => void addPrinter(event)}><label>Printer name<input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Counter printer" /></label><label>Connection<select value={protocol} onChange={(event) => setProtocol(event.target.value as "simulated" | "ipp")}><option value="simulated">Simulated</option><option value="ipp">IPP network printer</option></select></label><div className="field-full"><b>Supported paper sizes</b><div className="choice-row">{["A4", "A5", "Legal", "A3"].map((size) => <label className={`choice-chip${paperSizes.includes(size) ? " selected" : ""}`} key={size}><input type="checkbox" checked={paperSizes.includes(size)} onChange={() => setPaperSizes((current) => current.includes(size) ? current.filter((value) => value !== size) : [...current, size])}/><span>{size}</span></label>)}</div></div><label className="toggle-row"><span><b>Colour capable</b></span><input type="checkbox" checked={supportsColour} onChange={(event) => setSupportsColour(event.target.checked)}/><i/></label><label className="toggle-row"><span><b>Duplex capable</b></span><input type="checkbox" checked={supportsDuplex} onChange={(event) => setSupportsDuplex(event.target.checked)}/><i/></label>{protocol === "ipp" && <label className="field-full">IPP address<input required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="ipp://192.168.1.40:631/ipp/print" /><small>For the Android virtual printer, use the phone IP and its advertised IPP URL.</small></label>}<button className="button button-dark" type="submit" disabled={saving || paperSizes.length === 0}><Plus size={15} /> Add printer</button></form>
    </section>
    <section className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><Printer size={18} /></span><div><h2>Routing rules</h2><p>Choose which configured printer should handle each supported print combination.</p></div></div>{!printers.length && <p>Add a printer before configuring routes.</p>}{combinations.map((combo) => { const key = `${combo.paperSize}:${combo.colour}:${combo.duplex}`; const current = routes.find((route) => `${route.paperSize}:${route.colour}:${route.duplex}` === key)?.printerId ?? ""; return <label className="settings-fields two-col" key={key}><span>{combo.paperSize} · {combo.colour ? "Colour" : "B&W"} · {combo.duplex ? "Duplex" : "Simplex"}</span><select disabled={!printers.length} value={current} onChange={(event) => updateRoute(key, event.target.value)}><option value="">No route</option>{printers.map((printer) => <option value={printer._id} key={printer._id}>{printer.name}{printer.status === "offline" ? " (offline/pending)" : ""}</option>)}</select></label>})}<button className="button button-dark" type="button" disabled={saving || !printers.length} onClick={() => void saveRoutes()}><Save size={15} /> Save routing rules</button></section>
  </main></div>;
}
