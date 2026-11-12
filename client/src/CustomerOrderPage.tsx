import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FileImage,
  FileText,
  LoaderCircle,
  Minus,
  Plus,
  QrCode,
  ShieldCheck,
  Smartphone,
  Store,
  Upload,
  X,
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

const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

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
    const body = await response.json() as { error?: string };
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
        const result = await response.json() as { order: OrderConfirmation };
        if (active) {
          setOrder(result.order);
          setStatusError("");
        }
      } catch (reason) {
        if (active) setStatusError(reason instanceof Error ? reason.message : "Could not refresh order status.");
      }
    };
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 15_000);
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
        const body = await response.json() as { shop: PublicShop };
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
          const body = await response.json() as { quote: Quote };
          setQuote(body.quote);
          setQuoteError("");
        } catch (reason) {
          if (reason instanceof Error && reason.name !== "AbortError") {
            setQuote(null);
            setQuoteError(reason.message);
          }
        }
      })();
    }, 250);
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
      const result = await response.json() as { uploads: UploadItem[] };
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
        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Allow location access and try placing your order again at the shop.")), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }));
        location = { customerLatitude: position.coords.latitude, customerLongitude: position.coords.longitude };
      }
      const payload = { uploadIds, options, paymentMethod, ...location, ...(shop.collectCustomerName ? { customerName } : {}), ...(shop.collectCustomerMobile ? { customerMobile } : {}) };
      const logicalOrder = { uploadIds, options, paymentMethod, ...(shop.collectCustomerName ? { customerName } : {}), ...(shop.collectCustomerMobile ? { customerMobile } : {}) };
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
      const body = await response.json() as { order: OrderConfirmation };
      setOrder(body.order);
      if (shop.customerUploadVoice && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const announcement = new SpeechSynthesisUtterance("Your order has been placed successfully.");
        announcement.lang = "en-IN";
        window.speechSynthesis.speak(announcement);
      }
      setQuote(null);
    } catch (reason) {
      setError(reason instanceof Error && reason.name === "AbortError"
        ? "The order request timed out. Please retry; we’ll safely check whether it was already received."
        : reason instanceof Error ? reason.message : "Your order could not be placed. Please retry.");
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
      const result = await response.json() as { message: string };
      setClaimMessage(result.message);
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

  if (loading) {
    return <main className="customer-state"><LoaderCircle className="spin" size={23} />Loading this shop…</main>;
  }
  if (error && !shop) {
    return <main className="customer-state customer-error"><Store size={23} /><h1>Shop unavailable</h1><p>{error}</p><a href="/">Go to Printly</a></main>;
  }
  if (!shop) return null;

  const photoLayout = layouts.find((layout) => layout.value === options.photoLayout) ?? layouts[0];
  const photos = uploads.filter((item) => item.kind === "photo");
  const photoPages = Array.from({ length: Math.ceil(photos.length / photoLayout.capacity) }, (_, index) =>
    photos.slice(index * photoLayout.capacity, (index + 1) * photoLayout.capacity),
  );
  const paymentMethod: "upi" | "cash" = shop.upiId && selectedPayment === "upi"
    ? "upi"
    : shop.cashEnabled ? "cash" : "upi";
  const paymentStep = mode === "photo" ? 4 : 3;
  const printOptionsStep = mode === "photo" ? 3 : 2;

  if (order) {
    const upiLink = shop.upiId
      ? `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(shop.displayName)}&am=${(order.amountPaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Print order ${order.code}`)}`
      : "";
    return (
      <div className="customer-page">
        <CustomerHeader />
        <main className="customer-confirmation">
          <div className="confirmation-check"><Check size={26} /></div>
          <div className="customer-eyebrow">ORDER RECEIVED</div>
          <h1>Your print order is in.</h1>
          <p className="confirmation-copy">Show this pickup code at the counter. The shop will confirm payment and update your order after manual fulfillment.</p>
          <p className="customer-retention-note" role="note">Printer automation is temporarily paused. Your shop may fulfill orders manually; contact the shop if you need to confirm availability.</p>
          <div className="pickup-code"><small>PICKUP CODE</small><b>{order.code}</b><span>{customerOrderStatus(order.status, order.paymentStatus)}</span></div>
          {statusError && <p className="customer-status-error" role="status">{statusError} We’ll keep trying to refresh.</p>}
          <div className="confirmation-total"><span>Order total</span><b>{money(order.amountPaise)}</b></div>
          {order.paymentMethod === "upi" && order.paymentStatus !== "paid" && <div className="upi-instructions">
            <h2>Pay the shop directly</h2>
            <p>Pay in your UPI app. This page cannot verify a payment; the shopkeeper will check it and confirm.</p>
            <div className="upi-id-card"><span>SHOP UPI ID</span><b>{shop.upiId}</b><span>Amount: {money(order.amountPaise)}</span></div>
            <div className="customer-upi-qr" role="img" aria-label="Scan this QR code to pay the shop directly">
              <QRCodeSVG value={upiLink} size={176} level="M" includeMargin fgColor="#17241f" bgColor="#ffffff" />
              <span>Scan to pay {money(order.amountPaise)} directly to the shop</span>
            </div>
            <a className="customer-primary-button" href={upiLink}>Open UPI app</a>
            <label className="customer-field">UPI reference number <span>Optional</span><input value={claimReference} maxLength={80} onChange={(event) => setClaimReference(event.target.value)} placeholder="Enter UTR / reference" /></label>
            {claimError && <p className="customer-alert" role="alert">{claimError}</p>}
            {claimMessage && <p className="customer-success" role="status"><Check size={15} />{claimMessage}</p>}
            <button className="customer-secondary-button" type="button" disabled={claiming || Boolean(claimMessage)} onClick={() => void reportPayment()}>{claiming ? "Sending…" : "I've paid — tell the shop"}</button>
            <p className="verification-note"><ShieldCheck size={14} /> Your payment stays unverified until the shop confirms it.</p>
          </div>}
          {order.paymentMethod === "cash" && <div className="cash-instructions"><h2>{order.paymentStatus === "paid" ? "Cash confirmed" : "Pay at the counter"}</h2><p>{order.paymentStatus === "paid" ? "The shop has confirmed your cash payment. Your order status will update after manual fulfillment." : `Show your pickup code and pay ${money(order.amountPaise)} at the shop. The shopkeeper will confirm cash before fulfillment.`}</p></div>}
          {order.paymentMethod === "upi" && order.paymentStatus === "paid" && <div className="cash-instructions"><h2>Payment confirmed</h2><p>The shop has verified your UPI payment. Your order status will update after manual fulfillment.</p></div>}
          <a className="back-link customer-back" href={`/p/${encodeURIComponent(slug)}`}><ArrowLeft size={15} /> Back to shop</a>
        </main>
      </div>
    );
  }

  return (
    <div className="customer-page">
      <CustomerHeader />
      <main className="customer-order-layout">
        <div className="customer-shop-banner"><span>{shop.logoDataUrl ? <img src={shop.logoDataUrl} alt=""/> : <Store size={20} />}</span><b>{shop.displayName}</b></div>
        <p className="customer-retention-note" role="note">Printer automation is temporarily paused. The shop can still review orders and handle fulfillment manually; contact the shop if you need to confirm availability.</p>

        <section className="customer-order-card">
          <SectionHeading number={1} title="Upload files" hint="max 10" />
          <div className="customer-mode-tabs" role="tablist" aria-label="Upload type">
            <button type="button" role="tab" aria-selected={mode === "document"} className={mode === "document" ? "active" : ""} onClick={() => changeMode("document")}><FileText size={19} /><span><b>Document</b><small>PDF</small></span></button>
            <button type="button" role="tab" aria-selected={mode === "photo"} className={mode === "photo" ? "active" : ""} onClick={() => changeMode("photo")}><FileImage size={19} /><span><b>Photo / Image</b><small>JPG, PNG, WEBP</small></span></button>
          </div>
          {uploads.length > 0 && <small className="customer-mode-note">Remove files to change the type</small>}
          <input ref={fileInput} className="visually-hidden" type="file" multiple accept={mode === "document" ? "application/pdf,.pdf" : "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"} onChange={(event: ChangeEvent<HTMLInputElement>) => { const selected = Array.from(event.target.files ?? []); event.target.value = ""; void uploadFiles(selected); }} />
          <button className="customer-dropzone" type="button" disabled={uploading || uploads.length >= 10} onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files)); }}>
            <span className="dropzone-icon">{uploading ? <LoaderCircle className="spin" size={22} /> : <Upload size={21} />}</span>
            <b>{uploading ? "Checking and uploading…" : uploads.length >= 10 ? "Maximum 10 files added" : uploads.length ? "Add more files" : "Choose files"}</b>
            <small>{mode === "document" ? "PDF · Up to 25 MB each · or drag them here" : "JPG, PNG, WEBP · up to 25.0 MB · or drag them here"}</small>
          </button>
          {uploads.length > 0 && <div className="customer-file-list">
            {uploads.map((file) => <div className="customer-file-row" key={file.id}>
              {file.kind === "photo" && file.previewUrl
                ? <img className="customer-file-thumbnail" src={file.previewUrl} alt={`Preview of ${file.name}`} />
                : <span className="customer-file-icon">{file.kind === "photo" ? <FileImage size={17} /> : <FileText size={17} />}</span>}
              <span className="customer-file-info"><b>{file.name}</b><small>{file.kind === "photo" ? "Photo" : `PDF · ${file.pageCount} ${file.pageCount === 1 ? "page" : "pages"}`} · {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB</small></span>
              <button type="button" aria-label={`Remove ${file.name}`} disabled={Boolean(removingId)} onClick={() => void removeUpload(file.id)}>{removingId === file.id ? <LoaderCircle className="spin" size={16} /> : <X size={16} />}</button>
            </div>)}
            <div className="source-page-count">{totalSourcePages} {isPhotoOrder ? "photo" : "document"}{totalSourcePages === 1 ? "" : "s"} · Total {totalSourcePages} {totalSourcePages === 1 ? "page" : "pages"}</div>
          </div>}
          {mode === "document" && uploads.some((item) => item.kind === "document" && item.previewUrl) && <div className="pdf-preview-block">
            <div className="photo-preview-heading"><b>Document preview</b><span>{totalSourcePages} {totalSourcePages === 1 ? "page" : "pages"}</span></div>
            <div className="pdf-preview-list">{uploads.filter((item) => item.kind === "document" && item.previewUrl).map((file) => <div className="pdf-preview-card" key={file.id}>
              <iframe title={`Preview of ${file.name}`} src={`${file.previewUrl}#page=1&toolbar=0&navpanes=0`} />
              <div><b>{file.name}</b><span>{file.pageCount} {file.pageCount === 1 ? "page" : "pages"} · first page preview</span></div>
              <a href={file.previewUrl} target="_blank" rel="noreferrer">Open full preview</a>
            </div>)}</div>
          </div>}
        </section>

        {mode === "photo" && <section className="customer-order-card">
          <SectionHeading number={2} title="Photos per page" hint="Fewer pages, lower cost" />
          <div className="photo-layout-grid" role="group" aria-label="Photos per page">
            {layouts.map((layout) => <button key={layout.value} type="button" className={`photo-layout-choice${options.photoLayout === layout.value ? " selected" : ""}`} aria-pressed={options.photoLayout === layout.value} onClick={() => updateOptions({ photoLayout: layout.value })}>
              <span className={`photo-layout-icon photo-layout-${layout.value}`} style={{ gridTemplateColumns: `repeat(${layout.columns}, 1fr)` }}>{Array.from({ length: layout.capacity }, (_, index) => <i key={index} />)}</span>
              <b>{layout.shortLabel}</b><small>{layout.value === "two_stack" ? "Stacked" : layout.value === "two_side_by_side" ? "Side by side" : ""}</small>
            </button>)}
          </div>
          {photos.length > 0 && <div className="photo-preview-block">
            <div className="photo-preview-heading"><b>Preview</b><span>{photos.length} {photos.length === 1 ? "photo" : "photos"} → <strong>{photoPages.length} {photoPages.length === 1 ? "page" : "pages"}</strong></span></div>
            <div className="photo-preview-pages">{photoPages.map((pagePhotos, pageIndex) => <div className="photo-preview-page-wrap" key={`photo-page-${pageIndex}`}>
              <div className={`photo-preview-page photo-preview-${photoLayout.value}`} style={{ gridTemplateColumns: `repeat(${photoLayout.columns}, minmax(0, 1fr))` }}>
                <span className="photo-preview-page-number">{pageIndex + 1}</span>
                {pagePhotos.map((photo) => photo.previewUrl
                  ? <img key={photo.id} src={photo.previewUrl} alt={photo.name} />
                  : <span className="photo-preview-placeholder" key={photo.id}><FileImage size={18} /></span>)}
              </div>
              <small>Page {pageIndex + 1}</small>
            </div>)}</div>
          </div>}
        </section>}

        <section className="customer-order-card">
          <SectionHeading number={printOptionsStep} title="Print options" />
          <div className="customer-options-card">
            <label className="customer-field">Paper size<select value={options.paperSize} onChange={(event) => updateOptions({ paperSize: event.target.value })}>{shop.enabledPaperSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select><ChevronDown size={15} /></label>
            {shop.colourEnabled && <div className="customer-option-group"><span className="customer-option-label">Colour</span><div className="customer-choice-buttons"><button className={!options.colour ? "selected" : ""} type="button" onClick={() => updateOptions({ colour: false })}>B&amp;W</button><button className={options.colour ? "selected" : ""} type="button" onClick={() => updateOptions({ colour: true })}>Colour</button></div></div>}
            {!isPhotoOrder && shop.duplexEnabled && <div className="customer-option-group"><span className="customer-option-label">Sides</span><div className="customer-choice-buttons"><button className={!options.duplex ? "selected" : ""} type="button" onClick={() => updateOptions({ duplex: false })}>Single side</button><button className={options.duplex ? "selected" : ""} type="button" onClick={() => updateOptions({ duplex: true })}>Both sides</button></div></div>}
            <div className="customer-option-group"><span className="customer-option-label">Orientation</span><div className="customer-choice-buttons"><button className={options.orientation === "portrait" ? "selected" : ""} type="button" onClick={() => updateOptions({ orientation: "portrait" })}>Portrait</button><button className={options.orientation === "landscape" ? "selected" : ""} type="button" onClick={() => updateOptions({ orientation: "landscape" })}>Landscape</button></div></div>
            {!isPhotoOrder && <div className="customer-option-group"><label className="customer-field">Pages to print<input value={options.pageRange} onChange={(event) => updateOptions({ pageRange: event.target.value })} placeholder={`All ${totalSourcePages || "document"} pages`} aria-describedby="page-range-help" /><small id="page-range-help">Optional. For example: 1-3, 5. Leave blank to print every page.</small></label></div>}
            <div className="customer-option-group copies-control"><span className="customer-option-label">Copies</span><div><button type="button" aria-label="Decrease copies" disabled={options.copies <= 1} onClick={() => updateOptions({ copies: Math.max(1, options.copies - 1) })}><Minus size={14} /></button><b>{options.copies}</b><button type="button" aria-label="Increase copies" disabled={options.copies >= shop.maxCopies} onClick={() => updateOptions({ copies: Math.min(shop.maxCopies, options.copies + 1) })}><Plus size={14} /></button></div></div>
          </div>
        </section>

        {(shop.collectCustomerName || shop.collectCustomerMobile) && <section className="customer-order-card customer-contact-fields"><h2>Contact details</h2>{shop.collectCustomerName && <label className="customer-field">Your name<input maxLength={100} value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>}{shop.collectCustomerMobile && <label className="customer-field">Mobile number<input type="tel" maxLength={20} value={customerMobile} onChange={(event) => setCustomerMobile(event.target.value)} /></label>}</section>}

        <section className="customer-order-card">
          <SectionHeading number={paymentStep} title="Payment" />
          <div className="payment-method-list">
            <span className="customer-option-label">Payment method</span>
            {shop.upiId && <button type="button" className={`payment-method-card${paymentMethod === "upi" ? " selected" : ""}`} aria-pressed={paymentMethod === "upi"} onClick={() => setSelectedPayment("upi")}><span className="payment-method-icon"><Smartphone size={19} /></span><span className="payment-method-copy"><b>Direct UPI</b><small>Pay the shop after placing your order</small></span><span className="payment-method-check"><Check size={13} /></span></button>}
            {shop.cashEnabled && <button type="button" className={`payment-method-card${paymentMethod === "cash" ? " selected" : ""}`} aria-pressed={paymentMethod === "cash"} onClick={() => setSelectedPayment("cash")}><span className="payment-method-icon cash"><Store size={18} /></span><span className="payment-method-copy"><b>Cash at counter</b><small>Pay at pickup</small></span><span className="payment-method-check"><Check size={13} /></span></button>}
            {!shop.upiId && !shop.cashEnabled && <p className="customer-alert">This shop has not enabled a payment method yet.</p>}
            <small className="payment-security-note"><ShieldCheck size={13} /> Payments go directly to the shop. Printly does not process them.</small>
          </div>
        </section>

        {quote?.discountPaise ? <p className="customer-discount-note">Bulk discount ({quote.discountPercent}%): −{money(quote.discountPaise)}</p> : null}
        {quoteError && <div className="customer-alert" role="alert">{quoteError}</div>}
        {error && <div className="customer-alert" role="alert">{error}</div>}
        <p className="customer-retention-note"><ShieldCheck size={14} /> Files are used only for printing and unprinted uploads are deleted after {shop.fileRetentionHours < 1 ? `${Math.round(shop.fileRetentionHours * 60)} minutes` : `${shop.fileRetentionHours} ${shop.fileRetentionHours === 1 ? "hour" : "hours"}`}.</p>
      </main>
      <footer className="customer-footer"><span>Printly · Secure order</span><span>Direct payment to {shop.displayName}</span></footer>
      <div className="customer-action-bar"><div className="customer-action-inner"><div className="customer-action-total">{quote ? <><b>{money(quote.amountPaise)}</b><small>{quote.billableUnits} {quote.unit === "pages" ? "page" : "sheet"}{quote.billableUnits === 1 ? "" : "s"} × {options.copies} {options.copies === 1 ? "copy" : "copies"}</small></> : <span>{uploads.length ? quoteError || "Calculating your price…" : "Upload a file first"}</span>}</div><button type="button" disabled={!quote || submitting || uploading || (!shop.upiId && !shop.cashEnabled)} onClick={() => void placeOrder(paymentMethod)}>{submitting ? "Placing order…" : paymentMethod === "upi" ? "Pay now" : "Place order"}<span aria-hidden="true">→</span></button></div></div>
    </div>
  );
}

function customerOrderStatus(status: string, paymentStatus: string): string {
  if (status === "printed") return "Ready for pickup";
  if (status === "printing") return "Legacy print status · contact the shop";
  if (status === "queued") return "Payment confirmed · awaiting manual fulfillment";
  if (status === "needs_approval") return "Payment confirmed · waiting for shop approval";
  if (status === "failed") return "Previous fulfillment issue · please contact the shop.";
  if (status === "rejected") return "The shop could not accept this order. Please contact the shop.";
  if (status === "expired") return "This order expired. Please contact the shop.";
  if (status === "cancelled") return "This order was cancelled.";
  if (paymentStatus === "paid") return "Payment confirmed by the shop";
  if (status === "awaiting_cash") return "Awaiting cash at the counter";
  return "Awaiting shop payment verification";
}

function CustomerHeader() {
  return (
    <header className="customer-header">
      <div className="customer-header-inner">
        <a className="customer-header-brand" href="/"><span><QrCode size={19} /></span><b>Printly</b></a>
        <div className="customer-secure-label"><ShieldCheck size={15} /> Secure</div>
      </div>
    </header>
  );
}

function SectionHeading({ number, title, hint }: { number: number; title: string; hint?: string }) {
  return <div className="customer-section-heading"><span>{number}</span><b>{title}</b>{hint && <small>{hint}</small>}</div>;
}
