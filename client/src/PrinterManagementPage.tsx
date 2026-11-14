import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Monitor,
  MoreVertical,
  PlayCircle,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
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
  agentDeviceId?: string;
};

type RouteItem = {
  paperSize: PaperSize;
  colour: boolean;
  duplex: boolean;
  printerId: string;
};

type Rate = {
  blackWhiteSimplexPaise: number;
  colourSimplexPaise: number;
  blackWhiteDuplexSheetPaise: number;
  colourDuplexSheetPaise: number;
};

type ShopSettings = {
  enabledPaperSizes: PaperSize[];
  colourEnabled: boolean;
  duplexEnabled: boolean;
  rates?: Record<string, Rate>;
};

declare global {
  interface Window {
    printly?: {
      getStatus: () => Promise<{ connected: boolean; deviceName?: string; shopName?: string }>;
      refresh: () => Promise<{ connected: boolean; deviceName?: string; shopName?: string }>;
      connect?: () => Promise<{ connected: boolean; deviceName?: string; shopName?: string }>;
      setShopOnline: (isOnline: boolean) => Promise<{ isOnline: boolean; agentOnline: boolean }>;
      disconnect: () => Promise<{ connected: boolean }>;
      openExternal: (url: string) => Promise<boolean>;
      onStatus: (callback: (status: unknown) => void) => () => void;
    };
  }
}

const allPaperSizes: PaperSize[] = ["A4", "Legal", "A5", "A3"];

const formatRate = (paise?: number) => {
  if (paise === undefined || isNaN(paise)) return "₹0";
  return `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;
};

export function PrinterManagementPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [printers, setPrinters] = useState<ShopPrinterItem[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [shop, setShop] = useState<ShopSettings | null>(null);

  // Modals
  const [howToModalOpen, setHowToModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [manualName, setManualName] = useState("Virtual PDF Printer");
  const [manualProtocol, setManualProtocol] = useState<"simulated" | "ipp">("simulated");
  const [manualAddress, setManualAddress] = useState("");
  const [manualColour, setManualColour] = useState(true);
  const [manualDuplex, setManualDuplex] = useState(true);
  const [addingPrinter, setAddingPrinter] = useState(false);

  // Device menu toggle
  const [deviceMenuOpen, setDeviceMenuOpen] = useState<string | null>(null);

  // Saving routes
  const [savingRoutes, setSavingRoutes] = useState(false);

  const isInsideElectron = typeof window !== "undefined" && Boolean(window.printly);

  async function loadData() {
    setError("");
    try {
      if (window.printly?.refresh) {
        await window.printly.refresh().catch(() => {});
        // Brief pause to allow the server to process the heartbeat payload
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

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

      const rawRoutes = Array.isArray(printersData.routes) ? printersData.routes : [];
      const normalizedRoutes: RouteItem[] = rawRoutes.map((r: any) => ({
        paperSize: r.paperSize,
        colour: Boolean(r.colour),
        duplex: Boolean(r.duplex),
        printerId: typeof r.printerId === "object" && r.printerId !== null
          ? String(r.printerId._id || r.printerId)
          : String(r.printerId || ""),
      }));

      setRoutes(normalizedRoutes);
      const loadedDevices: Device[] = devicesData.devices ?? [];
      const onlineDeviceIds = new Set(loadedDevices.filter((device) => device.status === "online").map((device) => device.id));
      setPrinters((printersData.printers ?? []).map((printer: ShopPrinterItem) => ({
        ...printer,
        ...(printer.protocol === "windows" && printer.agentDeviceId && !onlineDeviceIds.has(printer.agentDeviceId) ? { status: "offline" as const } : {}),
      })));
      setDevices(loadedDevices);
      if (shopData?.shop) {
        setShop({
          enabledPaperSizes: shopData.shop.enabledPaperSizes ?? ["A4"],
          colourEnabled: Boolean(shopData.shop.colourEnabled),
          duplexEnabled: Boolean(shopData.shop.duplexEnabled),
          rates: shopData.shop.rates ?? {},
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
    const interval = setInterval(() => {
      void loadData();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

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
      setDeviceMenuOpen(null);
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

  // Calculate combinations for each enabled paper size
  const enabledSizes = shop?.enabledPaperSizes ?? ["A4"];
  const disabledSizes = allPaperSizes.filter((s) => !enabledSizes.includes(s));

  const combinationsForSize = (size: PaperSize) => {
    if (!shop) return [];
    const combos: Array<{
      paperSize: PaperSize;
      colour: boolean;
      duplex: boolean;
      title: string;
      rateText: string;
    }> = [];

    const rates = shop.rates?.[size];

    // 1. B&W One side
    combos.push({
      paperSize: size,
      colour: false,
      duplex: false,
      title: "B&W · One side",
      rateText: `${formatRate(rates?.blackWhiteSimplexPaise)} / page`,
    });

    // 2. Colour One side (if colour enabled)
    if (shop.colourEnabled) {
      combos.push({
        paperSize: size,
        colour: true,
        duplex: false,
        title: "Colour · One side",
        rateText: `${formatRate(rates?.colourSimplexPaise)} / page`,
      });
    }

    // 3. B&W Both sides (if duplex enabled)
    if (shop.duplexEnabled) {
      combos.push({
        paperSize: size,
        colour: false,
        duplex: true,
        title: "B&W · Both sides",
        rateText: `${formatRate(rates?.blackWhiteDuplexSheetPaise)} / sheet`,
      });
    }

    // 4. Colour Both sides (if colour & duplex enabled)
    if (shop.colourEnabled && shop.duplexEnabled) {
      combos.push({
        paperSize: size,
        colour: true,
        duplex: true,
        title: "Colour · Both sides",
        rateText: `${formatRate(rates?.colourDuplexSheetPaise)} / sheet`,
      });
    }

    return combos;
  };

  const allPossibleCombos = useMemo(() => {
    return enabledSizes.flatMap((size) => combinationsForSize(size));
  }, [enabledSizes, shop]);

  function getPrinterForCombo(paperSize: PaperSize, colour: boolean, duplex: boolean): string {
    const found = routes.find(
      (r) => r.paperSize === paperSize && Boolean(r.colour) === Boolean(colour) && Boolean(r.duplex) === Boolean(duplex)
    );
    if (!found) return "";
    return typeof found.printerId === "object" && found.printerId !== null
      ? String((found.printerId as any)._id || found.printerId)
      : String(found.printerId || "");
  }

  const unassignedCount = useMemo(() => {
    return allPossibleCombos.filter((c) => !getPrinterForCombo(c.paperSize, c.colour, c.duplex)).length;
  }, [allPossibleCombos, routes]);

  async function handleRouteChange(paperSize: PaperSize, colour: boolean, duplex: boolean, printerId: string) {
    const currentNormalized = routes.map((r: any) => ({
      paperSize: r.paperSize,
      colour: Boolean(r.colour),
      duplex: Boolean(r.duplex),
      printerId: typeof r.printerId === "object" && r.printerId !== null ? String(r.printerId._id || r.printerId) : String(r.printerId || ""),
    }));

    const updatedRoutes = currentNormalized.filter(
      (r) => !(r.paperSize === paperSize && r.colour === colour && r.duplex === duplex)
    );
    if (printerId) {
      updatedRoutes.push({ paperSize, colour, duplex, printerId });
    }
    setRoutes(updatedRoutes);

    // Auto-save the new route to backend
    setSavingRoutes(true);
    setError("");
    try {
      const response = await fetch("/api/shops/printer-routes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ routes: updatedRoutes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save route.");
      const savedRoutes = (data.routes ?? updatedRoutes).map((r: any) => ({
        paperSize: r.paperSize,
        colour: Boolean(r.colour),
        duplex: Boolean(r.duplex),
        printerId: typeof r.printerId === "object" && r.printerId !== null ? String(r.printerId._id || r.printerId) : String(r.printerId || ""),
      }));
      setRoutes(savedRoutes);
      setSuccess("Printer route updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to auto-save route.");
      void loadData();
    } finally {
      setSavingRoutes(false);
    }
  }

  async function handleAutoAssignAll() {
    if (printers.length === 0) return;
    const targetPrinter = printers.find((p) => p.isDefault) || printers.find((p) => p.status === "ready") || printers[0];
    const newRoutes = allPossibleCombos.map((combo) => ({
      paperSize: combo.paperSize,
      colour: combo.colour,
      duplex: combo.duplex,
      printerId: targetPrinter._id,
    }));
    setRoutes(newRoutes);
    setSavingRoutes(true);
    setError("");
    try {
      const res = await fetch("/api/shops/printer-routes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ routes: newRoutes }),
      });
      if (!res.ok) throw new Error("Could not save auto-assigned routes.");
      const data = await res.json();
      const savedRoutes = (data.routes ?? newRoutes).map((r: any) => ({
        paperSize: r.paperSize,
        colour: Boolean(r.colour),
        duplex: Boolean(r.duplex),
        printerId: typeof r.printerId === "object" && r.printerId !== null ? String(r.printerId._id || r.printerId) : String(r.printerId || ""),
      }));
      setRoutes(savedRoutes);
      setSuccess(`All print routes assigned to ${targetPrinter.name}!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to auto-assign routes.");
      void loadData();
    } finally {
      setSavingRoutes(false);
    }
  }

  const availablePrinters = printers.filter((p) => p.status === "ready");
  const onlineDevices = devices.filter((d) => d.status === "online");

  if (loading) {
    return (
      <div className="workspace-loading" style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#64748b" }}>
        <RefreshCw size={22} className="spin" />
        <span style={{ fontSize: 14, fontWeight: 500 }}>Loading printers and computers…</span>
      </div>
    );
  }

  return (
    <div className="workspace-page" style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <main className="settings-main printer-management-main" style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 80px" }}>
        {/* Top Header Row */}
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: 0, fontFamily: "Manrope, sans-serif", letterSpacing: "-0.5px" }}>
              Printers
            </h1>
            <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>
              {availablePrinters.length} of {printers.length} printers available. Jobs are sent to the right printer automatically.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {/* Red Pill: How to connect printer */}
            <button
              type="button"
              onClick={() => setHowToModalOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 18px",
                borderRadius: 999,
                background: "#dc2626",
                border: "none",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(220, 38, 38, 0.25)",
                transition: "all 0.15s",
              }}
            >
              <PlayCircle size={14} fill="#ffffff" color="#dc2626" />
              <span>How to connect printer</span>
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={loadData}
              title="Refresh Printers & PCs"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                color: "#64748b",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </header>

        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", fontSize: 13, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} /> {success}
          </div>
        )}

        {/* Section 1: Connected PCs Card */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: "22px 24px",
            marginBottom: 24,
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>Connected PCs</h2>
              <p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 0" }}>
                {onlineDevices.length} of {devices.length} online · computers running the QrToPrint agent
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={() => setHowToModalOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  borderRadius: 8,
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  color: "#1e293b",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                }}
              >
                <Download size={14} style={{ color: "#64748b" }} /> Download agent
              </button>
            </div>
          </div>

          {/* Device Cards List */}
          {devices.length === 0 ? (
            <div
              style={{
                border: "1px dashed #cbd5e1",
                borderRadius: 12,
                padding: "28px 20px",
                textAlign: "center",
                background: "#f8fafc",
              }}
            >
              <Monitor size={32} style={{ color: "#94a3b8", margin: "0 auto 8px" }} />
              <b style={{ fontSize: 14, color: "#0f172a", display: "block" }}>No Windows Computer Connected Yet</b>
              <p style={{ color: "#64748b", fontSize: 12, margin: "4px auto 0", maxWidth: 440 }}>
                {isInsideElectron
                  ? "Sign in with your shop account in the desktop app. This computer connects automatically and discovers its Windows printers."
                  : "Open the Printly desktop app on the computer connected to your printers, then sign in with this shop account. It will connect automatically."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {devices.map((device) => {
                const isOnline = device.status === "online";
                const printersOnDevice = printers.filter((p) => p.protocol === "windows" && p.agentDeviceId === device.id);
                const lastSeenLabel = device.lastSeenAt ? (() => {
                  const minutes = Math.max(0, Math.floor((Date.now() - new Date(device.lastSeenAt).getTime()) / 60000));
                  return minutes < 1 ? "Just now" : minutes < 60 ? `Last seen ${minutes} min ago` : minutes < 1440 ? `Last seen ${Math.floor(minutes / 60)} hr ago` : `Last seen ${Math.floor(minutes / 1440)} day${Math.floor(minutes / 1440) === 1 ? "" : "s"} ago`;
                })() : "Never connected";

                return (
                  <div
                    key={device.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      padding: "16px 20px",
                      background: "#ffffff",
                      position: "relative",
                    }}
                  >
                    {/* Top Row: Device Name, Status, Three dots */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: isOnline ? "#ecfdf5" : "#f1f5f9",
                            color: isOnline ? "#10b981" : "#64748b",
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Monitor size={20} />
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <b style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                              {device.deviceName}
                            </b>
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                            Windows · Agent v{device.agentVersion}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ textAlign: "right" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: isOnline ? "#f0fdf4" : "#f1f5f9",
                              border: isOnline ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
                              color: isOnline ? "#15803d" : "#64748b",
                              borderRadius: 999,
                              padding: "2px 9px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {isOnline ? "✓ Online" : "Offline"}
                          </span>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                            {lastSeenLabel}
                          </div>
                        </div>

                        {/* Three dots menu */}
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            onClick={() => setDeviceMenuOpen(deviceMenuOpen === device.id ? null : device.id)}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              border: "none",
                              background: "transparent",
                              color: "#94a3b8",
                              display: "grid",
                              placeItems: "center",
                              cursor: "pointer",
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>

                          {deviceMenuOpen === device.id && (
                            <div
                              style={{
                                position: "absolute",
                                right: 0,
                                top: 34,
                                background: "#ffffff",
                                border: "1px solid #e2e8f0",
                                borderRadius: 8,
                                boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                                padding: "4px",
                                zIndex: 20,
                                width: 140,
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleDisconnectDevice(device.id)}
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  padding: "8px 12px",
                                  border: "none",
                                  background: "transparent",
                                  color: "#dc2626",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  borderRadius: 4,
                                }}
                              >
                                Disconnect PC
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {!isOnline && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#fffbeb", color: "#a45108", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}><AlertCircle size={14} />This PC is off or not connected to the internet — its printers can’t take jobs.</div>}

                    {/* Bottom Row: PRINTERS ON THIS PC */}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        PRINTERS ON THIS PC · {printersOnDevice.length}
                      </div>

                      {printersOnDevice.length === 0 ? (
                        <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                          No printers found in Windows on this PC.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                          {printersOnDevice.map((p) => {
                            const isPdf = p.name.toLowerCase().includes("pdf");
                            return (
                              <div
                                key={p._id}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "5px 10px",
                                  borderRadius: 6,
                                  border: "1px solid #e2e8f0",
                                  background: isPdf ? "#f0fdf4" : "#f8fafc",
                                  fontSize: 12,
                                  color: "#0f172a",
                                }}
                              >
                                <Printer size={13} style={{ color: p.status === "ready" ? "#10b981" : "#ef4444" }} />
                                <span>{p.name}</span>
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: p.status === "ready" ? "#15803d" : "#dc2626",
                                  background: p.status === "ready" ? "#dcfce7" : "#fee2e2",
                                  padding: "1px 5px",
                                  borderRadius: 4
                                }}>
                                  {p.status === "ready" ? "✓ Online" : "Offline"}
                                </span>
                                {isPdf && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#0284c7", background: "#e0f2fe", padding: "1px 5px", borderRadius: 4 }}>
                                    Virtual PDF
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2: Routing rules Card */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: "22px 24px",
            marginBottom: 24,
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          {/* Header Row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>Routing rules</h2>
              <p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 0" }}>
                Which printer gets each kind of job — based on your Page setting
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {unassignedCount > 0 && printers.length > 0 && (
                <button
                  type="button"
                  onClick={handleAutoAssignAll}
                  disabled={savingRoutes}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 12px",
                    borderRadius: 999,
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    color: "#059669",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <Zap size={12} /> Auto-assign All
                </button>
              )}
              {unassignedCount > 0 ? (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
                    borderRadius: 999,
                    background: "#fef2f2",
                    border: "1px solid #fee2e2",
                    color: "#dc2626",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <Clock size={13} />
                  <span>{unassignedCount} need a printer</span>
                </div>
              ) : (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 12px",
                    borderRadius: 999,
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    color: "#16a34a",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <Check size={13} />
                  <span>All routes assigned</span>
                </div>
              )}
            </div>
          </div>

          {/* 2-Column Grid: Enabled vs Disabled */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Column 1: Enabled Paper Sizes (e.g. A4) */}
            <div>
              {enabledSizes.map((size) => {
                const combos = combinationsForSize(size);
                return (
                  <div key={size} style={{ marginBottom: 20 }}>
                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          border: "1.5px solid #10b981",
                          display: "grid",
                          placeItems: "center",
                          color: "#10b981",
                        }}
                      >
                        <FileText size={12} />
                      </div>
                      <b style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{size} paper</b>
                    </div>

                    {/* Combinations list */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {combos.map((combo) => {
                        const assignedPrinterId = getPrinterForCombo(combo.paperSize, combo.colour, combo.duplex);
                        const isUnassigned = !assignedPrinterId;

                        return (
                          <div
                            key={`${combo.paperSize}-${combo.colour}-${combo.duplex}`}
                            style={{
                              border: isUnassigned ? "1px solid #fee2e2" : "1px solid #e2e8f0",
                              borderRadius: 12,
                              padding: "14px 16px",
                              background: "#ffffff",
                              transition: "border-color 0.15s ease",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span
                                  style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: "50%",
                                    background: combo.colour
                                      ? "conic-gradient(#ed4f56, #f7b433, #3dbb79, #438cf1, #a05bd2, #ed4f56)"
                                      : "#334155",
                                    flexShrink: 0,
                                  }}
                                />
                                <div>
                                  <b style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{combo.title}</b>
                                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{combo.rateText}</div>
                                </div>
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: "#94a3b8", fontSize: 16 }}>→</span>
                                <select
                                  value={assignedPrinterId}
                                  onChange={(e) =>
                                    void handleRouteChange(combo.paperSize, combo.colour, combo.duplex, e.target.value)
                                  }
                                  disabled={savingRoutes}
                                  style={{
                                    border: isUnassigned ? "1px solid #fca5a5" : "1px solid #cbd5e1",
                                    borderRadius: 8,
                                    padding: "7px 12px",
                                    fontSize: 13,
                                    color: assignedPrinterId ? "#0f172a" : "#64748b",
                                    background: "#ffffff",
                                    outline: "none",
                                    cursor: "pointer",
                                    minWidth: 160,
                                  }}
                                >
                                  <option value="">Not assigned</option>
                                  {printers.map((p) => (
                                    <option key={p._id} value={p._id}>
                                      {p.name}{p.status === "offline" ? " (Offline)" : ""}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Warning message if unassigned */}
                            {isUnassigned && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  color: "#dc2626",
                                  fontSize: 11,
                                  marginTop: 8,
                                  paddingTop: 8,
                                  borderTop: "1px dashed #fee2e2",
                                }}
                              >
                                <AlertCircle size={13} />
                                <span>
                                  No printer can print {size.toLowerCase()} {combo.colour ? "colour" : "b&w"} — add or select a printer
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Column 2: Disabled Paper Sizes (e.g. Legal, A5, A3) */}
            <div>
              {disabledSizes.map((size) => (
                <div key={size} style={{ marginBottom: 20 }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        border: "1.5px solid #10b981",
                        display: "grid",
                        placeItems: "center",
                        color: "#10b981",
                      }}
                    >
                      <FileText size={12} />
                    </div>
                    <b style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{size} paper</b>
                  </div>

                  {/* Disabled banner card */}
                  <div
                    style={{
                      border: "1px solid #f1f5f9",
                      borderRadius: 10,
                      background: "#f8fafc",
                      padding: "16px",
                      fontSize: 12,
                      color: "#64748b",
                      lineHeight: 1.5,
                    }}
                  >
                    {size} is switched off in{" "}
                    <a href="/dashboard/setting/page" style={{ color: "#079c73", fontWeight: 700, textDecoration: "underline" }}>
                      Page setting
                    </a>{" "}
                    — customers can't order it.
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 3: Available Printers / No Printers Added (Bottom Section) */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: printers.length === 0 ? "48px 24px" : "22px 24px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          {printers.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "#f1f5f9",
                  color: "#64748b",
                  display: "grid",
                  placeItems: "center",
                  marginBottom: 14,
                }}
              >
                <Printer size={24} />
              </div>

              <b style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                No printers added
              </b>
              <p style={{ color: "#64748b", fontSize: 13, maxWidth: 440, margin: "0 auto 20px", lineHeight: 1.5 }}>
                Open the QrToPrint desktop app on the computer your printers are connected to, then add them here.
              </p>

              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 20px",
                  borderRadius: 8,
                  background: "#079c73",
                  border: "none",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(7, 156, 115, 0.25)",
                }}
              >
                <Plus size={15} /> Add printer
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>Available Printers ({printers.length})</h2>
                  <p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 0" }}>
                    Printers discovered by your desktop PC or registered as virtual PDF printers.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setAddModalOpen(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    color: "#0f172a",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} /> Add Virtual / IPP Printer
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                {printers.map((printer) => {
                  const isPdf = printer.name.toLowerCase().includes("pdf");
                  return (
                    <article
                      key={printer._id}
                      style={{
                        padding: "16px 18px",
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        background: "#ffffff",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 8,
                              background: isPdf ? "#ecfdf5" : "#f1f5f9",
                              color: isPdf ? "#10b981" : "#64748b",
                              display: "grid",
                              placeItems: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Printer size={18} />
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <b style={{ fontSize: 14, color: "#0f172a" }}>{printer.name}</b>
                              {isPdf && (
                                <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4 }}>
                                  Virtual PDF
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 11, color: "#64748b", display: "inline-flex", alignItems: "center", gap: 6 }}>
                              Status:{" "}
                              <span style={{ color: printer.status === "ready" ? "#16a34a" : "#dc2626", fontWeight: 700 }}>
                                {printer.status}
                              </span>
                              {printer.status === "offline" && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await fetch(`/api/shops/printers/${printer._id}/status`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        credentials: "same-origin",
                                        body: JSON.stringify({ status: "ready" }),
                                      });
                                      await loadData();
                                    } catch {}
                                  }}
                                  style={{
                                    border: "1px solid #bbf7d0",
                                    background: "#f0fdf4",
                                    color: "#16a34a",
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: "1px 6px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Set Ready
                                </button>
                              )}
                            </span>
                          </div>
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

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                        {printer.paperSizes.map((s) => (
                          <span key={s} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f1f5f9", color: "#475569" }}>
                            {s}
                          </span>
                        ))}
                        {printer.supportsColour && (
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f3e8ff", color: "#9333ea", fontWeight: 600 }}>
                            Colour
                          </span>
                        )}
                        {printer.supportsDuplex && (
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#e0f2fe", color: "#0284c7", fontWeight: 600 }}>
                            Duplex
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* How to Connect Printer Modal */}
        {howToModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.6)",
              display: "grid",
              placeItems: "center",
              padding: 20,
              zIndex: 100,
            }}
            onClick={() => setHowToModalOpen(false)}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: 16,
                padding: "24px 28px",
                maxWidth: 520,
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <b style={{ fontSize: 18, color: "#0f172a" }}>How to connect your printer</b>
                <button
                  type="button"
                  onClick={() => setHowToModalOpen(false)}
                  style={{ border: 0, background: "transparent", color: "#64748b", cursor: "pointer" }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#079c73", color: "#ffffff", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>
                    1
                  </span>
                  <div>
                    <b>Run the Printly Desktop Agent on your Windows PC</b>
                    <p style={{ margin: "2px 0 0", color: "#64748b" }}>
                      Run <code>npm run dev -w windows-agent</code> or launch the installed <code>PrintlyAgent.exe</code>.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#079c73", color: "#ffffff", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>
                    2
                  </span>
                  <div>
                    <b>Sign in to connect this computer</b>
                    <p style={{ margin: "2px 0 0", color: "#64748b" }}>
                      Open the desktop app and sign in with the same shop email and password. The app securely connects to this shop automatically.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#079c73", color: "#ffffff", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>
                    3
                  </span>
                  <div>
                    <b>Automatic Printer Discovery</b>
                    <p style={{ margin: "2px 0 0", color: "#64748b" }}>
                      Your local Windows printers (including <b>Microsoft Print to PDF</b>) will appear here instantly.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#079c73", color: "#ffffff", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>
                    4
                  </span>
                  <div>
                    <b>Assign Routing Rules</b>
                    <p style={{ margin: "2px 0 0", color: "#64748b" }}>
                      Map your paper sizes and B&W / Colour choices to your printer above. New customer orders will print automatically!
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 22, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setHowToModalOpen(false)}
                  style={{
                    padding: "9px 18px",
                    borderRadius: 8,
                    background: "#079c73",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Printer Modal */}
        {addModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.6)",
              display: "grid",
              placeItems: "center",
              padding: 20,
              zIndex: 100,
            }}
            onClick={() => setAddModalOpen(false)}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: 16,
                padding: "24px 28px",
                maxWidth: 480,
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <b style={{ fontSize: 18, color: "#0f172a" }}>Add Printer</b>
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  style={{ border: 0, background: "transparent", color: "#64748b", cursor: "pointer" }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddManualPrinter} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                    Printer Name
                  </label>
                  <input
                    type="text"
                    required
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                    Protocol
                  </label>
                  <select
                    value={manualProtocol}
                    onChange={(e) => setManualProtocol(e.target.value as "simulated" | "ipp")}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                      fontSize: 13,
                      background: "#ffffff",
                    }}
                  >
                    <option value="simulated">Simulated / Virtual Printer</option>
                    <option value="ipp">Network IPP Printer</option>
                  </select>
                </div>

                {manualProtocol === "ipp" && (
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                      IPP Address (e.g. ipp://192.168.1.100:631/ipp/print)
                    </label>
                    <input
                      type="text"
                      required
                      value={manualAddress}
                      onChange={(e) => setManualAddress(e.target.value)}
                      placeholder="ipp://192.168.1.100:631/ipp/print"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                        fontSize: 13,
                      }}
                    />
                  </div>
                )}

                <div style={{ display: "flex", gap: 16 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#334155", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={manualColour}
                      onChange={(e) => setManualColour(e.target.checked)}
                    />
                    Supports Colour
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#334155", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={manualDuplex}
                      onChange={(e) => setManualDuplex(e.target.checked)}
                    />
                    Supports Duplex (Double-sided)
                  </label>
                </div>

                <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      background: "#ffffff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingPrinter}
                    style={{
                      padding: "8px 18px",
                      borderRadius: 8,
                      background: "#079c73",
                      color: "#ffffff",
                      border: "none",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {addingPrinter ? "Adding..." : "Add Printer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
