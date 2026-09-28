# R0-03 traceability foundation handoff

28 September 2026 — **READY_FOR_REVIEW (foundation only)**.

This bounded task adds a readable and machine-readable original-package reacceptance register and structural checker. It preserves all 48 historical COMPLETE_LOCAL claims, copies their section 8 exit text verbatim and records zero independent acceptances. Every package maps to the exact corrective-card coverage table. Source references are explicitly starting points, not invented mounted integration evidence.

The 10 original external gates retain their verbatim required owner roles, required evidence and stop conditions. Assigned real humans are UNASSIGNED. CANARY-01 and R7-02.PROD remain separate open release predicates. No generated historical sign-off or assistant identity is substituted for professional/provider/operator authority.

Impact: new documentation, a read-only repository checker and four focused contract tests. No schema, HTTP API, UI, queue, payment or provider behavior changes. The checker rejects criterion changes, stale references, missing/duplicate packages, incorrect card mapping, omitted original gates and fabricated acceptance. Version 1 deliberately cannot advance acceptance; integration with independently authenticated review decisions remains R0-04 work.

Validation actually executed under Node 24: `node scripts/cr1/verify-reacceptance-register.mjs` reports STRUCTURE_VERIFIED for 48 rows and zero independently reaccepted; `node scripts/testing/run.mjs src/test/harvo/cr1_reacceptance_register.test.ts --reporter=dot` passes 4/4. This is not a semantic assessment of all 48 packages or independent acceptance of R0-03.

Compatibility/rollback: original ledger and gate register are untouched. Remove only these additive artifacts if withdrawn; never reset source history or reinterpret zero reacceptance as zero implementation. Changes to controlling criteria/references must be explicitly reconciled with the register before the checker passes again.

Independent R2-02 review: source inspection covered schemaPreflight/historyAuthority/manifest/runner/recoveryReadiness/verify-schema-sync. It identified missing database-owner/CREATE checks in the preflight; the implementation lead repaired them. A separate actual LOGIN test in a disposable PostgreSQL database (`cr1_schema_preflight_owner_review.test.ts`) then passed. Its first harness setup attempt placed CREATE DATABASE in a multi-statement query and failed before running the assertion; the test harness was corrected to separate DDL commands. No pre-fix exploit execution is claimed. Final narrow assessment: exact history/basic-login preflight is supported by inspected code and that regression; broad domain RLS, deployed roles, authenticated environment and production readiness remain outside this acceptance scope.

Existing wider `databaseReadiness.ts` still permits a BYPASSRLS role when it owns listings, and recovery catalog owner checking uses USAGE rather than all reachable SET ROLE paths. These are recorded follow-up risks, not new release acceptance or defects introduced by the new schema preflight.
