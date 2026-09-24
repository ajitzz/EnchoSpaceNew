# CR1 P2 — Session revocation and member offboarding

Status: implemented and locally verified; bounded service slice, not P2 acceptance.

## Verified gap and impact

036 has staff sessions, factor evidence, revocation receipts and membership
states, but no bounded runtime command atomically removes an operator's access.
Membership is organization-wide while grants are environment-scoped. A LOCAL
permission must therefore never implicitly remove PRODUCTION authority.

This additive slice introduces `workforceLifecycle.ts`, one database command,
immutable lifecycle receipts and local PostgreSQL tests. It does not change
account/guest/host identity, routes, provider data, remote databases, session
issuance or factor issuance. Existing statement/lock timeouts remain bounded.

## Command and authority design

- Operations: SUSPEND, OFFBOARD and REVOKE_SESSIONS for another member. Own-session
  logout remains a separate account/session boundary; this governance command
  rejects self-targeting.
- Canonical intent includes target membership, expected membership version,
  operation, environment and reason. Strict Zod plus SQL validation protect the
  boundary. The exact approved action is consumed inside the SQL command, not in
  an earlier transaction. Receipt uniqueness by authorization prevents duplicate
  side effects; replay still requires current operator authority.
- `standardActions` binds `workforce.suspend` with the catalog's step-up policy.
  `protectedActions` binds `workforce.grant` with its independent-checker policy
  and additionally requires `workforce.suspend`. Removing/suspending an owner
  requires the protected path and a checker distinct from both maker and target.
- Require suspension authority in every unrevoked target grant environment,
  including future grants. PRODUCTION requires approved operational policy and
  the configured minimum remaining active production owners. Unknown or missing
  policy is a denial, not an assumed emergency override.
- Sessions are immutable environment-bound identities. The server's fixed
  environment is set transaction-locally; session, permission and factor checks
  reject a LOCAL session used against PRODUCTION even when its member has both
  grants. Global removal requires a PRODUCTION command/session when the target
  has production grants; staging-only targets cannot be removed from LOCAL.
  Remaining grant lanes are checked against current membership authority without
  treating one session as a credential for every environment.
- Rare lifecycle commands acquire the IAM policy barrier exclusively, then
  deterministic member locks. Execution authorization takes the shared barrier,
  so either its transaction completes first or it observes the revocation.
- Suspension/offboarding revokes grants, sessions and factors; releases active
  assignments with version/fence increments; cancels unconsumed authorizations
  involving the target. Session-only revocation preserves grants/membership state
  but invalidates session/factor/action evidence and releases queued ownership.
- Every affected session/assignment/authorization and the membership command
  records immutable audit. Financial/provider history and the user account are
  preserved. No automatic reactivation or grant restoration is included.

## Database and integration boundary

Runtime receives SELECT on its lifecycle receipts plus EXECUTE on the one bounded
command. No raw membership, grant, session or assignment mutation grant is added.
Owner-only conditioned FORCE RLS policies permit precisely the command's target
member updates. Readiness validates policy predicates, roles, immutability,
function ownership/search path and exposed grants.

Integration contract:

1. Use an isolated restricted workforce pool and a server-fixed environment.
   Call `iamLifecycleRuntimeGrants(role)` alongside the existing IAM grants;
   the added surface is SELECT on `internal_workforce_lifecycle_commands` and
   EXECUTE on `internal_iam_apply_workforce_lifecycle(jsonb,uuid,text,text,text)`.
2. Require `verifyIamCatalog` and `verifyIamLifecycleCatalog` at startup. The
   latter supplements the former; it does not replace global role/capability
   validation. Disabled immutable receipt triggers fail readiness.
3. Construct the STAFF principal from the authenticated server session. Obtain
   the exact reviewed command through `standardActions` or `protectedActions`.
   Do not accept caller-assigned assurance, role, organization or session IDs.
4. Call `execute` with that action authorization, unchanged command, reason and
   membership version. Do **not** wrap this command in `runAuthorized`: it takes
   the exclusive barrier and consumes approval itself in one transaction.
5. On `OUTCOME_UNKNOWN`, preserve the same command and authorization. Retry that
   identity to read its durable receipt; never mint another authorization to
   guess whether the original committed. Success reports effect counts, status
   and version without session tokens, factor proofs or grant contents.

The original 036 factor constraint conflicted with its transition guard: a
verified factor could legally transition to EXPIRED, but the constraint required
EXPIRED evidence to be absent while the guard forbade deleting that evidence.
The constraint now permits EXPIRED with the original complete proof or no proof,
keeps incomplete proof invalid, and preserves VERIFIED/CONSUMED proof requirements.
This is a verified local schema defect repaired before migration release, not a
claim about a production incident.

## Validation, risks and rollback

Use disposable non-BYPASSRLS PostgreSQL for exact approval/factor checks, owner
protection, cross-environment authority, CAS/replay, atomic rollback, revocation
of a claimed worker, concurrent execution serialization and immutable evidence.
Targeted TypeScript/lint accompany tests. Network calls never run under locks.
The global IAM write barrier is intentionally limited to rare personnel safety
commands; bounded lock timeout returns failure without partial revocation.
Rollback removes the command's EXECUTE grant and preserves all evidence. Full
production policy/identity rollout and P2/CR1 certification remain separate.

## Local verification evidence

- Five-suite real PostgreSQL regression: **71/71 passed** across lifecycle (13),
  core IAM (16), assignments (12), privileged actions (12), invitations (18).
- Lifecycle suite additionally covers disabled receipt enforcement readiness and
  environment-bound session enforcement. Tests use actual restricted,
  non-BYPASSRLS roles.
- Coverage includes self/forged identity denial, cross-environment removal denial,
  pending production policy, independent owner review, minimum-owner policy,
  stale versions, previously consumed authority, exact-command replay, rollback
  after final audit failure, concurrent protected work and uncertain commit
  acknowledgement recovery. No live policy was approved by these fixture tests.
- Targeted strict TypeScript and ESLint pass for the slice. Full regression/build
  and browser acceptance remain the parent's major-milestone exit checks.

Commands (Node 24):

```sh
npx -y node@24 scripts/testing/run.mjs src/test/harvo/cr1_workforce_lifecycle.test.ts --reporter=dot
npx -y node@24 node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck src/lib/iam/workforceLifecycle.ts src/server/deployment/iamLifecycleReadiness.ts src/test/harvo/cr1_workforce_lifecycle.test.ts
```

The fixture applies 036 against a minimal local identity schema. It does not
certify a full production 001–036 migration rehearsal, remote Neon, final IAM
policy approval, session issuance, factor issuance, UI integration or staging.
Own-session logout, reactivation and restoration of revoked grants are separate
flows; this command intentionally does not implement them.
