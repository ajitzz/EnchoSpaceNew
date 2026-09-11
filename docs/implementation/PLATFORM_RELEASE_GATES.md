# Encho Stays: release evidence and outstanding gates

2026-09-11 authority note: this file retains historical implementation evidence. Current milestone acceptance and publishing requirements are in MAHA_BLUEPRINT.md and MAHA_PRODUCTION_CERTIFICATION.md; RESUME.md records the latest verified checkpoint. Older counts and next-task statements below must not override it. In particular, lifetime-count auto-pause has since been removed and automatic resume disabled; durable dated/external provider control acceptance remains open. No production certification is implied.

Updated 2026-09-09. This is an implementation handoff, not production certification.

## Delivered in this continuation

- Stay checkout is a dependency-injected router with a pure integer-minor-unit quote contract. Exact room IDs, dates, occupancy, zero inventory and configured zero fees are preserved.
- New quote/order/verification endpoints require authentication. Durable per-user attempt keys bind the complete request. Gateway creation occurs outside inventory transactions. Unknown outcomes retain their hold and require review, rather than creating another order.
- Availability checks serialize on the property row, evaluate each occupied night, include active holds and use exclusive checkout dates. Confirmation requires a captured payment with the exact stored order, amount and currency, plus valid HMAC. Repeated verification returns the same booking.
- Migration creates checkout attempts, unique payment/order/booking bindings, indexes, row policies and append-only audit events. It was applied only to an isolated temporary PostgreSQL fixture database, not Neon.
- Legacy unsigned/default-user checkout, direct client-priced booking creation, fake QR payment flow, simulated booking success and invented confirmation credentials were removed. Legacy routes return explicit migration errors.
- Host/admin room inventory forms preserve zero. Guest checkout and confirmation use actual reservation data. Host/guest reservation API projections retain checkout dates and room IDs. Host transitions require payment for confirmation and cannot reopen terminal stays; completion cannot precede checkout.
- Guest property visual direction remains, but stock-photo padding, fabricated review cards, fake live viewers, arbitrary room/tourist details injected by App, and client-calculated fee/tax totals were removed. The listing shows a room subtotal and checkout computes the complete quote. Real room IDs avoid collisions between rooms sharing a category.
- Live Google adapter creation/control/reporting/DCO paths fail explicitly when only simulation is implemented. Unsupported controls do not confirm local-only changes as network success. Pricing-sync UI reports unverified rather than inventing a price sync.
- CRM requires a configured webhook secret, never assigns an unrelated guest to an ad lead, resolves real host notification recipients, and refuses to claim delivery without an adapter. Background failures are logged. Existing inquiry/outbox records are retained.
- Legacy Razorpay verification requires authentication, captured amount/order binding and provider notes matching the user/target. Missing configuration cannot fabricate payment. Hardcoded Meta-token fallbacks were removed; credential rotation remains required.
- Chart/map dependencies were split based on bundle contents, not a guessed performance rating.

## Verification performed

1. `npm exec vitest -- run --config vitest.platform.config.ts`: latest ordinary run passed 59 tests; 7 opt-in PostgreSQL tests skipped as designed.
2. The opt-in run against a new private Unix-socket-only PostgreSQL 18 cluster passed all 65 tests then present, including 7 database tests. One later lifecycle test passed in the ordinary run. Gateway operations were injected mocks; no external payment or advertising requests ran.
3. Database tests covered last-room contention, duplicate attempt concurrency, body/key conflict, owner isolation, repeat payment confirmation, checkout persistence, expired hold/late payment contention, unknown gateway outcome, immutable audit records and RLS under an unprivileged role.
4. `npm exec tsc -- --noEmit`: full application type check passed after correcting new Google error-code declarations and test harness types.
5. Production build passed. Entry bundle changed from 543.28 kB to 207.88 kB; checkout from 31.99 kB to about 9.57 kB; confirmation from 18.34 kB to 2.78 kB. These are uncompressed build artifacts, not measured loading-speed improvements. Chart code is now separately cached; total JS still needs profiling.
6. Scoped ESLint covers the new quote/lifecycle/router/tests/checkout/confirmation/shared empty-state files. No claim that all existing legacy code passes repository-wide lint.
7. Temporary PostgreSQL was stopped after testing. Its generated data remains under `/private/tmp/encho-stay-test.ht0GvP`; no user or production data was deleted.

## Mandatory release blockers

**Checkout is disabled by default.** `STAY_CHECKOUT_ENABLED` must remain unset/false until all relevant gates below are closed. Deploying the current source without enabling a validated replacement intentionally leaves stay payments unavailable; legacy insecure routes are not a rollback option.

- Review/apply `docs/migrations/20260909_stay_checkout.sql` through the real migration process, with backup and correct application-role grants. The local fixture proves the migration and router together, not compatibility with every production schema/history variant. Existing room inventory may already be decremented by old lifetime-inventory logic; reconcile it before launch.
- Confirm approved fee/tax configuration and cancellation/refund terms. This implementation preserves existing server arithmetic; it is not legal/tax validation. Only INR stays are supported. Date-specific prices/promotions and other currencies explicitly require an additional adapter, rather than silently charging a different amount.
- Implement admin payment-reconciliation/refund workflows and signed webhook recovery for lost browser callbacks. A late captured payment that loses inventory currently requires manual resolution. Unknown order creation retains inventory indefinitely until reconciled; the admin resolution UI/worker is not finished.
- Verify actual Razorpay sandbox capture, retry and recovery against the intended account. Review legacy wallet/campaign funding routes and their ledger/currency contracts end to end; this pass does not certify them.
- Complete per-network funding allocations and real Google hierarchy/control/reporting integration. The existing client still references obsolete v17 endpoints and constructs incorrect generic mutation operation names; safety guards do not implement the provider. Google's current release notes list v25: https://developers.google.com/google-ads/api/docs/release-notes. Master credential refresh alone is not proof of account permissions.
- Audit all Meta publication/resume paths, not just the initial approval router. The calendar circuit breaker still compares aggregate bookings with room inventory rather than a verified campaign target-date contract. Do not enable new automatic spending on that assumption.
- Finish real notification adapters, atomic outbox claiming/fencing, verified guest-identity linking and booking/refund attribution. Inquiries remain in CRM, but a lead without verified account linkage does not get a guest thread. The old PII encryption helper has a process-random fallback key; stable key management and migration need their own security pass.
- Rotate formerly hardcoded Meta credentials and audit repository history/deployment secrets. Removing the fallback does not revoke a credential. No production credentials were rotated by this task.
- Run guest/host/admin browser E2E, accessibility and mobile Core Web Vitals against isolated staging. Existing Playwright config boots the main server, so it was not run against the configured Neon environment. No visual or conversion-rate certification is claimed.
- Select the actual staging/release host. Sites' Worker runtime is not a drop-in host for the current Express/Socket.IO/Postgres server. No deployment was attempted.

## Current milestone acceptance

Milestone 1 remains locally complete. Milestone 2 has staged implementation but recovery/currency/content acceptance still open. Milestone 3 has tested checkout concurrency and transition safeguards, but refund/admin/calendar integration is incomplete. Milestones 4–5 received safety fixes, not complete live provider/CRM delivery implementation. Milestone 6 has local evidence, not production release sign-off. All six milestones are **not complete**.

Next work: complete payment-reconciliation/refund and calendar contracts before enabling checkout; complete real provider/CRM integrations; then exercise the end-to-end journeys on an approved isolated staging target.
