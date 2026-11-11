import { useState, type ReactNode } from "react";
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
import { AccountPage, ShopSettingsPage } from "./ShopWorkspace";
import { OrderManagementPage } from "./OrderManagementPage";
import { CustomerOrderPage } from "./CustomerOrderPage";
import { LegalPage } from "./LegalPage";
import { PublicContentPage } from "./PublicContentPage";
import { DashboardTools } from "./DashboardTools";
import { PrinterManagementPage } from "./PrinterManagementPage";
import { AuthFlowPage } from "./AuthFlowPage";
import { AdminSubscriptionReviewPage, SubscriptionPage } from "./SubscriptionPages";
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
    title: "You print, they pick up",
    description:
      "Review the order, confirm payment, and get it ready at your counter.",
    icon: Printer,
  },
];

const benefits = [
  "No app or account needed for your customers",
  "UPI goes directly to your shop",
  "Private uploads with clear retention controls",
  "You decide when an order is ready to print",
];

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
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
  if (path === "/verify-email") return <AuthFlowPage flow="verify" />;
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
    "/dashboard/qr-code": "shop-qr-code",
  };
  if (shopSections[path]) return shopPage(<ShopSettingsPage initialSection={shopSections[path]} />);
  if (path === "/dashboard") return shopPage(<ShopOverviewPage />);
  if (path === "/dashboard/support") return shopPage(<ShopSupportPage />);
  if (path === "/dashboard/wallet" || path === "/dashboard/withdraw") return shopPage(<ShopWalletPage />);
  if (path === "/dashboard/jobs") return shopPage(<OrderManagementPage />);
  if (path === "/dashboard/setting") return shopPage(<ShopSettingsPage />);
  if (path === "/dashboard/orders") return shopPage(<OrderManagementPage />);
  if (path === "/dashboard/payments") return shopPage(<DashboardTools kind="payments" />);
  if (path === "/dashboard/reports") return shopPage(<DashboardTools kind="reports" />);
  if (path === "/dashboard/printers") return shopPage(<PrinterManagementPage />);
  if (path === "/dashboard/subscription") return shopPage(<SubscriptionPage />);
  if (path === "/admin/subscriptions") return <AdminSubscriptionReviewPage />;
  if (path === "/terms") return <LegalPage kind="terms" />;
  if (path === "/privacy-policy") return <LegalPage kind="privacy" />;
  if (path === "/refund-policy") return <PublicContentPage path={path} />;
  if (["/features", "/how-it-works", "/pricing", "/faq", "/about", "/contact", "/partner", "/solutions", "/solutions/cyber-cafe", "/solutions/xerox-shop", "/solutions/csc-center", "/solutions/college-library"].includes(path)) return <PublicContentPage path={path} />;
  if (path !== "/") return <PublicContentPage path={path} />;
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
        <a className="brand" href="#" aria-label="Printly home" onClick={closeMenu}>
          <span className="brand-mark"><QrCode size={21} strokeWidth={2.2} /></span>
          <span>printly<span className="brand-period">.</span></span>
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
            <h1>Less time<br />taking orders.<br /><span>More time printing.</span></h1>
            <p className="hero-description">
              Let customers send print jobs from their phone. You set the prices,
              confirm the payment, and stay in charge of every order.
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
                <div className="phone-secure"><ShieldCheck size={12} /> Your file stays private</div>
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
            <span><Check size={15} /> Direct UPI to your shop</span>
            <i />
            <span><Check size={15} /> You approve every order</span>
          </div>
        </section>

        <section className="steps-section" id="how-it-works">
          <div className="section-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> A simpler way to print</div>
              <h2>From scan to print.<br /><span>Without the back-and-forth.</span></h2>
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
              <div className="window-top"><span /><span /><span /><b>Today’s print queue</b><small>● Shop online</small></div>
              <div className="queue-summary"><span><small>NEW ORDERS</small><b>03</b></span><span><small>AWAITING PAYMENT</small><b>02</b></span><span><small>READY TO PRINT</small><b>01</b></span></div>
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
            <h2>You set print prices.<br /><span>Your shop gets paid directly.</span></h2>
            <p>Printly calculates each order from the rates you configure. Payments stay between the customer and your shop.</p>
          </div>
          <div className="marketing-pricing-card">
            <div><span className="pricing-card-kicker">FOR YOUR SHOP</span><h3>No per-order platform commission</h3><p>This build does not collect customer payments or add a platform fee to a print order.</p></div>
            <ul><li><Check size={15} /> Set your own paper and print rates</li><li><Check size={15} /> UPI paid directly to your shop or cash at counter</li><li><Check size={15} /> Review and confirm payment manually</li></ul>
            <a className="button button-dark" href="/register">Set up a shop <ArrowRight size={15} /></a>
            <small>Any future subscription or hosting charges are not configured in this development preview.</small>
          </div>
        </section>

        <section className="marketing-faq-section" id="faq">
          <div className="marketing-section-heading">
            <div className="eyebrow"><span className="eyebrow-dot" /> Frequently asked</div>
            <h2>A few things<br /><span>worth knowing.</span></h2>
          </div>
          <div className="marketing-faq-list">
            <details><summary>Does Printly process or hold customer payments?</summary><p>No. Customers pay your shop directly using your UPI details or pay cash at the counter. You verify payment yourself before approving a job.</p></details>
            <details><summary>Who sets the print prices?</summary><p>You configure prices by paper size, colour, and single- or double-sided printing. The server calculates the customer’s quote from those saved rates.</p></details>
            <details><summary>What files can customers upload?</summary><p>Customers can submit PDF documents or JPG, PNG, and WEBP photos. Uploads are private, validated, and limited to 10 files at up to 25 MB per file.</p></details>
            <details><summary>How long are uploaded files retained?</summary><p>Each shop sets a pending-file retention period in its settings. Files for active jobs remain available until the order is completed or cancelled.</p></details>
            <details><summary>Do I need a special printer or desktop agent?</summary><p>No printer hardware integration is required in this version. Download available order files and manage the print status from your shop dashboard.</p></details>
          </div>
        </section>

        <section className="marketing-contact-section" id="contact">
          <div><div className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Need help?</div><h2>For a print order,<br /><span>talk to the shop.</span></h2><p>Printly sends orders to the local shop you selected. Use the contact details on that shop’s page for pickup or payment questions.</p></div>
          <a className="button button-light button-large" href="/register">Set up your shop <ArrowRight size={16} /></a>
          <small>Platform support contact details are not configured in this development build.</small>
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
            <div className="closing-printer"><div className="printer-top"><div className="printer-light" /><span>printly.</span></div><div className="printer-paper"><div /><div /><div /><div /></div><div className="printer-slot" /><div className="printer-base"><div className="printer-button" /><span /></div></div>
            <div className="paper-float"><FileText size={25} /><span>READY TO PRINT</span><b>See you at the counter.</b></div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#" aria-label="Printly home"><span className="brand-mark"><QrCode size={18} /></span><span>printly<span className="brand-period">.</span></span></a>
        <span>Thoughtful tools for your local print shop.</span>
        <nav className="site-footer-links" aria-label="Footer navigation"><a href="#pricing">Pricing</a><a href="#faq">FAQ</a><a href="#contact">Contact</a><a href="/terms">Terms</a><a href="/privacy-policy">Privacy</a></nav>
        <span>© 2026 Printly</span>
      </footer>
    </div>
  );
}
