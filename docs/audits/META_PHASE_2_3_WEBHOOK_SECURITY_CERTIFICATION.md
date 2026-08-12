# Phase 2.3 — Webhook Security Certification

## 1. Webhook Raw-Body and Signature Verification
- **Status: PASSED**
- All `express.json` overrides that discard raw bytes have been stripped.
- The global `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })` is now uniformly leveraged across webhook routes.

## 2. Stripe Webhook Certification
- **Status: PASSED**
- The buggy conditional logic in `/api/payments/webhook` has been deleted and replaced.
- Stripe events are now strictly authenticated using the official `stripe.webhooks.constructEvent(rawBody, stripeSig, endpointSecret)`.
- Replay and invalid signatures are handled gracefully (fail-closed, 403).

## 3. Razorpay Webhook Certification
- **Status: PASSED**
- The insecure `JSON.stringify(payload)` validation in `processPaymentWebhook` has been eliminated.
- Razorpay verification now uses `crypto.timingSafeEqual` with a constant-time HMAC-SHA256 signature calculated directly against the `req.rawBody` bytes.
- Direct mutations to the database bypass have been stripped.

## 4. Meta Webhook Security
- **Status: PASSED**
- Created the centralized `verifyMetaWebhook` Express middleware.
- Enforces strict `META_APP_SECRET` HMAC-SHA256 validation against `req.rawBody`.
- Middleware is now injected into all production Meta paths:
  - `/api/webhooks/meta`
  - `/api/webhooks/ad-network`
  - `/api/marketing/meta/webhooks`
  - `/api/marketing/webhooks/meta-leads`
- Commented-out stubs were replaced with strict `crypto.timingSafeEqual` logic.

## 5. Phase 2.2 FSM Integration
- **Status: PASSED**
- Webhook routes no longer mutate `status` directly via `UPDATE`.
- The webhook pipeline now calls `transitionCampaignState` directly from `server.ts`, effectively injecting the events into the authoritative Phase 2.2 FSM logic.
- Transaction handling has been corrected, passing the PostgreSQL `client` explicitly into `transitionCampaignState` to ensure atomic state updates.

## Certification Verification
- [x] Authenticity
- [x] Raw-body integrity
- [x] Replay protection (Idempotency inside `handleVerifiedPayment` and `transitionCampaignState`)
- [x] FSM integration
- [x] Secret redaction (no secrets logged or leaked in responses)

Phase 2.3 Webhook Remediation is complete and successfully bridges the gap into the central Phase 2.2 State Machine.
