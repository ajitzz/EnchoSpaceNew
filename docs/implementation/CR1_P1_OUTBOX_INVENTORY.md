# CR1 P1 Durable Queue and Outbox Inventory

**Status:** IMPLEMENTED LOCALLY — shared foundation only  
**Date:** 23 September 2026  
**Scope:** CR1 P1 reliability primitives; no queue replacement and no schema migration  
**Primary blueprint:** `docs/blueprints/ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md`

## 1. Decision

Encho does not currently have one interchangeable queue. It has several specialized persistence models whose safety properties differ because their external effects differ. Replacing them with a generic table during P1 would erase proven domain invariants and consume migration `036`, which is reserved for organization IAM.

P1 therefore adds a reusable contract and PostgreSQL service in `src/lib/platform/durableOutbox.ts` without changing an existing table or worker. The service is the required baseline for new CR1 outboxes in migrations `037` and `041`. Existing queues may adopt it only through a domain-specific, separately tested migration.

The shared contract standardizes:

- strict Zod validation for enqueue commands and stored rows;
- stable SHA-256 request fingerprints and dedupe conflict detection;
- transaction-bound enqueue through a caller-owned `pg.PoolClient`;
- bounded payload, trace, principal, priority and attempt fields;
- `FOR UPDATE SKIP LOCKED` claims in a held transaction;
- worker identity, leases and monotonically increasing fences;
- deterministic bounded exponential backoff with jitter;
- explicit `DEAD` and `RECONCILIATION_REQUIRED` outcomes;
- fail-closed treatment of expired or failed ambiguous external writes;
- append-only event calls for enqueue, claim, retry, dead-letter, unknown outcome, replay and reconciliation;
- compare-and-swap manual replay and reconciliation methods.

It does not claim that current legacy webhook or notification queues now satisfy this contract.

## 2. Existing queue inventory

| Queue / authority | Source and schema | Current guarantees | Verified gaps | P1 disposition |
|---|---|---|---|---|
| Marketing command jobs | `src/migrations/010_harvo_marketing_workflow.sql`, `src/lib/marketing/jobs.ts`, `src/lib/marketing/engine.ts` | Unique dedupe key; payload conflict check; database claim with `SKIP LOCKED`; attempts, lease and fence; stale-worker completion rejection; bounded retry; provider mutations enter reconciliation after failure/lease expiry | Job row has no stored request fingerprint; claim/lease transitions lack their own immutable attempt event stream; one global expired-lease sweep and one undifferentiated ready lane can create fairness pressure; retry jitter uses process randomness | Preserve. Do not migrate during P1. Later adapter must retain provider-unknown semantics and campaign finance locks. |
| Canonical conversion outbox | `src/migrations/011_harvo_marketing_measurement.sql`, `src/migrations/013_harvo_marketing_conversion_delivery.sql`, `src/lib/marketing/measurement.ts`, `src/lib/marketing/conversions/*` | Canonical booking event and conversion intent commit together; unique provider/event/kind identity; immutable payload trigger; one dispatch attempt; provider destination fingerprint; durable delivery events; unknown outcome quarantine; diagnostic observation and local synchronization never blindly replay a provider write | Specialized one-attempt model is intentionally not a general retry queue; dispatch and delivery use two linked state models; complete provider proof remains externally gated | Preserve exactly. This is the strongest existing external-write pattern and informs the shared execution classes. |
| Creative derivative preparation | `src/migrations/015_harvo_marketing_creative_review.sql`, `src/lib/marketing/creativeWorkflow.ts` | Bounded three attempts; due index; `SKIP LOCKED`; lease and fence; exact-byte/manifest evidence; stale-claim guarded writes; immutable evidence/audit events | Claim does not persist worker identity; expired processing work is directly reclaimable because its operation is local preparation; retry delay is fixed; a failed audit/update path requires domain-specific handling | Preserve. It is a local-effect queue and should not inherit ambiguous-provider behavior. |
| Corridor inference jobs | `src/migrations/035_marketing_corridor_inference.sql`, `src/lib/marketing/adtech/inference.ts` | Deduped location hash; policy-driven attempts/leases/rate limits; transaction advisory lock; `SKIP LOCKED`; fence; structured output validation; retry/dead handling; AI only proposes and cannot publish | Claim is globally serialized for quota; retry jitter uses runtime randomness; job transitions are not a standalone immutable attempt ledger; global admin policy is deliberate but not reusable for tenant notification work | Preserve. It is a bounded AI research queue, not an external spend command queue. |
| Inbound webhook queue | Runtime DDL in `server.ts`; `src/lib/webhookWorkerService.ts` | Ingest idempotency key; batch claim uses `SKIP LOCKED`; bounded attempts and a dead-letter state | The current worker sets `processing` without a lease/fence/worker identity, so a crash can strand a row; success/failure updates are unfenced; the outer fatal catch returns a zero result and can hide an operational failure; payload parsing is untyped; domain dispatch is coupled to a dynamic `server.ts` import | Legacy containment. Do not extend. Replace through a later verified webhook ingress/consumer slice using the shared contract and signed raw-body evidence. |
| Legacy asynchronous webhook queue | Runtime DDL and `processAsyncWebhookQueue` in `server.ts` | Claim occurs inside an explicit transaction; timed-out processing rows can be reclaimed; bounded batch; lease; attempt counter; terminal rows copied to a DLQ | No fence or worker identity, so stale workers can finalize a reclaimed row; fixed retry delay; completion updates are unfenced; some payload paths update campaign state/metrics directly; it is explicitly legacy | Keep quarantined behind the legacy boundary. No new callers. Retire only after caller and production telemetry prove zero use. |
| Legacy webhook DLQ | Runtime DDL and `processWebhookDLQ` in `server.ts` | Bounded retry count, lease, global advisory lock and delayed retry | Successful retry deletes evidence; production behavior contains random simulated failure; it does not redispatch the original domain handler; no immutable replay actor/reason/receipt; no fence | Unsafe as canonical CR1 evidence. Disable for new work; preserve rows for incident review until an evidence-preserving migration is approved. |
| Lead notification intents | Runtime DDL in `server.ts`; `src/lib/leadAlertingCrmService.ts` | Intent rows exist before asynchronous processing; channels, attempt limit, lease, retry and DLQ-like status are represented | Claim select/update is not guaranteed to share an explicit transaction; no dedupe key, fingerprint, fence or worker identity; stale workers can mark delivery; default dispatcher only logs yet marks delivery; generated internal email/phone recipients are placeholders; no provider receipt; delivery events are not immutable | Do not treat as delivered notification authority. Migration `037` should introduce canonical `notification_intents`/`notification_attempts` on the shared contract and migrate callers through shadow comparison. |
| Scheduled organic social worker | `host_social_posts` runtime schema and `processScheduledSocialPosts` in `server.ts` | Transactional claim, lease, attempt count; uncertain provider failure is stopped for reconciliation rather than blindly replayed | Legacy Graph/provider path; no fence/worker identity; success update is unfenced; old workflow and content authority are outside CR1 | Keep feature-flagged/quarantined. Do not adapt as a generic outbox. |
| Keyword research claims | `src/lib/marketing/portfolio/keywordResearch.ts` and portfolio migrations | Per-customer slot, lease, fence, advisory transaction lock, provider rate pacing, cached evidence states | This is a synchronous evidence cache/claim, not a durable external-command outbox; no DLQ/replay event ledger | Preserve as a specialized read-only research coordinator. |
| Pause recovery attempts | `src/lib/marketing/pauseRecovery.ts` and recovery migrations | Exact operator candidate fingerprint, lease, immutable attempts, source job fencing and provider readback; prevents concurrent recovery | Human recovery workflow is intentionally coupled to marketing pause semantics and cannot be generalized without losing safety context | Preserve as the reference for audited manual reconciliation. |

## 3. Shared standard table contract

The P1 service does not create schema. A future domain migration that uses it must supply an outbox table with the following logical columns:

| Column group | Required meaning |
|---|---|
| Identity | UUID `id`, unique `dedupe_key`, immutable `request_fingerprint`, validated `topic`, `partition_key` |
| Payload | JSONB `payload` validated by the domain's Zod schema; default hard limit 256 KiB |
| Execution safety | `execution_class` = `LOCAL_EFFECT`, `IDEMPOTENT_EXTERNAL` or `AMBIGUOUS_EXTERNAL` |
| State | `PENDING`, `RUNNING`, `RETRY`, `SUCCEEDED`, `DEAD`, `RECONCILIATION_REQUIRED` |
| Claim | priority, bigint fence, attempts, max attempts, lease time, available time and claimed worker identity |
| Trace | correlation, optional causation, principal and organization identifiers |
| Outcome | sanitized error code, created/updated/completed timestamps |

It must also provide an event table accepting `outbox_id`, `event_type`, `actor_id`, `reason`, JSONB evidence and an immutable creation time. The migration must enforce append-only event evidence, immutable command meaning, ready/lease indexes, least-privilege grants and `FORCE ROW LEVEL SECURITY` where tenant data is present.

## 4. Execution semantics

### 4.1 Atomic enqueue

The domain service opens a transaction, writes canonical state, and calls `enqueueInTransaction` with the same `PoolClient`. A storage or event failure rolls back both. Exact replay returns the canonical intent; the same dedupe key with different meaning throws `OUTBOX_IDEMPOTENCY_CONFLICT`.

### 4.2 Claim and fence

The shared service recovers expired leases and claims ready work in one database transaction. A successful claim increments both attempt and fence, records worker identity, and writes a `CLAIMED` event. Heartbeat, success and failure require the exact `(id, fence, worker_id)` while the lease is valid.

### 4.3 Unknown external outcome

`AMBIGUOUS_EXTERNAL` work never automatically re-enters a provider write after lease expiry or any failed attempt. It enters `RECONCILIATION_REQUIRED`. An audited operator must resolve it from provider readback using compare-and-swap. This is stricter than treating a timeout as failure.

### 4.4 Retry and dead-letter

Local and provider-idempotent operations may retry with deterministic bounded exponential backoff and jitter. Permanent failures or exhausted attempts enter `DEAD`. Manual replay requires the exact fence, actor and a meaningful reason, resets attempts, advances the fence and records immutable replay evidence.

## 5. Validation evidence

Focused real-PostgreSQL tests are in `src/test/harvo/durable_outbox.test.ts` and verify:

1. domain row and outbox intent roll back atomically;
2. identical dedupe replay returns one canonical row and changed meaning conflicts;
3. concurrent workers claim six distinct commands through `SKIP LOCKED`;
4. expired local work advances the fence and rejects stale completion;
5. expired ambiguous external work enters reconciliation and cannot be auto-claimed;
6. bounded attempt exhaustion enters `DEAD`, and manual replay records actor and reason.

Local result on 23 September 2026: **6 tests passed** using the repository's Node 24 runtime and a disposable local PostgreSQL cluster. Targeted ESLint and isolated TypeScript checks passed.

## 6. Remaining integration work

- Migration `037` must define canonical conversation notification tables that implement this contract, plus channel-specific attempt and provider-receipt evidence.
- Migration `041` may extend the standard to provider command evidence after preserving all current marketing reconciliation invariants.
- Current queues remain operationally distinct until shadow comparison, fault injection and replay tests prove a safe cutover.
- The inbound webhook and lead notification legacy paths remain release gaps. This P1 foundation does not make them production-ready.
- Metrics for lag, expired leases, claim contention, retries, DLQ depth and reconciliation age must be wired when the first production consumer adopts the library.

## 7. Honest status

This slice is **implemented locally**. It establishes the reusable CR1 P1 contract and proves its database semantics. It does not complete P1, migrate a live queue, deploy a worker, or clear any production/provider/legal gate.

