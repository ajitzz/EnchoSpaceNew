# Consumer authentication readiness repair — local impact note

**Class:** production bug fix and security boundary. **Source:** `server.ts` invokes
`databaseReadiness()` in `ensureUsersTable()` before password, Google and phone
verification. This requires unrelated marketing tables, migration history and
recovery grants even when the consumer `users` contract is healthy. The complete
health endpoint and marketing workspace still need those checks.

**Scope:** Add a read-only `users` catalog/privilege check that also calls
`verifyRuntimeDatabaseAuthority()` on the same held connection. Use it only for
consumer auth paths in non-disposable environments. Keep local disposable schema
bootstrap and full service readiness as separate paths. Return a stable 503
without exposing PostgreSQL errors or credentials when auth authority fails.

**Affected surfaces:** `server.ts` consumer registration, password login,
Google login, phone send/verify and session read; new auth readiness module and
focused mounted/actual-PostgreSQL tests. No DDL, migration, provider, payment,
UI or remote environment change.

**Security and compatibility:** Privileged owner/BYPASSRLS/CREATE logins remain
denied. Missing user columns or route-specific table/sequence grants fail
closed. The probe accepts the exact column-level INSERT/UPDATE grants planned
for a restricted web role. A marketing catalog failure no longer denies a
healthy consumer login.
Full `/api/health/ready`, marketing routes and workers remain strict. Existing
local sandbox DDL path remains restricted to its disposable target gate.

**Validation:** Use Node 24 sanitized `scripts/testing/run.mjs` for the focused
mounted routes and disposable PostgreSQL authority/privilege checks. Run
typecheck, scoped lint and diff check. Roll back by reverting only this source
change; no data rollback is needed. Live Vercel login still requires a genuine
restricted runtime connection and exact target proof.

**Local verification, 2 October:** The mounted password, Google and phone
routes passed 3/3 focused tests against a pg-mem fixture with the production
schema-bootstrap path selected; the full health endpoint stayed 503 while
healthy auth paths returned tokens. The mocked auth probe denied token issuance
for unsafe/unready state and did not leak a simulated connection URL. A separate
disposable PostgreSQL LOGIN test passed 3/3 for real users grants, missing
columns, sequence permission and BYPASSRLS rejection. Existing phone response
and cryptographically signed Google HTTP suites passed 24/24. These are local
tests; the mounted fixture mocks the readiness result and the PostgreSQL test
checks it independently. No production role, database or login was changed.
