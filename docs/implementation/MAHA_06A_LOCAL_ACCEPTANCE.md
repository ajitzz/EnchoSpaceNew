# MAHA-06A — isolated local database acceptance foundation

2026-09-11. Category: Infrastructure / testing. Implemented and verified locally; isolated full application staging and browser harness remain incomplete.

## Impact and contract

Previous PostgreSQL acceptance required manually creating and stopping fixtures, increasing reset/cleanup risk. scripts/maha-postgres-acceptance.mjs now owns fresh synthetic checkout and inventory clusters, invokes only the two existing opt-in suites and retains evidence. No production database target is accepted, no dotenv is loaded and only PATH/LANG/LC_ALL/TZ are inherited; DATABASE_URL, provider credentials, PG connection overrides and NODE_OPTIONS are excluded. It uses PostgreSQL 18 on the existing macOS /private/tmp socket contract, with TCP listeners disabled. It does not boot server.ts or provision a hosting account.

Run `node scripts/maha-postgres-acceptance.mjs --plan` for a read-only plan; `npm run test:maha:postgres` executes the two suites. Existing default test/dev/e2e commands remain unsuitable for production-isolated acceptance until their server boot is separated from schema/seed/worker startup. Do not run those commands with production Neon configuration.

Each fixture retains acceptance.json, machine-readable tests.json and test/database logs inside its private temporary directory. Receipts contain timestamps, runtime versions, test/migration/lockfile fingerprints, tracked diff digest and scoped untracked source fingerprints. No secrets are copied. This is local fixture provenance, not an immutable deployed artifact or complete repository certification. Do not edit the source during a release-candidate acceptance run. Pending tracked and untracked work must still be deliberately captured before release.

Successful completion requires all reported tests passed with no skipped/todo tests and confirmed database shutdown. The runner attempts cleanup on command failure and SIGINT/SIGTERM, retains failed receipts and fails if shutdown cannot be verified. SIGKILL/machine loss cannot guarantee cleanup; after interruption inspect recorded exact fixture paths and pg_ctl status before continuing. Never delete or stop an unrelated cluster. All generated data is synthetic and retained, not removed automatically.

## Verification

- Syntax check and read-only plan passed.
- First run's acceptance parser failed on colored console output even though all 14 checkout tests passed; the private wAzH78 cluster was stopped. Replaced console parsing with Vitest's installed JSON reporter contract, validating success and every test count.
- Corrected runner exited 0: checkout 14 passed, inventory 23 passed, both stopped. Evidence: /private/tmp/encho-stay-test.dPkIMu/acceptance.json and /private/tmp/encho-inventory-test.w3abbc/acceptance.json.
- Scoped script lint passed before the reporter-only correction; final lint status recorded in RESUME.md. No real payment/advertising request, Neon migration or deployment.

## Remaining MAHA-06A work

Separate app boot from migration/seeding and uncontrolled background jobs; establish isolated full-schema staging plus secure test identity; create a browser acceptance configuration that refuses production targets; select/provision actual Node-compatible hosting and sandbox service accounts; capture immutable build/flag/migration provenance. This runner completes only the local database-fixture portion, not MAHA-06A or CERT-06.

Rollback removes the new npm command/script; retain test evidence and earlier tests. No application or schema migration is required.
