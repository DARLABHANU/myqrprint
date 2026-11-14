import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CreditCard,
  Copy,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Printer,
  QrCode,
  Save,
  ShieldCheck,
  Store,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const publicCustomerOrigin = "https://myqrprint.vercel.app";

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
  logoDataUrl: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  upiId: string;
  upiEnabled: boolean;
  cashEnabled: boolean;
  razorpayEnabled?: boolean;
  autoPrint: boolean;
  isOnline: boolean;
  agentOnline?: boolean;
  locationLockEnabled: boolean;
  locationLatitude?: number;
  locationLongitude?: number;
  locationRadiusMeters: number;
  bulkDiscountMinPages: number;
  bulkDiscountPercent: number;
  discountTiers: Array<{ minUnits: number; maxUnits: number; percent: number }>;
  discountGroups: Array<{ paperSize: "all" | "A3" | "A4" | "A5" | "Legal"; ranges: Array<{ minPages: number; maxPages?: number | null; percent: number }> }>;
  collectCustomerName: boolean;
  collectCustomerMobile: boolean;
  fileRetentionHours: number;
  enabledPaperSizes: string[];
  colourEnabled: boolean;
  duplexEnabled: boolean;
  maxCopies: number;
  rates: Record<string, Rate>;
  notificationPreferences: { newOrder: boolean; printFailed: boolean; uploadSound: boolean; customerUploadVoice: boolean; dailyEmail: boolean };
};

const sizes = ["A4", "A5", "Legal", "A3"] as const;
const indianStates = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
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
    logoDataUrl: "",
    mobile: "",
    email: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    gstin: "",
    upiId: "",
    upiEnabled: false,
    cashEnabled: true,
    autoPrint: false,
    isOnline: false,
    locationLockEnabled: false,
    locationRadiusMeters: 200,
    bulkDiscountMinPages: 0,
    bulkDiscountPercent: 0,
    discountTiers: [],
    discountGroups: [],
    collectCustomerName: false,
    collectCustomerMobile: false,
    fileRetentionHours: 24,
    enabledPaperSizes: ["A4"],
    colourEnabled: false,
    duplexEnabled: false,
    maxCopies: 100,
    rates: { A4: { ...emptyRate }, A5: { ...emptyRate }, Legal: { ...emptyRate }, A3: { ...emptyRate } },
    notificationPreferences: { newOrder: true, printFailed: true, uploadSound: false, customerUploadVoice: true, dailyEmail: false },
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

export function ShopQrCodePage() {
  const [shop, setShop] = useState<ShopSettings>(createEmptyShop);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copying, setCopying] = useState(false);
  const [posterSize, setPosterSize] = useState<"A4" | "A5" | "sticker">("A4");
  const [posterStyle, setPosterStyle] = useState<"classic" | "minimal" | "bold">("classic");
  const [posterColor, setPosterColor] = useState("#079b70");
  const [posterLanguage, setPosterLanguage] = useState<"en" | "hi">("en");
  useEffect(() => { void requestJson<{ shop: ShopSettings }>("/api/shops/me").then(({ shop: saved }) => setShop({ ...createEmptyShop(), ...saved })).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load your shop QR code.")).finally(() => setLoading(false)); }, []);
  function url() { return new URL(`/p/${encodeURIComponent(shop.slug)}`, publicCustomerOrigin).toString(); }
  async function copyLink() { setCopying(true); setError(""); try { await navigator.clipboard.writeText(url()); setNotice("Customer page link copied."); } catch { setError("Could not copy the customer link. Copy it from the address below."); } finally { setCopying(false); } }
  function getSvg() { return document.querySelector<SVGSVGElement>("#shop-qr-code svg"); }
  function downloadQr() { const svg = getSvg(); if (!svg) { setError("The QR code is not ready yet."); return; } const objectUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" })); const link = document.createElement("a"); link.href = objectUrl; link.download = `${shop.slug}-printly-qr.svg`; link.click(); URL.revokeObjectURL(objectUrl); }
  function printPoster() {
    const svg = getSvg(); if (!svg) { setError("The QR code is not ready yet."); return; }
    const popup = window.open("", "_blank", "width=700,height=850"); if (!popup) { setError("Allow pop-ups to print or save the poster as PDF."); return; }
    const instruction = posterLanguage === "hi" ? "फ़ाइलें अपलोड करने और प्रिंट ऑर्डर देने के लिए स्कैन करें।" : "Scan to upload files and place your print order.";
    const size = posterSize === "sticker" ? "100mm 100mm" : posterSize;
    popup.document.write(`<!doctype html><title>${shop.displayName} · Printly QR</title><style>@page{size:${size};margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f4f7f5;color:#17241f}.poster{min-height:100vh;display:grid;place-items:center;padding:8%}.card{width:100%;max-width:680px;display:grid;justify-items:center;gap:22px;padding:10%;text-align:center;background:${posterStyle === "bold" ? posterColor : "white"};color:${posterStyle === "bold" ? "white" : "#17241f"};border-radius:${posterStyle === "minimal" ? "0" : "24px"};border:1px solid #dfe7e3}.card svg{width:min(65vw,420px);height:auto}.card h1{margin:0;font-size:clamp(28px,5vw,48px)}.card p{margin:0;color:#718078;font-size:18px}.brand{font-weight:700;color:${posterColor}}@media print{.poster{min-height:100vh}}</style><main class="poster"><section class="card">${new XMLSerializer().serializeToString(svg)}<h1>${shop.displayName}</h1><p>${instruction}</p><b class="brand">Powered by Printly · Scan · Upload · Pay · Print</b></section></main>`);
    popup.document.close(); popup.focus(); popup.print();
  }
  if (loading) return <div className="workspace-loading"><LoaderCircle className="spin" size={22}/> Loading your QR code…</div>;
  function downloadQrPng() { void (async () => { const svg = getSvg(); if (!svg) { setError("The QR code is not ready yet."); return; } const source = new XMLSerializer().serializeToString(svg); const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" })); try { const image = new Image(); image.src = url; await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Could not render the QR image.")); }); const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 1200; const context = canvas.getContext("2d"); if (!context) throw new Error("This browser cannot render the QR image."); context.fillStyle = "#fff"; context.fillRect(0,0,1200,1200); context.drawImage(image, 70, 70, 1060, 1060); const blob = await new Promise<Blob>((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error("Could not create PNG.")),"image/png")); const pngUrl = URL.createObjectURL(blob); const link = document.createElement("a"); link.href=pngUrl; link.download=`${shop.slug}-qr.png`; link.click(); URL.revokeObjectURL(pngUrl); } catch(reason) { setError(reason instanceof Error?reason.message:"Could not download QR PNG."); } finally { URL.revokeObjectURL(url); } })(); }
  function downloadPosterPng() { void (async () => { const qr=getSvg(); if(!qr){setError("The QR code is not ready yet.");return;} const [width,height]=posterSize==="sticker"?[1000,1000]:posterSize==="A5"?[1748,2480]:[2480,3508]; const qrMarkup=new XMLSerializer().serializeToString(qr); const esc=(value:string)=>value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); const instruction=posterLanguage==="hi"?"फ़ाइलें अपलोड करने और प्रिंट ऑर्डर देने के लिए स्कैन करें।":"Scan to upload files and place your print order."; const bg=posterStyle==="bold"?posterColor:"#ffffff", fg=posterStyle==="bold"?"#ffffff":posterColor; const poster=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f4f7f5"/><rect x="8%" y="8%" width="84%" height="84%" rx="${posterStyle==="minimal"?0:40}" fill="${bg}"/><text x="50%" y="22%" text-anchor="middle" font-family="Arial" font-size="${posterSize==="sticker"?52:86}" font-weight="700" fill="${fg}">${esc(shop.displayName)}</text><g transform="translate(${width*.225} ${height*.29}) scale(${width*.55/196})">${qrMarkup.replace(/^<svg[^>]*>|<\/svg>$/g,"")}</g><text x="50%" y="75%" text-anchor="middle" font-family="Arial" font-size="${posterSize==="sticker"?26:46}" fill="${fg}">${esc(instruction)}</text><text x="50%" y="84%" text-anchor="middle" font-family="Arial" font-size="40" font-weight="700" fill="${fg}">Printly</text></svg>`; const url=URL.createObjectURL(new Blob([poster],{type:"image/svg+xml"})); try{const image=new Image();image.src=url;await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Could not render poster."));});const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const context=canvas.getContext("2d");if(!context)throw new Error("This browser cannot render the poster.");context.drawImage(image,0,0,width,height);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Could not create PNG.")),"image/png"));const pngUrl=URL.createObjectURL(blob);const link=document.createElement("a");link.href=pngUrl;link.download=`${shop.slug}-qr-poster.png`;link.click();URL.revokeObjectURL(pngUrl);}catch(reason){setError(reason instanceof Error?reason.message:"Could not create the poster PNG.");}finally{URL.revokeObjectURL(url);}})(); }
  return <div className="workspace-page"><main className="settings-main shop-qr-page-main">
    <header className="shop-qr-page-heading"><div><h1>My QR code</h1><p>Customers scan this QR to send files straight to your printer.</p></div><div><button type="button" className="qr-secondary-button" onClick={printPoster}><Download size={14}/> PDF</button><button type="button" className="button button-primary" onClick={printPoster}><Printer size={14}/> Print poster</button></div></header>
    {error && <div className="form-alert" role="alert">{error}</div>}{notice && <div className="success-alert" role="status">{notice}</div>}
    <section className="shop-qr-live-card"><div className="shop-qr-live-image" id="shop-qr-code"><QRCodeSVG value={url()} size={112} level="H" includeMargin fgColor={posterColor} bgColor="#fff" title={`QR code for ${shop.displayName}`}/></div><div className="shop-qr-live-details"><div className="shop-qr-name-row"><h2>{shop.displayName}</h2><span>● Live</span><small>Powered by <b>Printly</b></small></div><div className="shop-qr-link"><Link2 size={14}/><a href={url()} target="_blank" rel="noreferrer">{url()}</a><button type="button" onClick={() => void copyLink()} disabled={copying}><Copy size={14}/>{copying ? "Copied" : "Copy"}</button></div><div className="shop-qr-actions"><a className="button button-primary" href={`https://wa.me/?text=${encodeURIComponent(`Order prints from ${shop.displayName}: ${url()}`)}`} target="_blank" rel="noreferrer"><MessageCircle size={14}/> WhatsApp</a><button type="button" className="qr-secondary-button" onClick={downloadQr}><QrCode size={14}/> QR image (SVG)</button><button type="button" className="qr-secondary-button" onClick={downloadQrPng}><ImageIcon size={14}/> QR image (PNG)</button><a className="qr-secondary-button" href={url()} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open</a></div></div></section>
    <section className="settings-card shop-poster-card"><header><h2>Create a poster</h2><p>4 easy steps — pick a design, then download or print</p></header><div className="poster-preview-wrap"><div className="poster-preview-heading"><b>◉ &nbsp;Live preview</b><span>{posterSize === "sticker" ? "10 × 10 cm sticker · Glass door / desk" : `${posterSize} poster · ${posterSize === "A4" ? "Counter / wall" : "Table stand"}`}</span></div><div className={`poster-preview ${posterStyle}`} style={{"--poster-color":posterColor} as React.CSSProperties}><small>PRINT FROM YOUR PHONE</small><h2>{shop.displayName || "Your shop name"}</h2><p>Scan · Upload · Pay · Print</p><QRCodeSVG value={url()} size={148} level="H" includeMargin/></div>
    <div className="poster-steps"><section><h3><i>1</i> Choose size</h3>{([ ["A4","A4 poster","Counter / wall"],["A5","A5 poster","Table stand"],["sticker","Sticker 10×10 cm","Glass door / desk"]] as const).map(([value,label,help])=><label key={value} className={posterSize===value?"selected":""}><input type="radio" checked={posterSize===value} onChange={()=>setPosterSize(value)}/><b>{label}</b><small>{help}</small></label>)}</section><section><h3><i>2</i> Choose design</h3>{([ ["classic","Classic","Colour header"],["minimal","Minimal","White, clean"],["bold","Bold","Full colour"]] as const).map(([value,label,help])=><label key={value} className={posterStyle===value?"selected":""}><input type="radio" checked={posterStyle===value} onChange={()=>setPosterStyle(value)}/><b>{label}</b><small>{help}</small></label>)}</section><section><h3><i>3</i> Colour and text</h3><label>Colour<div className="poster-colours">{["#079b70","#2877d1","#7654ca","#db4b4b","#ed8a17","#172b50"].map(color=><button type="button" aria-label={`Poster colour ${color}`} className={posterColor===color?"selected":""} key={color} style={{background:color}} onClick={()=>setPosterColor(color)}/>)}</div></label><label>Shop name on poster<input value={shop.displayName} readOnly/></label><label>Language<select value={posterLanguage} onChange={event=>setPosterLanguage(event.target.value as "en"|"hi")}><option value="en">English</option><option value="hi">हिंदी</option></select></label></section><section><h3><i>4</i> Download or print</h3><button type="button" className="button button-primary" onClick={printPoster}><Printer size={15}/> Print now <small>Straight to your printer — best quality</small></button><button type="button" className="qr-secondary-button" onClick={printPoster}><FileText size={15}/> Download PDF <small>Print-ready · {posterSize}</small></button><button type="button" className="qr-secondary-button" onClick={downloadPosterPng}><Download size={15}/> Download PNG <small>HD image · {posterSize}</small></button></section></div></div></section>
    <section className="settings-card qr-placement-card"><h2>Where to place the QR</h2><p>Tips for more scans</p><ol><li>Put it at eye level in front of the counter, where the queue forms.</li><li>Stick a copy on the glass door outside, so customers can order even when the shop is closed.</li><li>Laminate it or use an acrylic stand so the QR stays undamaged.</li><li>Keep the QR at least 10 × 10 cm and avoid glossy surfaces.</li></ol><small>After printing, always scan the QR once with your phone to test it.</small></section>
  </main></div>;
}

export function AccountPage({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const [values, setValues] = useState({
    ownerName: "",
    shopName: "",
    mobile: "",
    email: "",
    termsAccepted: false,
  });
  const [error, setError] = useState("");
  const [accountNotice, setAccountNotice] = useState("");
  const [otpStage, setOtpStage] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (otpStage) {
        await requestJson<{ user: User }>("/api/auth/register/verify-code", {
          method: "POST",
          body: JSON.stringify({ email: values.email, code: otpCode }),
        });
        window.location.assign("/dashboard");
        return;
      }
      if (!isRegister) {
        await requestJson<{ user: User }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: values.email, password }),
        });
        window.location.assign("/dashboard");
        return;
      }
      const result = await requestJson<{ otpRequired: boolean; message: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...values, password }),
      });
      setOtpStage(result.otpRequired);
      setOtpCode("");
      setAccountNotice(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in right now.");
    } finally {
      setBusy(false);
    }
  }

  async function resendRegistrationCode() {
    setError(""); setBusy(true);
    try {
      const result = await requestJson<{ message: string }>("/api/auth/register", { method: "POST", body: JSON.stringify({ ...values, password }) });
      setAccountNotice(result.message);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not resend the code."); }
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
        <h1>{isRegister ? (otpStage ? "Enter verification OTP." : "Set up your shop.") : "Welcome back."}</h1>
        <p className="account-intro">{isRegister ? (otpStage ? "Enter the 6-digit OTP sent to your email to complete registration and log in." : "Create your shop owner account. You will receive a 6-digit OTP to log in.") : "Sign in to your shop dashboard with your email and password."}</p>
        {accountNotice && <div className="success-alert" role="status">{accountNotice}</div>}
        <form className="account-form" onSubmit={submit}>
          {isRegister && !otpStage && <>
            <label>Owner name<input autoComplete="name" required minLength={2} maxLength={100} value={values.ownerName} onChange={(event) => setValues({ ...values, ownerName: event.target.value })} /></label>
            <label>Shop name<input autoComplete="organization" required minLength={2} maxLength={100} value={values.shopName} onChange={(event) => setValues({ ...values, shopName: event.target.value })} /></label>
            <label>Mobile number<input autoComplete="tel" type="tel" required minLength={7} maxLength={20} value={values.mobile} onChange={(event) => setValues({ ...values, mobile: event.target.value })} /></label>
          </>}
          <label>Email address<input autoComplete="email" type="email" required maxLength={254} readOnly={otpStage} value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label>
          {!otpStage && <label>Password<span className="password-input-wrap"><input autoComplete={isRegister ? "new-password" : "current-password"} required type={showPassword ? "text" : "password"} minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>{isRegister && <small>Use at least 12 characters. You’ll use this to sign in.</small>}</label>}
          {otpStage && <label>Six-digit OTP<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="123456" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} /><small>Enter the 6-digit code sent to your email.</small></label>}
          {isRegister && !otpStage && <label className="terms-acceptance"><input type="checkbox" required checked={values.termsAccepted} onChange={(event) => setValues({ ...values, termsAccepted: event.target.checked })} /><span>I agree to the <a href="/terms">Terms</a> and <a href="/privacy-policy">Privacy Notice</a>. These are draft policies for the local development preview.</span></label>}
          {error && <div className="form-alert" role="alert">{error}</div>}
          <button className="button button-dark account-submit" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : null}
            {busy ? "Please wait…" : otpStage ? "Verify OTP & Log In" : isRegister ? "Register" : "Sign in"}
            {!busy && <ChevronRight size={17} />}
          </button>
          {isRegister && otpStage && <button className="text-link" type="button" disabled={busy} onClick={() => void resendRegistrationCode()}>Resend OTP</button>}
          {isRegister && otpStage && <button className="text-link" type="button" disabled={busy} onClick={() => { setOtpStage(false); setAccountNotice(""); setError(""); }}>Change registration details</button>}
        </form>
        <p className="account-switch">{isRegister ? "Already have an account?" : "New to Printly?"} <a href={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</a></p>
        {!isRegister && <p className="account-switch"><a href="/forgot-password">Forgot your password?</a></p>}
        <div className="account-security"><ShieldCheck size={15} /> Your account is protected with a secure, private session.</div>
      </main>
      <p className="account-footer">Direct shop payments. Your customers’ files stay private.</p>
    </div>
  );
}

export function ShopSettingsPage({ initialSection }: { initialSection?: string } = {}) {
  const section = initialSection ?? ({
    "/dashboard/setting/discount": "discounts",
    "/dashboard/setting/payment": "payment-settings",
    "/dashboard/setting/location": "location-lock",
    "/dashboard/setting/order-form": "customer-details",
    "/dashboard/setting/notifications": "notifications",
    "/dashboard/settings/profile": "shop-profile",
    "/dashboard/settings/security": "security-settings",
    "/dashboard/settings/privacy": "privacy-settings",
    "/dashboard/settings": "shop-profile",
  }[window.location.pathname] ?? "print-options");
  const sectionTitles: Record<string, [string, string]> = {
    "print-options": ["Page setting", "Choose paper sizes and set print rates — customers see the exact price as soon as they upload."],
    discounts: ["Discount setting", "Set discounts for larger print orders."],
    "payment-settings": ["Payment setting", "Choose how customers pay for print orders."],
    "location-lock": ["Location lock", "Limit orders to customers near your shop."],
    "customer-details": ["Order form", "Choose what customer details you collect at order time."],
    notifications: ["Notifications", "Choose the alerts you receive for shop activity."],
    "shop-profile": ["Shop profile", "Shop details, logo and address."],
    "security-settings": ["Account & security", "Manage your password and sign-in verification."],
    "privacy-settings": ["Privacy", "Control customer information and uploaded-file retention."],
  };
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<ShopSettings>(createEmptyShop);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copyingShopLink, setCopyingShopLink] = useState(false);
  const [posterSize, setPosterSize] = useState<"A4" | "A5" | "sticker">("A4");
  const [posterStyle, setPosterStyle] = useState<"classic" | "minimal" | "bold">("classic");
  const [posterColor, setPosterColor] = useState("#17241f");
  const [posterLanguage, setPosterLanguage] = useState<"en" | "hi">("en");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState({ current: false, next: false, confirm: false });
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { user: account } = await requestJson<{ user: User }>("/api/auth/me");
        setUser(account);
        const { shop: savedShop, agentOnline, razorpayEnabled } = await requestJson<{ shop: ShopSettings; agentOnline?: boolean; razorpayEnabled?: boolean }>("/api/shops/me");
        const rates = { ...createEmptyShop().rates, ...savedShop.rates };
        setShop({ ...createEmptyShop(), ...savedShop, razorpayEnabled: Boolean(razorpayEnabled), agentOnline: Boolean(agentOnline), autoPrint: savedShop.autoPrint ?? false, upiEnabled: savedShop.upiEnabled ?? Boolean(savedShop.upiId), discountTiers: savedShop.discountTiers ?? [], discountGroups: savedShop.discountGroups ?? [], notificationPreferences: { ...createEmptyShop().notificationPreferences, ...savedShop.notificationPreferences }, rates });
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

  function updateShop<K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) {
    setShop((current) => ({ ...current, [key]: value }));
    setNotice("");
  }

  async function setLogoFromFile(file?: File) {
    if (!file) return;
    setError(""); setNotice("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a PNG, JPG or WEBP logo up to 5 MB."); return;
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("This image could not be opened.")); image.src = objectUrl; });
      const scale = Math.min(1, 600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d"); if (!context) throw new Error("Your browser could not resize the logo.");
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.86; let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > 650000 && quality > 0.45) { quality -= 0.1; dataUrl = canvas.toDataURL("image/jpeg", quality); }
      if (dataUrl.length > 700000) throw new Error("This logo is too detailed to store. Choose a smaller image.");
      updateShop("logoDataUrl", dataUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not process the shop logo."); }
    finally { URL.revokeObjectURL(objectUrl); }
  }

  function updateRate(size: string, key: keyof Rate, amount: string) {
    const rupees = amount === "" ? 0 : Number(amount);
    const paise = Number.isFinite(rupees) && rupees >= 0 ? Math.round(rupees * 100) : 0;
    setShop((current) => ({
      ...current,
      rates: { ...current.rates, [size]: { ...current.rates[size], [key]: paise } },
    }));
    setNotice("");
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
          ownerName: shop.ownerName,
          logoDataUrl: shop.logoDataUrl,
          mobile: shop.mobile,
          address: shop.address,
          city: shop.city,
          state: shop.state,
          pincode: shop.pincode,
          gstin: shop.gstin,
          upiId: shop.upiId,
          upiEnabled: shop.upiEnabled,
          cashEnabled: shop.cashEnabled,
          autoPrint: shop.autoPrint,
          isOnline: shop.isOnline,
          locationLockEnabled: shop.locationLockEnabled,
          locationLatitude: shop.locationLatitude,
          locationLongitude: shop.locationLongitude,
          locationRadiusMeters: Number(shop.locationRadiusMeters),
          bulkDiscountMinPages: Number(shop.bulkDiscountMinPages),
          bulkDiscountPercent: Number(shop.bulkDiscountPercent),
          discountTiers: shop.discountTiers,
          discountGroups: shop.discountGroups,
          collectCustomerName: shop.collectCustomerName,
          collectCustomerMobile: shop.collectCustomerMobile,
          fileRetentionHours: Number(shop.fileRetentionHours),
          enabledPaperSizes: shop.enabledPaperSizes,
          colourEnabled: shop.colourEnabled,
          duplexEnabled: shop.duplexEnabled,
          maxCopies: Number(shop.maxCopies),
          rates: shop.rates,
          notificationPreferences: shop.notificationPreferences,
        }),
      });
      setShop((current) => ({ ...current, ...savedShop }));
      setUser((current) => current ? { ...current, ownerName: savedShop.ownerName } : current);
      window.dispatchEvent(new CustomEvent("printly:profile-updated", { detail: { ownerName: savedShop.ownerName, displayName: savedShop.displayName } }));
      setNotice("Shop settings saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save shop settings.");
    } finally {
      setSaving(false);
    }
  }

  async function setTwoFactor(enabled: boolean) {
    setError(""); setNotice("");
    try {
      const result = await requestJson<{ enabled: boolean }>("/api/auth/two-factor", { method: "POST", body: JSON.stringify({ enabled }) });
      setUser((current) => current ? { ...current, twoFactorEnabled: result.enabled } : current);
      setNotice(result.enabled ? "Two-step verification enabled." : "Two-step verification disabled.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update sign-in security."); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setChangingPassword(true);
    try {
      if (newPassword !== confirmNewPassword) throw new Error("The new passwords do not match.");
      await requestJson("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); setNotice("Password changed.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change password."); }
    finally { setChangingPassword(false); }
  }

  function captureShopLocation(enableLocationLock = false) {
    setError(""); setNotice("");
    if (!navigator.geolocation) { setError("This browser does not provide location access."); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      setShop((current) => ({ ...current, locationLatitude: position.coords.latitude, locationLongitude: position.coords.longitude, ...(enableLocationLock ? { locationLockEnabled: true } : {}) }));
      setNotice(enableLocationLock ? "Shop location captured. Save changes to enable location lock." : "Shop location captured. Save shop settings to apply it.");
    }, () => setError("Could not read the shop location. Allow location access and try again."), { enableHighAccuracy: true, timeout: 15000 });
  }

  function testVoice(message: string) {
    if (!("speechSynthesis" in window)) { setError("Voice playback is not available in this browser."); return; }
    window.speechSynthesis.cancel();
    const announcement = new SpeechSynthesisUtterance(message);
    announcement.lang = "en-IN";
    window.speechSynthesis.speak(announcement);
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
    <div className="workspace-page" style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <main className={`settings-main settings-single-page settings-section-${section}`} data-settings-section={section} style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 80px" }}>
        <div className="settings-breadcrumb"><span>Shop</span><ChevronRight size={13} /><b>{sectionTitles[section]?.[0] ?? "Settings"}</b></div>
        <div className="settings-title-row">
          <div><h1>{sectionTitles[section]?.[0] ?? "Settings"}</h1><p>{sectionTitles[section]?.[1] ?? "Manage your shop preferences."}</p></div>
          {shop.slug && <div className="shop-link-chip"><span className="online-dot" /> Your shop link <b>/p/{shop.slug}</b></div>}
          </div>

          <section className="settings-card shop-online-card">
            <div className="settings-card-heading"><span className="settings-icon"><Store size={18} /></span><div><h2>Customer orders</h2><p>Pause your public order page when the shop cannot accept jobs.</p></div><span className="step-badge">STATUS</span></div>
            <label className="toggle-row"><span><b>{shop.isOnline && shop.agentOnline ? "Shop online" : "Shop offline"}</b><small>{!shop.agentOnline ? "Open and connect the desktop agent, then set the shop online there." : shop.isOnline ? "Customers can open your shop page and place orders." : "New customer orders are paused until you turn the shop online in the desktop agent."}</small></span><input type="checkbox" checked={shop.isOnline && Boolean(shop.agentOnline)} readOnly disabled /><i /></label>
          </section>

          {error && <div className="form-alert settings-alert" role="alert">{error}</div>}
          {notice && <div className="success-alert" role="status"><Check size={16} />{notice}</div>}

          <div id="security-settings" className="security-settings-page">
            <section className="settings-card"><div className="settings-card-heading"><div><h2>Change password</h2><p>Use at least 12 characters.</p></div></div><form className="password-change-form" onSubmit={(event) => void changePassword(event)}>
              {([ ["current", "Current password", currentPassword, setCurrentPassword, "current-password"], ["next", "New password", newPassword, setNewPassword, "new-password"], ["confirm", "Confirm new password", confirmNewPassword, setConfirmNewPassword, "new-password"] ] as const).map(([key, label, value, setter, autoComplete]) => <label className="password-setting-field" key={key}>{label}<span className="password-input-wrap"><input required type={visiblePasswords[key] ? "text" : "password"} minLength={key === "current" ? undefined : 12} maxLength={128} autoComplete={autoComplete} value={value} onChange={(event) => setter(event.target.value)}/><button type="button" aria-label={`${visiblePasswords[key] ? "Hide" : "Show"} ${label.toLowerCase()}`} onClick={() => setVisiblePasswords((current) => ({ ...current, [key]: !current[key] }))}>{visiblePasswords[key] ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label>)}
              <div className="security-save-row"><span>At least 12 characters recommended.</span><button className="button button-dark" type="submit" disabled={changingPassword}>{changingPassword ? <LoaderCircle className="spin" size={15}/> : <ShieldCheck size={15}/>}Update password</button></div>
            </form></section>
            <section className="settings-card"><div className="settings-card-heading"><div><h2>2-step verification</h2><p>Password, 2-step verification and active sessions.</p></div></div><label className="toggle-row"><span><b>Ask for OTP at login</b><small>Every login needs a 6-digit code emailed to your registered email, as well as your password.</small></span><input type="checkbox" checked={Boolean(user?.twoFactorEnabled)} onChange={(event) => void setTwoFactor(event.target.checked)}/><i/></label></section>
          </div>

          <form onSubmit={saveSettings}>
            <section className="settings-card" id="shop-profile">
              <div className="settings-card-heading"><div><h2>Shop details</h2><p>Shown on the customer upload page and invoices.</p></div></div>
              <div className="shop-logo-editor"><span className="shop-logo-preview">{shop.logoDataUrl ? <img src={shop.logoDataUrl} alt="Shop logo preview"/> : shop.displayName.slice(0, 2).toUpperCase() || "SC"}</span><div><b>Shop logo</b><p>PNG or JPG, square, max 5 MB — compressed automatically. Your initials show if there’s no logo.</p><label className="qr-secondary-button shop-logo-upload"><Download size={13}/> Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void setLogoFromFile(event.target.files?.[0]); event.target.value = ""; }}/></label>{shop.logoDataUrl && <button type="button" className="shop-logo-remove" onClick={() => updateShop("logoDataUrl", "")}>Remove logo</button>}</div></div>
              <div className="settings-fields two-col">
                <label>Shop display name<input required={section === "shop-profile"} minLength={2} maxLength={100} value={shop.displayName} onChange={(event) => updateShop("displayName", event.target.value)} /></label>
                <label>Owner name<input required={section === "shop-profile"} minLength={2} maxLength={100} value={shop.ownerName} onChange={(event) => updateShop("ownerName", event.target.value)} /></label>
                <label>Contact mobile<input required={section === "shop-profile"} type="tel" value={shop.mobile} onChange={(event) => updateShop("mobile", event.target.value)} /></label>
                <label className="field-full">Shop address <span className="optional-label">Optional</span><div className="input-with-icon"><MapPin size={15} /><input maxLength={300} value={shop.address} onChange={(event) => updateShop("address", event.target.value)} /></div></label>
                <label>City<input maxLength={100} value={shop.city} onChange={(event) => updateShop("city", event.target.value)} /></label>
                <label>State<select value={shop.state} onChange={(event) => updateShop("state", event.target.value)}><option value="">Select state</option>{indianStates.map((state) => <option key={state}>{state}</option>)}</select></label>
                <label>PIN code<input inputMode="numeric" maxLength={12} value={shop.pincode} onChange={(event) => updateShop("pincode", event.target.value)} /></label>
                <label>GSTIN <span className="optional-label">Optional</span><input maxLength={15} value={shop.gstin} onChange={(event) => updateShop("gstin", event.target.value.toUpperCase())} /></label>
                <label>Account email<input disabled value={shop.email} /></label>
                <label>Customer page URL<input disabled value={shop.slug ? `/p/${shop.slug}` : "Created with your shop"} /></label>
              </div>
            </section>

          <section className="settings-card notifications-settings-card" id="notifications"><div className="settings-card-heading"><span className="settings-icon"><ShieldCheck size={18}/></span><div><h2>Notification preferences</h2><p>Choose which alerts you want.</p></div></div><div className="notification-option-list">
            {([ ["newOrder", "New order alert", "When a customer places an order — on every dashboard page, even with the window minimised.", "New order received."], ["printFailed", "Print failed alert", "A red message and a voice when a print fails (paper jam, out of paper, printer offline…).", "Print failed. Please check the printer."], ["customerUploadVoice", "Customer upload voice", "A voice on the customer’s phone after they upload files and place the order.", "Your order has been placed successfully."] ] as const).map(([key, label, helper, phrase]) => <article className="notification-option" key={key}><label className="toggle-row"><span><b>{label}</b><small>{helper}</small></span><input type="checkbox" checked={shop.notificationPreferences[key]} onChange={(event) => updateShop("notificationPreferences", { ...shop.notificationPreferences, [key]: event.target.checked })}/><i/></label><div className="notification-voice-row"><span>Voice says: <b>“{phrase}”</b></span><button type="button" className="qr-secondary-button" onClick={() => testVoice(phrase)}><ShieldCheck size={13}/> Test sound</button></div></article>)}
            <article className="notification-option"><label className="toggle-row"><span><b>Daily summary email</b><small>A summary of orders, pages and earnings every night at 9 pm.</small></span><input type="checkbox" checked={shop.notificationPreferences.dailyEmail} onChange={(event) => updateShop("notificationPreferences", { ...shop.notificationPreferences, dailyEmail: event.target.checked })}/><i/></label></article>
          </div></section>

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
              <div className="page-rate-grid">
                {sizes.map((size) => {
                  const enabled = shop.enabledPaperSizes.includes(size);
                  const rateInput = (key: keyof Rate, label: string, unit: string) => <label className="page-rate-input" key={key}><span>{label}<small>{unit}</small></span><span className="page-rate-currency">₹<input aria-label={`${size} ${label} rate`} type="number" min="0" max="1000000" step="0.01" value={(shop.rates[size]?.[key] ?? 0) / 100 || ""} placeholder="0" disabled={!enabled || ((key === "colourSimplexPaise" || key === "colourDuplexSheetPaise") && !shop.colourEnabled) || ((key === "blackWhiteDuplexSheetPaise" || key === "colourDuplexSheetPaise") && !shop.duplexEnabled)} onChange={(event) => updateRate(size, key, event.target.value)} /></span></label>;
                  return <article className={`page-rate-card${enabled ? "" : " is-disabled"}`} key={size}>
                    <header><label className="page-paper-toggle"><input type="checkbox" checked={enabled} onChange={() => togglePaperSize(size)}/><i/><span><b>{size}</b><small>{size === "A4" ? "210 × 297 mm" : size === "Legal" ? "216 × 356 mm" : size === "A3" ? "297 × 420 mm" : "148 × 210 mm"}</small></span></label></header>
                    <label className="page-capability-toggle"><span><b>Colour printing</b><small>Customers can choose B&W or colour</small></span><input type="checkbox" checked={shop.colourEnabled} onChange={(event) => updateShop("colourEnabled", event.target.checked)}/><i/></label>
                    <div className="page-rate-subhead"><b>ONE SIDE</b><small>per page</small></div>
                    {rateInput("blackWhiteSimplexPaise", "Black & White", "per page")}
                    {shop.colourEnabled && rateInput("colourSimplexPaise", "Colour", "per page")}
                    <label className="page-capability-toggle duplex"><span><b>Both sides printing</b><small>per sheet · 2 pages</small></span><input type="checkbox" checked={shop.duplexEnabled} onChange={(event) => updateShop("duplexEnabled", event.target.checked)}/><i/></label>
                    {shop.duplexEnabled && <>{rateInput("blackWhiteDuplexSheetPaise", "Black & White", "per sheet")}{shop.colourEnabled && rateInput("colourDuplexSheetPaise", "Colour", "per sheet")}</>}
                  </article>;
                })}
              </div>
              <label className="copies-setting">Maximum copies per order<input type="number" min="1" max="100" value={shop.maxCopies} onChange={(event) => updateShop("maxCopies", Number(event.target.value))} /><small>Customers can choose from 1 to this number of copies.</small></label>
            <div className="discount-settings-panel" id="discounts">
              <header className="discount-settings-heading"><div><h2>Bulk discounts</h2><p>Pages × copies decide the range · the biggest matching discount is applied automatically</p></div><button type="button" className="qr-secondary-button" disabled={shop.discountGroups.length >= 20} onClick={() => updateShop("discountGroups", [...shop.discountGroups, { paperSize: "all", ranges: [{ minPages: 10, maxPages: null, percent: 5 }] }])}>＋ Add paper size</button></header>
              {shop.discountGroups.length === 0 ? <div className="discount-empty"><p>No discounts yet.</p><button type="button" className="button button-primary" onClick={() => updateShop("discountGroups", [{ paperSize: "all", ranges: [{ minPages: 10, maxPages: null, percent: 5 }] }])}>＋ Add paper size</button></div> : <div className="discount-group-list">{shop.discountGroups.map((group, groupIndex) => <article className="discount-group" key={`${group.paperSize}-${groupIndex}`}><div className="discount-group-head"><label>Paper size<select aria-label="Paper size" value={group.paperSize} onChange={(event) => updateShop("discountGroups", shop.discountGroups.map((item, index) => index === groupIndex ? { ...item, paperSize: event.target.value as typeof item.paperSize } : item))}><option value="all">All paper sizes</option>{sizes.filter((size) => shop.enabledPaperSizes.includes(size) || size === group.paperSize).map((size) => <option value={size} key={size}>{size}</option>)}</select></label><button type="button" className="discount-remove-group" onClick={() => updateShop("discountGroups", shop.discountGroups.filter((_, index) => index !== groupIndex))}>Remove group</button></div>
                {group.ranges.map((range, rangeIndex) => <div className="discount-range" key={rangeIndex}><label>Min. pages<input type="number" min="1" max="1000000" value={range.minPages || ""} onChange={(event) => updateShop("discountGroups", shop.discountGroups.map((item, index) => index === groupIndex ? { ...item, ranges: item.ranges.map((entry, at) => at === rangeIndex ? { ...entry, minPages: Number(event.target.value) } : entry) } : item))}/></label><span className="discount-range-to">to</span><label>Max. pages<input type="number" min={range.minPages} max="1000000" placeholder="No limit" value={range.maxPages ?? ""} onChange={(event) => updateShop("discountGroups", shop.discountGroups.map((item, index) => index === groupIndex ? { ...item, ranges: item.ranges.map((entry, at) => at === rangeIndex ? { ...entry, maxPages: event.target.value === "" ? null : Number(event.target.value) } : entry) } : item))}/></label><span className="discount-range-arrow">→</span><label>Discount %<input type="number" min="0" max="90" step="0.5" value={range.percent} onChange={(event) => updateShop("discountGroups", shop.discountGroups.map((item, index) => index === groupIndex ? { ...item, ranges: item.ranges.map((entry, at) => at === rangeIndex ? { ...entry, percent: Number(event.target.value) } : entry) } : item))}/></label><span className="discount-result">{range.minPages || 0}+ pages → {range.percent}% off</span><button type="button" className="discount-remove-range" aria-label={`Remove ${range.minPages}+ pages on ${group.paperSize}`} onClick={() => updateShop("discountGroups", shop.discountGroups.map((item, index) => index === groupIndex ? { ...item, ranges: item.ranges.filter((_, at) => at !== rangeIndex) } : item))}>×</button></div>)}
                <button type="button" className="discount-add-range" onClick={() => updateShop("discountGroups", shop.discountGroups.map((item, index) => index === groupIndex ? { ...item, ranges: [...item.ranges, { minPages: 50, maxPages: null, percent: 5 }] } : item))}>＋ Add range</button>
              </article>)}</div>}
              <p className="discount-help-note">Leave Max. pages empty for no upper limit (for example, 51 to no limit → 5%).</p>
            </div>
            </section>

            <section className="settings-card" id="customer-details">
              <div className="settings-card-heading"><span className="settings-icon"><Store size={18} /></span><div><h2>Customer details</h2><p>Ask for contact details when customers place an order.</p></div></div>
              <div className="toggle-grid"><label className="toggle-row"><span><b>Collect customer name</b><small>Add a name field to the order form.</small></span><input type="checkbox" checked={shop.collectCustomerName} onChange={(event) => updateShop("collectCustomerName", event.target.checked)} /><i /></label><label className="toggle-row"><span><b>Collect customer mobile</b><small>Add a phone field to the order form.</small></span><input type="checkbox" checked={shop.collectCustomerMobile} onChange={(event) => updateShop("collectCustomerMobile", event.target.checked)} /><i /></label></div>
              <div id="privacy-settings">
                <div className="settings-card-heading"><div><h2>File privacy</h2><p>Customer document safety comes first.</p></div></div>
                <label className="toggle-row"><span><b>Auto-delete files after print</b><small>As soon as a file prints, it is permanently deleted from the shop computer and server.</small></span><input type="checkbox" checked disabled readOnly/><i/></label>
                <div className="privacy-guarantee"><ShieldCheck size={15}/> This setting is always on to protect customer privacy and cannot be turned off.</div>
                <label className="privacy-retention">Delete unprinted files after<select value={shop.fileRetentionHours} onChange={(event) => updateShop("fileRetentionHours", Number(event.target.value))}><option value={0.25}>15 minutes</option><option value={1}>1 hour</option><option value={24}>24 hours</option></select><small>Files from orders that weren’t paid or printed are deleted after this time.</small></label>
              </div>
              <div id="location-lock"><div className="settings-card-heading"><span className="settings-icon"><MapPin size={18}/></span><div><h2>Location lock</h2><p>Only customers who are at your shop can scan the QR code and place an order.</p></div></div><label className="location-lock-option"><span><b>Only allow orders at the shop</b><small>When a customer scans your QR code, their phone’s location is checked. Inside the shop radius they can order; outside they see a message.</small></span><input aria-label="Only allow orders at the shop" type="checkbox" checked={shop.locationLockEnabled} onChange={(event) => { if (!event.target.checked) updateShop("locationLockEnabled", false); else if (shop.locationLatitude !== undefined && shop.locationLongitude !== undefined) updateShop("locationLockEnabled", true); else captureShopLocation(true); }}/><i/></label></div>
            </section>

            <section className="settings-card" id="payment-settings">
              <div className="settings-card-heading"><span className="settings-icon"><CreditCard size={18} /></span><div><h2>Payment setting</h2><p>Choose which payment methods customers see on your order page.</p></div><span className="step-badge">03</span></div>
              <div className="payment-settings">
                <article className="shop-payment-method"><div className="shop-payment-method-heading"><span className="shop-payment-symbol gateway"><Printer size={15}/></span><div><b>Auto print</b><small>Automatically send confirmed UPI orders to the printer</small></div><label className="toggle-switch-control"><input aria-label="Auto print UPI orders" type="checkbox" checked={shop.autoPrint} onChange={(event) => updateShop("autoPrint", event.target.checked)} /><i/></label></div><p className="shop-payment-help">When off, confirmed UPI orders wait for your approval. Cash orders always wait until you confirm cash at the counter.</p></article>
                <article className={`shop-payment-method${shop.upiEnabled && shop.upiId ? " configured" : ""}`}>
                  <div className="shop-payment-method-heading">
                    <span className="shop-payment-symbol upi">▦</span>
                    <div>
                      <b>UPI payment</b>
                      <small>Customer pays directly to your personal UPI account</small>
                    </div>
                    <label className="toggle-switch-control"><input aria-label="UPI payment" type="checkbox" checked={shop.upiEnabled} onChange={(event) => updateShop("upiEnabled", event.target.checked)} /><i/></label>
                  </div>
                  {shop.upiEnabled ? <label className="upi-field" htmlFor="upiId">
                    Shop UPI ID
                    <input
                      id="upiId"
                      autoComplete="off"
                      placeholder="yourshop@okhdfcbank or 9876543210@paytm"
                      value={shop.upiId}
                      onChange={(event) => updateShop("upiId", event.target.value)}
                    />
                    <small>
                      Enter your personal or business UPI ID. When customers place orders via UPI on your customer page, they will be prompted with your personal payment QR code generated for the exact bill amount.
                    </small>
                  </label> : <p className="shop-payment-help">UPI is hidden from customers until you turn it on.</p>}

                  {shop.upiEnabled && shop.upiId ? (
                    <div style={{ marginTop: 14, padding: "14px 16px", background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ background: "#ffffff", padding: 8, borderRadius: 10, border: "1px solid #e2e8f0", display: "inline-block", flexShrink: 0 }}>
                        <QRCodeSVG
                          value={`upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(shop.displayName)}&cu=INR`}
                          size={90}
                          level="M"
                        />
                      </div>
                      <div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                          <Check size={12} /> Personal Payment QR
                        </div>
                        <b style={{ display: "block", fontSize: 13, color: "#0f172a" }}>UPI: {shop.upiId}</b>
                        <span style={{ fontSize: 11, color: "#64748b", display: "block", marginTop: 2, lineHeight: 1.4 }}>
                          This is your personal payment receiving QR code (not the front-counter customer ordering QR). Customers scan this to transfer order payments directly to your bank account.
                        </span>
                      </div>
                    </div>
                  ) : null}
                </article>
                <article className={`shop-payment-method${shop.cashEnabled ? " configured" : ""}`}><div className="shop-payment-method-heading"><span className="shop-payment-symbol cash">⌂</span><div><b>Cash at counter</b><small>Customer pays when they collect the print</small></div><label className="toggle-switch-control"><input type="checkbox" checked={shop.cashEnabled} onChange={(event) => updateShop("cashEnabled", event.target.checked)} /><i/></label></div>{shop.cashEnabled && <p className="shop-payment-help">Orders stay marked as unpaid until you collect cash and confirm the payment.</p>}</article>
                <article className={`shop-payment-method shop-payment-gateway-hold${shop.razorpayEnabled ? " configured" : ""}`}><div className="shop-payment-method-heading"><span className="shop-payment-symbol gateway"><CreditCard size={15}/></span><div><b>Razorpay</b><small>UPI · Cards · Netbanking · Wallet</small></div><span className="shop-payment-state">{shop.razorpayEnabled ? "Test mode ready" : "Needs test keys"}</span></div><p className="shop-payment-help">{shop.razorpayEnabled ? "Test checkout is available to customers. Test payments do not transfer real money." : "Add Razorpay test key ID and key secret to the backend environment to enable customer checkout."}</p></article>
                <div className="payment-note"><ShieldCheck size={16} /> Razorpay payments are collected by the configured Printly gateway account. Shop payouts are not configured in this test integration.</div>
              </div>
            </section>

            <div className="settings-save-row">
              <span><ShieldCheck size={15} /> Settings are private to your shop account.</span>
              <button className="button button-dark save-button" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "Saving…" : section === "shop-profile" ? "Save profile" : section === "notifications" ? "Save preferences" : section === "privacy-settings" ? "Save privacy settings" : "Save changes"}</button>
            </div>
          </form>
      </main>
    </div>
  );
}
