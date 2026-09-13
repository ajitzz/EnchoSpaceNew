# HARVO continuous execution verification

> Historical snapshot. Packaging and integration changes are documented in [GAP_CLOSURE_VERIFICATION.md](GAP_CLOSURE_VERIFICATION.md) and [DEPLOYMENT_HARDENING.md](DEPLOYMENT_HARDENING.md). Earlier defect/status statements are not a fresh audit of the later source.

Date: 13 September 2026. This is the continuation after the locally accepted Google M1 foundation. The founder authorized uninterrupted execution across the marketing plan. Source implementation, local acceptance and live business acceptance remain separate.

## Implemented system

The versioned `/api/marketing/v2` workflow links existing owned published properties and approved media to immutable campaign revisions. The host creates the campaign, evaluates actual available media with Gemini or receives an explicit human-review fallback, and submits the current revision. Admin review records the actor, exact content revision and policy/media attestations. It never marks payment successful.

An immutable cost-plus quote, authenticated remote payment capture, 24-hour risk hold and transactionally reserved allocation provide independent financial authority. Actual gateway/account/payment identifiers and integer minor-unit amounts are checked on fresh provider readback. Concurrent requests cannot reserve or refund the same available money twice. The double-entry journal has deferred balance constraints and tenant scope. Refunds reserve payable funds and queue atomically, then verify the original provider refund before releasing the payable.

The standalone PostgreSQL worker verifies revision, lease fence, pending job identity and content/financial authority before remote mutation. Meta and Google adapters create actual paused hierarchies and save provider IDs. Activation is separate and requires account, checkout, inventory and financial clearance. Unknown irreversible outcomes cannot be recreated under new request keys. Google v2 uses supported Search campaign total budgets and explicit geo/language/keyword assets; Meta uses the host's enabled countries and actual selected image/video/thumbnail. Exact requests and paused readback are tested through provider-shaped HTTP fixtures.

The UI projects independent review, quote, capture, risk, provider and reporting states. Missing metrics remain unavailable. Live polling observes provider data; retrieval time is not a promise of real-time source freshness. Booking counts do not come from platform-attributed conversions. A canonical booking event/correction/outbox module exists, but the actual trusted guest checkout and provider conversion-upload consumer are not connected.

New host/admin studios provide deliberate creative selection, preview, budget/flight and stay-date controls, itemized quotes, review evidence, guarded controls, funding/refund status and prospective 3–5% cost markup administration. They retain keyboard/mobile/reduced-motion behavior. The old paid UI does not continue synthetic success polling underneath them.

## Security and failure findings corrected

- Retired synthetic Google/Meta success, read-side simulated pacing, old paid funding/publication bypasses and automatic legacy conversion sends from the v2 path.
- Removed historical fixed-secret/passwordless/OTP bypasses, client-asserted Google identity and email-based admin grants. Authenticated roles now come from persisted accounts. No compromise is asserted; historical account/session audit remains a deployment requirement.
- Fixed reservation-before-preflight, stale job overwrite of a queued pause, wrong media allocation, settled/refunded funds shown as spendable, checkout unsafe-number conversion and gateway response identity mismatch.
- Bound payment and Meta webhook ingress to signatures and minimal durable envelopes. Sensitive billing/lead payloads are not needed in the queue. Replays are deduplicated after durable receipt, without synchronous external provider calls.
- Added bounded AI evaluation leases and exact evaluation identities so crashed/late reviews cannot leave permanent locks or overwrite later work. Asset network reads now have an absolute deadline in addition to size/DNS/decoding limits.
- Contained legacy organic publication behind explicit operator opt-in, persisted-admin audited unchanged content and no automatic ambiguous-send replay. Ordinary social drafts/review remain. This is not certification of the separate legacy organic publisher.
- Replaced caller-selected overwriteable local media names with authenticated upload capabilities, random immutable keys and exclusive creation. S3 signing and all five upload callers now enforce a conditional write contract, with 25 offline tests; live bucket policy/CORS verification remains required.
- Removed marketing financial/provider requests from offline background POST replay. The current authenticated user intent and backend authority remain necessary.

## Evidence and reproducibility

All acceptance tests use disposable local PostgreSQL or deliberately injected HTTP/gateway/AI fixtures. They do not import the application, load ambient `.env`, access Neon, use actual customer media or send real ads/payments/refunds. Fixture transport outcomes establish client behavior and negative paths; they do not prove external approval or delivery.

The final serialized consolidated run passed **591 tests in 24 files** (189.65 seconds), with no skipped/failed cases. This includes cancellation, S3 conditional signing, the shared media deadline and checkout-cancellation race regressions. An earlier 545-test baseline is historical; overlapping run counts are not added. Earlier per-module evidence is retained in M1/M2/M3/M4, M7/M8, payment gateway and M9 reports. Counts from overlapping runs are not added together.

Useful commands from the project root:

```sh
env -i PATH="$PATH" npm run test:marketing
env -i PATH="$PATH" npm run typecheck
env -i PATH="$PATH" node docs/harvo/m7_m8_ui_qa.mjs
env -i PATH="$PATH" npm run marketing:check
```

Full `server.ts` historically uses `@ts-nocheck`; a successful application build does not make that file type-safe. New marketing/provider modules and test contracts are additionally checked with strict TypeScript. The repository's general legacy test suite is not automatically a live-provider acceptance suite; simulation-based legacy tests are not promoted as current evidence.

## Remaining acceptance dependencies

1. Actual registered campaign accounting/tax/cost scope, gateway and provider account configuration; none is inferred from dummy values or a schema-valid reference string.
2. Trusted automatic final billing-close/settlement evidence. A provider pause or dashboard report alone cannot release a reserved campaign balance.
3. Canonical guest checkout/legal acceptance, trusted booking verifier, consent-aware conversion uploader and real per-item provider acknowledgement. The guest M5/M6B gates remain unchanged.
4. Evaluated AI recommendation quality with the chosen model and genuine media, immutable CDN integration for generated crop variants, and real video review/creative approval evidence. No synthetic score certifies policy compliance.
5. Measured conversion optimization/experiment outcomes. Initial native bidding and inventory/budget/price protection do not prove DCO lift, retargeting eligibility or “maximum bookings.”
6. Staging/production migration, least-privilege grants, monitoring/alert thresholds, representative load and operational restore acceptance. Isolated local concurrency/restore checks are explicitly narrower.
7. Named host/property, approved dates and bounded real spend for the Meta/Google pilot, followed by actual capture, paused creation, delivery, pause, booking and final reconciliation evidence.

The rollout and recovery instructions are in [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md). No live campaign or public deployment was performed. There is no production-readiness rating or 100% acceptance claim based solely on this code.

## Final source-aligned validation

- Full scoped suite: **591/591**, 24 files, exit 0. Durable log and machine-readable result: `artifacts/continuous/marketing-suite.log`, `suite-result.json`.
- Browser: **29/29** checks, including the final host cancellation UI; six durable screenshots and hashes in `artifacts/m7-m8/`. These use isolated UI fixtures, not live listing data.
- Whole project: `tsc --noEmit --incremental --tsBuildInfoFile /tmp/harvo-final-project.tsbuildinfo`, exit 0. Strict server compilation also passed after the final source changes. The first compiler run exposed the retired worker callback return-type mismatch; the callback now correctly permits an unused result.
- Current frontend: Vite production build with `envDir:false`, exit 0; final rebuild 2m 3s. Server was emitted into the same temporary verification directory. `scripts/verify-harvo-build.mjs` reproduces an isolated build without deployment.
- Build warnings remain: large existing chunks, including the React/vendor and guest listing bundles. No chunk-size warning threshold was raised to hide them. Full application performance acceptance is still open.
- Latest isolated concurrency record: 30 simultaneous requests; create p95 **852 ms**, revision edit p95 **307 ms**, workspace p95 **507 ms** with 12 SQL statements/request. One campaign/revision winner and tenant isolation held. Restore/replay completed in **1,726 ms**, retaining idempotency, unknown-write quarantine, forced RLS and immutable audit protection. Earlier 452/740 ms read observations reflect different local runs; none establishes a production SLA.
- Read-only configured database inspection succeeded. `inventory_days` and the new HARVO tables are absent; the configured role bypasses RLS. Schema metadata only was read, inside a read-only transaction. No remote DDL, customer rows, payments or ads were changed.
- Source manifest: `CONTINUOUS_SOURCE_HASHES.json`, 91 scoped source/test/configuration files. This is a verification snapshot, not proof of deployment or a substitute for version control.

A final regression initially expected PAYMENT_IDENTITY_CONFLICT for a forged host; the stronger campaign-owner lock correctly returns CAMPAIGN_NOT_FOUND/404 without disclosing another host's record. The assertion was updated to require that privacy-preserving result, and the full 591-test rerun passed. No negative-path provider fixture output was reported as a real provider rejection or real ad success.

**Current Completion Status: 50% — M1, M2, M3, M7 and M8 locally verified (5 of 10).** The partial/open work is retained in the numbered plan and above. The complete marketing upgrade and live pilot remain unfinished; no production-readiness score or 100% claim is made.
