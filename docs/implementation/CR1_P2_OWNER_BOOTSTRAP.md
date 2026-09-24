# CR1 P2 — Explicit workforce owner bootstrap

**Status:** Implemented and locally verified; offline disposable PostgreSQL rehearsal only. No remote database, email, identity-provider or ad-provider mutation was performed. This is the owner-bootstrap slice of P2, not P2 acceptance or production authorization.

## Design and impact before implementation

The current migration seeds the `encho` organization and a scoped `platform_owner` role, but creates no workforce member. Automatically selecting all legacy administrators would silently widen authority. Existing `users.email` and `google_id` also do not provide a durable, independently verified email receipt. They cannot prove email ownership or MFA.

The bootstrap service requires an explicit manifest with a maximum 24-hour lifetime binding organization key, deployment environment, active policy hash, exact owner-role release hash, operator and reviewer user IDs, review-evidence hash, reason, expiry and exact existing owner user IDs with normalized-email and identity-evidence hashes. Production requires an approved operational policy, at least its configured minimum of two distinct owners, and a distinct reviewer. The manifest is an operator authorization artifact; its hashes are neither identity proof nor a cryptographic signature by the reviewer. A trusted identity verifier must independently supply fresh verified-email/subject evidence matching each manifest entry. No staff session or MFA assurance is created.

Migration 036 applies FORCE RLS even to its non-BYPASSRLS owner. The narrowly bounded offline bootstrap uses the actual migration-owner connection, checks ownership and absence of superuser/BYPASSRLS privileges, takes the migration/authority advisory locks, and temporarily installs exact-row INSERT policies for memberships, owner grants and bootstrap events. It removes every temporary policy before commit. Rollback removes all transactional DDL/data. Shared runtime roles receive no new grants or permanent policies. Dry-run executes the same validation and rolls back without creating authority.

Existing active memberships and exact grants are reused only if consistent; suspended/offboarded membership or revoked authority fails closed. A repeated manifest is idempotent and returns its existing immutable receipt. A different manifest cannot silently replace a prior bootstrap for the same organization/environment. Role assignment is restricted to the released platform-owner governance role and organization scope. No finance, campaign creation or activation permission is added to that role.

### Files and boundaries

- `src/lib/iam/ownerBootstrap.ts`: validated manifest, deterministic hash, privileged transaction and independent identity-evidence port.
- `scripts/cr1/bootstrap-workforce.ts`: explicit local disposable-fixture rehearsal; dry-run by default. It never loads `.env` or connects to a supplied remote URL.
- `src/test/harvo/cr1_owner_bootstrap.test.ts`: real disposable PostgreSQL, non-superuser/non-BYPASSRLS migration owner and rejected runtime actor.
- No change to migration 036, server routes, account roles, provider/payment state, real staff sessions or factor verification.

### Acceptance and rollback

Tests must prove exact identity matching, stale/duplicate/altered manifest rejection, production approval/two-owner gates, idempotent receipt replay, unchanged authority after dry-run, atomic failure cleanup, FORCE RLS remaining enabled, no permanent bootstrap policy, no staff session/factor issuance and no role widening. The CLI must emit only safe IDs/hashes/counts/status; errors must not print raw database errors or credentials. Before real deployment, an independently reviewed owner manifest, trusted identity-evidence adapter and isolated migration credential remain required.

## Verified interface and operational prerequisites

1. Use `bootstrapWorkforceOwners({pool, manifest, mode, reviewedManifestHash, identityEvidence})` only from isolated offline operator tooling. It is not an HTTP endpoint or application startup hook.
2. The connection must be the actual non-superuser, non-BYPASSRLS migration owner, with no `SET ROLE` impersonation. The shared runtime role is rejected. Migration 036 and its active `encho` organization must already exist; the bootstrap does not guess or create an organization or user.
3. The migration owner needs `SELECT` on `users` and an update-column privilege for PostgreSQL `SELECT ... FOR SHARE` identity locking. The disposable fixture grants `SELECT, REFERENCES, UPDATE(id)` to its isolated migration role. No such grant is issued to a shared runtime role by this service.
4. The identity verifier must resolve a trusted receipt independently of the manifest, verify its issuer/audience and exact existing account association, and bind the verified subject and email to the specified user ID. Evidence older than 24 hours, future evidence, expired evidence, or validity over 24 hours is rejected. A `LOCAL_FIXTURE` source is accepted only for `LOCAL`. No production identity adapter is supplied or claimed here.
5. Each exact account must already have the legacy `admin` role and a matching current normalized email. This is an explicit migration of reviewed owners, not domain-based discovery or automatic promotion. Two subject hashes alone are not proof of two independent humans; operational review must establish that independence.
6. `DRY_RUN` checks policy, role permission set, account identity, membership and grant state and rolls back. Generated IDs in a dry-run are tentative plan identifiers; only the manifest hash is stable across runs. `APPLY` requires the exact reviewed hash and writes one immutable `OWNER_BOOTSTRAP_COMMITTED` receipt.
7. Grants are organization-scoped and environment-specific. The platform-owner role contains governance and incident permissions only. The service additionally verifies its exact permission set, so an unchanged role hash cannot hide added provider/finance permissions.
8. Exact manifest replay returns `ALREADY_APPLIED` only while its manifest/evidence are valid and its granted authority remains consistent. Suspended membership or revoked grants are never restored. A different manifest after bootstrap is rejected; subsequent workforce changes must use the audited workforce lifecycle.
9. Concurrent serializable transactions can make one attempt fail closed. Retry the same valid reviewed manifest with fresh trusted evidence after an error; the committed receipt determines whether it already applied. Do not mint a new manifest to bypass conflict or revocation.
10. The transaction locks organization and role-pointer changes during the short bootstrap. Policy updates use the IAM policy advisory fence. A write failure rolls back both data and temporary policy DDL. A connection whose rollback fails is destroyed. After a successful commit, corrections use revocation/offboarding; never delete audit evidence or treat destructive rollback as a valid history rewrite.

Email hashes and subject hashes remain pseudonymous personal data. They are not anonymous and belong in restricted operator/audit records. Reasons must contain only the necessary operational explanation, without passwords, tokens or unnecessary personal details.

## Local CLI rehearsal

The CLI deliberately accepts no database URL or secret file and never loads `.env`. It creates and closes a fresh Unix-socket-only cluster per invocation. The supplied identities are explicit synthetic fixtures, never selected from an existing database.

```sh
npx -y node@24 node_modules/tsx/dist/cli.mjs scripts/cr1/bootstrap-workforce.ts --describe-rehearsal > /tmp/encho-cr1-bootstrap-rehearsal.json
npx -y node@24 node_modules/tsx/dist/cli.mjs scripts/cr1/bootstrap-workforce.ts --rehearsal --manifest=/tmp/encho-cr1-bootstrap-rehearsal.json
```

The second command was verified to return `scope: DISPOSABLE_LOCAL_REHEARSAL`, `outcome: DRY_RUN`, and `eventId: null`. The CLI has an explicit `--apply` plus `--reviewed-manifest-hash` option confined to that disposable cluster, but no CLI apply was run in this task. The production service branch is exercised only by isolated test fixtures; no live policy was approved.

## Validation evidence

- Focused real PostgreSQL suite: `src/test/harvo/cr1_owner_bootstrap.test.ts` — **11/11 passed**, with no skipped tests; exact manifest identity, no-write dry-run, independent identity and expiry checks, pending versus approved policy, runtime/superuser rejection, permission widening, concurrent attempts, transactional failure cleanup, immutable event/idempotency, and refusal to restore revoked/suspended authority.
- Scoped ESLint and strict isolated TypeScript passed for the service and CLI.
- No schema, server route, account role, provider state, payment state or master HARVO document changed by this slice.
- External identity receipts, reviewed real-owner manifest, approved production policy, secure secret custody and production rollout remain separate prerequisites. Local tests do not provide that evidence.
