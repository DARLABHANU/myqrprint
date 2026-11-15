import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  Menu,
  Printer,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { AccountPage, ShopQrCodePage, ShopSettingsPage } from "./ShopWorkspace";
import { OrderManagementPage } from "./OrderManagementPage";
import { CustomerOrderPage } from "./CustomerOrderPage";
import { LegalPage } from "./LegalPage";
import { PublicMarketingPages } from "./PublicMarketingPages";
import { DashboardTools } from "./DashboardTools";
import { ReportsDashboardPage } from "./ReportsDashboardPage";
import { PrinterManagementPage } from "./PrinterManagementPage";
import { AuthFlowPage } from "./AuthFlowPage";
import { AdminSubscriptionReviewPage, SubscriptionPage } from "./SubscriptionPages";
import { AdminSettlementsPage } from "./AdminSettlementsPage";
import { ShopOverviewPage, ShopSupportPage, ShopWalletPage } from "./ShopPages";
import { ShopDashboardShell } from "./ShopDashboardShell";

function shopPage(page: ReactNode) {
  return <ShopDashboardShell>{page}</ShopDashboardShell>;
}

const steps = [
  {
    number: "01",
    title: "Put your QR on the counter",
    description:
      "Give every customer a simple way to send a print job from their phone.",
    icon: QrCode,
  },
  {
    number: "02",
    title: "They choose. You stay in control.",
    description:
      "Customers upload a file and see your price before placing an order.",
    icon: Smartphone,
  },
  {
    number: "03",
    title: "Print and hand over",
    description:
      "The online paid job prints through your agent when auto-print is on. Cash orders wait for your confirmation.",
    icon: Printer,
  },
];

const benefits = [
  "No app or account needed for your customers",
  "Razorpay checkout and counter cash",
  "Order uploads with clear retention controls",
  "Choose auto-print or approval, then track pickup",
];

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  useEffect(() => {
    console.log(`%c[PAGE NAV] Opened: ${path}`, "color: #9333ea; font-weight: 600;");
  }, [path]);
  const customerPage = /^\/p\/([^/]+)\/?$/.exec(path);
  if (customerPage) {
    let slug = customerPage[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      return <LandingPage />;
    }
    return <CustomerOrderPage slug={slug} />;
  }
  if (path === "/register") return <AccountPage mode="register" />;
  if (path === "/login") return <AccountPage mode="login" />;
  if (path === "/verify-email") return <AuthFlowPage flow="email" />;
  if (path === "/forgot-password") return <AuthFlowPage flow="forgot" />;
  if (path === "/reset-password") return <AuthFlowPage flow="reset" />;
  if (path === "/dashboard/settings") return shopPage(<ShopSettingsPage />);
  const shopSections: Record<string, string> = {
    "/dashboard/setting/page": "print-options",
    "/dashboard/setting/discount": "discounts",
    "/dashboard/setting/payment": "payment-settings",
    "/dashboard/setting/location": "location-lock",
    "/dashboard/setting/order-form": "customer-details",
    "/dashboard/setting/notifications": "notifications",
    "/dashboard/settings/profile": "shop-profile",
    "/dashboard/settings/security": "security-settings",
    "/dashboard/settings/privacy": "privacy-settings",
  };
  if (path === "/dashboard/qr-code") return shopPage(<ShopQrCodePage />);
  if (shopSections[path]) return shopPage(<ShopSettingsPage initialSection={shopSections[path]} />);
  if (path === "/dashboard") return shopPage(<ShopOverviewPage />);
  if (path === "/dashboard/support") return shopPage(<ShopSupportPage />);
  if (path === "/dashboard/wallet" || path === "/dashboard/withdraw" || path === "/dashboard/settlements") return shopPage(<ShopWalletPage />);
  if (path === "/dashboard/jobs") return shopPage(<OrderManagementPage />);
  if (path === "/dashboard/setting") return shopPage(<ShopSettingsPage />);
  if (path === "/dashboard/orders") return shopPage(<OrderManagementPage />);
  if (path === "/dashboard/payments") return shopPage(<DashboardTools kind="payments" />);
  if (path === "/dashboard/reports") return shopPage(<ReportsDashboardPage />);
  if (path === "/dashboard/printers") return shopPage(<PrinterManagementPage />);
  if (path === "/dashboard/subscription") return shopPage(<SubscriptionPage />);
  if (path === "/admin/subscriptions") return <AdminSubscriptionReviewPage />;
  if (path === "/admin/settlements") return <AdminSettlementsPage />;
  if (path === "/terms") return <LegalPage kind="terms" />;
  if (path === "/privacy-policy") return <LegalPage kind="privacy" />;
  if (path === "/refund-policy") return <PublicMarketingPages path={path} />;
  if (["/delivery-policy", "/features", "/how-it-works", "/pricing", "/faq", "/about", "/contact", "/partner", "/solutions", "/solutions/cyber-cafe", "/solutions/xerox-shop", "/solutions/csc-center", "/solutions/college-library"].includes(path)) return <PublicMarketingPages path={path} />;
  if (path !== "/") return <PublicMarketingPages path={path} />;
  return <LandingPage />;
}

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<"idle" | "checking" | "online" | "offline">(
    "idle",
  );

  async function checkApi() {
    setApiStatus("checking");
    try {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("API unavailable");
      setApiStatus("online");
    } catch {
      setApiStatus("offline");
    }
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="UrQrPrint home" onClick={closeMenu}>
          <span className="brand-mark"><QrCode size={21} strokeWidth={2.2} /></span>
          <span>UrQrPrint<span className="brand-period">.</span></span>
        </a>

        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>

        <nav className={`main-nav${menuOpen ? " is-open" : ""}`} aria-label="Main navigation">
          <a href="#how-it-works" onClick={closeMenu}>How it works</a>
          <a href="#features" onClick={closeMenu}>Features</a>
          <a href="#pricing" onClick={closeMenu}>Pricing</a>
          <a href="/solutions" onClick={closeMenu}>Solutions</a>
          <a href="#faq" onClick={closeMenu}>FAQ</a>
          <a href="#for-shops" onClick={closeMenu}>For print shops</a>
          <a className="nav-login" href="/login" onClick={closeMenu}>Log in</a>
          <a className="button button-dark nav-cta" href="/register" onClick={closeMenu}>
            Get started <ArrowUpRight size={16} />
          </a>
        </nav>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> Made for the modern print shop</div>
            <h1>Less time<br />taking orders.<br /><span>More control at pickup.</span></h1>
            <p className="hero-description">
              Customers send print orders from their phone and pay through Razorpay or at your counter. Your Windows agent prints verified online orders according to your auto-print setting.
            </p>
            <div className="hero-actions">
              <a className="button button-dark button-large" href="/register">
                Set up your shop <ArrowRight size={17} />
              </a>
              <a className="text-link" href="#how-it-works">
                See how it works <ArrowDown size={15} />
              </a>
            </div>
            <div className="hero-proof">
              <div className="proof-avatars" aria-hidden="true">
                <span>R</span><span>K</span><span>M</span><span>+</span>
              </div>
              <p><strong>A better counter experience</strong><br />For local shops and the people they serve</p>
            </div>
          </div>

          <div className="hero-visual" aria-label="Illustration of a customer sending a document to a print shop">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="floating-tag tag-top"><span className="tag-icon"><Smartphone size={16} /></span> No app needed</div>
            <div className="phone-card">
              <div className="phone-speaker" />
              <div className="phone-content">
                <div className="phone-shop"><span className="shop-avatar">P</span><span><b>Patel Print House</b><small>Print what you need</small></span><span className="online-dot" /></div>
                <div className="phone-welcome"><small>WELCOME TO YOUR LOCAL PRINT SHOP</small><b>What can we<br />print for you?</b></div>
                <div className="upload-card">
                  <span className="upload-icon"><FileText size={22} /></span>
                  <span><b>Project-notes.pdf</b><small>PDF document · 4 pages</small></span>
                  <Check className="upload-check" size={17} />
                </div>
                <div className="phone-options"><span>A4</span><span>B&W</span><span>Single-sided</span></div>
                <div className="phone-total"><span>Estimated total</span><b>₹20.00</b></div>
                <div className="phone-submit">Continue to payment <ArrowRight size={14} /></div>
                <div className="phone-secure"><ShieldCheck size={12} /> Used for this print order</div>
              </div>
            </div>
            <div className="floating-tag tag-bottom"><span className="tag-icon tag-green"><Zap size={16} /></span><span><b>New order received</b><small>4 pages · ₹20.00</small></span><span className="tag-live">NOW</span></div>
            <div className="visual-spark spark-one"><Sparkles size={18} /></div>
            <div className="visual-spark spark-two"><span>✳</span></div>
          </div>
        </section>

        <section className="trust-strip" aria-label="Product highlights">
          <span>MADE FOR INDEPENDENT PRINT SHOPS</span>
          <div className="trust-items">
            <span><Check size={15} /> No customer app</span>
            <i />
            <span><Check size={15} /> Razorpay checkout or cash at counter</span>
            <i />
            <span><Check size={15} /> Choose auto-print or approval</span>
          </div>
        </section>

        <section className="steps-section" id="how-it-works">
          <div className="section-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> A simpler way to take orders</div>
              <h2>From scan to order.<br /><span>Without the back-and-forth.</span></h2>
            </div>
            <p>One easy flow for your customers. A clearer queue for you. No more chasing files across chats.</p>
          </div>
          <div className="steps-grid">
            {steps.map(({ number, title, description, icon: Icon }) => (
              <article className="step-card" key={number}>
                <div className="step-top"><span>{number}</span><Icon size={21} strokeWidth={1.7} /></div>
                <h3>{title}</h3>
                <p>{description}</p>
                <a href="#get-started" aria-label={`Learn more: ${title}`}><ArrowUpRight size={17} /></a>
              </article>
            ))}
          </div>
        </section>

        <section className="control-section" id="features">
          <div className="control-visual" aria-hidden="true">
            <div className="control-window">
              <div className="window-top"><span /><span /><span /><b>Today’s orders</b><small>● Shop online</small></div>
              <div className="queue-summary"><span><small>NEW ORDERS</small><b>03</b></span><span><small>AWAITING PAYMENT</small><b>02</b></span><span><small>PRINT QUEUE</small><b>01</b></span></div>
              <div className="queue-row"><span className="file-thumb"><FileText size={17} /></span><span><b>Assignment-final.pdf</b><small>4 pages · A4 B&W</small></span><strong>₹20</strong><span className="status-pill">Review</span></div>
              <div className="queue-row"><span className="file-thumb image-thumb"><span>IMG</span></span><span><b>passport-photo.jpg</b><small>2 copies · 4 × 6 layout</small></span><strong>₹40</strong><span className="status-pill status-green">Paid</span></div>
              <div className="queue-row"><span className="file-thumb"><FileText size={17} /></span><span><b>Form-2026.pdf</b><small>2 pages · A4 colour</small></span><strong>₹30</strong><span className="status-pill status-muted">Cash</span></div>
              <div className="queue-footer"><ShieldCheck size={14} /> Files are removed according to your shop’s privacy settings</div>
            </div>
            <div className="control-deco deco-a" />
            <div className="control-deco deco-b" />
          </div>
          <div className="control-copy" id="for-shops">
            <div className="eyebrow"><span className="eyebrow-dot" /> Your shop. Your rules.</div>
            <h2>You’re the one<br />in <span>control.</span></h2>
            <p>Simple tools to take orders on your terms. No surprises for you or your customers.</p>
            <ul>{benefits.map((benefit) => <li key={benefit}><span><Check size={13} /></span>{benefit}</li>)}</ul>
            <a className="text-link control-link" href="#get-started">Explore the shop dashboard <ArrowRight size={15} /></a>
          </div>
        </section>

        <section className="marketing-pricing-section" id="pricing">
          <div className="marketing-section-heading">
            <div className="eyebrow"><span className="eyebrow-dot" /> Clear pricing, your way</div>
            <h2>Plans for every<br /><span>print counter.</span></h2>
            <p>Start with a 7-day trial, then choose a shop plan as your customer orders grow.</p>
          </div>
          <div className="marketing-pricing-card">
            <div><span className="pricing-card-kicker">SHOP PLANS</span><h3>₹50 monthly or ₹500 yearly</h3><p>Start with a 7-day trial for up to 50 print orders. Annual billing saves ₹100.</p></div>
            <ul><li><Check size={15} /> Plan duration and order quota shown before activation</li><li><Check size={15} /> Subscription payments are separate from customer print orders</li><li><Check size={15} /> Admin reviews subscription payment references</li></ul>
            <a className="button button-dark" href="/pricing">Subscription details <ArrowRight size={15} /></a>
            <small>Customer online payments use Razorpay when enabled; cash is collected by the shop.</small>
          </div>
        </section>

        <section className="marketing-faq-section" id="faq">
          <div className="marketing-section-heading">
            <div className="eyebrow"><span className="eyebrow-dot" /> Frequently asked</div>
            <h2>A few things<br /><span>worth knowing.</span></h2>
          </div>
          <div className="marketing-faq-list">
            <details><summary>How do customer payments work?</summary><p>When enabled, online print orders are paid through UrQrPrint’s Razorpay checkout and confirmed by the gateway. Cash-at-counter orders are paid directly to the shop and wait for the shopkeeper to confirm collection.</p></details>
            <details><summary>Who sets the print prices?</summary><p>You configure prices by paper size, colour, and single- or double-sided printing. The server calculates the customer’s quote from those saved rates.</p></details>
            <details><summary>What files can customers upload?</summary><p>Customers can submit PDF documents or JPG, PNG, and WEBP photos. Files are validated and limited to 10 files at up to 25 MB per file. Order-specific file links are used for preview and printing; avoid uploading highly sensitive documents.</p></details>
            <details><summary>How long are uploaded files retained?</summary><p>Each shop sets a pending-file retention period in its settings. Files for active jobs remain available until the order is completed or cancelled.</p></details>
            <details><summary>How does printing work?</summary><p>The shop’s Windows agent must be running, signed in, and set online. Paid Razorpay jobs can print automatically when the shop has enabled auto-print; otherwise the shop must approve them. Cash orders wait for payment confirmation.</p></details>
            <details><summary>How are shops paid?</summary><p>Razorpay customer collections are settled separately by the platform administrator to the shop’s saved settlement details. Shops confirm receipt after verifying the transfer. See the Terms and Refund Policy for details.</p></details>
            <details><summary>Are shop subscriptions available?</summary><p>Yes. Shops can view the available plan, price, duration, and order limit on the subscription page. Subscription payment and activation are separate from customer print-order payments.</p></details>
            <details><summary>How do I request a refund?</summary><p>See the Refund and Cancellation Policy. Cancelling an order does not automatically refund a captured Razorpay payment.</p></details>
          </div>
        </section>

        <section className="marketing-contact-section" id="contact">
          <div><div className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Need help?</div><h2>For a print order,<br /><span>talk to the shop.</span></h2><p>UrQrPrint sends orders to the local shop you selected. Use the contact details on that shop’s page for pickup or payment questions.</p></div>
          <a className="button button-light button-large" href="/register">Set up your shop <ArrowRight size={16} /></a>
          <small>For platform inquiries, visit the <a href="/contact">Contact and support page</a>.</small>
        </section>

        <section className="closing-section" id="get-started">
          <div className="closing-pattern" aria-hidden="true" />
          <div className="closing-content">
            <div className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Your next print order starts here</div>
            <h2>Make room for<br /><span>better business.</span></h2>
            <p>Bring your print orders into one clear, easy-to-manage place.</p>
            <a className="button button-light button-large" href="/register">
            Set up your shop <ArrowRight size={17} />
            </a>
            <button className="api-check" type="button" onClick={checkApi} disabled={apiStatus === "checking"}>
              {apiStatus === "checking" ? "Checking local API…" : apiStatus === "online" ? "Local API connected" : apiStatus === "offline" ? "Local API unavailable" : "Check local API connection"}
            </button>
          </div>
          <div className="closing-art" aria-hidden="true">
            <div className="closing-ring ring-a" /><div className="closing-ring ring-b" />
            <div className="closing-printer"><div className="printer-top"><div className="printer-light" /><span>UrQrPrint.</span></div><div className="printer-paper"><div /><div /><div /><div /></div><div className="printer-slot" /><div className="printer-base"><div className="printer-button" /><span /></div></div>
            <div className="paper-float"><FileText size={25} /><span>READY TO PRINT</span><b>See you at the counter.</b></div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="/" aria-label="UrQrPrint home"><span className="brand-mark"><QrCode size={18} /></span><span>UrQrPrint<span className="brand-period">.</span></span></a>
        <span>Thoughtful tools for your local print shop.</span>
        <nav className="site-footer-links" aria-label="Footer navigation"><a href="/features">Features</a><a href="/how-it-works">How it works</a><a href="/pricing">Pricing</a><a href="/solutions">Solutions</a><a href="/printing-software">Print by city</a><a href="/blog">Guides</a><a href="/faq">FAQ</a><a href="/about">About</a><a href="/contact">Contact</a><a href="/partner">Partner</a><a href="/terms">Terms</a><a href="/privacy-policy">Privacy</a><a href="/refund-policy">Refund policy</a><a href="/delivery-policy">Delivery policy</a></nav>
        <span>© {new Date().getFullYear()} UrQrPrint</span>
      </footer>
    </div>
  );
}
