# HARVO — Production remediation plan

Date: 20 September 2026. Status: **EXECUTION IN PROGRESS under HARVO-022/026; production acceptance pending.**

## 1. Authority, baseline and completion claim

The founder directed engineering to preserve useful post-HARVO changes, investigate regressions deeply, prepare the plan first, and make the necessary upgrades. This plan implements that direction under the [Constitution](../ENCHO_ENGINEERING_CONSTITUTION.md), [HARVO](../../HARVO.md), [decision register](../harvo/DECISIONS.md), and existing [marketing milestones](HARVO_MARKETING_EXECUTION_PLAN.md). Routine local remediation does not require renewed approval. This is not authorization to invent financial/legal evidence, operate a live pilot with unspecified spend, or accept blocked guest milestones.

Planning baseline: `main` at `e832db6`, plus the existing dirty worktree inspected on 20 September. Preserve the founder's tracker edits, scratch deletions and untracked opinion document. Do not reset the repository to the HARVO creation commit: that would discard valid fixes. Recheck status and relevant source before each implementation batch because the workspace is shared.

Two different outcomes must be reported:

1. **Code remediation verified:** the identified regressions are fixed, relevant adversarial tests and release checks pass, and deployable artifacts have been inspected.
2. **Production accepted:** the deployed revision, safe database role/schema, operator configuration, external provider/payment evidence, accepted checkout/consent/legal authority and bounded pilot all satisfy the existing acceptance criteria.

The first does not imply the second. The historical five-of-ten marketing milestone count is retained as historical local evidence; the regression audit prevents using it as current release acceptance. No new score or completion percentage is earned by this plan.

## 2. Preserve these improvements

| Change | Preserve | Required qualification |
|---|---|---|
| Public privacy/Terms artifacts and explicit routes | `public/privacy.html`, `public/terms-of-service.html`, Vercel rewrites, Express serving, crawlable links | Correct factual descriptions and verify content without login; HTTP 200 alone is insufficient. |
| Custom domain | `encho.co.in` and `www.encho.co.in` support | Apply exact approved origin rules consistently; no wildcard credentialed origins. |
| Dedicated marketing worker | Separate web/worker ownership and durable jobs | A stopped worker does not stop ads already running at a provider. |
| Calendar SQL correction | `bookings.total_rent AS total_price` | Retain while repairing authorization and canonical room truth. |
| Calendar asynchronous selection | Selection after listing data arrives | Repair removed selection, stale responses and failed-request state. |
| Genuine provider/financial controls | Claims, fences, idempotency, immutable evidence, captured funding, protection and audited transitions | Never substitute direct state edits or delete history to make the UI green. |

## 3. Reverified findings and deeper dependencies

| ID | Source and root cause | Planned closure |
|---|---|---|
| RISK-01 | `src/lib/marketing/config.ts`: missing config installs a testing policy, actor 1, invented clearances and enabled spending permissions | R1: disabled defaults and explicit validated authority |
| RISK-02 | `server.ts` and `src/server/marketing/worker.ts`: invalid legacy booking callbacks and newly manufactured consent; `runtime.ts` uses port presence for activation readiness | R1: remove fake production ports; R7: connect genuine authority only after prerequisites |
| RISK-03 | Worktree `databaseReadiness.ts`: ignores superuser/BYPASSRLS in the readiness decision | R1: reject unsafe identities; R4: prove isolation under actual safe roles |
| RISK-04 | Tracker and ignored scripts describe direct funding/state/job manipulation | R0/R6: preserve evidence, investigate actual effects, reconcile from authoritative records |
| RISK-05 | `payments.ts`: fabricated Razorpay customer name/email | R3: supported truthful customer contract without changing financial identity |
| RISK-06 | `server.ts` room-calendar GET has no authentication or owner check and returns guest data; fake room fallback | R2: scoped private endpoint and canonical room projection |
| RISK-07 | `GoogleAdsProvider.ts`: constructor-name error detection, forced 409, raw details; telemetry query and stored windows differ | R5: safe typed errors and consistent observation semantics |
| RISK-08 | `HostCalendar.tsx`: non-OK responses preserve old data; no cancellation or request-version guard; fallback selected listing can disagree with selected ID | R2: discard stale responses, clear inaccessible data, explicit loading/empty/error states |
| RISK-09 | `server.ts` global pool wrapper restores session-level `app.bypass_rls=true`; direct anonymous/admin queries bypass the wrapper | R4: audit effective policies and pooled context; transaction-local authority with no permissive idle session |
| RISK-10 | `.github/workflows/ci.yml` uses Node 22 while package/runtime specify Node 24; normal lint/typecheck remain red | R8: runtime-aligned reproducible CI, genuine error fixes and test isolation |

RISK-08 through RISK-10 are additional source findings during planning. RISK-09 is a concrete risky source mechanism, not a claim of an observed cross-tenant production disclosure: deployed policies/role and a real PostgreSQL reproduction must establish its effects. Do not equate PostgreSQL role-level `BYPASSRLS` with the application GUC `app.bypass_rls`; both require separate checks.

The privacy wording about connecting Google accounts is ambiguous across audiences. Google sign-in and Encho operator authorization may exist while hosts must not connect personal advertising accounts. Correct those distinctions rather than asserting that all Google authorization is absent.

## 4. Ordered implementation batches

### R0 — Preserve evidence and establish containment

**Deliverable:** an implementation baseline and an incident/reconciliation register with evidence provenance. Start this before application edits; continue read-only investigation alongside the subsequent local fixes.

- Record HEAD, tracked diff, relevant untracked filenames and hashes without copying credentials or customer records into git. Preserve existing deletions; annotate broken inventory references instead of restoring or deleting unrelated scripts.
- Inventory risky scripts without executing them. Establish a restricted local evidence location and keep them outside build/deployment/operator entry points. Ignoring a script in git does not make it safe to execute.
- Label the tracker assertions as historical assertions, then append corrections and links to verified evidence. Do not erase intervention history or assert that every available script was executed.
- For actual affected campaigns, collect source deployment, account/campaign/quote/payment/operation IDs and timestamps from authorized records. Separate documented intervention, provider-observed state, ledger state and unknown outcome. No ad-hoc SQL repair.
- Operational containment must distinguish new funding/publication/activation from necessary payment receipt, refund reconciliation and verified safety pause. If existing ads may be serving, establish their actual status and responsible operator; do not imply a local switch or stopped worker paused them.

**Acceptance:** evidence preserved; affected records either accounted for or explicitly unresolved; no resets, invented captures, renewed dedupe keys or repeated ambiguous provider mutations. Restricted production access is an external dependency, not a reason to stop independently executable local work.

### R1 — Restore fail-closed authority and readiness

**Files:** `src/lib/marketing/config.ts`, `src/server/deployment/databaseReadiness.ts`, `server.ts`, `src/server/marketing/worker.ts`, `src/server/marketing/runtime.ts` as needed, related HARVO tests.

- Missing configuration returns no financial policy, no service actor, no clearance or acceptance reference, and disabled funding/publishing/activation. Malformed supplied configuration fails with a safe configuration error. Test policies belong only to explicit isolated fixtures.
- Preserve draft/read capability where its own prerequisites are satisfied. Show specific readiness blockers; never supply test permissions to satisfy UI requests.
- Remove the fabricated booking/consent adapters from both executable entry points. Keep existing typed extension ports and strict payload validation. Config strings, a legacy booking status and a provider credential cannot establish canonical authority.
- Reject absent/unknown, superuser and BYPASSRLS runtime roles. Preserve table/FORCE-RLS checks. Missing role flags must not accidentally be treated as proof of safety.
- Keep safety pause/refund processing independently guarded when activation is disabled. Verify configured service actors against persisted identities rather than substituting user 1.

**Tests:** absent/empty/malformed config; valid explicit config; each missing authority; safe/unsafe/missing role; disabled FORCE RLS; actual web and worker composition; queued ACTIVATE rechecks the gate before external mutation; no provider call when blocked; safety operations retain their valid path.

**Exit:** `security_and_guidance`, `workflow_service`, `deployment_runtime`, `runtime_authority`, `operations_boundary` and relevant conversion tests pass. A test of `createMarketingRuntime()` alone is insufficient: it previously missed fake adapters injected by callers.

**Compatibility:** operators who depended on fake defaults will see truthful blocking. No schema or historical financial-contract rewrite. Rollback must keep these protections; do not roll back to permissive defaults.

### R2 — Secure the calendar and make displayed inventory truthful

**Files:** narrow room-calendar regions in `server.ts`, a typed route/service module under `src/server/` if useful, `components/HostCalendar.tsx`, all discovered consumers, focused API/UI tests.

- Require persisted-session authentication and current listing-owner/admin authority before reading private bookings or block notes. Use explicit tenant predicates on the same database transaction/snapshot; a JWT role claim alone is insufficient.
- Validate positive safe listing IDs. Return the established unauthorized/not-found contract consistently without revealing foreign guest records. Audit privileged access with minimal IDs; never log guest contact fields.
- Send `Cache-Control: private, no-store` on the private route, including error responses. Use a stable client URL and check service-worker rules for private API caching.
- Use canonical relational room authority and explicit legacy mapping where verified; remove invented luxury rooms, quantities and arbitrary unit assignments. Unknown room association remains unassigned/unknown, not a fictional suite. Do not silently remap historic bookings.
- Minimize guest fields to the authorized operational use; document any response-field change and update all consumers. Preserve `total_rent AS total_price` and the existing money contract.
- Clear old rooms/bookings/blocks when authorization or listing changes. Cancel/discard stale requests so property A cannot populate property B. Handle removed listings, logout, non-OK responses and empty inventory explicitly.
- Check sibling block/create/delete routes for matching ownership, canonical room validation and transaction boundaries. If room authority changes affect host editing, guest presentation or admin moderation, update all affected surfaces under the three-surface rule.

**Tests:** anonymous 401; foreign host cannot read; owner and persisted admin allowed; forged/stale role rejected; unsafe ID rejected; data minimized and no-store; empty rooms stay empty; reversed asynchronous responses cannot overwrite selection; token loss clears data; block/inventory behavior stays consistent. Run tenant tests with a real non-bypass database role.

**Exit:** protected data cannot be served through the audited calendar routes or retained for the wrong selection. This is the first privacy repair and must not wait for provider work.

### R3 — Restore truthful payment identity

**Files:** `src/lib/marketing/payments.ts`, its caller/host data resolver only where needed, `payment_gateway.test.ts`, finance/refund tests.

- Verify the installed Razorpay SDK contract and current official provider requirements before selecting the minimal supported request. Prefer omitting optional customer data when supported, with notifications disabled. If mandatory, resolve verified persisted host/billing data server-side before claiming a new checkout; reject missing data clearly. Never invent a person, address or phone number.
- Preserve quote amount/currency, recipient-account verification, request identity, signature validation, capture readback, escrow, immutable journal and original-payment refund boundaries.
- Treat pre-dispatch validation failure separately from an ambiguous remote creation. A missing response does not permit creating a replacement link or changing the dedupe identity.

**Tests:** no placeholder identity in serialized requests; no foreign-host data; missing required identity stops before HTTP; replay returns the same checkout; quote/currency/account mismatch rejected; timeout remains quarantined; duplicate webhook cannot double-credit; refunds bind the original captured payment.

**Exit:** supported truthful request passes provider fixtures and financial regressions. Actual merchant capability and real payment/refund evidence remain production gates.

### R4 — Prove pooled database isolation

**Files:** database request-context wrapper in `server.ts`, typed database helpers as needed, `src/lib/marketing/database.ts` only if evidence requires it, deployment/operator validation and real-PG tests.

- Reproduce session reuse after host query, admin query, exception, rollback and anonymous query against actual policies. Test with pool size one to force reuse, then concurrent mixed tenants.
- Replace permissive session reset with transaction-local authority and a safe neutral session. Handle cleanup failure by discarding the connection. Read-only public endpoints need explicit public projections/policies; fixing isolation must not silently break public listing reads.
- Audit callback queries, direct `connect()` and nested transactions so no API style evades context. Keep explicit current-admin/service roles narrowly scoped; do not substitute elevated credentials to make tests pass.
- Prepare least-privilege application/migration role requirements. Any necessary policy/grant change gets a reviewed migration and disposable-database rollback test. No production DDL is implied by a local test.

**Tests:** host A → host B → anonymous/admin ordering; rollback/release failure; forged actor rejection; independent worker/web pools; FORCE-RLS and effective privileges; no stale GUC inheritance. Identify legacy unscoped callers explicitly and close those in the release boundary.

**Exit:** safe role and pool isolation independently demonstrated. A health endpoint returning green is not adequate evidence.

### R5 — Preserve provider errors and measurement truth

**Files:** `GoogleAdsProvider.ts`, `googleErrors.ts`, `GoogleAdsClient.ts` only for verified classifier defects, `src/lib/marketing/engine.ts`, provider/observation tests and affected projections.

- Use typed errors and an explicit supported safe mapping for guard codes, status, error class and retry policy. Preserve correlation/provider request identifiers; redact tokens, authorization headers, raw payloads and customer data. Unknown errors remain unknown.
- Check where errors occur relative to the durable claim and remote mutation. A local validation failure is not interchangeable with a possibly committed provider operation. No automatic reset/retry follows from improving the message.
- Correct the historical catch-all auth classification if still present: provider permission/account/project errors must not automatically be called refresh-token expiry. Use captured safe provider subcodes and current official API contracts when implementing; do not infer the historical 403 cause from the banner.
- Treat an inverted date window as invalid at the provider boundary. Handle a legitimately future campaign in the observation scheduler/engine as not-yet-observable without a fake zero snapshot. Continue independent safety protection, preserve previous observations and expose freshness/status truthfully.
- For valid windows, query and persisted snapshot must use the exact same dates and known account timezone semantics. A campaign scheduled later is not proof that the provider cannot already be serving: any unexpected delivery still needs protection and reconciliation.

**Tests:** blocked guard makes zero remote mutations; safe error/status reaches caller without secrets; post-send timeout remains unknown; future-start observation does not write fabricated metrics; valid query/snapshot date equality; midnight/timezone boundaries; previous observation retained on failure; protection runs despite reporting failure.

**Exit:** messages are actionable and reports have consistent provenance without weakening publication safety.

### R6 — Replace intervention shortcuts with evidence-based recovery

**Files:** existing operator/operations boundary, workflow/finance/job services, operations runbook, incident register; new recovery code only where existing safe commands are insufficient.

- Inventory existing reconciliation capabilities first. Use authenticated read-only provider lookup to bind known external identities, quote/capture amounts and status to persisted claims.
- Produce a read-only discrepancy report with bounded identifiers and safe evidence. Distinguish no-dispatch proof, confirmed remote rejection, confirmed remote success, and unresolved outcome. Absence from one response is not necessarily proof of non-creation.
- Any corrective command must be narrow, authenticated, dry-run by default, reasoned, revision-bound, idempotent, transactionally audited and subject to existing financial dual-control requirements. Recovery cannot overwrite the journal, erase events/jobs or waive the risk hold.
- If evidence cannot resolve a mutation, keep quarantine and identify the required provider/operator investigation. Do not build a generic SQL console, clear-lock button or automatic account-failover mechanism.

**Tests:** dry-run zero writes; wrong actor/account/revision rejected; repeated repair no duplicate financial effect; crash between provider read and commit rechecks authority; unknown remains quarantined; append-only audit and immutable financial history survive.

**Exit:** affected real records reconciled or explicitly quarantined, and recurrence tooling cannot bypass the canonical services. Historical tracker claims alone cannot close an incident.

### R7 — Close canonical and external acceptance dependencies

**Dependency:** restore safety first; accepted guest M5/M6B/checkout and specialist evidence are still required for production booking/conversion authority.

- Implement the genuine booking verifier only after authoritative checkout/capture/correction contracts are accepted. It must use the supplied transaction client, handle both EVENT and CURRENT requests, and return exact immutable booking/order/host/listing/campaign/currency/capture/sequence bindings.
- Resolve actual first-party attribution and current consent records; denied/revoked/unknown consent prevents upload. Preserve amount corrections, idempotency, per-item acknowledgement, data minimization and provider-specific deletion/correction limitations.
- Align public privacy text with actual Google sign-in, operator-only Ads authorization, managed host marketing and real data use. Keep legal pages public and preserve routes. Owner/specialist supplies legal entity and policy decisions; do not invent them.
- Consolidate exact HTTP and Socket.IO allowed-origin rules where applicable and correct misleading configuration logs. Check callback/landing URLs against actual deployed configuration without speculative endpoint changes.
- Verify approved cost/tax policy, actual provider access/accounts/destinations, S3 immutability/CDN, gateway merchant capabilities and the responsible operators. Configuration presence is not approval or successful service operation.

**Tests/acceptance:** wrong binding/capture/sequence/currency rejected; current consent rechecked; revocation blocks delivery; accepted production-like contract passes isolated end-to-end fixtures; legal routes serve actual documents without auth; allowed/disallowed origin tests; deployed provider evidence recorded separately.

**Exit:** each dependency has an evidence reference or remains BLOCKED. Removing fake adapters completes R1 but cannot by itself complete this batch.

### R8 — Reproducible release validation and controlled rollout

**Files:** CI workflow, TypeScript/test/build configuration, existing affected code with genuine lint failures, deployment scripts/runbooks and verification report.

- Align CI, containers and local validation with the declared Node 24 runtime; build both web and dedicated worker images. Configure disposable PostgreSQL explicitly in CI and fail required integration suites when the fixture is unavailable rather than counting skipped cases as acceptance.
- Keep scratch/evidence scripts outside application compiler/lint/deployment inputs, with explicit approved operator-script validation. Fix actual application diagnostics; do not achieve green by weakening rules, adding blanket `@ts-nocheck`, disabling security tests or excluding production modules.
- Run scoped regressions during each batch, then the full release suite once integration is ready: lint, client/server typecheck, unit/integration, real PG/RLS/concurrency/replay/restore, browser journeys, build and compiled-runtime smoke. Document remaining legacy failures as launch blockers if within the release surface.
- Confirm HTTP auth tests and database tests do not accidentally bypass real production context under `NODE_ENV=test`. Isolate tests from workspace `.env` files, live databases and provider credentials.
- Verify public artifact contents, private server output, worker startup/drain/stall, no duplicate background ownership, safe configuration failures and document routes. Benchmark latency/queue lag under representative load; retain measurements rather than inventing a universal SLA.
- Deploy the exact reviewed revision to staging, record role/migration/configuration fingerprints without secrets, run host/admin acceptance and rollback/restore drills. Production candidate stays disabled for new money/spend until the external gate checklist passes.
- A live pilot requires a named host/property, channel accounts, dates, budget ceiling, operator and verified stop plan. Record actual capture/refund, paused creation/readback, bounded activation, pause, reporting, booking/consent delivery and final settlement. No unlimited live actions are implied by engineering freedom.

**Exit:** signed-off evidence matrix for the exact release. Local tests, remote deployment and pilot outcomes each retain separate statuses. Independent acceptance remains outstanding until actually performed; self-review cannot be labelled independent review.

## 5. Impact and compatibility summary

| Boundary | Impact | Risk/mitigation |
|---|---|---|
| Database | R1 is read-only gate restoration. R2 uses scoped reads; R4/R6 may reveal narrowly necessary policy/recovery additions | Review migrations separately; preserve IDs, journals, quotes, captures, fences and historical contracts. No destructive bulk reset. |
| API | Calendar becomes authenticated/private; provider errors gain accurate safe semantics; unavailable reporting becomes explicit | Inventory all consumers, document response differences, update host/admin together and run contract tests. |
| UI | Honest blocked/loading/empty/error states; no stale cross-property records | Browser tests including rapid switching, logout, keyboard/mobile and retry. |
| Money | Fake authority/identity removed; captures and reconciliations still use existing immutable services | New checkout may correctly block pending configuration; do not lose already-arriving signed payment events. |
| Workers | Remove fabricated ports, preserve separate ownership and queue fences | Drain before replacement; interrupted remote writes remain quarantined. |
| Security | Role and tenant boundaries tightened; raw provider diagnostics minimized | Test actual non-bypass roles and connection reuse; avoid granting broader roles to resolve failures. |
| Performance | Stable calendar URL, bounded reads, explicit pool context and date-window handling | Measure query count/latency/queue lag; no unrelated monolith rewrite or cosmetic redesign. |
| Legal/provider | Factual documentation corrections and evidence checklist | No assistant-created legal approval, provider permission or claim of guaranteed OAuth approval. |

## 6. Delivery and rollback discipline

Use small independently reviewable changes grouped by the batches above, with an evidence entry after each. R0 begins first; R1 and R2 are the first containment code changes. R3/R4/R5 follow, with R6 investigation continuing as access permits. R7's blocked integration work does not prevent completing R8's local checks.

Before releasing, distinguish containment deployment from full feature activation. On failure, disable new funding/publication/activation, retain durable webhook receipts and supported reconciliation/safety actions, and verify actual provider pause where necessary. Drain workers with bounded deadlines. Prefer a forward corrective patch or a known safe artifact; never restore fake configuration, fabricated consent, permissive DB readiness or public guest-data exposure as a rollback.

Data rollback is not deletion of financial history. Reconcile using original identities and append corrective evidence. Any restore must be tested on a disposable database and reviewed for external payment/provider divergence before operational use.

Update the Constitution's ADR/incident/phase/Definition-of-Done sections when architectural implementation changes them. HARVO records source findings and observed verification; DECISIONS preserves authorization and unresolved specialist/provider gates. Correct earlier tracker claims with dated addenda.

## 7. Starting evidence and next action

Planning source checks confirm RISK-01 through RISK-10 at the current snapshot. The previous audit's build/typecheck/test results are historical evidence recorded in HARVO section 38; they were not rerun as part of this documentation-only planning pass. No production configuration, database or provider was queried or changed to prepare this plan.

All R0–R8 implementation/acceptance statuses are **PENDING** at plan creation. Next authorized engineering action: establish R0's safe baseline and implement R1 and R2 with focused regression tests. Preserve useful fixes and the existing worktree. Production readiness remains **BLOCKED** until the required evidence is obtained.

## 8. Selective refinements after Gemini review — HARVO-023

The founder requested critical verification of the external opinion, not blanket adoption. The [source-backed assessment](../harvo/GEMINI_ARCHITECTURE_REVIEW.md) records verdicts on tracker edits #11/#12/#15/#16 and all seven proposals. The following engineering refinements are incorporated under HARVO-022/023; none is evidence of implementation or independently accepted architecture.

| Batch | Added/refined deliverable | Additional acceptance evidence |
|---|---|---|
| R1, then R7 | Early provider-specific cross-field configuration validation; non-secret release/config fingerprint and worker freshness. Later, staged immutable non-secret config revisions with schema version, reviewed activation and compare-and-swap; reuse existing markup authority | Missing/invalid config grants no authority; web/worker mismatch visible; revoke during cache lifetime blocks new spend; old operations retain original semantic config/account binding; secrets never enter admin projections |
| R5 | Before-review provider preflight and field diagnostics; no semantic rewriting during dispatch | Invalid placements/geography/keywords rejected before external mutation; changed intent invalidates applicable review; safe error retains supported class/status and dispatch certainty |
| R6 | Read-only recovery cases and narrowly permitted server-derived actions; preserve dedupe identity/history and original financial reservation | Proven no-dispatch retry, partial-write quarantine, success adoption, concurrent operators, stale revisions and lease expiry; no duplicate external effect or new funding from retry |
| R6 | Correlated signed webhook receipt/job/capture/ledger outcome in existing operations tooling | Duplicate/out-of-order events, account mismatch, processing failure and invalid-signature flood remain bounded, observable and private |
| R7 | Extend existing readiness/operations and account-health checks with operation-specific reasons, timestamp/freshness and original account identity | Configured identity differs from observed account, unhealthy/unknown/stale status, worker stale/offline, original-account safety pause after configuration change |
| R8 | Isolated provider fixtures and injected clock, separate synthetic environment, partial-write and lost-response fault injection | Production identities/endpoints unavailable to sandbox; accelerated escrow never affects real money; synthetic observations never become production evidence |

### Recovery design constraints

Replace “clear lock and retry” with evidence classification: proven no dispatch/no earlier effects; confirmed rejection without partial effects; known partial/ambiguous write; confirmed remote success; unresolved/conflicting evidence. Error codes alone cannot establish these classes. Retain original job/provider records, revisions, dedupe keys and audit history. If fresh attempts are required, define a durable parent-operation/attempt-generation model and uniqueness/fencing constraints in an ADR and migration before implementation. No second live attempt is permitted while the original may still mutate the provider.

Preview must not write. Execution requires persisted admin authority, expected state/version, current evidence, idempotency and relevant financial dual control. Recheck inventory, funding, risk hold, content, account and applicable consent/checkout authority. Edited intent requires renewed review and quote checks where affected. Successful remote operations are adopted through canonical services; unresolved operations remain quarantined. Clearing the current alert never deletes historical failure evidence.

### Configuration migration constraints

Restore fail-closed explicit environment behavior first. Do not delay the privacy/readiness/authority repairs for a new control plane. Store only non-secret versioned operational settings in the future database model; retain secret-store references and deployment kill switches that can restrict but never fabricate permission. Bind semantic config to quotes, approved intent and jobs; validate revocation/current spending authority at dispatch rather than trusting a 60-second cache. Existing versioned commercial preferences remain the sole markup authority.

Validate/import explicit configuration, shadow-compare, then select one active source. No mutable env/DB dual authority. Schema rollback must retain versions required by in-flight operations. DB/control-plane outages block new spend while supported safety pause/reconciliation retain original bound credentials and explicit authority. Publishing's `META_PIXEL_ID` and conversion delivery's `conversions.meta.pixelId` are separate inputs whose intended binding needs validation.

### Deferred and rejected scope

- **Deferred:** multi-account pooling/routing. A separate ADR must establish need, provider/business permission, provider-scoped identities, currency/region/destination authority, credential references and lifecycle pinning before adding a registry/router. No arbitrary 3–5-account/day-one requirement. Basic account health visibility is included now.
- **Rejected:** automatic failover after partial/unknown writes, dedupe-key renaming/deletion, generic state reset to APPROVED, raw provider/webhook payload dumps, aggressive post-approval content rewriting and production sandbox/escrow bypasses.
- **Corrected:** the v2 UI already consumes server-side capabilities; operations/readiness, pause and provider hierarchy readback already exist. Extend them. The financial core is not certified by fingerprints or ratings, and the reported live incident causes still need authoritative evidence.

Prepare ADRs and state/API/schema contracts for recovery/configuration before those batches change code. This refinement does not advance guest phases, clear legal/provider gates, change the master-account/no-host-OAuth model, authorize unbounded live spend or alter the production acceptance criteria in sections 1 and 7.

## 9. Campaign monitoring inside Encho — HARVO-024

**Founder-approved product requirement:** hosts and admins monitor campaign status, valid performance and business outcomes inside Encho; hosts do not operate Meta/Google consoles or need account-management terminology. “Live” means automatically updating current available evidence with explicit source latency, not fabricated instantaneous provider statistics. The [telemetry review](../harvo/TELEMETRY_OBSERVATION_REVIEW.md) verifies Gemini's three claims and specifies the following engineering refinements. They remain pending implementation.

| Sequence within existing batches | Deliverable | Required exit evidence |
|---|---|---|
| T1 / R5–R6 | Independent status, report and safety observation contracts; empty-report classification; complete provider hierarchy/status mapping; precise window/timezone/freshness projection | Enabled does not automatically mean serving; valid status persists when report fails; empty is not zero; old snapshot preserved; stale observation cannot overwrite newer control; safety remains fail-closed |
| T2 / R5–R6, R8 | Fair quota-aware scheduling and safety priority; existing refresh API connected to host/admin UI with job receipt, coalescing/cooldown and next check | More than 100 campaigns/restarts, worker outage, retry exhaustion, manual/periodic races, bounded provider calls and control latency; 202 shown as queued rather than fresh data |
| T3 / R7 | Canonical booking/correction projection and trustworthy Encho visit/inquiry attribution with completeness and tenant isolation | No legacy lead-status or provider-conversion substitution; capture/refund replay correct; aggregation coverage visible; unconnected source never reports confirmed zero; actual checkout/consent/legal gates remain |
| T4 / R5–R7 | Shared business truth with host-friendly statuses/actions and admin-only safe diagnostic detail | Both studios show source window, separate check/data timestamps, available outcomes, funding/protection state and actionable failure; no host provider-portal dependency; mobile/accessibility/tenant tests |
| T5 / R8 | Adapter-to-worker-to-API-to-browser verification and bounded deployed readback/stop evidence | Late/empty/malformed responses, unknown status, quota/errors/timezones, fair scheduling, partial data lanes, security and correction tests; measured ingestion/UI lag, provider freshness limits and actual pause evidence |

Source corrections incorporated: a DEAD telemetry job is terminal, but the scheduler may create a subsequent observation; local protection runs before reporting and observation failures can queue a pause. The current provider read methods deliberately return UNKNOWN for enabled/non-paused delivery, so cadence alone cannot produce truthful serving status. The engine couples persistence of status to successful metrics; the public projection drops already-stored freshness/window metadata. Current budget checks use fetch time, not a proven source-data watermark. These are implementation gaps, not evidence of a demonstrated production loss.

Reuse existing normalization, measurement, operations and refresh mechanisms. `bookingTruth()` covers recorded verified events with completeness NOT_ESTABLISHED; add accepted ingestion/coverage and precise booking-state semantics before presenting a complete result. Repair or exclude unsafe legacy lead ingestion before using those counts. Define first-party property visits/inquiries and attribution policy explicitly; preserve the distinction among provider-attributed conversions, captured bookings and fulfilled stays.

Initial proposed targets: retain the 30-second visible workspace polling fallback, evaluate approximately 60-second active status checks and five-minute performance reads with quota-aware backoff. These require load/deployed validation; they do not guarantee provider data latency. Authenticated post-commit push invalidation can improve responsiveness if needed, with scoped refetch and polling fallback. No new infrastructure is required solely for cosmetic real-time effects.

Do not remove fail-closed pause behavior merely because first reports can be empty. A future grace period requires a tested, explicitly bounded exposure policy and verified external controls/stop escalation. No fixed multi-hour blind-spend allowance, auto-resume, fabricated zeros or raw provider-response viewer is accepted. Separate new observed spend from final billing/ledger authority.

Impact includes provider/engine types, additive observation persistence/indexes, API/studio contracts and outcome aggregates. ADRs, migrations and compatibility tests precede code. Retain existing snapshots and financial/operation identities, shadow-compare new projections and preserve quarantine on rollback. This work follows R0–R2 containment; it does not delay critical authority/privacy repairs or bypass blocked booking prerequisites.

Review evidence: 17 existing normalization tests and 7 existing observation-safety tests passed on 20 September 2026; the latter used isolated local PostgreSQL. Filtered tests are not counted as verified. No production implementation, live provider verification or new milestone acceptance follows from those results.

## 10. Truthful frontend experience refinements — HARVO-025

The [frontend review](../harvo/FRONTEND_UX_REVIEW.md) verifies Gemini's UX suggestions against current UI, guidance, monitoring and financial code. These are engineering refinements to the authorized plan, not newly accepted financial contracts or production features. Preserve the existing design language, itemized quote, reviewed-copy workflow, independent gates, reduced-motion behavior and host ability to pause/request eligible refunds.

| Sequence within existing batches | Deliverable | Required exit evidence |
|---|---|---|
| U1 / R5–R7, after T1 | Shared media-budget meter with allocation/report-window/currency/version binding, last-known freshness, excess-spend and unavailable states | Total charge/markup never becomes media denominator; partial windows never masquerade as lifetime spend; delayed spend is provisional, never refundable authority; unknown/zero/overrun/corrections render accurately |
| U2 / R5–R7, with T4 | Per-gate waiting/queued/processing/blocked/failed/complete/stale projection; host language, relevant hold deadline and next action | No fictional linear progress or provider ETA; queued does not mean running, ACTIVE does not mean serving, requested pause does not mean stopped; no progress animation after error/stall |
| U3 / R5–R6, with T2/T4 | Evidence-driven delivery/report states and per-action prerequisite reasons in both studios; existing refresh connected to queued/result evidence; R6 recovery surfaced to admins | Old impressions cannot light a current-delivery beacon; report failure is not “calibration”; disabled actions have accessible inline reasons; server revalidates scope/revision/authority; safe diagnostics and recovery preserve dedupe/financial history |
| U4 / R7–R8 | Improve discoverability and field-replacement review in existing `CampaignGuidance`; keep typed source/claim limits | Preserve explicit review, ownership, quota, stale selection handling and reassessment; never overwrite edited copy without accepted replacement; structured amenities require verified source-contract extension |
| U5 / R8 | Host/admin browser and accessibility acceptance for these components | Mobile/zoom/keyboard/focus/screen-reader/contrast/reduced-motion and frozen-visual-feed cases; backend safety continues when display updates pause; tests cover stale/unknown/rejected states and tenant separation |

The 20% amber proposal is a presentation candidate only, not a new spending limit or proven time-to-exhaustion calculation. Use text/icons as well as color. Keep price disclosure, pause/refund eligibility and actionable incident states visible; no synthetic counter increments, false urgency or assured-results language. Reuse existing tokens/components and typed server projections instead of a parallel client policy engine. API changes are additive where possible; old/missing fields mean unavailable, not permission. Record required state/API/ADR/migration contracts before implementing backend changes.

**Deferred product extensions:** in-flight funding amendments and performance forecasts. Top-ups require a separate immutable amendment quote/capture/risk/allocation/authorization/settlement model, original-account operation fencing, provider readback and concurrent/ambiguous-outcome tests. Current `BUDGET_EXCEEDS_AUTHORIZATION` protection stays intact. Do not rewrite the original quote, reuse a full-quote checkout as incremental funding, delete authorization identities or automatically resume after adding money. Review a confirmed-pause-first amendment design before promising uninterrupted top-ups. Resolve applicable incremental cost/tax policy and provider budget constraints before enabling the CTA.

Forecasts require a defined compatible dataset/model, sample sufficiency, measured accuracy, uncertainty, freshness and coverage; no model-generated ROI/inquiry ranges without evidence. Budget/flight arithmetic may be labelled as planning and must not imply delivery or profit. These extensions do not become mandatory R0–R8 release deliverables merely because Gemini proposed them.

**Corrections to the external audit:** decimal budget inputs are not sliders; listing-based reviewed-copy suggestions already exist; blockers/capability reasons/operations tooling already exist; CSS and both studios already accommodate reduced motion. Improve specific gaps instead of duplicating these mechanisms. Current status/report shortcomings are tracked in T1–T5 and must be repaired before presenting a live beacon.

Validation on 20 September: **48 existing guidance service/UI tests passed across two files** using isolated fixtures and runner config loading. This does not validate the proposed UX, provider amendments or browser appearance. No production source changed. R0–R8 remain pending, with containment ahead of experience polish. Rollback preserves evidence, audit and financial history; it may disable a new presentation but must not reinstate misleading claims.

## 11. Current execution evidence — HARVO-026

The founder's integrated execution authorization remains active. Status reflects code evidence, not release acceptance:

| Batch | Current outcome | Remaining boundary |
|---|---|---|
| R0 | Local baseline and intervention history preserved | Actual affected production records still require authorized evidence-based reconciliation |
| R1 | Fail-closed defaults, shared deployed runtime composition and strict role readiness locally verified | Genuine checkout/consent authority and production role/configuration are external acceptance requirements |
| R2 | Owner/admin calendars, minimal public availability, audited idempotent canonical blocks and UI switching verified | Migration 017, existing allocations and real deployed permissions need rehearsal/acceptance |
| R3 | Invented Razorpay customer removed; financial request/capture tests pass | Merchant configuration and bounded live payment evidence remain |
| R4 | Transaction-local pool isolation, lead-policy correction, authenticated realtime and migration 019 operational RLS verified | Production migration/grants, full legacy caller and distributed-session audit remain |
| R5 / T1–T5 / U1–U5 | Independent reports/status, no-report semantics, source freshness, bounded coalesced refresh, reporting meter and host/admin UI locally verified | Full provider hierarchy serving proof, canonical visits/leads/bookings, scheduler/load and deployed evidence remain |
| R6 | Admin/revision-bound read-only recovery inspection and UI | Durable cases, approved evidence adoption/action contracts and adversarial recovery acceptance still required |
| R7 | Exact origins, truthful privacy wording and guest/host/admin presentation corrections | Legal/provider review, canonical checkout/consent and real production integration remain blocked/unaccepted |
| R8 | Scoped suites, lint/typechecks and desktop/mobile fixtures pass; compiled artifact/smoke recorded separately | Unsafe legacy test harness isolation, independent audit, Linux/deployed validation and bounded pilot remain |

See [current execution evidence](../harvo/REMEDIATION_EXECUTION_VERIFICATION.md). Earlier plan-creation pending statements are historical. No batch completion above implies public paid launch or clears a guest legal gate. In-flight top-up, automatic account failover and ungrounded ROI estimates remain deferred contracts.
