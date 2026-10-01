# Antygravity fuel Batch A/B — fourth independent source review

**Disposition:** `CHANGES_REQUESTED` for F0/F2 and R6-02. This is local source and targeted disposable-PostgreSQL evidence, not provider, financial, production, or complete CR1 acceptance.

## Source identity and independently rerun checks

The founder supplied `/Users/ajit/.codex/attachments/6e6da042-729b-4cab-ad0d-78f94f0876e9/Pasted text.txt`. The primary checkout `/Users/ajit/Documents/EnchoSpaceNew` remains at HEAD `dd99de66a36657729a016a8a11a8de478bd87a83`, with only its pre-existing review-document edits. Antygravity's uncommitted implementation remains in the **separate** `/Users/ajit/.gemini/antigravity/worktrees/EnchoSpaceNew/setup_and_start_dev` worktree, same HEAD, index tree `06d1dd05b8fc1fb45d07e62dad032fbe1e6172ed`. That worktree has 156 dirty paths overall, so this review addresses only the named eight-path fuel diff; it does not certify the combined tree. The eight-path unstaged diff SHA-256 was `b86822b10250c82d5f879ccb0bb3b9b54e54e4451692bb3cd31d514d91e984fc`, matching the handoff. The supplied four-path forward patch SHA-256 was `f47df4ffefa53eb0e8c7edbbe5f5704ecaccb629e2022306418f457d081b4bb9`.

Independent Node 24.12.0 run: `node scripts/testing/run.mjs src/test/harvo/monitoring_ui.test.ts src/test/cr1_legacy_boundary.test.ts src/test/harvo/router_contract.test.ts --reporter=dot` exited 0 with **3 files / 73 tests passed**. `npm run typecheck` exited 0 for client and server. The eight-path scoped `git diff --check` exited 0. No full regression, browser run against the real API, real provider request/readback, customer funding, deployment, or external release gate was tested.

## Improvements verified in source

- `src/lib/marketing/workflow.ts:205` preserves missing telemetry campaign/revision/budget-basis identity as null instead of borrowing it from the current workflow. Host projection still masks provider external IDs.
- `components/marketing/StudioShared.tsx:310–384,426–455` checks conflicting identity and labels incomplete historical identity `HISTORICAL_UNVERIFIED`, retaining the reported amount without a normal utilization percentage. Gregorian date validation and explicit account-zone handling replace the previous unconditional extra-day tolerance.
- `src/test/harvo/router_contract.test.ts:325–530` now uses coherent Meta source/provider fixtures, an authenticated PostgreSQL-backed workspace route, hostile-host pause rejection, independent pause intent for one flight, and unchanged other-flight rows/jobs.
- `src/test/harvo/router_contract.test.ts:521–685` now executes `MarketingEngine.runOnce` against a stub provider, asserts persisted report-owned identity, retains prior spend on failed refresh, and covers legacy unbound rows. This is stronger local integration than direct SQL alone. It does not certify a real provider or daemon restart.

## Blocking contract defect: normal worker reports can be rejected by the meter

`src/lib/marketing/engine.ts:154` requests reports from the campaign start **through the current UTC calendar date**, without capping at the campaign end or resolving the serving ad account's calendar date. `MetaAdProvider.ts:322` returns that requested end as `snapshot.dateEnd`; `GoogleAdsProvider.ts:458–459` does the same through `GoogleTelemetryMapper`. The engine persists it in telemetry at `engine.ts:174`. The UI then rejects `metrics.dateEnd > campaign.endDate` at `StudioShared.tsx:351–359` and `metrics.dateEnd > currentAccountDate` at `StudioShared.tsx:361–377`, producing `MISMATCH` and hiding utilization even when the provider returned a valid cumulative spend row.

Two deterministic examples follow directly from this code:

1. At **2026-10-01 01:30 UTC**, the worker requests end `2026-10-01`. In `America/Los_Angeles` the account date is still `2026-09-30`; a normal report that echoes the requested end becomes `MISMATCH`. The new unit test at `monitoring_ui.test.ts:785–815` actually expects this result, but never runs the worker path that produces that same request.
2. A campaign scheduled to end `2026-09-30` can still be observed on `2026-10-01` for corrected/final spend. The worker requests `2026-10-01`; the meter rejects it as past the scheduled end. This is independent of account timezone.

The source also sets provider `dataAsOf: null` in both adapters. Their `dateEnd` denotes the **requested report window**, not proof that the provider's data is current through that date. The UI comment asserting that the provider cannot “observe” a future date conflates these meanings. This is a genuine source-to-source mismatch, not proof that either provider actually returned an invalid report in production. Correct the worker/provider request contract and UI validation together. Use the trusted serving-account timezone, cap the inclusive requested window at the scheduled flight end, persist the exact request/response window, and keep unknown provider-data currency separate. If trusted account-zone resolution is unavailable, fail closed as report pending/unknown; do not synthesize spend zero or relax identity checks. Tests must cross UTC midnight and the campaign-end boundary through the worker, provider adapter stub, persisted projection and meter.

## Evidence-label correction and remaining scope

The handoff's “mounted Studio meters” description for the PostgreSQL route test is inaccurate: `router_contract.test.ts:448–470` calls the pure `normalizeMediaMeterEvidence` function on route JSON. The separate `monitoring_ui.test.ts:698–705` mounts `CampaignStudio` against a mocked `marketingRequest` fixture. Together they support route-to-normalizer and mocked-component behavior, **not** real-route-to-mounted-component integration. Keep the useful tests and label them accurately; add that integration or browser proof before a four-flight journey claim.

R6-02 also requires canonical booking-identity deduplication, distinct provider conversion versus captured/fulfilled outcomes, consented attribution, refund-pending state, delayed corrections, pagination and hostile-tenant coverage. The current batch advances only some of those criteria. The supplied reverse patch is narrower than the previous whole-diff artifact but remains a mutation against a live, dirty worktree: do not run `patch -R` without rechecking the exact before/after hashes and ensuring no newer work on its four paths. No merger, package reacceptance, paid activation, provider certification, legal/staging/pilot clearance, commit or push follows from this review.
