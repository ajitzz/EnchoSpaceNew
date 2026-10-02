# Login readiness incident — scoped migration/source reconciliation

**Environment:** `www.encho.co.in` production deployment `6ec5b66`, observed 2 October 2026. **Status:** repair in progress; no release or database mutation accepted.

## Root cause and authority

Chrome reproduced `DATABASE_MIGRATIONS_OR_ROLE_NOT_READY`. The deployed `/api/health/ready` returned HTTP 503 with no missing tables and forced RLS present, but the active database login can bypass RLS, owns objects and can create schema. Migration history validation and recovery privileges also fail. `server.ts` routes login through `ensureUsersTable()` and the global `databaseReadiness()` gate, so the error is a real server refusal before authentication. Vercel identifies deployed Git commit `6ec5b66`; Antigravity's separate dirty worktrees are not deployed.

The current Git manifest ends at migration 040, while a founder-authorized read-only observation of the local `.env` Neon candidate found applied versions 041–047. The historical remote Git commit `d7f3dd0ce1525a8d784a30ac76559e8fcd9744d4` contains **exact byte-for-byte checksum matches for all seven versions**, including 045. After restoration, a read-only comparison found 46 local and 46 recorded migration versions with no missing or mismatched checksum. The candidate database has not yet been cryptographically tied to Vercel's integration URL, so this is provenance evidence, not permission to alter its ledger.

## Scoped local change

Restore only the seven original SQL files to `src/migrations/`. Do not edit their bytes, run the migration executor, rewrite `schema_migrations`, merge other worktrees, or relax readiness. This changes the packaged migration manifest for future builds, with no DDL/DML on its own. The rollback is to revert this source-only commit; do not delete applied database history.

## Remaining deployment dependency

A separate restricted web `LOGIN` role must be created/configured and granted exactly the required access without `BYPASSRLS`, object ownership, CREATE or reachable privileged membership. The public Neon integration's owner URL cannot remain the runtime credential. Verify with an actual restricted login and read-only catalog/adversarial checks; deploy that credential through the named Vercel project and require `/api/health/ready` 200 before testing login. Marketing/provider/funding gates remain separate. Never replace this with a bypass flag or guest-login shortcut.

## Validation and limits

Completed locally in this isolated worktree: restored-file SHA-256 comparison; sanitized Node 24 migration runner/schema-preflight tests 33/33, owner review 1/1, migration asset packager 6/6; TypeScript typecheck and offline build exited 0. The staged `git diff --check` flags historical trailing spaces in migrations 045 and 047. Those spaces are part of applied checksummed bytes and **must not be trimmed**; the new impact note passes a whitespace check. The read-only `.env` candidate readiness query still reports `ready:false`, because its owner login can bypass RLS, owns objects, can create schema, and can mutate migration history; the exact manifest match cannot overcome an unsafe role. Preserve existing CR1 dirty work in the primary checkout. Do not claim login repaired until the deployed readiness probe and an authorized login flow pass using the exact Vercel database target.
