# Printly

A multi-shop print-order web app built with React, Vite, Express, TypeScript, and MongoDB.

## Product scope

The current scope includes public shop pages, customer file uploads and quotes,
direct-to-shop UPI or cash orders, merchant order management, and shop settings.
Automated printing and printer setup are temporarily paused. Shop subscriptions
are placeholders: there is no subscription checkout, payment collection, expiry
enforcement, or order quota. Customer payments remain direct to each shop and
must be verified by the shopkeeper. The detailed requirements draft is
[`final_draft.md`](./final_draft.md).

## Requirements

- Node.js 22.18 or newer
- MongoDB Community Server running locally (Compass is a database GUI, not the server)

## Run locally

1. Install dependencies from the workspace root:

   ```sh
   npm install
   ```

2. Copy `server/.env.example` to `server/.env`. Replace `SESSION_SECRET` with a
   random secret of at least 32 characters before starting the API.
   To enable account verification, password resets, and email two-step sign-in,
   configure Gmail API OAuth (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
   `GMAIL_REFRESH_TOKEN`, and `EMAIL_FROM`) in `server/.env`. The Gmail API sends
   over HTTPS and works on Render Free; SMTP remains an optional fallback on
   hosts that allow outbound SMTP. Shop subscription billing is not available.
3. Start MongoDB locally, then run:

   ```sh
   npm run dev
   ```

- Frontend: <http://localhost:5173>
- API health: <http://localhost:4000/api/health>

The API health endpoint returns an error status if MongoDB is unavailable.

### Test a shop QR code on a phone

For a phone on the same Wi-Fi network as the development computer:

1. Find the computer's Wi-Fi IPv4 address (for example, `192.168.1.8`).
2. Set `CLIENT_ORIGIN` in `server/.env` to include
   `http://<computer-ip>:5173`, keeping the existing localhost origins.
3. Start or restart `npm run dev`, then open
   `http://<computer-ip>:5173` on the computer and sign in to the shop.
4. Display the shop QR code and scan it with the phone camera.

The phone and computer must be on the same Wi-Fi. Allow the development server
through Windows Firewall on private networks if prompted. This is for local
testing only; do not expose the development server to the public internet.

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

The printer dashboard is an informational placeholder. Printer setup, printer
routing, Windows-agent pairing, job polling, and print execution endpoints
return a service-paused response. The subscription and public pricing pages are
placeholders, and subscription payment/admin APIs are not mounted. Legacy plan
fields may remain in stored shop documents for compatibility but do not gate
shop visibility or order creation. No Razorpay checkout, wallet, payout, or
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
