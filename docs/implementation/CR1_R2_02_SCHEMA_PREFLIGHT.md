# R2-02 build and schema identity boundary

Status: IN_PROGRESS. Local verification only; no deployed identity or production readiness assertion.

## Compile/package

`npm run build:offline` requires Node 24 and gives the child compiler only an allowlist of non-secret operating-system variables. Vite does not load `.env` files. Neither `build` nor `build:offline` invokes a database checker. SQL packaging fills missing candidate assets from the source manifest, but rejects and preserves any existing unknown or changed SQL. It never edits source SQL or applied history. Stale candidate SQL cannot be silently carried into a release. CI uses the sanitized build; Docker additionally disables build-step networking after dependency installation.

On this macOS workstation the local proof command is:

```sh
sandbox-exec -p '(version 1) (allow default) (deny network*)' node scripts/build/offline.mjs
```

Use Node 24. This compiles a credential-free candidate, not a deployable configuration or a live smoke test. Explicit reviewed public client variables belong to a separately identified deployment build; a local build never imports developer secrets to fill them.

## Explicit read-only deployment preflight

After compilation, the separately authorized deployment operator provides these environment-variable **names**, through approved secret injection:

| Input | Meaning |
|---|---|
| `ENCHO_DEPLOYMENT_ENVIRONMENT` | LOCAL, STAGING or PRODUCTION |
| `ENCHO_DEPLOYMENT_TARGET` | Named approved deployment |
| `ENCHO_DEPLOYMENT_EXPECTED_HOST` | Exact expected database endpoint hostname |
| `ENCHO_DEPLOYMENT_EXPECTED_DATABASE` | Expected database name |
| `ENCHO_DEPLOYMENT_EXPECTED_ROLE` | Actual restricted LOGIN identity |
| `ENCHO_DEPLOYMENT_DATABASE_URL` | Dedicated restricted connection URL; not general application/owner credentials |

Then run `npm run deployment:schema-preflight`. The command never sources `.env`, falls back to `DATABASE_URL`, calls a migration executor, or creates `schema_migrations`. Remote TLS validates the certificate and hostname. The environment label is an operator declaration; this command does not independently prove that a Neon endpoint belongs to an approved staging branch.

The checker uses one held connection and a read-only repeatable-read transaction, with shared advisory lock 82749102. An exclusive migration lock rejects the check. It compares source, packaged and applied SQL version/checksum sets exactly. Missing/extra/duplicate/out-of-order/changed history fails. Malformed SQL filenames fail discovery instead of being omitted.

Basic runtime isolation rejects current/reachable superuser, BYPASSRLS, role/database creation, replication, database/public-object ownership, schema/database CREATE, and table/column-level migration-history mutation. NOINHERIT membership is not considered safe because SET ROLE can acquire authority. This is **not** the complete domain RLS, grants, helper-body, worker or predecessor-schema acceptance harness.

## Apply remains a separate action

Migration application retains the existing held-connection runner and advisory-lock/checksum/unknown-COMMIT behavior. A read-only result never authorizes apply. No migration number is allocated here. The later authorized Neon history inspection records 041–047 beyond current source; original applied 045/047 bytes remain unresolved under R0-01. No source or applied SQL bytes are changed.

## Validation and rollback

The first local compile used generated-asset synchronization that removed stale candidate SQL. Its pre-build SQL bytes were not separately archived; therefore that run cannot establish the previous artifact's migration identity. Following the authorized Neon observation, packaging is being tightened to **reject and preserve** any existing SQL that is unknown or differs from source, instead of deleting/overwriting it. A clean candidate directory is required when retiring an old artifact. Targeted packaging tests must prove failure leaves old bytes intact and cannot write through source/destination symlinks. This correction does not claim that missing migration 047 ever existed in the earlier local build.

Focused tests use disposable local PostgreSQL with separate LOGIN roles, not Neon. They cover actual permission escalation paths, exact-history negatives, missing-history non-creation and lock exclusion. Independent reviewers identified missing NOINHERIT/column/database-owner checks; these were repaired with regression cases. Initial offline server compilation failed on three workforce principal narrowing errors; that transcript is retained separately from the subsequent repair.

Rollback disables promotion of the candidate, retaining the last compatible artifact and database history. Never restore insecure TLS, owner bypass, history rewriting or an implicit remote build check. Final command receipts and source identities accompany the batch handoff.
