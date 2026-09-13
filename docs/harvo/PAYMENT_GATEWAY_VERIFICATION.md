# HARVO — payment gateway boundary verification

13 September 2026 · **SOURCE VERIFIED + TEST OBSERVED locally**. This is gateway and HTTP boundary evidence, not proof of production merchant configuration, live capture/refund settlement, provider approval or launch acceptance.

## Source changes and contract

`src/lib/marketing/payments.ts` now rejects nonpositive, fractional, malformed and unsafe integer minor-unit checkout totals before recording an attempt or converting to SDK Number fields. A reproduced input of `9007199254740993` previously rounded through Number and returned a checkout response; the regression now refuses it before the SDK call.

Returned checkout IDs, quote references, amount, currency and destination are validated. Destinations require an approved HTTPS payment domain with no credentials or nonstandard port. The same URL validation applies to replayed persisted links. Unknown checkout responses remain quarantined; the same quote cannot automatically create a replacement. Payment capture readback binds provider account, signed object IDs, saved checkout/order, amount and currency. Content approval or a created checkout link cannot write captured money.

Signed payment ingestion now writes `protocol: HARVO_PAYMENT_ENVELOPE_V1`, `provider`, `eventId`, a minimal `payload`, original canonical `payloadHash`, and `envelopeHash`. The retained payload contains only event type/identity, account, event time and the payment/link object IDs required for authoritative provider readback. Client secrets, billing/contact/card data and arbitrary metadata are not newly persisted in the job queue. Signature verification precedes projection. The worker verifies envelope integrity, re-fetches payment records, and returns the original payload hash for financial audit/idempotency. Previously queued legacy evidence without this protocol retains its prior hash-verification contract; this change does not delete historical rows.

Signed malformed JSON, malformed event identity, invalid object identity/time, oversized ingress and invalid signatures fail before durable work. Stripe verification uses its SDK signature parser. Razorpay verifies HMAC against the raw request bytes. Ingress performs durable queueing only; capture readback and financial mutation are worker responsibilities.

## Validation

`src/test/harvo/payment_gateway.test.ts`: **42/42 passed**. Tests run the real gateway against the isolated PostgreSQL fixture, retain Stripe’s actual cryptographic webhook parser, and replace every network-capable Stripe/Razorpay SDK method. All keys, objects, media and payments are explicitly synthetic test fixtures; no environment credentials, real merchant calls, customer notification or application-server startup are used.

Coverage includes missing configuration, concurrent checkout uniqueness, created-link-not-captured truth, lost-response quarantine, ownership/amount conflicts, recipient mismatches, unsafe numeric totals, malicious and corrupted destinations, wrong returned quote references, signature/size/replay protection, PII-minimized durable envelopes, tampered envelope rejection, exact amount/currency/object/session binding and separation from the financial ledger.

`src/test/harvo/router_contract.test.ts`: **13/13 passed** with actual Express routes, workflow and finance services on isolated PostgreSQL. In addition to campaign/review/funding contracts, the refund test verifies host ownership, current revision, canonical available balance, request idempotency and immutable reason; HTTP 202 records a pending refund and one durable refund job rather than completed settlement.

Final combined result: **55 tests passed**, recorded in `docs/harvo/artifacts/m7-m8/gateway-router-tests.log`. UI evidence and source hashes are in the adjacent `verification.json`. The targeted compiler check for the components, mounts and both test suites passed; the root integration report owns the complete application compiler/build and broader suite status.

```sh
env -i PATH="$PATH" node node_modules/vitest/vitest.mjs run --config vitest.marketing-m1.config.ts src/test/harvo/payment_gateway.test.ts src/test/harvo/router_contract.test.ts
```

The gateway tests establish local boundary behavior. Merchant identity/account arrangements, webhook configuration, operational reconciliation, refund network outcomes and representative production load still require their own acceptance evidence. No live funds moved during this verification. Rollback must preserve durable checkout/financial evidence and signature checks; do not restore unsafe Number conversion, unvalidated destinations or automatic recreation of uncertain checkout attempts.
