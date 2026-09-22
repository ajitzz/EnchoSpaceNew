# Dynamic AdTech execution verification

Authority: founder's autonomous ADT-0 through ADT-7 directive, 22 September 2026. This record distinguishes local software evidence from external staging, provider and production acceptance.

**Latest ADT-7 update:** the later founder instruction explicitly authorized primary Neon from `.env`, migrations 032–035 and Listing 1 for a zero-spend paused canary. The migrations committed with matching checksums and passing AdTech catalog/minimum-grant inspection for `encho_app_prod`. Actual login remains unverified; production still uses the RLS-bypassing owner role. The production VARCHAR policy-rendering discrepancy is corrected and tested locally. Live geography preflight cannot resolve the required exact district, so no ad was created. The [production rollout report](../implementation/ADTECH_PRODUCTION_ROLLOUT.md) and [new receipt](ADTECH_PRODUCTION_ROLLOUT_RECEIPT.json) preserve the exact results. ADT-7 remains PARTIAL; do not overwrite the historical local receipt below.

**Current validation:** baseline `e4b9af4` full suite **1,947 passed / 0 failed / 0 pending, 155 files**. Subsequent narrow catalog-check correction: **47 targeted tests passed**, including both TEXT/VARCHAR schemas and adversarial RLS checks. TypeScript, lint, isolated client/server build, compiled runtime smoke and 24 fixture browser scenarios pass. The baseline full run is not represented as a full run of the later correction.

## ADT-0 — locally verified

Typed shared contracts cover profiles, canonical exact-paise price evidence, provider-specific geography and campaign strategy snapshots. Price intervals are read from versioned registry data; approved boundaries and budget hypotheses are seeded in migration SQL, not JSX or route constants. Unclassified prices and ambiguous room/entire-stay bases fail explicitly. Capability checks refuse unsupported automatic placements and unintegrated lead conversion authority rather than silently changing campaign type.

Verification: `adtech_contracts.test.ts`, **25 passed**, Node 24.19.0, compact isolated test runner. Exact price boundaries, gaps/overlap, inexact numeric input, unsupported currency/basis, provider compatibility, district requirement, duplicate geography and invalid coordinates are covered. The initial shell Node 20 invocation correctly refused to run; all recorded successes use the bundled Node 24 runtime.

## ADT-1 — locally verified

Migration 032 takes transaction advisory lock `82749102`, creates forced-RLS registry/version/release/audit tables and database seed profiles. Published evidence is immutable. Current release changes validate contiguous non-overlapping member intervals and predecessor identity. Registry mutations verify persisted administrator role, use idempotency receipts and audited CAS publication/rollback. Admin routes are mounted after existing v2 authentication. Existing campaign endpoints are unchanged.

Verification: `adtech_registry.test.ts`, **7 passed**, disposable PostgreSQL with actual `authenticated_host` and `marketing_worker` logins, both NOSUPERUSER/NOBYPASSRLS. Tests cover concurrent CAS, immutable old versions and audit entries, duplicate replay, host/forged-admin denial, JSON-null budget rejection, insufficient-role truncation and HTTP 403. TypeScript application compilation passes. Development tests exposed PostgreSQL's non-immutable text conversion in a generated hash expression and excessive locking privilege requirements; hashes are now computed by an insert trigger, and immutable profile rows use an advisory serialization lock without granting UPDATE.

Seed refinements: use Feed placements compatible with the existing still/carousel path initially; add Stories/Reels only with tested media/capability support. Radius override seed bounds are provisional editable guidance, not asserted provider limits. Registry publication is never ad activation.

## ADT-2 — locally verified

Migration 033 provides immutable corridor/geography evidence and CAS current-version pointers under forced RLS. Provider adapters separate provider-key resolution from independent Indian country/city/district evidence. The server-only geocoding adapter requires `HARVO_GEOCODING_API_KEY`; missing authority fails closed. Seed destinations identify Wayanad, North Goa and South Goa only: no guessed provider IDs or pre-approved geographic targets.

Verification: **8 geography/registry tests passed**, real non-bypass PostgreSQL roles and synthetic provider responses. Tests cover exact administrative type, no state substitution, coordinate evidence, duplicate rejection, CAS and evidence immutability. TypeScript passes. These are local adapter checks, not proof that Meta offers each named district.

## ADT-3 — locally verified

Migration 034 binds immutable price/profile/release/corridor/compiler evidence to `(campaign_id, revision)`. Saving uses canonical price and ownership checks, current-release references, exact selected corridor and bounded radius overrides. Readback uses the saved snapshot. Host views contain public feeder coordinates only. No private stay coordinates or provider credentials are projected.

Meta compiles city/custom radii, district exclusions, allowed placements/demographics/bidding and attribution. Google compiles proximity criteria, negative district locations, negative keywords and integer target CPA micros. New readback checks quarantine mismatched provider settings through existing unknown-outcome handling. Existing financing/approval checks remain in place. `HARVO_ADTECH_ENABLED=true` requires bindings on new/revised drafts; legacy bound campaigns remain readable when the adoption flag is off.

Verification: **171 tests passed in five targeted suites** (6 new binding/compiler tests plus existing Search, Meta and workflow tests). TypeScript passes. Admin release changes preserve old payload fingerprints; stale selections, tampered hashes, foreign tenancy and price changes reject; native readback mismatch tests pass.

## ADT-4 — locally verified

The administrator workspace at `/admin/marketing/adtech` provides profile authoring, saved-versus-published diffs, CAS release/rollback, audited history, provider-resolved corridor authoring and a public feeder map. Exact district exclusions remain locked and labeled; no unverified district polygon is invented. The existing admin navigation and hard-reload route are connected. Unsupported provider options remain capability-blocked, including automatic placements without proven Audience Network exclusion and lead conversion without canonical authority.

Verification: **4 focused UI tests**, authenticated API non-admin 403 checks in the registry suite, and initially **12 browser scenarios** at 1440/390 widths. Browser checks exercise the real components with fixture APIs and blocked external networking, including keyboard controls, reload routing and horizontal overflow. They are not deployed authentication or provider acceptance tests.

## ADT-5 — locally verified

Campaign Studio resolves its owned listing's canonical price, active profile and public feeder evidence; SQL-managed presets supply exact media/daily guidance. A quick-preparation action makes a neutral listing-derived draft without bypassing rights/review/funding. The optional host panel searches approved feeder cities, selects inclusions, bounds radius sliders and preserves mandatory exclusions. Google language and historical keyword research remain available; feeder-city research explicitly differs from compiled proximity/exclusion coverage. Hosts cannot supply an executable strategy or remove the district guard.

Verification: **14 focused host/binding/UI tests** at the milestone exit and **20 browser scenarios** after integration. Stale requests, changed selection authority, all three tiers, empty/bad evidence and bounded override behavior are covered. Workflow transaction tests subsequently prove that parent/revision/strategy/creation receipt commit or roll back together, with stable idempotent replay.

## ADT-6 — locally verified

Migration 035 and the dedicated research worker implement canonical public-location request coalescing, SQL policy quotas, lease fencing, bounded retries with jitter and a dead-letter state. Gemini output is untrusted structured proposal input; provider and independent geographic authority must resolve the exact cities/district before a `PROPOSED` record is retained. Admin approval atomically records review and saves an unpublished corridor version. Corridor release remains separate. Audited failed-job retry preserves prior evidence. No research operation creates an ad or moves funds.

Verification: **10 real-PostgreSQL inference tests and 2 UI tests**; the integrated browser run passes **24 scenarios** across desktop/mobile. Quota ceilings, concurrent claims, stale fencing, malformed output, private-data exclusion, review CAS, immutable proposal evidence and retry authority are checked. Inference runs in its own process so slow research cannot delay the critical pause/refund/inventory queue.

## ADT-7 — local release checks; external canary not executed

The founder explicitly confirmed **staging is not configured; continue local verification**. No `.env`/`.env.local` remote database was used. The rollback rehearsal tests execute exact 032–035 SQL and grants on disposable PostgreSQL, including a non-superuser/non-BYPASSRLS migration owner and restricted runtime connections. They use fixture predecessor schemas/history and do **not** attest a full 001–035 bootstrap or Neon.

**12 catalog/rehearsal tests** verify migration lock contention, exact history/checksums, transactional rollback, RLS/policy integrity, minimum grants, immutable trigger/function bodies and deliberate tamper rejection. Development found a non-bypass seed-order issue and corrected it within the migration transaction. Full migration readiness still requires the actual staged runtime login.

A final spending-control review added **4 provider-control tests**: published identities carry revision/hash references; spending operations reload the exact immutable strategy before and after remote control. Missing binding or remote geographic drift prevents spending; safety pause remains available. Original SQL errors survive transaction rollback instead of being hidden by a failed context-restoration query.

Final regression/build/runtime results are recorded below after completion. Current local ADT milestone count: **7/8 (87.5%)**. Historical marketing acceptance remains **5/10**. External provider validation, named paused canaries and production/legal/checkout/consent gates remain separate. The [delivery and staging runbook](../implementation/ADTECH_STRATEGY_DELIVERY.md) records scope, limitations and rollback.


### Final local release record — 22 September 2026

| Check | Observed result |
|---|---|
| One full regression sweep | **1,940 passed / 5 failed / 0 pending**, 155 files. All failures were in the existing legacy analytics date suite. All 85 added AdTech tests passed. |
| Repair and focused re-verification | **80 passed / 0 failed**, five affected analytics/reporting/parity suites, including two new +14-hour-session regression cases. This resolves the five observed failures. No second full-suite run or unperformed all-green full receipt is claimed. |
| TypeScript | Application no-emit and strict server compilation both pass. Server compilation was rerun after the final telemetry repair. |
| Lint | Passes; existing Babel large-file styling note for `HostMarketing.tsx` remains. |
| Client/server build | Isolated Node 24 build passes; private server SQL packaged and public artifacts checked (41 files). Existing bundle-size warnings remain. No remote configuration is loaded. |
| Compiled runtime | Web liveness, explicit unconfigured-database 503, private-path rejection, origin checks and clean SIGTERM pass. Critical marketing and new AdTech research workers both fail closed without configuration and are safe to import. |
| Browser | **24 passed**, actual components with fixture APIs, desktop 1440/mobile 390; external networking blocked. Public basemap service availability is not asserted. |
| Database security | Exact 032–035 rollback rehearsal, non-bypass migration-owner seed execution, restricted runtime catalog, adversarial RLS/grant/trigger checks pass. |
| Staging/provider | Not configured/not run. No 032+ remote migration, provider campaign or paid canary. |

The date failures were an existing storage-boundary defect exposed by the IST/UTC day difference: raw logs use `TIMESTAMP` without timezone, but default/session-local `NOW()` inserts differed from UTC rollup interpretation. Both legacy delta-write branches now explicitly insert UTC wall time; fixture event inserts use the same contract. Tests exercise a non-UTC connection with and without the optional correction column. Existing stored timestamps are not shifted because their original timezone is unknown.

The initial full sweep covered 1,945 tests; two additional regression cases were added during repair. The current 1,947-test inventory has coverage across that sweep and the targeted reruns; it is **not** described as a single clean 1,947-test run. Machine-readable evidence: [ADTECH_LOCAL_RELEASE_RECEIPT.json](ADTECH_LOCAL_RELEASE_RECEIPT.json).

**Milestone Status: ADT-0–ADT-6 COMPLETE (local); ADT-7 PARTIAL (local checks complete, staging/canary outstanding).**
**Current Completion Status: 87.5% (7/8 ADT milestones), separate from historical marketing acceptance at 5/10 and unverified production readiness.**
