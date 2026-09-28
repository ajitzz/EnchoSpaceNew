# CR1 pre-existing staged deletion disposition

Status: **READY_FOR_REVIEW; no removal independently accepted.** Captured 2026-09-28T18:28:17.224098+00:00.

## Impact and scope

This is a documentation-only R0-01 batch. It reviews all **43 deletions among the original 66 staged changes**, using exact HEAD bytes and the current shared worktree. It changes no source, schema, API, UI, index, historical receipt or remote database. Rollback means removing these two new disposition documents only. The other 23 staged modifications need their own semantic disposition; this report does not accept them.

Original HEAD: `0e4c6fec2fe86f1b793760c5f7a3daf08bbf7508`. Original index tree: `05cd902d696bad53d2d63f1f3f054639c0c75ca3`. Original staged diff SHA-256: `854471966ac51c7fbf44e69095990f5f5eb2892b772cc4aef9adfbb0f502a520`. Current captured index tree: `05cd902d696bad53d2d63f1f3f054639c0c75ca3`.

The companion JSON records every removed path, HEAD blob/content hash, reviewed line ranges, source references, coverage limits, required acceptance and accountable discipline. **Actual accountable humans remain UNASSIGNED; author intent is UNCONFIRMED.** Recommendations describe what evidence supports, not what the original author intended.

## Findings that control acceptance

1. **Migration omission is not rollback.** Authorized read-only history reports 041–046 despite their staged deletion. HEAD hashes match 041, 042, 043, 044 and 046. Migration 045 differs, and an additional 047 history entry has no available local source. None is an available numbering slot.
2. **Several deletions are recomposition.** CRM/listing/operations/webhook route paths largely remain in `server.ts`; clients, pools, auth and legacy services also remain inline. The literal route counts below do not prove body, guard, mount-order or runtime parity.
3. **Unsafe parallel authority is being contained.** Removed services could claim remote pause, delivery, AI quality or certification from local/caller-controlled values. Their removal is a containment candidate; it does not prove the canonical replacement journey is complete.
4. **Real coverage and features were also removed.** External reel creation and seven real unauthenticated HTTP boundary tests need explicit port/replacement decisions. Similar filenames and passing helper suites are not equivalent coverage.
5. **Historical claims must be preserved with qualifications.** The deleted canary receipt and competing blueprint need quarantined provenance. They must not clear legal/provider/release gates, but the prior claim cannot be erased.

## Evidence and review limits

- Targeted semantic examination of exports, sensitive effects and retained call sites; not a claim that every deleted line was reviewed.
- Current source is the shared remediation worktree, not a deployed artifact; runtime reachability and all behavior equivalence require integration tests.
- Literal route comparison excludes dynamic, array and nested route declarations; equal paths do not imply equal authorization or effects.
- Retained test references identify source assertions inspected; none was executed again for this documentation-only batch. Prior local receipts are separately scoped.
- Database history is self-reported by a read-only session on an unverified primary candidate and privileged login. Table existence and history checksum do not prove actual DDL, RLS, grants or successful migration execution.

No application test suite was executed for this documentation batch. Only read-only source/identity/reference validation was performed. Prior local targeted test receipts remain distinct from this audit and from external evidence.

## Migration history discrepancy

| Migration | Deleted HEAD SHA-256 | Observed history SHA-256 | Disposition |
|---|---|---|---|
| 041_stays_canonical_commerce.sql | `c2ca50ab312f406a7b9c460880e0b9703b2e31803df38f7aae276acde2147dff` | `c2ca50ab312f406a7b9c460880e0b9703b2e31803df38f7aae276acde2147dff` | OBSERVED_UNTRUSTED_HISTORY |
| 042_marketing_creative_packages.sql | `012e11eb0777f9c6a5796b295e0c4f7222e1dfe76a62f24633d2cf246a793fa8` | `012e11eb0777f9c6a5796b295e0c4f7222e1dfe76a62f24633d2cf246a793fa8` | OBSERVED_UNTRUSTED_HISTORY |
| 043_worker_daemon_and_circuit_breaker.sql | `1a066cdb24bd5f380e637f22ca972793d19338e770f23b67f06f0852afeace49` | `1a066cdb24bd5f380e637f22ca972793d19338e770f23b67f06f0852afeace49` | OBSERVED_UNTRUSTED_HISTORY |
| 044_feeder_corridors_and_godmode_targeting.sql | `befcbe236dbdf96110cfe88c10ab74f11d57b470d36a6130691801f659ab0c18` | `befcbe236dbdf96110cfe88c10ab74f11d57b470d36a6130691801f659ab0c18` | OBSERVED_UNTRUSTED_HISTORY |
| 045_multi_role_security_and_rls.sql | `129ad347c71f7c6f0fe0aa28f2e9af7f0e75f576942806c4d76462d984f94671` | `1674caab502189e9c496c0ff2f93c91c5dfdd1c2ff6e44ea3f256967f0d1e950` | OBSERVED_UNTRUSTED_HISTORY_SOURCE_MISMATCH |
| 046_canary_execution_and_pilot_certification.sql | `b5ea22bab44517cd2406e8c7e31ef42ff84b1fa5ea510ba7f648ae6eb6f0978b` | `b5ea22bab44517cd2406e8c7e31ef42ff84b1fa5ea510ba7f648ae6eb6f0978b` | OBSERVED_UNTRUSTED_HISTORY |

Additional observed `047_campaign_flight_controls_and_drain_requests.sql`: `a3d4a1b91ea5c3e00c208803b0611354a7fc520050d5a43953696bc44ce7369e`. Parent reports no matching original SQL in the local Git history. Do not reconstruct bytes to fit a checksum or infer that the file was present in an earlier build.

For 045, parent reports the only historical local candidate is commit `191215d5f9dc019ad49d12d4fc703598451caf29`, whose bytes match deleted HEAD, not the database-recorded checksum. HEAD 045 also references columns not defined by HEAD 041. This is a provenance conflict; it does **not** prove that HEAD 045 policies were deployed. Obtain original applied bytes and compare actual catalog definitions before defining any forward correction.

Observation source: `docs/audits/cr1-remediation/r0-01/NEON_HISTORY_OBSERVATION.json`, `2026-09-28T18:15:07.873Z`, environment `UNVERIFIED_PRIMARY_NEON_CANDIDATE`, branch identity not supplied. The session was read-only with verified TLS, but its login had BYPASSRLS, CREATEROLE, CREATEDB and REPLICATION. The record is **OBSERVED_UNTRUSTED_HISTORY**, not a runtime, schema or release certificate. Current source parity for 39 packaged SQL files does not recover the earlier overwritten/unquarantined artifact identity.

## Decision identifier collision

Parent verified HEAD DECISIONS already used CR1-045 through CR1-053 for 26-27 September, while the staged document revision reused CR1-045/046 for the 28 September audit. A bare CR1-045/046/047 reference is ambiguous.

Cite decisions by date, document path, section title and source identity. Parent is retaining the historical block and assigning the current remediation discussion `RMD-001`; this register does not rewrite `HARVO.md` or `DECISIONS.md` or accept either disputed historical percentage.

## Literal route comparison

| Removed module | Direct literal pairs | Matches in current server.ts | Missing literal path |
|---|---:|---:|---|
| `src/server/routes/crm.router.ts` | 21 | 21 | None in this limited extraction |
| `src/server/routes/legacyMarketing.router.ts` | 63 | 62 | POST /api/marketing/campaigns/:id/refuel |
| `src/server/routes/listings.router.ts` | 74 | 74 | None in this limited extraction |
| `src/server/routes/operations.router.ts` | 44 | 44 | None in this limited extraction |
| `src/server/routes/webhooks.router.ts` | 14 | 14 | None in this limited extraction |

Method: compare direct `(get|post|put|patch|delete)(literal_path, ...)` declarations in HEAD modules and current `server.ts`; ignore arrays/dynamic/nested declarations. **No body or authorization equivalence is inferred.** HEAD `server.ts:160–163` authenticated creatives, circuit-breaker, feeder and database-security routers; `:159` stays and `:164` canary lacked that wrapper. Inline guard findings below account for those mounts.

## Per-file disposition

### D01 — `components/marketing/AdminCanaryWorkspace.tsx`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Release/SRE + provider operations + staff frontend; actual person UNASSIGNED.

HEAD blob `37aed6463c8e3aeacf44f0ddbf0efb282b1d1c62`; content SHA-256 `c60c22615b48313654c7564515933c2272b4a9bde235f9b1c571380474cea488`; 327 lines. Targeted HEAD slices: 38-97. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

UI calls status, execute-drill, verify-readback and generate-receipt endpoints backed by the deleted certification router. Those endpoints could certify caller-provided observations. No current import of this component was found; removing it contains that console but does not deliver an independently observed paused canary.

Current source/reference evidence: `scripts/deployment/provider-canary-runner.mjs`; `src/lib/release/evidence.ts`.

Retained test source: `src/test/harvo/provider_canary.test.ts`; `src/test/harvo/cr1_release_evidence.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Retain the prior UI/API contract in the compatibility register; verify the deployed router no longer exposes the unsafe certification path.
- Provide authenticated, target-bound provider collection plus independent review before offering a certification action; UI simulation cannot clear R7-03.

Corrective work: R0-02, R7-03.

### D02 — `components/marketing/AdminRlsSecurityWorkspace.tsx`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Database security + staff frontend; actual person UNASSIGNED.

HEAD blob `0dbbd71f16fd68edd5e982d6508b6eda49f5f7cc`; content SHA-256 `1e4981a73c0caa2e2b8ef424c0bb6291aa863c6b3c8566cfa6a8ab3406a934a0`; 223 lines. Targeted HEAD slices: 29-52. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

UI consumes coarse RLS health and cross-tenant probe endpoints. The deleted service treated forced RLS as sufficient even for a bypass role. Current readiness guards inspect actual runtime authority; they are not a replacement operations UI or proof of every table policy.

Current source/reference evidence: `src/server/deployment/runtimeDatabaseAuthority.ts`; `src/server/deployment/databaseReadiness.ts`; `src/server/deployment/recoveryReadiness.ts`.

Retained test source: `src/test/harvo/cr1_runtime_database_authority.test.ts`; `src/test/harvo/recovery_readiness.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Retire false-green health semantics and restrict any replacement diagnostics to workforce capability.
- Add actual restricted LOGIN policy tests for the precise deployed catalog; preserve unknown/incomplete diagnostics.

Corrective work: R1-01, R2-02.

### D03 — `components/marketing/CircuitBreakerWorkspace.tsx`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Provider/worker engineering + operations UX; actual person UNASSIGNED.

HEAD blob `956f26c0b22016d2cfc623c94b27cc6e04b941b9`; content SHA-256 `6668d09b8aab670bc751f2254090615b2cb2201139db278eff4d40e91f4ea8de`; 348 lines. Targeted HEAD slices: 41-117. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

UI exposes local evaluate/override/DLQ controls from a parallel circuit-breaker service; its local resumed state did not establish provider activation or renewed finance authority. The canonical admin campaign recovery flow remains, but identical legacy control semantics must not be restored.

Current source/reference evidence: `components/marketing/AdminMarketingWorkspace.tsx`; `src/server/marketing/router.ts`; `src/lib/marketing/engine.ts`.

Retained test source: `src/test/harvo/pause_recovery.test.ts`; `src/test/harvo/durable_outbox.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Prove protected canonical recovery routes cover operational needs with current authority and immutable audit/outbox effects.
- Show requested vs confirmed provider state and retain unknown-outcome reconciliation; test unauthorized override and stale claim.

Corrective work: R5-03, R6-04.

### D04 — `components/marketing/GodmodeAdsStudio.tsx`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** AdTech backend + staff frontend; actual person UNASSIGNED.

HEAD blob `e9532bc2cee80ff6480db55b597938142a0646ee`; content SHA-256 `6ed5504700e80ccd69960ac70f98f26a051b091fa0533ffbb1210f2363e000a1`; 666 lines. Targeted HEAD slices: 104-159, 233-255. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

UI edits the deleted mutable feeder-targeting API rather than immutable revision-bound strategies. Canonical AdtechWorkspace and versioned registry/bindings remain; a similar screen name does not prove that every approved control or expert user journey is integrated.

Current source/reference evidence: `components/marketing/AdtechWorkspace.tsx`; `src/server/marketing/adtechRoutes.ts`; `src/lib/marketing/adtech/registry.ts`; `src/lib/marketing/adtech/bindings.ts`.

Retained test source: `src/test/harvo/adtech_bindings.test.ts`; `src/test/harvo/adtech_controls.test.ts`; `src/test/harvo/adtech_geography.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Map each approved control to version-bound provider capabilities and the canonical studio.
- Verify actual POST, preview, release CAS, worker binding and readback; do not promise native console parity.

Corrective work: R5-01, R5-02.

### D05 — `components/marketing/StandaloneReelUpload.tsx`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Media pipeline + three-sided creative UX; actual person UNASSIGNED.

HEAD blob `0f510861a359e64e85549b8307c7d6cec81b9b9c`; content SHA-256 `f1e322e489a6910147bda2d8a1955ef37a78d5d9d516cf3a231460f0d75a2ed3`; 347 lines. Targeted HEAD slices: 110-145. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Host UI posts external creative metadata to the deleted creative-packages endpoint. Removing caller-hash trust is appropriate containment, but the external reel/post/carousel requirement remains open. The retained image preparation path explicitly rejects video and is not a delivered reel replacement.

Current source/reference evidence: `src/lib/marketing/creativeWorkflow.ts`; `src/server/marketing/router.ts`.

Retained test source: `src/test/harvo/creative_pipeline.test.ts`; `src/test/harvo/creative_campaign_binding.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Deliver canonical external upload, stored-byte hashing, rights evidence, immutable review and campaign binding.
- Verify Guest presentation, Host editing and Admin moderation for added media; test unavailable video capability truthfully.

Corrective work: R4-03, R4-04.

### D06 — `docs/blueprints/ENCHO_MASTER_PRODUCTION_EXECUTION_BLUEPRINT.md`

**Classification:** HISTORICAL_RECORD_QUARANTINE_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** Architecture governance + release reviewer; actual person UNASSIGNED.

HEAD blob `3cbe5478a565855e5df3522d2dd256f131043cf9`; content SHA-256 `b745079d3c95d90199feb558d2642e4e29b07e238849fda00f92ac1d5915804a`; 397 lines. Targeted HEAD slices: 1-26, 118-130, 350-397. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

The removed blueprint declares production authority, directs removal of checkout 503 gates, assumes a fixed listing/canary identity and describes live commerce without supplied legal approval. This conflicts with the current qualified CR1 remit. Its history must remain discoverable; disappearance alone is not a recorded supersession.

Current source/reference evidence: `docs/blueprints/ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md`; `docs/blueprints/CR1_ENGINEERING_REMEDIATION_BLUEPRINT.md`; `docs/implementation/CR1_REMEDIATION_WORK_PACKAGES.md`.

Retained test source: No application test is a substitute for historical provenance review. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Preserve exact HEAD blob/hash with dated supersession rationale; designate current controlling documents.
- Reconcile cited legal/provider authority and do not turn historical execution text into current approval.

Corrective work: R0-01, R0-02.

### D07 — `docs/harvo/receipts/CR1_LIVE_CANARY_RECEIPT.json`

**Classification:** HISTORICAL_RECORD_QUARANTINE_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** Release evidence reviewer + provider operations; actual person UNASSIGNED.

HEAD blob `f92cfcbb578bff395d15f922012634423e658a17`; content SHA-256 `71496072b72457610314a4613de4e73cdc36c0f981a81dc09c3c823abccca990`; 57 lines. Targeted HEAD slices: 1-57. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Receipt contains literal canary-style provider identifiers, fixed positive verification fields and a clearance claim. Matching fake defaults are present in the deleted router. The document itself provides no independently authenticated provider collection or reviewer attestation. Treat it as historical disputed evidence, not a production receipt or proof that no remote action occurred.

Current source/reference evidence: `src/lib/release/evidence.ts`; `docs/audits/cr1-remediation/r0-02/LOCAL_TEST_RECEIPT.json`.

Retained test source: `src/test/harvo/cr1_release_evidence.test.ts`; `src/test/harvo/cr1_evidence_quarantine.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Keep immutable historical bytes/blob and mark NOT_RELEASE_EVIDENCE outside any gate-consumed path.
- Require real provider identity, requested and observed status, spend freshness, provenance and independent acceptance for replacement.

Corrective work: R0-02, R7-03.

### D08 — `src/migrations/041_stays_canonical_commerce.sql`

**Classification:** APPLIED_HISTORY_RECONCILIATION_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** DBA + commerce/finance architect; actual person UNASSIGNED.

HEAD blob `4bc32c24035d9691e83172140b3baf12cbad3b6c`; content SHA-256 `c2ca50ab312f406a7b9c460880e0b9703b2e31803df38f7aae276acde2147dff`; 86 lines. Targeted HEAD slices: 1-86. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Defines separate stays_quotes, stays_holds, stays_orders and webhook tables. Holds use guest_session_id and orders use user_id; this file does not establish tenant RLS or canonical quote/finance invariants. Current SQL deletion is not a database rollback. History reports this exact HEAD hash, subject to the observation limitations below.

Current source/reference evidence: `src/migrations/runner.ts`; `docs/audits/cr1-remediation/r0-01/NEON_HISTORY_OBSERVATION.json`; `src/lib/offers/canonicalOfferAuthorityEngine.ts`.

Retained test source: `src/test/m4_inventory_holds.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Recover trusted applied bytes and migration authority, inspect actual table/policy/constraint definitions, reconcile data and consumers.
- Retain original bytes/history; design only reviewed forward compatibility/retirement after data ownership and legal commerce contracts are resolved.

Corrective work: R0-01, R2-02, R3-02, R3-03.

### D09 — `src/migrations/042_marketing_creative_packages.sql`

**Classification:** APPLIED_HISTORY_RECONCILIATION_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** DBA + media authority; actual person UNASSIGNED.

HEAD blob `983d38981a3544dafbb0e71930b74109148c72d3`; content SHA-256 `012e11eb0777f9c6a5796b295e0c4f7222e1dfe76a62f24633d2cf246a793fa8`; 54 lines. Targeted HEAD slices: 1-54. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Creates parallel packages/assets with caller URL/hash metadata, review score and mutable version fields. DDL alone lacks trusted byte provenance and immutable canonical review binding. History reports the exact deleted HEAD hash; running canonical creative code does not remove or reconcile these database tables.

Current source/reference evidence: `src/lib/marketing/creativeWorkflow.ts`; `docs/audits/cr1-remediation/r0-01/NEON_HISTORY_OBSERVATION.json`.

Retained test source: `src/test/harvo/creative_pipeline.test.ts`; `src/test/harvo/creative_campaign_binding.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Inventory stored rows and retained references; determine canonical import/quarantine and immutable evidence requirements.
- Preserve applied migration bytes; test reviewed additive compatibility under real restricted roles.

Corrective work: R0-01, R4-03.

### D10 — `src/migrations/043_worker_daemon_and_circuit_breaker.sql`

**Classification:** APPLIED_HISTORY_RECONCILIATION_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** DBA + worker/analytics engineering; actual person UNASSIGNED.

HEAD blob `61847f3bdbe7ab689dfa20c3b6da21c8de57edc3`; content SHA-256 `1a066cdb24bd5f380e637f22ca972793d19338e770f23b67f06f0852afeace49`; 58 lines. Targeted HEAD slices: 1-58. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Adds marketing_daily_rollups with zero defaults, local circuit_breaker_events and generic dead_letter_queue. Existing canonical queues/rollups are separate. This file does not provide RLS, worker fencing or remote-pause proof. Observed history matches HEAD, so omission cannot be treated as a no-op deployment cleanup.

Current source/reference evidence: `src/lib/platform/durableOutbox.ts`; `src/lib/marketing/engine.ts`; `docs/audits/cr1-remediation/r0-01/NEON_HISTORY_OBSERVATION.json`.

Retained test source: `src/test/harvo/durable_outbox.test.ts`; `src/test/harvo/pause_recovery.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Audit rows and worker consumers; quarantine fabricated zero metrics and provider-state claims.
- Plan forward reconciliation into canonical job/observation authority without deleting queued work or audit history.

Corrective work: R0-01, R5-03, R6-02.

### D11 — `src/migrations/044_feeder_corridors_and_godmode_targeting.sql`

**Classification:** APPLIED_HISTORY_RECONCILIATION_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** DBA + AdTech architect; actual person UNASSIGNED.

HEAD blob `08d8d75a38038903e594f10cc2e9dad52031e06a`; content SHA-256 `befcbe236dbdf96110cfe88c10ab74f11d57b470d36a6130691801f659ab0c18`; 67 lines. Targeted HEAD slices: 1-67. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Defines a second feeder catalog and mutable campaign targeting row. Seed ROAS values are unproven, tier names include LUXURY rather than approved COMFORT, and default housing/bidding options are not a provider capability contract. History matches HEAD. Canonical versioned registry does not silently supersede applied table data.

Current source/reference evidence: `src/lib/marketing/adtech/registry.ts`; `src/lib/marketing/adtech/corridors.ts`; `src/lib/marketing/adtech/bindings.ts`; `docs/audits/cr1-remediation/r0-01/NEON_HISTORY_OBSERVATION.json`.

Retained test source: `src/test/harvo/adtech_geography.test.ts`; `src/test/harvo/adtech_bindings.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Resolve applied source provenance and actual rows; do not reuse unsupported estimates as evidence.
- Define migration/quarantine of eligible data into approved provider-resolved immutable corridor versions and preserve old revisions.

Corrective work: R0-01, R5-01, R5-02.

### D12 — `src/migrations/045_multi_role_security_and_rls.sql`

**Classification:** APPLIED_HISTORY_RECONCILIATION_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** Database security + migration owner + independent reviewer; actual person UNASSIGNED.

HEAD blob `05c464a0671441d83c847156c86e3577cb8a0d78`; content SHA-256 `129ad347c71f7c6f0fe0aa28f2e9af7f0e75f576942806c4d76462d984f94671`; 257 lines. Targeted HEAD slices: 1-32, 170-209. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

HEAD helper trusts app.bypass_rls/app.marketing_admin GUCs. Its policies refer to stays_holds.session_token and stays_orders.guest_id/listing_id, while HEAD 041 defines guest_session_id and orders.user_id/quote_id. Crucially observed 045 history checksum differs from HEAD. Do not assert these exact policy bytes were deployed; both source-history provenance and real catalog security remain unresolved.

Current source/reference evidence: `src/server/deployment/runtimeDatabaseAuthority.ts`; `src/server/deployment/schemaPreflight.ts`; `docs/audits/cr1-remediation/r0-01/NEON_HISTORY_OBSERVATION.json`.

Retained test source: `src/test/harvo/cr1_runtime_database_authority.test.ts`; `src/test/harvo/recovery_readiness.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Obtain original checksum-matching applied 045 bytes from authorized historical artifact/source, not reconstructed text.
- Compare actual definitions and role grants; test separate unprivileged LOGIN principals and reject caller-set bypass authority.
- Preserve recorded checksum; no silent history repair, deletion, renumbering or replay of mismatching HEAD source.

Corrective work: R0-01, R1-01, R2-02.

### D13 — `src/migrations/046_canary_execution_and_pilot_certification.sql`

**Classification:** APPLIED_HISTORY_RECONCILIATION_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** DBA + release evidence authority; actual person UNASSIGNED.

HEAD blob `3ed21801df350d87001b5d6bb70d4fcce3ed7231`; content SHA-256 `b5ea22bab44517cd2406e8c7e31ef42ff84b1fa5ea510ba7f648ae6eb6f0978b`; 98 lines. Targeted HEAD slices: 1-98. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Creates audit/canary/readback tables with PAUSED/zero-budget checks but permits caller evidence and mutable status; no independent collector or immutable acceptance boundary follows from these constraints. RLS policies use application GUCs. History matches HEAD; existing rows require provenance classification, not deletion as a source-cleanup side effect.

Current source/reference evidence: `src/lib/release/evidence.ts`; `docs/audits/cr1-remediation/r0-01/NEON_HISTORY_OBSERVATION.json`.

Retained test source: `src/test/harvo/cr1_release_evidence.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Preserve bytes and observed history; inspect actual RLS/immutable constraints and existing records.
- Quarantine synthetic/unauthenticated rows from release gates and introduce reviewed forward evidence authority only after real collector integration.

Corrective work: R0-01, R0-02, R7-03.

### D14 — `src/server/config/clients.ts`

**Classification:** RECOMPOSED_SURFACE_SEMANTIC_PARITY_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Runtime/platform + IAM; actual person UNASSIGNED.

HEAD blob `d991489260190faa7998fa87313eb3f71653914c`; content SHA-256 `cc304ce1eac204f9e83588a7ceff2d52cbe0927702484271053b97e55c082d4d`; 162 lines. Targeted HEAD slices: 1-162. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Extracted provider/payment/storage/session clients are absent as a module, while current server.ts still initializes the corresponding clients and JWT secret. Global IO getter/setter exports are no longer present; broadcast logic remains inline. Initialization ordering, secret fallback and test-mode behavior require semantic verification; export/name presence is not equivalence.

Current source/reference evidence: `server.ts`; `src/server/operations/runtime.ts`; `src/server/operations/sessionRuntime.ts`.

Retained test source: `src/test/google_auth.test.ts`; `src/test/cr1_operations_api.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Check client creation has no unintended network/secret side effects during imports and isolated builds.
- Compare secret/session authority and socket lifecycle against actual callers; preserve hardened workforce issuer boundaries.

Corrective work: R1-01, R2-02, R2-03.

### D15 — `src/server/db/bootstrap.ts`

**Classification:** RECOMPOSED_SURFACE_SEMANTIC_PARITY_OPEN. **Acceptance:** OPEN. **Recommended discipline:** DBA + runtime platform; actual person UNASSIGNED.

HEAD blob `7a021c1e4a7be22c5fd6a8425da4ccc87383c761`; content SHA-256 `5c43af455699e86797c4b99460195d562fec6bb13aa717a1c8e717ea05b13951`; 2120 lines. Targeted HEAD slices: 1-48, 250-285, 2060-2120. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Deleted bootstrap contains startup CREATE/ALTER operations. Current server.ts retains ensureUsersTable and other startup DDL (beginning around line1221 at review), so removing the file did not establish a migration-only schema lane. Reconciliation must include applied history and process startup behavior; do not assume the entire 2,120-line module was semantically reaccepted.

Current source/reference evidence: `server.ts`; `src/migrations/runner.ts`; `src/server/deployment/schemaPreflight.ts`.

Retained test source: `src/test/harvo/deployment_runtime.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Inventory reachable startup DDL and compare exact current schema contracts under restricted runtime roles.
- Move schema authority through reviewed migration runner without modifying applied history or relying on runtime owner grants.

Corrective work: R0-01, R2-02, R2-03.

### D16 — `src/server/db/connection.ts`

**Classification:** RECOMPOSED_SURFACE_SEMANTIC_PARITY_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Database platform + SRE; actual person UNASSIGNED.

HEAD blob `aba62d3f163eba6c8ecad91fc02d0ba7c0fcee75`; content SHA-256 `7ef3e9eae58f7139efac510ff3baecc2beb793ae06563f00292469046759b520`; 113 lines. Targeted HEAD slices: 1-113. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Current server.ts retains main/read pools, AsyncLocalStorage tenant isolation and database state variables. The deleted module used environment fallbacks and initialized worker availability. Module removal alone does not prove SSL, role identity, pool context reset or transaction authority remained equivalent.

Current source/reference evidence: `server.ts`; `src/server/deployment/runtimeDatabaseAuthority.ts`; `src/server/deployment/databaseReadiness.ts`.

Retained test source: `src/test/harvo/cr1_runtime_database_authority.test.ts`; `src/test/harvo/deployment_runtime.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Verify actual web/worker LOGIN identities, verified TLS, connection scope reset and same-client transactions.
- Keep offline builds/tests from inheriting remote credentials; compare read/write pool fallback semantics without weakening failures.

Corrective work: R1-01, R2-02, R2-03.

### D17 — `src/server/middleware/auth.ts`

**Classification:** RECOMPOSED_SURFACE_SEMANTIC_PARITY_OPEN. **Acceptance:** OPEN. **Recommended discipline:** IAM/security backend; actual person UNASSIGNED.

HEAD blob `0c3fc06ff28fc548914e2ae84c6045c0f6b4a8f0`; content SHA-256 `148ca306c9e5d0557e8a845df19b800a80261dbbe82465014e5d2e0918aad9e2`; 140 lines. Targeted HEAD slices: 1-140. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Deleted middleware verified HS256 JWT and resolved persisted sessions rather than trusting JWT role claims alone. Current server.ts retains that customer/session boundary and requireAdmin, while dedicated workforce routes are composed separately. Deletion must not erase authentication coverage or merge workforce authority into customer roles.

Current source/reference evidence: `server.ts`; `src/server/operations/sessionRuntime.ts`; `src/lib/iam/staffSessionIssuer.ts`.

Retained test source: `src/test/google_auth.test.ts`; `src/test/cr1_workforce_session_api.test.ts`; `src/test/cr1_operations_api.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Compare mounted middleware ordering, session revocation, disabled principal behavior and tenant context.
- Reproduce Operations boundary negatives with canonical workforce authority and no fixture bypass in production.

Corrective work: R1-01, R1-02.

### D18 — `src/server/marketing/canaryCertificationRouter.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Release/security + provider integration; actual person UNASSIGNED.

HEAD blob `a8694c4b3e8802d3fce6aa4576dc63d84deecb58`; content SHA-256 `77aff5db958c20196042d2caea24bad4f712becc8d6c07195606fceaf3d2da34`; 232 lines. Targeted HEAD slices: 24-55, 115-140, 153-220. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

HEAD server mounted this router without outer authenticateToken. Its admin helper accepts x-admin-bypass:true; status responds certified true, readback accepts caller fields and defaults missing budget to zero, and receipt generation supplies fake literal provider/operator values. Retiring these paths contains unsafe authority; no authenticated external proof exists merely because the endpoint is gone.

Current source/reference evidence: `server.ts`; `src/lib/release/evidence.ts`; `scripts/deployment/provider-canary-runner.mjs`.

Retained test source: `src/test/harvo/cr1_release_evidence.test.ts`; `src/test/harvo/provider_canary.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Verify built/deployed endpoint removal or fail-closed compatibility behavior, including header bypass attempts.
- Replace only with independently collected provider evidence and explicit authorized review; do not accept a raw authenticated flag.

Corrective work: R0-02, R7-03.

### D19 — `src/server/marketing/circuitBreakerRouter.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Provider/worker + IAM; actual person UNASSIGNED.

HEAD blob `39c7438c52bbd25147009e96f601c1253a7b5244`; content SHA-256 `865d36302d82396fad51f5938709e4298b89123ea4763e264e8519f08a1b3526`; 146 lines. Targeted HEAD slices: 18-105. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

HEAD mount required authentication, but evaluate accepted any authenticated user and could target a campaign; status/DLQ lacked distinct workforce capability checks. Admin override delegated to a local-state service without verified provider activation. Current canonical marketing router remains; no anonymous-access claim is made for the HEAD wrapper-protected routes.

Current source/reference evidence: `src/server/marketing/router.ts`; `src/lib/marketing/engine.ts`.

Retained test source: `src/test/harvo/pause_recovery.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Test actual canonical POST authorization, tenant scope, leased worker authority and audit/outbox effects.
- Keep removed legacy action failure explicit and avoid local activate/refuel shortcuts.

Corrective work: R1-02, R5-03.

### D20 — `src/server/marketing/creativePackageRouter.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Creative backend + IAM + Host/Admin UX; actual person UNASSIGNED.

HEAD blob `f2358bcbcbb05a4a60536b52c42e698d54a72069`; content SHA-256 `aa78673da099c81ef0e86a5cceb65a81611311c95e05b467af1c4de29ba9369e`; 149 lines. Targeted HEAD slices: 16-64, 105-145. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

HEAD mount required customer authentication; router checked host/admin and offered package creation/list/get/moderation. The service trusted caller asset metadata and did not bind the actual stored bytes or immutable review. Removing it closes that parallel authority but leaves external-media creation/moderation integration work.

Current source/reference evidence: `src/server/marketing/router.ts`; `src/lib/marketing/creativeWorkflow.ts`.

Retained test source: `src/test/harvo/creative_pipeline.test.ts`; `src/test/harvo/creative_campaign_binding.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Implement actual upload/review/publication route integration against canonical immutable assets.
- Verify host isolation, workforce moderation capability, immutable accepted facts and external media UX compatibility.

Corrective work: R4-03, R4-04.

### D21 — `src/server/marketing/databaseSecurityRouter.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Database security + operations IAM; actual person UNASSIGNED.

HEAD blob `1d19fce4cd44d94b56b3412d7c6df4431e698c3d`; content SHA-256 `592b88b28dcf6d3ba18551e4f0305ed53cd7b0522cc17fa465549a38321e8394`; 64 lines. Targeted HEAD slices: 16-64. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

HEAD server authenticated this router, but no admin/workforce capability guard preceded the RLS-health or cross-tenant probe. Arbitrary authenticated callers supplied tenant IDs to a diagnostic that performed UPDATE followed by ROLLBACK and could return false-green authority. It was not an anonymous endpoint; the security issue is privilege scope and invalid proof.

Current source/reference evidence: `src/server/deployment/runtimeDatabaseAuthority.ts`; `src/server/deployment/schemaPreflight.ts`.

Retained test source: `src/test/harvo/cr1_runtime_database_authority.test.ts`; `src/test/harvo/recovery_readiness.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Restrict authorized diagnostics and remove tenant-selected mutation probes from general customer routes.
- Use disposable real LOGIN tests and exact catalog contracts; certify neither missing tables nor bypass roles.

Corrective work: R1-01, R2-02.

### D22 — `src/server/marketing/feederCorridorRouter.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** AdTech + workforce IAM; actual person UNASSIGNED.

HEAD blob `b5d4125c279622569e42094dd63de6219d90561e`; content SHA-256 `8e58b82fe106555aff5f054611afcf307fafa7208a4226b728919275bb656ca0`; 192 lines. Targeted HEAD slices: 15-55, 100-190. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

HEAD mount was authenticated. Router exposed parallel catalog/recommendation/targeting, used campaign host_user_id where canonical host authority is host_id, and let customer-admin write mutable targeting. Static string validation did not prove provider-resolved exclusion or version binding.

Current source/reference evidence: `src/server/marketing/adtechRoutes.ts`; `src/lib/marketing/adtech/bindings.ts`; `src/lib/marketing/adtech/geography.ts`.

Retained test source: `src/test/harvo/adtech_bindings.test.ts`; `src/test/harvo/adtech_geography.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Map required operations to workforce-scoped canonical commands with CAS releases.
- Test provider capability rejection, geographic resolution, district exclusion and immutable approved revision payloads.

Corrective work: R5-01, R5-02.

### D23 — `src/server/stays/staysCommerceRouter.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Commerce/finance + IAM + legal policy owner; actual person UNASSIGNED.

HEAD blob `28e58dc180210cde3d850d65a3f0cc6c5b043bb2`; content SHA-256 `f416b384ecacbee3c79f869497b8dfc0b0479dae3153afe84e3505d66ed64115`; 478 lines. Targeted HEAD slices: 42-80, 117-142, 304-386, 414-465. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

HEAD mounted stays commerce without outer authentication. Its principal resolver relied on JWT verification and fell back to guest behavior, quotes could use property/floor fallback prices, create-order could repeat gateway operations and generated simulated orders without Razorpay. These are not approved quote/payment semantics. Current stay projection and inventory holds remain; live checkout is still separately gated. The test_commerce engine is detached and is not a ready replacement.

Current source/reference evidence: `server.ts`; `components/CheckoutPage.tsx`; `src/lib/offers/canonicalOfferAuthorityEngine.ts`; `src/lib/commerce/staysCommerceEngine.ts`.

Retained test source: `src/test/m4_inventory_holds.test.ts`; `src/test/m3_room_media_authority.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Keep legal/tax checkout gate until approved contracts; remove fabricated gateway success and fallback prices.
- Implement persisted principal, canonical immutable offer/quote, atomic hold/funds/capture/booking, real webhook idempotency and unknown-COMMIT recovery.

Corrective work: R3-01, R3-02, R3-03.

### D24 — `src/server/routes/crm.router.ts`

**Classification:** RECOMPOSED_SURFACE_SEMANTIC_PARITY_OPEN. **Acceptance:** OPEN. **Recommended discipline:** CRM backend + workforce/customer IAM; actual person UNASSIGNED.

HEAD blob `db0bde5739bd93b366ea104ef5ef9803b402540d`; content SHA-256 `bbcc199a75692edf06fa0d61894e4308eb7e301fb30eb4b85507a817d786cd22`; 990 lines. Targeted HEAD slices: 146-185, 567-610, 802-865. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

All 21 directly extracted literal method/path pairs exist in current server.ts, including duplicated legacy message-route shapes. This is a syntactic compatibility observation only. Canonical conversations and legacy thread/message routes coexist; permission, masking, notifications, attachment and read receipt semantics require route-level verification.

Current source/reference evidence: `server.ts`; `src/lib/platform/durableOutbox.ts`.

Retained test source: `src/test/cr1_inquiry_projection.test.ts`; `src/test/cr1_operations_api.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Review actual mounted authority for every legacy CRM writer and its canonical conversation mapping.
- Verify tenant isolation, durable notification/outbox, pagination/read state and no duplicate message delivery across old/new routes.

Corrective work: R1-02, R4-01.

### D25 — `src/server/routes/legacyMarketing.router.ts`

**Classification:** RECOMPOSED_SURFACE_SEMANTIC_PARITY_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Finance/payments + marketing API; actual person UNASSIGNED.

HEAD blob `6cab3821908fd5cb80926574dd18b5e96e2434ee`; content SHA-256 `815043e2a05873b820f534fd3a6cda26a0110071a2154636862a7bf6ec73df28`; 4065 lines. Targeted HEAD slices: 70-100, 3790-3845. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

62 of 63 directly extracted literal method/path pairs still occur in current server.ts. Missing POST /api/marketing/campaigns/:id/refuel accepted a raw amount. Retired campaign refuel must stay retired; current legacy wallet-refuel code also remains in the monolith and needs separate authority review. Path presence does not prove old API headers, handler ordering or finance correctness.

Current source/reference evidence: `server.ts`; `src/server/marketing/router.ts`; `src/lib/marketing/financeQuote.ts`.

Retained test source: `src/test/harvo/runtime_authority.test.ts`; `src/test/harvo/pause_recovery.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Verify obsolete funding/dispatch routes fail closed before effects and direct hosts to canonical accepted quote/funds/reservation flow.
- Document explicit compatibility retirement and test actual POST against duplicate payment/reservation and bypass attempts.

Corrective work: R2-03, R5-03, R5-04.

### D26 — `src/server/routes/listings.router.ts`

**Classification:** RECOMPOSED_SURFACE_SEMANTIC_PARITY_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Stay/room platform + three-sided UI; actual person UNASSIGNED.

HEAD blob `953d0d67158a5618688b4b83f7af516c89d45a5a`; content SHA-256 `47c53c51a52fbf313961269184be0281a662d29b132fe47237ed2d3a0ab94395`; 4326 lines. Targeted HEAD slices: 1-70, 4240-4326. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

All 74 directly extracted literal method/path pairs occur in current server.ts. The deleted module spans listing/room/media/calendar/booking/review/SEO/upload endpoints; this finding is not a 4,326-line body equivalence audit. Existing three-sided field and canonical inventory authority must be retained.

Current source/reference evidence: `server.ts`; `components/ListingDetailsNew.tsx`.

Retained test source: `src/test/m3_room_media_authority.test.ts`; `src/test/m4_inventory_holds.test.ts`; `src/test/phase2_7_m2_truth_projection.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Compare authorization, projection/privacy, schema mappings and transaction handlers for changed routes.
- Run actual Guest view/Host edits/Admin moderation and canonical room-hold conflict tests before accepting recomposition.

Corrective work: R2-03, R3-01, R3-03.

### D27 — `src/server/routes/operations.router.ts`

**Classification:** RECOMPOSED_SURFACE_SEMANTIC_PARITY_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Operations IAM + runtime platform; actual person UNASSIGNED.

HEAD blob `33d8e2a7be1d90c506acff878cb802626a314652`; content SHA-256 `29176e8544800d7d6da46f3a4eddd95d0df06ba71923e34a714b66a3e612dc09`; 1144 lines. Targeted HEAD slices: 1-85, 1070-1144. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

All 44 directly extracted literal method/path pairs occur in current server.ts, spanning configuration, health, login/OTP and administrative routes. The new dedicated workforce boundary exists separately; retaining legacy paths must not allow customer-admin or developer fixtures to bypass it. No complete behavior equivalence follows from the path count.

Current source/reference evidence: `server.ts`; `src/server/operations/runtime.ts`; `src/server/operations/sessionRuntime.ts`.

Retained test source: `src/test/cr1_operations_api.test.ts`; `src/test/cr1_workforce_session_api.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Review route ordering and capability checks, including public health/config data and privileged legacy admin paths.
- Verify persisted sessions, revocation, owner bootstrap and canonical IAM command audit atomicity.

Corrective work: R1-01, R1-02, R1-04.

### D28 — `src/server/routes/webhooks.router.ts`

**Classification:** RECOMPOSED_SURFACE_SEMANTIC_PARITY_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Payments/webhook platform + security; actual person UNASSIGNED.

HEAD blob `b3f11c287671317825c20aafabab74ae8171e2ee`; content SHA-256 `f4da5714496f1d40659628847cb81edd81f02a882bb6ea042550d34daa5c82e1`; 1142 lines. Targeted HEAD slices: 1-85, 1080-1142. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

All 14 directly extracted literal method/path pairs occur in current server.ts. Existing early 410 guards retire some legacy payment paths; route declarations later in the file do not establish reachability. Raw-body parsing, signature checks, replay handling and finance writes still require effective mount-order verification.

Current source/reference evidence: `server.ts`; `src/lib/platform/durableOutbox.ts`.

Retained test source: `src/test/harvo/durable_outbox.test.ts`; `src/test/harvo/runtime_authority.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Verify deployed raw-body signature boundary, replay keys, single held transaction and outbox atomicity.
- Prove legacy callbacks cannot create finance authority before canonical verified capture or via client verification.

Corrective work: R2-03, R3-03, R5-04.

### D29 — `src/server/services/legacyMarketingEngine.ts`

**Classification:** RECOMPOSED_SURFACE_SEMANTIC_PARITY_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Marketing platform + finance; actual person UNASSIGNED.

HEAD blob `ebe4dec20d5239bd5b3de9f7a3eecbf7b3811747`; content SHA-256 `0154cbe905011084e02c2ab0eef6b7baa02c5cc3f032070c0d5a1da0dcda5426`; 5166 lines. Targeted HEAD slices: 297-485, 1-55, 5060-5166. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Of 35 scanned exported function names, 33 remain in current server.ts, transitionCampaignState is imported from the canonical module, and background-worker startup is now inline. Legacy dispatch/activate functions currently throw HARVO_V2_REQUIRED. This is recomposition plus containment, not proof the 5,166-line engine vanished or that all remaining wallet/analytics logic is canonical.

Current source/reference evidence: `server.ts`; `src/lib/marketing/engine.ts`; `src/server/marketing/worker.ts`.

Retained test source: `src/test/harvo/runtime_authority.test.ts`; `src/test/harvo/pause_recovery.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Trace effective runtime callers and remaining legacy finance, pricing and background timers.
- Keep dispatch disabled outside canonical revision/approval/funding authority; port behavior only where verified necessary.

Corrective work: R2-03, R5-03, R5-04.

### D30 — `src/services/canaryCertificationService.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Release evidence + provider integration; actual person UNASSIGNED.

HEAD blob `83bc0d015beed62186d14b883d475fa46586a158`; content SHA-256 `e6e066df03a0c9c8abb0f54496a3bd8666fcaf8fbea36380a8bd2e05442b04d3`; 413 lines. Targeted HEAD slices: 136-165, 280-360, 370-413. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

In-memory inFlight/completed maps served as replay protection. Readback trusted caller status/budget, wrote verified=true/exact-match receipts without provider fetch, and a checksum was presented as certification. Passing pg.Pool into transaction query calls did not guarantee a held connection. The evidence validator now fails closed without a configured independent authority; an actual collector is still missing.

Current source/reference evidence: `src/lib/release/evidence.ts`; `scripts/deployment/provider-canary-runner.mjs`.

Retained test source: `src/test/harvo/cr1_release_evidence.test.ts`; `src/test/harvo/provider_canary.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Retire unsafe authority and preserve historical receipts as disputed.
- Implement durable target-bound collection, unknown handling, actual zero-spend readback and independent review; restart/concurrent idempotency must be durable.

Corrective work: R0-02, R7-03.

### D31 — `src/services/circuitBreakerService.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Worker/inventory + provider operations; actual person UNASSIGNED.

HEAD blob `e2fe6139e7c111e68a967473aeb15df52478562f`; content SHA-256 `388256e1b4a01d832a49ee479da7057d6e1a66af51b0b9d7159991cb4689f4d8`; 573 lines. Targeted HEAD slices: 94-150, 318-350, 380-425. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Occupancy aggregation lacks campaign-flight date authority and expects total_inventory rather than canonical total_units. Local events claim provider PAUSED without a provider call. Admin override updates local campaign ACTIVE; rollups and DLQ duplicate canonical systems. Canonical engine already queues protection and preserves financial reservations, but operational end-to-end coverage still needs reacceptance.

Current source/reference evidence: `src/lib/marketing/engine.ts`; `src/lib/platform/durableOutbox.ts`; `src/server/marketing/worker.ts`.

Retained test source: `src/test/harvo/pause_recovery.test.ts`; `src/test/harvo/durable_outbox.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Verify inventory-flight authority, transactional pause intent, fenced worker claim and exact provider readback.
- No local ACTIVE shortcut; test unknown spend/metrics, exhausted retries and protected recovery.

Corrective work: R5-03, R6-02, R6-04.

### D32 — `src/services/creativePackageService.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Media security + creative workflow; actual person UNASSIGNED.

HEAD blob `79b18be67898332ced033f23646df6b636e7520d`; content SHA-256 `45a8efe3faa25e0d5aba1780cd4f70a5745ec2e38c9450ec12bc0afad6f36df5`; 480 lines. Targeted HEAD slices: 27-50, 98-145, 174-227, 446-477. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Asset identity is caller sha256Hash or SHA256(URL), not stored bytes; AI preflight is a local text/metadata heuristic. Moderation mutates version without CAS or immutable audit command, and admin identity/reasons are not used to establish canonical approval. Current image byte pipeline preserves useful functionality but external reels remain open.

Current source/reference evidence: `src/lib/marketing/creativeWorkflow.ts`; `src/lib/marketing/creativeImages.ts`; `src/lib/marketing/creativeStorage.ts`.

Retained test source: `src/test/harvo/creative_pipeline.test.ts`; `src/test/harvo/creative_campaign_binding.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Bind verified storage bytes/derivatives, rights and canonical offer facts to immutable review.
- Implement retry-safe actual route/worker integration with workforce authorization and revision conflict tests.

Corrective work: R4-03, R4-04.

### D33 — `src/services/databaseSecurityService.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Database security + independent reviewer; actual person UNASSIGNED.

HEAD blob `28f967689467d54d1b027a88c6d7758c0535caf2`; content SHA-256 `8bf5fdc8ae12d80deeb59301128ce0764ff9a70a9d4df55421c078b0c2c24817`; 215 lines. Targeted HEAD slices: 90-150, 155-215. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Health calculation accepted tables with flags/policies even when caller could bypass RLS; multiRoleEnforced used !bypass OR no-missing-FORCE. Cross-tenant probe conditionally SET ROLE only if a named role existed, risking privileged execution, and updated rows before rollback. Actual LOGIN and reachable-role readiness guards now exist, but they do not certify every former table policy.

Current source/reference evidence: `src/server/deployment/runtimeDatabaseAuthority.ts`; `src/server/deployment/databaseReadiness.ts`; `src/server/deployment/recoveryReadiness.ts`.

Retained test source: `src/test/harvo/cr1_runtime_database_authority.test.ts`; `src/test/harvo/recovery_readiness.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Deny bypass/owner/unsafe reachable grants and distinguish unknown from false.
- Test exact domain RLS with independent LOGIN principals and data; no empty-table or conditional SET ROLE false success.

Corrective work: R1-01, R2-02.

### D34 — `src/services/feederCorridorService.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** AdTech strategy + provider integration; actual person UNASSIGNED.

HEAD blob `b79484b275fe888fb1b09ecf79a60a611dbd366f`; content SHA-256 `93165ecbb32cd1c4ab95861dc796f0b108b15681f8dd8744a4882e6ce05d4b53`; 475 lines. Targeted HEAD slices: 15-90, 130-220, 300-345, 400-475. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Parallel strategy code allowed unsupported broad options and housing defaults, string-only district checks, fabricated city-count reach, fallback Wayanad for unknown locations and incorrect 5k/12k tier boundaries. Mutable campaign settings were not pinned to approved revisions. Canonical registry/geography/bindings remain and must be used rather than porting these defaults.

Current source/reference evidence: `src/lib/marketing/adtech/registry.ts`; `src/lib/marketing/adtech/geography.ts`; `src/lib/marketing/adtech/bindings.ts`; `src/lib/marketing/adtech/capabilities.ts`.

Retained test source: `src/test/harvo/adtech_geography.test.ts`; `src/test/harvo/adtech_bindings.test.ts`; `src/test/harvo/adtech_controls.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Preserve canonical price intervals and verified provider geo evidence; unresolved exclusions fail closed.
- Test admin release CAS, permitted host overrides and immutable worker compilation; forecasts must be labeled hypotheses with evidence.

Corrective work: R5-01, R5-02.

### D35 — `src/test/harvo/cr1_department_security_isolation.test.ts`

**Classification:** TEST_PORT_OR_RETIRE_REVIEW_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** IAM + workforce UX test owner; actual person UNASSIGNED.

HEAD blob `c9f07e32811e41d952c79a3234f83ce32849a456`; content SHA-256 `29e02882b774df31c518d640a106a62384f518a8e7e26f2f39cc4cc457ac0349`; 149 lines. Targeted HEAD slices: 1-149. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Uses real PostgreSQL and StaffSessionReader but expects rigid ROLE_AUTHORIZED_DESKS aliases. Current workspaceProjection derives desks from capabilities and removed that alias. Department isolation remains required; obsolete role-to-desk assumptions should be replaced with actual grant/scope tests, not used to justify dropping coverage.

Current source/reference evidence: `src/lib/iam/workspaceProjection.ts`; `src/test/cr1_workforce_session_api.test.ts`; `src/test/cr1_workforce_workspace.test.tsx`.

Retained test source: `src/test/cr1_workforce_session_api.test.ts`; `src/test/cr1_workforce_workspace.test.tsx`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Map each old unauthorized desk expectation to approved capability semantics and actual POST permission.
- Test separate departments, revocation, scope limits and insufficient grants under restricted LOGIN; retain failures before correction.

Corrective work: R1-01, R1-02.

### D36 — `src/test/harvo/cr1_stays_canonical_commerce.test.ts`

**Classification:** TEST_PORT_OR_RETIRE_REVIEW_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** Commerce QA + finance + legal policy owner; actual person UNASSIGNED.

HEAD blob `02029aa4b4aac8fdc0a1bfbf369b46be916f1767`; content SHA-256 `812030b2763f5386056cf02cbd19a2cadf1dc3966a84d8d2ce7eb877ee4c4ac1`; 498 lines. Targeted HEAD slices: 1-85, 190-240, 440-498. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Builds bespoke parallel stays tables and mounts the retired commerce router. Fixed 18% tax and simulated gateway order assertions cannot certify lawful canonical checkout. Ownership, replay and booking conflict scenarios remain valuable and must be retained as requirements while unsafe expected-success contracts are retired.

Current source/reference evidence: `components/CheckoutPage.tsx`; `src/test/m4_inventory_holds.test.ts`; `src/lib/offers/canonicalOfferAuthorityEngine.ts`.

Retained test source: `src/test/m4_inventory_holds.test.ts`; `src/test/m3_room_media_authority.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Port authorization/replay/conflict scenarios to approved policy and actual quote/hold/payment/booking contracts.
- Do not claim legal or provider integration from custom fixtures; unresolved tax/capture remains a blocked external predicate.

Corrective work: R3-02, R3-03.

### D37 — `src/test/harvo/sprint2_creative_pipeline.test.ts`

**Classification:** TEST_PORT_OR_RETIRE_REVIEW_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** Media/security test engineering; actual person UNASSIGNED.

HEAD blob `19c83a0bcffc8dc1a25432f6096f657f7d4af7a9`; content SHA-256 `50290060ecee00929134e30e45f2d1abc685c136c52e210d7f3206494dbc2af2`; 563 lines. Targeted HEAD slices: 1-85, 500-563. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Custom schema/middleware directly tests the removed creative router/service; validates useful formats/rights/tenant separation but accepts caller metadata and local heuristic AI. Version increment assertions do not prove concurrent CAS or stored-byte approval. Current byte-pipeline tests preserve a stricter image subset, not reel journey completion.

Current source/reference evidence: `src/test/harvo/creative_pipeline.test.ts`; `src/test/harvo/creative_campaign_binding.test.ts`.

Retained test source: `src/test/harvo/creative_pipeline.test.ts`; `src/test/harvo/creative_campaign_binding.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Port rights, media rejection, cross-tenant and immutable review cases to actual upload/route/worker integration.
- Add exact-byte tamper, stale approval, conflicting revisions and absent video support tests.

Corrective work: R4-03, R4-04.

### D38 — `src/test/harvo/sprint3_worker_daemon.test.ts`

**Classification:** TEST_PORT_OR_RETIRE_REVIEW_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** Worker reliability QA; actual person UNASSIGNED.

HEAD blob `527f3901a542f9ac6513743e1e328876e75cf554`; content SHA-256 `30c00ae1af03daa0fa0ff608ff12c136a8df377136dcb1fdb7d724e68b4e41c8`; 454 lines. Targeted HEAD slices: 1-90, 180-240, 390-454. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Custom total_inventory fixtures and simulated notification payloads test the deleted daemon/circuit service. Local override-to-ACTIVE and fabricated telemetry are invalid production success conditions. Useful retries, DLQ and atomicity scenarios should move to canonical outbox/worker contracts with restart and multi-connection evidence.

Current source/reference evidence: `src/lib/platform/durableOutbox.ts`; `src/server/marketing/worker.ts`.

Retained test source: `src/test/harvo/durable_outbox.test.ts`; `src/test/harvo/pause_recovery.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Retain failure/lease/fencing assertions under actual PostgreSQL separate connections and process restart.
- Verify notifications/provider effects and readback rather than state updates pretending delivery; unknown cannot become zero.

Corrective work: R4-01, R5-03, R6-02.

### D39 — `src/test/harvo/sprint4_feeder_corridors.test.ts`

**Classification:** TEST_PORT_OR_RETIRE_REVIEW_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** AdTech/provider QA; actual person UNASSIGNED.

HEAD blob `209aaadd4973c555de52b07f47426ba4b8bca995`; content SHA-256 `2c953d8a3f9c52d242a02f0dd439b504029f8cd2223470f580a7e13271e41d65`; 409 lines. Targeted HEAD slices: 1-80, 180-245, 340-409. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Fixtures validate static reach/AI confidence, universal housing and seeded ROAS assumptions from the retired service. Those are not real provider or performance evidence. Tenant/admin isolation and district conflict cases remain required in canonical resolved geography and strategy release tests.

Current source/reference evidence: `src/lib/marketing/adtech/geography.ts`; `src/lib/marketing/adtech/registry.ts`.

Retained test source: `src/test/harvo/adtech_geography.test.ts`; `src/test/harvo/adtech_bindings.test.ts`; `src/test/harvo/adtech_controls.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Port legitimate isolation/radius/exclusion cases; reject invented estimates and unsupported category controls.
- Exercise actual router commands and immutable campaign binding; verify provider fixture versions are labeled simulations.

Corrective work: R5-01, R5-02.

### D40 — `src/test/harvo/sprint5_database_rls.test.ts`

**Classification:** TEST_PORT_OR_RETIRE_REVIEW_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** Database security QA; actual person UNASSIGNED.

HEAD blob `55c0bc866920057365be8c64641a4251d2b4fe6b`; content SHA-256 `e2f92fcfdf8d31ee1195496f5bd2fbd9ffdef2a781c0051655775c7e6a473322`; 803 lines. Targeted HEAD slices: 1-100, 180-260, 720-803. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Tests create custom tables and copied policies, grant broad rights and use SET ROLE from fixture authority instead of independent LOGIN roles. Negative isolation intent is useful, but schema/role drift means this suite cannot establish deployment RLS. Current restricted LOGIN guards cover selected canonical domains, not all deleted candidate tables.

Current source/reference evidence: `src/server/deployment/runtimeDatabaseAuthority.ts`; `src/server/deployment/schemaPreflight.ts`.

Retained test source: `src/test/harvo/cr1_runtime_database_authority.test.ts`; `src/test/harvo/recovery_readiness.test.ts`; `src/test/harvo/cr1_service_case_readiness_authority.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Reconcile exact applied migration bytes/catalog before substituting RLS fixtures.
- Test separate LOGIN principals, NOINHERIT reachable privileges, column grants, definer authority and revocation for each in-scope domain.

Corrective work: R0-01, R1-01, R2-02.

### D41 — `src/test/harvo/sprint6_canary_certification.test.ts`

**Classification:** TEST_PORT_OR_RETIRE_REVIEW_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** Release/provider QA; actual person UNASSIGNED.

HEAD blob `1339f06f9ca80313cb80facdbf5aa3913cc7628b`; content SHA-256 `43965a84e8afe4171f5a658e6e7bb305267aea06c36cadf422ed90710ad81e09`; 360 lines. Targeted HEAD slices: 1-85, 180-260, 310-360. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Tests use mocked query clients, Promise.all on one Map-owning instance and caller observations to certify canaries. A SHA checksum cannot authenticate provider collection. Replacement tests fail closed for missing/fixture/stale/wrong-target evidence, but local passing tests are not an actual provider canary.

Current source/reference evidence: `src/lib/release/evidence.ts`; `scripts/deployment/provider-canary-runner.mjs`.

Retained test source: `src/test/harvo/cr1_release_evidence.test.ts`; `src/test/harvo/cr1_evidence_quarantine.test.ts`; `src/test/harvo/provider_canary.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Retain negative paused/unknown-spend and identity tests against canonical evidence boundary.
- Add durable restart/concurrent collector tests when independently configured collector exists; require real authorized observations separately.

Corrective work: R0-02, R7-03.

### D42 — `src/test/security/phase4_adversarial_security.test.ts`

**Classification:** TEST_PORT_OR_RETIRE_REVIEW_REQUIRED. **Acceptance:** OPEN. **Recommended discipline:** Application security QA; actual person UNASSIGNED.

HEAD blob `44353101efa75559193e9cf9d656e95efde2ee69`; content SHA-256 `42b554981a3343855d54b38e2adc1f04b7f2e1bd8793d3cdb3cfe5594f7801f3`; 220 lines. Targeted HEAD slices: 21-90, 121-220. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Mixed suite contains genuine HTTP 401 tests for seven actual endpoints, public-text privacy and soft-exit validation, alongside invalid caller-canary certification tests and locally duplicated predicates. Blanket deletion would discard useful boundary regression coverage. The retained similarly named phase4 suite mostly tests helpers and is not equivalent to those mounted-route cases.

Current source/reference evidence: `src/test/phase4_adversarial_security_audit.test.ts`; `src/test/cr1_operations_api.test.ts`; `src/test/google_auth.test.ts`.

Retained test source: `src/test/phase4_adversarial_security_audit.test.ts`; `src/test/cr1_operations_api.test.ts`; `src/test/google_auth.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Port each of the seven unauthenticated route tests and actual soft-exit validation unless a separately verified replacement covers it.
- Preserve masking/projection negatives; retire false certification assertions with documented replacement negatives.

Corrective work: R1-01, R1-02, R2-03, R0-02.

### D43 — `src/workers/platformWorker.ts`

**Classification:** CONTAINMENT_CANDIDATE_REPLACEMENT_OPEN. **Acceptance:** OPEN. **Recommended discipline:** Worker/SRE + CRM/provider engineering; actual person UNASSIGNED.

HEAD blob `3d98bc683e86e5c94c24e10b18bc0582170eefc4`; content SHA-256 `f2802e81f0b3c9d9125f156ddd20c1836ee6aa85e994aaff0a5c616b4e87f085`; 264 lines. Targeted HEAD slices: 75-155, 175-220, 225-264. Index DELETED; worktree ABSENT at capture. Author intent UNCONFIRMED.

Worker claims notification rows, treats payload.simulateFailure as its dispatch check and otherwise marks SUCCEEDED without a provider send. Calculated backoff is not a scheduled retry authority; telemetry creates zero rows for selected active campaigns rather than fetching provider metrics. The canonical marketing worker/outbox remain; removing this worker does not certify notification delivery or observation freshness.

Current source/reference evidence: `src/server/marketing/worker.ts`; `src/lib/platform/durableOutbox.ts`; `src/lib/marketing/engine.ts`.

Retained test source: `src/test/harvo/durable_outbox.test.ts`; `src/test/harvo/pause_recovery.test.ts`. **Not rerun for this documentation batch; no replacement coverage equivalence claimed.**

Required before accepting this removal:

- Verify deployed worker entrypoint and current role, fencing, reauthorization, retry scheduling and reconciliation.
- Integrate actual notification/provider adapters with redacted logs; test lost acknowledgement, restart, duplicates and unknown telemetry.

Corrective work: R4-01, R5-03, R6-02, R6-04.

## Review and handoff

This register is **READY_FOR_REVIEW**, with **0/43 removals independently accepted**. It is not an R0-01 exit or a CR1 progress reset. Release engineering/DBA must reconcile source, applied history and artifact identity; domain owners must accept compatibility and coverage at real route/worker boundaries. Each owner assignment and acceptance requires an actual reviewer and evidence reference.

Next dependency-ready work: port useful removed security tests; inspect effective legacy routes; recover trusted applied SQL/artifacts; inventory actual retired-table data with separately authorized read-only catalog access; complete canonical media/CRM/provider journeys. No source restoration, migration renumbering or production action is authorized by this document.

Current Completion Status: evidence-based reacceptance in progress; historical 48/48 claim remains disputed until verified.
