# Phase 2.3 — Webhook Security Reconnaissance

## 1. Current Meta Webhook Implementation
- `/api/webhooks/meta` (POST): Accepts payloads and queues them in `async_webhook_queue` with absolutely no cryptographic verification.
- `/api/marketing/meta/webhooks`: Has a commented-out stub for `x-hub-signature-256` validation (`// const expectedSignature = ...`). It accepts everything.
- `/api/marketing/webhooks/meta-leads`: Attempts to verify the signature but uses `JSON.stringify(req.body)` instead of raw bytes, which breaks if formatting differs from stringified output. It explicitly bypasses validation outside of `production`.

## 2. Current Raw-Body Capture Mechanism
- `express.json` is configured globally (Line 845) with a `verify` callback that sets `req.rawBody = buf`. 
- However, some routes explicitly inject their own `express.json()` middleware without the verify function (e.g. `app.post(['/api/marketing/meta/webhooks'], express.json(), ...)`), effectively discarding the raw bytes needed for HMAC verification.

## 3. Current Stripe Webhook Verification
- The route `/api/payments/webhook` contains critical logic flaws. 
- It checks `if (stripeSig && stripe)` but the interior block attempts Razorpay HMAC-SHA256 logic, incorrectly referencing undefined variables like `razorpaySig`, checking `endpointSecret` via generic crypto instead of the official Stripe SDK (`stripe.webhooks.constructEvent`).

## 4. Current Razorpay Webhook Verification
- Handled via `processPaymentWebhook()`, which uses `typeof payload === 'string' ? payload : JSON.stringify(payload)`. 
- Like Meta leads, it does not use the cryptographically safe raw bytes.
- It also mutates `payment_status` via direct `UPDATE` rather than passing the payment event into the authoritative Phase 2.2 FSM.

## 5. Webhook Routes & External Event Sources
- `/api/webhook/whatsapp` (GET/POST)
- `/api/payments/webhook` (POST)
- `/api/webhooks/meta` (GET/POST)
- `/api/webhooks/ad-network` (POST)
- `/api/marketing/meta/webhooks` / `/api/meta-webhooks` (POST)
- `/api/marketing/webhooks/meta-leads` (POST)
- `/api/marketing/simulate-webhook` (POST)

## 6. Mutations Driven by Webhooks
- `app.post('/api/payments/webhook')` updates `host_marketing_campaigns.payment_status` directly.
- `processPaymentWebhook()` updates `payment_status`, `payment_gateway`, `payment_intent_id`, and `status` via a direct `UPDATE`, bypassing the Phase 2.2 FSM entirely.

## 7. Replay / Duplicate-Event Handling
- The idempotency in `processPaymentWebhook` checks `payment_intent_id`.
- The Meta webhook uses `processed_webhook_events` for deduplication based on `event_id`.
- Out-of-order event logic is missing; newer states could be overwritten by older duplicated webhooks.

## 8. Correlation-ID Propagation
- Correlation IDs are barely present in webhook entry points and not passed down systematically into the FSM transitions.

## 9. Tenant Resolution & Authorization
- Webhooks map events to a `campaign_id` but do not strictly verify tenant context against the webhook signature context.

## 10. Existing & Missing Adversarial Tests
- There are no tests verifying that modified payloads fail HMAC validation.
- No tests for stripe signature mismatch.
- No tests verifying duplicate out-of-order events are discarded safely.

**Conclusion:** The webhooks are severely insecure, lack proper raw-body handling, contain bugs (mixing Stripe/Razorpay validation), and bypass the Phase 2.2 Central FSM.
