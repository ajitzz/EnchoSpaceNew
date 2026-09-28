# R2-01 discovery and impact note

28 September 2026 · source inspection only · no R2-01 application changes or acceptance.

**Subsequent bounded execution:** The initial discovery below is retained. The canonical conversation notification lane was subsequently repaired under explicit file ownership; see [impact and limitations](CR1_R2_01_CANONICAL_LANE_IMPACT.md) and [local receipt](CR1_R2_01_CANONICAL_LANE_RECEIPT.json). That partial implementation does not accept the full R2-01 card or replace the remaining domain-adoption work. The prototype import guard is owned by the implementation lead.

This follow-up is bounded discovery requested by the implementation lead after R1-03. The dependencies remain R0-04 and R1-01; any implementation needs explicit module ownership in this shared workspace.

## Authority to preserve

- `src/lib/platform/durableOutbox.ts`: parameterized PostgreSQL enqueue on the caller's held client; canonical JSON fingerprints; dedupe conflict rejection; SKIP LOCKED claims, fencing, lease expiry, retry/DLQ and reconciliation. Existing marketing/conversion/creative/inference queues are intentionally not replaced wholesale by this abstraction.
- `src/server/conversation/notificationWorker.ts`: real adapter of DurableOutbox using notification tables and payload schema. Rechecks catalog, current claim and stored payload, and records socket acceptance rather than pretending recipient delivery. `notificationRuntime.ts` is mounted from `server.ts` (inspection at approximately 17837); this is an integration candidate worth preserving.
- `src/lib/marketing/financeService.ts`: held-client transactions, host/currency account locks, immutable quote fingerprints, balanced journals and authenticated actor context. The explicit `reserveInTransaction` boundary must be reused for campaign/finance atomicity rather than wrapped with a separate toy settlement ledger.
- IAM command identity/version/fence enforcement already exists in migration 036 and canonical IAM functions. Domain-specific policy and RLS must remain authoritative.

## Unmounted prototype inventory

Current source import search found the following modules referenced by tests, not by `server.ts`, server routers or production worker composition. This is import evidence, not proof about the deployed artifact or dynamic code loading.

| Prototype | Observed weakness | Recommended disposition |
|---|---|---|
| `platform/crossDomainCommandEngine.ts` | Process Maps decide replay; interpolated aggregate/JSON SQL into claimed platform command/outbox tables | Retire runtime authority; preserve historical fixture evidence and map useful invariants to canonical commands |
| `compliance/pausedCanaryHardeningEngine.ts` | Maps decide replay/sequence; caller evidence, interpolated SQL, zero budget confused with zero spend | Do not expose it; authentic canary work belongs to R5/R7 with exact adapter readback |
| `compliance/adTechSettlementHardeningEngine.ts` | Maps, floating markup/tax assumptions and a second settlement ledger | Do not integrate; retain approved policy gaps and adapt canonical finance |
| `compliance/providerSecurityHardeningEngine.ts`, `boundedPilotHardeningEngine.ts`, `stagingHardeningEngine.ts` | Process-local registration/sequence authority and synthetic attestations | Fixture/quarantine classification coordinated with R0-02; future evidence ingestion uses verified actors and durable command identity |
| `marketing/creativePackageEngine.ts`, `providerPackageEngine.ts`, `portfolioEngine.ts` | Process-local completed results and interpolated writes through generic query ports | Route R4/R5/R6 integration to existing canonical creative/campaign/provider services; do not mount these engines merely to claim delivery |

The inspected migration search did not find active migration CREATE TABLE statements for the prototype names `platform_domain_commands`, `platform_command_outbox`, `canary_execution_registry`, `adtech_settlement_ledger` and related claimed registries. Pre-existing staged migration removals and deployed history still require R0-01 reconciliation. Do not allocate a migration slot or recreate retired tables on this discovery alone.

## Concrete next implementation boundary

1. Maintain an explicit prototype disposition/import guard before replacing anything. Test support may retain negative reproductions; do not delete the tests or count fixture engines as production acceptance.
2. Select an actual canonical mounted command, define its Zod request and authenticated organization/actor/aggregate scope, and reuse the existing held-client domain transaction plus outbox intent. DurableOutbox's dedupe key is globally unique within its table; derive a namespaced key from trusted scope, not a raw host-submitted key. Principal/organization in the fingerprint alone do not create scoped uniqueness.
3. Persist a command receipt/CAS state only where the canonical domain lacks it. Keep external writes outside the database transaction, reauthorize after the claim and before the protected effect, and preserve `OUTCOME_UNKNOWN`. Assign migration numbers only after R0 reconciliation.
4. Test separate connections/processes and restart; same key with changed semantic payload; two tenants with the same caller key; stale fence and revoked actor; quotes/Unicode; audit failure; lost COMMIT acknowledgement. A test of one class with a fake query recorder is insufficient.
5. Review failure propagation in `DurableOutbox.inTransaction`: a failing ROLLBACK currently can replace the initial error. This is a source risk to reproduce and repair without changing successful domain semantics. A lost COMMIT must not become permission for a duplicate external write.

## Impact and validation plan

Likely scope is canonical command adapters, related mounted routes/workers, strict request/receipt contracts, domain-specific additive migration only if necessary, and focused real-PostgreSQL tests. No UI or money policy changes follow from replacing an unsafe authority. Tests in `src/test/harvo/durable_outbox.test.ts` are useful real-PostgreSQL foundations, but their fixture-table suite does not by itself establish tenant-role RLS, process restart or production command wiring. Extend the relevant real journey, not every prototype in isolation.

Rollback is disablement of the new command/worker lane with retained durable intent and reconciliation evidence. Never revert to Map-only replay, an unscoped key, raw SQL, blind retry after uncertain outcome, or the secondary settlement ledger. No tests, migrations, external calls or production actions were run for this discovery.
