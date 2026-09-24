# CR1 P2 — Own assignment claim/release

Status: bounded lifecycle slice locally verified (2026-09-24); not P2 acceptance.
Authority: CR1 Phase 3 founder directive;
controlling design: CR1_P2_IAM_TECHNICAL_DESIGN.md sections 6, 8, 11 and 16.

## Verified gap and scope

Migration 036 stores assignments and fences changes against authorization, but
there is no runtime claim/release service, transition guard or durable replay
receipt. Assignment rows also omit environment and the resource capability
required to perform the assigned work. Giving runtime UPDATE would permit much
more than the requested bounded lifecycle.

This slice adds a strict service, one narrow SECURITY DEFINER command, immutable
command receipts and local PostgreSQL tests. No UI, routes, remote database,
provider actions, reassignment, completion, invitation or session minting is in
scope. Migration 036 is still local/unreleased; its additive definition and
readiness manifest change together.

## Design and impact

- Assignments pin environment, optional provider and required permission. The
  required permission is nullable for compatibility; historical unbound rows
  fail closed and require explicit cancellation and a canonical replacement.
  Active uniqueness includes environment, so a local task cannot reserve the
  corresponding production queue slot.
- Claim/release requires the current active staff session, own assignment,
  current `work.assignment.claim` scope and the exact pinned resource permission.
  An assignment never grants the resource capability by itself.
- Active production policy is required for PRODUCTION. Lease duration comes
  from versioned policy (`assignmentLeaseSeconds`), never a browser field.
- Compare-and-swap uses expected version and bigint fence. Claim moves ASSIGNED
  or expired CLAIMED to CLAIMED; release moves CLAIMED to terminal RELEASED.
  Every accepted transition increments version/fence. Terminal records cannot
  be reopened. Expired claims can be reclaimed with a new command and fence.
- Lock order is policy/shared, current member/exclusive, assignment row. This
  avoids concurrent shared-to-exclusive member lock upgrades. Reassignment
  adapters must acquire the same member fences before changing assignment rows.
- Immutable command receipt identity binds organization/member/idempotency key;
  its hash binds operation, assignment, expected version/fence, environment and
  reason. Exact replay returns its historical receipt without extending lease;
  changed intent conflicts. The SQL function writes the transition, command
  receipt and immutable IAM audit in one transaction.
- Runtime gets SELECT on the receipt table and EXECUTE on the narrow function;
  it gets no assignment/receipt INSERT or UPDATE privileges. FORCE RLS and fixed
  SECURITY DEFINER search path/owner policies remain mandatory.
- Domain execution must subsequently recheck current permission, assignment
  state, lease and expected fence. A claim response is never an execution grant.

## Implemented integration contract

`AssignmentService(restrictedWorkforcePool, deploymentEnvironment)` exposes
`claim` and `release`. Strict input is the authenticated staff principal,
organization ID, assignment ID, expected version, decimal-string expected fence,
idempotency key and reason. The deployment chooses environment; the request
cannot provide a lease duration, target permission or provider override.

`PermissionCheckInput.resource` now requires `assignmentVersion` and
`assignmentFence` whenever `assignmentId` is supplied. Both the SQL permission
adapter and privileged-action request adapter require exact CLAIMED state,
unexpired lease, environment, required permission, provider, resource identity,
version and fence. Reading an ASSIGNED row no longer satisfies a claimed-work
execution reference. Requests without an assignment reference retain their
existing authorization semantics; domain routes must require assignment context
where their workflow mandates it.

The command returns a bounded receipt with ID, state, version, decimal-string
fence, lease expiry, hashes and replay flag. A replay is historical and never
extends a lease, reverses release or authorizes execution. Reload the current
assignment view after any command. Transport commit ambiguity returns
`OUTCOME_UNKNOWN`; reuse the same idempotency identity to recover the receipt.

### Exact privilege changes

- Add runtime SELECT on `internal_assignment_commands` (own receipts through
  FORCE RLS).
- Add runtime EXECUTE on
  `internal_iam_command_assignment(uuid,text,integer,bigint,text,text,text,text,text)`.
- No runtime INSERT/UPDATE/DELETE on assignments or command receipts.
- A migration-owner-only INSERT policy permits the SECURITY DEFINER command to
  append receipts; immutable triggers reject update/delete even for the owner.
- Readiness checks the new RLS/immutability/lifecycle contracts and exact exposed
  versus private SECURITY DEFINER EXECUTE privileges.

The seeded `assignmentLeaseSeconds: 300` remains part of the unapproved
operational policy, not a declaration of production readiness. Broad assignment
reassignment and completion remain separate future commands; terminal release
requires a new explicit assignment to re-enter the queue.

## Validation and rollback

Use disposable local PostgreSQL with separate non-BYPASSRLS migration/runtime
roles. Test same-key replay/conflict, concurrent claims, CAS/fence mismatch,
expiry/reclaim, terminal release, scope/provider/environment isolation, session
revocation, no direct SQL mutation, immutable audit/receipts, transaction rollback
and runtime readiness. Targeted TypeScript and lint accompany the suite.

Verified **12/12 assignment tests** and **40/40 combined assignment, core IAM
migration and maker/checker tests**. Targeted strict TypeScript and ESLint pass.
Tests cover separate WORKFORCE queue scope plus exact CAMPAIGN scope, rather
than requiring an organization-wide campaign grant. The concurrency test holds
an authorized domain transaction open and proves release waits for its authority
fence; after release, the previous worker cannot execute. Additional tests prove
revoked sessions/grants deny even historical replay, audit failure rolls back
all writes, command receipts cannot mutate, and a lost commit acknowledgement
recovers through replay without extending the lease.

```sh
npx -y node@24 scripts/testing/run.mjs src/test/harvo/cr1_iam_assignment.test.ts src/test/harvo/cr1_iam_migration.test.ts src/test/harvo/cr1_privileged_actions.test.ts --reporter=dot
npx -y node@24 node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck src/lib/iam/assignmentService.ts src/lib/iam/authorizationPort.ts src/lib/iam/postgresAuthorization.ts src/lib/iam/privilegedActions.ts src/test/harvo/cr1_iam_assignment.test.ts src/server/deployment/iamReadiness.ts
npx -y node@24 node_modules/eslint/bin/eslint.js src/lib/iam/assignmentService.ts src/lib/iam/authorizationPort.ts src/lib/iam/postgresAuthorization.ts src/lib/iam/privilegedActions.ts src/test/harvo/cr1_iam_assignment.test.ts src/server/deployment/iamReadiness.ts
```

The fixture applies actual migration 036 to a minimal local users schema with
synthetic receipts for other migration versions; it does not certify the full
001–036 chain. For lease expiry only, the fixture administrator shortens a test
lease and restores the lifecycle trigger before any restricted claim executes;
production has no time-manipulation endpoint. No remote database/provider or
full repository regression sweep was used in this iteration.

Rollback disables the new adapter/function grant while preserving evidence. No
production rollout or complete CR1/P2 acceptance is asserted by this slice.
