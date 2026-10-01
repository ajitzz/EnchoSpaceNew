# R0-01 structural inventory refresh — impact note

**Source of truth:** `scripts/cr1/verify-inventory.mjs` scans current TypeScript route declarations and runtime/migration DDL. `CR1_P0_ROUTE_SCHEMA_INVENTORY.md` is a dated structural ledger, not runtime or security proof.

**Observed defect:** On current HEAD `7d924d1`, the read-only validator exits 1 with 237 stale route anchors, 238 missing route anchors, 59 stale runtime-table anchors and stale summaries. Signature comparison isolates one new declaration: `POST /api/operations/v1/workforce/factor/`; the other 237 route pairs have unchanged file/method/path signatures and moved line numbers.

**Planned change and compatibility:** Refresh only current structural appendices, source/disposition/guard counts and machine receipt. Classify the new workforce factor POST from its actual fixed-origin, opaque staff-session and step-up boundary. Preserve the dated 24 September narrative and all existing route dispositions. No route, database, API, worker, UI or release-gate behavior changes.

**Validation and rollback:** Match every old route signature to exactly one current AST declaration, then update line anchors; do the same for runtime table anchors. Require `verify-inventory.mjs` and focused parser tests to pass. Review the one new row and full diff. Revert only this documentation refresh if the mapping is wrong; never use a passing structural inventory as authorization for a deployed role or production release.

**Local result:** All 346 prior route signatures matched exactly; the one added factor route was classified separately. Current validator reports 347 declarations, 370 expanded paths, 39 source migrations, 124 migration-created tables and 62 runtime-created tables with exit 0. Six parser tests passed; `git diff --check` exited 0. This does not reconcile the original applied 047 SQL or certify deployed roles.
