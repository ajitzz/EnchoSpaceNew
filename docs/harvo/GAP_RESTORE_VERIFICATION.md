# HARVO expanded PostgreSQL restore verification

13 September 2026. Scope: test-only M9 acceptance against disposable local PostgreSQL. No remote database, provider, payment, bucket or guest-checkout authority is used or accepted by this drill.

## Impact and plan before implementation

The earlier real `pg_dump`/`pg_restore` drill covered workflow creation, an expired uncertain publishing job and older RLS/audit evidence. New migrations011–015 introduce canonical measurement, immutable billing bytes/proposals/allocations, conversion dispatch claims, shared request limits and reviewed creative provenance. Their restore behavior requires fresh evidence rather than inheriting the old result.

Create a separate test file using `createWorkflowPgFixture` (exact009/010 plus current provider baseline) and apply exact subsequent SQL011–015. Prepare meaningful financial and conversion data through actual service APIs with explicitly injected local evidence ports. Record a balanced committed accounting close, immutable original document bytes/hashes, canonical booking identity and an unknown conversion dispatch. Add a reviewed creative through its service once migration015 is available. Artificial fixture documents/events/HTTP responses are test inputs only, never real account acceptance.

Take an actual custom-format `pg_dump` and restore it into a second database within the same isolated Unix-socket cluster. Compare deterministic per-table row/evidence digests, original document checksums, accounting balances, exact identities, immutable triggers, FORCE RLS and nonowner tenant reads. Replay original service intents and unknown conversion dispatches against the restored database and prove no second journal/allocation/provider write occurs. Provider/payment/storage fetches are refused after restore. Preserve the local dump only for the duration of the drill and remove the disposable databases afterward.

The machine-readable report will record observed versions, exact migration checksums, table counts/digests, local durations and explicit pass/failure boundaries. This is a local restore/replay correctness test, not a production backup, disaster recovery SLO or live-provider reconciliation certification. Root performs final production-source compilation and integrated verification separately. No production source or schema is changed by this task.
