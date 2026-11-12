import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  BellOff,
  ChevronDown,
  CreditCard,
  HelpCircle,
  LogOut,
  Menu,
  QrCode,
  Settings,
  Store,
  X,
} from "lucide-react";

type ShopSummary = {
  displayName: string;
  isOnline: boolean;
  notificationPreferences?: { newOrder: boolean; printFailed: boolean; uploadSound: boolean; customerUploadVoice: boolean; dailyEmail: boolean };
};
type AccountSummary = { ownerName: string; email: string };
type OrderStatus = { id?: string; _id?: string; code: string; status: string };

const navGroups = [
  { label: "MAIN", links: [
    { title: "Overview", href: "/dashboard", icon: Store },
    { title: "Print jobs", href: "/dashboard/orders", icon: QrCode },
    { title: "Payments", href: "/dashboard/payments", icon: CreditCard },
    { title: "Printers", href: "/dashboard/printers", icon: Settings },
    { title: "Reports", href: "/dashboard/reports", icon: BarChart3 },
  ] },
  { label: "SHOP", links: [
    { title: "My QR code", href: "/dashboard/qr-code", icon: QrCode },
    { title: "My subscription", href: "/dashboard/subscription", icon: CreditCard },
    { title: "Setting", href: "/dashboard/setting/page", icon: Settings },
    { title: "My Profile", href: "/dashboard/settings/profile", icon: Store },
    { title: "Help & support", href: "/dashboard/support", icon: HelpCircle },
  ] },
];

function pageTitle(path: string) {
  if (path === "/dashboard" || path === "") return "Overview";
  if (path.includes("/dashboard/settings")) return "My Profile";
  if (path.includes("/dashboard/setting")) return "Setting";
  if (path.endsWith("/support")) return "Help & support";
  if (/\/orders?$|\/jobs$/.test(path)) return "Print jobs";
  if (path.endsWith("/payments")) return "Payments";
  if (path.endsWith("/printers")) return "Printers";
  if (path.endsWith("/withdraw") || path.endsWith("/wallet")) return "Payment records";
  if (path.endsWith("/reports")) return "Reports";
  if (path.endsWith("/qr-code")) return "My QR code";
  if (path.endsWith("/subscription")) return "My subscription";
  if (path.includes("/settings")) return "My Profile";
  if (path.includes("/setting")) return "Setting";
  if (path.endsWith("/support")) return "Help & support";
  return "Shop";
}

function pathIsActive(path: string, href: string) {
  if (href === "/dashboard") return path === href;
  if (href === "/dashboard/setting/page") return path === "/dashboard/setting" || path.startsWith("/dashboard/setting/");
  if (href === "/dashboard/settings/profile") return path === "/dashboard/settings" || path.startsWith("/dashboard/settings/");
  return path === href || (href === "/dashboard/orders" && path.endsWith("/jobs"));
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined) as T | undefined;
  if (response.status === 401) { window.location.assign("/login"); throw new Error("Sign in required."); }
  if (!response.ok) throw new Error((body as { error?: string } | undefined)?.error ?? `Request failed (${response.status}).`);
  return body as T;
}

export function ShopDashboardShell({ children }: { children: ReactNode }) {
  const path = window.location.pathname.replace(/\/$/, "") || "/dashboard";
  const [shop, setShop] = useState<ShopSummary | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const seenOrders = useRef<Map<string, string> | null>(null);
  const preferencesRef = useRef(shop?.notificationPreferences);
  preferencesRef.current = shop?.notificationPreferences;

  useEffect(() => {
    void Promise.all([
      json<{ shop: ShopSummary }>("/api/shops/me"),
      json<{ user: AccountSummary }>("/api/auth/me"),
    ]).then(([shopResponse, accountResponse]) => {
      setShop(shopResponse.shop);
      setAccount(accountResponse.user);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load your shop."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const updateProfile = (event: Event) => {
      const detail = (event as CustomEvent<{ ownerName: string; displayName: string }>).detail;
      if (detail?.ownerName) setAccount((current) => current ? { ...current, ownerName: detail.ownerName } : current);
      if (detail?.displayName) setShop((current) => current ? { ...current, displayName: detail.displayName } : current);
    };
    window.addEventListener("printly:profile-updated", updateProfile);
    return () => window.removeEventListener("printly:profile-updated", updateProfile);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function pollOrders() {
      try {
        const response = await json<{ orders: OrderStatus[] }>("/api/shops/orders");
        if (!mounted) return;
        const current = new Map(response.orders.map((order) => [order.code, order.status]));
        if (seenOrders.current) {
          const preferences = preferencesRef.current;
          const newlyCreated = response.orders.filter((order) => !seenOrders.current?.has(order.code));
          const newlyFailed = response.orders.filter((order) => seenOrders.current?.get(order.code) !== "failed" && order.status === "failed");
          const messages = [
            ...(newlyCreated.length && preferences?.newOrder ? [`${newlyCreated.length} new print job${newlyCreated.length === 1 ? "" : "s"}: ${newlyCreated.map((order) => `#${order.code}`).join(", ")}`] : []),
            ...(newlyFailed.length && preferences?.printFailed ? [`${newlyFailed.length} print job${newlyFailed.length === 1 ? "" : "s"} failed: ${newlyFailed.map((order) => `#${order.code}`).join(", ")}`] : []),
          ];
          if (messages.length) {
            const message = messages.join(" · ");
            setAlertMessage(message);
            window.setTimeout(() => setAlertMessage((currentMessage) => currentMessage === message ? "" : currentMessage), 8000);
            if ("Notification" in window && Notification.permission === "granted") new Notification("Printly · Shop alert", { body: message });
            if ("speechSynthesis" in window) {
              const phrases = [
                ...(newlyCreated.length && preferences?.newOrder ? ["New order received."] : []),
                ...(newlyFailed.length && preferences?.printFailed ? ["Print failed. Please check the printer."] : []),
              ];
              if (phrases.length) {
                window.speechSynthesis.cancel();
                const announcement = new SpeechSynthesisUtterance(phrases.join(" "));
                announcement.lang = "en-IN";
                window.speechSynthesis.speak(announcement);
              }
            }
            if ((newlyCreated.length && preferences?.uploadSound) || (newlyFailed.length && preferences?.printFailed)) {
              try {
                const AudioContextType = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
                if (AudioContextType) {
                  const audio = new AudioContextType(); const oscillator = audio.createOscillator(); const gain = audio.createGain();
                  oscillator.frequency.value = 880; gain.gain.value = 0.08; oscillator.connect(gain); gain.connect(audio.destination);
                  oscillator.onended = () => { void audio.close(); }; oscillator.start(); oscillator.stop(audio.currentTime + 0.18);
                }
              } catch { /* Sound may be unavailable until the browser has been interacted with. */ }
            }
          }
        }
        seenOrders.current = current;
      } catch { /* Individual pages show their own loading and API errors. */ }
    }
    void pollOrders();
    const timer = window.setInterval(() => void pollOrders(), 30_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  async function toggleOnline() {
    if (!shop) return;
    setBusy(true); setError("");
    try {
      const result = await json<{ isOnline: boolean }>("/api/shops/online", { method: "PATCH", body: JSON.stringify({ isOnline: !shop.isOnline }) });
      setShop({ ...shop, isOnline: result.isOnline });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update shop status."); }
    finally { setBusy(false); }
  }

  async function toggleOrderAlert() {
    if (!shop) return;
    const enabled = !shop.notificationPreferences?.newOrder;
    if (enabled && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    setBusy(true); setError("");
    try {
      const result = await json<{ notificationPreferences: NonNullable<ShopSummary["notificationPreferences"]> }>("/api/shops/notifications", { method: "PATCH", body: JSON.stringify({ newOrder: enabled }) });
      setShop({ ...shop, notificationPreferences: result.notificationPreferences });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update alert settings."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setError("");
    try { await json<void>("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); setBusy(false); }
  }

  const isSettingRoute = path === "/dashboard/setting" || path.startsWith("/dashboard/setting/");
  const settingTabs = isSettingRoute ? [
    ["Page setting", "/dashboard/setting/page"], ["Discount setting", "/dashboard/setting/discount"], ["Payment setting", "/dashboard/setting/payment"],
    ["Location lock", "/dashboard/setting/location"], ["Order form", "/dashboard/setting/order-form"], ["Notifications", "/dashboard/setting/notifications"],
  ] : path.includes("/dashboard/settings") ? [
    ["Shop profile", "/dashboard/settings/profile"], ["Account & security", "/dashboard/settings/security"], ["Privacy", "/dashboard/settings/privacy"],
  ] : [];

  return <div className="shop-dashboard-shell">
    <aside className={`shop-dashboard-sidebar${mobileNavOpen ? " is-open" : ""}`}>
      <a className="shop-dashboard-brand" href="/dashboard"><span className="brand-mark"><QrCode size={19} /></span><b>Printly</b></a>
      <button className="shop-sidebar-close" type="button" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
      <div className="shop-sidebar-identity"><span className="shop-sidebar-avatar"><Store size={17} /></span><div><b>{shop?.displayName ?? "Your print shop"}</b><small>{shop?.isOnline ? "Shop online" : "Shop offline"}</small></div></div>
      {navGroups.map((group) => <nav className="shop-sidebar-group" key={group.label} aria-label={group.label === "MAIN" ? "Main" : "Shop"}>
        <p>{group.label}</p>
        {group.links.map(({ title, href, icon: Icon }) => <a className={`shop-sidebar-link${pathIsActive(path, href) ? " active" : ""}`} href={href} key={title} aria-current={pathIsActive(path, href) ? "page" : undefined} onClick={() => setMobileNavOpen(false)}><Icon size={17} /><span>{title}</span></a>)}
      </nav>)}
      <a className="shop-plan-summary" href="/dashboard/subscription"><b>My Subscription</b><span>View plans & quota</span><small>Manage your shop order capacity.</small></a>
      <small className="shop-sidebar-version">PRINTLY · SHOP WORKSPACE</small>
    </aside>
    {mobileNavOpen && <button className="shop-sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
    <div className="shop-dashboard-workarea">
      <header className="shop-dashboard-topbar">
        <button className="shop-menu-toggle" type="button" aria-label="Open menu" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((current) => !current)}><Menu size={19} /></button>
        <div className="shop-page-identity"><b>{pageTitle(path)}</b><span>{shop?.displayName ?? "Shop workspace"}</span></div>
        <div className="shop-dashboard-actions">
          <button className={`shop-alert-toggle${shop?.notificationPreferences?.newOrder ? " enabled" : ""}`} type="button" disabled={!shop || busy} aria-label={shop?.notificationPreferences?.newOrder ? "Turn off new order alert" : "Turn on new order alert"} aria-pressed={Boolean(shop?.notificationPreferences?.newOrder)} onClick={() => void toggleOrderAlert()}>{shop?.notificationPreferences?.newOrder ? <Bell size={17} /> : <BellOff size={17} />}</button>
          <button className={`shop-online-switch${shop?.isOnline ? " is-online" : ""}`} type="button" role="switch" aria-checked={Boolean(shop?.isOnline)} disabled={!shop || busy} onClick={() => void toggleOnline()}><i />{shop?.isOnline ? "Shop online" : "Shop offline"}</button>
          <div className="shop-account-menu-wrap">
            <button className="shop-account-menu-button" type="button" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((current) => !current)}><span>{(account?.ownerName ?? "P").slice(0, 1).toUpperCase()}</span><b>{account?.ownerName ?? "Account"}<small>{shop?.displayName ?? account?.email ?? ""}</small></b><ChevronDown size={14} /></button>
            {accountMenuOpen && <div className="shop-account-popover"><a href="/dashboard/settings/profile" onClick={() => setAccountMenuOpen(false)}>My profile</a><a href="/dashboard/settings/security" onClick={() => setAccountMenuOpen(false)}>Account & security</a><a href="/dashboard/subscription" onClick={() => setAccountMenuOpen(false)}>My subscription</a>{account?.email?.toLowerCase() === "daarlabhanumurthy@gmail.com" && <a href="/admin/subscriptions" onClick={() => setAccountMenuOpen(false)} style={{ color: "#078c68", fontWeight: 700 }}>Admin subscriptions</a>}<button type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={14} /> Sign out</button></div>}
          </div>
        </div>
      </header>
      <main className="shop-dashboard-content">
        {error && <div className="shop-shell-error" role="alert">{error}</div>}
        {loading && <div className="shop-shell-loading" aria-hidden="true" />}
        <div className={`shop-dashboard-inner${settingTabs.length ? " has-setting-tabs" : ""}`}>
          {settingTabs.length > 0 && <nav className="shop-settings-tabs" aria-label={isSettingRoute ? "Setting" : "My Profile"}>{settingTabs.map(([label, href]) => <a key={href} className={path === href || (href.endsWith("/page") && path === "/dashboard/setting") || (href.endsWith("/profile") && path === "/dashboard/settings") ? "active" : ""} href={href}>{label}</a>)}</nav>}
          <div className="shop-dashboard-view">{children}</div>
        </div>
      </main>
    </div>
    {alertMessage && <div className="shop-dashboard-toast" role="status">{alertMessage}</div>}
  </div>;
}
