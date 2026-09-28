# R4-02 Service Desk readiness containment

Status: READY_FOR_REVIEW; bounded local corrective slice. R4-02/P3.4–P3.6 remain open until their complete assigned assistance journeys and independent review are verified.

Verified source: `ServiceCases.transaction()` uses `verifyServiceCaseCatalog` before protected database effects. `verifyConversationCatalog` also consumes `verifyServiceCaseBoundaryCatalog`. The boundary currently waives function-owner safety, definer grants, source table ownership, policies and table checks when the inspecting connection owns `threads`. The runtime check misses REPLICATION/database authority; current-user-only table/EXECUTE checks miss NOINHERIT ancestors.

Impact: change only `serviceCaseReadiness.ts` and focused PostgreSQL tests, reusing the shared actual-login authority guard. Preserve exact applied migration 038 bytes, canonical service functions, separate consumer/staff/definer roles, consent, assignment fences, committed content-access receipts and existing API/UI contracts. No deployment grants or migration execution occurs outside the disposable test fixture.

Plan: remove owner bypasses from every boundary predicate; require safe current/session runtime identity. Definer ownership stays distinct and NOLOGIN, with no elevated flags, inherited roles, database/schema CREATE or table/schema ownership. Retain the reviewed exact function bodies, RLS/policy and column-grant contracts. Deny extra raw table/column and cross-scope function execution authority reachable through role membership. Required execution grants must exist in the actual effective role.

Validation: preserve failing-before owner/replication/indirect-grant tests. Run separate actual consumer and staff LOGINs on local PostgreSQL with canonical service-case fixture. Verify normal assistance and existing revocation/lost-COMMIT tests still pass. Run scoped TypeScript/lint; do not infer full R4-02 acceptance, actual provider/staging identity or legal authority.

Rollback: retain records and halt assistance when role/catalog checks fail. Repair deployment grants through separately approved deployment procedures; never restore owner exceptions as an availability workaround. No schema/API data migration is needed.


Verification: `docs/audits/cr1-remediation/r4-service-readiness/LOCAL_RECEIPT.json` records source hashes and preserved transcripts. Before repair, 10 adversarial checks returned true incorrectly; after repair, all 44 tests across the existing service-case suite and new readiness regressions passed. Scoped TypeScript/lint passed. The existing suite covers committed content-access authorization, privacy, concurrency, session/assignment/consent revocation and lost-COMMIT handling; these foundations remain in use. No applied migration was edited.

Remaining scope: this is role/catalog boundary containment, not R4-02 completion. Assigned dispatch/reassignment, disclosed staff replies, grounded AI, retention and mobile journey acceptance remain separate corrective work and gates. Schema ownership has no diagnostic-ready exception; deployment tooling must inspect with the real restricted identity.
