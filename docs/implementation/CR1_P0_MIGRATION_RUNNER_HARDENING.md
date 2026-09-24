# CR1 P0 — Migration execution integrity

Source inspection found that `src/migrations/runner.ts` warned and continued on
checksum mismatch, accepted checksum-less history, disabled remote TLS validation,
loaded `.env` on import, classified nontransactional execution by substring and
printed raw database errors. These verified gaps contradict the release lock and
checksum contract; no production incident or remote execution is inferred.

Implementation impact: retain the public runner entry point and checksum helper;
move execution into a strictly typed migration module. Validate the complete
manifest/history before pending DDL, reject unknown/missing/drifted/out-of-order
history, hold advisory lock 82749102 on one connection and an explicit transaction
lock for each atomic migration+receipt. Reject nontransactional scripts pending a
separate reviewed recovery protocol. Quarantine uncertain commits and stop.
CLI alone may load environment files; imports and custom local pools never do.
Remote connection configuration validates host/certificate and cannot be weakened
by connection URL query overrides. Public results contain safe codes and filenames.

Compatibility: deployed SQL files/checksums are not rewritten. A legacy NULL
checksum must be investigated against trusted deployment evidence; this code will
not populate a guessed hash or silently skip it. Existing isolated IAM fixtures
apply their single schema directly inside a held transaction and label predecessor
history synthetic. They must not rely on accepting an out-of-order production
migration history. Canonical empty-catalog bootstrap remains a separate P0 gap.

Validation: disposable PostgreSQL tests for two-runner exclusion, replay, rollback,
checksum mismatch before any new DDL, missing/unknown/out-of-order rows, timeout,
and injected lost COMMIT acknowledgement; focused URL/SQL checks and IAM fixture
compatibility. No remote database, schema mutation or grants are authorized by a
successful local test. Rollback retains schema/history; disable execution and
reconcile exact evidence rather than rewriting applied migrations.

Local receipt: 26 tests pass (10 migration-integrity checks and 16 existing IAM
checks), with scoped strict TypeScript and ESLint clean. The manifest parser also
accepts the current checked-in SQL manifest without rewriting any migration.
An initial compatibility test exposed an unnecessary ALTER on an already-present
checksum column; the runner now inspects its existence first instead of requiring
extra table-owner privileges from a migration login that only needs history INSERT.
Remote execution, empty-database predecessor bootstrap and deployment acceptance
remain separate evidence requirements.
