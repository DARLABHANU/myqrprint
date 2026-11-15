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
  Wallet,
  X,
} from "lucide-react";

type ShopSummary = {
  displayName: string;
  isOnline: boolean;
  agentOnline?: boolean;
  notificationPreferences?: { newOrder: boolean; printFailed: boolean; uploadSound: boolean; customerUploadVoice: boolean; dailyEmail: boolean };
  subscriptionPlan?: string;
  subscriptionExpiresAt?: string;
  subscriptionOrderLimit?: number;
  subscriptionOrdersUsed?: number;
};
type AccountSummary = { ownerName: string; email: string };
type OrderStatus = {
  id?: string;
  _id?: string;
  code: string;
  status: string;
  paymentMethod: "upi" | "cash" | "pay_here" | "razorpay";
  paymentStatus: "unverified" | "awaiting_cash" | "paid";
};

type SeenOrderState = { status: string; notificationEligible: boolean };

function isNewOrderNotificationEligible(order: OrderStatus): boolean {
  if (order.paymentMethod === "cash" && order.status === "awaiting_cash") return true;
  return order.paymentStatus === "paid" && !["cancelled", "rejected", "expired"].includes(order.status);
}

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
    { title: "Daily settlements", href: "/dashboard/settlements", icon: Wallet },
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
  if (path.endsWith("/withdraw") || path.endsWith("/wallet") || path.endsWith("/settlements")) return "Daily settlements";
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
  const isDesktopAgent = typeof window !== "undefined" && Boolean(window.printly);
  // The website remains read-only for printer and order operations, but the
  // shopkeeper must be able to acknowledge an admin settlement from any device.
  const canConfirmSettlementOnWeb = path === "/dashboard/settlements";
  const [shop, setShop] = useState<ShopSummary | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const seenOrders = useRef<Map<string, SeenOrderState> | null>(null);
  const preferencesRef = useRef(shop?.notificationPreferences);
  preferencesRef.current = shop?.notificationPreferences;

  useEffect(() => {
    void Promise.all([
      json<{ shop: ShopSummary; agentOnline?: boolean }>("/api/shops/me"),
      json<{ user: AccountSummary }>("/api/auth/me"),
    ]).then(async ([shopResponse, accountResponse]) => {
      setShop({ ...shopResponse.shop, agentOnline: Boolean(shopResponse.agentOnline) });
      setAccount(accountResponse.user);
      if (window.printly) {
        const status = await window.printly.getStatus();
        if (!status.connected) {
          if (!window.printly.connect) throw new Error("This desktop app is outdated. Install the latest UrQrPrint desktop app to connect with your shop login.");
          await window.printly.connect();
          const refreshedShop = await json<{ shop: ShopSummary; agentOnline?: boolean }>("/api/shops/me");
          setShop({ ...refreshedShop.shop, agentOnline: Boolean(refreshedShop.agentOnline) });
        }
      }
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
        const [response, shopResponse] = await Promise.all([
          json<{ orders: OrderStatus[] }>("/api/shops/orders"),
          json<{ shop: ShopSummary; agentOnline?: boolean }>("/api/shops/me"),
        ]);
        if (!mounted) return;
        setShop({ ...shopResponse.shop, agentOnline: Boolean(shopResponse.agentOnline) });
        const current = new Map(response.orders.map((order) => [order.code, {
          status: order.status,
          notificationEligible: isNewOrderNotificationEligible(order),
        }]));
        if (seenOrders.current) {
          const preferences = preferencesRef.current;
          const newlyCreated = response.orders.filter((order) =>
            isNewOrderNotificationEligible(order) && !seenOrders.current?.get(order.code)?.notificationEligible,
          );
          const newlyFailed = response.orders.filter((order) => seenOrders.current?.get(order.code)?.status !== "failed" && order.status === "failed");
          const messages = [
            ...(newlyCreated.length && preferences?.newOrder ? [`${newlyCreated.length} new print job${newlyCreated.length === 1 ? "" : "s"}: ${newlyCreated.map((order) => `#${order.code}`).join(", ")}`] : []),
            ...(newlyFailed.length && preferences?.printFailed ? [`${newlyFailed.length} print job${newlyFailed.length === 1 ? "" : "s"} failed: ${newlyFailed.map((order) => `#${order.code}`).join(", ")}`] : []),
          ];
          if (messages.length) {
            const message = messages.join(" · ");
            setAlertMessage(message);
            window.setTimeout(() => setAlertMessage((currentMessage) => currentMessage === message ? "" : currentMessage), 8000);
            if ("Notification" in window && Notification.permission === "granted") new Notification("UrQrPrint · Shop alert", { body: message });
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

  useEffect(() => {
    let mounted = true;
    const refreshAgentState = async () => {
      try {
        const result = await json<{ shop: ShopSummary; agentOnline?: boolean }>("/api/shops/me");
        if (mounted) setShop({ ...result.shop, agentOnline: Boolean(result.agentOnline) });
      } catch { /* The dashboard remains readable and individual pages show API failures. */ }
    };
    void refreshAgentState();
    const timer = window.setInterval(() => void refreshAgentState(), 10_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  async function toggleOnline() {
    if (!shop || !isDesktopAgent || !shop.agentOnline || !window.printly?.setShopOnline) return;
    setBusy(true); setError("");
    try {
      const result = await window.printly.setShopOnline(!shop.isOnline);
      setShop({ ...shop, isOnline: result.isOnline, agentOnline: result.agentOnline });
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
    try {
      if (window.printly) await window.printly.disconnect();
      await json<void>("/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); setBusy(false); }
  }

  const isSettingRoute = path === "/dashboard/setting" || path.startsWith("/dashboard/setting/");
  const settingTabs = isSettingRoute ? [
    ["Page setting", "/dashboard/setting/page"], ["Discount setting", "/dashboard/setting/discount"], ["Payment setting", "/dashboard/setting/payment"],
    ["Location lock", "/dashboard/setting/location"], ["Order form", "/dashboard/setting/order-form"], ["Notifications", "/dashboard/setting/notifications"],
  ] : path.includes("/dashboard/settings") ? [
    ["Shop profile", "/dashboard/settings/profile"], ["Account & security", "/dashboard/settings/security"], ["Privacy", "/dashboard/settings/privacy"],
  ] : [];

  const planTitle = !shop?.subscriptionPlan || shop.subscriptionPlan === "demo"
    ? "Free Trial"
    : shop.subscriptionPlan === "starter"
      ? "UrQrPrint Plan"
      : shop.subscriptionPlan === "pro"
        ? "Pro Plan"
        : "Enterprise";

  const daysLeft = shop?.subscriptionExpiresAt
    ? Math.max(0, Math.ceil((new Date(shop.subscriptionExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 5;

  const daysBarPercent = Math.min(100, Math.max(8, (daysLeft / 7) * 100));
  const maxOrders = shop?.subscriptionOrderLimit ?? 50;
  const usedOrders = shop?.subscriptionOrdersUsed ?? 4;
  const ordersBarPercent = maxOrders > 0 ? Math.min(100, Math.max(6, (usedOrders / maxOrders) * 100)) : 0;
  const shopAcceptingOrders = Boolean(shop?.isOnline && shop?.agentOnline);

  return <div className={`shop-dashboard-shell${sidebarCollapsed ? " is-collapsed" : ""}${isDesktopAgent ? " is-desktop-agent" : " is-web-readonly"}`} style={{ gridTemplateColumns: sidebarCollapsed ? "72px minmax(0,1fr)" : "244px minmax(0,1fr)", transition: "grid-template-columns 0.2s ease" }}>
    <aside className={`shop-dashboard-sidebar${mobileNavOpen ? " is-open" : ""}${sidebarCollapsed ? " is-collapsed" : ""}`} style={{ width: sidebarCollapsed ? 72 : 244, transition: "width 0.2s ease", padding: sidebarCollapsed ? "17px 8px 12px" : "17px 14px 12px" }}>
      <a className="shop-dashboard-brand" href="/dashboard" style={{ justifyContent: sidebarCollapsed ? "center" : "flex-start", padding: sidebarCollapsed ? 0 : "0 10px" }}><span className="brand-mark"><QrCode size={19} /></span>{!sidebarCollapsed && <b>UrQrPrint</b>}</a>
      <button className="shop-sidebar-close" type="button" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
      <div className="shop-sidebar-identity" style={{ padding: sidebarCollapsed ? "8px 0" : "10px 8px", justifyContent: sidebarCollapsed ? "center" : "flex-start" }}><span className="shop-sidebar-avatar"><Store size={17} /></span>{!sidebarCollapsed && <div><b>{shop?.displayName ?? "Your print shop"}</b><small>{shopAcceptingOrders ? "Shop online" : "Shop offline"}</small></div>}</div>
      {navGroups.map((group) => <nav className="shop-sidebar-group" key={group.label} aria-label={group.label === "MAIN" ? "Main" : "Shop"}>
        {!sidebarCollapsed && <p>{group.label}</p>}
        {group.links.map(({ title, href, icon: Icon }) => <a className={`shop-sidebar-link${pathIsActive(path, href) ? " active" : ""}`} href={href} key={title} aria-current={pathIsActive(path, href) ? "page" : undefined} title={sidebarCollapsed ? title : undefined} style={{ justifyContent: sidebarCollapsed ? "center" : "flex-start", padding: sidebarCollapsed ? "0" : "0 10px" }} onClick={() => setMobileNavOpen(false)}><Icon size={17} />{!sidebarCollapsed && <span>{title}</span>}</a>)}
      </nav>)}

      {/* Free Demo / Subscription Card */}
      {!sidebarCollapsed ? (
        <div
          style={{
            marginTop: "auto",
            background: "linear-gradient(135deg, #b85208 0%, #9e4003 100%)",
            borderRadius: 14,
            padding: "14px 16px 14px",
            color: "#ffffff",
            boxShadow: "0 4px 14px rgba(184, 82, 8, 0.22)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <b style={{ fontSize: 16, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.2px" }}>
              {planTitle}
            </b>
            <a
              href="/dashboard/subscription"
              style={{
                background: "#ffffff",
                color: "#0f172a",
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 12px",
                borderRadius: 6,
                textDecoration: "none",
                display: "inline-block",
                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
              }}
            >
              Renew
            </a>
          </div>

          {/* Days left */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: "rgba(255, 255, 255, 0.95)", fontWeight: 500 }}>Days left</span>
              <span style={{ fontWeight: 700, color: "#ffffff", fontSize: 13 }}>{daysLeft}</span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: "rgba(255, 255, 255, 0.28)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: 999,
                  background: "#ffffff",
                  width: `${daysBarPercent}%`,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {/* Print orders */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: "rgba(255, 255, 255, 0.95)", fontWeight: 500 }}>Print orders</span>
              <span style={{ fontWeight: 700, color: "#ffffff", fontSize: 13 }}>
                {usedOrders} / {maxOrders > 0 ? maxOrders : "Unlimited"}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: "rgba(255, 255, 255, 0.28)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: 999,
                  background: "#ffffff",
                  width: `${ordersBarPercent}%`,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <a
          href="/dashboard/subscription"
            title={`${planTitle} · ${daysLeft} days left · ${usedOrders}/${maxOrders > 0 ? maxOrders : "Unlimited"} orders`}
          style={{
            marginTop: "auto",
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "#b85208",
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            margin: "auto auto 0",
            fontSize: 11,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          {daysLeft}d
        </a>
      )}

      {/* Footer under card: Collapse & Version */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: sidebarCollapsed ? "center" : "space-between",
          padding: sidebarCollapsed ? "12px 0 2px" : "12px 4px 2px",
          color: "#94a3b8",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          style={{
            background: "transparent",
            border: "none",
            color: "#64748b",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {sidebarCollapsed ? "»" : "« Collapse"}
        </button>
        {!sidebarCollapsed && <span style={{ color: "#94a3b8", fontSize: 11 }}>V1.0.2</span>}
      </div>
    </aside>
    {mobileNavOpen && <button className="shop-sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
    <div className="shop-dashboard-workarea">
      <header className="shop-dashboard-topbar">
        <button className="shop-menu-toggle" type="button" aria-label="Open menu" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((current) => !current)}><Menu size={19} /></button>
        <div className="shop-page-identity"><b>{pageTitle(path)}</b><span>{shop?.displayName ?? "Shop workspace"}</span></div>
        <div className="shop-dashboard-actions">
          <button className={`shop-alert-toggle${shop?.notificationPreferences?.newOrder ? " enabled" : ""}`} type="button" disabled={!isDesktopAgent || !shop || busy} aria-label={shop?.notificationPreferences?.newOrder ? "Turn off new order alert" : "Turn on new order alert"} aria-pressed={Boolean(shop?.notificationPreferences?.newOrder)} onClick={() => void toggleOrderAlert()}>{shop?.notificationPreferences?.newOrder ? <Bell size={17} /> : <BellOff size={17} />}</button>
          <button className={`shop-online-switch${shopAcceptingOrders ? " is-online" : ""}`} type="button" role="switch" aria-checked={shopAcceptingOrders} disabled={!isDesktopAgent || !shop?.agentOnline || busy} title={!isDesktopAgent ? "Shop status can be changed in the desktop agent." : !shop?.agentOnline ? "Connect the desktop agent to change shop status." : undefined} onClick={() => void toggleOnline()}><i />{shopAcceptingOrders ? "Shop online" : "Shop offline"}</button>
          <div className="shop-account-menu-wrap">
            <button className="shop-account-menu-button" type="button" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((current) => !current)}><span>{(account?.ownerName ?? "P").slice(0, 1).toUpperCase()}</span><b>{account?.ownerName ?? "Account"}<small>{shop?.displayName ?? account?.email ?? ""}</small></b><ChevronDown size={14} /></button>
            {accountMenuOpen && <div className="shop-account-popover"><a href="/dashboard/settings/profile" onClick={() => setAccountMenuOpen(false)}>My profile</a><a href="/dashboard/settings/security" onClick={() => setAccountMenuOpen(false)}>Account & security</a><a href="/dashboard/subscription" onClick={() => setAccountMenuOpen(false)}>My subscription</a>{account?.email?.toLowerCase() === "daarlabhanumurthy@gmail.com" && <a href="/admin/subscriptions" onClick={() => setAccountMenuOpen(false)} style={{ color: "#078c68", fontWeight: 700 }}>Admin subscriptions</a>}<button type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={14} /> Sign out</button></div>}
          </div>
        </div>
      </header>
      <main className="shop-dashboard-content">
        {error && <div className="shop-shell-error" role="alert">{error}</div>}
        {loading && <div className="shop-shell-loading" aria-hidden="true" />}
        {!isDesktopAgent && <div role="status" style={{ margin: "0 0 16px", padding: "12px 16px", border: "1px solid #cfe8df", borderRadius: 12, background: "#effaf5", color: "#315f50", fontSize: 13, lineHeight: 1.5 }}><b>Read-only dashboard.</b> Manage printers, print jobs, and shop availability in the UrQrPrint desktop agent. Customers can place orders only while the agent is connected and the shop is set online there.</div>}
        <div className={`shop-dashboard-inner${settingTabs.length ? " has-setting-tabs" : ""}`}>
          {settingTabs.length > 0 && <nav className="shop-settings-tabs" aria-label={isSettingRoute ? "Setting" : "My Profile"}>{settingTabs.map(([label, href]) => <a key={href} className={path === href || (href.endsWith("/page") && path === "/dashboard/setting") || (href.endsWith("/profile") && path === "/dashboard/settings") ? "active" : ""} href={href}>{label}</a>)}</nav>}
          <fieldset className="shop-dashboard-view-fieldset" disabled={!isDesktopAgent && !canConfirmSettlementOnWeb} style={{ border: 0, margin: 0, minWidth: 0, padding: 0, width: "100%" }}><div className="shop-dashboard-view">{children}</div></fieldset>
        </div>
      </main>
    </div>
    {alertMessage && <div className="shop-dashboard-toast" role="status">{alertMessage}</div>}
  </div>;
}
