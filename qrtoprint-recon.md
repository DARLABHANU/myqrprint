# QrToPrint reverse-engineering notes

Target: https://qrtoprint.co.in/  
Date inspected: 2026-11-09  
Status: public-site and authenticated demo-shop web flows inspected. A synthetic test order was created and left Awaiting cash; no payment was collected and no printing occurred. Printer/desktop-agent behavior remains untested.

## System shape

The public site markets three connected surfaces:

1. Public brochure/SEO website.
2. Merchant account, dashboard, and Windows desktop printer bridge.
3. Customer mobile-browser ordering page reached from a shop QR.

The public pages identify the runtime as Astro v7.3.2 in the rendered HTML. That HTML is server-rendered and heavily SEO-oriented. Styling loads from `/_astro/Layout.EqEcEFKY.css`; the declared typeface is Plus Jakarta Sans. The page includes a shared header/footer, breadcrumbs on internal content pages, CTAs, and repeated FAQ/plan sections. Treat “Astro” as an observed generator tag, not proof of the server implementation or all page rendering behavior.

Observed homepage setup: theme color `#059669`, font fetched from Google Fonts, Google Analytics and Microsoft Clarity scripts, `/version.json` fetched with a cache-busting query. An inline module compares a build version and, on mismatch, attempts cache/service-worker cleanup then reloads with a version query. It exempts `/p` routes from the periodic version check. These are site implementation observations; do not carry the original analytics IDs into a clone.

## Public route inventory

- Core: `/`, `/features`, `/how-it-works`, `/pricing`, `/faq`, `/about`, `/contact`, `/partner`.
- Solutions index and four pages: `/solutions`, `/solutions/cyber-cafe`, `/solutions/xerox-shop`, `/solutions/csc-center`, `/solutions/college-library`.
- City SEO pages: `/printing-software` plus 194 city routes, e.g. `/printing-software/rajkot`.
- Blog index and articles, linked from `/blog`.
- Legal: `/privacy-policy`, `/terms`, `/refund-policy`.
- Merchant auth entry points: `/register`, `/login`, `/forgot-password`.
- Customer order path family `/p/...` is inferred from the observed inline route check and the site descriptions; no live shop order page was available to inspect.

The homepage footer links all page groups and initially shows a subset of the 194 city links with a “Show all 194 cities” checkbox/control. `/llms.txt` gives a concise route/content catalog, including the city list.

## Shared UI and responsive behavior

- Desktop header: logo, primary nav, a Solutions dropdown with four solution links, Login and Free Demo CTAs.
- At a 390x844 viewport, the “Open menu” button exposes a vertical nav containing the core links, four solutions, Login, and Free Demo. Captured using REA click scenario.
- Content pages use breadcrumb navigation, one H1, topic sections, CTA areas, and a shared footer.
- Registration and login use a distinct split-screen auth shell: marketing panel on one side and a form on the other. The panel has dashboard/queue teaser content and a shop-owner heading.

## Merchant flows visible without authentication

**Registration form** (`/register`): name, shop name, email, mobile, password, confirm password, terms/privacy checkbox, Create account button. Password visibility toggles are present. Form was not submitted.

**Login form** (`/login`): email, password, password visibility toggle, Login to dashboard, and Forgot password link. Form was not submitted.

**Forgot password** (`/forgot-password`) asks for the registered email and says it sends a 6-digit code; the form was not submitted.

The public setup guide says shop setup proceeds through registration/email verification; setting paper sizes, print prices and UPI/cash options; installing the Windows desktop app; adding printers/routing; and printing the shop QR poster.

## Product workflow described by the site

Customer: scan shop QR → open shop order page in phone browser → upload PDFs/photos → choose paper size, B&W/colour, simplex/duplex, copies, page range, or photo layout → see price → pay via UPI or choose counter payment → receive pickup/order number.

Merchant: new order appears in dashboard; merchant can configure automatic printing or approval, review/edit/reject/retry orders, and the Windows app dispatches accepted jobs to selected printers. Dashboard areas mentioned include print jobs, printers/routing, payments/reports, QR poster, settings and privacy. These are documented claims and have not been executed in the live product.

## Pricing and claims to verify

Public pages show 7-day/50-order free demo; Starter ₹99/500 orders/year; Pro ₹499/3,000/year; Premium ₹999/7,000/year. Pages say plans include all features and have no auto-renewal.

Payment language needs careful treatment in a clone: marketing pages emphasize UPI direct to merchant or cash, 0% commission. The current Terms/Privacy also describe an optional Razorpay online order payment path where funds enter a merchant wallet and withdrawals incur a fee. This differs from some marketing/LLM-summary copy that says there is no gateway/card payment. Preserve this as an inconsistency to clarify rather than assuming one path is canonical.

Terms/Privacy say paid plans are non-refundable, email verification is needed, customer uploads are private, and files are deleted after printing or after a merchant-selected retention period for pending/cancelled orders. These are legal/product claims, not independently verified behavior.

## REA capture ledger

- Homepage controlled Chromium scenario with page DOM/accessibility and network: `ev_29a3ccc38611854a36c7bbdee24a713d654905355afe3557f150d972fe8f3cba`.
- Homepage network scenario with response bodies/screenshot: `ev_f5d2258cec1fd9b3d9e74b8573d51c5d992f59afc082a3deb2f5cd766dd1c485`. Observed 18 usable network transactions; included `/version.json` 200 and first-party CSS/favicon/site manifest plus analytics/font third parties. No application API surface was identified on the unauthenticated homepage. Capture caveat: six of 18 usable transactions had no retained response body, and Playwright body reads are not guaranteed to be original wire bytes.
- `/features`: `ev_af5b4e1b335b72720e7248a95447ea8b46d3acfc09a25c7b0feb82fd79015b9f`.
- `/pricing`: `ev_906acee5666772d99fb0b26125ed0c41f4aaf0ad605913a6b8dc0591d4ea35ae`.
- `/how-it-works`: `ev_f52a10eae61a924bf8383328c22808b6728af4ca3063a8812db045a478a59850`.
- `/solutions`: `ev_7ee8fc44d659150720cc70ef4c22cc864f634937665c48f341fb5e038050fbdb`.
- `/register` form view: `ev_9355be37558f6d77d73b971cdeb2460aaed65ba4be940cb256ebe379145fdbca`.
- `/login` form view: `ev_6c339cdb876df75613e3e8cf81d2066fc017ed6a94059a47951c6288f352327c`.
- Mobile menu open: `ev_00642a3de6a6cca3eac64908358d91abb4cb9032670d4c5dda09dfc21c121c1d`.

REA limitation across these launch-mode captures: browser host OS/architecture and application artifact identity were not available. Scenario captures observed declared actions; none logged into or mutated the service.

## Template and route findings added in the second pass

- FAQ: grouped by General, Setup & printers, Payments, Privacy & security, and Pricing & plans; category links jump to sections. Questions are grouped as accordions/details in the accessibility tree.
- Four solution pages share one content template: breadcrumb, tailored H1/intro, demo/pricing CTAs, shop-specific pain points, solution benefits, common questions, related solutions, shared CTA/footer.
- City index groups all 194 cities into 32 state sections with jump links. A representative Rajkot city page has a local intro, local SEO headings/FAQs, other-city links, and the shared CTA/footer.
- Blog index has category navigation and article cards; category pages reuse that listing with a category heading/count. A valid article page has breadcrumb/category, H1, description, author/date/read time, cover image, long-form article with tables/lists/headings, FAQ and related articles. A guessed non-existent article slug (`/blog/qr-code-printing-software-cyber-cafe/`) rendered homepage content while retaining its URL; this is a likely fallback/route-handling defect to verify before cloning.
- Contact is a CTA-first page with WhatsApp, phone, email, address/map link, hours, and an iframe. Partner page is three conversion cards (agent, reseller/distributor, white-label) and a three-step explanation; CTAs go to prefilled WhatsApp messages.
- Auth shell includes a forgot-password view with email and Send code. It was not submitted.
- Privacy page uses a legal article template with update date, warning callout and numbered sections. Terms and refund policy are similarly structured legal pages.

Additional REA page captures:

- `/faq`: `ev_3f9ecb9c57902d0d0f7d229ec35c1c1e68971fc2e794793fc125279faa6cf782`.
- `/about`: `ev_29a6ab2822a973bec2e24d172ef617fc3b6a290a8847a43c4cad24c1f4d0c604`.
- `/contact`: `ev_0e45ff5c13b10c75bdc900de1e0e5719228d30d7e9b06edda3767a924f62fe32`.
- `/partner`: `ev_62cb90eeb5c066fa53bfe736767e51ba3c1f59cae40b92ab6d055c6440f92978`.
- `/refund-policy`: `ev_dcf753bf317ed1b17338da99ba81b7784e543c3a605e716d94b7cfc8fcb6b128`.
- Four solution pages: `ev_b9014a5baa16b8d9e094af6d97aaa91e4a56fab60870d14c4a995de5b89aad26`, `ev_f668a42a788e44dc21a583db2389d90eab69ecfb5eb7459815635fde16a1cb57`, `ev_9285a636312e8ad1f86ac0df632ff2a6830bdca683d9e56d3b86d9bc75fcd2f6`, `ev_e16b8829a76e2ee2ec24d58c3b72f5f492107926f880bb08c3f9d500fbdaf22`.
- `/printing-software` directory: `ev_ce4956edefaf62f2456fdc42972bc6bbc81dac657ee7cccc61670481d2f37ea8`; `/printing-software/rajkot`: `ev_d40d52a948e109e691bdcd4ab6945a460eb395d5e7e8068a2d70c30351c1054e`.
- `/blog` list: `ev_4c2b2fe070b58fd7bcf98497a372d81b9993dd8eeb553239e19a5ad10f9503f9`; `/blog/category/business-tips`: `ev_f541fb98d07237c9f0dea40b8410887fe7b7e52a06a0976c51ae2a11a51a2a02`; valid article `/blog/exam-form-result-day-rush-cyber-cafe`: `ev_03b0fbbd8c2757b9c76aea13667a67440e308d1f085c3021a736037a90a2562a`.
- `/forgot-password`: `ev_84c761e576dd37c3b119ef3ca4cb692d1de8a3250b6875c9e32cfd2dc52e6040`; `/privacy-policy`: `ev_fc6c620bfcac99e724a3bc23e6eef48eb3b724b164ebdad1f70012007f7ff6e8`.

## Remaining investigation for a faithful clone

1. Inspect representative detail pages for all four solution types, city SEO templates, blog/article templates, FAQ, About, Contact, Partner, Refund and legal pages.
2. Inspect mobile and desktop screenshots at consistent viewport sizes and record fonts, spacing, colors, images, icon treatment, and footer expansion behavior.
3. Inspect the client order page using a public demo shop slug or a provided safe test shop. Map upload validation, option dependencies, price calculation, UPI/counter selection, confirmation, and pending/failed states without making a real paid order.
4. Inspect merchant dashboard and account lifecycle with a disposable test account and permission to use it: verification, onboarding/settings, printers, routing, jobs/status transitions, reports, QR poster, retention, logout/reset password.
5. Obtain the Windows app installer/version and inspect its UI and connection/printing behavior separately. The public pages are not sufficient to reconstruct the printer bridge.
6. Clarify canonical online-payment policy because marketing pages and legal terms differ.

This is a reconstruction map, not source equivalence: REA captured live browser behavior and rendered HTML, while public page copy describes product features that still need runtime verification.

## Clone decisions and remaining scope

- Owner decision: the clone will not integrate Razorpay. Each shopkeeper will use their own UPI ID or QR for direct payment; cash at counter may remain optional.
- Because a static UPI QR has no payment callback, a customer “I've paid” action must not mark an order as paid. Keep it awaiting shopkeeper verification until the merchant confirms payment.
- Website flow inspection is sufficient to start the browser-side MVP. The order flow, dashboard sections, settings, and customer upload/pricing were inspected; order approval/printing, payment provider behavior, exhaustive validation states, and all viewport variants were not.
- Test order #1002 remains Awaiting cash in the demo account. It was not approved, rejected, edited, or printed.
- A build-ready MVP scope and suggested sequence are in `qrtoprint-clone-plan.md`.

The clone can use a mock printer adapter to simulate queued/printed/failed outcomes. A physical printer or desktop agent is only needed later to validate real device dispatch.


## Authenticated product inspection (demo shop; read-only)

Accessed the already-open dashboard after the user completed sign-in. Inspected visible pages and one existing sample order. No settings were changed, no order was created, no payment was made, no files were uploaded/downloaded, no receipt was printed, and no agent/printer was installed.

### Merchant dashboard shell

Persistent sidebar sections:

- Main: Overview, Print jobs, Payments, Printers, Wallet, Reports.
- Shop: My QR code, My subscription, Setting, My Profile, Help & support.

Header includes shop online switch, new-order alert control, account menu, and the demo-plan meter. Overview has daily earnings/jobs/pages/pending metrics, a weekly revenue chart, printer status, recent orders and quick links to setup, QR, and printers.

The inspected demo state showed one print order used from 50, seven days remaining on the demo, and no connected PC/printers. These are this demo account’s values, not generic defaults.

### Print jobs and order detail

`/dashboard/jobs` has status tabs (All, Needs approval, Queued, Printing, Awaiting cash, Printed, Failed), file/order search, date range, row-count selector and pagination. Rows provide View and Edit; Edit is disabled for a cancelled job. The View panel groups file-retention state, print settings, payment, timeline, and receipt. In the sample cancelled order, the file was no longer previewable/downloadable and the panel stated it had been auto-deleted from the shop PC and server. The timeline exposed received → cash payment → cancelled → file auto-delete. I did not use the Receipt action.

### Payments and wallet

`/dashboard/payments` shows collected totals, UPI/cash summary cards, transactions table, method/status filters, date range, CSV export, and a Record cash payment action. The inspected sample transaction displayed ₹5 cash as Paid even though its associated order was Cancelled; this may be demo/test data or an inconsistency worth verifying.

`/dashboard/withdraw` describes online payments as collected into QrToPrint’s Razorpay account and provides withdrawal to UPI or bank. The demo showed ₹0 balance and a 0.00% Razorpay charge; I did not enter payout details or request a withdrawal.

### Printers, routing, reports, subscription

`/dashboard/printers` lists connected PCs and printers, refresh/download-agent actions, and routing rules by paper size, colour mode and sides. The demo had no connected PC and zero printers. A4 routing controls were visible; Legal and A5 were disabled in the shop’s page settings. Displayed sample rates were ₹5/A4 B&W one-side page, ₹10 colour page, ₹8 B&W both-side sheet, and ₹18 colour both-side sheet. I did not change them or use Add printer / Download agent.

`/dashboard/reports` has 7 days / 30 days / 12 months tabs, CSV/PDF export, totals for revenue/orders/pages/average order value, revenue, payment method, page breakdown, upload type and orders-by-hour sections.

`/dashboard/subscription` shows current plan, usage meters, plan history and invoices. Demo plan: 7 days and 50 orders; no invoices yet. No upgrade action used.

### Shop QR and customer flow

`/dashboard/qr-code` confirms a shop-specific URL under `/p/{shop-slug}`. The poster builder exposes A4, A5 or 10×10 cm sticker size; Classic/Minimal/Bold designs; six color choices; shop-name text; English/Hindi; and Print, PDF, PNG, WhatsApp controls. I did not print, download or share the QR.

Opened the linked public customer page and completed a harmless cash test order (details below). It presents:

- Document PDF or Photo/Image (JPG/PNG/WEBP) mode; up to 10 files and 25 MB per file.
- Paper size, B&W/Colour, single/both sides, copies; photo mode adds 1/2 stacked/2 side-by-side/4/6/9 photos per page.
- Payment choices visible in this demo: Razorpay (Card, Netbanking, Wallet) or Cash at counter. With Cash selected, the action changes to “Place order” and the page says printing starts only after payment at the counter. The action remains disabled until a file is uploaded.

The customer page parsed a synthetic one-page PDF, updated the price live to ₹5 for A4 B&W single-sided, one copy, and offered Razorpay or cash at counter. I submitted the cash option, creating order #1002 (pickup code 1002), now Awaiting cash. No payment was collected and I did not approve, reject, edit, or print it. The observed checkout supports the earlier finding that marketing copy is incomplete/inconsistent on payment methods: the live demo page shows Razorpay options, while public marketing emphasizes direct UPI/cash.

### Settings, support and test order\n\nThe Settings pages showed paper sizes, rates, discounts, payment controls, customer-field collection switches, notification controls, and profile fields. No settings or profile values were changed. The support guide documents order handling: Needs approval → check payment then Accept/Reject; Awaiting cash → collect cash then Approve; Failed → fix printer then Retry; Reject/Cancel asks for confirmation.\n\nThe customer page accepts up to 10 files, 25 MB each. I used a synthetic one-page PDF containing no personal data. It priced at ₹5 and produced order #1002, pickup code 1002, in Awaiting cash. No payment was taken and no printing occurred.\n\n### Remaining product questions

- Settings inspected without saving changes: A4 enabled; colour and duplex enabled; displayed rates are ₹5 B&W single-side page, ₹10 colour page, ₹8 B&W duplex sheet, and ₹18 colour duplex sheet. Legal/A5 hidden. No discounts configured. Customer name/mobile collection switches are off. Notification options include new-order and print-failed alerts plus customer upload voice; daily summary email is off. Payment methods expose UPI and pay-at-counter controls. Profile form includes shop/owner/contact/address/GSTIN/logo fields; values were not recorded.
- The synthetic test order #1002 remains Awaiting cash in the demo shop. It was intentionally left pending; no payment, approval, or print was performed.
- Actual printer bridge and agent internals remain unverified: the account has no connected PC/printer. No agent was downloaded; website-side settings, help guide, and customer-to-order flow were inspectable in the browser.
- Verify whether the cancelled sample’s Paid cash transaction is expected behavior.

