# R0-02 / R0-04 evidence boundary impact

Status: IN_PROGRESS; local corrective execution, 28 September 2026. Existing release artifacts are historical claims qualified by CR1-045, not external approvals.

Source of truth: CR1-045/046, corrective blueprint invariants I01/I11, R0-02 and the schema-validation portion of R0-04. This slice does not accept the complete R0-04 workflow or change the original package ledger.

Verified defects: `scripts/compliance/*` generates staging, legal, provider, commercial and pilot clearance without observing those authorities; the certificate engine repeats that trust escalation. The alternative staging runner permits an absent database client, the canary runner converts missing spend to zero and requires an unsupported universal category, and pilot formatting presents caller-supplied values as certification.

Changes: quarantine synthetic generators into explicit fixture-only output; preserve all historical receipt bytes; retire unmounted certificate persistence/attestation authority; add a strict typed evidence-validation boundary with no default trusted collector; make alternative formatters observation/assessment-only. Production receipt acceptance requires a separately configured trusted verifier, exact subject identity, applicability window, independent review and dependency digests. A caller-supplied boolean, local hash or identifier format provides no authority.

Affected surfaces: compliance/deployment tooling, the unmounted compliance certificate module, new release-evidence contracts and focused tests. No production HTTP route, database schema, customer UI, migration, provider call or financial contract changes. Existing public import names may remain as contained compatibility shims; unsafe certification behavior intentionally ceases.

Validation: use Node 24 and `scripts/testing/run.mjs`; first reproduce missing-spend and synthetic-certificate defects against temporary files only. Then run focused negative tests for missing/wrong/stale/tampered/fixture evidence, untrusted or same-author review, skipped tests, target binding and retained history. Existing tests that asserted generated fake clearance are corrected to verify containment, with old expectations retained in Git and recorded as superseded contract evidence.

Rollback: revert only this slice if needed; never restore source-generated production clearance. Hold release gates closed if validation/collector integration fails. Historical receipts and pre-existing staged edits remain untouched. A production authenticated collector, external approvals and CI promotion integration remain separate work and are not inferred from unit tests.
