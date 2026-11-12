import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileImage,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Lock,
  Minus,
  Plus,
  QrCode,
  ShieldCheck,
  Smartphone,
  Store,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type UploadItem = {
  id: string;
  name: string;
  kind: "document" | "photo";
  pageCount: number;
  sizeBytes: number;
  previewUrl?: string;
};

type Rate = {
  blackWhiteSimplexPaise: number;
  colourSimplexPaise: number;
  blackWhiteDuplexSheetPaise: number;
  colourDuplexSheetPaise: number;
};

type PublicShop = {
  slug: string;
  displayName: string;
  logoDataUrl?: string;
  address: string;
  collectCustomerName: boolean;
  collectCustomerMobile: boolean;
  fileRetentionHours: number;
  customerUploadVoice?: boolean;
  locationLockEnabled: boolean;
  locationRadiusMeters: number;
  upiId: string;
  cashEnabled: boolean;
  enabledPaperSizes: string[];
  colourEnabled: boolean;
  duplexEnabled: boolean;
  maxCopies: number;
  rates: Record<string, Rate>;
};

type PrintOptions = {
  paperSize: string;
  colour: boolean;
  duplex: boolean;
  copies: number;
  orientation: "portrait" | "landscape";
  pageRange: string;
  photoLayout?: string;
};

type Quote = {
  amountPaise: number;
  amount: string;
  billableUnits: number;
  unit: "pages" | "sheets";
  sourcePages: number;
  discountPaise?: number;
  discountPercent?: number;
};

type OrderConfirmation = {
  code: string;
  status: string;
  paymentMethod: "upi" | "cash";
  paymentStatus: string;
  amountPaise: number;
};

const layouts = [
  { value: "single", label: "1 photo per page", shortLabel: "1", capacity: 1, columns: 1 },
  { value: "two_stack", label: "2 photos, stacked", shortLabel: "2", capacity: 2, columns: 1 },
  { value: "two_side_by_side", label: "2 photos, side by side", shortLabel: "2", capacity: 2, columns: 2 },
  { value: "four", label: "4 photos per page", shortLabel: "4", capacity: 4, columns: 2 },
  { value: "six", label: "6 photos per page", shortLabel: "6", capacity: 6, columns: 2 },
  { value: "nine", label: "9 photos per page", shortLabel: "9", capacity: 9, columns: 3 },
];

const money = (paise: number) => `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function getApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

export function CustomerOrderPage({ slug }: { slug: string }) {
  const [shop, setShop] = useState<PublicShop | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [mode, setMode] = useState<"document" | "photo">("document");
  const [options, setOptions] = useState<PrintOptions>({
    paperSize: "A4",
    colour: false,
    duplex: false,
    copies: 1,
    orientation: "portrait",
    pageRange: "",
  });
  const [selectedPayment, setSelectedPayment] = useState<"upi" | "cash">("upi");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<OrderConfirmation | null>(null);
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [claimReference, setClaimReference] = useState("");
  const [claimMessage, setClaimMessage] = useState("");
  const [claimError, setClaimError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [copiedUpi, setCopiedUpi] = useState(false);

  // UPI payment prompt modal state
  const [upiModalOpen, setUpiModalOpen] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const idempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const previewUrlsRef = useRef<string[]>([]);

  useEffect(() => () => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current = [];
  }, []);

  useEffect(() => {
    if (!order) return;
    let active = true;
    const refreshStatus = async () => {
      try {
        const response = await fetch(
          `/api/public/shops/${encodeURIComponent(slug)}/orders/${encodeURIComponent(order.code)}`,
          { credentials: "same-origin" },
        );
        if (!response.ok) throw new Error(await getApiError(response));
        const result = (await response.json()) as { order: OrderConfirmation };
        if (active) {
          setOrder(result.order);
          setStatusError("");
        }
      } catch (reason) {
        if (active) setStatusError(reason instanceof Error ? reason.message : "Could not refresh order status.");
      }
    };
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 12_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [order?.code, slug]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadShop() {
      try {
        const response = await fetch(`/api/public/shops/${encodeURIComponent(slug)}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await getApiError(response));
        const body = (await response.json()) as { shop: PublicShop };
        setShop(body.shop);
        setSelectedPayment(body.shop.upiId ? "upi" : "cash");
        const firstSize = body.shop.enabledPaperSizes[0] ?? "A4";
        setOptions((current) => ({ ...current, paperSize: firstSize }));
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") {
          setError(reason.message || "This shop is unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadShop();
    return () => controller.abort();
  }, [slug]);

  const isPhotoOrder = uploads.length > 0 && uploads.every((item) => item.kind === "photo");
  const totalSourcePages = useMemo(
    () => uploads.reduce((sum, item) => sum + item.pageCount, 0),
    [uploads],
  );
  const uploadIds = useMemo(() => uploads.map((item) => item.id), [uploads]);

  useEffect(() => {
    if (!shop || !uploads.length || order) {
      setQuote(null);
      setQuoteError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/public/shops/${encodeURIComponent(slug)}/quote`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadIds, options }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(await getApiError(response));
          const body = (await response.json()) as { quote: Quote };
          setQuote(body.quote);
          setQuoteError("");
        } catch (reason) {
          if (reason instanceof Error && reason.name !== "AbortError") {
            setQuote(null);
            setQuoteError(reason.message);
          }
        }
      })();
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [options, order, shop, slug, uploadIds]);

  async function uploadFiles(selected: File[]) {
    if (!selected.length) return;
    if (uploads.length + selected.length > 10) {
      setError("An order can contain up to 10 files.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("mode", mode);
      for (const file of selected) body.append("files", file);
      const response = await fetch(`/api/public/shops/${encodeURIComponent(slug)}/uploads`, {
        method: "POST",
        credentials: "same-origin",
        body,
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const result = (await response.json()) as { uploads: UploadItem[] };
      const uploadedItems = result.uploads.map((item, index) => {
        const file = selected[index];
        const previewUrl = file ? URL.createObjectURL(file) : undefined;
        if (previewUrl) previewUrlsRef.current.push(previewUrl);
        return { ...item, previewUrl };
      });
      setUploads((current) => [...current, ...uploadedItems]);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The files could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function removeUpload(uploadId: string) {
    setRemovingId(uploadId);
    setError("");
    try {
      const response = await fetch(
        `/api/public/shops/${encodeURIComponent(slug)}/uploads/${encodeURIComponent(uploadId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      if (!response.ok) throw new Error(await getApiError(response));
      const removedUpload = uploads.find((item) => item.id === uploadId);
      if (removedUpload?.previewUrl) {
        URL.revokeObjectURL(removedUpload.previewUrl);
        previewUrlsRef.current = previewUrlsRef.current.filter((url) => url !== removedUpload.previewUrl);
      }
      setUploads((current) => current.filter((item) => item.id !== uploadId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The upload could not be removed.");
    } finally {
      setRemovingId("");
    }
  }

  async function placeOrder(paymentMethod: "upi" | "cash") {
    if (!shop || !quote) return;
    setError("");
    setSubmitting(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      let location: { customerLatitude: number; customerLongitude: number } | Record<string, never> = {};
      if (shop.locationLockEnabled) {
        if (!navigator.geolocation) throw new Error("Location access is required to place an order at this shop.");
        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(
            resolve,
            () => reject(new Error("Allow location access and try placing your order again at the shop.")),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
          ),
        );
        location = { customerLatitude: position.coords.latitude, customerLongitude: position.coords.longitude };
      }
      const payload = {
        uploadIds,
        options,
        paymentMethod,
        ...location,
        ...(shop.collectCustomerName ? { customerName } : {}),
        ...(shop.collectCustomerMobile ? { customerMobile } : {}),
      };
      const logicalOrder = {
        uploadIds,
        options,
        paymentMethod,
        ...(shop.collectCustomerName ? { customerName } : {}),
        ...(shop.collectCustomerMobile ? { customerMobile } : {}),
      };
      const fingerprint = JSON.stringify(logicalOrder);
      let idempotency = idempotencyRef.current;
      if (idempotency?.fingerprint !== fingerprint) {
        idempotency = { fingerprint, key: createIdempotencyKey() };
        idempotencyRef.current = idempotency;
      }
      const response = await fetch(`/api/public/shops/${encodeURIComponent(slug)}/orders`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotency.key,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const body = (await response.json()) as { order: OrderConfirmation };
      setOrder(body.order);

      // If UPI was chosen, open the personal UPI prompt modal!
      if (paymentMethod === "upi") {
        setUpiModalOpen(true);
      }

      if (shop.customerUploadVoice && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const announcement = new SpeechSynthesisUtterance("Your order has been placed successfully.");
        announcement.lang = "en-IN";
        window.speechSynthesis.speak(announcement);
      }
      setQuote(null);
    } catch (reason) {
      setError(
        reason instanceof Error && reason.name === "AbortError"
          ? "The order request timed out. Please retry; we’ll safely check whether it was already received."
          : reason instanceof Error
            ? reason.message
            : "Your order could not be placed. Please retry.",
      );
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  }

  async function reportPayment() {
    if (!order) return;
    setClaiming(true);
    setClaimError("");
    setClaimMessage("");
    try {
      const response = await fetch(
        `/api/public/shops/${encodeURIComponent(slug)}/orders/${encodeURIComponent(order.code)}/payment-claim`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: claimReference }),
        },
      );
      if (!response.ok) throw new Error(await getApiError(response));
      const result = (await response.json()) as { message: string };
      setClaimMessage(result.message);
      setUpiModalOpen(false);
    } catch (reason) {
      setClaimError(reason instanceof Error ? reason.message : "Could not report payment.");
    } finally {
      setClaiming(false);
    }
  }

  function changeMode(nextMode: "document" | "photo") {
    if (nextMode === mode) return;
    if (uploads.length) {
      setError("Remove the current files before switching between documents and photos.");
      return;
    }
    setMode(nextMode);
    setOptions((current) => ({
      ...current,
      duplex: false,
      photoLayout: nextMode === "photo" ? "single" : undefined,
    }));
    setError("");
  }

  function updateOptions(update: Partial<PrintOptions>) {
    setOptions((current) => ({ ...current, ...update }));
    setQuote(null);
  }

  function copyUpiId() {
    if (!shop?.upiId) return;
    navigator.clipboard.writeText(shop.upiId).then(() => {
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }).catch(() => {});
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", color: "#64748b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600 }}>
          <LoaderCircle className="spin" size={24} color="#079c73" />
          <span>Opening {slug}…</span>
        </div>
      </div>
    );
  }

  if (error && !shop) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", padding: 20 }}>
        <div style={{ maxWidth: 400, textAlign: "center", background: "#fff", padding: 32, borderRadius: 16, border: "1px solid #e2e8f0" }}>
          <Store size={36} color="#dc2626" style={{ margin: "0 auto 12px" }} />
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "0 0 8px" }}>Shop Unavailable</h1>
          <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5, margin: "0 0 20px" }}>{error}</p>
          <a href="/" style={{ display: "inline-block", padding: "8px 18px", borderRadius: 8, background: "#079c73", color: "#fff", fontSize: 13, fontWeight: 700 }}>
            Go to Printly
          </a>
        </div>
      </div>
    );
  }

  if (!shop) return null;

  const photoLayout = layouts.find((layout) => layout.value === options.photoLayout) ?? layouts[0];
  const photos = uploads.filter((item) => item.kind === "photo");
  const photoPages = Array.from({ length: Math.ceil(photos.length / photoLayout.capacity) }, (_, index) =>
    photos.slice(index * photoLayout.capacity, (index + 1) * photoLayout.capacity),
  );

  const effectivePayment = shop.upiId && selectedPayment === "upi" ? "upi" : shop.cashEnabled ? "cash" : "upi";

  // Standard NPCI Personal UPI Payment URI
  const currentAmount = order ? order.amountPaise / 100 : quote ? quote.amountPaise / 100 : 0;
  const upiLink = shop.upiId
    ? `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(shop.displayName)}${currentAmount > 0 ? `&am=${currentAmount.toFixed(2)}` : ""}&cu=INR&tn=${encodeURIComponent(order ? `Printly Order ${order.code}` : `Print at ${shop.displayName}`)}`
    : "";

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", paddingBottom: 110, fontFamily: "DM Sans, sans-serif" }}>
      {/* Top Navbar */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          height: 64,
          display: "flex",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            margin: "0 auto",
            padding: "0 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#079c73",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
              }}
            >
              <QrCode size={18} />
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.4px" }}>
              QrToPrint
            </span>
          </div>

          {/* Secure pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: "#079c73",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <ShieldCheck size={16} />
            <span>Secure</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 520, margin: "0 auto", padding: "18px 16px 20px" }}>
        {/* Dark Shop Name Banner */}
        <div
          style={{
            background: "#0f172a",
            borderRadius: 14,
            padding: "16px 18px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 16,
            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#1e293b",
              color: "#10b981",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Store size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <b style={{ color: "#ffffff", fontSize: 16, fontWeight: 800, display: "block", letterSpacing: "-0.2px" }}>
              {shop.displayName}
            </b>
            {shop.address && (
              <span style={{ color: "#94a3b8", fontSize: 11, display: "block", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {shop.address}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: 10, padding: "10px 14px", color: "#dc2626", fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span>{error}</span>
          </div>
        )}

        {/* ORDER SUCCESS VIEW */}
        {order ? (
          <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "28px 22px", textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#ecfdf5", color: "#10b981", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
              <Check size={28} strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#079c73", letterSpacing: "1px", textTransform: "uppercase" }}>ORDER RECEIVED</span>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "6px 0 10px" }}>Your print order is in!</h1>
            <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5, margin: "0 0 20px" }}>
              Show this pickup code at the counter. The shopkeeper will verify and print your order.
            </p>

            <div style={{ background: "#f8fafc", border: "1.5px dashed #cbd5e1", borderRadius: 14, padding: "16px", marginBottom: 20 }}>
              <small style={{ color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: "0.5px" }}>PICKUP CODE</small>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#0f172a", letterSpacing: "3px", margin: "4px 0" }}>
                #{order.code}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: order.paymentStatus === "paid" ? "#16a34a" : "#ea580c" }}>
                {order.paymentStatus === "paid" ? "✓ Payment Confirmed" : order.paymentMethod === "upi" ? "Waiting for UPI Verification" : "Cash Due at Counter"}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f1f5f9", borderRadius: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Order Total</span>
              <b style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{money(order.amountPaise)}</b>
            </div>

            {order.paymentMethod === "upi" && order.paymentStatus !== "paid" && (
              <div style={{ textAlign: "left", borderTop: "1px solid #f1f5f9", paddingTop: 18 }}>
                <b style={{ fontSize: 14, color: "#0f172a", display: "block", marginBottom: 4 }}>Pay via Shop UPI</b>
                <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 14px", lineHeight: 1.5 }}>
                  Scan the shopkeeper's personal UPI QR code or open your payment app:
                </p>

                {/* Personal UPI QR Box */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18, textAlign: "center", marginBottom: 14 }}>
                  <div style={{ display: "inline-block", background: "#ffffff", padding: 12, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                    <QRCodeSVG value={upiLink} size={180} level="M" />
                  </div>
                  <div style={{ marginTop: 10, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                    Scan with GPay, PhonePe, Paytm, or BHIM
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f1f5f9", padding: "10px 14px", borderRadius: 8, marginBottom: 14 }}>
                  <div>
                    <small style={{ display: "block", fontSize: 10, color: "#64748b", fontWeight: 700 }}>SHOP UPI ID</small>
                    <b style={{ fontSize: 13, color: "#0f172a" }}>{shop.upiId}</b>
                  </div>
                  <button
                    type="button"
                    onClick={copyUpiId}
                    style={{ border: "1px solid #cbd5e1", background: "#fff", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    <Copy size={12} /> {copiedUpi ? "Copied" : "Copy"}
                  </button>
                </div>

                {upiLink && (
                  <a
                    href={upiLink}
                    style={{ display: "block", textAlign: "center", background: "#079c73", color: "#fff", padding: "12px", borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: "none", marginBottom: 14 }}
                  >
                    Open UPI App ({money(order.amountPaise)})
                  </a>
                )}

                {/* Report payment ref */}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input
                    type="text"
                    value={claimReference}
                    onChange={(e) => setClaimReference(e.target.value)}
                    placeholder="Enter UPI Reference / UTR (Optional)"
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, outline: "none" }}
                  />
                  <button
                    type="button"
                    disabled={claiming}
                    onClick={reportPayment}
                    style={{ background: "#0f172a", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}
                  >
                    {claiming ? "Sending..." : "I have paid"}
                  </button>
                </div>
                {claimMessage && <div style={{ color: "#16a34a", fontSize: 12, marginTop: 8, fontWeight: 600 }}>{claimMessage}</div>}
              </div>
            )}

            <button
              type="button"
              onClick={() => { setOrder(null); setUploads([]); setQuote(null); }}
              style={{ marginTop: 22, background: "transparent", border: "none", color: "#079c73", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              ← Place another print order
            </button>
          </div>
        ) : (
          <>
            {/* STEP 1: UPLOAD FILES */}
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: "20px 22px",
                marginBottom: 16,
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "#079c73",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  1
                </span>
                <b style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Upload files</b>
                <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500, marginLeft: 2 }}>max 10</span>
              </div>

              {/* Document vs Photo Tab Switcher */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                {/* Tab 1: Document */}
                <button
                  type="button"
                  onClick={() => changeMode("document")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: mode === "document" ? "1.5px solid #079c73" : "1px solid #e2e8f0",
                    background: mode === "document" ? "#f0fdf4" : "#ffffff",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: mode === "document" ? "#dcfce7" : "#f1f5f9",
                      color: mode === "document" ? "#079c73" : "#64748b",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FileText size={18} />
                  </div>
                  <div>
                    <b style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Document</b>
                    <small style={{ color: "#64748b", fontSize: 11 }}>PDF</small>
                  </div>
                </button>

                {/* Tab 2: Photo / Image */}
                <button
                  type="button"
                  onClick={() => changeMode("photo")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: mode === "photo" ? "1.5px solid #079c73" : "1px solid #e2e8f0",
                    background: mode === "photo" ? "#f0fdf4" : "#ffffff",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: mode === "photo" ? "#dcfce7" : "#f1f5f9",
                      color: mode === "photo" ? "#079c73" : "#64748b",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FileImage size={18} />
                  </div>
                  <div>
                    <b style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Photo / Image</b>
                    <small style={{ color: "#64748b", fontSize: 11 }}>JPG, PNG, WEBP</small>
                  </div>
                </button>
              </div>

              {/* Upload Dropzone */}
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={mode === "document" ? "application/pdf,.pdf" : "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"}
                style={{ display: "none" }}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const selected = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void uploadFiles(selected);
                }}
              />
              <div
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void uploadFiles(Array.from(e.dataTransfer.files));
                }}
                style={{
                  border: "1.5px dashed #94a3b8",
                  borderRadius: 14,
                  padding: "36px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: "#f8fafc",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "#dcfce7",
                    color: "#079c73",
                    display: "grid",
                    placeItems: "center",
                    margin: "0 auto 10px",
                  }}
                >
                  {uploading ? <LoaderCircle className="spin" size={22} /> : <Upload size={20} />}
                </div>
                <b style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", display: "block" }}>
                  {uploading ? "Uploading files..." : "Choose files"}
                </b>
                <small style={{ color: "#64748b", fontSize: 12, marginTop: 4, display: "block" }}>
                  {mode === "document" ? "PDF · up to 25.0 MB · or drag them here" : "JPG, PNG, WEBP · up to 25.0 MB · or drag them here"}
                </small>
              </div>

              {/* File List */}
              {uploads.length > 0 && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {uploads.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #e2e8f0",
                        background: "#ffffff",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        {file.kind === "photo" && file.previewUrl ? (
                          <img src={file.previewUrl} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: 34, height: 34, borderRadius: 6, background: "#ecfdf5", color: "#079c73", display: "grid", placeItems: "center" }}>
                            <FileText size={16} />
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: "block", fontSize: 12, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>
                            {file.name}
                          </b>
                          <small style={{ color: "#64748b", fontSize: 11 }}>
                            {file.kind === "photo" ? "Photo" : `${file.pageCount} page${file.pageCount === 1 ? "" : "s"}`} · {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                          </small>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeUpload(file.id)}
                        disabled={Boolean(removingId)}
                        style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", padding: 4 }}
                      >
                        {removingId === file.id ? <LoaderCircle className="spin" size={14} /> : <X size={16} />}
                      </button>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#079c73", marginTop: 4 }}>
                    Total: {totalSourcePages} page{totalSourcePages === 1 ? "" : "s"} across {uploads.length} file{uploads.length === 1 ? "" : "s"}
                  </div>
                </div>
              )}
            </section>

            {/* PHOTO LAYOUT SECTION (If in photo mode) */}
            {mode === "photo" && (
              <section
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: "20px 22px",
                  marginBottom: 16,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <b style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Photos per page</b>
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>Fewer pages, lower cost</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {layouts.map((l) => {
                    const isSelected = options.photoLayout === l.value;
                    return (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => updateOptions({ photoLayout: l.value })}
                        style={{
                          padding: "10px 8px",
                          borderRadius: 10,
                          border: isSelected ? "1.5px solid #079c73" : "1px solid #e2e8f0",
                          background: isSelected ? "#f0fdf4" : "#ffffff",
                          cursor: "pointer",
                          textAlign: "center",
                        }}
                      >
                        <b style={{ fontSize: 13, display: "block", color: isSelected ? "#079c73" : "#0f172a" }}>{l.shortLabel}</b>
                        <small style={{ fontSize: 10, color: "#64748b" }}>{l.label.split(" ")[0]} photo</small>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* STEP 2: PRINT OPTIONS */}
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: "20px 22px",
                marginBottom: 16,
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "#079c73",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  2
                </span>
                <b style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Print options</b>
              </div>

              {/* Paper size */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
                  Paper size
                </label>
                {shop.enabledPaperSizes.length > 1 ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    {shop.enabledPaperSizes.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => updateOptions({ paperSize: size })}
                        style={{
                          flex: 1,
                          padding: "10px",
                          borderRadius: 10,
                          border: options.paperSize === size ? "1.5px solid #079c73" : "1px solid #e2e8f0",
                          background: options.paperSize === size ? "#f0fdf4" : "#ffffff",
                          color: options.paperSize === size ? "#079c73" : "#0f172a",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      padding: "10px",
                      textAlign: "center",
                      fontWeight: 700,
                      color: "#079c73",
                      fontSize: 13,
                      background: "#ffffff",
                    }}
                  >
                    {options.paperSize || "A4"}
                  </div>
                )}
              </div>

              {/* Colour */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
                  Colour
                </label>
                <div
                  style={{
                    background: "#f1f5f9",
                    padding: 4,
                    borderRadius: 10,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 4,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => updateOptions({ colour: false })}
                    style={{
                      border: !options.colour ? "1px solid #e2e8f0" : "none",
                      background: !options.colour ? "#ffffff" : "transparent",
                      color: !options.colour ? "#079c73" : "#64748b",
                      borderRadius: 8,
                      padding: "9px",
                      fontWeight: !options.colour ? 700 : 600,
                      fontSize: 13,
                      cursor: "pointer",
                      boxShadow: !options.colour ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                    }}
                  >
                    B&W
                  </button>
                  <button
                    type="button"
                    disabled={!shop.colourEnabled}
                    onClick={() => updateOptions({ colour: true })}
                    style={{
                      border: options.colour ? "1px solid #e2e8f0" : "none",
                      background: options.colour ? "#ffffff" : "transparent",
                      color: options.colour ? "#079c73" : shop.colourEnabled ? "#64748b" : "#94a3b8",
                      borderRadius: 8,
                      padding: "9px",
                      fontWeight: options.colour ? 700 : 600,
                      fontSize: 13,
                      cursor: shop.colourEnabled ? "pointer" : "not-allowed",
                      boxShadow: options.colour ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                    }}
                  >
                    Colour
                  </button>
                </div>
              </div>

              {/* Sides (Single vs Both) */}
              {!isPhotoOrder && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
                    Sides
                  </label>
                  <div
                    style={{
                      background: "#f1f5f9",
                      padding: 4,
                      borderRadius: 10,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 4,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => updateOptions({ duplex: false })}
                      style={{
                        border: !options.duplex ? "1px solid #e2e8f0" : "none",
                        background: !options.duplex ? "#ffffff" : "transparent",
                        color: !options.duplex ? "#079c73" : "#64748b",
                        borderRadius: 8,
                        padding: "9px",
                        fontWeight: !options.duplex ? 700 : 600,
                        fontSize: 13,
                        cursor: "pointer",
                        boxShadow: !options.duplex ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                      }}
                    >
                      Single side
                    </button>
                    <button
                      type="button"
                      disabled={!shop.duplexEnabled}
                      onClick={() => updateOptions({ duplex: true })}
                      style={{
                        border: options.duplex ? "1px solid #e2e8f0" : "none",
                        background: options.duplex ? "#ffffff" : "transparent",
                        color: options.duplex ? "#079c73" : shop.duplexEnabled ? "#64748b" : "#94a3b8",
                        borderRadius: 8,
                        padding: "9px",
                        fontWeight: options.duplex ? 700 : 600,
                        fontSize: 13,
                        cursor: shop.duplexEnabled ? "pointer" : "not-allowed",
                        boxShadow: options.duplex ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                      }}
                    >
                      Both sides
                    </button>
                  </div>
                </div>
              )}

              {/* Copies Stepper */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
                  Copies
                </label>
                <div
                  style={{
                    background: "#f1f5f9",
                    borderRadius: 10,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: 3,
                  }}
                >
                  <button
                    type="button"
                    disabled={options.copies <= 1}
                    onClick={() => updateOptions({ copies: Math.max(1, options.copies - 1) })}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      border: "none",
                      background: "transparent",
                      color: options.copies <= 1 ? "#94a3b8" : "#0f172a",
                      fontSize: 18,
                      fontWeight: 700,
                      cursor: options.copies <= 1 ? "default" : "pointer",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Minus size={14} />
                  </button>
                  <span style={{ padding: "0 20px", fontWeight: 800, fontSize: 14, color: "#0f172a" }}>
                    {options.copies}
                  </span>
                  <button
                    type="button"
                    disabled={options.copies >= shop.maxCopies}
                    onClick={() => updateOptions({ copies: Math.min(shop.maxCopies, options.copies + 1) })}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      border: "none",
                      background: "transparent",
                      color: "#0f172a",
                      fontSize: 18,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </section>

            {/* STEP 3: PAYMENT */}
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: "20px 22px",
                marginBottom: 20,
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "#079c73",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  3
                </span>
                <b style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Payment</b>
              </div>

              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>
                Payment method
              </label>

              {/* Option 1: UPI */}
              {shop.upiId && (
                <div
                  onClick={() => {
                    setSelectedPayment("upi");
                    setUpiModalOpen(true);
                  }}
                  style={{
                    border: selectedPayment === "upi" ? "1.5px solid #079c73" : "1px solid #e2e8f0",
                    background: selectedPayment === "upi" ? "#ffffff" : "#ffffff",
                    borderRadius: 12,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                    cursor: "pointer",
                    boxShadow: selectedPayment === "upi" ? "0 2px 6px rgba(7, 156, 115, 0.08)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: "#079c73",
                        color: "#ffffff",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Smartphone size={20} />
                    </div>
                    <div>
                      <b style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                        UPI
                      </b>
                      <small style={{ color: "#64748b", fontSize: 11 }}>
                        Google Pay · PhonePe · Paytm · BHIM
                      </small>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPayment("upi");
                        setUpiModalOpen(true);
                      }}
                      style={{
                        border: "1px solid #cbd5e1",
                        background: "#f8fafc",
                        color: "#0f172a",
                        padding: "4px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        cursor: "pointer",
                      }}
                    >
                      <QrCode size={12} /> QR
                    </button>

                    {selectedPayment === "upi" ? (
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "#079c73",
                          color: "#ffffff",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Check size={13} strokeWidth={3} />
                      </div>
                    ) : (
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid #cbd5e1" }} />
                    )}
                  </div>
                </div>
              )}

              {/* Option 2: Cash at counter */}
              {shop.cashEnabled && (
                <div
                  onClick={() => setSelectedPayment("cash")}
                  style={{
                    border: selectedPayment === "cash" ? "1.5px solid #079c73" : "1px solid #e2e8f0",
                    background: selectedPayment === "cash" ? "#ffffff" : "#ffffff",
                    borderRadius: 12,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    boxShadow: selectedPayment === "cash" ? "0 2px 6px rgba(7, 156, 115, 0.08)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: "#fef3c7",
                        color: "#d97706",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Store size={20} />
                    </div>
                    <div>
                      <b style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                        Cash at counter
                      </b>
                      <span
                        style={{
                          background: "#f1f5f9",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#64748b",
                        }}
                      >
                        Pay at pickup
                      </span>
                    </div>
                  </div>

                  {selectedPayment === "cash" ? (
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "#079c73",
                        color: "#ffffff",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Check size={13} strokeWidth={3} />
                    </div>
                  ) : (
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid #cbd5e1" }} />
                  )}
                </div>
              )}

              {/* Secure guarantee text */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#079c73",
                  fontSize: 12,
                  fontWeight: 600,
                  marginTop: 14,
                }}
              >
                <ShieldCheck size={14} />
                <span>100% safe & secure payment</span>
              </div>
            </section>

            {/* Privacy footer */}
            <div style={{ textAlign: "center", color: "#64748b", fontSize: 11, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <Lock size={12} />
              <span>Files are used only for printing — auto-deleted afterwards</span>
            </div>
            <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 40 }}>
              V1.0.2
            </div>
          </>
        )}
      </main>

      {/* FIXED BOTTOM ACTION BAR */}
      {!order && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#ffffff",
            borderTop: "1px solid #e2e8f0",
            padding: "12px 18px",
            zIndex: 40,
            boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              maxWidth: 520,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* Price / Quote Info */}
            <div>
              {uploads.length === 0 ? (
                <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                  Upload a file first
                </span>
              ) : quote ? (
                <div>
                  <b style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", display: "block", lineHeight: 1 }}>
                    {money(quote.amountPaise)}
                  </b>
                  <small style={{ color: "#64748b", fontSize: 11, marginTop: 3, display: "block" }}>
                    {quote.billableUnits} {quote.unit === "pages" ? "page" : "sheet"}{quote.billableUnits === 1 ? "" : "s"} × {options.copies} {options.copies === 1 ? "copy" : "copies"}
                  </small>
                </div>
              ) : (
                <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                  {quoteError || "Calculating price..."}
                </span>
              )}
            </div>

            {/* Pay Now Button */}
            <button
              type="button"
              disabled={!quote || submitting || uploading}
              onClick={() => void placeOrder(effectivePayment)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "12px 24px",
                borderRadius: 999,
                background: !quote || submitting || uploading ? "#94a3b8" : "#079c73",
                color: "#ffffff",
                border: "none",
                fontSize: 14,
                fontWeight: 700,
                cursor: !quote || submitting || uploading ? "not-allowed" : "pointer",
                boxShadow: quote && !submitting ? "0 4px 12px rgba(7, 156, 115, 0.3)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <span>{submitting ? "Processing..." : effectivePayment === "upi" ? "Pay now" : "Place order"}</span>
              <span style={{ fontSize: 16 }}>→</span>
            </button>
          </div>
        </div>
      )}

      {/* SHOPKEEPER PERSONAL UPI PAYMENT MODAL */}
      {upiModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.7)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setUpiModalOpen(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: "24px 22px",
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ textAlign: "left" }}>
                <b style={{ fontSize: 16, color: "#0f172a", display: "block" }}>Pay via Shop UPI</b>
                <span style={{ fontSize: 11, color: "#64748b" }}>Direct payment to {shop.displayName}</span>
              </div>
              <button
                type="button"
                onClick={() => setUpiModalOpen(false)}
                style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer", padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Amount Banner */}
            <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px", border: "1px solid #e2e8f0", marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
                {order ? "Amount Due" : quote ? "Order Total" : "Shop Payment QR"}
              </span>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#079c73", margin: "2px 0" }}>
                {order ? money(order.amountPaise) : quote ? money(quote.amountPaise) : "Scan to Pay"}
              </div>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {order ? `Order #${order.code}` : quote ? `${quote.billableUnits} ${quote.unit} · ${options.copies} copy` : "Personal Shopkeeper UPI QR"}
              </span>
            </div>

            {/* Shopkeeper Personal UPI QR Code */}
            <div style={{ display: "inline-block", background: "#ffffff", padding: 12, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", marginBottom: 12 }}>
              <QRCodeSVG value={upiLink} size={180} level="M" />
            </div>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 14 }}>
              Scan with GPay, PhonePe, Paytm, or BHIM
            </div>

            {/* Shopkeeper UPI ID */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f1f5f9", padding: "10px 14px", borderRadius: 10, marginBottom: 14, textAlign: "left" }}>
              <div>
                <small style={{ display: "block", fontSize: 10, color: "#64748b", fontWeight: 700 }}>SHOPKEEPER UPI ID</small>
                <b style={{ fontSize: 13, color: "#0f172a" }}>{shop.upiId}</b>
              </div>
              <button
                type="button"
                onClick={copyUpiId}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Copy size={12} /> {copiedUpi ? "Copied" : "Copy"}
              </button>
            </div>

            {/* Direct App Launch Button */}
            {upiLink && (
              <a
                href={upiLink}
                style={{
                  display: "block",
                  background: "#079c73",
                  color: "#ffffff",
                  padding: "11px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  textDecoration: "none",
                  marginBottom: 12,
                }}
              >
                Open UPI App {currentAmount > 0 ? `(${money(currentAmount * 100)})` : ""}
              </a>
            )}

            {/* Action Row */}
            {order ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={claimReference}
                  onChange={(e) => setClaimReference(e.target.value)}
                  placeholder="UTR / Ref Number (Optional)"
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  disabled={claiming}
                  onClick={reportPayment}
                  style={{
                    background: "#0f172a",
                    color: "#ffffff",
                    padding: "9px 16px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {claiming ? "Saving..." : "I Have Paid"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!quote || submitting || uploading}
                onClick={() => void placeOrder("upi")}
                style={{
                  width: "100%",
                  background: !quote || submitting ? "#94a3b8" : "#079c73",
                  color: "#ffffff",
                  padding: "11px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  border: "none",
                  cursor: !quote || submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Processing..." : quote ? `Pay ${money(quote.amountPaise)} & Place Order` : "Upload files first to place order"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
