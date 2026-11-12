import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Laptop,
  Monitor,
  Plus,
  Printer,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";

type PaperSize = "A3" | "A4" | "A5" | "Legal";

type Device = {
  id: string;
  deviceName: string;
  agentVersion: string;
  status: "online" | "offline";
  lastSeenAt?: string;
  createdAt?: string;
};

type ShopPrinterItem = {
  _id: string;
  name: string;
  systemName?: string;
  protocol: "simulated" | "ipp" | "windows";
  status: "ready" | "offline";
  paperSizes: PaperSize[];
  supportsColour: boolean;
  supportsDuplex: boolean;
  isDefault?: boolean;
};

type RouteItem = {
  paperSize: PaperSize;
  colour: boolean;
  duplex: boolean;
  printerId: string;
};

type ShopSettings = {
  enabledPaperSizes: PaperSize[];
  colourEnabled: boolean;
  duplexEnabled: boolean;
};

declare global {
  interface Window {
    printly?: {
      getStatus: () => Promise<{ connected: boolean; deviceName?: string; shopName?: string }>;
      pair: (code: string, apiUrl: string) => Promise<{ connected: boolean; deviceName: string }>;
      disconnect: () => Promise<{ connected: boolean }>;
      onStatus: (callback: (status: unknown) => void) => () => void;
    };
  }
}

export function PrinterManagementPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [printers, setPrinters] = useState<ShopPrinterItem[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [shop, setShop] = useState<ShopSettings | null>(null);

  // Pairing code state
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<Date | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Route saving state
  const [savingRoutes, setSavingRoutes] = useState(false);

  // Manual Add Printer Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [manualName, setManualName] = useState("Virtual PDF Printer");
  const [manualProtocol, setManualProtocol] = useState<"simulated" | "ipp">("simulated");
  const [manualAddress, setManualAddress] = useState("");
  const [manualColour, setManualColour] = useState(true);
  const [manualDuplex, setManualDuplex] = useState(true);
  const [addingPrinter, setAddingPrinter] = useState(false);

  const isInsideElectron = typeof window !== "undefined" && Boolean(window.printly);

  async function loadData() {
    setError("");
    try {
      const [printersRes, devicesRes, shopRes] = await Promise.all([
        fetch("/api/shops/printers", { credentials: "same-origin" }),
        fetch("/api/agent/devices", { credentials: "same-origin" }),
        fetch("/api/shops/me", { credentials: "same-origin" }),
      ]);

      if (printersRes.status === 401 || devicesRes.status === 401 || shopRes.status === 401) {
        window.location.assign("/login");
        return;
      }

      if (!printersRes.ok) throw new Error("Could not load registered printers.");
      if (!devicesRes.ok) throw new Error("Could not load connected devices.");

      const printersData = await printersRes.json();
      const devicesData = await devicesRes.json();
      const shopData = await shopRes.json();

      setPrinters(printersData.printers ?? []);
      setRoutes(printersData.routes ?? []);
      setDevices(devicesData.devices ?? []);
      if (shopData?.shop) {
        setShop({
          enabledPaperSizes: shopData.shop.enabledPaperSizes ?? ["A4"],
          colourEnabled: Boolean(shopData.shop.colourEnabled),
          duplexEnabled: Boolean(shopData.shop.duplexEnabled),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load printer data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // Poll devices and printers every 15 seconds to catch live desktop agent heartbeats
    const interval = setInterval(() => {
      void loadData();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Live countdown timer for pairing code
  useEffect(() => {
    if (!pairingExpiresAt) return;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((pairingExpiresAt.getTime() - Date.now()) / 1000));
      setCountdownSeconds(remaining);
      if (remaining <= 0) {
        setPairingCode(null);
        setPairingExpiresAt(null);
      }
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [pairingExpiresAt]);

  async function handleGeneratePairingCode() {
    setGeneratingCode(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/agent/pairing-code", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate pairing code.");

      setPairingCode(data.pairingCode);
      setPairingExpiresAt(new Date(data.expiresAt));

      // If running inside the Electron agent window, automatically pair!
      if (window.printly) {
        try {
          const apiUrl = window.location.origin;
          await window.printly.pair(data.pairingCode, apiUrl);
          setSuccess("Connected! Desktop agent paired automatically.");
          await loadData();
        } catch (pairErr) {
          setError(pairErr instanceof Error ? pairErr.message : "Automatic desktop pairing failed.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get pairing code.");
    } finally {
      setGeneratingCode(false);
    }
  }

  async function handleDisconnectDevice(deviceId: string) {
    if (!window.confirm("Disconnect and revoke this computer? It will stop receiving print jobs.")) return;
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/agent/devices/${deviceId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Could not disconnect device.");

      if (window.printly) {
        await window.printly.disconnect().catch(() => {});
      }

      setSuccess("Computer disconnected.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    }
  }

  async function handleDeletePrinter(printerId: string) {
    if (!window.confirm("Remove this printer and its routing rules?")) return;
    setError("");
    try {
      const response = await fetch(`/api/shops/printers/${printerId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Could not remove printer.");
      setSuccess("Printer removed.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove printer.");
    }
  }

  async function handleAddManualPrinter(e: React.FormEvent) {
    e.preventDefault();
    setAddingPrinter(true);
    setError("");
    try {
      const response = await fetch("/api/shops/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: manualName.trim(),
          protocol: manualProtocol,
          address: manualProtocol === "ipp" ? manualAddress.trim() : undefined,
          supportsColour: manualColour,
          supportsDuplex: manualDuplex,
          paperSizes: ["A4", "A3", "A5", "Legal"],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not register printer.");
      setSuccess(`Printer "${manualName}" added.`);
      setAddModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add printer.");
    } finally {
      setAddingPrinter(false);
    }
  }

  // Generate required route combinations based on shop enabled paper sizes & options
  const possibleCombinations = useMemo(() => {
    if (!shop) return [];
    const combos: Array<{ paperSize: PaperSize; colour: boolean; duplex: boolean; label: string }> = [];
    for (const size of shop.enabledPaperSizes) {
      // B&W Simplex
      combos.push({ paperSize: size, colour: false, duplex: false, label: `${size} · Black & White · Single-sided` });
      // B&W Duplex (if enabled)
      if (shop.duplexEnabled) {
        combos.push({ paperSize: size, colour: false, duplex: true, label: `${size} · Black & White · Double-sided` });
      }
      // Colour Simplex (if enabled)
      if (shop.colourEnabled) {
        combos.push({ paperSize: size, colour: true, duplex: false, label: `${size} · Colour · Single-sided` });
        if (shop.duplexEnabled) {
          combos.push({ paperSize: size, colour: true, duplex: true, label: `${size} · Colour · Double-sided` });
        }
      }
    }
    return combos;
  }, [shop]);

  function getPrinterForCombo(paperSize: PaperSize, colour: boolean, duplex: boolean): string {
    const found = routes.find((r) => r.paperSize === paperSize && r.colour === colour && r.duplex === duplex);
    return found ? found.printerId : "";
  }

  function handleRouteChange(paperSize: PaperSize, colour: boolean, duplex: boolean, printerId: string) {
    setRoutes((current) => {
      const filtered = current.filter((r) => !(r.paperSize === paperSize && r.colour === colour && r.duplex === duplex));
      if (!printerId) return filtered;
      return [...filtered, { paperSize, colour, duplex, printerId }];
    });
  }

  function handleAutoRouteAll(printerId: string) {
    if (!printerId) return;
    const newRoutes = possibleCombinations.map((c) => ({
      paperSize: c.paperSize,
      colour: c.colour,
      duplex: c.duplex,
      printerId,
    }));
    setRoutes(newRoutes);
    setSuccess(`All routes mapped to selected printer. Click "Save Routing Rules" below to apply.`);
  }

  async function handleSaveRoutes() {
    setSavingRoutes(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/shops/printer-routes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ routes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save routing rules.");
      setSuccess("Printer routing rules saved successfully!");
      setRoutes(data.routes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save routes.");
    } finally {
      setSavingRoutes(false);
    }
  }

  function copyCode() {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="workspace-page">
      <main className="settings-main printer-management-main" style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 80px" }}>
        {/* Header */}
        <header className="printer-page-heading">
          <div>
            <h1>Printers & Print Agent</h1>
            <p>Connect your Windows PC running Printly Agent to automatically route orders to "Microsoft Print to PDF" or physical printers.</p>
          </div>
          <div className="printer-page-actions">
            <button
              type="button"
              className="button button-dark"
              onClick={handleGeneratePairingCode}
              disabled={generatingCode}
              style={{ gap: 8, fontSize: 13, padding: "10px 18px" }}
            >
              <Zap size={16} /> {generatingCode ? "Generating..." : "Connect Computer (Pairing Code)"}
            </button>
          </div>
        </header>

        {error && <div className="form-alert" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
        {success && <div className="success-alert" role="status" style={{ marginBottom: 16 }}><CheckCircle2 size={16} /> {success}</div>}

        {/* Pairing Code Card Banner */}
        {pairingCode && (
          <section
            className="agent-pairing-code"
            style={{
              marginBottom: 24,
              border: "2px solid #0aa579",
              background: "#effcf6",
              borderRadius: 14,
              padding: "20px 24px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#078c68", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
                <Clock size={16} /> Pairing Code (Valid for {Math.floor(countdownSeconds / 60)}m {countdownSeconds % 60}s)
              </div>
              <b style={{ fontSize: 34, letterSpacing: 6, color: "#07865f", margin: "8px 0" }}>
                {pairingCode.slice(0, 3)} {pairingCode.slice(3)}
              </b>
              <small style={{ color: "#475569", fontSize: 13, lineHeight: 1.5 }}>
                Launch <b>Printly Desktop Agent</b> on your Windows PC and enter this code to connect your computer.
                Your local printers (including <b>Microsoft Print to PDF</b>) will appear here automatically.
              </small>
            </div>
            <button
              type="button"
              onClick={copyCode}
              style={{
                border: "1px solid #079d72",
                background: "#fff",
                color: "#078c68",
                padding: "10px 18px",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
              }}
            >
              <Copy size={15} /> {copiedCode ? "Copied!" : "Copy Code"}
            </button>
          </section>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
            <RefreshCw size={24} className="spin" style={{ margin: "0 auto 12px" }} />
            <p>Loading connected devices and printers...</p>
          </div>
        ) : (
          <>
            {/* Section 1: Connected Windows PCs */}
            <section
              className="settings-card connected-pcs-card"
              style={{
                marginBottom: 24,
                padding: 20,
                borderRadius: 14,
                border: "1px solid #e2e8ef",
                background: "#fff",
              }}
            >
              <div className="printer-section-heading">
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 750, fontFamily: "Manrope, sans-serif" }}>Connected Windows Computers ({devices.length})</h2>
                  <p style={{ fontSize: 11, color: "#64748b" }}>Computers running the Printly desktop agent to poll and execute print jobs.</p>
                </div>
                <button
                  type="button"
                  onClick={loadData}
                  style={{ border: 0, background: "transparent", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}
                >
                  <RefreshCw size={13} /> Refresh Status
                </button>
              </div>

              {devices.length === 0 ? (
                <div className="connected-pcs-empty" style={{ padding: "32px 20px" }}>
                  <span><Laptop size={24} /></span>
                  <b>No Windows Computer Connected Yet</b>
                  <p>
                    Run the Printly desktop agent on your Windows PC and click <b>"Connect Computer"</b> above to pair it.
                    The agent will discover your installed printers like <b>Microsoft Print to PDF</b>.
                  </p>
                  <button type="button" onClick={handleGeneratePairingCode} style={{ marginTop: 10 }}>
                    Get 6-digit Pairing Code
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {devices.map((device) => (
                    <div
                      key={device.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 18px",
                        borderRadius: 10,
                        border: device.status === "online" ? "1px solid #a7f3d0" : "1px solid #e2e8ef",
                        background: device.status === "online" ? "#f0fdf4" : "#f8fafc",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 10,
                            display: "grid",
                            placeItems: "center",
                            background: device.status === "online" ? "#dcfce7" : "#e2e8ef",
                            color: device.status === "online" ? "#16a34a" : "#64748b",
                          }}
                        >
                          <Monitor size={20} />
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <b style={{ fontSize: 14, color: "#0f172a" }}>{device.deviceName}</b>
                            {device.status === "online" ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#dcfce7", color: "#15803d", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                                <Wifi size={11} /> ONLINE
                              </span>
                            ) : (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f1f5f9", color: "#64748b", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                                <WifiOff size={11} /> OFFLINE
                              </span>
                            )}
                          </div>
                          <small style={{ color: "#64748b", fontSize: 11 }}>
                            Agent v{device.agentVersion} · Last heartbeat: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleTimeString("en-IN") : "Never"}
                          </small>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDisconnectDevice(device.id)}
                        style={{
                          border: "1px solid #fca5a5",
                          background: "#fff",
                          color: "#dc2626",
                          padding: "6px 12px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Disconnect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Section 2: Discovered & Configured Printers */}
            <section
              className="settings-card registered-printers-card"
              style={{
                marginBottom: 24,
                padding: 20,
                borderRadius: 14,
                border: "1px solid #e2e8ef",
                background: "#fff",
              }}
            >
              <div className="printer-section-heading">
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 750, fontFamily: "Manrope, sans-serif" }}>Available Printers ({printers.length})</h2>
                  <p style={{ fontSize: 11, color: "#64748b" }}>Printers discovered by your connected PC or added as virtual printers.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddModalOpen(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600 }}
                >
                  <Plus size={14} /> Add Virtual / IPP Printer
                </button>
              </div>

              {printers.length === 0 ? (
                <div className="printer-no-registered" style={{ padding: "32px 20px" }}>
                  <Printer size={28} style={{ color: "#94a3b8" }} />
                  <b>No Printers Detected Yet</b>
                  <p>
                    Once your Windows computer connects, its installed printers (including <b>Microsoft Print to PDF</b>) will show up here automatically.
                  </p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                  {printers.map((printer) => {
                    const isPdf = printer.name.toLowerCase().includes("pdf");
                    return (
                      <article
                        key={printer._id}
                        style={{
                          padding: "16px 18px",
                          borderRadius: 11,
                          border: "1px solid #e2e8ef",
                          background: "#fff",
                          display: "flex",
                          flexDirection: "column",
                          position: "relative",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <b style={{ fontSize: 14, color: "#0f172a" }}>{printer.name}</b>
                              {isPdf && (
                                <span style={{ background: "#dbeafe", color: "#1e40af", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4 }}>
                                  VIRTUAL PDF
                                </span>
                              )}
                            </div>
                            <small style={{ color: "#64748b", fontSize: 11, textTransform: "capitalize" }}>
                              Protocol: {printer.protocol} · Status: <span style={{ color: printer.status === "ready" ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{printer.status}</span>
                            </small>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeletePrinter(printer._id)}
                            title="Remove Printer"
                            style={{ border: 0, background: "transparent", color: "#94a3b8", cursor: "pointer", padding: 4 }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {/* Capabilities badges */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0 14px", fontSize: 10 }}>
                          <span style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4, color: "#475569" }}>
                            Sizes: {printer.paperSizes?.join(", ") || "A4"}
                          </span>
                          <span style={{ background: printer.supportsColour ? "#fef3c7" : "#f1f5f9", color: printer.supportsColour ? "#92400e" : "#475569", padding: "2px 7px", borderRadius: 4 }}>
                            {printer.supportsColour ? "Colour & B&W" : "B&W Only"}
                          </span>
                          <span style={{ background: printer.supportsDuplex ? "#dcfce7" : "#f1f5f9", color: printer.supportsDuplex ? "#166534" : "#475569", padding: "2px 7px", borderRadius: 4 }}>
                            {printer.supportsDuplex ? "2-Sided (Duplex)" : "1-Sided"}
                          </span>
                        </div>

                        {/* Quick action to route all options to this printer */}
                        <button
                          type="button"
                          onClick={() => handleAutoRouteAll(printer._id)}
                          style={{
                            marginTop: "auto",
                            border: "1px solid #cbd5e1",
                            background: "#f8fafc",
                            color: "#334155",
                            padding: "7px 10px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Route All Orders Here
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Section 3: Printer Routing Rules */}
            <section
              className="settings-card printer-routing-card"
              style={{
                padding: 20,
                borderRadius: 14,
                border: "1px solid #e2e8ef",
                background: "#fff",
              }}
            >
              <div className="printer-section-heading">
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 750, fontFamily: "Manrope, sans-serif" }}>Printer Routing Rules</h2>
                  <p style={{ fontSize: 11, color: "#64748b" }}>Choose which printer receives each paper size, colour mode, and duplex combination.</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className={`printer-route-count ${routes.length < possibleCombinations.length ? "has-missing" : ""}`}>
                    {routes.length} of {possibleCombinations.length} routes configured
                  </span>
                  <button
                    type="button"
                    className="button button-dark"
                    onClick={handleSaveRoutes}
                    disabled={savingRoutes}
                    style={{ padding: "8px 16px", fontSize: 12 }}
                  >
                    {savingRoutes ? "Saving..." : "Save Routing Rules"}
                  </button>
                </div>
              </div>

              {printers.length === 0 ? (
                <div style={{ padding: "20px 0", color: "#64748b", fontSize: 12 }}>
                  Connect a computer or add a printer above to configure routing rules.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                  {possibleCombinations.map((combo) => {
                    const selectedPrinterId = getPrinterForCombo(combo.paperSize, combo.colour, combo.duplex);
                    return (
                      <div
                        key={combo.label}
                        className={`printer-route-row ${!selectedPrinterId ? "needs-route" : ""}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.4fr 1.6fr",
                          alignItems: "center",
                          gap: 14,
                          padding: "10px 14px",
                          borderRadius: 8,
                          border: "1px solid #e2e8ef",
                          background: selectedPrinterId ? "#fff" : "#fffbeb",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: combo.colour ? "#f59e0b" : "#475569",
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>{combo.label}</span>
                        </div>

                        <div className="printer-route-select">
                          <select
                            value={selectedPrinterId}
                            onChange={(e) => handleRouteChange(combo.paperSize, combo.colour, combo.duplex, e.target.value)}
                            style={{
                              width: "100%",
                              height: 36,
                              padding: "0 10px",
                              borderRadius: 6,
                              border: "1px solid #cbd5e1",
                              fontSize: 12,
                            }}
                          >
                            <option value="">-- No Printer Assigned (Manual Fulfillment) --</option>
                            {printers.map((p) => (
                              <option key={p._id} value={p._id}>
                                {p.name} {p.name.includes("PDF") ? "(Virtual Print to PDF)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* Add Manual Virtual/IPP Printer Modal */}
        {addModalOpen && (
          <div className="subscription-modal-backdrop" role="presentation" onClick={() => setAddModalOpen(false)}>
            <div
              className="subscription-plan-dialog"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 480 }}
            >
              <header>
                <div>
                  <h2>Add Printer (Virtual / IPP)</h2>
                  <p>Register a virtual printer for instant testing without hardware.</p>
                </div>
                <button type="button" className="subscription-modal-close" onClick={() => setAddModalOpen(false)}>
                  <X size={18} />
                </button>
              </header>

              <form onSubmit={handleAddManualPrinter} style={{ padding: 20 }}>
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="printerNameInput" style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Printer Name</label>
                  <input
                    id="printerNameInput"
                    type="text"
                    required
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="e.g. Virtual PDF Printer"
                    style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 7, border: "1px solid #cbd5e1", fontSize: 13 }}
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="printerProtocolSelect" style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Protocol</label>
                  <select
                    id="printerProtocolSelect"
                    value={manualProtocol}
                    onChange={(e) => setManualProtocol(e.target.value as "simulated" | "ipp")}
                    style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 7, border: "1px solid #cbd5e1", fontSize: 13 }}
                  >
                    <option value="simulated">Simulated (Virtual / Software Testing)</option>
                    <option value="ipp">Network IPP (ipp://...)</option>
                  </select>
                </div>

                {manualProtocol === "ipp" && (
                  <div style={{ marginBottom: 14 }}>
                    <label htmlFor="printerAddressInput" style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>IPP Address</label>
                    <input
                      id="printerAddressInput"
                      type="text"
                      required
                      value={manualAddress}
                      onChange={(e) => setManualAddress(e.target.value)}
                      placeholder="ipp://192.168.1.50:631/ipp/print"
                      style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 7, border: "1px solid #cbd5e1", fontSize: 13 }}
                    />
                  </div>
                )}

                <div style={{ display: "flex", gap: 20, marginBottom: 20, fontSize: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={manualColour} onChange={(e) => setManualColour(e.target.checked)} />
                    <span>Supports Colour</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={manualDuplex} onChange={(e) => setManualDuplex(e.target.checked)} />
                    <span>Supports Duplex (2-sided)</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={addingPrinter}
                  className="button button-dark"
                  style={{ width: "100%", height: 40, fontSize: 13 }}
                >
                  {addingPrinter ? "Adding..." : "Register Printer"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
