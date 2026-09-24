# CR1 P2 — Verified workforce invitation lifecycle

Status: implemented and verified on disposable local PostgreSQL. This is a
service/catalog foundation, not a deployed invitation flow or complete P2.

## Verified gap and design

Migration 036 contains invitation and membership tables but no safe unaffiliated
account acceptance boundary. Its ordinary runtime RLS requires existing staff
authority. Letting an account set organization/member GUCs cannot establish that
authority. Reusing the migration-owner bootstrap on every invitation would also
break the isolated runtime boundary.

The bounded solution separates two capabilities:

1. A current staff member requests a strictly typed invitation command with exact
   released role versions, permission snapshots, scoped conditions and expiry.
   Creation consumes `workforce.grant` maker/checker authority in the same
   transaction and separately requires `workforce.invite`. A database-stamped
   `consumed_transaction_id` prevents a previously consumed authorization from
   being reused later in a different transaction. Only a hash of a fresh
   32-byte token is stored. The one-time delivery result is not an email receipt;
   this slice sends no external message.
2. An independently authenticated invitee accepts the exact persisted bundle.
   A trusted identity port verifies current account/email/subject evidence. A
   separate non-owner, non-BYPASSRLS identity-writer credential can execute only a
   bounded acceptance function. The shared workforce runtime cannot call it.
   The function revalidates token digest, verified email/account, expiry,
   revocation, current policy, current role/permission snapshots and inviter/
   every required independent checker's current authority; it atomically records the unique identity evidence,
   membership, exact grants, invitation transition and immutable audit.

Acceptance never accepts role/scope overrides and never creates a staff session,
factor receipt or AAL2 claim. Existing suspended/offboarded membership cannot be
reactivated. Same-account acceptance replay returns the original membership;
another account cannot consume or replay it. Unknown commit outcomes are resolved
by replaying the same command/token and reading canonical evidence.

## Scope and impact

- Service: `src/lib/iam/workforceInvitations.ts`; explicit creation, replay,
  revocation and trusted acceptance. No existing HTTP or UI contract changes.
- Migration 036: coordinated append-only local unpublished schema extension for
  invitation provenance/transition integrity and isolated acceptance receipts/
  function. The IAM agent retains ownership of assignment sections.
- Deployment: separate `iamInvitationReadiness.ts` grants/checks for the narrow
  identity writer. No grant to shared runtime and no production invocation.
- Tests: actual disposable PostgreSQL roles, persisted PrivilegedActions maker/
  checker evidence, exact identity/failure/concurrency and FORCE RLS boundaries.
- No external email, account creation, host/admin role change, provider/payment
  mutation or session/factor issuance.

## Failure and compatibility rules

Pending invitations remain immutable except legal terminal transitions. Expired
or revoked tokens cannot create authority. A changed policy or role release
requires a newly reviewed invitation. A lost first-response token is not
recoverable from the database: explicitly revoke and issue a new invitation.
No success is reported merely because an invitation row exists.

Production continues to require an approved operational policy and a real
trusted identity adapter. Fixture receipts establish test behavior only. Domain
resource ancestry for property/campaign scoped grants must be resolved before
requesting the privileged command, as required by the existing authorization
contract; caller-supplied ancestry is not new authority.

## Local verification and integration contract

- 18 invitation tests pass on actual disposable PostgreSQL, using the complete
  migration 036 and separate migration-owner, restricted workforce runtime and
  isolated identity-writer roles. No remote database or `.env` connection is used.
- The 11 owner-bootstrap checks also pass with this schema extension.
- Targeted ESLint and strict TypeScript compilation pass for the service,
  readiness checker and invitation test file.
- The combined invitation, IAM migration, assignment and privileged-action run
  passes **58/58 tests across four files** after integrating the parallel
  session-lifecycle owner-policy partition. No readiness checks were weakened.
  This slice does not certify the complete P2 release exit.

Verification command:

```sh
npx -y node@24 scripts/testing/run.mjs src/test/harvo/cr1_workforce_invitations.test.ts src/test/harvo/cr1_iam_migration.test.ts src/test/harvo/cr1_iam_assignment.test.ts src/test/harvo/cr1_privileged_actions.test.ts --reporter=dot
```

The invitation suite verifies hash-only tokens, exact verified identity, unknown
and expired identity denial, immutable bundles, changed policy/role rejection,
current inviter/checker authority, concurrent acceptance, revocation, expiry,
atomic audit rollback, lost commit acknowledgements, stale cross-transaction
authorization denial, denied shared-runtime acceptance, receipt RLS, unexpected
PUBLIC function privileges and bounded database-unavailability errors.
The final 18-test invitation rerun also verifies that even column-only table
grants disqualify the isolated identity writer, and that missing definer account
row-lock privileges prevent readiness. Scoped lint and strict compilation remain
clean after that hardening.

To integrate safely:

1. Mount authenticated staff endpoints only after the trusted principal/session
   boundary. Resolve current role snapshots and resource ownership server-side.
   Use `issueActions`/`revokeActions` to request and independently approve the
   exact typed command before executing `issue`/`revoke`.
2. Grant only `iamInvitationRuntimeGrants(runtimeRole)` to the already restricted
   workforce runtime. Run the base IAM catalog verifier plus
   `verifyIamInvitationCatalog(runtimeClient, 'RUNTIME')` before enabling it.
3. Provision a separate non-owner, non-BYPASSRLS identity-writer credential with
   only `iamInvitationIdentityWriterGrants(identityRole)`. It has no public-table
   privileges, cannot call issue/revoke and cannot inherit administrative roles.
   Verify it with mode `IDENTITY_WRITER`. Never reuse the migration credential or
   shared runtime pool. The definer owner requires bounded account-table read
   and row-lock privileges; the local fixture grants `SELECT(id,email), UPDATE(id)` on
   `users` to the non-BYPASSRLS migration owner, not to the identity writer.
4. Supply a real independent `OwnerIdentityEvidencePort` implementation to
   acceptance. A request body, account `google_id`, client email assertion or
   receipt hash alone does not establish verified identity. The trusted adapter
   validates the authenticated account and current verification receipt; SQL
   binds its verified email to the current account and exact invitation. Outside
   `LOCAL`, fixture evidence is rejected. No real adapter is configured here.
5. Deliver the fresh invitation token only through an approved secure delivery
   path; never log it. This slice sends no email and claims no delivery success.
   Replay can return canonical invitation metadata but cannot recover the token.
   Submit acceptance in an authenticated POST body, not a server URL/path that
   can enter access logs or referrers. Apply bounded account/IP attempt limits
   at the HTTP boundary before invoking the trusted identity adapter.
6. Acceptance returns a membership receipt, not authenticated staff access.
   Session issuance, MFA enrollment and operational-policy approval remain
   separate prerequisites. Map bounded service errors through the public error
   envelope; never expose database errors or stored identity evidence.

## Validation scope and rollback

Verify hashed-only token persistence, exact email/subject and expiry, missing or
unverified identity, different-user replay denial, immutable approved bundles,
distinct checker, current inviter/checker permission, changed policy/role,
concurrent acceptance, atomic audit failure, revoked/suspended authority and
denial of direct runtime acceptance or table writes. Run targeted tests, strict
TypeScript and lint; the P2 exit remains responsible for the full sweep.

Rollback disables new invitation endpoints/writer deployment. Retain accepted
memberships and audit history; revoke access through lifecycle commands rather
than deleting evidence. No remote migration or rollback is part of this task.
