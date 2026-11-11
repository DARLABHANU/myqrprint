# Printly

A multi-shop print-order web app built with React, Vite, Express, TypeScript, and MongoDB.

## Product scope

The target is functional coverage of the workflows documented in
`qrtoprint-clone-srs.docx` and observed on <https://qrtoprint.co.in/>. Razorpay
payment integration is explicitly out of scope; customer payments remain direct
to the shop (UPI or cash), with shopkeeper verification. Implement the workflows
with Printly's own branding, copy, and visual assets rather than copying the
reference site's proprietary materials.

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
   hosts that allow outbound SMTP. To enable subscription checkout,
   set `PLATFORM_UPI_ID` and `PLATFORM_ADMIN_EMAIL`; the configured admin reviews
   UPI references at `/admin/subscriptions` and activates plans after confirming
   payment in the platform UPI account.
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

The current vertical slice includes owner registration/sign-in, one shop per
owner account, persisted shop settings, and a public customer order page at
`/p/{shop-slug}`. Customers can upload private PDF or photo files, configure a
server-priced print order, and receive a pickup code. Direct UPI claims remain
unverified until a shopkeeper checks the payment. Pending upload files are
cleaned up after the shop-configured pending-file retention period. Shopkeepers can review the order queue, download
available private files, confirm UPI/cash manually, and move paid jobs through
payment confirmation, approval, printing, ready-for-pickup, and failure/requeue
states. Pending orders can have print options edited with a server-recalculated
total; customers can see order updates on their pickup page. Shopkeepers can
download/share a shop QR poster, and customers can scan a direct-to-shop UPI QR.
The marketing home page includes feature, workflow, pricing, FAQ, and contact
sections. This is still a development build: plan payments require manual UPI
verification, platform support details are not configured, legal text is draft, and
the app has not yet been verified against a production-like deployment.

Passwords must be at least 12 characters. Pricing is stored in integer paise;
duplex prices are per physical sheet, so an odd final page uses one sheet.

Email delivery supports Gmail API OAuth and SMTP. Render Free blocks outbound
SMTP ports, so use Gmail API OAuth there. The terms and privacy pages are
development drafts; review and replace them before public launch.

Run `npm run typecheck`, `npm test`, and `npm run build` to validate the app.
