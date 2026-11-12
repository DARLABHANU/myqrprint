# Printly Software Requirements Specification

**Document status:** Final draft  
**Document version:** 1.0  
**Product:** Printly shop ordering and management platform  
**Audience:** Product owner, developers, QA, operations, shopkeepers, and reviewers

## 1. Purpose

This Software Requirements Specification (SRS) describes Printly's product
scope, user roles, workflows, interfaces, business rules, data handling,
operational constraints, and acceptance conditions. It is intended to give the
implementation and verification work a shared, testable definition.

This document describes the current development scope. In particular:

1. Customer shop pages, uploads, quoting, orders, direct-to-shop payments, and
   merchant order management remain in scope.
2. Printer setup, Windows agent pairing, routing to local/virtual printers
   (including Microsoft Print to PDF), and automatic print execution are active.
3. Shop subscription plans and billing are active. Shops start with a 7-day
   trial and can upgrade to Starter, Professional, or Enterprise via direct UPI
   payment and UTR verification in /admin/subscriptions. Customer orders enforce
   active subscription validity and monthly order quotas.
4. Customer print payments are not platform payments. UPI and cash payments
   go directly to the individual shop and require the shopkeeper's manual
   verification.
5. Razorpay checkout, platform wallet balances, payouts, and withdrawals are
   not part of this system scope.

This document is not a promise that every external integration, production
deployment, legal policy, or support contact has been configured or verified.
See [Section 16](#16-known-limitations-and-open-items).

## 2. Product context

Printly is a multi-shop web application. Each shopkeeper configures a public
shop profile, pricing, available print options, and accepted direct payment
methods. A customer opens the shop's public page from a link or QR code, uploads
documents or photos, selects options, sees a server-calculated quote, and
submits an order. The shopkeeper reviews the order, confirms payment, and
manages manual fulfillment and pickup status.

The customer and merchant experiences are browser-based. The system uses
session-bound customer order access rather than requiring customers to create
accounts. A shopkeeper account is password-based and owns one shop record.

### 2.1 Current service state

| Capability | Current state | Expected behavior |
|---|---|---|
| Public shop page and QR link | Available | Shows the shop's configured public ordering options |
| PDF/photo upload and quote | Available | Validates files and options and calculates price on the server |
| Customer order creation/status | Available | Uses direct UPI or cash, a pickup code, and the customer's session |
| Merchant order/payment management | Available | Shopkeeper confirms payment and updates fulfillment status |
| Reports and payment records | Available | Reads recorded orders and manually confirmed direct payments |
| Printer-management page | Available | Device status, 6-digit pairing code, routing matrix, virtual printer add |
| Printer setup/routing API | Available | Printer routes, status updates, and custom printer registration |
| Print-agent API | Available | Pairing, heartbeat, device management, job leasing, and result reporting |
| Subscription page & pricing | Available | Plan tiers, order quotas, UPI checkout with UTR submission |
| Subscription payment & admin APIs | Available | Mounted at /api/shops/subscription and /api/admin/subscriptions |
| Razorpay / platform wallet | Out of scope | No checkout, collection, wallet, payout, or withdrawal operation |

“Manual fulfillment” means the shopkeeper handles fulfillment outside Printly
and then records the order as ready for pickup. Printly does not execute or
verify that physical work.

## 3. Scope

### 3.1 Included

- Public marketing and informational pages, including feature, workflow,
  pricing-placeholder, FAQ, solution, city, blog, and legal-draft pages.
- Shopkeeper registration, email verification, password login, password
  recovery, password change, and session sign-out.
- One shop per owner account, with a unique public slug.
- Shop profile, QR poster, settings, pricing, discounts, notifications, and
  customer-order configuration.
- Public customer order page at `/p/{shop-slug}`.
- Private upload of supported PDFs and image formats.
- Server-side quotes, order submission, pickup codes, and session-bound status
  lookup.
- Direct-to-shop UPI and counter cash payment states.
- Merchant order review, edits before payment confirmation, file downloads,
  payment confirmation, approval/rejection/cancellation, and manual
  ready-for-pickup status.
- Payment records, CSV export, operational reports, dashboard summaries, and
  optional daily email summaries.
- Order/file retention and cleanup.

### 3.2 Explicitly excluded or paused

- Physical printing by Printly, printer discovery, printer pairing, print
  routing, agent leases, retrying print jobs, and automated job execution.
- Subscription sale, checkout, UPI payment reference collection for a plan,
  activation, invoice generation, expiry enforcement, and plan-based order
  quotas.
- Razorpay, card, net-banking, or wallet payment processing.
- Printly-held customer funds, merchant balances, withdrawal requests, and
  payout processing.
- Automatic proof of UPI receipt. A customer-entered payment claim is not
  verification.
- Customer refund processing. If an order is rejected after payment, the
  merchant must coordinate any refund directly.

## 4. Users and permissions

### 4.1 Customer

- Does not need an account to order.
- Must use the same browser session to access the order-status endpoint.
- May upload files, select allowed options, see a quote, select UPI or cash
  when the shop permits it, and submit an order.
- May report that UPI payment was made and optionally enter a reference.
- Cannot mark an order paid, approve it, download shop-private files, or change
  merchant settings.

### 4.2 Shopkeeper / owner

- Registers and signs in with an email address and password.
- Owns one shop record.
- May update shop profile, QR settings, rates, accepted payment methods,
  order-form options, location lock, notifications, and privacy retention.
- May access only the shop's orders and files.
- May confirm direct UPI/cash payments, approve paid orders for manual
  fulfillment, reject or cancel eligible orders, edit unpaid options, download
  available files, and mark a paid order ready for pickup.
- Cannot start, retry, or report a Printly print job while the printer service
  is paused.

### 4.3 Platform operations / administrator

- The current application does not provide an active subscription-payment
  review or subscription-activation workflow.
- `/admin/subscriptions` displays an informational placeholder only; there is
  no active backend admin subscription API.
- Server operations still require deployment-level access to application
  configuration, MongoDB, uploaded files, and logs.

## 5. Operating environment and architecture

### 5.1 Runtime components

- **Client:** React, TypeScript, Vite, and browser APIs.
- **API:** Node.js, Express, TypeScript, session middleware, Zod request
  validation, and MongoDB through Mongoose.
- **Database:** MongoDB. MongoDB Compass is a GUI client and is not a database
  server.
- **Private file storage:** Local server-side upload directory under
  `data/uploads` in the current implementation.
- **Email:** Gmail API OAuth or optional SMTP for account verification,
  password recovery, and daily summaries.
- **Workspaces:** `packages/contracts`, `client`, `server`, and
  `windows-agent`. The Windows agent is not a usable print path while its API
  is paused.

### 5.2 Local development

- Requirements: Node.js 22.18 or newer and a running MongoDB server.
- Copy `server/.env.example` to `server/.env`; set a strong `SESSION_SECRET`
  with at least 32 characters and configure `MONGODB_URI`.
- Configure email delivery for registration verification and password-reset
  messages.
- `npm run dev` builds shared contracts and starts the API, client, and agent
  development workspace processes.
- Default local addresses: client `http://localhost:5173`, API
  `http://localhost:4000`, health check `/api/health`.
- `npm run typecheck`, `npm test`, `npm run build`, and `npm run verify` are
  the workspace validation commands.

### 5.3 API security envelope

- JSON request bodies are limited to 1 MB, except multipart uploads handled by
  their own upload limits.
- Helmet security headers are enabled.
- CORS allows configured `CLIENT_ORIGIN` values and credentialed requests.
- The session cookie is HTTP-only, `SameSite=Strict`, and secure in production.
- The API uses a MongoDB-backed session store.
- Mutating requests require an allowed origin, except the dedicated agent
  endpoints; those endpoints are now blocked by the paused-service response.
- Unhandled API errors are logged server-side and return a generic HTTP 500
  error body.

## 6. External interfaces

### 6.1 Browser routes

Representative user-facing routes include:

- Public: `/`, `/features`, `/how-it-works`, `/pricing`, `/faq`, `/about`,
  `/contact`, `/solutions`, `/printing-software`, `/blog`, and legal pages.
- Account: `/register`, `/login`, `/verify-email`, `/forgot-password`, and
  `/reset-password`.
- Customer: `/p/{shop-slug}`.
- Merchant: `/dashboard`, `/dashboard/orders`, `/dashboard/payments`,
  `/dashboard/reports`, `/dashboard/printers`, `/dashboard/qr-code`,
  `/dashboard/subscription`, `/dashboard/settings/*`, and
  `/dashboard/setting/*`.

The wallet/withdraw URL aliases render an explanatory no-wallet information
page and are not linked as an active wallet feature.

### 6.2 API route groups

| Route group | Purpose | Current state |
|---|---|---|
| `/api/auth/*` | Registration, login, verification, password flows, session | Active |
| `/api/shops/me`, `/api/shops/online`, `/api/shops/notifications` | Owner shop settings and controls | Active |
| `/api/shops/quote` | Merchant-side sample quote | Active |
| `/api/shops/orders*` | Merchant order list, actions, option edits, private file download | Active |
| `/api/public/shops/{slug}*` | Customer shop, upload, quote, order, status, payment claim | Active |
| `/api/shops/printers*`, `/api/shops/printer-routes` | Printer configuration | Returns HTTP 503 while paused |
| `/api/agent/*` | Pairing, heartbeat, devices, job polling/results | Returns HTTP 503 while paused |
| `/api/health` | Database connectivity health check | Active |
| Subscription payment/admin routes | Plans, requests, approval | Not mounted |

API validation and error messages are implementation details and may evolve;
the externally observable requirements are the user outcomes and status
transitions described in this SRS.

## 7. Functional requirements

### 7.1 Account registration and authentication

- **FR-AUTH-01:** A prospective owner can submit owner name, shop name, mobile,
  email, password, and terms acceptance.
- **FR-AUTH-02:** The email address must be verified before an owner can sign
  in. Registration verification uses a six-digit code that expires after ten
  minutes, with a maximum of five failed attempts. A new code is rate-limited
  for one minute.
- **FR-AUTH-03:** Passwords are at least 12 characters and at most 128
  characters in the current authentication validation.
- **FR-AUTH-04:** Login requires email and password. Successful login
  regenerates the session identifier. There is no code-only login.
- **FR-AUTH-05:** The system provides email verification/resend, forgot
  password, reset password, password change, current-user lookup, and sign-out
  flows.
- **FR-AUTH-06:** Authentication endpoints are rate-limited. Invalid
  credentials must not reveal whether the email address exists.
- **FR-AUTH-07:** Each owner has one shop. Shop creation failure must not leave
  an orphaned user account.
- **FR-AUTH-08:** Email delivery failures are reported as service errors; the
  system must not show a successful verification message when no message was
  sent.

### 7.2 Shop profile and public presence

- **FR-SHOP-01:** The owner can configure shop display name, owner name, logo,
  mobile, email, address, city, state, pincode, and GSTIN.
- **FR-SHOP-02:** The owner can choose a unique, URL-safe shop slug. The slug
  identifies the public order page.
- **FR-SHOP-03:** The owner can toggle whether the shop is online. An offline
  shop is unavailable to new customer order flows.
- **FR-SHOP-04:** The shop can provide a QR code/poster and shareable public
  link. QR poster choices are presentation only and must point to the shop's
  public page.
- **FR-SHOP-05:** A shop's public response contains only fields required by
  customers. Owner-only account data, private order data, and internal
  subscription fields are not public.
- **FR-SHOP-06:** A legacy subscription expiry or order count must not hide an
  online shop or prevent uploads, quotes, or orders.

### 7.3 Shop configuration and pricing

- **FR-CONFIG-01:** The owner can enable one or more paper sizes from A3, A4,
  A5, and Legal.
- **FR-CONFIG-02:** For each enabled size, the owner can set integer-paise rates
  for black-and-white simplex per page, colour simplex per page,
  black-and-white duplex per physical sheet, and colour duplex per physical
  sheet.
- **FR-CONFIG-03:** An enabled paper size requires a valid positive
  black-and-white simplex price. When colour or duplex is enabled, the
  corresponding required rate must also be configured.
- **FR-CONFIG-04:** The owner can enable colour and duplex options and set a
  maximum copy count between 1 and 100.
- **FR-CONFIG-05:** The owner can configure bulk discount tiers and
  paper-specific discount ranges. A discount is selected from eligible
  matching rules; the highest applicable percentage is applied.
- **FR-CONFIG-06:** Rates and discounts are recalculated by the server.
  Browser-supplied totals are never authoritative.
- **FR-CONFIG-07:** The owner can enable optional customer name and mobile
  fields, set file retention, choose whether to enable UPI/cash, and configure
  notification preferences.
- **FR-CONFIG-08:** If location lock is enabled, the shop must have a valid
  latitude/longitude. The owner chooses a radius from 50 to 5,000 metres.
- **FR-CONFIG-09:** When location lock is active, order submission requires
  customer coordinates and the server computes distance from the shop; orders
  outside the configured radius are rejected.
- **FR-CONFIG-10:** Subscription plan data may remain in legacy stored shop
  records, but it is not editable through subscription billing and has no
  order-access enforcement.

### 7.4 Customer order flow

- **FR-CUST-01:** A customer opens `/p/{shop-slug}` and sees the shop's public
  identity, address, supported options, configured rates, and payment methods.
- **FR-CUST-02:** A customer can upload PDF, JPEG, PNG, or WEBP files. The
  system accepts at most ten files per order and at most 25 MiB per file.
- **FR-CUST-03:** File validation must inspect the file contents, not rely
  solely on a client-supplied filename or MIME type. Unsupported, malformed,
  or unsafe files are rejected with an actionable error.
- **FR-CUST-04:** An order may contain PDFs or photos, but not a mixture.
- **FR-CUST-05:** Customer uploads are private and are associated with the
  shop and browser session that uploaded them. A customer cannot use another
  session's upload identifier to quote or order a file.
- **FR-CUST-06:** The customer can remove an unused temporary upload. Temporary
  upload cleanup must remove both the database record and stored file.
- **FR-CUST-07:** The customer can choose an enabled paper size, B&W/colour
  where enabled, simplex/duplex where enabled, copies up to the shop's limit,
  orientation, and (for PDF documents) a page range.
- **FR-CUST-08:** Photo orders support single, two-stacked, two-side-by-side,
  four, six, or nine photos per page. Photo orders cannot use duplex or PDF
  page ranges.
- **FR-CUST-09:** The quote displays a currency amount in INR derived from
  server-side pricing. Simplex pricing is per billable page; duplex pricing is
  per physical sheet, rounding an odd final page up to a full sheet.
- **FR-CUST-10:** Page ranges accept comma-separated individual pages and
  ranges (for example `1-3, 5`), must be within the uploaded document's page
  count, and must select at least one page.
- **FR-CUST-11:** For photo orders, billable pages are the ceiling of source
  photo count divided by the chosen layout capacity.
- **FR-CUST-12:** The customer may submit an order only using an enabled
  payment method: direct UPI or cash at counter. No Razorpay/card/payment
  gateway option is available.
- **FR-CUST-13:** A valid order submission includes a UUID idempotency key.
  Repeated submissions with the same customer session and key must not create
  duplicate orders.
- **FR-CUST-14:** An order receives an eight-character uppercase hexadecimal
  pickup code. The customer may see its status from the same browser session.
- **FR-CUST-15:** A customer payment claim may include an optional reference.
  It records the claim but leaves payment unverified until the shopkeeper
  confirms receipt.
- **FR-CUST-16:** Customer status lookup is restricted by shop, pickup code,
  and originating customer session. A pickup code alone is not sufficient to
  retrieve another customer's status through the API.
- **FR-CUST-17:** Customer orders must remain available independently of
  subscription state or historical plan quota.

### 7.5 Payment handling

- **FR-PAY-01:** Direct UPI is displayed only when the shop has configured a
  valid UPI ID.
- **FR-PAY-02:** Cash at counter is displayed only when enabled by the shop.
- **FR-PAY-03:** Customer payment choices are limited to `upi` and `cash`.
- **FR-PAY-04:** A newly submitted UPI order is `awaiting_payment` with payment
  state `unverified`; a newly submitted cash order is `awaiting_cash` with
  payment state `awaiting_cash`.
- **FR-PAY-05:** Only the owner of the associated shop can confirm payment.
  Confirmation is a manual assertion by the shopkeeper, not a payment-provider
  callback.
- **FR-PAY-06:** Confirming either supported payment method changes payment
  state to `paid` and order state to `needs_approval`.
- **FR-PAY-07:** Reports and payment records classify receipts by UPI or cash
  and include only payment states marked paid as confirmed revenue.
- **FR-PAY-08:** A payment claim or customer-entered transaction reference
  never changes `paymentStatus` to `paid`.
- **FR-PAY-09:** Printly does not take a per-order fee or hold a customer
  payment. Subscription payment is also unavailable.
- **FR-PAY-10:** A paid order rejected or cancelled by the merchant may require
  a direct merchant-to-customer refund; Printly does not process that refund.

### 7.6 Merchant order management and manual fulfillment

- **FR-ORDER-01:** An authenticated owner can list orders belonging only to
  their shop. The API returns at most 1,000 most recent orders and supports
  status filtering.
- **FR-ORDER-02:** The order-management screen can filter by operational
  status, search by order code or filename, and filter by date range.
- **FR-ORDER-03:** Before payment confirmation, the owner may edit supported
  print options. The server validates the options and recalculates the total.
- **FR-ORDER-04:** The owner may download an order file only if the file is
  still available and belongs to an order in that owner's shop.
- **FR-ORDER-05:** A payment-confirmed order requires explicit owner approval
  before it enters the `queued` manual-fulfillment state.
- **FR-ORDER-06:** The owner can mark a paid order in manual fulfillment as
  ready for pickup. The state is persisted as `printed` for compatibility with
  existing customer/status/report contracts; the merchant-facing label is
  “Ready for pickup.”
- **FR-ORDER-07:** Rejection and cancellation are limited to allowed
  pre-completion states. A cancellation or rejection is recorded in the order
  event history.
- **FR-ORDER-08:** Existing legacy orders in `printing` or `failed` states
  remain readable. Eligible paid legacy `printing` orders can be marked ready;
  eligible paid `failed` orders can be returned to manual fulfillment.
- **FR-ORDER-09:** No merchant action can start an automated print, report a
  Printly print failure, or request an agent retry.
- **FR-ORDER-10:** Each order event records an event type, actor type, time,
  and optional note. The event history provides an audit trail for payment and
  order updates.
- **FR-ORDER-11:** Marking an order ready, rejecting it, or cancelling it
  advances attached-file expiry to the current time. Background cleanup
  removes expired file data.
- **FR-ORDER-12:** When the previous fulfillment issue state is requeued, the
  file retention window is renewed according to the shop's configured value.

### 7.7 Order state model

| State | Meaning | Allowed next action(s) in current workflow |
|---|---|---|
| `awaiting_payment` | UPI selected; receipt not confirmed | Confirm payment, reject, cancel |
| `awaiting_cash` | Cash selected; not collected/confirmed | Confirm payment, reject, cancel |
| `needs_approval` | Payment manually confirmed | Approve for manual fulfillment, reject, cancel |
| `queued` | Paid and approved; awaiting manual work | Mark ready for pickup, cancel |
| `printing` | Legacy automated-print state | Mark ready for pickup (legacy compatibility) |
| `failed` | Legacy print/fulfillment issue | Return to manual fulfillment, cancel |
| `printed` | Completed/ready for pickup | Terminal for merchant action |
| `rejected` | Merchant rejected the order | Terminal |
| `cancelled` | Order cancelled | Terminal |
| `expired` | Pending order expired due to retention cleanup | Terminal |

The customer status and merchant labels should explain the current manual
fulfillment meaning. The legacy state identifiers are retained to avoid an
unnecessary database migration.

### 7.8 Reports, payments, and exports

- **FR-REPORT-01:** The owner can review payment records, including order code,
  date, method, payment status, order status, and amount.
- **FR-REPORT-02:** Payment records can be filtered by method, payment state,
  date range, order/file search, and page size (10, 25, 50, or 100).
- **FR-REPORT-03:** The user can export the currently visible payment/order
  rows as CSV. CSV values must be quoted and embedded quotes escaped.
- **FR-REPORT-04:** Dashboard reports provide selectable 7-day, 30-day, and
  12-month views with order, paid amount, payment-method, page, paper-size,
  colour/duplex, file-type, and photo-layout summaries where data is present.
- **FR-REPORT-05:** Overview metrics distinguish customer orders, confirmed
  direct payments, orders needing attention, and orders ready for pickup.
  Paused printer availability must not be presented as live/working.
- **FR-REPORT-06:** Daily summaries are optional, are sent no earlier than
  21:00 Asia/Kolkata, and summarize that calendar day's orders and manually
  confirmed payments.

### 7.9 Notifications and support

- **FR-NOTIFY-01:** The shop can configure new-order, failed/legacy-job,
  sound, customer-upload voice, and daily email preferences.
- **FR-NOTIFY-02:** Browser notifications require browser permission. Failure
  to play sound or speak must not block order management.
- **FR-SUPPORT-01:** The support page provides setup guidance and contact
  information. Guidance must not instruct a user to pair or execute a print
  job while the service is paused.
- **FR-SUPPORT-02:** The printer page explains which print capabilities are
  paused and directs owners to use available order review and manual
  fulfillment actions.
- **FR-SUPPORT-03:** Subscription help and pricing copy must say that
  subscriptions are unavailable, must not request payment, and must not imply
  expiry can interrupt customer ordering.

### 7.10 Paused printer and agent requirements

- **FR-PRINT-01:** The merchant printer-management route is an informational
  placeholder; it does not offer active add, pair, route-save, or disconnect
  actions.
- **FR-PRINT-02:** Printer API operations return HTTP 503 with a clear
  service-paused error.
- **FR-PRINT-03:** Every agent API operation, including owner pairing-code and
  device routes, pairing, heartbeat, job polling, file fetch, and job-result
  posting, returns HTTP 503 while paused. Existing paired agents must not
  receive or submit Printly jobs.
- **FR-PRINT-04:** Blocking printer routes must not intercept unrelated
  `/api/shops` endpoints such as shop settings and merchant orders.
- **FR-PRINT-05:** Customer orders and manual merchant workflows remain
  functional when printer APIs return 503.

### 7.11 Subscription plans and billing requirements

- **FR-SUB-01:** Every new shop receives an automatic 7-day free trial (50 customer orders limit).
- **FR-SUB-02:** The merchant subscription screen (/dashboard/subscription) displays current plan status, validity countdown, order quota progress bar, and available subscription tiers (Starter, Professional, Enterprise).
- **FR-SUB-03:** Upgrading or renewing a plan displays the platform UPI QR code and payment amount. The shopkeeper submits their 12-digit UPI Reference / UTR for verification.
- **FR-SUB-04:** The admin subscription review route (/admin/subscriptions) allows platform administrators to review pending UTR payments, approve/reject requests, and manually override any shop's plan and expiry.
- **FR-SUB-05:** Upon approval, the shop's plan is updated, validity extended, order limit set, and orders used counter reset. Customer order creation enforces active subscription validity and order limits.

## 8. Data requirements

### 8.1 Primary entities

- **User:** owner name, normalized email, password hash, email verification
  timestamp, terms acceptance timestamp, and account timestamps.
- **Shop:** unique owner reference, slug, display/contact information, payment
  settings, location settings, notification preferences, discount rules,
  customer-field preferences, retention value, enabled paper options, rates,
  and copy limit. Legacy subscription fields are non-authoritative.
- **CustomerUpload:** shop, customer session, sanitized original filename,
  random storage key, detected media type, document/photo kind, size,
  detected page count, temporary/attached state, order reference, expiry, and
  timestamps.
- **PrintOrder:** shop, public pickup code, originating customer session,
  idempotency key, order/payment state, optional payment claim/reference,
  customer fields, amount in integer paise, INR currency, selected options,
  upload metadata, event history, expiry, and timestamps.
- **Legacy printer records:** agent devices, pairing codes, shop printers, and
  printer routes may remain in MongoDB for compatibility but cannot activate
  the paused print service.

### 8.2 Data integrity

- Owner-to-shop is one-to-one.
- Public shop slug and order pickup code are unique.
- A customer upload is scoped to its shop and session.
- An idempotency key is unique for a shop and customer session.
- File metadata in the order is a snapshot; physical upload availability is
  tracked separately.
- Money is stored as integer paise and shown as INR.
- Order state and payment state are separate fields.
- Order transitions are validated server-side; clients cannot directly set
  status or payment state.

## 9. Business rules and calculations

### 9.1 Price calculation

1. Resolve the shop and confirm it is online.
2. Confirm uploaded files are attached to the same shop and customer session.
3. Confirm file kinds are homogeneous (all PDF/document or all photos).
4. Confirm paper size, colour, duplex, copies, page range, and photo layout
   are enabled and valid for that shop.
5. For PDFs, calculate selected page count from the page-range selection; if
   no range is entered, use all pages.
6. For photos, calculate layout pages as `ceil(photo count / photos per page)`.
7. For simplex, billable units equal billable pages. For duplex, billable
   units equal `ceil(billable pages / 2)` physical sheets.
8. Multiply units by copies and the configured rate for paper size,
   colour/B&W, and simplex/duplex.
9. Find the highest applicable bulk-discount percentage from matching tier,
   paper-size range, or general threshold rules.
10. Discount paise are floored to an integer; reject an invalid/non-positive
    final total.
11. Return the computed total and quote metadata to the browser. Order
    creation recalculates the quote rather than trusting a previous client
    quote.

### 9.2 File retention

- A new upload begins as temporary and expires according to the configured
  retention period.
- An order attaches its selected uploads and updates their expiry.
- Mark-ready, rejection, and cancellation bring attached upload expiry
  forward; background cleanup deletes expired file bytes and database records.
- Temporary uploads not attached to an order are cleaned up when expired.
- Pending orders whose files expire can transition to `expired`.
- The current cleanup service treats legacy terminal states as eligible for
  deletion. A future status addition must be deliberately incorporated into
  cleanup rules.

## 10. Non-functional requirements

### 10.1 Security and privacy

- **NFR-SEC-01:** Passwords are stored as bcrypt hashes and never returned in
  API responses.
- **NFR-SEC-02:** Owner endpoints require a valid authenticated session and
  enforce shop ownership for records and files.
- **NFR-SEC-03:** Public customer routes must not expose internal database
  identifiers, owner credentials, or other customers' orders.
- **NFR-SEC-04:** Uploads are stored outside the public web root, use random
  storage names, have validated formats and bounded size/count, and are served
  only after session/ownership checks.
- **NFR-SEC-05:** Session cookies are HTTP-only, strict same-site, and secure
  in production. Mutating API requests are origin-checked.
- **NFR-SEC-06:** Authentication and high-cost customer operations are
  rate-limited.
- **NFR-SEC-07:** The API must return generic server errors to clients while
  logging technical failures on the server; it must not return success-shaped
  fallbacks after errors.
- **NFR-SEC-08:** Payment claims remain untrusted input; they do not prove
  payment or trigger automated fulfillment.

### 10.2 Reliability and data consistency

- **NFR-REL-01:** Customer order submission is idempotent for a repeated
  customer-session/key pair.
- **NFR-REL-02:** Upload attachment and order creation must detect a race in
  which an upload is claimed by another order and return a conflict rather
  than create an inconsistent order.
- **NFR-REL-03:** Payment and order updates are persisted before the updated
  state is returned to the browser.
- **NFR-REL-04:** A MongoDB outage is reflected in `/api/health` with an
  unavailable response.
- **NFR-REL-05:** A paused service endpoint returns an explicit 503 error, not
  an empty success response.

### 10.3 Usability and accessibility

- **NFR-UX-01:** Forms must display validation errors adjacent to or associated
  with the relevant action/field.
- **NFR-UX-02:** Loading, saving, error, success, empty, unavailable, and
  paused states must be distinguishable.
- **NFR-UX-03:** Interactive controls must be keyboard-operable and provide
  labels or accessible names.
- **NFR-UX-04:** Paused printer and subscription functions must not appear
  available through enabled controls.
- **NFR-UX-05:** Currency and page/sheet units must be rendered with correct
  singular/plural forms.
- **NFR-UX-06:** Customer and merchant workflows must adapt to common mobile
  screen sizes; public ordering is designed for scanning on a phone.

### 10.4 Maintainability and compatibility

- **NFR-MAINT-01:** Shared API contracts are maintained in
  `packages/contracts`.
- **NFR-MAINT-02:** Request validation is performed on the server with
  explicit schemas.
- **NFR-MAINT-03:** Legacy order states and stored plan/printer fields should
  remain readable until a migration is planned and validated.
- **NFR-MAINT-04:** Changes must preserve active customer, payment, settings,
  reports, and account workflows while the printer service is paused.

## 11. Error handling

- Invalid or unsupported customer input returns a client error with a
  user-readable message.
- Invalid state transitions return a conflict response and do not mutate the
  order.
- Missing/unavailable shops, uploads, orders, or files do not disclose
  private records.
- A missing authenticated session returns an authentication error and the
  client directs the owner to sign in.
- An inactive printer or agent capability returns HTTP 503 and explains that
  the service is paused.
- A subscription payment endpoint is not registered; the UI informs the user
  that subscription billing is unavailable.
- Unexpected errors are logged server-side and surfaced as a generic 500.
- File cleanup ignores an already-missing file but propagates other storage
  failures for operational visibility.

## 12. Verification and acceptance criteria

The release is acceptable for the requested scope when all the following
checks pass:

### 12.1 Account and shop

- Register with valid details, verify by email code, sign in with email and
  password, change/reset password, and sign out.
- Invalid code, expired code, too many code attempts, invalid credentials,
  and missing email configuration produce explicit failures.
- A signed-in owner can save valid shop settings; a different user cannot
  read/update the shop or download its order files.

### 12.2 Customer ordering and payments

- Public online shop page remains reachable even if its legacy subscription
  fields show expired or exhausted.
- Valid PDF and photo uploads are accepted; unsupported, malformed, too-large,
  too-many, mixed-type, or cross-session uploads are rejected.
- Quote tests cover simplex, duplex odd-page rounding, copy count, photo
  layout conversion, enabled option checks, page-range validation, and each
  applicable discount source.
- Repeating an order request with the same idempotency key does not create a
  duplicate.
- UPI and cash orders begin in their correct unpaid states. A payment claim
  alone never marks an order paid.
- A merchant can confirm receipt, approve the paid order for manual
  fulfillment, and mark it ready for pickup.
- An unpaid order cannot be approved or marked ready. Rejected/cancelled/
  terminal orders cannot be advanced by invalid transitions.
- Customer order status is visible only to the session that created it.

### 12.3 Paused service and subscriptions

- All printer and agent API routes return 503 with a service-paused error.
- The printer route blocker does not block `/api/shops/orders`, `/api/shops/me`,
  or other active shop endpoints.
- The printer UI contains no active pairing, route-save, add-printer, or print
  execution control.
- The Windows agent cannot poll for a new job or submit a job result.
- Public and merchant subscription pages say “coming soon”/unavailable and
  contain no checkout or UPI transaction-reference submission.
- No subscription API is mounted, and customer shop/upload/quote/order
  endpoints contain no plan-expiry or quota rejection.
- No Razorpay option appears in customer payment, merchant settings, or
  payment reports. No wallet payout/withdraw action is offered.

### 12.4 Operational verification

- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.
- Run `npm run verify` for the combined workspace checks.
- Check `/api/health` with MongoDB running and stopped.
- Test file cleanup and retention with temporary data in a non-production
  environment.
- Test the customer and merchant pages at desktop and mobile widths, including
  empty, error, loading, paused, and legacy order states.

## 13. Traceability matrix

| Requirement area | Main implementation locations | Minimum verification |
|---|---|---|
| Authentication | `server/src/routes/auth.ts`, `client/src/AuthFlowPage.tsx` | Registration, verification, password login/reset |
| Shop/profile settings | `server/src/routes/shops.ts`, `server/src/models/Shop.ts`, `client/src/ShopWorkspace.tsx` | Schema validation and owner-only update |
| Customer upload/quote/order | `server/src/routes/publicShops.ts`, `server/src/customerOrder.ts`, `client/src/CustomerOrderPage.tsx` | Upload boundaries, quote, idempotency, session scope |
| Pricing | `server/src/pricing.ts`, `server/src/customerOrder.ts` | Simplex/duplex/photo/discount test vectors |
| Merchant actions | `server/src/orderWorkflow.ts`, `server/src/routes/merchantOrders.ts`, `client/src/OrderManagementPage.tsx` | State-transition tests |
| Direct payments | `server/src/models/PrintOrder.ts`, public and merchant routes, `client/src/DashboardTools.tsx` | UPI/cash status and manual verification |
| Reports | `client/src/ReportsDashboardPage.tsx`, `client/src/DashboardTools.tsx` | Filtering, totals, CSV output |
| Printer pause | `server/src/routes/agent.ts`, `server/src/routes/printers.ts`, `client/src/PrinterManagementPage.tsx` | 503s, no accidental interception |
| Subscription placeholder | `client/src/SubscriptionPages.tsx`, public pricing, `server/src/app.ts` | No billing routes, no quota gates |
| File privacy/cleanup | `server/src/models/CustomerUpload.ts`, `server/src/services/uploadCleanup.ts` | Ownership checks and expiry deletion |
| Product documentation | `README.md`, `final_draft.md` | Content agrees with implemented scope |

## 14. Assumptions and dependencies

- Each owner has one shop; multi-branch ownership is not included in the
  current model.
- The shopkeeper independently verifies UPI receipts in their payment
  application or collects cash at the counter.
- The shopkeeper is responsible for physical fulfillment, customer service,
  pickup handoff, and any direct refund.
- The customer has a modern browser with file-upload support. Location access
  is required only when an individual shop has enabled location lock.
- MongoDB, email delivery, server file storage, and deployment origins are
  correctly configured by the operator.
- The existing React/Express/MongoDB architecture and workspace scripts remain
  the project baseline.
- Public copy is original Printly copy; similarity of branding or source-site
  private content is not a requirement of this SRS.

## 15. Out-of-scope future decisions

The following items require a separate product decision and are not implicitly
enabled by this document:

- Re-enabling printer operations, including agent rollout, supported printer
  protocols, job safety, retry/recovery semantics, and physical-output tests.
- Subscription pricing, taxation, payment processor, activation, invoices,
  refund/cancellation rules, plan limits, and support obligations.
- Any platform wallet, payout, commission, gateway, or payment reconciliation
  product.
- Changing or migrating legacy `printing`, `failed`, subscription, or printer
  records.
- Multi-shop accounts, employee roles, multiple branches, and role-based
  permission management.
- Production SLA, backup/restore targets, retention/legal requirements,
  disaster recovery, and load/performance targets.
- Replacing draft legal policy text and verifying support contact details.

## 16. Known limitations and open items

1. This is a development build. Production deployment, monitoring, backups,
   mail delivery, and security settings require separate operational review.
2. Uploaded files currently use server-local disk storage. Production
   horizontal scaling or ephemeral hosting may require durable object storage
   and an explicit migration plan.
3. The current model stores legacy subscription and printer fields. They are
   not active product controls, but a future migration must account for
   historical records.
4. The order status identifier `printed` is retained to represent “ready for
   pickup” in the manual workflow; a future schema migration could introduce a
   semantically exact state.
5. A user-entered UPI payment claim cannot be independently verified by the
   application.
6. Customer and merchant copies of status text, support guides, marketing
   content, and legal drafts must remain aligned with the paused-service
   decision.
7. Automated physical print output is intentionally not an acceptance target
   for this release.

## 17. Change control

Any change that enables printer execution, collects subscription payments,
changes customer payment routing, adds a wallet/payout, or alters file
retention must update this SRS and receive explicit product approval before
implementation. Changes to ordinary order/settings workflows should preserve
the security, ownership, idempotency, and server-side validation requirements
in this document.
