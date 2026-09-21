# Search Portfolio execution verification

Authority: HARVO-031, 21 September 2026. Blueprint: `docs/implementation/SEARCH_PORTFOLIO_SP0_SP1_BLUEPRINT.md`.

## Historical first-batch acceptance boundary

This is the first SP0 execution batch. SP1 product direction is approved and its contracts/threat model are documented; no SP1 schema or pooled funding is implemented by this batch. SP0/SP1 remain in progress. Historical marketing completion stays at 5/10 (50%); production readiness remains blocked.

The existing dirty worktree is preserved. The original strategic RFC remains unchanged at SHA-256 `051add7b2c9d394bb32d51562b9450307f730a570127e1f6d3a6718b3c4282b1`. No production database, paid campaign, payment, commit, push or deployment was performed.

## Implemented corrections

| Area | Result | Evidence |
|---|---|---|
| Host/admin projection | New `delivery.submitted`; host provider identity is null; internal event payloads administrative, with an explicit allowance for the host refund reason | Real-PG HTTP tests: workspace/detail/events/pause, forged admin claim, demotion and other-host access |
| Host controls | Pause, refresh, cancellation/settlement visibility use the submission flag; provider identity renders only in the admin evidence view | DOM tests and six Playwright desktop/mobile checks |
| Meta failed status reads | Local correlation ID, API version, bounded error/trace fields and duration; unknown result preserved; no raw message/body | Real-client fixture and malicious diagnostic canary test |
| CI evidence | Seven-day artifact with counts and relative test filenames only; raw logs/JSON stay on ephemeral runner; original failing test exit preserved | Sanitization, invalid-path, unknown-status and suite-setup-failure tests |
| Inventory benchmark | Empty isolated PostgreSQL, explicit prerequisite SQL, whole migrations 003–007, one relative UTC date anchor; one success, 99 conflicts, two held nights | Real 100-request concurrency test; missing PostgreSQL prerequisites remain fatal |
| Historical Google authentication suite | Removed unsupported credential-free success expectation; real transport with observed manager and serving customer, read-only permission evidence, missing credentials, mismatch and leak rejection | Eight cases pass; no runtime authentication weakening |

The projection intentionally narrows the host response contract. Client/server rollout and cached-client refresh must be coordinated; no such deployment was performed. Stored provider identities, immutable financial/audit evidence and admin diagnostics remain available.

## Verification

All tests use Node **24.19.0**, stripped ambient configuration, disabled dotenv and a network boundary allowing only local fixtures. The Vite build used `envDir:false`; compiled smoke ran in a temporary directory with outbound calls blocked.

| Check | Result |
|---|---|
| Fresh complete pre-change suite | 1,298 passed / 127 failed / 268 pending or unexecuted; 46 failing files |
| First targeted regression batch | 63 passed across five files |
| Corrected historical Google authentication suite | 8 passed |
| Complete intermediate suite, before the auth-test correction | 1,307 passed / 127 failed / 268 pending or unexecuted; same 46 failing files |
| Final combined suite | **1,314 passed / 125 failed / 268 pending or unexecuted; 83 passing files / 45 failing files** |
| Repository lint | Passed; changed test/benchmark files checked again after follow-up |
| Application TypeScript | Passed; repeated after follow-up |
| Client and server compilation | Passed |
| Public build audit | Passed; 40 files |
| Compiled web/worker smoke | Passed: private paths denied, unavailable DB stays 503, worker fails closed, import safe, SIGTERM drains |
| Local browser | Six checks pass: host/admin/calendar at 1440 px and 390 px; no overflow or uncaught page errors |
| Diff whitespace | Passed |

The final complete run adds no newly failing file or previously passing assertion that is now failing/pending. The corrected Google authentication file is resolved; all 45 other baseline failures remain open. The current marketing project passes 995 tests across 52 files; guest presentation remains 33 tests across four files. These are local fixture results, not live provider or production certification.

Local diagnostics: `test-results/sp0-baseline.json`, `sp0-after.json`, `sp0-final.json`, corresponding safe summaries, `sp0-targeted.log`, `sp0-google-auth.log`, `sp0-typecheck-final.log`, `sp0-lint.log`, `sp0-lint-final.log`, `sp0-build.log`, `sp0-browser.log`, `sp0-smoke.log`. Raw test files are ignored and are not CI artifacts. Browser screenshots: `/var/folders/xz/n8vtdw5x6js6lj7q5y211s3h0000gn/T/encho-monitoring-browser-VBYQWH/`.

## Remaining release work

1. Disposition and repair every remaining historical failure using current source contracts; see `SP0_RELEASE_FAILURE_REGISTER.md`. Missing fixtures are not automatically harmless.
2. Complete version-bound Google/Meta status coverage. This batch adds Meta failure diagnostics, not a complete enum matrix or job-correlated diagnostic console.
3. Close concurrent recovery-claim and pre-dispatch/uncertain-dispatch handling; expand catalog readiness and immutable-receipt/RLS/grant checks.
4. Verify remote required checks/promotion settings, actual migration/grant rollout and production restore behavior. Local build evidence does not prove these.
5. Finalize SP1 versioned schema/API, pooled contribution/withdrawal/settlement/allocation rules and threat acceptance before activating new features.
6. Retain the existing guest legal, canonical checkout/consent, provider-policy, independent financial review and bounded live-pilot gates.


## HARVO-032 — release-baseline repairs and recovery hardening

The initial results above are historical. Current complete SP0 rerun: **1,748 passed, zero failures, zero pending across 130 files**. Four projects execute in the default command: current marketing contracts, guest presentation, legacy pg-mem contracts, and legacy real-PostgreSQL contracts. Fixture migrations are source-backed; unsupported date/locking/CTE semantics run on disposable PostgreSQL instead of being skipped. Redundant identical retired activation cases were consolidated; positive financial and provider behavior remains covered by current contract suites.

Verified corrections: Google sign-in returns authenticated 401/503 without weakening RSA/token validation; UTC rollup boundaries are explicit; missing legacy telemetry evidence columns have migration 021; retired escrow release returns 410 before money/state mutation; Google v25 and Meta v26 enums fail closed on unknown/version-mismatched values; migration 022 introduces durable recovery claims with one live reader per job, bounded timeout, immutable terminal history and no provider write or financial release. Recovery UI retains uncertain-response keys and permits an explicit new inspection only for known terminal failures. Catalog readiness requires packaged migration checksums, non-bypass roles, forced RLS, exact recovery policy/trigger contracts, the unique live-claim index and least-privilege runtime grants.

Validation: lint and both TypeScript checks pass. Ordinary build/public audit pass; isolated envDir:false build `/tmp/harvo-release-build-whkpQO` and compiled smoke pass (DB-unavailable correctly remains 503). Six local desktop/mobile browser scenarios pass at 1440/390 px, no overflow or uncaught errors. Recovery/catalog/restore tests run real disposable PostgreSQL; they do not access Neon. Raw diagnostics remain ignored local files: `sp0-gate.json`, `sp0-recovery-claims.log`, `sp0-catalog.log`, `sp0-isolated-build.log`, `sp0-smoke.log`, `sp0-browser.log`.

**SP0 status:** local implementation/test release baseline verified; operational release gate remains open for actual production migrations/grants, remote required checks/protection, independently reviewed deployment and pilot evidence. GitHub CLI is unavailable in this environment; branch protection has not been verified. No commit, push or deployment is inferred. Historical marketing acceptance remains 5/10; SP0–SP7 production acceptance is separate.

**SP1 in progress:** strict two-product/contribution service contracts and immutable canonical property fact snapshots have initial implementation with 10 passing PostgreSQL tests. No pooled funding or new provider publication path is enabled by those contracts. Subsequent verification must include the SP1 HTTP composition, asset authority, and downstream product binding.

## HARVO-032 — SP1–SP3 integration and final local gate

The preceding initial SP1 paragraph is superseded by this integration record. Detailed implementation, threat boundaries, exact deployment privileges and rollback are in [SP1–SP3 delivery](../implementation/SEARCH_PORTFOLIO_SP1_SP3_DELIVERY.md). The original Strategic RFC remains unchanged (SHA-256 `051add7b2c9d394bb32d51562b9450307f730a570127e1f6d3a6718b3c4282b1`).

**SP1:** migrations 023/025, source-grounded room/listing/amenity facts, immutable approved asset snapshots and atomic new dedicated revision/product binding are connected through runtime and authenticated HTTP. Thirteen real-PostgreSQL tests cover capture idempotency, ownership, forged roles, stale/unpublished/changed facts, JSON-null rejection, actual prepared-image bytes and independent approval, downstream freshness and distinct non-transferable pooled contracts. The dedicated product remains compatible with historical revisions. Free-text copy and pooled accounting are not represented as complete.

**SP2:** migration 024, a Google v25 read-only Keyword Planner adapter and host research/selection panel are integrated. Evidence is historical; null and zero stay separate. Tenant-scoped caches, durable cross-instance coalescing, shared serving-customer lease/cooldown, stale-fence rejection, two distributed request budgets and sanitized failures are tested. No alternate customer/URL or automatic mutation is accepted. Configured-account production research has not run. RFC-T1 Meta residents-only capability remains unresolved; no unsupported fallback is enabled.

**SP3:** migration 026 indexes bounded normalized keyword/geo/language/date/account scopes. An authenticated admin can request shadow-only overlap receipts and record idempotent immutable evidence reviews. Seven real-PostgreSQL observer tests cover scope uncertainty, other accounts/date ranges, RLS/forged roles, immutable records, concurrent review replay and a held campaign row lock; two UI tests cover uncertain-response identity and stale cancellation. No critical-path or main-worker invocation exists. Separate observer deployment, representative live coverage and false-positive measurement remain outstanding. Nine catalog tests validate exact policies/grouping, triggers, minimum privileges and forced RLS. A permissive regrouping of ownership conditions is explicitly rejected by readiness.

**Regression fixes during integration:** preserve the original canonical listing hash by copying before product attachment; use the approved host `delivery.submitted` control predicate; update tests to provide the actual payment gateway constructor dependency; keep existing TypeScript contracts strict. A test hook's accidental returned mock was corrected instead of lengthening its timeout. Original failing local checks remain in the ignored diagnostic files; they are not the final release result.

**Browser evidence:** eight screen/viewport combinations passed at 1440/390 pixels: host, admin, calendar and keyword research. Tests exercise hidden host provider identity, reachable pause/refresh controls, explicit research selection, admin overlap receipt/review and pause recovery. No overflow or uncaught page errors. Screenshots at `/var/folders/xz/n8vtdw5x6js6lj7q5y211s3h0000gn/T/encho-monitoring-browser-AQFxKC/`; these are local fixtures, not screenshots of a deployed feature.

**Full runs:** first integration 1,787/1,787 across 134 files; subsequent integration 1,800/1,800 across 136 files, both with zero failures/pending. The final policy-grouping regression is recorded with the final artifact verification below. Raw `sp3-*.log/json` files remain ignored local diagnostics; CI retains only the sanitized summary.

**Remaining mandate:** SP0 operational acceptance, remaining SP1 pooled contracts/threat acceptance, actual SP2 provider capability evidence, scheduled/live SP3 assessment, RFC-M1 token/consent integration, SP4 economics/scheduling/warning policy, SP5 collection/accounting/opt-in surfaces, SP6 truthful multi-asset provider pipeline, and SP7 complete operating/pilot acceptance remain unfinished. Founder allocation and pilot inputs were requested. Their absence is not approval of a default. No actual Neon migration, provider spend, Git commit/push or deployment occurred in this batch. Historical milestone acceptance remains **50% (5/10)**; this is not a claimed percentage of SP0–SP7 production completion.

### Final artifact verification — 21 September 2026

| Check | Final observed result |
|---|---|
| Complete isolated Node 24 default suite | **1,801 passed / 0 failed / 0 pending, 136 files** (`sp3-gate.json`) |
| Application TypeScript | Passed (`sp3-gate-types.log`) |
| Server TypeScript | Passed in final isolated build |
| Repository lint | Passed (`sp3-gate-lint.log`); pre-existing oversized HostMarketing transform notice remains |
| Isolated client/server build | Passed; `/tmp/harvo-release-build-7aoWTr`, envDir false, private server SQL packaged, 40 public files audited (`sp3-gate-build.log`) |
| Compiled smoke of that artifact | Passed; private paths rejected, unavailable DB correctly 503, worker fail-closed/import-safe, SIGTERM drained (`sp3-gate-smoke.log`) |
| Host/admin/calendar/research browser fixture | Eight checks at 1440/390 px passed, no overflow or uncaught errors (`sp3-browser-final.log`) |
| Worktree whitespace check | `git diff --check` passed |

Final smoke intentionally has no production database or provider access: it proves fail-closed behavior, **not** successful readiness of the actual Neon deployment. Non-bypass catalog, tenant isolation, claims and restore evidence comes from the separately executed disposable PostgreSQL fixtures. Existing bundle-size warnings remain; no new production performance/SLO acceptance is claimed.


## HARVO-033 — 21 September 2026 local verification

The founder accepted the prior SP0–SP3 delivery; the earlier remaining-mandate paragraph is historical. Current detailed scope is [final delivery report](../implementation/SEARCH_PORTFOLIO_FINAL_DELIVERY.md). This run implements SP4 scheduling/advisory guidance, signed consent/touchpoints, reviewed spatial assets, inquiry/outcome integration and an explicitly incomplete paid-pool foundation.

| Check | Observed result and limit |
|---|---|
| Targeted development | Flight/preflight, attribution, consent, destination contracts, spatial stories/transport, inquiry privacy/rollups, monitoring UI and portfolio catalog tested on their current contracts. Real disposable PostgreSQL, including non-bypass roles. |
| Single full isolated regression | **1,843 passed / 1 failed / 0 pending across 143 files**, 167 seconds, `/tmp/harvo033-final-regression.json`. The failed attribution test is recorded below; this result is not called a clean full run. |
| Attribution repair and affected rerun | **23 passed / 0 failed across five files**: attribution links, consent, spatial story authority, provider spatial transport and inquiry outcomes. `/tmp/harvo033-attribution-final.log`. No second full-suite loop. |
| Application TypeScript | Passed, `/tmp/harvo033-final-types.log`. |
| Server TypeScript | Passed in isolated build and after the attribution correction, `/tmp/harvo033-server-recompile.log`. |
| Lint | Repository scan had one `prefer-const` issue in a test fixture; corrected and affected files passed lint. `/tmp/harvo033-final-lint.log`, `/tmp/harvo033-final-scoped-lint.log`. Existing oversized HostMarketing transform notice remains. |
| Client/server compilation | Passed, `/tmp/harvo-release-build-178tDw`, envDir false, private SQL packaged, 40 public files audited. Server recompiled into this artifact after the attribution correction. Existing client chunk-size warning remains; no SLO acceptance. |
| Final compiled smoke | Passed after correction, `/tmp/harvo033-postfix-smoke.log`: private files denied, absent database correctly 503, worker fail-closed/import-safe, SIGTERM drained. No Neon or provider. |
| Desktop/mobile browser | **20 passed**, 1440/390 px, no overflow or uncaught errors. Artifacts `/var/folders/xz/n8vtdw5x6js6lj7q5y211s3h0000gn/T/encho-monitoring-browser-A99W06/`; `/tmp/harvo033-browser18.log`. Actual components with local HTTP fixtures only. |
| Bounded corridor staging | Wayanad, Coorg, Goa fixture cases pass background occupancy/pause/funds-unchanged checks. These are not real property pilots or live provider spend. |

The full-run failure proved that a primary attribution URL with an invalid fragment reached `marketing_campaign_revisions` before rejection. The minimal attribution test principal deliberately lacked that unrelated table permission. The correction rejects a non-card/non-sitelink fragment before the query; it does not broaden grants or weaken the assertion. Valid story fragments still require exact immutable revision section evidence, covered by the affected rerun. The test fixture's destructuring declaration was also split into a constant key and mutable resource name for lint; runtime behavior is unchanged.

Paid SP5 execution and observed settlement remain absent and unavailable in production composition. RFC-M1 canonical Purchase composition, production Neon role/migrations, provider/quality acceptance and a named/budgeted live pilot remain outstanding. No commit, push, deployment or live external financial operation occurred. **Historical completion remains 50% (5/10); full HARVO-033 completion is not asserted.**

## HARVO-034 — local release preparation, 21 September 2026

Founder accepts the six preceding local workstreams and explicitly restricts this run to disposable local PostgreSQL and release checks. No `.env`/`.env.local` Neon endpoint was contacted. See [rollout plan](../implementation/HARVO_034_ROLLOUT_PLAN.md) and the compact [local release receipt](HARVO_034_LOCAL_RELEASE_RECEIPT.json), including exact migration checksums. No live payment, provider publication, deployment, commit or push occurred.

| Check | Actual result and scope |
|---|---|
| Local key provision | Canonical 32-byte base64url key in `.env.harvo-attribution.local`, mode 0600, ignored by Git, explicit-load only. Runtime parsing and signed visitor round trip passed. Existing keys are preserved, not rotated. No secret value was printed or installed in hosting. |
| 027–031 migration/grant rehearsal | **Passed on real disposable PostgreSQL.** New SQL and grants apply, exact portfolio policy/privilege/immutability checks pass under a non-bypass runtime role, then DDL/grants/history roll back. Fixture parent schema and synthetic prior-history metadata do not attest a full bootstrap or Neon. |
| Rehearsal/security tests | **15/15 passed**, including local key handling, endpoint/TLS guards, checksum drift, migration lock contention, owner/privileged role membership and default-privilege overgrant rollback; `/tmp/harvo034-targeted-final.log`. |
| Dedicated/pool boundary | **11/11 pool tests passed**, including new deployment quote-path isolation: an unbound dedicated campaign is allowed through the product boundary; a consented pool campaign is refused without a quote/reservation. `/tmp/harvo034-dedicated.log`. This is not live ad acceptance. |
| Final complete regression | **1,860 passed / 0 failed / 0 pending across 144 files**, one full run in HARVO-034, 422.60s. `/tmp/harvo034-final-regression.json` and `.log`. This supersedes the current local failing-gate qualification while preserving HARVO-033's historical one-failure result. |
| TypeScript | Application `tsc --noEmit` passed on the final code; `/tmp/harvo034-final-types.log`. Server TypeScript passed in the isolated build and final private output refresh; `/tmp/harvo034-final-server-build.log`. |
| Lint | Full repository scan passed; final changed TypeScript files passed after the last operator/test refinements. `/tmp/harvo034-lint.log`, `/tmp/harvo034-final-scoped-lint.log`. Existing oversized HostMarketing Babel notice remains. |
| Client/server compilation | Passed with envDir false, private SQL packaged and 40 public files audited; `/tmp/harvo-release-build-z0ZB8I`. Server refreshed after final operator-only refinements. Existing chunk-size warning and approximately 4 MiB precache remain; no performance SLO claim. |
| Final compiled smoke | Passed, `/tmp/harvo034-final-smoke.log`: absent database correctly 503, private paths denied, worker fail-closed/import-safe, SIGTERM drained. Actual runtime Node v24.19.0; no database/provider connection. Compiled staging CLI separately refuses missing explicit staging-file arguments. |
| Public secret exclusion | All 40 public build files scanned against the generated local secret without printing it; no match. |
| Browser verification | **20/20 passed**, 1440/390 px, no overflow/uncaught errors; `/tmp/encho-monitoring-browser-FwRbSr`, `/tmp/harvo034-browser.log`. Actual components/local fixtures, not deployed data. Mobile planning and desktop editorial screenshots visually inspected. |
| Remote acceptance | **NOT RUN**, as directed. `.env.staging.local` and isolated Neon target remain founder preparation. No actual staged catalog, runtime login, provider capability, canonical Purchase or named pilot acceptance is inferred. |

The first new key-provision test encountered the isolation harness's deliberately absent dotenv `parse` export. Its test-local mock now exposes the pure parser while keeping automatic dotenv loading disabled; the final full run includes that test. A temporary compiled CLI probe initially lacked its dependency path; with the normal dependency layout supplied it correctly refused to start without explicit staging input. Neither issue required weakening isolation or changing business authority.

**Rollout disposition:** local release checks pass. Dedicated product independence is verified; live activation remains blocked by absent accepted canonical booking/current-consent composition plus external prerequisites. Paid pool checkout remains unavailable. Historical completion remains **50% (5/10)**; staging cutover and M10's real pilot are separate gates.

## HARVO-034 — production migration receipt, 21 September 2026

The founder subsequently authorized the bounded production migration that the preceding local-only record had deferred. This receipt records observed execution against the Neon database used by the current `encho.co.in` Vercel production integration. Credentials and connection strings are intentionally omitted.

| Check | Observed result |
|---|---|
| Target identity | Vercel's production Neon integration and the migration runner resolved to the same direct endpoint and `neondb` database. The unrelated `.env.local` endpoint was not used. |
| Pre-run ledger | Repository migrations through 016 were recorded with valid checksums; the repository has no 008 SQL file. Pending set was exactly 017–031. |
| Persistent runner | `npm run migrate` applied all 15 migrations, 017–031, in lexical order under advisory lock `82749102`; zero failures. |
| Ledger integrity | Independent SHA-256 recomputation found 15/15 rows present and valid. Application timestamps span `2026-09-21T10:23:04.703Z` to `2026-09-21T10:23:10.783Z`. |
| Lock release | `pg_locks` reported zero granted holders for the migration lock after completion. |
| Route protection | Public request returned the expected HTTP 401. The existing authenticated host session returned HTTP 200. |
| Response contract | HTTP 200 projection contained `listings`, `campaignListings`, `campaigns`, `policy`, `capabilities`, `page` and `listingPage`. |
| Browser acceptance | Host dashboard → Marketing Engine loaded the campaign journal (five campaigns on the first page), campaign creation and refresh controls, without the migration-required banner. |

This closes the reported production migration/workspace blocker. It does not certify provider publication, paid-pool settlement, canonical Purchase, specialist/legal review, remote branch protection or a live pilot. Historical marketing acceptance remains **50% (5/10)**.


### Subsequent AdTech implementation — 22 September 2026

Discussion 034's ADT-0–ADT-6 work is locally delivered. Its separate [execution verification](ADTECH_EXECUTION_VERIFICATION.md) preserves the single full sweep's five legacy analytics failures and successful targeted UTC-boundary repairs. The [delivery/runbook](../implementation/ADTECH_STRATEGY_DELIVERY.md) records migrations 032–035, forced RLS, strategy binding and UI/research scope. No new remote migration was performed. The founder confirmed staging is not configured; no provider canary or historical paid-marketing acceptance is inferred.
