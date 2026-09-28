# R1-02 isolated factor writer prerequisite

Status: IN_PROGRESS. Security repair before any new public factor API.

Verified source: `isIsolatedFactorWriter` checks direct raw-table privileges and some ancestor flags but omits REPLICATION, database owner/CREATE, ancestor schema CREATE, ancestor column privileges, sequence privileges and additional security-definer EXECUTE. The existing invitation acceptance writer repeats the same incomplete authority pattern. These predicates could certify a NOINHERIT login able to SET ROLE into unsafe authority.

Repair scope: add one narrowly reusable IAM isolated-writer boundary for fixed, source-defined EXECUTE allowlists; use it from existing factor writer and invitation writer/readiness if integration remains disjoint. Preserve reviewed enrollment, Google identity evidence, command-bound action hashes, passkey cryptographic verifier, migration036 and current grant commands. No new enrollment, registration, recovery authority or migration. No caller can select writer signatures or authority.

Validation: first add actual LOGIN negatives for direct and reachable replication/database/schema/column/sequence/function authority; prove old predicate accepts forbidden configurations, then require fail-closed with no ceremony/receipt effects. Run existing factor/passkey and invitation suites with Node24 sanitized runner. Keep failed/repaired evidence separately. No factor router is mounted until predicate and catalog checks pass. No remote action.

Compatibility: previously overprivileged factor/invitation credentials become unavailable. Correct EXECUTE-only roles retain same API and SQL contract. Rollback leaves factor or invitation acceptance unavailable; never restore overly permissive writer checks. Operational enrollment/policy approval and named deployment roles remain external evidence gates.

## Local result and bounded HTTP integration

The old factor guard reproduced 8 forbidden LOGIN configurations accepted (14 existing tests passed, 8 new tests failed). The replacement reuses the shared runtime catalog authority check and denies raw public relation/column/sequence privileges and unexpected public security-definer EXECUTE across all reachable roles. Factor and invitation acceptance retain fixed function allowlists. Lost COMMIT acknowledgements discard writer connections and remain unknown; replay semantics are unchanged.

After writer checks passed, added the reviewed-passkey HTTP adapter and explicit factor runtime configuration. It uses the current opaque workforce cookie/session reader, exact configured origin and custom header, a 14KB strict-Zod request boundary, no-store projection and correlated JSON rate-limit/error responses. Both actions invoke existing canonical WorkforceStepUp; there is no enrollment/import/recovery endpoint. The command route's rate-limit response now shares the trace/no-store contract.

Latest targeted evidence: 78 distinct passing tests across factor24, invitation24, cryptographic verifier19, runtime/throttling5 and canonical commands6; server typecheck, scoped13-file lint and diff checks pass. See CR1_R1_02_FACTOR_LOCAL_RECEIPT.json. Only local disposable PostgreSQL and signed test authenticator evidence; no remote or real user ceremony was attempted.

Parent composition: mount createWorkforceFactorRouter(createWorkforceFactorRuntime(env, maskedFault), workforceOrigin(env)) at /api/operations/v1/workforce/factor before the broad JSON parser. CR1_WORKFORCE_FACTOR_DATABASE_URL is mandatory and separate. Parent owns server.ts. No unavailable enrollment listing is fabricated: current036 intentionally lacks a runtime enrollment-discovery command, so complete staff UI, approved enrollment/policy provisioning and actual browser ceremony remain open. This slice is READY_FOR_REVIEW; R1-02 remains IN_PROGRESS.
