# R0-02 evidence scope binding — impact note

**Source of truth:** `src/lib/release/evidence.ts` defines the local evidence receipt and release-operator requirement. The corrective card is R0-02 in `CR1_REMEDIATION_WORK_PACKAGES.md`. The trust boundary remains injected and has no production implementation.

**Defect:** A receipt has `packageId` and `findingIds`, but the evaluator only checks subject, kind and predicates. An independently attested receipt can therefore be replayed for another corrective card with matching other fields.

**Change and compatibility:** Add required expected package and finding scope to `EvidenceRequirement`; reject a receipt for another card or missing required finding before consulting the trust boundary. This is an intentionally stricter local validator contract. No database, API, UI, worker, migration or external action changes.

**Security and tests:** A valid content hash and local attestation must not launder a receipt into another package. Add negative tests with recomputed valid attestations for changed package and finding IDs. Run only `cr1_release_evidence.test.ts` and `cr1_evidence_quarantine.test.ts`, then scoped typecheck/lint/diff check. Existing fixture and missing-trust negatives remain.

**Rollback:** Revert this scoped code/test change if it breaks a legitimate collector contract, while keeping all external release gates closed. Never accept a receipt by removing scope checks.
