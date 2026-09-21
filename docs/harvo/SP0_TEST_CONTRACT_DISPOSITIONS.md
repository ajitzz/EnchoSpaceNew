# SP0 source-backed test disposition

Working record under HARVO-032, 21 September 2026. No blanket skips and no production acceptance. Every named file remains in the default Vitest gate. Project relocation changes the database harness, not whether the suite runs.

| Historical assertion | Current authority and successor coverage |
| --- | --- |
| Credential-free Google auth and caller-supplied Google profile | Current Google auth/client tests and RSA-signed HTTP identity tests; invalid signature/issuer/audience/expiry/email fail closed |
| Google resource names synthesized from local campaign IDs | Real-shaped transport returns provider resource names; PostgreSQL stores them. Google hierarchy/reconciliation, provider contracts and M4 failure tests assert those exact returned identities |
| Four-tier Google hierarchy including imaginary asset | Current Search publisher creates campaign/group/ad and criteria/budget. Asset extensions remain SP6; no synthetic asset is counted |
| Direct `activateMetaCampaign` and `dispatchMetaCampaign` success | Both throw HARVO_V2_REQUIRED. Historical boundary suites now assert zero network/storage mutation. Positive guarded activation, hierarchy readback, replay, concurrency, trusted authorization and unknown outcomes run in `harvo/meta_provider`, `provider_controls`, `engine_acceptance`, and `provider_contract_meta` |
| Legacy approval FSM / escrow / DCO worker mutates funds or creative | These functions are retired. Tests assert unchanged campaign/evidence and RETIRED results. The discovered manual escrow HTTP bypass is closed separately and tested for anonymous/host/admin requests |
| Multi-variant legacy launcher creates unreviewed assets | Containment tests preserve existing asset hashes/partial evidence and prevent duplicate or foreign-tenant dispatch. This does not claim multi-card acceptance; SP6 must supply real current compiler/provider tests |
| Configured ACTIVE / ENABLED means LIVE | Current provider hierarchy tests require explicit layered readiness and keep present-tense live/impression booleans false. Enum contract tests cover known versions, malformed values and layer mismatch |
| Google DCO winner implies externally pinned assets | Current strategy explicitly reports not implemented, with no mutated IDs. Current DCO tests preserve this containment |
| pg-mem substitutes for date casts, UTC bucketing, row claims, concurrent CRM ingestion | Explicit legacy PostgreSQL project runs the original relevant suites on private disposable Unix-socket clusters. Both positive and adversarial assertions remain. Not evidence of production RLS; separate non-bypass role tests cover that |
| Financial DB failure exposes raw connection error | Failure must block mutation and preserve durable records; provider responses retain safe error codes without private database details |

Legacy financial contracts retaining their historical 15% arithmetic are compatibility evidence only. They do not change the approved cost-plus quote model. Simple historical reducer tests remain compatibility checks; only current workflow projections are operational authority.

The initial test count is not an acceptance target. Obsolete combined scenarios can be replaced by explicit meaningful successor cases; report actual totals and any unexecuted test after the complete run. Outstanding production schema/grant, remote checks, provider policy, legal and live-pilot evidence remain open even when local tests pass.
