import { useEffect, useState, type FormEvent } from "react";
import { CircleHelp, LoaderCircle, Monitor, Plus, Printer, RefreshCw, Save, Trash2 } from "lucide-react";

type PrinterItem = { _id: string; name: string; address: string; protocol: "simulated" | "ipp" | "windows"; status: "ready" | "offline"; supportsColour: boolean; supportsDuplex: boolean; paperSizes: string[]; agentDeviceId?: string; systemName?: string };
type ConnectedDevice = { id: string; deviceName: string; agentVersion: string; status: "online" | "offline"; lastSeenAt?: string; createdAt: string };
type PrintRoute = { paperSize: string; colour: boolean; duplex: boolean; printerId: string };
type PaperRate = { blackWhiteSimplexPaise: number; colourSimplexPaise: number; blackWhiteDuplexSheetPaise: number; colourDuplexSheetPaise: number };
type ShopOptions = { enabledPaperSizes: string[]; colourEnabled: boolean; duplexEnabled: boolean; rates: Record<string, PaperRate> };
const paperSizes = ["A4", "Legal", "A5", "A3"];
const money = (paise: number) => `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;
type DesktopBridge = { pair: (code: string, apiUrl: string) => Promise<{ connected: boolean; deviceName?: string; shopName?: string }> };
const desktopBridge = (window as Window & { printly?: DesktopBridge }).printly;
const agentApiUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "http://localhost:4000" : "https://printly-api.onrender.com";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (response.status === 401) { window.location.assign("/login"); throw new Error("Sign in required."); }
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? "Request failed."); }
  return (response.status === 204 ? undefined : response.json()) as Promise<T>;
}

export function PrinterManagementPage() {
  const [printers, setPrinters] = useState<PrinterItem[]>([]);
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [routes, setRoutes] = useState<PrintRoute[]>([]);
  const [shop, setShop] = useState<ShopOptions | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [protocol, setProtocol] = useState<"simulated" | "ipp">("simulated");
  const [supportsColour, setSupportsColour] = useState(false);
  const [supportsDuplex, setSupportsDuplex] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["A4"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(background = false) {
    if (background) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const [printerData, shopData, deviceData] = await Promise.all([
        json<{ printers: PrinterItem[]; routes: Array<PrintRoute & { printerId: string }> }>("/api/shops/printers"),
        json<{ shop: ShopOptions }>("/api/shops/me"),
        json<{ devices: ConnectedDevice[] }>("/api/agent/devices"),
      ]);
      setPrinters(printerData.printers);
      setRoutes(printerData.routes.map((route) => ({ ...route, printerId: String(route.printerId) })));
      setShop(shopData.shop);
      setDevices(deviceData.devices);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load printers."); }
    finally { setLoading(false); setRefreshing(false); }
  }
  useEffect(() => { void load(); }, []);

  const routeSlots = paperSizes.flatMap((paperSize) => [false, true].flatMap((colour) => [false, true].map((duplex) => ({ paperSize, colour, duplex }))));
  const availablePrinters = printers.filter((printer) => printer.status === "ready");
  const missingRoutes = routeSlots.filter((slot) => {
    if (!shop?.enabledPaperSizes.includes(slot.paperSize) || (slot.colour && !shop.colourEnabled) || (slot.duplex && !shop.duplexEnabled)) return false;
    return !routes.some((route) => route.paperSize === slot.paperSize && route.colour === slot.colour && route.duplex === slot.duplex);
  }).length;

  async function addPrinter(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const result = await json<{ printer: PrinterItem }>("/api/shops/printers", { method: "POST", body: JSON.stringify({ name, protocol, address, supportsColour, supportsDuplex, paperSizes: selectedSizes }) });
      setPrinters((current) => [...current, result.printer]); setName(""); setAddress(""); setSupportsColour(false); setSupportsDuplex(false); setSelectedSizes(["A4"]);
      setNotice(protocol === "ipp" ? "IPP printer saved. It will remain pending until a local print agent can verify it." : "Simulated printer added. It can test queue and routing behavior but produces no physical output.");
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
      const configuredRoutes = routes.filter((route) => {
        const printer = printers.find((item) => item._id === route.printerId);
        return shop?.enabledPaperSizes.includes(route.paperSize) && (!route.colour || shop.colourEnabled) && (!route.duplex || shop.duplexEnabled) && Boolean(printer);
      });
      const result = await json<{ routes: PrintRoute[] }>("/api/shops/printer-routes", { method: "PUT", body: JSON.stringify({ routes: configuredRoutes }) });
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

  async function createPairingCode() {
    if (!desktopBridge) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await json<{ pairingCode: string; expiresAt: string }>("/api/agent/pairing-code", { method: "POST", body: JSON.stringify({}) });
      await desktopBridge.pair(result.pairingCode, agentApiUrl);
      setNotice("This computer is connected. Its Windows printers will appear below.");
      await load(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create a pairing code."); }
    finally { setSaving(false); }
  }

  async function revokeDevice(device: ConnectedDevice) {
    if (!window.confirm(`Disconnect ${device.deviceName}? It will stop receiving jobs until paired again.`)) return;
    try { await json<void>(`/api/agent/devices/${device.id}`, { method: "DELETE" }); setDevices((current) => current.filter((item) => item.id !== device.id)); setPrinters((current) => current.map((printer) => printer.agentDeviceId === device.id ? { ...printer, status: "offline" } : printer)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not disconnect this computer."); }
  }

  if (loading) return <div className="workspace-loading"><LoaderCircle className="spin" size={24} /> Loading printer setup…</div>;
  return <div className="workspace-page"><header className="workspace-header"><a className="brand" href="/"><span className="brand-mark"><Printer size={20} /></span><span>printly.</span></a><a className="back-link" href="/dashboard/orders">Print jobs</a></header><main className="settings-main printer-management-main">
    <div className="printer-page-heading"><div><h1>Printers</h1><p>{availablePrinters.length} of {printers.length} printers available. Jobs are sent to the right printer automatically.</p></div><div className="printer-page-actions"><a className="printer-help-button printer-help-primary" href="https://www.youtube.com/watch?v=A9XypZ1avjI" target="_blank" rel="noreferrer"><CircleHelp size={14}/> How to connect printer</a><button type="button" className="order-refresh-button" disabled={refreshing} onClick={() => void load(true)}><RefreshCw className={refreshing ? "spin" : ""} size={14}/> {refreshing ? "Refreshing…" : "Refresh printers"}</button></div></div>
    {error && <div className="form-alert settings-alert" role="alert">{error}</div>}{notice && <div className="success-alert" role="status">{notice}</div>}

    <section className="settings-card connected-pcs-card"><div className="printer-section-heading"><div><h2>Connected PCs</h2><p>Windows computers running Printly</p></div>{desktopBridge && <div className="printer-page-actions"><button type="button" onClick={() => void createPairingCode()} disabled={saving}><Plus size={14}/>{saving ? "Connecting…" : "Connect this computer"}</button></div>}</div>{devices.length ? devices.map((device) => <article className="merchant-order-card" key={device.id}><div className="merchant-order-heading"><b><Monitor size={14}/> {device.deviceName}</b><span className={`order-status-pill ${device.status === "online" ? "status-printed" : "status-awaiting_cash"}`}>{device.status === "online" ? "Online" : "Offline"}</span></div><div className="merchant-order-summary"><span>Printly Agent {device.agentVersion}</span><span>Last seen {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "Not yet connected"}</span></div><div className="merchant-order-actions"><button className="danger" type="button" onClick={() => void revokeDevice(device)}><Trash2 size={14}/> Disconnect</button></div></article>) : <div className="connected-pcs-empty"><span><Printer size={22}/></span><b>No PC connected yet</b><p>Open Printly on the Windows computer connected to your shop printers and choose “Connect this computer”.</p></div>}</section>

    <section className="settings-card printer-routing-card"><div className="printer-section-heading"><div><h2>Routing rules</h2><p>Which printer gets each kind of job — based on your Page setting</p></div><span className={`printer-route-count${missingRoutes ? " has-missing" : ""}`}>{missingRoutes} need a printer</span></div>
      {paperSizes.map((paperSize) => {
        const paperEnabled = Boolean(shop?.enabledPaperSizes.includes(paperSize));
        const rates = shop?.rates[paperSize];
        return <div className="printer-route-paper" key={paperSize}><h3>{paperSize} paper</h3>{paperEnabled ? [false, true].flatMap((colour) => [false, true].map((duplex) => ({ colour, duplex }))).map(({ colour, duplex }) => {
          const key = `${paperSize}:${colour}:${duplex}`;
          const featureEnabled = (!colour || Boolean(shop?.colourEnabled)) && (!duplex || Boolean(shop?.duplexEnabled));
          const rate = duplex ? colour ? rates?.colourDuplexSheetPaise : rates?.blackWhiteDuplexSheetPaise : colour ? rates?.colourSimplexPaise : rates?.blackWhiteSimplexPaise;
          const current = routes.find((route) => `${route.paperSize}:${route.colour}:${route.duplex}` === key)?.printerId ?? "";
          const compatible = printers.filter((printer) => printer.paperSizes.includes(paperSize) && (!colour || printer.supportsColour) && (!duplex || printer.supportsDuplex));
          return <div className={`printer-route-row${featureEnabled && !current ? " needs-route" : ""}${!featureEnabled ? " route-disabled" : ""}`} key={key}><div className="printer-route-option"><span className={`route-mode-dot${colour ? " colour" : ""}`}/><div><b>{colour ? "Colour" : "B&W"} · {duplex ? "Both sides" : "One side"}</b><small>{money(rate ?? 0)} / {duplex ? "sheet" : "page"}</small></div><span className="route-arrow">→</span></div>{featureEnabled ? <div className="printer-route-select"><select aria-label={`${paperSize} ${colour ? "colour" : "black and white"} ${duplex ? "duplex" : "single side"} printer`} value={current} onChange={(event) => updateRoute(key, event.target.value)}><option value="">Not assigned</option>{compatible.map((printer) => <option value={printer._id} key={printer._id}>{printer.name}</option>)}</select>{compatible.length === 0 && <small className="route-error">No compatible printer is available — add or edit a printer.</small>}</div> : <div className="route-disabled-note">{colour && !shop?.colourEnabled ? "Colour is switched off in Page setting — customers can’t order it." : "Both-sided printing is switched off in Page setting — customers can’t order it."}</div>}</div>;
        }) : <div className="printer-paper-disabled">{paperSize} is switched off in <a href="/dashboard/setting/page">Page setting</a> — customers can’t order it.</div>}</div>;
      })}
      <button className="button button-dark" type="button" disabled={saving || printers.length === 0} onClick={() => void saveRoutes()}><Save size={15}/>{saving ? "Saving…" : "Save routing rules"}</button>
    </section>

    <section className="settings-card registered-printers-card" id="registered-printers"><div className="printer-section-heading"><div><h2>Printers added</h2><p>Printers discovered by the desktop agent and saved for this shop</p></div><span>{printers.length} total</span></div>
      {printers.length ? printers.map((printer) => <article className="merchant-order-card" key={printer._id}><div className="merchant-order-heading"><b>{printer.name}</b><span className={`order-status-pill ${printer.status === "ready" ? "status-printed" : "status-awaiting_cash"}`}>{printer.protocol === "windows" ? `Windows ${printer.status}` : printer.protocol === "ipp" ? "Agent pending" : `Simulation ${printer.status}`}</span></div><div className="merchant-order-summary"><span>{printer.protocol === "windows" ? `${printer.systemName ?? "Windows printer"} · ${devices.find((device) => device.id === printer.agentDeviceId)?.deviceName ?? "PC agent"}` : printer.protocol === "ipp" ? printer.address : "Simulated printer · no physical output"}</span><span>{printer.paperSizes?.join(", ") ?? "A4"} · {printer.supportsColour ? "Colour" : "B&W"} · {printer.supportsDuplex ? "Duplex" : "Single-sided"}</span></div><div className="merchant-order-actions">{printer.protocol === "simulated" && <button type="button" onClick={() => void toggleSimulated(printer)}>Set {printer.status === "ready" ? "offline" : "ready"}</button>}{printer.protocol !== "windows" && <button type="button" className="danger" onClick={() => void removePrinter(printer)}><Trash2 size={14}/> Remove</button>}</div></article>) : <div className="printer-no-registered"><Printer size={23}/><b>No printers added</b><p>Connect the Windows agent to discover physical printers. Simulated printers remain useful for testing queue and routing behavior.</p></div>}
      <form className="settings-fields two-col printer-add-form" onSubmit={(event) => void addPrinter(event)}><label>Printer name<input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Counter printer"/></label><label>Connection<select value={protocol} onChange={(event) => setProtocol(event.target.value as "simulated" | "ipp")}><option value="simulated">Simulated</option><option value="ipp">IPP network printer</option></select></label><div className="field-full"><b>Supported paper sizes</b><div className="choice-row">{["A4", "A5", "Legal", "A3"].map((size) => <label className={`choice-chip${selectedSizes.includes(size) ? " selected" : ""}`} key={size}><input type="checkbox" checked={selectedSizes.includes(size)} onChange={() => setSelectedSizes((current) => current.includes(size) ? current.filter((value) => value !== size) : [...current, size])}/><span>{size}</span></label>)}</div></div><label className="toggle-row"><span><b>Colour capable</b></span><input type="checkbox" checked={supportsColour} onChange={(event) => setSupportsColour(event.target.checked)}/><i/></label><label className="toggle-row"><span><b>Duplex capable</b></span><input type="checkbox" checked={supportsDuplex} onChange={(event) => setSupportsDuplex(event.target.checked)}/><i/></label>{protocol === "ipp" && <label className="field-full">IPP address<input required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="ipp://192.168.1.40:631/ipp/print"/><small>For the Android virtual printer, use the phone IP and its advertised IPP URL.</small></label>}<button className="button button-dark" type="submit" disabled={saving || selectedSizes.length === 0}><Plus size={15}/>{saving ? "Adding…" : "Add printer"}</button></form>
    </section>
  </main></div>;
}
