# HARVO — Local validation record

Date: 13 September 2026. Scope: inspected local workspace, not deployed production. The original audit below attempted no application fix. Execution M1 is recorded separately here; unrelated audit failures remain open.

## Latest execution verification — discussion 010 / marketing M1

[M1_VERIFICATION.md](M1_VERIFICATION.md) records 207 passing tests in six suites, with 64 tests exercising a temporary real local PostgreSQL cluster and explicit provider HTTP fixtures. No pg-mem, dotenv, application startup, Neon or live provider connection was used in these suites. Full app/server typechecks, Vite production build and server compilation passed. Existing large-bundle warnings remain. The server's existing `@ts-nocheck` means a successful project typecheck alone does not establish server type safety.

Independent review issues were fixed and tested. M1 verifies paused Google preparation locally; it does not resolve the prior guest/payment/Meta findings, run the entire legacy test suite, accept live advertising or change the current 2/10 whole-funnel readiness judgment. No application UI was redesigned in this milestone.

## Results

| Check | Outcome | Interpretation |
|---|---|---|
| `npm run typecheck` | PASS, exit 0 | Client/server TypeScript commands completed. `server.ts` contains `@ts-nocheck`, so this does not establish server type safety. |
| `npm run build` | PASS, exit 0 | Local production bundles generated; no deployment or browser acceptance implied. |
| M2/M6A selected suites | 38 passed, 19 failed; 57 collected | Guest presentation and canonical fetch-contract regressions remain. |
| Six selected domain suites | 69 passed, 4 skipped; 73 collected; one suite setup failure | Useful regression evidence under mocks; FSM behavior was not exercised successfully. |
| Application/migration SHA-256 comparison | PASS: 154 files checked, zero changed | Compared with the initial SOURCE_INVENTORY.json snapshot after documentation edits and local checks. |
| Documentation references | PASS: 1,195 local file links across eight Markdown documents resolved | File existence checked; individual source-line accuracy remains part of contextual review. |

Combined selected test collection: **130 tests: 107 passed, 19 failed, 4 skipped**, with the FSM suite failing during setup. This is not the complete project test suite or a release certificate.

## Build evidence

Observed runtime: Node 20.19.6, installed TypeScript 5.9.3, Vite 6.4.3. Vite transformed 3,390 modules and reported 18.50 seconds for its build stage. The command exited successfully.

Warnings included a vendor-maps → vendor-react → vendor-maps circular chunk relationship, large bundles, and Vite's handling of `NODE_ENV` in an environment file. No environment values or secrets are reproduced here.

Selected output sizes, before / after gzip:

| Bundle | kB | gzip kB |
|---|---:|---:|
| vendor-react | 1,440.41 | 414.43 |
| ListingDetailsNew | 740.34 | 222.36 |
| index | 467.93 | 130.96 |
| AdminDashboard | 452.01 | 93.56 |
| HostMarketing | 441.68 | 89.81 |
| CSS | 371.21 | 43.62 |

PWA generation reported 29 precache entries totaling 4,929.96 KiB. These are output observations, not measured real-user loading times. Source maps were generated. The build created local `dist/` output.

## Guest test evidence

Command selection: `vitest run src/test/m6a_guest_presentation_truth.test.tsx src/test/m6a_interactive_gallery.test.tsx src/test/m2_privacy_and_routes.test.ts`.

| Suite | Passed | Failed | Key observation |
|---|---:|---:|---|
| M6A guest presentation truth | 7 | 17 | Rendered behavior contradicts expected truthful rooms, prices, media, reviews, verification and location fallbacks. |
| M6A interactive gallery | 0 | 1 | Expected modal after room-photo interaction was absent in this harness. |
| M2 privacy/routes | 31 | 1 | Static contract assertion rejects ListingDetailsNew's older `/api/listings/:id` fetch. |

The 17 presentation failures covered fabricated room fallback/empty states, authoritative price disclosure, host-defined room configurations, map and nearby-place fallbacks, review and verification claims, stock images, video fallback, room photo counts/isolation, suppression of unverified reviews/client verification fields, POIs without coordinates, and canonical locality labeling. The existing suite names/assertions and related source should be read together before changing code.

Qualification: the failed M2 assertion alone does **not** prove that the older public listing endpoint leaks raw addresses; its public sanitization was inspected separately. The gallery harness also reported relative-fetch and missing Web Audio environment limitations, so one failure alone does not establish universal browser behavior. Source evidence and actual browser reproduction are separate acceptance steps.

First group duration: 5.14 seconds; exit 1.

## Domain test evidence

Command selection: `vitest run src/test/m3_room_media_authority.test.ts src/test/m4_inventory_holds.test.ts src/test/fsm.test.ts src/test/double_entry_ledger.test.ts src/test/phase2_8_delivery_reducer.test.ts src/test/dynamic_pricing_sync.test.ts`.

| Suite | Passed | Skipped | Observation |
|---|---:|---:|---|
| M3 room/media authority | 28 | 0 | Selected authority assertions passed. |
| M4 inventory holds | 21 | 0 | Selected hold assertions passed under the configured database mock. |
| Double-entry ledger | 4 | 0 | Selected arithmetic/ledger assertions passed; not a complete transaction/currency audit. |
| Phase 2.8 delivery reducer | 7 | 0 | Selected reducer assertions passed. |
| Dynamic pricing sync | 9 | 0 | Selected local behavior passed; this does not prove an external ad price changed. |
| FSM | 0 | 4 | Setup failed because the mock `host_marketing_campaigns` table lacked `host_id`. |

FSM failing operation: test fixture insert into `host_marketing_campaigns (host_id, status, title, budget)`. Error: `column "host_id" does not exist`. This is a setup/schema mismatch, not four observed state-machine assertion failures.

Second group duration: 6.36 seconds; exit 1.

## Isolation and limits

The selected Vitest processes were launched with an explicitly constructed environment, test/worker-disable flags, test-only signing/encryption values and database URLs directed to loopback port 1. No real credentials are retained in this record. The project test setup mocks `pg` using `pg-mem` and intercepts some PostgreSQL operations, including configuration/procedural statements. Import/setup code may still read local environment files; this review does not claim otherwise.

These tests do not demonstrate real Neon RLS enforcement, concurrent Postgres row locks, process-crash atomicity, webhook retries against providers, actual notification delivery, money movement, or deployed configuration. They cannot close findings requiring those properties. No live payment, ad publish, migration, seed, production database inspection, or deliberate external delivery was performed.

The Playwright end-to-end suite was not run: its application startup can load environment/database configuration and needs a separately controlled test environment. No signed-in production UI, mobile device, accessibility audit, or visual browser acceptance was performed.

Raw command output was captured temporarily under `/tmp/harvo-typecheck.log`, `/tmp/harvo-build.log`, `/tmp/harvo-tests.log` and `/tmp/harvo-domain-tests.log`. Temporary files are not durable project evidence and may disappear; the relevant outcomes and qualifications are recorded here. Raw rendered HTML and verbose logs were not copied into HARVO.

## Release conclusion

### Discussion 008 — Research and interactive concept checks

No application tests/build were rerun for research and a conversation-only concept. The standalone wrapper was inspected in isolated headless Chromium using the installed Playwright library, without launching/importing Encho's server or reading application credentials. There are no ad/payment/network calls in the concept.

Observed interaction checks: changing conversion assumptions recalculates modeled contribution; content approval alone leaves funding unverified and activation disabled; all selected scenario gates enable only a request preview, which still does not mark delivery live; creative format changes 9:16↔1:1. No page JavaScript errors. Eighteen layout checks covered three views, light/dark and approximately 1024/736/360px inner widths with no horizontal overflow. Desktop-light and mobile-dark screenshots were visually inspected. These checks establish only local concept behavior, not production usability, accessibility conformance, performance or conversion lift.

Concept source: `/Users/ajit/.codex/visualizations/2026/09/13/01a09970-36d7-7273-984f-338a1ec54e3f/encho-campaign-studio.html`. Other files in that directory are local preview/inspection aids, not deployed artifacts.

Research sample calculation verified with the two-proportion normal approximation: baseline 0.02, alternative 0.03, two-sided alpha 0.05, power 0.80 produces 3825.15, rounded up to 3826 observations per arm. This is an illustrative planning assumption; not an Encho measurement or universal experiment threshold.

Final discussion 008 integrity check: all 154 inventoried application/migration files still match their initial SHA-256 values. Local Markdown references in HARVO and the five research/record documents resolve; the research report has 24 defined source notes with no unresolved note identifiers. This verifies documentation scope and reference integrity, not the contents of every linked source or production readiness.

### Discussion 007 — Additional paid-funnel checks

Five suites executed in an isolated test subprocess using test flags, disabled background workers, loopback port 1 database URLs, and test-only/blank selected credentials as in the isolation qualifications above:

| Suite | Passed | Skipped | Outcome |
|---|---:|---:|---|
| campaign_reactor_core.test.ts | 13 | 0 | Selected assertions passed. |
| phase2_7_m7_host_transparency.test.ts | 9 | 0 | Eight assertions are true-equals-true; one checks a locally constructed mock object. No production transparency certification. |
| phase2_8_4_canonical_truth_consumption.test.ts | 0 | 1 | Setup fails: mock table missing title. |
| phase3_1_host_control_center.test.ts | 0 | 6 | Setup fails: mock table missing host_id. |
| phase3_3_dco_engine.test.ts | 0 | 15 | Setup fails: mock table missing host_id. |

**44 collected: 22 passed, 22 skipped; three suite setup failures; exit 1; duration 3.57 seconds.** These are additional results, not a rerun/replacement of the initial 130-test record. Raw temporary output: `/tmp/harvo-paid-funnel-tests.log`. Skipped assertions were not exercised; do not describe them as 22 behavioral failures.

`node docs/harvo/probe_paid_funnel.mjs > docs/harvo/PAID_FUNNEL_PROBE.json` completed successfully. This parses source without importing the app, transpiles seven extracted projection methods plus syncCampaignSpend, and supplies a fixed clock and in-process database stubs. No provider/network API or real DB is available to those extracted functions. Synthetic IDs exist only in the diagnostic fixture/output.

Observed: ten minutes for the synthetic active campaign produced 72 spend, 900 impressions, 20 clicks and SQL write intent; projection builders produced fixed distributions; proof was marked verified without remote IDs or evidence; absent pricing became 3500 and synchronized. The JSON includes source hashes/anchors. This confirms deterministic source behavior, not a real debit, server-route execution, database transaction or provider integration.

No application/build configuration was changed. Build/typecheck were not repeated for documentation and the offline diagnostic. No live ads, payment, migration, production database or notification was exercised. Current marketing readiness judgment: 2/10 with open correctness failures, not merely missing stress tests.

Final integrity check: all 154 application/migration files matched the initial inventory SHA-256 values; both diagnostic source hashes matched the current files. Local Markdown file references in the six updated/new audit documents resolved. This verifies documentation-only scope and link existence, not production readiness.

Compilation succeeds, but selected acceptance tests fail and important source findings remain unresolved. **No production-readiness or milestone-acceptance claim is warranted.** Preserve the current legal/provider gates and M6A's awaiting-independent-acceptance status.

## Current continuous execution verification — 13 September 2026

The final scoped suite passed 591 tests in 24 files. Whole-project TypeScript, current strict server build and current Vite client build passed; 29 isolated browser checks passed. Adversarial fixtures use local PostgreSQL and injected provider/payment transports. One read-only operational schema inspection of the configured database separately confirmed missing inventory/HARVO tables and a connection role bypassing RLS; no remote changes were made. Current evidence and unresolved milestones: `CONTINUOUS_EXECUTION_VERIFICATION.md`, `CONTINUOUS_SOURCE_HASHES.json`, `artifacts/continuous/`, and the execution plan. Historical reports below/above do not certify current live delivery or supersede those findings.
