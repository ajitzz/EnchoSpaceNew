# CR1 P2 — Exact-command maker/checker service

Status: bounded service slice locally verified (2026-09-24); not P2 acceptance.
Authority: Founder CR1 Phase 3 directive;
controlling design: `CR1_P2_IAM_TECHNICAL_DESIGN.md`, sections 8 and 22.

## Verified gap and impact

Migration 036 now enforces scoped authority, factor evidence, distinct checkers,
immutable receipts and single-use consumption. The application lacks a service
that safely creates and reviews those receipts. `PostgresWorkforceAuthorization`
consumes approved authority in the domain-write transaction; it must not mint
approval itself.

This additive slice adds `src/lib/iam/privilegedActions.ts`, local PostgreSQL
tests and a reusable socket-only test fixture. It changes no existing API, UI,
provider operation, finance state, runtime grant or production database.

## Service contract

- Request, approve, reject and read exact action receipts from a fresh active
  staff session, current scoped grants and the server-selected environment.
- Parse every boundary with strict Zod. Hash canonical, domain-validated command
  content plus permission, canonical resource, environment, provider, amount and
  reason. Exclude timestamps and UI correlation IDs from semantic identity.
- A domain-specific command schema is supplied by the server. The caller must
  resolve canonical resource/revision/facts; this generic service cannot prove
  that arbitrary submitted business content is true. The server also pins the
  permission and command kind; another desk cannot read/review its receipts.
- Derive a stable internal request UUID from organization, maker and idempotency
  key; same key/different intent is an explicit conflict. Same command under a
  different key cannot create duplicate approval authority.
- Factor proofs come only from the isolated identity adapter. Require exact
  maker/checker, session, action hash, assurance, expiry and verified state.
  This service neither creates nor upgrades proof.
- Acquire fresh authority fences and serialize decision writes on the action
  row. SQL triggers remain authoritative for state transitions and consumption.
- Append bounded immutable audit events in the receipt transaction. Store no raw
  command payload, factor token or provider credential in IAM audit evidence.
- Read/status and approval never execute a provider or domain side effect.
  `runAuthorized()` consumes the approved receipt later in the actual domain
  transaction; network work remains in the durable outbox.
- Missing/unknown, inaccessible, stale policy, changed intent, missing factor,
  expired authorization, conflicting checker decision and revoked authority
  return explicit bounded errors. An ambiguous transaction commit returns an
  outcome-unknown error; retry the same request identity and read canonical state.

## Validation and rollback

The targeted real PostgreSQL suite passes **12/12** tests under the existing
non-owner/non-BYPASSRLS runtime grants. It verifies request replay/conflict,
self-check denial, absent/mismatched/consumed factors, independent review,
rejection, concurrent duplicate review, policy/revocation, pending production
policy denial, desk isolation, bounded canonical hashing, atomic audit rollback,
expired evidence and commit acknowledgement loss. The approved authority is
consumed through the real `PostgresWorkforceAuthorization.runAuthorized` adapter
and cannot execute twice. Targeted strict TypeScript and ESLint pass.

Commands:

```sh
npx -y node@24 scripts/testing/run.mjs src/test/harvo/cr1_privileged_actions.test.ts --reporter=dot
npx -y node@24 node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck src/lib/iam/privilegedActions.ts src/test/harvo/cr1_privileged_actions.test.ts src/test/harvo/helpers/cr1IamFixture.ts
npx -y node@24 node_modules/eslint/bin/eslint.js src/lib/iam/privilegedActions.ts src/test/harvo/cr1_privileged_actions.test.ts src/test/harvo/helpers/cr1IamFixture.ts
```

The fixture applies migration 036 to a minimal disposable local users schema and
uses synthetic migration receipts for other versions; this is not a 001–036
integration rehearsal. No remote environment or provider was contacted. No full
regression sweep was run because this is an iteration inside P2.

No migration is introduced. Rollback disables use of the new service; preserve
all written approval/audit evidence. P2 remains incomplete until staff identity,
bootstrap, lifecycle APIs, operations UI and route cutover are delivered.

## Safe integration contract and remaining boundaries

1. Construct `PrivilegedActions` with the restricted workforce pool, deployment
   environment, server-pinned permission/kind and a strict domain command schema.
2. Resolve a canonical immutable domain revision server-side and call
   `fingerprint({context, idempotencyKey, reason, command})`. Authenticate a real
   second factor through the isolated identity adapter against this exact hash.
3. Supply its persisted `stepUpReceiptId` to `request`. Render the immutable domain
   revision and receipt to a separately authenticated checker; approval binds to
   `expectedCommandHash` and the checker's independent exact-action factor.
4. Re-read/re-hash the canonical command, then call `runAuthorized` with the same
   command hash, authorization ID and maker factor receipt. Perform only durable
   domain writes/outbox enqueue on its supplied SQL client. Never use a read or
   approval response as an execution grant or perform provider calls inside the
   authorization transaction.
5. Serialize only public error `code`/`status`; server-side causes are retained for
   bounded internal diagnostics. On `OUTCOME_UNKNOWN`, replay the same request
   identity or read the canonical receipt before reporting a new operation.

No raw command body is stored here: a domain review screen must load the exact
immutable revision and verify its hash. Migration 036 intentionally allows only
one authorization lifecycle per maker/command hash. Expired/rejected requests
cannot be silently renewed; use a new canonical revision or a future explicitly
designed renewal-attempt model. The service does not create staff sessions,
factor proofs, assignments, invitations or provider operations and does not
itself make an existing route safe for production.
