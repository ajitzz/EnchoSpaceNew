# CR1 P2 — Workforce review desk

Status: bounded implementation locally verified; current authority evidence only. This desk
does not create, attest, or close a formal periodic access review.

## Verified source and impact

Migration 036 already defines `workforce.member.read` as scoped sensitive read
without step-up, and `workforce.access_review` as a separate step-up plus
independent-approval action. The initial role catalog grants member-read to the
Platform Owner; another specialist must receive an explicitly approved grant.
Consumer identity, `users.role=admin`, navigation labels and an Auditor role name
are not substitutes for the permission.

The existing SELECT RLS policies expose only the actor's own grants and
revocations. The membership manage-read policy references PRODUCTION. Reading
those tables directly would present an incomplete directory as if it were
organization-wide. Preserve these policies and add one bounded SECURITY DEFINER
projection, not broad runtime SELECT policies or mutation privileges.

Scope: new shared Zod projection/request contracts, one SQL projection helper at
the end of migration 036, dedicated readiness/grant verification, server service,
read-only `WorkforceDesk` React component, disposable-PG and component tests. Parent
integration owns HTTP/session transport, route mounting and Operations navigation.
No other schema, customer feature, provider, finance or remote system is changed.

## Authority and privacy contract

- Use an authenticated STAFF principal and server-fixed environment. Resolve the
  organization from that principal; reject request fields for organization, role,
  account, permission or environment.
- The same transaction rechecks current session, membership, permission and
  production policy; holds the existing authority fence; then projects exact
  organization evidence and records the authorization read receipt.
- SQL rechecks its own exact organization/environment/member-read authority.
  Projection runs under a non-superuser, non-BYPASSRLS, **NOLOGIN** schema-owner
  role with existing owner-read policies and FORCE RLS. Runtime receives EXECUTE
  on the single helper. Migration execution does not create or alter login roles.
  Deployment must establish the reviewed NOLOGIN owner topology before readiness
  passes; a LOGIN owner is rejected even in local mode.
- Members are organization-wide because membership is shared across environments.
  Grants and pending invitations are restricted to the authorized environment.
  Show member/account identifiers, membership state/expiry, immutable role version,
  exact grant resource/provider/amount/validity/revocation and invitation status,
  creation/expiry. No email, message, invitation token/hash, session, factor proof,
  guest data or credentials are selected.
- Independent keyset cursors and counts for members, grants and invitations make
  page bounds explicit. An expired invitation still stored PENDING is labelled
  EXPIRED_PENDING; merely reading it does not mutate its lifecycle.
- Permission changes stay in exact-command backend services. Show required
  permission/step-up/independent approval without executable mutation controls.
  Viewing this desk never records RETAIN/REVOKE or formal review acceptance.

## Validation and rollback

Targeted real PostgreSQL tests use disposable roles and FORCE RLS, fresh/revoked
authority, cross-organization/environment attempts, bounded pagination, expired
and revoked evidence, schema/privacy validation and denied mutation paths. React
tests cover accessible structure, loading/error/denied/empty/stale states,
pagination, evidence language and absence of role mutation buttons. Scoped strict
TypeScript and lint verify the new files. Parent owns desktop/mobile integration.

Rollback disables the desk route/helper EXECUTE grant while retaining immutable
evidence and IAM schemas. No security policy or role mutation is rolled back by
this read-only slice. Migration 036 remains a local candidate; applying edited
checksums to an already deployed migration is prohibited.

## Local verification and integration receipt

- 20 targeted tests pass: 10 disposable PostgreSQL cases and 10 React/contract
  scenarios. Evidence includes separate non-bypass runtime, unsafe LOGIN owner
  denial, function-body drift/public-EXECUTE denial, exact environment scope,
  independent keyset pages, revoked/expired authority, a genuinely approved and
  issued invitation, privacy allowlists and no formal-review mutations.
- Scoped strict TypeScript and ESLint pass. Browser viewport integration and full
  P2 regression remain parent-owned; these tests do not certify production.
- `WorkforceReviewReader.read(verifiedStaffPrincipal, request)` owns its fresh
  authorization transaction. HTTP request accepts only optional `memberAfter`,
  `grantAfter`, `invitationAfter` UUIDs and numeric limit 1–50 (default 25).
  Shared `workforceReviewSchema` is the complete response contract.
- `WorkforceDesk` accepts `state`, `onRefresh`, optional `onPage(section,cursor)`
  and a test clock. Parent loader must discard obsolete responses on session/org
  changes, validate the shared schema and clear evidence on authorization loss.
- `iamWorkforceReviewRuntimeGrants` adds only EXECUTE on
  `internal_iam_project_workforce_review(uuid,text,uuid,uuid,uuid,integer)`.
  `verifyIamWorkforceReviewCatalog` verifies its exact source hash, owner safety,
  no PUBLIC EXECUTE, runtime separation, FORCE RLS and owner-read source policies.
  The service rechecks it before each projection. No general role permissions or
  existing RLS policies were broadened.
- The standard immutable `AUTHORIZED_COMMAND` receipt records the read permission,
  organization, environment, policy and request hash in the same transaction.
  Its ID is presented as a **read receipt**, never an access-review approval.

Parent integration: `GET /api/operations/v1/workforce` accepts strict page selectors
only, authenticates the separate workforce credential, and rejects injected
organization/environment/principal fields. `WorkforceWorkspace` clears evidence
on session or permission changes and rejects cross-organization/stale responses.
Four transport-fencing React tests and the 9-case Operations API suite pass.
The domain workspace precedes the general assignment queue on mobile/desktop.
