import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  LoaderCircle,
  LogOut,
  MapPin,
  Printer,
  QrCode,
  Save,
  Settings2,
  ShieldCheck,
  Store,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type User = {
  id: string;
  ownerName: string;
  email: string;
  twoFactorEnabled?: boolean;
};

type Rate = {
  blackWhiteSimplexPaise: number;
  colourSimplexPaise: number;
  blackWhiteDuplexSheetPaise: number;
  colourDuplexSheetPaise: number;
};

type ShopSettings = {
  slug: string;
  displayName: string;
  ownerName: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  upiId: string;
  cashEnabled: boolean;
  isOnline: boolean;
  locationLockEnabled: boolean;
  locationLatitude?: number;
  locationLongitude?: number;
  locationRadiusMeters: number;
  bulkDiscountMinPages: number;
  bulkDiscountPercent: number;
  discountTiers: Array<{ minUnits: number; maxUnits: number; percent: number }>;
  collectCustomerName: boolean;
  collectCustomerMobile: boolean;
  fileRetentionHours: number;
  autoApproveAfterPayment: boolean;
  enabledPaperSizes: string[];
  colourEnabled: boolean;
  duplexEnabled: boolean;
  maxCopies: number;
  rates: Record<string, Rate>;
  notificationPreferences: { newOrder: boolean; printFailed: boolean; uploadSound: boolean; dailyEmail: boolean };
};

const sizes = ["A4", "A5", "Legal", "A3"] as const;
const rateFields: Array<{ key: keyof Rate; label: string; helper: string }> = [
  { key: "blackWhiteSimplexPaise", label: "B&W, one-sided", helper: "per printed page" },
  { key: "colourSimplexPaise", label: "Colour, one-sided", helper: "per printed page" },
  { key: "blackWhiteDuplexSheetPaise", label: "B&W, double-sided", helper: "per physical sheet" },
  { key: "colourDuplexSheetPaise", label: "Colour, double-sided", helper: "per physical sheet" },
];

const emptyRate: Rate = {
  blackWhiteSimplexPaise: 0,
  colourSimplexPaise: 0,
  blackWhiteDuplexSheetPaise: 0,
  colourDuplexSheetPaise: 0,
};

function createEmptyShop(): ShopSettings {
  return {
    slug: "",
    displayName: "",
    ownerName: "",
    mobile: "",
    email: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    gstin: "",
    upiId: "",
    cashEnabled: true,
    isOnline: true,
    locationLockEnabled: false,
    locationRadiusMeters: 200,
    bulkDiscountMinPages: 0,
    bulkDiscountPercent: 0,
    discountTiers: [],
    collectCustomerName: false,
    collectCustomerMobile: false,
    fileRetentionHours: 24,
    autoApproveAfterPayment: false,
    enabledPaperSizes: ["A4"],
    colourEnabled: false,
    duplexEnabled: false,
    maxCopies: 100,
    rates: { A4: { ...emptyRate }, A5: { ...emptyRate }, Legal: { ...emptyRate }, A3: { ...emptyRate } },
    notificationPreferences: { newOrder: true, printFailed: true, uploadSound: false, dailyEmail: false },
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  let body: { error?: string; details?: Record<string, string[]> } | undefined;
  if (response.status !== 204) {
    const responseText = await response.text();
    if (responseText) {
      try {
        body = JSON.parse(responseText) as { error?: string; details?: Record<string, string[]> };
      } catch {
        if (!response.ok) {
          const unavailable = [502, 503, 504].includes(response.status);
          throw new Error(unavailable
            ? `The service is temporarily unavailable (${response.status}). Please wait a moment and retry.`
            : `The server returned an unexpected response (${response.status}). Please try again.`);
        }
        throw new Error("The server returned an invalid response. Please try again.");
      }
    }
  }
  if (!response.ok) {
    const details = body && "details" in body
      ? Object.values(body.details ?? {}).flat().filter(Boolean).join(" ")
      : "";
    throw new Error([body?.error ?? `Request failed (${response.status}).`, details].filter(Boolean).join(" "));
  }
  return body as T;
}

export function AccountPage({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const [values, setValues] = useState({
    ownerName: "",
    shopName: "",
    mobile: "",
    email: "",
    password: "",
    termsAccepted: false,
  });
  const [error, setError] = useState("");
  const [accountNotice, setAccountNotice] = useState("");
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [loginCode, setLoginCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await requestJson<{ user: User; verificationRequired?: boolean; verificationToken?: string }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(isRegister ? values : { email: values.email, password: values.password }),
      });
      if (!isRegister && (result as { twoFactorRequired?: boolean }).twoFactorRequired) {
        setNeedsTwoFactor(true);
        return;
      }
      if (isRegister && result.verificationRequired) {
        if (result.verificationToken) {
          const link = new URLSearchParams({ email: values.email, token: result.verificationToken });
          window.location.assign(`/verify-email?${link.toString()}`);
          return;
        }
        setAccountNotice("Check your email for a verification link. You can request another link from the email verification page.");
        return;
      }
      window.location.assign("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in right now.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyLoginCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      await requestJson<{ user: User }>("/api/auth/login/verify-code", { method: "POST", body: JSON.stringify({ code: loginCode }) });
      window.location.assign("/dashboard");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not verify this code."); }
    finally { setBusy(false); }
  }

  return (
    <div className="account-page">
      <a className="brand account-brand" href="/">
        <span className="brand-mark"><QrCode size={20} /></span>
        <span>printly<span className="brand-period">.</span></span>
      </a>
      <main className="account-card">
        <a className="back-link" href="/"><ArrowLeft size={15} /> Back to home</a>
        <div className="eyebrow"><span className="eyebrow-dot" /> YOUR SHOP, SIMPLIFIED</div>
        <h1>{isRegister ? "Set up your shop." : "Welcome back."}</h1>
        <p className="account-intro">{isRegister ? "Create your owner account to configure your shop and print rates." : "Sign in to manage your shop settings and print rates."}</p>
        {accountNotice && <div className="success-alert" role="status">{accountNotice} <a href={`/verify-email?email=${encodeURIComponent(values.email)}`}>Verify email</a></div>}
        {needsTwoFactor ? <form className="account-form" onSubmit={(event) => void verifyLoginCode(event)}><p>Enter the six-digit code sent to {values.email}.</p><label>Sign-in code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={loginCode} onChange={(event) => setLoginCode(event.target.value)} /></label>{error && <div className="form-alert" role="alert">{error}</div>}<button className="button button-dark account-submit" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and sign in"}</button></form> : <form className="account-form" onSubmit={submit}>
          {isRegister && <>
            <label>Owner name<input autoComplete="name" required minLength={2} maxLength={100} value={values.ownerName} onChange={(event) => setValues({ ...values, ownerName: event.target.value })} /></label>
            <label>Shop name<input autoComplete="organization" required minLength={2} maxLength={100} value={values.shopName} onChange={(event) => setValues({ ...values, shopName: event.target.value })} /></label>
            <label>Mobile number<input autoComplete="tel" type="tel" required minLength={7} maxLength={20} value={values.mobile} onChange={(event) => setValues({ ...values, mobile: event.target.value })} /></label>
          </>}
          <label>Email address<input autoComplete="email" type="email" required maxLength={254} value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label>
          <label>Password<input autoComplete={isRegister ? "new-password" : "current-password"} type="password" required minLength={12} maxLength={128} value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} /><small>Use at least 12 characters.</small></label>
          {isRegister && <label className="terms-acceptance"><input type="checkbox" required checked={values.termsAccepted} onChange={(event) => setValues({ ...values, termsAccepted: event.target.checked })} /><span>I agree to the <a href="/terms">Terms</a> and <a href="/privacy-policy">Privacy Notice</a>. These are draft policies for the local development preview.</span></label>}
          {error && <div className="form-alert" role="alert">{error}</div>}
          <button className="button button-dark account-submit" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : null}
            {busy ? "Please wait…" : isRegister ? "Create shop account" : "Sign in"}
            {!busy && <ChevronRight size={17} />}
          </button>
        </form>}
        <p className="account-switch">{isRegister ? "Already have an account?" : "New to Printly?"} <a href={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</a></p>
        {!isRegister && <p className="account-switch"><a href="/forgot-password">Forgot your password?</a></p>}
        <div className="account-security"><ShieldCheck size={15} /> Your account is protected with a secure, private session.</div>
      </main>
      <p className="account-footer">Direct shop payments. Your customers’ files stay private.</p>
    </div>
  );
}

export function ShopSettingsPage({ initialSection }: { initialSection?: string } = {}) {
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<ShopSettings>(createEmptyShop);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quoteOptions, setQuoteOptions] = useState({ paperSize: "A4", pageCount: 4, copies: 1, colour: false, duplex: false });
  const [quote, setQuote] = useState<{ amountPaise: number; billableUnits: number; unit: string } | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [copyingShopLink, setCopyingShopLink] = useState(false);
  const [posterSize, setPosterSize] = useState<"A4" | "A5" | "sticker">("A4");
  const [posterStyle, setPosterStyle] = useState<"classic" | "minimal" | "bold">("classic");
  const [posterColor, setPosterColor] = useState("#17241f");
  const [posterLanguage, setPosterLanguage] = useState<"en" | "hi">("en");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { user: account } = await requestJson<{ user: User }>("/api/auth/me");
        setUser(account);
        const { shop: savedShop } = await requestJson<{ shop: ShopSettings }>("/api/shops/me");
        const rates = { ...createEmptyShop().rates, ...savedShop.rates };
        setShop({ ...createEmptyShop(), ...savedShop, discountTiers: savedShop.discountTiers ?? [], rates });
      } catch (reason) {
        if (reason instanceof Error && reason.message.includes("Sign in")) {
          window.location.assign("/login");
          return;
        }
        setError(reason instanceof Error ? reason.message : "Unable to load shop settings.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    if (!loading && initialSection) window.setTimeout(() => document.getElementById(initialSection)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [initialSection, loading]);

  function updateShop<K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) {
    setShop((current) => ({ ...current, [key]: value }));
    setNotice("");
    setQuote(null);
  }

  function updateRate(size: string, key: keyof Rate, amount: string) {
    const rupees = amount === "" ? 0 : Number(amount);
    const paise = Number.isFinite(rupees) && rupees >= 0 ? Math.round(rupees * 100) : 0;
    setShop((current) => ({
      ...current,
      rates: { ...current.rates, [size]: { ...current.rates[size], [key]: paise } },
    }));
    setNotice("");
    setQuote(null);
  }

  function togglePaperSize(size: string) {
    const enabled = shop.enabledPaperSizes.includes(size);
    updateShop("enabledPaperSizes", enabled
      ? shop.enabledPaperSizes.filter((item) => item !== size)
      : [...shop.enabledPaperSizes, size]);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const { shop: savedShop } = await requestJson<{ shop: ShopSettings }>("/api/shops/me", {
        method: "PUT",
        body: JSON.stringify({
          displayName: shop.displayName,
          mobile: shop.mobile,
          address: shop.address,
          city: shop.city,
          state: shop.state,
          pincode: shop.pincode,
          gstin: shop.gstin,
          upiId: shop.upiId,
          cashEnabled: shop.cashEnabled,
          isOnline: shop.isOnline,
          locationLockEnabled: shop.locationLockEnabled,
          locationLatitude: shop.locationLatitude,
          locationLongitude: shop.locationLongitude,
          locationRadiusMeters: Number(shop.locationRadiusMeters),
          bulkDiscountMinPages: Number(shop.bulkDiscountMinPages),
          bulkDiscountPercent: Number(shop.bulkDiscountPercent),
          discountTiers: shop.discountTiers,
          collectCustomerName: shop.collectCustomerName,
          collectCustomerMobile: shop.collectCustomerMobile,
          fileRetentionHours: Number(shop.fileRetentionHours),
          autoApproveAfterPayment: shop.autoApproveAfterPayment,
          enabledPaperSizes: shop.enabledPaperSizes,
          colourEnabled: shop.colourEnabled,
          duplexEnabled: shop.duplexEnabled,
          maxCopies: Number(shop.maxCopies),
          rates: shop.rates,
          notificationPreferences: shop.notificationPreferences,
        }),
      });
      setShop((current) => ({ ...current, ...savedShop }));
      setNotice("Shop settings saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save shop settings.");
    } finally {
      setSaving(false);
    }
  }

  async function getQuote() {
    setQuoteError("");
    setQuote(null);
    setQuoting(true);
    try {
      const result = await requestJson<typeof quote>("/api/shops/quote", {
        method: "POST",
        body: JSON.stringify(quoteOptions),
      });
      setQuote(result);
    } catch (reason) {
      setQuoteError(reason instanceof Error ? reason.message : "Unable to calculate this quote.");
    } finally {
      setQuoting(false);
    }
  }

  async function logout() {
    try {
      await requestJson<void>("/api/auth/logout", { method: "POST" });
      window.location.assign("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign out.");
    }
  }

  async function setTwoFactor(enabled: boolean) {
    setError(""); setNotice("");
    try {
      await requestJson<{ enabled: boolean }>("/api/auth/two-factor", { method: "POST", body: JSON.stringify({ enabled }) });
      setUser((current) => current ? { ...current, twoFactorEnabled: enabled } : current);
      setNotice(enabled ? "Two-step verification enabled." : "Two-step verification disabled.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update sign-in security."); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setChangingPassword(true);
    try {
      await requestJson("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword(""); setNewPassword(""); setNotice("Password changed.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change password."); }
    finally { setChangingPassword(false); }
  }

  function captureShopLocation() {
    setError(""); setNotice("");
    if (!navigator.geolocation) { setError("This browser does not provide location access."); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      setShop((current) => ({ ...current, locationLatitude: position.coords.latitude, locationLongitude: position.coords.longitude }));
      setNotice("Shop location captured. Save shop settings to apply it.");
    }, () => setError("Could not read the shop location. Allow location access and try again."), { enableHighAccuracy: true, timeout: 15000 });
  }

  function getCustomerUrl() {
    return new URL(`/p/${encodeURIComponent(shop.slug)}`, window.location.origin).toString();
  }

  async function copyCustomerUrl() {
    setCopyingShopLink(true);
    setError("");
    try {
      await navigator.clipboard.writeText(getCustomerUrl());
      setNotice("Customer page link copied.");
    } catch (reason) {
      setError(reason instanceof Error ? `Could not copy the shop link: ${reason.message}` : "Could not copy the shop link.");
    } finally {
      setCopyingShopLink(false);
    }
  }

  function downloadShopQr() {
    const svg = document.querySelector<SVGSVGElement>("#shop-qr-code svg");
    if (!svg) {
      setError("The shop QR code is not ready yet.");
      return;
    }
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${shop.slug}-printly-qr.svg`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }

  async function downloadPosterPng() {
    const qr = document.querySelector<SVGSVGElement>("#shop-qr-code svg");
    if (!qr) { setError("The shop QR code is not ready yet."); return; }
    const [width, height] = posterSize === "sticker" ? [1000, 1000] : posterSize === "A5" ? [1748, 2480] : [2480, 3508];
    const qrMarkup = new XMLSerializer().serializeToString(qr);
    const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const instruction = posterLanguage === "hi" ? "फ़ाइलें अपलोड करने और प्रिंट ऑर्डर देने के लिए स्कैन करें।" : "Scan to upload your files and place a print order.";
    const background = posterStyle === "bold" ? posterColor : "#ffffff";
    const foreground = posterStyle === "bold" ? "#ffffff" : posterColor;
    const cardRadius = posterStyle === "minimal" ? 0 : 40;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f4f7f4"/><rect x="8%" y="8%" width="84%" height="84%" rx="${cardRadius}" fill="${background}" stroke="#dfe7df" stroke-width="4"/><text x="50%" y="22%" text-anchor="middle" font-family="Arial,sans-serif" font-size="${posterSize === "sticker" ? 52 : 86}" font-weight="700" fill="${foreground}">${escapeXml(shop.displayName)}</text><g transform="translate(${(width - width * 0.55) / 2} ${height * 0.29}) scale(${width * 0.55 / 196})">${qrMarkup.replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g><text x="50%" y="75%" text-anchor="middle" font-family="Arial,sans-serif" font-size="${posterSize === "sticker" ? 26 : 46}" fill="${foreground}">${escapeXml(instruction)}</text><text x="50%" y="84%" text-anchor="middle" font-family="Arial,sans-serif" font-size="${posterSize === "sticker" ? 24 : 40}" font-weight="700" fill="${foreground}">Printly</text></svg>`;
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Could not render the poster image.")); image.src = objectUrl; });
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Your browser cannot render this poster.");
      context.drawImage(image, 0, 0, width, height);
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the PNG file.")), "image/png"));
      const pngUrl = URL.createObjectURL(png); const link = document.createElement("a"); link.href = pngUrl; link.download = `${shop.slug}-qr-poster.png`; link.click(); URL.revokeObjectURL(pngUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the poster."); }
    finally { URL.revokeObjectURL(objectUrl); }
  }

  function printShopQr() {
    const svg = document.querySelector<SVGSVGElement>("#shop-qr-code svg");
    if (!svg) {
      setError("The shop QR code is not ready yet.");
      return;
    }
    const printWindow = window.open("", "_blank", "width=600,height=720");
    if (!printWindow) {
      setError("Allow pop-ups to print the shop QR poster.");
      return;
    }
    printWindow.document.title = `${shop.displayName} · Printly shop QR`;
    const styles = printWindow.document.createElement("style");
    styles.textContent = `@page{size:${posterSize === "sticker" ? "100mm 100mm" : posterSize};margin:0}body{font-family:Arial,sans-serif;color:${posterColor};margin:0}.poster{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:30px;box-sizing:border-box}.card{max-width:480px;padding:38px;border:1px solid #dfe7df;border-radius:${posterStyle === "minimal" ? "0" : "20px"};${posterStyle === "bold" ? `background:${posterColor};color:#fff` : ""}}.card svg{width:min(72vw,330px);height:auto}.card h1{font-size:30px;margin:18px 0 8px}.card p{font-size:15px;line-height:1.55;color:#66746b}.brand{margin-top:24px;color:${posterColor};font-weight:700}@media print{.poster{min-height:100vh}.card{border:0}}`;
    printWindow.document.head.append(styles);
    const poster = printWindow.document.createElement("main");
    poster.className = "poster";
    const card = printWindow.document.createElement("section");
    card.className = "card";
    card.append(svg.cloneNode(true));
    const name = printWindow.document.createElement("h1");
    name.textContent = shop.displayName;
    const instruction = printWindow.document.createElement("p");
    instruction.textContent = posterLanguage === "hi" ? "फ़ाइलें अपलोड करने और प्रिंट ऑर्डर देने के लिए स्कैन करें।" : "Scan to upload your files and place a print order.";
    const brand = printWindow.document.createElement("div");
    brand.className = "brand";
    brand.textContent = "Powered by Printly";
    card.append(name, instruction, brand);
    poster.append(card);
    printWindow.document.body.replaceChildren(poster);
    printWindow.focus();
    printWindow.print();
  }

  if (loading) {
    return <div className="workspace-loading"><LoaderCircle className="spin" size={24} /> Loading your shop…</div>;
  }

  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <a className="brand" href="/"><span className="brand-mark"><QrCode size={20} /></span><span>printly<span className="brand-period">.</span></span></a>
        <div className="workspace-header-right">
          <span className="workspace-greeting">Hi, {user?.ownerName}</span>
          <button className="logout-button" onClick={() => void logout()} type="button"><LogOut size={15} /> Sign out</button>
        </div>
      </header>
      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <div className="sidebar-shop"><span><Store size={18} /></span><div><b>{shop.displayName || "Your print shop"}</b><small>Shop workspace</small></div></div>
          <div className="sidebar-label">SHOP MANAGEMENT</div>
          <a className="sidebar-link" href="/dashboard"><Store size={17} /> Overview</a>
          <a className="sidebar-link active" href="/dashboard/settings#shop-profile"><Settings2 size={17} /> Shop profile</a>
          <a className="sidebar-link" href="/dashboard/settings#discounts">Discounts</a>
          <a className="sidebar-link" href="/dashboard/settings#payment-settings">Payment settings</a>
          <a className="sidebar-link" href="/dashboard/settings#location-lock">Location lock</a>
          <a className="sidebar-link" href="/dashboard/settings#customer-details">Order form & privacy</a>
          <a className="sidebar-link" href="/dashboard/settings#notifications">Notifications</a>
          <a className="sidebar-link" href="/dashboard/orders"><Printer size={17} /> Orders</a>
          <a className="sidebar-link" href="/dashboard/payments"><CreditCard size={17} /> Payments</a>
          <a className="sidebar-link" href="/dashboard/reports"><CreditCard size={17} /> Reports</a>
          <a className="sidebar-link" href="/dashboard/printers"><Printer size={17} /> Printers & routing</a>
          <a className="sidebar-link" href="/dashboard/qr-code"><QrCode size={17} /> My QR code</a>
          <a className="sidebar-link" href="/dashboard/subscription"><CreditCard size={17} /> Subscription</a>
          <a className="sidebar-link" href="/dashboard/withdraw"><CreditCard size={17} /> Wallet & earnings</a>
          <a className="sidebar-link" href="/dashboard/support"><CircleHelp size={17} /> Help & support</a>
          <div className="sidebar-help"><CircleHelp size={17} /><b>Need a hand?</b><p>Set your print options and rates here, then share your customer page link.</p></div>
        </aside>

        <main className="settings-main">
          <div className="settings-breadcrumb"><span>Shop management</span><ChevronRight size={13} /><b>Shop settings</b></div>
          <div className="settings-title-row">
            <div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR COUNTER, ONLINE</div><h1>Shop settings</h1><p>Set up the details and print rates your customers will see.</p></div>
            {shop.slug && <div className="shop-link-chip"><span className="online-dot" /> Your shop link <b>/p/{shop.slug}</b></div>}
          </div>

          <section className="settings-card shop-online-card">
            <div className="settings-card-heading"><span className="settings-icon"><Store size={18} /></span><div><h2>Customer orders</h2><p>Pause your public order page when the shop cannot accept jobs.</p></div><span className="step-badge">STATUS</span></div>
            <label className="toggle-row"><span><b>{shop.isOnline ? "Shop online" : "Shop offline"}</b><small>{shop.isOnline ? "Customers can open your shop page and place orders." : "New customer orders are paused until you turn this back on."}</small></span><input type="checkbox" checked={shop.isOnline} onChange={(event) => updateShop("isOnline", event.target.checked)} /><i /></label>
          </section>

          {error && <div className="form-alert settings-alert" role="alert">{error}</div>}
          {notice && <div className="success-alert" role="status"><Check size={16} />{notice}</div>}

          <section className="settings-card" id="security-settings"><div className="settings-card-heading"><span className="settings-icon"><ShieldCheck size={18} /></span><div><h2>Sign-in security</h2><p>Change your password and manage two-step verification.</p></div></div><form className="settings-fields two-col" onSubmit={(event) => void changePassword(event)}><label>Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)}/></label><label>New password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/><small>Use at least 12 characters.</small></label><button className="button button-dark" type="submit" disabled={changingPassword}>{changingPassword ? "Changing…" : "Change password"}</button></form><label className="toggle-row"><span><b>Two-step email verification</b><small>Ask for a one-time code after the password. Email delivery must be configured.</small></span><input type="checkbox" checked={Boolean(user?.twoFactorEnabled)} onChange={(event) => void setTwoFactor(event.target.checked)} /><i /></label></section>

          <form onSubmit={saveSettings}>
            <section className="settings-card" id="shop-profile">
              <div className="settings-card-heading"><span className="settings-icon"><Store size={18} /></span><div><h2>Shop profile</h2><p>Basic details for your shop and customer page.</p></div><span className="step-badge">01</span></div>
              <div className="settings-fields two-col">
                <label>Shop display name<input required minLength={2} maxLength={100} value={shop.displayName} onChange={(event) => updateShop("displayName", event.target.value)} /></label>
                <label>Contact mobile<input required type="tel" value={shop.mobile} onChange={(event) => updateShop("mobile", event.target.value)} /></label>
                <label className="field-full">Shop address <span className="optional-label">Optional</span><div className="input-with-icon"><MapPin size={15} /><input maxLength={300} value={shop.address} onChange={(event) => updateShop("address", event.target.value)} /></div></label>
                <label>City<input maxLength={100} value={shop.city} onChange={(event) => updateShop("city", event.target.value)} /></label>
                <label>State<input maxLength={100} value={shop.state} onChange={(event) => updateShop("state", event.target.value)} /></label>
                <label>PIN code<input inputMode="numeric" maxLength={12} value={shop.pincode} onChange={(event) => updateShop("pincode", event.target.value)} /></label>
                <label>GSTIN <span className="optional-label">Optional</span><input maxLength={15} value={shop.gstin} onChange={(event) => updateShop("gstin", event.target.value.toUpperCase())} /></label>
                <label>Account email<input disabled value={shop.email} /></label>
                <label>Customer page URL<input disabled value={shop.slug ? `/p/${shop.slug}` : "Created with your shop"} /></label>
              </div>
            </section>

          <section className="settings-card" id="notifications"><div className="settings-card-heading"><span className="settings-icon"><ShieldCheck size={18}/></span><div><h2>Notifications</h2><p>Choose the alerts shown on the shop dashboard. Browser alerts require permission in each browser. Daily emails are sent at 9 pm India time when SMTP is configured.</p></div></div><div className="toggle-grid">{([ ["newOrder", "New order alert", "Show a dashboard notice and browser alert for new jobs."], ["printFailed", "Print failed alert", "Show a dashboard notice when a job reports a print issue."], ["uploadSound", "Customer upload alert", "Use a short sound for new uploaded jobs."], ["dailyEmail", "Daily summary email", "Email today's order count, source pages, and confirmed receipts."] ] as const).map(([key, label, helper]) => <label className="toggle-row" key={key}><span><b>{label}</b><small>{helper}</small></span><input type="checkbox" checked={shop.notificationPreferences[key]} onChange={(event) => updateShop("notificationPreferences", { ...shop.notificationPreferences, [key]: event.target.checked })}/><i/></label>)}</div><button type="button" className="qr-secondary-button" onClick={() => { try { const AudioContextClass = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (AudioContextClass) { const audio = new AudioContextClass(); const oscillator = audio.createOscillator(); oscillator.connect(audio.destination); oscillator.frequency.value = 660; oscillator.onended = () => { void audio.close(); }; oscillator.start(); oscillator.stop(audio.currentTime + .18); } } catch { setError("Your browser could not play the test sound."); } }}>Test sound</button></section>

            <section className="settings-card shop-qr-card" id="shop-qr-code">
              <div className="settings-card-heading"><span className="settings-icon"><QrCode size={18} /></span><div><h2>Customer QR & sharing</h2><p>Print this code or share your shop link so customers can start an order.</p></div><span className="step-badge">SHARE</span></div>
              <div className="shop-qr-content">
                <div className="shop-qr-preview" id="shop-qr-preview">
                  <QRCodeSVG value={getCustomerUrl()} size={196} level="H" includeMargin fgColor={posterColor} bgColor="#ffffff" title={`QR code for ${shop.displayName}`} />
                </div>
                <div className="shop-qr-details">
                  <div className="settings-fields two-col"><label>Poster size<select value={posterSize} onChange={(event) => setPosterSize(event.target.value as "A4" | "A5" | "sticker")}><option value="A4">A4</option><option value="A5">A5</option><option value="sticker">10 × 10 cm sticker</option></select></label><label>Design<select value={posterStyle} onChange={(event) => setPosterStyle(event.target.value as "classic" | "minimal" | "bold")}><option value="classic">Classic</option><option value="minimal">Minimal</option><option value="bold">Bold</option></select></label><label>Poster language<select value={posterLanguage} onChange={(event) => setPosterLanguage(event.target.value as "en" | "hi")}><option value="en">English</option><option value="hi">Hindi</option></select></label><label>QR color<input type="color" value={posterColor} onChange={(event) => setPosterColor(event.target.value)} /></label></div>
                  <b>{shop.displayName}</b>
                  <a href={`/p/${encodeURIComponent(shop.slug)}`} target="_blank" rel="noreferrer">{getCustomerUrl()}</a>
                  <p>This QR opens your public customer page. It does not collect payment or reveal private shop settings.</p>
                  <div className="shop-qr-actions">
                    <button className="button button-dark" type="button" disabled={copyingShopLink} onClick={() => void copyCustomerUrl()}>{copyingShopLink ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Copy link</button>
                    <button className="button qr-secondary-button" type="button" onClick={downloadShopQr}><QrCode size={14} />Download QR</button>
                    <button className="button qr-secondary-button" type="button" onClick={() => void downloadPosterPng()}><QrCode size={14} />Download poster PNG</button>
                    <button className="button qr-secondary-button" type="button" onClick={printShopQr}><Printer size={14} />Print / Save PDF</button>
                    <a className="button qr-secondary-button" href={`https://wa.me/?text=${encodeURIComponent(`Order prints from ${shop.displayName}: ${getCustomerUrl()}`)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
                  </div>
                </div>
              </div>
            </section>

            <section className="settings-card" id="print-options">
              <div className="settings-card-heading"><span className="settings-icon"><Printer size={18} /></span><div><h2>Print options & rates</h2><p>Choose what you offer and set prices in rupees.</p></div><span className="step-badge">02</span></div>
              <div className="option-block">
                <div className="option-label"><b>Paper sizes</b><small>Select at least one size.</small></div>
                <div className="choice-row">{sizes.map((size) => <label className={`choice-chip${shop.enabledPaperSizes.includes(size) ? " selected" : ""}`} key={size}><input type="checkbox" checked={shop.enabledPaperSizes.includes(size)} onChange={() => togglePaperSize(size)} /><span>{shop.enabledPaperSizes.includes(size) && <Check size={13} />}{size}</span></label>)}</div>
              </div>
              <div className="option-block">
                <div className="option-label"><b>Print capabilities</b><small>Only enabled options appear for customers.</small></div>
                <div className="toggle-grid">
                  <label className="toggle-row"><span><b>Colour printing</b><small>Offer black-and-white and colour.</small></span><input type="checkbox" checked={shop.colourEnabled} onChange={(event) => updateShop("colourEnabled", event.target.checked)} /><i /></label>
                  <label className="toggle-row"><span><b>Double-sided printing</b><small>Charge duplex by physical sheet.</small></span><input type="checkbox" checked={shop.duplexEnabled} onChange={(event) => updateShop("duplexEnabled", event.target.checked)} /><i /></label>
                </div>
              </div>
              <div className="rate-table-wrap">
                <div className="rate-table-heading"><b>Rates by paper size</b><span>Enter amounts in ₹. For duplex, an odd final page uses one full sheet.</span></div>
                <div className="rate-table">
                  <div className="rate-header"><span>Paper</span>{rateFields.map((field) => <span key={field.key}>{field.label}<small>{field.helper}</small></span>)}</div>
                  {sizes.map((size) => <div className={`rate-row${shop.enabledPaperSizes.includes(size) ? "" : " rate-row-disabled"}`} key={size}>
                    <b>{size}{!shop.enabledPaperSizes.includes(size) && <small>Disabled</small>}</b>
                    {rateFields.map((field) => {
                      const hidden = (field.key === "colourSimplexPaise" || field.key === "colourDuplexSheetPaise") && !shop.colourEnabled;
                      const hiddenDuplex = (field.key === "blackWhiteDuplexSheetPaise" || field.key === "colourDuplexSheetPaise") && !shop.duplexEnabled;
                      const disabled = !shop.enabledPaperSizes.includes(size) || hidden || hiddenDuplex;
                      const value = (shop.rates[size]?.[field.key] ?? 0) / 100;
                      return <label className="rate-input" key={field.key}><span className="currency-prefix">₹</span><input aria-label={`${size} ${field.label} rate`} type="number" min="0" max="1000000" step="0.01" value={value || ""} placeholder="0.00" disabled={disabled} onChange={(event) => updateRate(size, field.key, event.target.value)} /></label>;
                    })}
                  </div>)}
                </div>
              </div>
              <label className="copies-setting">Maximum copies per order<input type="number" min="1" max="100" value={shop.maxCopies} onChange={(event) => updateShop("maxCopies", Number(event.target.value))} /><small>Customers can choose from 1 to this number of copies.</small></label>
            <div className="option-block" id="discounts"><div className="option-label"><b>Bulk discount</b><small>Tier discounts use printed pages × copies. The highest matching percentage applies.</small></div>{shop.discountTiers.map((tier, index) => <div className="settings-fields two-col discount-tier" key={index}><label>Minimum units<input type="number" min="1" value={tier.minUnits} onChange={(event) => updateShop("discountTiers", shop.discountTiers.map((item, i) => i === index ? { ...item, minUnits: Number(event.target.value) } : item))} /></label><label>Maximum units<input type="number" min="1" value={tier.maxUnits} onChange={(event) => updateShop("discountTiers", shop.discountTiers.map((item, i) => i === index ? { ...item, maxUnits: Number(event.target.value) } : item))} /></label><label>Discount percent<input type="number" min="0" max="90" step="0.5" value={tier.percent} onChange={(event) => updateShop("discountTiers", shop.discountTiers.map((item, i) => i === index ? { ...item, percent: Number(event.target.value) } : item))} /></label><button type="button" className="qr-secondary-button" onClick={() => updateShop("discountTiers", shop.discountTiers.filter((_, i) => i !== index))}>Remove range</button></div>)}<button type="button" className="qr-secondary-button" disabled={shop.discountTiers.length >= 20} onClick={() => updateShop("discountTiers", [...shop.discountTiers, { minUnits: 50, maxUnits: 100, percent: 5 }])}>Add discount range</button><p>Legacy single-range discount (optional)</p><div className="settings-fields two-col"><label>Minimum units<input type="number" min="0" max="100000" value={shop.bulkDiscountMinPages} onChange={(event) => updateShop("bulkDiscountMinPages", Number(event.target.value))} /></label><label>Discount percent<input type="number" min="0" max="90" step="0.5" value={shop.bulkDiscountPercent} onChange={(event) => updateShop("bulkDiscountPercent", Number(event.target.value))} /></label></div></div>
            </section>

            <section className="settings-card" id="customer-details">
              <div className="settings-card-heading"><span className="settings-icon"><Store size={18} /></span><div><h2>Customer details</h2><p>Ask for contact details when customers place an order.</p></div></div>
              <div className="toggle-grid"><label className="toggle-row"><span><b>Collect customer name</b><small>Add a name field to the order form.</small></span><input type="checkbox" checked={shop.collectCustomerName} onChange={(event) => updateShop("collectCustomerName", event.target.checked)} /><i /></label><label className="toggle-row"><span><b>Collect customer mobile</b><small>Add a phone field to the order form.</small></span><input type="checkbox" checked={shop.collectCustomerMobile} onChange={(event) => updateShop("collectCustomerMobile", event.target.checked)} /><i /></label></div>
              <label className="copies-setting" id="privacy-settings">Pending-file retention (hours)<input type="number" min="1" max="720" value={shop.fileRetentionHours} onChange={(event) => updateShop("fileRetentionHours", Number(event.target.value))} /><small>1 to 720 hours. Active jobs keep their files; files become cleanup-eligible when an order is completed or cancelled.</small></label>
              <div className="settings-card-heading" id="location-lock"><span className="settings-icon"><MapPin size={18}/></span><div><h2>Shop location lock</h2><p>Optionally limit new orders to customers physically near your shop. Location access is requested only when an order is placed.</p></div></div>
              <label className="toggle-row"><span><b>Only allow nearby orders</b><small>{shop.locationLatitude !== undefined && shop.locationLongitude !== undefined ? `Shop location saved · ${shop.locationRadiusMeters} m radius` : "Set the shop location before enabling this."}</small></span><input type="checkbox" checked={shop.locationLockEnabled} disabled={shop.locationLatitude === undefined || shop.locationLongitude === undefined} onChange={(event) => updateShop("locationLockEnabled", event.target.checked)} /><i /></label>
              <div className="settings-fields two-col"><label>Allowed radius (metres)<input type="number" min="50" max="5000" step="50" value={shop.locationRadiusMeters} onChange={(event) => updateShop("locationRadiusMeters", Number(event.target.value))}/></label><button type="button" className="qr-secondary-button" onClick={captureShopLocation}>Use this device to set shop location</button></div>
            </section>

            <section className="settings-card" id="payment-settings">
              <div className="settings-card-heading"><span className="settings-icon"><CreditCard size={18} /></span><div><h2>How customers pay</h2><p>Payments go to you directly. The app does not collect or verify UPI payments automatically.</p></div><span className="step-badge">03</span></div>
              <div className="payment-settings">
                <label className="upi-field" htmlFor="upiId">Shop UPI ID <span className="optional-label">Optional</span><input id="upiId" autoComplete="off" placeholder="yourshop@bank" value={shop.upiId} onChange={(event) => updateShop("upiId", event.target.value)} /><small>Leave blank to turn off UPI. We never ask for your UPI PIN or bank password.</small></label>
                <label className="toggle-row payment-toggle"><span><b>Cash at counter</b><small>Orders wait for you to collect cash and confirm it.</small></span><input type="checkbox" checked={shop.cashEnabled} onChange={(event) => updateShop("cashEnabled", event.target.checked)} /><i /></label>
                <label className="toggle-row payment-toggle"><span><b>Auto-approve after payment confirmation</b><small>After you manually confirm UPI or cash, move the order directly to the print queue.</small></span><input type="checkbox" checked={shop.autoApproveAfterPayment} onChange={(event) => updateShop("autoApproveAfterPayment", event.target.checked)} /><i /></label>
                <div className="payment-note"><ShieldCheck size={16} /> No payment gateway, platform wallet, or commission is used.</div>
              </div>
            </section>

            <section className="settings-card quote-card">
              <div className="settings-card-heading"><span className="settings-icon"><CreditCard size={18} /></span><div><h2>Try a sample quote</h2><p>The server calculates from your saved rates; the browser cannot set the final price.</p></div><span className="step-badge">TEST</span></div>
              <div className="quote-controls">
                <label>Paper size<select value={quoteOptions.paperSize} onChange={(event) => { setQuoteOptions({ ...quoteOptions, paperSize: event.target.value }); setQuote(null); }}><option value="A4">A4</option><option value="A5">A5</option><option value="Legal">Legal</option></select></label>
                <label>Pages<input type="number" min="1" max="1000" value={quoteOptions.pageCount} onChange={(event) => { setQuoteOptions({ ...quoteOptions, pageCount: Number(event.target.value) }); setQuote(null); }} /></label>
                <label>Copies<input type="number" min="1" max={shop.maxCopies} value={quoteOptions.copies} onChange={(event) => { setQuoteOptions({ ...quoteOptions, copies: Number(event.target.value) }); setQuote(null); }} /></label>
                <button className="button button-dark quote-button" type="button" disabled={quoting} onClick={() => void getQuote()}>{quoting ? <LoaderCircle className="spin" size={15} /> : null}Calculate</button>
              </div>
              <div className="quote-toggles">
                <label><input type="checkbox" checked={quoteOptions.colour} disabled={!shop.colourEnabled} onChange={(event) => { setQuoteOptions({ ...quoteOptions, colour: event.target.checked }); setQuote(null); }} /> Colour</label>
                <label><input type="checkbox" checked={quoteOptions.duplex} disabled={!shop.duplexEnabled} onChange={(event) => { setQuoteOptions({ ...quoteOptions, duplex: event.target.checked }); setQuote(null); }} /> Double-sided</label>
              </div>
              {quote && <div className="quote-result" role="status"><span>Quote for {quote.billableUnits} {quote.unit}</span><b>₹{(quote.amountPaise / 100).toFixed(2)}</b></div>}
              {quoteError && <div className="form-alert quote-error" role="alert">{quoteError}</div>}
            </section>

            <div className="settings-save-row">
              <span><ShieldCheck size={15} /> Settings are private to your shop account.</span>
              <button className="button button-dark save-button" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "Saving…" : "Save shop settings"}</button>
            </div>
          </form>
        </main>
      </div>
      <footer className="workspace-footer"><a href="/">printly.</a><span>Secure shop settings</span><span>Support <ChevronRight size={12} /></span></footer>
    </div>
  );
}
