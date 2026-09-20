# Remediation execution evidence — 20 September 2026

Status: active implementation, not production acceptance. Founder authority: HARVO-026 and the existing HARVO-022 remediation plan. Baseline: main `e832db6` plus the preserved dirty worktree. No remote database, provider mutation, live payment, Git push or deployment has been performed in this execution pass.

## Preservation and impact

A private local baseline was saved at `/private/tmp/encho-remediation-zfo_z3ly` (tracked patch and file-hash manifest). Existing tracker edits, opinion documents and scratch deletions are preserved. Scratch scripts were inventoried, not executed. Primary categories: security, database isolation, payment identity, monitoring API/UI and related documentation. Existing quote/ledger/reservation/claim identities are preserved.

Calendar API changes are intentional: authenticated owner/admin GET now requires `from`/`to` (exclusive checkout, maximum 90 nights), returns canonical room-type capacity, minimized reservations and blocks; guest GET `/api/listings/:id/availability` exposes only public published-listing room capacities. No invented unit assignments or guest emails/phones/avatars. Private `totalPrice` retains the legacy `total_rent` value as a decimal string, not proof of captured payment. POST uses `requestId`, canonical `roomTypeId`, `from`, `to`, source and optional note. DELETE requires `Idempotency-Key`. Old client payloads fail validation; the host and guest consumers are updated together. Calendar POST is excluded from offline background replay. Migrations 017/018/019 require a reviewed deploy sequence before the new source is released.

## Completed local source checks

- R1 authority/configuration/readiness/runtime/operations: 125 tests passed across five targeted files.
- Calendar service/HTTP boundary: 13 tests passed; then repeated with a non-superuser, non-BYPASSRLS application role and forced booking RLS. Cross-host denial, persisted admin role, minimal public projection, immutable evidence, concurrent create/delete retries, capacity contention, unknown legacy records and invalid windows covered.
- Payment gateway: 45 tests passed, including no fabricated Razorpay identity and the existing financial request/capture safeguards.
- Pooled context: seven real-PG tests passed with pool size one and a non-bypass role: host/admin/anonymous reuse, callback/client paths, explicit transactions, rollback, service composition and concurrent reads.
- Provider/engine/workflow/router: 167 tests passed across six files after fixing a discovered N+1 receipt projection. Added no-report preservation, source-time protection and coalesced refresh tests. Subsequent calendar/safety run: 23 tests passed.
- The initial global typecheck failures have been corrected. Both application and compiled-server typechecks now pass. `server.ts` no longer suppresses checking with `@ts-nocheck`; undefined names, actual SDK/request types, stale worker invocation and result-contract mismatches were repaired. Scratch analysis files are excluded; CI Node matches the declared Node 24 runtime.
- Full isolated HARVO suite: **936 tests passed across 47 files**, including genuine disposable PostgreSQL concurrency, RLS, restore, finances, provider fixtures and actual local Socket.IO clients. This final run includes the socket role-revocation race correction and seven new operational RLS tests. Earlier targeted counts overlap this run and must not be added to it.
- Guest presentation/gallery suite: **33 tests passed across four files**. Its dedicated config disables dotenv and external fetch; it does not load the legacy database setup. Coverage includes supplied media, room identity, no manufactured trust/reviews, empty host draft/preview, unavailable images and stale property responses.
- Global ESLint and both TypeScript checks pass on the changed source. Babel still reports the pre-existing large HostMarketing component; this is not a load-performance acceptance.
- Actual monitoring components pass desktop 1440px and mobile 390px local browser checks: host studio, admin workspace/recovery inspection, and calendar property switching, with no horizontal overflow or uncaught errors. Actual guest/property-empty/host-builder components also pass at both widths; room gallery identity and escape behavior are exercised. Every browser run uses explicitly labelled local fixture data and blocks external traffic. These are **12 viewport/screen combinations**, not production E2E evidence.

These counts describe distinct observed runs, not an additive total or production certification. Final compiled-build/runtime smoke evidence is recorded below. The broad legacy `npm test` / `ci-pipeline` was **not** executed: its root configuration loads dotenv and legacy tests include unsafe database selection. The isolated HARVO and guest checks do not certify every legacy test, Linux Docker, production load or a complete end-to-end deployment.

## Safety and operating limits

Provider reports with unknown source coverage cannot establish fresh spending authority. A no-report job can finish successfully while a protective pause is queued; queued does not mean remotely paused. The adapters still do not prove live serving from an enabled parent campaign. Canonical booking/consent ports remain deliberately disconnected pending accepted checkout/consent implementation and legal authority. Dashboard dashes remain truthful where that authority is missing.

Calendar legacy bookings without accepted room allocations conservatively mark affected capacity unknown. Missing date allocations conservatively require review. Removal cannot reopen capacity if block counters are inconsistent. No automatic financial or inventory repair is inferred from UI intent.

**Operational RLS follow-up:** migration 019 now forces row security on jobs, AI attempts and commercial preferences. Seven actual non-bypass-role tests verify anonymous/cross-host denial, owned receipts/enqueue, trusted worker claims, global job isolation, immutable attempts/preferences and preserved dedupe identity; the restore drill preserves all these policies. Runtime engine and preference reads use explicit service context. **Remaining release blockers:** production roles/grants/migrations and wider legacy caller review remain unaccepted; scoped local RLS evidence is not universal isolation. Recovery inspection is implemented, but durable recovery cases, evidence adoption and authorized actions remain unfinished. Enabled provider parent state still does not prove full-hierarchy live delivery. Canonical checkout/consent and outcome coverage remain unconnected. Production migrations/grants/configuration, independent review, safe legacy-suite isolation, multi-instance behavior, load/capacity targets and bounded real provider/payment pilot evidence remain open. No milestone or legal gate is accepted by this document.

## Rollback and deployment

Keep funding/publication/activation disabled until their existing gates are met. Test migrations 017/018/019 and least-privilege grants on a disposable database, then apply through the controlled migration process before source activation. Never roll back to fake consent, permissive role readiness, anonymous private calendars or deleted financial history. Prefer forward corrections; retain audit receipts even if a UI feature is disabled. No production DDL has been run here.

## Primary provider references checked

- [Google Ads common errors](https://developers.google.com/google-ads/api/docs/get-started/common-errors): access/authentication causes are distinct; HTTP rejection alone does not prove token expiry.
- [Google Ads zero-metric reporting](https://developers.google.com/google-ads/api/docs/reporting/zero-metrics): missing rows and reported zero metrics require different handling.
- [Razorpay Node payment-link request documentation](https://github.com/razorpay/razorpay-node/blob/master/documents/paymentLink.md): optional customer information can be omitted; the SDK customer-required type needs a narrow, documented boundary assertion.

## Additional R4 impact analysis — realtime subscriptions

Source inspection found that the legacy Socket.IO handlers joined user, administrator and message-thread rooms from caller-supplied identifiers without authenticating the socket or verifying membership. This is a source-proven access-control defect, not evidence of a production breach. The HTTP pool fix alone cannot protect a message already emitted to an unauthorized room.

Implementation plan: extract a testable subscription boundary; verify signed session identity and current persisted role; authorize each private subscription and typing event against thread membership; bind typing identity to the server principal; periodically revalidate ongoing subscriptions and disconnect invalid sessions; apply the same exact origin policy as HTTP. Update existing first-party socket clients to send their session token and reconnect on identity changes. Anonymous presence is limited to published listings. No schema change, financial write or provider call is involved. Regression coverage must use actual local Socket.IO clients, cross-user/admin/thread denials, role removal and expired credentials. Rollback may disable private realtime delivery, but must never restore unrestricted room joins. Existing polling remains the recovery path.

## Additional R7 impact analysis — property presentation truth

An isolated run of the existing M6A presentation/gallery tests produced 20 failures and 9 passes. Source inspection confirms fabricated room tiers, stock media, testimonials, ratings, verification/escrow claims, and a client-computed 15% guest fee/18% tax path. This is a separate source-proven baseline defect; no live booking or production loss is asserted. The controlling guest register decisions 24/25/29/31/32/38/39 and executable M6A prohibit these facts. This correction does not advance M6A acceptance or unblock M5/M6B.

Plan: retain the page's typography and property media experience while using supplied rooms/photos only, truthful missing-data states and stable photo identity. Remove manufactured trust/location/review facts, prevent stale cross-listing fetches, and keep checkout unavailable until accepted canonical quotes/payment exist. Host creation and preview must not manufacture the same facts; admin property preview inherits the same projection. No new database schema or commercial contract is introduced. Validate existing presentation/gallery contracts plus browser views, lint/typecheck and build. Rollback must preserve truthful omission and checkout containment rather than restore fabricated facts.

## Additional implemented boundaries

- **Realtime and origins:** private user/admin/thread subscriptions require a verified session and persisted authority; typing identity is server-derived. Periodic revalidation removes expired/revoked sessions, and each authenticated packet rejects a changed role before replacing the principal, closing the pre-revalidation admin-room race. Published-listing presence can remain anonymous. Exact HTTP/Socket.IO origin matching replaces suffix/wildcard trust. No multi-instance backplane or distributed revocation latency acceptance is implied.
- **Recovery:** persisted-admin, expected-revision read-only inspection returns bounded safe job/claim/entity/account/correlation evidence. The operator UI explains quarantined and unknown outcomes. It never clears errors, deletes dedupe keys, changes quote/capture/reservation identities or retries an ambiguous provider mutation.
- **Guest/host/admin presentation:** supplied room and common photography remain separate, photo clicks retain identity, sparse galleries are not padded with stock images, and missing/failed images do not substitute unrelated media. New host drafts do not silently add amenities, coordinates, price, room types, guest counts, reviews or approval. Failed AI/upload responses no longer fabricate successful approval/media. Admin thumbnails use supplied media and flag the review requirement. Public maps/reviews remain explicit missing-data states where canonical sources are absent. The old browser-computed guest fee/tax and active checkout path are contained; accepted canonical pricing/payment remains required.
- **Privacy text:** distinguishes ordinary Google sign-in from Encho operator Ads authorization; hosts do not need personal advertising OAuth. Legal owner/provider approval and deployed domain configuration remain separate evidence.

## Review and rollout limits

### R4 follow-up impact analysis — operational tables

The restore inspection identified three tables exempt from forced RLS. Caller tracing shows host transactions enqueue campaign-scoped jobs and read their refresh receipts, AI attempts belong to hosts, while global payment/Meta jobs and worker claims require service authority. Commercial preference history is administrative; global reads must use the configured service identity rather than silently lose the persisted version under tenant RLS.

Plan: additive migration 019 forces row security on all three tables; host job reads/inserts require owned workflow identity and pristine PENDING state, all claims/updates require trusted service/admin context, AI attempts are tenant-bound append-only evidence, and preference history is service/admin-only. Bind runtime engine and preference reads to existing explicitly configured service identity. No new environment authority or invented actor; no dedupe/history deletion. Extend readiness and non-bypass-role tests, including unauthenticated reads, cross-host inserts, host claim/update denial, global worker flow, immutable attempts/preferences and restore. Rollback keeps evidence and policies; disable dispatch rather than weaken isolation. Real production grants and full caller audit still require deployment acceptance.

This is a substantive remediation pass over identified flows, not a completed semantic review of the entire repository. No payment was taken, ad published, database migrated remotely, production configuration edited, Git commit/push made or deployment triggered in this pass. The original dirty-worktree tracker/opinion and scratch files/deletions are preserved. No generic claim of “bulletproof,” “10/10,” or revenue-scale readiness is made.

Deployment remains gated: review the complete diff and independent security/finance findings; verify production service roles/grants and close the canonical authority gaps; rehearse migration/grants and restore against a production-like disposable schema; release web/worker together with explicit configuration; confirm real readiness/tenant isolation and original-account readback; then run an explicitly bounded pilot. Preserve financial/inventory evidence throughout. Deferred account pooling, automatic failover, in-flight top-ups and unsupported ROI forecasts are not silently enabled.

## Reproducible local checks and visual evidence

Use the declared Node 24 runtime. The HARVO configuration and guest-presentation configuration deliberately disable dotenv. The HARVO tests create their own temporary PostgreSQL cluster over a Unix socket and never select a database from DATABASE_URL. For the build/smoke/browser scripts, invoke with a clean environment, e.g. `env -i PATH="$PATH" node …`; provide HARVO_POSTGRES_BIN explicitly when needed.

- `npm run test:marketing` — isolated financial/provider/queue/tenancy/realtime/restore contracts.
- `npm run test:guest-presentation` — isolated public-property and host-preview truth contracts.
- `npm run lint` and `npm run typecheck` — project lint and both application/server compilation contracts.
- `node scripts/verify-harvo-build.mjs` — clean-environment client/server build, private SQL packaging and public-artifact checks. Prints the isolated build directory.
- `node scripts/deployment/smoke-runtime.mjs <isolated-build-directory>` — compiled local runtime only, with outbound connections blocked.
- `node scripts/verify-harvo-monitoring-ui.mjs` and `node scripts/verify-guest-presentation-ui.mjs <isolated-build-directory>` — actual component browsers, explicit local fixtures, no external traffic.

Saved views: [host monitoring](artifacts/remediation-browser/host-1440.png), [mobile host monitoring](artifacts/remediation-browser/host-390.png), [admin recovery](artifacts/remediation-browser/admin-1440.png), [property calendar](artifacts/remediation-browser/calendar-1440.png), [guest property](artifacts/remediation-guest-browser/guest-1440.png), [mobile guest property](artifacts/remediation-guest-browser/guest-390.png), [empty property](artifacts/remediation-guest-browser/empty-390.png), [host builder](artifacts/remediation-guest-browser/builder-1440.png). Images are labelled fixtures, not real customer property/performance data.

## Final compiled release checks

On Node **24.19.0**, the clean-environment client build, server compilation, private SQL packaging and public-artifact inspection passed. The isolated build contains 40 public files; migrations 017/018/019 are packaged privately. This is a build artifact, not a deployment.

The compiled runtime smoke passed with all outbound connections blocked: web liveness 200; missing/unconfigured database readiness 503; canonical origin accepted and deceptive suffix origin rejected; private server/source/env routes 404; canonical SPA route served; SIGTERM drained with a clean exit. The unconfigured worker exited fail-closed, and importing its module did not start work. Neither database readiness nor live provider functionality is claimed from this smoke.

Final `git diff --check` passes. Fifty-two preserved original tracker/opinion/scratch files match their baseline hashes and all 33 original scratch deletions remain deleted. No broad staging, commit, push, remote migration or deployment occurred. [Machine-readable evidence and source hashes](artifacts/remediation-verification.json) identify this local source snapshot; [monitoring browser evidence](artifacts/remediation-browser/verification.json) and [guest browser evidence](artifacts/remediation-guest-browser/verification.json) describe the twelve viewport checks.
