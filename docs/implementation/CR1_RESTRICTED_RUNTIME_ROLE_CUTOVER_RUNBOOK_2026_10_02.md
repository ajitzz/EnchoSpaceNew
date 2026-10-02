# CR1 restricted runtime role — review and cutover procedure

**Status:** LOCAL REHEARSAL ONLY. No Neon role, credential or Vercel setting was changed. The production login incident is not fixed by this document.

## Evidence and exact scope

Production readiness reports a bypass-RLS object owner. Its schema inventory and portfolio/adtech catalogs pass after the exact applied migration source was restored in `89ce3bd`; runtime authority remains unsafe. `server.ts` chooses `DATABASE_URL` before `POSTGRES_URL`, and the Vercel Neon integration currently supplies `POSTGRES_URL`. Auth invokes the global `databaseReadiness` before reading `users`, so the unsafe role blocks login.

`restrictedWebRuntimeRolePlan()` emits SQL for a **new** non-owner `NOINHERIT/NOBYPASSRLS` LOGIN. It reuses `portfolioRolloutGrants()` and `adtechRolloutGrants()`, and adds the historically earlier 023–026 portfolio grants those helpers assume. It also adds the exact recovery and `schema_migrations` read grants and the legacy account SQL privileges. The plan never loads secrets, connects to a database, changes Vercel, grants blanket table rights, or mutates migration history.

Generate reviewable SQL with Node 24:

```sh
./node_modules/.bin/tsx scripts/deployment/print-restricted-web-role-plan.ts encho_web_runtime_v1
```

The emitted role has no password until the owner configures one through a private interactive database session. A deployment must use a separate migration owner and separate workforce/worker principals. Never put a password or full connection string in a ticket, terminal transcript, Git commit or test output.

## Required order for an eventual cutover

1. Identify the exact isolated Neon staging project/branch, database and migration owner. Verify its full `schema_migrations` manifest and deployed artifact; no URL from `.env` is presumed staging.
2. Review generated SQL, confirm every referenced table/sequence exists, then apply it to staging under its migration owner. If `PUBLIC` has `CREATE` on the public schema or the runtime has any privileged membership, stop and correct the catalog under change control. Do not add an owner membership to make grants pass.
3. Set the new role password privately; connect as that role through an **actual new LOGIN** with verified TLS, not `SET ROLE` on the owner connection. Run `deployment:schema-preflight` against this explicitly named target and inspect `/api/health/ready` from the staged artifact.
4. Run the route matrix below using one consenting synthetic or approved test account/offer, including failure and retry paths. Capture status and correlation identifiers without PII. Reconcile any permission failure with a narrow, reviewed grant and rerun the entire matrix. A 200 readiness response cannot substitute for these operations.
5. Stage the Vercel credential change on a named preview deployment and run the matrix again. Only after the same production identity, schema, grants and artifact are verified may Production `DATABASE_URL` be switched to the restricted web login and deployed. Because code prioritizes `DATABASE_URL`, check the effective role through `/api/health/ready` and direct role fingerprint; do not infer it from an environment-variable label.
6. Monitor login, registration, listing, inquiry, worker and admin errors. Preserve the prior routing secret for a bounded rollback window. If any critical journey fails, restore the previously known connection route while maintaining the safety gate, then repair/test the missing grants. Never disable the readiness gate or use the owner as a permanent runtime.

## Representative route and privilege matrix

| Journey | Current minimum object authority | Local proof | Cutover requirement |
| --- | --- | --- | --- |
| `/api/health/ready` | catalog metadata, `schema_migrations` SELECT, recovery/portfolio/adtech exact grants | Separate LOGIN on disposable PostgreSQL: authority, history, recovery, portfolio and adtech checks pass. Synthetic partial schema still returns `ready=false` because required tables are absent. | Full schema and route 200 under isolated staged artifact. |
| Email login / account registration | `users` SELECT, column INSERT, `users_id_seq` USAGE; `settings` SELECT | Current SQL shapes succeed through a new LOGIN; role/password HTTP flow not mounted in this rehearsal. | Mounted email login and registration, bad password, duplicate registration, session creation. |
| Google/phone login and profile | `users` SELECT/INSERT, column UPDATE, sequence; OTP backing tables and provider identity verification separately | Google-ID column update works; OTP backing store and provider callback not tested. | Mounted Google/phone sign-in and role-safe account linking. |
| Guest listing and booking | `listings`, `room_types`, `media_assets`, inventory/hold and booking tables plus RLS context | Not covered by this minimal role plan. | Guest read and permitted booking/hold path, including rejection and rollback. Current legal booking gate remains. |
| Host listing edit/publication | `listings`, room/media authority, audit, outbox and review policies | Not covered. | Exact Host edit and Admin moderation under separate tenant identities, before/after public projection. |
| Host marketing workspace/funding/pause | campaign, finance, provider entities, jobs, journal and pause controls | Only catalog/recovery subset covered. | Draft → review → accepted quote → funded paused publish/readback → safe pause; no paid activation without external gates. |
| Guest/Host conversation | threads/messages/intents and canonical conversation grants | Not covered; separate conversation grant plan exists. | Message, read, notification queue and tenant-isolation tests. |
| Admin/Staff operations | dedicated workforce principal and IAM grants | Not covered by the consumer web role. | Independent restricted workforce login, maker/checker and revocation tests. |

**Cutover decision:** blocked until the missing route rows above are proven under the exact staged role and artifact. Creating a fresh role that merely turns `/api/health/ready` green could break Host/Admin writes, so it is not a production fix by itself.

### Explicit grant-gap register for the current route composition

These are source-visible unmet grants in the candidate role, not observed Neon errors. The gate remains closed until actual mounted tests and RLS policy behavior are checked:

| Route | Source operation | Candidate role gap |
| --- | --- | --- |
| `GET /api/listings` and `GET /api/listings/:id` | Public projection reads listing, room, media and availability relations | `room_types`, `media_assets`, `inventory_days` and public projection dependencies have no grant in this plan. |
| `PUT /api/listings/:id` and `PUT /api/listings/:id/rooms` | Host mutation updates `listings`, upserts room/media rows and checks ownership | `listings` is SELECT only; room/media writes and necessary sequences are absent. |
| `PATCH /api/admin/listings/:id/status` and `PATCH /api/admin/media-assets/:id/moderation` | Admin status/media moderation updates canonical rows; current code also requires publication and audit review | No status/media UPDATE or full moderation audit grants; per-actor policy and atomicity must be checked. |
| `GET /api/marketing/v2/workspace` | Workflow, finance preference, outcome and provider read models | Only catalog subsets and historical evidence grants; campaign workflow, finance and provider read grants are incomplete. |
| `POST /api/marketing/v2/campaigns/:id/quote`, `/fund`, `/publish`, `/pause` | Revision-bound finance, jobs, provider, audit and idempotent state changes | Finance/journal/job/provider mutation grants are absent. Do not add blanket grants; verify exact worker separation and invariants. |
| `POST /api/bookings` | Currently returns `STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE` before write in production | A role change cannot clear the legal/commercial gate; future canonical hold/order grants need separate accepted design. |
| `POST /api/conversations/v1/...` | Participant service uses conversation runtime and outbox | Dedicated conversation grants and an actual participant role login are not included here. |

The mounted route matrix must test both permitted and denied principals on separate connections. Do not reduce this list to a `SELECT`-only health probe.

## Residual security finding

The legacy `users` login query is `SELECT *`, so the web role needs broad `SELECT` on a table without a demonstrated per-account RLS boundary. Migration 045 also includes `is_admin_or_rls_bypassed()` based on caller-settable session flags. Neither issue is solved by `NOBYPASSRLS` alone. A separate service-bound, transaction-local identity redesign and route-level tenant tests are needed before treating this as industrial tenant isolation.
