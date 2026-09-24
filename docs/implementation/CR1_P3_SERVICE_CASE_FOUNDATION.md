# CR1 P3 — Scoped Service Case foundation

## Authority, problem and bounded scope

Founder CR1 execution covers blueprint FR-A15, FR-P11 and P3. Parent engineering authorization permits a bounded foundation: participant-requested cases, immutable context, withdrawal, claimed assignment enforcement, staff content reads and internal notes. This does not implement staff replies, AI assistance, automatic allocation, notification channels or the Service Desk UI.

Existing migration 036 is the workforce authority: organization/member/session, versioned policy, scoped grants, assignments and shared revocation fences. Migration 037 makes participant conversation history immutable and adds durable sequence/outbox evidence. Legacy `users.role='admin'` is insufficient for staff access. The new service must not grant staff broad messages SELECT or counterfeit a participant identity.

## Impact and design before implementation

- Add migration **038_service_cases.sql**. This number has not been deployed; later blueprint candidate offer/media numbers must be allocated when their files are created. No deployed migration is renumbered.
- Add organization/environment-bound `service_cases`, immutable `service_case_events`, `service_case_internal_notes` and `service_case_content_access_receipts`. A case pins one canonical thread and its exact guest/host/listing/experience context at participant request. No reassignment transfers the conversation to another host or property.
- Participant requests require current thread participation, an explicit assistance disclosure version and stable request UUID. The trusted server supplies organization/environment; the browser cannot choose another organization. Withdrawal closes access atomically and preserves evidence. Case lifecycle begins OPEN and can become WITHDRAWN; later resolution/reopening policy is deliberately not invented.
- Reuse `internal_work_assignments` as assignment authority. Staff reads/notes require exact SERVICE_CASE target, organization/environment, assignee, CLAIMED state, unexpired lease, version and fence, plus fresh `service.read` and (for notes) `service.note`. Assignment creation/reassignment remains the protected P2 workflow; this slice cannot issue or self-claim authority by adding a case row.
- A separately provisioned **NOLOGIN, non-owner, non-BYPASSRLS** definer role owns only bounded service-case functions. Consumer and staff database roles have explicit distinct EXECUTE grants. Staff gets no SELECT on messages, threads or internal notes; direct GUC spoofing cannot unlock content. Narrow RLS branches require the definer identity, exact case/thread and a committed access receipt. Role provisioning and ownership transfer are explicit rollout statements, never runtime self-grants.
- Content reads use two transactions. First authorize and commit an immutable access-attempt receipt binding staff/session/policy/assignment/case/thread/window/expiry and originating top-level transaction ID. Second reauthorize all authority and read only that exact committed window. A receipt created in the current transaction is unusable. This prevents a SQL caller from reading content and rolling back its only audit evidence. The application returns content only after the second transaction commits; uncertain commits produce a safe error. A committed receipt records authorized access intent, not proof a human read it.
- Internal notes are immutable staff-only rows, never messages and never guest/host projection fields. Their reads follow the same audited access boundary. Staff replies are absent until an explicit, disclosed Encho sender model exists.
- Preserve the 037 participant boundary. Add only exact dedicated-function policy support; update readiness to recognize the separately verified 038 contract rather than accepting arbitrary additional policies or GUCs.

## Security and failure tests

Use real disposable PostgreSQL with 036+037+038 and separate migration/consumer/staff/definer roles. Test participant-only request/replay/withdraw, immutable context and notes, outsider and legacy-admin denial, wrong org/environment/assignment/version/fence, stale or revoked member/session/grant, policy changes, direct content SELECT denial, forged receipt/GUC, same-transaction receipt rollback attack, narrower immutable windows, expired receipt, case withdrawal between read phases, access-log failure and commit uncertainty. Confirm no internal note reaches a participant projection and no staff command writes host messages.

## Rollback and limits

Disable the new case service and revoke bounded helper EXECUTE; retain immutable cases, notes and access evidence. Never relax participant RLS or erase read receipts. No Neon deployment, external notification or production certification belongs to this slice. Staff allocation APIs, replies, legal disclosure/retention rollout, mobile UI and end-to-end staffed operations remain later work.

## Local verification checkpoint — 24 September 2026

- `cr1_service_cases.test.ts`: **33 passed**, using actual 036/037/038 SQL in disposable local PostgreSQL, distinct non-bypass consumer/workforce identities and a NOLOGIN helper owner. Checks include concurrent request/note replay, status/withdrawal, same-transaction receipt rejection, immutable history windows, session/grant/assignment/policy changes, lost COMMIT acknowledgements and catalog tampering.
- Affected 037 suites (`conversation_delivery.test.ts`, `conversation_notification_worker.test.ts`): **35 passed**. Exact participant readiness still passes both before and after the optional 038 extension.
- New shared contracts, service, readiness, catalog and fixture/test files pass isolated strict TypeScript and ESLint. No remote database connection, deployed migration or provider operation was performed.
- Shared contracts are exported from `src/shared/conversation/serviceCases.ts`. `ServiceCases` accepts distinct participant/staff pools and trusted `{organizationId, environment}`. Methods: `status`, `request`, `withdraw`, `read`, `addNote`. Parent composition supplies authenticated ACCOUNT/STAFF principals; no legacy admin-role fallback exists.
- `status` exposes only the latest applicable public case state and required disclosure version. Either pinned participant may withdraw assistance. Read authorization is rechecked before and after the exact query and serialized with IAM revocation; the application commits before returning content. A completed read cannot retroactively be erased if authority is revoked later.
- Notes return the latest bounded snapshot (up to 100); older note pagination is not implemented. Reusing a committed receipt for the same page is permitted for two minutes; every new window requires a new receipt. The receipt records authorized access intent, not a claim that a human viewed it.

## Service Desk UI impact and implementation plan

Next additive slice, authorized by parent integration: `components/operations/ServiceDesk.tsx` and scoped stylesheet; isolated React/browser fixtures. Parent owns mounting and API/runtime authentication.

1. Consume only strict, server-projected service desk permissions and canonical `SERVICE_CASE` resources. A claimed, unexpired assignment supplies its exact case ID, version and fence. Neither human labels nor legacy account roles create authority.
2. Require an explicit **Open audited conversation** action. No automatic content fetch, browser persistence, offline replay, analytics payload, console log or staff impersonated reply.
3. Read through POST `/api/operations/v1/service/read` with dedicated HttpOnly workforce cookie, command header and `cache: no-store`. Validate exact shared response schema and matching case ID before presentation.
4. Purge private content and abort requests on identity/session/assignment/fence/expiry changes, desk access loss or case denial. A late response from an old context cannot repopulate the view.
5. Internal notes are clearly labelled staff-only; an explicit command uses a stable request UUID. Unknown results retain the exact command for safe retry, without falsely showing it as saved. Validate the note receipt, then refresh through another audited read.
6. Provide truthful unassigned, unclaimed, expired, loading, denied and unavailable states; responsive two-column layout and keyboard-accessible controls. Verify desktop/mobile overflow, focus, explicit access, note retry and context-change privacy through isolated fixtures, without production data or network.

## Service Desk UI verification

`ServiceDesk` is implemented with explicit audited reads, a memory-only case view, current claimed assignment checks, staff-only notes and stable UUID retry after an unknown note result. A projected noncredential workforce session ID is required; missing IDs disable content access. Assignment mutation actions (`CLAIM`/`RELEASE`) do not double as read permission. Session/member/organization/assignment version/fence/lease changes remount the private view and abort stale requests.

- React privacy and command tests: **11 passed**.
- Isolated browser scenarios: **18 passed** at **1440/360 px**, including keyboard open, no automatic private read, same-command note retry, audited refresh, session replacement, lease expiry, empty/unclaimed/denied/unavailable states and no horizontal overflow.
- UI/shared contracts/fixtures pass isolated strict TypeScript and ESLint. Desktop/mobile screenshots were visually inspected.
- Artifacts: `/var/folders/xz/n8vtdw5x6js6lj7q5y211s3h0000gn/T/encho-cr1-service-desk-2CTdPH`. Parent owns route mounting, participant disclosure UI, HTTP/runtime composition and the subsequent shell layout ordering. These isolated fixtures do not establish a working staffed production environment, approval of legal disclosure/retention, staff replies or case assignment issuance.
