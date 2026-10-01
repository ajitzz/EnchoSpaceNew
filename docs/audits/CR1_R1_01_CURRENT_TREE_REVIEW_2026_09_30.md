# R1-01 current-tree review — 30 September 2026

**Disposition:** `READY_FOR_REVIEW`, not `RELEASE_ACCEPTED`. The review subject is primary checkout HEAD `7d924d152cd783bcc03b9ef7aac2b1593c62e867` plus its existing unrelated dirty worktree. This review did not apply a migration, connect to Neon, modify an IAM grant or open a workforce session.

## Rechecked source and contract

The current `runtime.ts` requires explicit workforce environment, organization, Google audience and origin before construction. Runtime and issuer databases use separately named URLs; normal staff login does not fall back to the general `DATABASE_URL` or consumer OAuth variables. Remote PostgreSQL TLS uses certificate/hostname validation, while loopback cleartext is limited to explicit LOCAL. `sessionRuntime.ts` validates both URLs and requires the actual issuer catalog. `staffSessionIssuer.ts` checks the connected LOGIN role and reachable inherited/NOINHERIT authorities, writes through one held transaction, binds the challenge and organization before COMMIT and maps an uncertain COMMIT acknowledgement to `OUTCOME_UNKNOWN`. The session router binds nonce material to secure host cookies and checks fixed origin and command header.

These are source observations; the SQL privilege predicates and receipt are not substitutes for inspecting deployed grants or demonstrating the configured browser/OIDC flow. The source hashes in `CR1_R1_01_LOCAL_RECEIPT.json` still match 11 of its 12 recorded paths. `src/test/harvo/cr1_workforce_runtime_config.test.ts` has changed since that receipt, so its old full-source fingerprint is stale; the current test was rerun instead of silently treating the old receipt as exact-tree proof.

## Independent local verification

Command: Node 24 `scripts/testing/run.mjs` with `src/test/cr1_operations_api.test.ts`, `src/test/harvo/cr1_staff_session_issuer.test.ts`, `src/test/harvo/cr1_workforce_runtime_config.test.ts`, and `src/test/harvo/cr1_workforce_tls.test.ts`, compact reporter. Exit 0, **4 files / 38 tests passed**. The staff issuer suite uses disposable PostgreSQL roles and migrations as its local fixture; the operations/API and TLS tests are local/offline. Node 24 client/server typecheck separately exited 0 during the adjacent R1-03 verification. No full release sweep ran because the P2 exit has not been reached.

## Open acceptance evidence

- R0-01 deployed migration identity remains unresolved: applied 045 checksum differs and applied 047 source is absent locally. This review allocated no migration number.
- `DB-01`: actual deployed runtime and issuer LOGIN roles/grants have not been observed with non-owner credentials. `.env` is the primary Neon connection, not a named isolated staging branch.
- `ENV-01`/`IAM-01`: explicit deployed workforce environment, trusted origin, current OAuth audience and operational identity policy have no authenticated staging receipt.
- The current source and four focused suites do not establish cross-browser login/revocation, production rollout or independent protected-card acceptance.

**Next dependency-ready work:** complete R0-01 provenance and local role/restart tests without Neon mutation; obtain a named isolated staging branch and restricted role credentials before a deployed review. Keep workforce operations fail-closed where readiness is absent.
