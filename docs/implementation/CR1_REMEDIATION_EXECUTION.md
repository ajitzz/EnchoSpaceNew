# CR1 remediation execution and review queue

28 September 2026. Founder execution instruction now activates the corrective blueprint. This record describes actual work, separately from the historical 48/48 claim.

## Baseline and impact

- R0-01 starts at HEAD `0e4c6fec2fe86f1b793760c5f7a3daf08bbf7508` plus 66 existing staged changes. The index diff digest matches CR1-045. Source contains 39 SQL migrations through 040 (numbering is not contiguous). Remote history was initially unknown; the subsequent authorized observation below records 46 entries and missing local 041–047. Deployed application identity remains unknown.
- Preserve every existing edit/deletion and the index. No migration number is allocated and no deleted applied SQL is restored by assumption. The [baseline record](CR1_REMEDIATION_BASELINE_2026_09_28.json) records current source checksums and unresolved disposition per pre-existing change.
- Initial scope is security/configuration repair, evidence quarantine, client replay containment, structural inventory and build/deployment separation. Existing finance, inventory, conversations and scoped IAM remain canonical.
- Parallel file ownership: identity engineer owns Operations/session configuration and IAM issuer/readiness; client engineer owns service worker/auth cleanup; evidence engineer owns compliance generators/assessment boundaries. Integration owner owns manifests, route inventory, migration-history validation, documentation and acceptance records.
- Initial work was entirely local. The subsequent founder reply explicitly identifies `.env` as the Neon connection source for the requested **read-only migration-history inspection**. This permits observation only; no migration apply, provider/payment/customer action, commit or push is included.

## R0-01 / R2-02 impact before implementation

**Root cause:** Structural inventory omits newer route owners. `npm run build` invokes a script loading `.env` and connecting to its database; that script checks only missing versions and disables TLS certificate verification. Recovery history checks accept extra versions and currently tolerate owner authority. The migration executor already has stronger history semantics and must remain the source of truth.

**Change:** Extend explicit route ownership/dispositions without declaring routes safe. Extract pure manifest/history validation reused by apply and read-only preflight. Remove remote checks from build. Add an explicit target/environment/expected-login deployment command using strict remote TLS and one read-only transaction. Compare source, packaged and applied checksums; forbid unknown/gapped/missing history and privileged runtime roles. Never invoke the DDL executor from read-only preflight.

**Impact:** `scripts/cr1/verify-inventory.mjs`, its inventory/tests, `package.json`, migration-history library/executor, deployment preflight/recovery readiness and focused tests. No migration bytes or public API contracts change. Deployment operators gain an explicit preflight command instead of implicit build-time database access.

**Validation:** Reproduce inventory failure; pure manifest negatives; disposable PostgreSQL actual LOGIN history/role tests; existing migration transaction/lock/unknown-COMMIT suite; sanitized build at the appropriate exit. Source/packaged parity gets independent negative tests. Avoid remote environment loading.

**Rollback:** Disable affected deployment promotion while preserving old artifacts; retain strict checks and historical checksums. Do not restore insecure TLS, owner runtime exceptions or remote build side effects. Existing deployments require explicit real-role verification before rollout.

## Acceptance accounting

Corrective cards accepted at full card criteria: **0/32**. Bounded source/implementation reviews are separately recorded and do not silently accept all card dependencies or external scope.
Original CR1 reacceptance: **0/48**, in the [criterion-preserving register](CR1_PACKAGE_REACCEPTANCE_REGISTER.md). This is an independent reacceptance count, not a reset of implementation progress.
States here are IN_PROGRESS or READY_FOR_REVIEW until an independent reviewer accepts a precise evidence level.

| Card | Current state | Evidence / next action |
|---|---|---|
| R0-01 | IN_PROGRESS | Captured source/index/migration identities; review deletion and route dispositions |
| R0-02 | READY_FOR_REVIEW | [Quarantine and 80 targeted tests](CR1_R0_02_EVIDENCE_QUARANTINE.md); external authority remains unknown |
| R0-03 | IN_PROGRESS | All 48 verbatim criteria mapped; semantic package reacceptance not complete |
| R0-04 | IN_PROGRESS | Strict evidence validator locally tested; authenticated promotion workflow not configured |
| R1-01 | READY_FOR_REVIEW | [76 distinct focused tests](../audits/CR1_R1_01_LOCAL_RECEIPT.json); original Operations assertions preserved; lead independently reran 33 |
| R1-02 | IN_PROGRESS | Legacy direct authority contained; canonical command HTTP: 68 tests; isolated factor/invitation adapters in review |
| R1-03 | READY_FOR_REVIEW | [44 tests including 10 Chromium scenarios](CR1_R1_03_LOCAL_RECEIPT.json); later clock-rollback/concurrent-revocation gaps repaired; exact latest receipt controls |
| R2-01 | IN_PROGRESS | [Durable notification lane](CR1_R2_01_CANONICAL_LANE_RECEIPT.json):37 targeted + 58 adjacent tests; independent37-test review; not all prototype replacements delivered |
| R2-02 | IN_PROGRESS | [Explicit read-only preflight](CR1_R2_02_SCHEMA_PREFLIGHT.md), 33 manifest/runner and 9 recovery tests; offline build passes; broader readiness owner exception under repair |

External ENV/DB/LEGAL/PROV/COMM/IAM/OPS/PRIV/PILOT gates retain their qualified state. Local fixtures never close them.

## Verified integration findings

- Source inventory was repaired structurally: 345 route declarations / 368 expanded routes, 39 source SQL files, 186 table names at the initial checkpoint. The legacy workforce mount remains explicitly unsafe; notification routes remain unmounted. Route counts/anchors will change as corrective adapters are composed.
- Independent review found additional reachable-role schema/database CREATE and column-level history mutation escapes. Preflight now rejects these with actual local LOGIN regressions. Broader domain readiness remains a separately tracked guard repair.
- Service-worker review found same-actor refresh intent loss, same-token logout/relogin replay, missing global purge fence and private API image caching. These were repaired before the 40-case handoff. A completely offline old installation cannot receive an update; already-dispatched effects still depend on server-side authorization and idempotency.
- Initial OS-network-denied compile failed on three optional workforce organization-ID narrowing errors. Corrected source subsequently compiled client, server and production worker and passed the public-artifact scan (43 files). This targeted build validates R2-02 isolation; it is not the P2 full regression exit.
- No full regression sweep has been run during this batch. No migration apply or new migration number was introduced.

## R0-01 authorized remote observation impact

The founder's response supplies `.env`, not an isolated staging branch or restricted runtime credential. Read only `DATABASE_URL` from that file without loading other variables into the process. Inspect catalog and migration history using certificate-validating TLS, one held connection, `BEGIN ... READ ONLY`, bounded statement timeouts and shared advisory lock 82749102. Do not call the migration executor, write `schema_migrations`, inspect customer rows or print credentials. Record endpoint/role identity as digests and retain the unverified branch/environment classification. Compare observed migration bytes/checksums to source, packaged SQL and deleted HEAD candidates; a discrepancy remains a blocker, never permission to repair history. Rollback is simply closing the read-only transaction; no database mutation is planned.

## Subsequent verified findings

- Read-only Neon observation: 46 history rows; 39 current SQL files match; 041–047 are absent from the worktree. HEAD 041–044/046 match recorded hashes; HEAD 045 does not; original 047 source is unknown. No apply, grants or customer reads. See RMD-002 and the read-only receipt.
- Runtime/recovery containment: 67 focused tests; Service Case readiness: 44 tests, including 10 reproduced false positives now denied. Their exact receipts retain pre-fix failure evidence. Full service journeys remain open.
- Artifact preservation correction: eight focused packaging/isolation tests pass; future SQL mismatches preserve existing bytes and fail packaging. [Receipt](../audits/cr1-remediation/r2-02/PACKAGE_PRESERVATION_RECEIPT.json).
