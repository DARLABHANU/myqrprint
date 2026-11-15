import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  FileImage,
  FileText,
  LoaderCircle,
  Lock,
  Minus,
  Plus,
  Printer,
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
  razorpayEnabled?: boolean;
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
  paymentMethod: "upi" | "cash" | "pay_here" | "razorpay";
  paymentStatus: string;
  amountPaise: number;
};

type RazorpayCheckout = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
};

type RazorpayCheckoutResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutInstance = {
  open(): void;
  on(event: "payment.failed", callback: (event: { error?: { description?: string } }) => void): void;
};

type RazorpayCheckoutConstructor = new (options: Record<string, unknown>) => RazorpayCheckoutInstance;

async function loadRazorpayCheckout(): Promise<RazorpayCheckoutConstructor> {
  const razorpayWindow = window as Window & { Razorpay?: RazorpayCheckoutConstructor };
  if (razorpayWindow.Razorpay) return razorpayWindow.Razorpay;
  await new Promise<void>((resolve, reject) => {
    const current = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    if (current) {
      current.addEventListener("load", () => resolve(), { once: true });
      current.addEventListener("error", () => reject(new Error("Razorpay checkout could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay checkout could not load."));
    document.head.appendChild(script);
  });
  if (!razorpayWindow.Razorpay) throw new Error("Razorpay checkout is not available in this browser.");
  return razorpayWindow.Razorpay;
}

const layouts = [
  { value: "single", label: "1 photo per page", shortLabel: "1", capacity: 1, columns: 1 },
  { value: "two_stack", label: "2 photos, stacked", shortLabel: "2", capacity: 2, columns: 1 },
  { value: "two_side_by_side", label: "2 photos, side by side", shortLabel: "2", capacity: 2, columns: 2 },
  { value: "four", label: "4 photos per page", shortLabel: "4", capacity: 4, columns: 2 },
  { value: "six", label: "6 photos per page", shortLabel: "6", capacity: 6, columns: 2 },
  { value: "nine", label: "9 photos per page", shortLabel: "9", capacity: 9, columns: 3 },
];

const money = (paise: number) => `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;
const localTestPaymentsEnabled = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

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
  const [selectedPayment, setSelectedPayment] = useState<"upi" | "cash" | "pay_here" | "razorpay">("cash");
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
  const [razorpayCheckout, setRazorpayCheckout] = useState<RazorpayCheckout | null>(null);

  // UPI payment prompt modal state
  const [upiModalOpen, setUpiModalOpen] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // PDF Preview state
  // Map from uploadId -> array of data-URLs (one per page)
  const [pdfPages, setPdfPages] = useState<Record<string, string[]>>({});
  const [pdfRendering, setPdfRendering] = useState<Record<string, boolean>>({});
  // Lightbox for zooming a PDF page
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Store original File objects for PDF rendering (uploadId -> File)
  const fileMapRef = useRef<Map<string, File>>(new Map());

  const fileInput = useRef<HTMLInputElement>(null);
  const idempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const previewUrlsRef = useRef<string[]>([]);

  // Load PDF.js from CDN once (UMD build sets window.pdfjsLib)
  const pdfJsReady = useRef(false);
  useEffect(() => {
    if (pdfJsReady.current) return;
    // Check if already loaded
    if ((window as unknown as Record<string, unknown>)["pdfjsLib"]) {
      pdfJsReady.current = true;
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
    script.onload = () => { pdfJsReady.current = true; };
    document.head.appendChild(script);
  }, []);

  // Render a single PDF file to canvas page data-URLs
  const renderPdfFile = useCallback(async (uploadId: string, file: File) => {
    setPdfRendering((prev) => ({ ...prev, [uploadId]: true }));
    try {
      // Wait for PDF.js to load (up to 5s)
      let attempts = 0;
      while (!(window as unknown as Record<string, unknown>)["pdfjsLib"] && attempts < 50) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfjsLib = (window as unknown as Record<string, any>)["pdfjsLib"];
      if (!pdfjsLib) throw new Error("PDF.js not loaded");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const pageDataUrls: string[] = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        pageDataUrls.push(canvas.toDataURL("image/jpeg", 0.85));
      }
      setPdfPages((prev) => ({ ...prev, [uploadId]: pageDataUrls }));
    } catch (err) {
      console.error("PDF render error:", err);
    } finally {
      setPdfRendering((prev) => ({ ...prev, [uploadId]: false }));
    }
  }, []);

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
          if (result.order.paymentStatus === "paid") setRazorpayCheckout(null);
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
    let firstRequest = true;
    let requestInFlight = false;
    async function loadShop() {
      if (requestInFlight || controller.signal.aborted) return;
      requestInFlight = true;
      try {
        const response = await fetch(`/api/public/shops/${encodeURIComponent(slug)}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await getApiError(response));
        const body = (await response.json()) as { shop: PublicShop };
        setShop(body.shop);
        setError("");
        if (firstRequest) {
          setSelectedPayment(body.shop.razorpayEnabled ? "razorpay" : body.shop.upiId ? "upi" : "cash");
          const firstSize = body.shop.enabledPaperSizes[0] ?? "A4";
          setOptions((current) => ({ ...current, paperSize: firstSize }));
        }
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") {
          // Fail closed when the agent disconnects or the shop is switched offline.
          // This also removes the checkout UI from pages that were already open.
          setShop(null);
          setQuote(null);
          setError(reason.message || "This shop is unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          firstRequest = false;
        }
        requestInFlight = false;
      }
    }
    void loadShop();
    const timer = window.setInterval(() => void loadShop(), 5_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
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
        const previewUrl = item.previewUrl || (file ? URL.createObjectURL(file) : undefined);
        if (previewUrl && !previewUrl.startsWith("http")) previewUrlsRef.current.push(previewUrl);
        // Store File reference for PDF rendering
        if (file && item.kind === "document") {
          fileMapRef.current.set(item.id, file);
          void renderPdfFile(item.id, file);
        }
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
      fileMapRef.current.delete(uploadId);
      setPdfPages((prev) => { const next = { ...prev }; delete next[uploadId]; return next; });
      setUploads((current) => current.filter((item) => item.id !== uploadId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The upload could not be removed.");
    } finally {
      setRemovingId("");
    }
  }

  async function startRazorpayCheckout(checkout: RazorpayCheckout, orderCode: string) {
    const Razorpay = await loadRazorpayCheckout();
    const instance = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: "UrQrPrint",
      description: `Print order #${orderCode}`,
      theme: { color: "#079c73" },
      handler: async (result: RazorpayCheckoutResult) => {
        try {
          const response = await fetch(`/api/public/shops/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderCode)}/razorpay/verify`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpayOrderId: result.razorpay_order_id,
              razorpayPaymentId: result.razorpay_payment_id,
              razorpaySignature: result.razorpay_signature,
            }),
          });
          if (!response.ok) throw new Error(await getApiError(response));
          const body = (await response.json()) as { order: OrderConfirmation };
          setOrder(body.order);
          setRazorpayCheckout(null);
          setError("");
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Payment was received but could not be confirmed yet.");
        }
      },
      modal: { ondismiss: () => setSubmitting(false) },
    });
    instance.on("payment.failed", (event) => {
      setSubmitting(false);
      setError(event.error?.description || "Razorpay payment failed. You can retry this payment.");
    });
    instance.open();
  }

  async function retryRazorpayPayment() {
    if (!order || order.paymentMethod !== "razorpay" || !razorpayCheckout) return;
    setError("");
    setSubmitting(true);
    try {
      await startRazorpayCheckout(razorpayCheckout, order.code);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Razorpay checkout could not be opened.");
      setSubmitting(false);
    }
  }

  async function placeOrder(paymentMethod: "upi" | "cash" | "pay_here" | "razorpay") {
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
      const body = (await response.json()) as { order: OrderConfirmation; razorpay?: RazorpayCheckout };
      setOrder(body.order);

      if (paymentMethod === "razorpay") {
        if (!body.razorpay) throw new Error("Razorpay checkout details were not returned. The order is saved; retry or contact the shop.");
        setRazorpayCheckout(body.razorpay);
        setQuote(null);
        await startRazorpayCheckout(body.razorpay, body.order.code);
        return;
      }

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
          <p style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.5, margin: "-8px 0 18px" }}>This page will check again automatically. Please try again when the shop is open.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ display: "inline-block", padding: "9px 18px", borderRadius: 8, background: "#079c73", color: "#fff", fontSize: 13, fontWeight: 700, border: 0, cursor: "pointer" }}>
            Check again
          </button>
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

  const effectivePayment: "upi" | "cash" | "pay_here" | "razorpay" =
    selectedPayment === "pay_here" && localTestPaymentsEnabled
      ? "pay_here"
      : selectedPayment === "razorpay" && shop.razorpayEnabled
        ? "razorpay"
      : shop.upiId && selectedPayment === "upi"
        ? "upi"
        : shop.cashEnabled
          ? "cash"
          : shop.upiId
            ? "upi"
            : "cash";

  // Standard NPCI Personal UPI Payment URI
  const currentAmount = order ? order.amountPaise / 100 : quote ? quote.amountPaise / 100 : 0;
  const upiLink = shop.upiId
    ? `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(shop.displayName)}${currentAmount > 0 ? `&am=${currentAmount.toFixed(2)}` : ""}&cu=INR&tn=${encodeURIComponent(order ? `UrQrPrint Order ${order.code}` : `Print at ${shop.displayName}`)}`
    : "";
  const razorpayPaymentPending = order?.paymentMethod === "razorpay" && order.paymentStatus !== "paid";

  return (
    <div
      style={{
        background: "#f8fafc",
        minHeight: "100vh",
        paddingBottom: "max(120px, calc(100px + env(safe-area-inset-bottom, 0px)))",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      {/* Top Navbar */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          height: 60,
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
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "#079c73",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
              }}
            >
              <QrCode size={17} />
            </div>
            <span style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.4px" }}>
              UrQrPrint
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
            <ShieldCheck size={15} />
            <span>Secure</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 520, margin: "0 auto", padding: "14px 12px 20px" }}>
        {/* Dark Shop Name Banner */}
        <div
          style={{
            background: "#0f172a",
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 14,
            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "#1e293b",
              color: "#10b981",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Store size={19} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b style={{ color: "#ffffff", fontSize: 15, fontWeight: 800, display: "block", letterSpacing: "-0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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

        {/* Keep pending payment visually distinct from an accepted print order. */}
        {order ? (
          <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "28px 22px", textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: razorpayPaymentPending ? "#fff7ed" : "#ecfdf5", color: razorpayPaymentPending ? "#ea580c" : "#10b981", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
              {razorpayPaymentPending ? <Clock size={26} strokeWidth={2.5} /> : <Check size={28} strokeWidth={2.5} />}
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: razorpayPaymentPending ? "#c2410c" : "#079c73", letterSpacing: "1px", textTransform: "uppercase" }}>{razorpayPaymentPending ? "PAYMENT REQUIRED" : "ORDER RECEIVED"}</span>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "6px 0 10px" }}>{razorpayPaymentPending ? "Complete payment to place your order" : "Your print order is in!"}</h1>
            <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5, margin: "0 0 20px" }}>
              {razorpayPaymentPending ? "Your files are saved, but the shop has not received a paid print order yet. Complete payment below to continue." : "Show this pickup code at the counter. The shopkeeper will verify and print your order."}
            </p>

            <div style={{ background: "#f8fafc", border: "1.5px dashed #cbd5e1", borderRadius: 14, padding: "16px", marginBottom: 20 }}>
              <small style={{ color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: "0.5px" }}>{razorpayPaymentPending ? "ORDER REFERENCE" : "PICKUP CODE"}</small>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#0f172a", letterSpacing: "3px", margin: "4px 0" }}>
                #{order.code}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: order.paymentStatus === "paid" ? "#16a34a" : "#ea580c" }}>
                {order.paymentStatus === "paid"
                  ? order.status === "needs_approval" ? "✓ Payment confirmed · Waiting for shop approval" : order.status === "submitted" ? "✓ Sent to printer · Awaiting shop confirmation" : order.status === "failed" ? "✓ Payment confirmed · Print retry needed" : "✓ Payment Confirmed · Print queued"
                  : order.paymentMethod === "upi"
                    ? "Waiting for UPI Verification"
                    : order.paymentMethod === "razorpay"
                      ? "Payment not completed · not sent to the shop"
                    : "Cash Due at Counter"}
              </span>
            </div>

            {/* Live Auto-Print Progress Indicator for Paid / Pay Here Orders */}
            {order.paymentStatus === "paid" && (
              <div
                style={{
                  background: order.status === "printed" ? "#ecfdf5" : order.status === "failed" ? "#fff1f2" : "#eff6ff",
                  border: order.status === "printed" ? "1px solid #a7f3d0" : order.status === "failed" ? "1px solid #fecdd3" : "1px solid #bfdbfe",
                  borderRadius: 12,
                  padding: "12px 16px",
                  marginBottom: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  color: order.status === "printed" ? "#065f46" : order.status === "failed" ? "#9f1239" : "#1e40af",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {order.status === "printed" ? (
                  <>
                    <CheckCircle2 size={18} color="#10b981" />
                    <span>✓ Printed successfully! Collect your pages at the counter.</span>
                  </>
                ) : order.status === "printing" ? (
                  <>
                    <LoaderCircle className="spin" size={18} color="#2563eb" />
                    <span>🖨️ Printing on your printer right now…</span>
                  </>
                ) : order.status === "submitted" ? (
                  <><Printer size={18} color="#2563eb" /><span>Sent to the printer. The shop is confirming the pages came out.</span></>
                ) : order.status === "failed" ? (
                  <><X size={18} color="#e11d48" /><span>Printing needs attention. The shop can retry your order.</span></>
                ) : order.status === "needs_approval" ? (
                  <><Clock size={18} color="#2563eb" /><span>Payment confirmed. Waiting for the shop to approve printing.</span></>
                ) : (
                  <>
                    <Zap size={18} color="#2563eb" />
                    <span>⚡ Queued for Printing — desktop agent is dispatching your file…</span>
                  </>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f1f5f9", borderRadius: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Order Total</span>
              <b style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{money(order.amountPaise)}</b>
            </div>

            {order.paymentMethod === "razorpay" && order.paymentStatus !== "paid" && (
              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16, textAlign: "left" }}>
                <p style={{ color: "#64748b", fontSize: 12, lineHeight: 1.5, margin: "0 0 12px" }}>
                  Finish the test payment in Razorpay Checkout. Your order will enter the print queue only after Razorpay confirms the payment.
                </p>
                {razorpayCheckout && (
                  <button type="button" disabled={submitting} onClick={() => void retryRazorpayPayment()} style={{ width: "100%", padding: "11px 16px", border: 0, borderRadius: 9, background: "#079c73", color: "#fff", fontSize: 13, fontWeight: 750, cursor: submitting ? "wait" : "pointer" }}>
                    {submitting ? "Opening secure checkout…" : `Continue payment · ${money(order.amountPaise)}`}
                  </button>
                )}
              </div>
            )}

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
              {claimError && <div role="alert" style={{ color: "#b42318", fontSize: 12, marginTop: 8 }}>{claimError}</div>}
              {statusError && <div role="status" style={{ color: "#9a6700", fontSize: 12, marginTop: 8 }}>{statusError}</div>}
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
                padding: "18px 16px",
                marginBottom: 14,
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#079c73",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  1
                </span>
                <b style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Upload files</b>
                <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500, marginLeft: 2 }}>max 10</span>
              </div>

              {/* Document vs Photo Tab Switcher */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                {/* Tab 1: Document */}
                <button
                  type="button"
                  onClick={() => changeMode("document")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: mode === "document" ? "1.5px solid #079c73" : "1px solid #e2e8f0",
                    background: mode === "document" ? "#f0fdf4" : "#ffffff",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: mode === "document" ? "#dcfce7" : "#f1f5f9",
                      color: mode === "document" ? "#079c73" : "#64748b",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FileText size={17} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      Document
                    </b>
                    <small style={{ color: "#64748b", fontSize: 11, display: "block", whiteSpace: "nowrap" }}>PDF</small>
                  </div>
                </button>

                {/* Tab 2: Photo / Image */}
                <button
                  type="button"
                  onClick={() => changeMode("photo")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: mode === "photo" ? "1.5px solid #079c73" : "1px solid #e2e8f0",
                    background: mode === "photo" ? "#f0fdf4" : "#ffffff",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: mode === "photo" ? "#dcfce7" : "#f1f5f9",
                      color: mode === "photo" ? "#079c73" : "#64748b",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FileImage size={17} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      Photo / Image
                    </b>
                    <small style={{ color: "#64748b", fontSize: 10, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      JPG, PNG, WEBP
                    </small>
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
                  padding: "26px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: "#f8fafc",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
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
                  {uploading ? "Uploading files..." : uploads.length > 0 ? "Add more files" : "Choose files"}
                </b>
                <small style={{ color: "#64748b", fontSize: 12, marginTop: 4, display: "block" }}>
                  {mode === "document" ? "PDF · up to 25.0 MB · or drag them here" : "JPG, PNG, WEBP · up to 25.0 MB · or drag them here"}
                </small>
              </div>

              {/* File List */}
              {uploads.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {uploads.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: "1px solid #e2e8f0",
                        background: "#ffffff",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                        {file.kind === "photo" && file.previewUrl ? (
                          <img src={file.previewUrl} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 34, height: 34, borderRadius: 6, background: "#ecfdf5", color: "#079c73", display: "grid", placeItems: "center", flexShrink: 0 }}>
                            <FileText size={16} />
                          </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <b style={{ display: "block", fontSize: 12, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
                        style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", padding: 6, display: "grid", placeItems: "center", flexShrink: 0 }}
                      >
                        {removingId === file.id ? <LoaderCircle className="spin" size={14} /> : <X size={16} />}
                      </button>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: "#64748b", textAlign: "right", marginTop: 4 }}>
                    {isPhotoOrder
                      ? `${uploads.length} photo · Total ${photoPages.length} page${photoPages.length === 1 ? "" : "s"}`
                      : `Total ${totalSourcePages} page${totalSourcePages === 1 ? "" : "s"}`}
                  </div>
                </div>
              )}
            </section>

            {/* PDF PREVIEW SECTION — shown when documents are uploaded */}
            {mode === "document" && uploads.length > 0 && (
              <section
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: "18px 16px",
                  marginBottom: 14,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                }}
              >
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <b style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Preview</b>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    {totalSourcePages} page{totalSourcePages === 1 ? "" : "s"} · tap to zoom
                  </span>
                </div>

                {uploads.map((upload) => {
                  const pages = pdfPages[upload.id] ?? [];
                  const isLoading = pdfRendering[upload.id] ?? false;
                  return (
                    <div key={upload.id} style={{ marginBottom: 12 }}>
                      {isLoading && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", color: "#64748b", fontSize: 13 }}>
                          <LoaderCircle className="spin" size={16} color="#079c73" />
                          Rendering preview…
                        </div>
                      )}
                      {!isLoading && pages.length === 0 && (
                        <div style={{ padding: "8px 0", color: "#94a3b8", fontSize: 12 }}>
                          Preview not available for this file.
                        </div>
                      )}
                      {pages.length > 0 && (
                        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
                          {pages.map((dataUrl, idx) => (
                            <div
                              key={idx}
                              style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", flexShrink: 0 }}
                              onClick={() => setLightboxSrc(dataUrl)}
                            >
                              <div
                                style={{
                                  width: 120,
                                  border: "1px solid #d1d5db",
                                  borderRadius: 4,
                                  overflow: "hidden",
                                  background: "#ffffff",
                                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                                  transition: "transform 0.15s",
                                }}
                              >
                                <img
                                  src={dataUrl}
                                  alt={`Page ${idx + 1}`}
                                  style={{
                                    width: "100%",
                                    display: "block",
                                    filter: options.colour ? "none" : "grayscale(100%)",
                                    transition: "filter 0.2s ease",
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 10, color: "#64748b", marginTop: 5 }}>Page {idx + 1}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* PHOTO LAYOUT + PREVIEW SECTION (If in photo mode) */}
            {mode === "photo" && (
              <section
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: "18px 16px",
                  marginBottom: 14,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                }}
              >
                {/* Section header with step number 2 */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "#079c73",
                      color: "#ffffff",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 800,
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    2
                  </span>
                  <b style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Photos per page</b>
                  <span style={{ color: "#94a3b8", fontSize: 11, marginLeft: 2 }}>Fewer pages, lower cost</span>
                </div>

                {/* Layout icon selector — 3 per row (2 balanced rows of 3) */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
                  {layouts.map((l) => {
                    const isSelected = options.photoLayout === l.value;
                    const cols = l.columns;
                    const rows = Math.ceil(l.capacity / cols);
                    const cellW = 18 / cols;
                    const cellH = 22 / rows;
                    const cells: { x: number; y: number; w: number; h: number }[] = [];
                    for (let r = 0; r < rows; r++) {
                      for (let c = 0; c < cols; c++) {
                        const slotIdx = r * cols + c;
                        if (slotIdx < l.capacity) {
                          cells.push({
                            x: 1 + c * cellW + 0.5,
                            y: 1 + r * cellH + 0.5,
                            w: cellW - 1,
                            h: cellH - 1,
                          });
                        }
                      }
                    }
                    return (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => updateOptions({ photoLayout: l.value })}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          padding: "10px 8px",
                          borderRadius: 12,
                          border: isSelected ? "2px solid #079c73" : "1.5px solid #e2e8f0",
                          background: isSelected ? "#ecfdf5" : "#ffffff",
                          cursor: "pointer",
                          minWidth: 0,
                          boxSizing: "border-box",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {/* Paper icon SVG */}
                        <svg width="24" height="30" viewBox="0 0 22 28" fill="none">
                          <rect x="0.5" y="0.5" width="21" height="27" rx="2" fill="white" stroke={isSelected ? "#079c73" : "#cbd5e1"} strokeWidth="1"/>
                          {cells.map((cell, ci) => (
                            <rect key={ci} x={cell.x} y={cell.y} width={cell.w} height={cell.h} rx="0.5" fill={isSelected ? "#bbf7d0" : "#e2e8f0"} />
                          ))}
                        </svg>
                        <div style={{ textAlign: "center" }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: isSelected ? "#059669" : "#0f172a",
                              display: "block",
                              lineHeight: 1.2,
                            }}
                          >
                            {l.value === "single"
                              ? "1"
                              : l.value === "two_stack"
                                ? "2 Stacked"
                                : l.value === "two_side_by_side"
                                  ? "2 Side by side"
                                  : l.shortLabel}
                          </span>
                          <small style={{ fontSize: 9, color: "#64748b", display: "block", marginTop: 2 }}>
                            {l.capacity === 1 ? "1 per page" : `${l.capacity} per page`}
                          </small>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Live photo collage preview */}
                {uploads.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <b style={{ fontSize: 13, color: "#0f172a" }}>Preview</b>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>
                        {uploads.length} photo{uploads.length === 1 ? "" : "s"} · {photoPages.length} page{photoPages.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6 }}>
                      {photoPages.map((pagePhotos, pageIdx) => {
                        const cols = photoLayout.columns;
                        const rows = Math.ceil(photoLayout.capacity / cols);
                        const globalOffset = pageIdx * photoLayout.capacity;
                        return (
                          <div key={pageIdx} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", flexShrink: 0 }}>
                            {/* Paper shape — A4 aspect ratio 1:1.414 */}
                            <div
                              style={{
                                width: 136,
                                height: 192,
                                background: "#ffffff",
                                border: "1px solid #d1d5db",
                                borderRadius: 4,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                                display: "grid",
                                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                                gridTemplateRows: `repeat(${rows}, 1fr)`,
                                gap: 2,
                                padding: 3,
                                overflow: "hidden",
                                position: "relative",
                                boxSizing: "border-box",
                              }}
                            >
                              {Array.from({ length: photoLayout.capacity }, (_, slotIdx) => {
                                const photo = pagePhotos[slotIdx];
                                const globalPhotoIdx = globalOffset + slotIdx;
                                return (
                                  <div
                                    key={slotIdx}
                                    style={{
                                      position: "relative",
                                      background: "#ffffff",
                                      borderRadius: 2,
                                      overflow: "hidden",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    {photo?.previewUrl ? (
                                      <img
                                        src={photo.previewUrl}
                                        alt={`Photo ${globalPhotoIdx + 1}`}
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "contain",
                                          display: "block",
                                          filter: options.colour ? "none" : "grayscale(100%)",
                                          transition: "filter 0.2s ease",
                                        }}
                                      />
                                    ) : null}
                                    {/* Number badge */}
                                    <span
                                      style={{
                                        position: "absolute",
                                        top: 3,
                                        left: 3,
                                        width: 14,
                                        height: 14,
                                        borderRadius: "50%",
                                        background: photo?.previewUrl ? "rgba(0,0,0,0.45)" : "rgba(180,180,180,0.5)",
                                        color: "#ffffff",
                                        fontSize: 8,
                                        fontWeight: 800,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        lineHeight: 1,
                                      }}
                                    >
                                      {globalPhotoIdx + 1}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <span style={{ fontSize: 10, color: "#64748b", marginTop: 5, width: 136, textAlign: "center" }}>
                              Page {pageIdx + 1}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* PRINT OPTIONS */}
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: "18px 16px",
                marginBottom: 14,
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#079c73",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {mode === "photo" ? 3 : 2}
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
                      width: 38,
                      height: 38,
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
                    <Minus size={15} />
                  </button>
                  <span style={{ padding: "0 18px", fontWeight: 800, fontSize: 14, color: "#0f172a" }}>
                    {options.copies}
                  </span>
                  <button
                    type="button"
                    disabled={options.copies >= shop.maxCopies}
                    onClick={() => updateOptions({ copies: Math.min(shop.maxCopies, options.copies + 1) })}
                    style={{
                      width: 38,
                      height: 38,
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
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {/* Advanced options toggle (Page range & orientation) */}
              {!isPhotoOrder && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed #e2e8f0" }}>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedOptions((prev) => !prev)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#079c73",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 0,
                    }}
                  >
                    <span>{showAdvancedOptions ? "− Hide page range & orientation" : "+ Need specific pages or landscape?"}</span>
                  </button>

                  {showAdvancedOptions && (
                    <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>
                          Page range (e.g. 1-3, 5)
                        </label>
                        <input
                          type="text"
                          placeholder="All pages"
                          value={options.pageRange}
                          onChange={(e) => updateOptions({ pageRange: e.target.value })}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>
                          Orientation
                        </label>
                        <select
                          value={options.orientation}
                          onChange={(e) => updateOptions({ orientation: e.target.value as "portrait" | "landscape" })}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12, background: "#fff", outline: "none", boxSizing: "border-box" }}
                        >
                          <option value="portrait">Portrait</option>
                          <option value="landscape">Landscape</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* PAYMENT */}
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: "18px 16px",
                marginBottom: 16,
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#079c73",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {mode === "photo" ? 4 : 3}
                </span>
                <b style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Payment</b>
              </div>

              {/* Customer details fields (if shop configured) */}
              {(shop.collectCustomerName || shop.collectCustomerMobile) && (
                <div style={{ marginBottom: 14, display: "grid", gridTemplateColumns: shop.collectCustomerName && shop.collectCustomerMobile ? "1fr 1fr" : "1fr", gap: 10 }}>
                  {shop.collectCustomerName && (
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
                        Your name
                      </label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Enter your name"
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  )}
                  {shop.collectCustomerMobile && (
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
                        Your mobile
                      </label>
                      <input
                        type="tel"
                        value={customerMobile}
                        onChange={(e) => setCustomerMobile(e.target.value)}
                        placeholder="10-digit mobile"
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  )}
                </div>
              )}

              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>
                Payment method
              </label>

              {localTestPaymentsEnabled && <>
              {/* Local-only simulated payment for print-flow development */}
              <div
                onClick={() => setSelectedPayment("pay_here")}
                style={{
                  border: selectedPayment === "pay_here" ? "1.5px solid #079c73" : "1px solid #e2e8f0",
                  background: selectedPayment === "pay_here" ? "#f0fdf4" : "#ffffff",
                  borderRadius: 12,
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                  cursor: "pointer",
                  boxShadow: selectedPayment === "pay_here" ? "0 2px 8px rgba(7, 156, 115, 0.12)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "#079c73",
                      color: "#ffffff",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Zap size={20} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <b style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                        Pay Here
                      </b>
                      <span
                        style={{
                          background: "#dcfce7",
                          color: "#15803d",
                          fontSize: 10,
                          fontWeight: 800,
                          padding: "1px 6px",
                          borderRadius: 4,
                          letterSpacing: "0.3px",
                        }}
                      >
                        ⚡ Auto-Print
                      </span>
                    </div>
                    <small style={{ color: "#64748b", fontSize: 11 }}>
                      Instant confirmation & auto-send to printer
                    </small>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {selectedPayment === "pay_here" ? (
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "#079c73",
                        color: "#ffffff",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Check size={12} strokeWidth={3} />
                    </div>
                  ) : (
                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px solid #cbd5e1", flexShrink: 0 }} />
                  )}
                </div>
              </div>

              </>}
              {shop.razorpayEnabled && (
                <div
                  role="radio"
                  aria-checked={selectedPayment === "razorpay"}
                  tabIndex={0}
                  onClick={() => setSelectedPayment("razorpay")}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedPayment("razorpay"); }}
                  style={{
                    border: selectedPayment === "razorpay" ? "1.5px solid #079c73" : "1px solid #e2e8f0",
                    background: selectedPayment === "razorpay" ? "#f0fdf4" : "#ffffff",
                    borderRadius: 12,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e0f2fe", color: "#0369a1", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <CreditCard size={19} />
                    </div>
                    <div>
                      <b style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Razorpay</b>
                      <small style={{ color: "#64748b", fontSize: 11 }}>UPI · Cards · Netbanking · Wallet · Test mode</small>
                    </div>
                  </div>
                  {selectedPayment === "razorpay"
                    ? <CheckCircle2 size={20} color="#079c73" fill="#079c73" stroke="white" />
                    : <span style={{ width: 18, height: 18, border: "1.5px solid #cbd5e1", borderRadius: "50%" }} />}
                </div>
              )}

              {/* UPI */}
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
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                    cursor: "pointer",
                    boxShadow: selectedPayment === "upi" ? "0 2px 6px rgba(7, 156, 115, 0.08)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: "#079c73",
                        color: "#ffffff",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Smartphone size={19} />
                    </div>
                    <div>
                      <b style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                        UPI
                      </b>
                      <small style={{ color: "#64748b", fontSize: 11 }}>
                        GPay · PhonePe · Paytm · BHIM
                      </small>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "#079c73",
                          color: "#ffffff",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>
                    ) : (
                      <div style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px solid #cbd5e1", flexShrink: 0 }} />
                    )}
                  </div>
                </div>
              )}

              {/* Option 2: Cash at counter */}
              {(shop.cashEnabled || !shop.upiId) && (
                <div style={{ marginBottom: 10 }}>
                  <div
                    onClick={() => setSelectedPayment("cash")}
                    style={{
                      border: selectedPayment === "cash" ? "1.5px solid #079c73" : "1px solid #e2e8f0",
                      background: selectedPayment === "cash" ? "#ffffff" : "#ffffff",
                      borderRadius: 12,
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      boxShadow: selectedPayment === "cash" ? "0 2px 6px rgba(7, 156, 115, 0.08)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: "#fef3c7",
                          color: "#d97706",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Store size={19} />
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
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "#079c73",
                          color: "#ffffff",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>
                    ) : (
                      <div style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px solid #cbd5e1", flexShrink: 0 }} />
                    )}
                  </div>

                  {/* Orange notice matching original design */}
                  {selectedPayment === "cash" && (
                    <div
                      style={{
                        color: "#ea580c",
                        fontSize: 11,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 7,
                        paddingLeft: 4,
                        fontWeight: 500,
                      }}
                    >
                      <Clock size={13} style={{ flexShrink: 0 }} />
                      <span>Printing starts only after you pay at the counter</span>
                    </div>
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
                  marginTop: 12,
                }}
              >
                <ShieldCheck size={14} />
                <span>100% safe & secure payment</span>
              </div>
            </section>

            {/* Privacy footer */}
            <div style={{ textAlign: "center", color: "#64748b", fontSize: 11, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <Lock size={12} />
              <span>Files are used only for printing — auto-deleted afterwards</span>
            </div>
            <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 20 }}>
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
            padding: "10px 16px max(14px, env(safe-area-inset-bottom, 14px))",
            zIndex: 40,
            boxShadow: "0 -4px 16px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              maxWidth: 520,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            {/* Price / Quote Info */}
            <div style={{ minWidth: 0, flex: 1 }}>
              {uploads.length === 0 ? (
                <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                  Upload a file first
                </span>
              ) : quote ? (
                <div>
                  <b style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", display: "block", lineHeight: 1.1 }}>
                    {money(quote.amountPaise)}
                  </b>
                  <small style={{ color: "#64748b", fontSize: 11, marginTop: 2, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {quote.billableUnits} {quote.unit === "pages" ? "page" : "sheet"}{quote.billableUnits === 1 ? "" : "s"} × {options.copies} {options.copies === 1 ? "copy" : "copies"} · {money(quote.amountPaise)}
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
                padding: "11px 22px",
                borderRadius: 999,
                background: !quote || submitting || uploading ? "#94a3b8" : "#079c73",
                color: "#ffffff",
                border: "none",
                fontSize: 14,
                fontWeight: 700,
                cursor: !quote || submitting || uploading ? "not-allowed" : "pointer",
                boxShadow: quote && !submitting ? "0 4px 12px rgba(7, 156, 115, 0.3)" : "none",
                transition: "all 0.15s ease",
                flexShrink: 0,
              }}
            >
              <span>
                {submitting
                  ? "Processing..."
                  : effectivePayment === "pay_here"
                    ? `Pay & Print ${quote ? money(quote.amountPaise) : ""}`
                    : effectivePayment === "upi"
                      ? "Pay with UPI"
                      : effectivePayment === "razorpay"
                        ? `Pay ${quote ? money(quote.amountPaise) : ""} with Razorpay`
                      : "Place order"}
              </span>
              <span style={{ fontSize: 15 }}>→</span>
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
            padding: "16px 14px",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setUpiModalOpen(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: "20px 18px",
              maxWidth: 400,
              width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
              textAlign: "center",
              boxSizing: "border-box",
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
                style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer", padding: 6, display: "grid", placeItems: "center" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Amount Banner */}
            <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px", border: "1px solid #e2e8f0", marginBottom: 14 }}>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
                {order ? "Amount Due" : quote ? "Order Total" : "Shop Payment QR"}
              </span>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#079c73", margin: "2px 0" }}>
                {order ? money(order.amountPaise) : quote ? money(quote.amountPaise) : "Scan to Pay"}
              </div>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {order ? `Order #${order.code}` : quote ? `${quote.billableUnits} ${quote.unit} · ${options.copies} copy` : "Personal Shopkeeper UPI QR"}
              </span>
            </div>

            {/* Shopkeeper Personal UPI QR Code */}
            <div style={{ display: "inline-block", background: "#ffffff", padding: 12, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", marginBottom: 10 }}>
              <QRCodeSVG value={upiLink} size={170} level="M" />
            </div>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 14 }}>
              Scan with GPay, PhonePe, Paytm, or BHIM
            </div>

            {/* Shopkeeper UPI ID */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f1f5f9", padding: "10px 12px", borderRadius: 10, marginBottom: 14, textAlign: "left", gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <small style={{ display: "block", fontSize: 10, color: "#64748b", fontWeight: 700 }}>SHOPKEEPER UPI ID</small>
                <b style={{ fontSize: 13, color: "#0f172a", wordBreak: "break-all" }}>{shop.upiId}</b>
              </div>
              <button
                type="button"
                onClick={copyUpiId}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  padding: "5px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  flexShrink: 0,
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
                    minWidth: 0,
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    fontSize: 12,
                    outline: "none",
                    boxSizing: "border-box",
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
                    flexShrink: 0,
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

      {/* PDF Page Lightbox */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
            cursor: "zoom-out",
          }}
        >
          <img
            src={lightboxSrc}
            alt="Page preview"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              borderRadius: 6,
              boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
            }}
          />
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
