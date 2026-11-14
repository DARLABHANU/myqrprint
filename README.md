# Printly

A multi-shop print-order web app built with React, Vite, Express, TypeScript, and MongoDB.

## Product scope

The current scope includes public shop pages, customer file uploads and quotes,
direct-to-shop UPI or cash orders, merchant order management, shop settings,
and Windows desktop printing connected to the deployed backend. Shop subscriptions
include a 7-day trial and tiers (Starter, Pro, Enterprise) activated via direct
platform UPI and admin UTR verification. Customer payments remain direct to each shop and
must be verified by the shopkeeper. The detailed requirements draft is
[`final_draft.md`](./final_draft.md).

## Requirements

- Node.js 22.18 or newer
- Access to the deployed Render API at `https://printly-api.onrender.com`

## Run locally

1. Install dependencies from the workspace root:

   ```sh
   npm install
   ```

2. Run the local frontend and Windows agent:

   ```sh
   npm run dev
   ```

- Local frontend: <http://localhost:5173>
- Deployed API health: <https://printly-api.onrender.com/api/health>

The local frontend proxies `/api` requests to Render. The backend and database
are not started on localhost.

For customer-side testing, scan the QR code from the deployed shop page. The
local desktop agent discovers and prints through the Windows computer, while
its API connection goes directly to Render.

The current workflows include owner registration/sign-in, one shop per owner
account, persisted shop settings, and a public customer order page at
`/p/{shop-slug}`. Customers can upload private PDF or photo files, configure a
server-priced order, select direct UPI or cash (when enabled), and receive a
pickup code. The customer can report a UPI payment, but that report is not proof
of payment; the shopkeeper must check and confirm receipt. Shopkeepers can
review and search orders, edit unpaid order options, download available private
files, confirm payments, approve paid orders for manual fulfillment, reject or
cancel eligible orders, and mark fulfilled orders ready for pickup. Files are
deleted according to order completion and the shop's configured retention
period. Customers can check order status with their session and pickup code.
Shopkeepers can configure their profile, QR poster, pricing, discounts,
customer fields, location lock, notifications, and payment methods.

The printer dashboard and desktop print agent are active: shopkeepers sign in to
the Windows app with the same shop credentials used on the website. The app
authenticates the signed-in session, connects that computer to its shop, and
automatically discovers local printers (including virtual printers like
"Microsoft Print to PDF"). The shop accepts customer orders only while the agent
is connected and the shopkeeper has turned the shop online in the desktop app.
The website dashboard is read-only for printer, job, and shop availability
controls. Shop subscriptions are active: each shop starts
with a 7-day free trial (50 orders), and can upgrade to Starter (300 orders),
Professional (1,500 orders), or Enterprise (unlimited) via direct platform UPI
payment and UTR verification in `/admin/subscriptions`. Customer orders enforce
subscription validity and quotas. No Razorpay checkout, wallet, payout, or
withdrawal flow is provided.

This is still a development build: email delivery must be configured, platform
support contact details and legal text require review, and production deployment
should be independently tested before launch.

Passwords must be at least 12 characters. Pricing is stored in integer paise;
duplex prices are per physical sheet, so an odd final page uses one sheet.

Email delivery supports Gmail API OAuth and SMTP. Render Free blocks outbound
SMTP ports, so use Gmail API OAuth there. The terms and privacy pages are
development drafts; review and replace them before public launch.

Run `npm run typecheck`, `npm test`, and `npm run build` to validate the app.
