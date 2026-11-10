# QrToPrint clone: implementation brief

Prepared: 2026-11-09  
Source: browser inspection recorded in `qrtoprint-recon.md` plus the owner's payment decision.

## Product decision

Use each shopkeeper's own UPI ID or static UPI QR for direct payment. Do not integrate Razorpay or route funds through the clone. Keep cash-at-counter as an optional shop setting. Static UPI has no payment callback, so the default should be a pending state until the shopkeeper manually confirms payment. The customer can tap “I've paid”; the app must not treat that tap as verified payment.

## MVP scope

1. **Shop customer page** at `/p/{shop-slug}`: shop identity, PDF/image upload (10 files, 25 MB each), paper/colour/sides/copies, photo layouts, live price, direct-UPI instructions/QR or counter option, order confirmation and pickup code.
2. **Merchant dashboard**: login, jobs/status tabs, order detail, approve/reject, edit print options, mark payment verified/cash received, shop settings/rates, payment QR/UPI fields, customer QR/poster.
3. **No printer hardware dependency for MVP**: model jobs through a mock print adapter and record state transitions. Add a real desktop agent/printer bridge later as a separate integration.
4. **Public marketing pages**: prioritize home, features, how-it-works, pricing, FAQ, contact, login/register. City SEO pages, blog, and remaining solution pages can follow after the order flow works.

## Initial order lifecycle

`uploaded → awaiting_payment` (direct UPI) or `awaiting_cash` → `needs_approval` after shopkeeper confirms payment → `queued` → `printing` → `printed`; include `rejected`, `cancelled`, and `failed` branches. With mock printing, an explicit “simulate print success/failure” action replaces a device connection. Persist an event/timeline for every transition.

## Core records

- **Shop**: slug, display name, contact, enabled formats/options, pricing, UPI ID or QR asset, cash enabled, collection/privacy settings.
- **Order**: shop, pickup code, uploaded files and page counts, chosen print options, computed amount, payment method/status, job status, timestamps.
- **Order event**: actor, previous/new status, timestamp, optional note.

Keep uploads private, validate file type/size/pages server-side, and apply configurable deletion after completion/cancellation/pending expiry. Never trust client-submitted price; calculate again on the server.

## Build sequence

1. Inspect the available repo and choose its existing stack (or scaffold one if none exists).
2. Implement shop settings and pricing calculation with sample data.
3. Build the customer upload/quote/UPI-or-cash flow.
4. Build the merchant order queue and manual payment confirmation.
5. Add mock print outcomes and status history, then address responsive layouts and edge cases.
6. Recreate the marketing pages and SEO templates.
7. Integrate a desktop agent only if/when a Windows PC and printer test path are available.

## Decisions to make during implementation

- Does UPI checkout require customer “I've paid” confirmation, UTR entry, or simply display the QR and create a pending order?
- Should the shopkeeper approve every UPI payment, or only those without automated confirmation? With static UPI, manual confirmation is recommended.
- Final stack, hosting, auth, retention duration, and whether shop accounts/plans are in the first release.
