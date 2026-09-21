# Remaining marketing execution — 21 September 2026

Authority: HARVO-028. Baseline: `37803a17100a9efe0ca273022364110e87628644` and the preserved HARVO/decision edits. The pre-existing untracked strategic RFC remains a proposal. This record covers scoped implementation and local verification, not production acceptance or a line-by-line semantic review of the entire repository.

## Implemented boundaries

### Release test isolation

`npm test`, `npm run test:marketing` and `npm run test:guest-presentation` now enter through `scripts/testing/run.mjs`. It requires Node 24, starts Vitest with an environment allowlist and an invalid fixture-only database URL, and puts the same Node executable directory first on PATH for subprocesses. Vite environment loading is disabled. Test setup prevents application dotenv imports from reopening developer credentials. Worker connections are limited to locally created HTTP/socket fixtures and temporary PostgreSQL Unix sockets.

The default configuration runs three projects: migration-backed marketing, isolated guest presentation, and the historical pg-mem suites. Historical failures remain in the default gate; they have not been excluded, relabelled green or replaced with synthetic provider success. The legacy pg-mem harness still cannot certify PostgreSQL locking/RLS behavior. The connection guards are test accident prevention, not a security sandbox for malicious test code.

CI locates PostgreSQL binaries before tests and uploads JSON results and the complete console log even on failure. Pipe failure propagation preserves the failing test exit code; logging cannot turn a failed run green. Test-generated concurrency and restore reports now go to ignored `test-results/harvo/`, preserving dated historical evidence under `docs/harvo/`. Vercel/GitHub remote promotion settings have not been changed or verified by these source edits. A red gate remains a release blocker.

The full-suite investigation also found that the old inventory benchmark deleted rows on a fixed localhost database and swallowed connection-refused failures. `scripts/bench_concurrency_pg.ts` now creates and destroys its own Unix-socket-only PostgreSQL cluster, applies the actual room/hold migration SQL, and never consumes a caller-supplied database URL. Its invoking test uses the current Node executable with an explicit environment and fails when the benchmark cannot run. No missing-database success fallback remains.

### Delivery evidence

Google active-campaign observation checks the exact owned campaign, ad group and ad identities and parentage, configured states, primary statuses and ad-policy review. Meta reads its owned campaign/adset/ad hierarchy and checks account eligibility before reporting an eligible hierarchy. Typed readiness is `ELIGIBLE`, `LIMITED`, `REVIEWING`, `BLOCKED`, `PAUSED` or `UNKNOWN`.

Eligibility is not current delivery. These observations keep `isLive` and `isServingImpressions` false; neither enabled configuration nor cumulative impressions proves present-tense serving. A paused child cannot establish a paused parent. Incomplete or inconsistent evidence fails closed.

The engine accepts status evidence only for the expected provider/campaign and a timestamp within 60 seconds, with at most five seconds of forward clock tolerance. Unavailable evidence retains the previous observation, records the failed attempt, clears delivery confirmation and emits a distinct unavailability audit event. Host/admin views distinguish eligibility, review, blockage, stale evidence and failed refresh. Existing report availability, provider delay, budget protection and canonical-outcome limitations remain independent.

### Narrow operator recovery

Additive API: `POST /api/marketing/v2/admin/campaigns/:id/recovery/adopt-pause`.

- Request: exact numeric `revision`, a 20–1,000-character investigation `reason`, and a stable `Idempotency-Key`.
- Authority: current persisted administrator, checked before and after the provider read. A claimed role alone is insufficient.
- Required history: the exact terminal original PAUSE job, matching revision/correlation/dedupe identity, an unambiguous v2 COMMITTED pause receipt, one original account/campaign binding, and no conflicting active, ambiguous or legacy operation.
- Provider evidence: fresh authenticated PAUSED readback from the original account. Network reads occur outside row-lock transactions. Evidence, current revision and worker fence are checked again under lock before adoption.
- Result: record PAUSED locally, finish/fence the original job, append an immutable receipt and workflow event. Preserve remote operation history, dedupe key, accepted quote and reservation. A distinct pre-existing safety reason survives an expired protective-pause recovery.
- Exclusions: no publication, activation, provider mutation, unknown-operation replay, key deletion, funds release, account switching or broad reset to APPROVED.

`020_marketing_pause_recovery.sql` adds forced-RLS, admin-only append-only receipts. The readiness contract requires that table. The existing administrator drawer explains the action, requires a reason, preserves the same request key after an uncertain response, and displays the receipt. Selecting another campaign/revision remounts the drawer to avoid carrying its investigation state across campaigns.

This closes one proven recovery case. Recovery of partial publication, lost external creation/activation responses and all other exception classes remains incomplete. A remote campaign may change after any read; this is time-stamped containment evidence, not a perpetual stop or settlement guarantee.

### Upload capability signature spelling

The integrated run caught a previously intermittent security test: changing the final Base64 signature character can change only unused bits and decode to the identical MAC. `verifyLocalUpload()` now requires canonical signature encoding before timing-safe comparison. Regression coverage separately changes meaningful signature bits and exercises unused-bit aliases, padding and whitespace. All 14 targeted security tests pass. Existing issued tickets are unchanged. This does not establish a forged-signature exploit or an observed production incident.

## Verification and limits

- The complete isolated run before the final legacy-fixture repair passed all 986 current marketing tests in 50 files. This includes 23 recovery tests using a NOSUPERUSER/NOBYPASSRLS runtime connection. Counts overlap and must not be added as separate total coverage.
- Guest presentation: 33 tests in four files passed with the isolated launcher.
- Real inventory benchmark: 100 concurrent requests produced one accepted hold, 99 capacity conflicts, zero other outcomes and exactly two held room-nights. This is one local scenario, not a production capacity/SLO claim.
- Actual host, admin and calendar components: six desktop/mobile combinations passed at 1440px and 390px. Eligible-state copy and the administrator reason/recovery-receipt interaction were exercised with labelled local fixture transport; no provider or financial action occurred. Artifact directory: `/tmp/encho-monitoring-browser-jz3hh0`.
- Global ESLint and application/server TypeScript checks passed. The final restore-fixture additions also passed a targeted typecheck and lint run. The existing large legacy HostMarketing file still produces a Babel size note.
- Isolated Node 24 client/server build and private SQL packaging passed; public-artifact audit checked 40 files. Final build artifact: `/tmp/harvo-release-build-Uz7DQC`. That artifact also passed compiled web/worker smoke: private paths rejected, unconfigured readiness 503, graceful drain, worker fail-closed startup and import-only safety. No database/provider access was supplied to the smoke process.
- The real `pg_dump`/`pg_restore` test now creates a completed pause recovery through the service before backup, restores into another disposable database, and replays its original request. The receipt/result and all recorded table hashes remain identical, no provider read or mutation occurs after replay, immutable triggers reject receipt updates/deletes, and a nonowner cannot read the receipts. Existing settlement replay and unknown conversion containment also pass. This is local restore acceptance; no production restore, Linux/container or live deployment acceptance is implied.

The initial complete isolated Node 24 run passed 1,221 tests, failed 140 and left 282 unexecuted. Examples include outdated shared pg-mem schema, absent persisted users in authorization fixtures, and obsolete tests expecting Google credential success without credentials. These examples do not classify every failure as obsolete or harmless. The full gate remains red until each failure is traced and fixed or formally superseded with equivalent current coverage. The subsequent run passed 1,271, failed 140 and left 282 unexecuted across 126 files (49 failing). All current marketing and guest projects passed in that run. A later final run after the verified legacy-fixture repairs is retained in `test-results/full-suite.json`; its evidence is appended below.

## Deployment and rollback

No production DDL, provider write, payment, Git push or deployment was performed in this pass. Before deployment, rehearse migration 020 with 017–019 and actual least-privilege grants, then deploy web/worker together through a green release gate. Readiness deliberately fails if required schema/RLS is absent. Retain receipt data and immutable triggers on rollback; disable the endpoint/UI if necessary. Never delete operation evidence or relax the unknown-outcome quarantine to make a campaign retry.

## Acceptance still required

Historical completion remains 5/10: M1, M2, M3, M7 and M8 locally verified. M4 needs accepted paid-booking/consent integration, real cost/allocation/correction and settlement evidence. M5 needs configured asset/model/provider evaluation. M6 needs measured conversion experiments and eligible optimization. M9 needs green repository-wide CI, verified promotion controls, production migration/grants, independent security review, distributed/load/restore acceptance and an operating runbook rehearsal. M10 needs a named authorized cohort, property/date/spend bounds and real reconciled provider/payment outcomes.

Written guest M5/M6B legal acceptance, genuine canonical checkout and consent authority, provider eligibility and actual pilot evidence cannot be created by changing a completion percentage. No new milestone or legal gate is accepted here.

### Legacy fixture repair boundaries

The historical in-memory fixture was corrected against existing `server.ts` definitions for user phone/profile fields, campaign ownership/title/budget/metadata/timestamps and publishing event fields. Room/media endpoint tests now persist the actual host/admin principals; they cannot authenticate by claiming a role for an absent user. The public-cache privacy suite explicitly configures the already-mocked Redis client with `.invalid` fixture values and restores its environment afterward. All 28 room/media and 32 public-privacy tests passed in the targeted run. No runtime authorization rule or public-property projection was weakened.

Remaining historical provider tests include expectations of successful Google credential checks without credentials, synthetic campaign resources and unsigned-profile sign-in. Source verification confirms `/api/auth/google` calls `verifyGoogleIdentity`; unsigned profiles must not regain authority to satisfy the old expectation. Other failures are still unclassified and may expose genuine defects. `pg-mem` continues to omit real PostgreSQL semantics, so repairing its columns is not migration, foreign-key, RLS or locking certification. No legacy test is removed or excluded by this pass.

## Final local gate result

The final Node 24 repository run exited **1**, as required for a failing gate: **1,298 passed, 127 failed, 268 skipped/unexecuted; 80 passed files and 46 failed files (126 total)**.

| Project | Passed tests | Failed tests | Skipped/unexecuted | Files |
| --- | ---: | ---: | ---: | --- |
| Current marketing | 986 | 0 | 0 | 50 passed |
| Guest presentation | 33 | 0 | 0 | 4 passed |
| Historical suites | 279 | 127 | 268 | 26 passed, 46 failed |

The default gate includes all three projects. The lower failure count follows verified fixture repairs, not wholesale certification of the historical engine. Hook failures leave some test bodies unexecuted. The final run includes the extended recovery dump/restore test. Global lint, application/server typechecks, Node 24 build, compiled-runtime smoke and the six browser fixture checks pass; final restore test additions also pass targeted lint/typechecking.

Local evidence: `test-results/full-suite.json`, `test-results/full-suite.log`, `test-results/harvo/remaining-execution-final.json`, `test-results/harvo/gap-restore.json`; browser evidence at `/tmp/encho-monitoring-browser-jz3hh0/verification.json`. The complete JSON report SHA-256 is `53d2892968becaeb4a78ed8ab84fb9667509ca7418aa0a7a7aa26ac495e17fec`. These are local observations, not GitHub Actions or deployed acceptance.

The 46 historical files still failing are retained below as the release-remediation queue. Presence here does not classify a failure as harmless or obsolete. Each needs source-contract comparison and either a real fix or an explicit evidence-backed replacement; provider success must never be fabricated to satisfy an old assertion.

- `src/test/cross_provider_financial.test.ts`
- `src/test/google_auth.test.ts`
- `src/test/google_hierarchy.test.ts`
- `src/test/google_oauth_origin_forensics.test.ts`
- `src/test/google_reconciliation.test.ts`
- `src/test/google_unknown_outcome.test.ts`
- `src/test/meta_auto_activation.test.ts`
- `src/test/milestone15_dco_and_localizer.test.ts`
- `src/test/multi_provider_isolation.test.ts`
- `src/test/p0_2_unknown_outcome.test.ts`
- `src/test/p0_3_reconciliation.test.ts`
- `src/test/p0_4_fsm_bypass.test.ts`
- `src/test/p0_6_escrow_remediation.test.ts`
- `src/test/p2_6_m1_analytics_rollup.test.ts`
- `src/test/phase2_5_delivery_hardening.test.ts`
- `src/test/phase2_6_activation_timestamp.test.ts`
- `src/test/phase2_6_step2_multivariant.test.ts`
- `src/test/phase2_6_step3_insights.test.ts`
- `src/test/phase2_6_step4_dco_evaluator.test.ts`
- `src/test/phase2_6_step4b_dco_external_actions.test.ts`
- `src/test/phase2_7_activation_audit.test.ts`
- `src/test/phase2_7_financial_boundary_adversarial.test.ts`
- `src/test/phase2_7_m2_truth_projection.test.ts`
- `src/test/phase2_7_m3_failure_intelligence.test.ts`
- `src/test/phase2_7_m4_external_sync.test.ts`
- `src/test/phase2_7_m5_performance_engagement.test.ts`
- `src/test/phase2_7_m6_admin_command_center.test.ts`
- `src/test/phase2_7_m8_control_plane.test.ts`
- `src/test/phase2_8_2_certification.test.ts`
- `src/test/phase2_8_4_canonical_truth_consumption.test.ts`
- `src/test/phase2_9_10_production_certification.test.ts`
- `src/test/phase2_9_7_worker_runtime.test.ts`
- `src/test/phase2_9_8_shadow_parity.test.ts`
- `src/test/phase2_9_9_cutover.test.ts`
- `src/test/phase3_1_host_control_center.test.ts`
- `src/test/phase3_2_admin_command_center.test.ts`
- `src/test/phase3_3_dco_engine.test.ts`
- `src/test/phase3_4_control_plane_and_calendar.test.ts`
- `src/test/phase3_5_analytics_reporting.test.ts`
- `src/test/phase3_6_2_p0_remediation.test.ts`
- `src/test/phase3_6_lead_alerting_crm.test.ts`
- `src/test/phase3_8b_google_sandbox_certification.test.ts`
- `src/test/phase3_m4_1_case_b_golden_failure.test.ts`
- `src/test/phase3_m4_external_side_effect_idempotency.test.ts`
- `src/test/provider_contract_google.test.ts`
- `src/test/provider_contract_meta.test.ts`
