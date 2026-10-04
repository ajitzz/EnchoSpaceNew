# Encho CR1: guest–host conversation and scoped service blueprint

> **Reconciliation qualification, 4 October 2026:** Retained as a scoped proposal for the later conversation/service wave. It does not change W0 local acceptance, activate guest messaging or make historical source observations current. Reverify its route and worker assumptions against the canonical integrated source before implementation.

**Status:** Evidence-led engineering proposal, 2 October 2026. This companion elaborates P3 and W6 of the [controlling three-sided blueprint](ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md) and [golden-path plan](CR1_EVIDENCE_LED_GOLDEN_PATH_TO_PRODUCTION_2026_10_02.md); it does not approve contact policy, staff surveillance, external alerts, a paid pilot or release. [R4-01/R4-02](../implementation/CR1_REMEDIATION_WORK_PACKAGES.md), the Constitution, HARVO, current decisions and the external gate register remain controlling. Source anchors describe the inspected primary checkout at `6ec5b6602ab8e9c2cb4776ba5d178ae923876710` with existing uncommitted work. This is a focused semantic review, not a complete repository or deployed-system audit.

## 1. Business outcome and critical distinction

An Encho ad or listing earns attention; a useful, timely, trustworthy host reply can turn an inquiry into a booking. The first CRM release must let a guest ask about **one real stay and offer**, receive a reply from the actual host, continue that conversation across login/reconnect, and request clearly identified Encho help when needed. The host must see the inquiry with enough verified context to answer without promising unavailable inventory or an unapproved price. Operations must recover unanswered or unsafe conversations through scoped, auditable cases without becoming a second, unaccountable seller.

**A heart/save is private intent, not permission to expose a guest to a host or send marketing outreach.** Recommended policy: only an explicit guest message or separately worded contact opt-in creates a host-visible lead. The founder has been asked to confirm this materially important rule. Until then, engineer the conservative rule. A host may reply to the guest who initiated an inquiry; unsolicited host messaging from wishlist or browsing data is outside this release.

This is neither a detached CRM nor an “AI answers every lead” product. Reuse the canonical participant conversation, listing/room authority, durable notification intent, workforce IAM and booking/payment boundaries. A chat message cannot confirm availability, quote a final price, collect payment or create a booking.

## 2. Current source truth, not a completion certificate

| Boundary | Verified source behavior | Operational gap / consequence |
|---|---|---|
| Entry | `components/ListingDetailsNew.tsx:913-923` has “Message host”. `App.tsx:1214-1235` authenticates, POSTs `/api/threads`, then switches to Messages. | The response thread ID is discarded; `InboxPage` starts with no selected thread. No first message is sent. A guest can land in a list and must find the new conversation; an empty thread is not a lead. A pre-auth click loses its intended destination. The action lacks a clear busy state and uses a generic alert on failure. |
| Participant authority | `src/lib/marketing/inquiryInbox.ts` resolves the actual owner of a published listing/experience, rejects self-contact and mismatched `hostId`, scopes history/send/read to participants, advisory-locks create, and uses a client UUID for send replay/conflict. `src/server/conversations/router.ts` mounts the participant commands. | Preserve this authority. Do not use client-supplied host identity as the final owner, and do not replace it with a parallel chat store. Mounted two-account proof is still required. |
| Guest/Host UI | `components/InboxPage.tsx` shows thread/history/composer in Guest and Host modes, reconciles optimistic UUIDs and explicitly acknowledges viewed messages. `components/HostDashboard.tsx:302-306` mounts the host inbox. | UI tests with mocked API/socket establish component behavior, not durable delivery across real accounts, devices, process restart or deployed roles. Listing context such as selected room, dates and party does not accompany contact. The composer clears before a send receipt; failed/unknown bubbles have no direct retry/edit action. A socket message scrolls to bottom even if someone is reading older history. |
| Alerting | Migration 037 and the conversation worker provide durable notification intents and socket-hint attempts. `src/lib/conversations/notifications.ts` marks email/push/SMS `NOT_CONFIGURED`; `src/server/conversation/notificationRuntime.ts` needs explicit dedicated worker credentials. | A committed message is not evidence that a host device was reached. The in-app hint, queue state, device receipt and human read must remain separate. Real external channels and consent are unproved. |
| Assistance | `src/server/conversations/serviceRouter.ts` exposes participant request/status/withdraw and staff read/internal-note commands. `components/operations/ServiceDesk.tsx` explicitly cannot send a public staff reply. The mounted Admin Messages default is a link to `/operations/service`; broad legacy Admin Inbox read/delete endpoints are denied by `src/server/assistance/legacyConversationBoundary.ts`. | Admin/staff cannot yet answer the guest in the canonical thread. Admin oversight is not the same as unrestricted content access or impersonating the host. R4-02 remains in progress. |
| Content policy | `src/lib/marketing/inquiryInbox.ts:132` passes submitted content through `maskContactInfo`; `src/lib/maskUtils.ts` silently replaces emails, phone-like numbers, WhatsApp links and all HTTP links. | This can rewrite meaningful guest text and is not a substitute for an approved privacy/contact-sharing policy. The Constitution explicitly prohibits unapproved silent alteration. Reproduce behavior, review policy with `PRIV-01`, and separate XSS-safe rendering from content moderation. Do not turn off protection without a reviewed replacement. |
| Release evidence | Focused inbox/service/notification component suites passed 40/40 in this review with mocked auth/API/socket. The production-bundled Inbox fixture browser script passed 17/17 desktop/360px checks, and the isolated Service Desk browser script passed 18/18; both used fixture auth/API and blocked external network. Prior notification-panel fixture checks are similarly local. | These tests do not prove a real two-account, restricted-role, cross-process, external-channel or paid-booking journey. The Service Desk browser itself displays that replying as either participant is unavailable. Corrective acceptance remains 0/32; historical CR1 package reacceptance remains 0/48 at this review. |

The source shows a **two-way messaging foundation**, not a fully operated three-sided CRM. The specific user-visible defect is contact-intent continuity; the specific staff defect is absence of a permitted, disclosed public reply. Source review did not establish a production incident or measure reply speed/conversion.

**Checks performed for this review:** `npm test -- src/test/cr1_inbox_ui.test.tsx src/test/cr1_service_desk.test.tsx src/test/cr1_notification_panel.test.tsx` exited 0 (40/40 mocked component assertions); `node scripts/testing/cr1-inbox-browser/run.mjs` exited 0 (17/17), and `node scripts/testing/cr1-service-desk-browser/run.mjs` exited 0 (18/18). The browser scripts use production-bundled UI with fixture auth/API and external network denied. They verify presentation and local interaction only. No database migration, real message, real notification, provider call, payment or full regression was run for this planning review.

## 3. External benchmarks and what Encho should actually adopt

| Official source | Observed pattern | Encho disposition |
|---|---|---|
| [Airbnb Contacting hosts](https://www.airbnb.com/help/article/147) | Guest explicitly contacts a host; reservation-specific questions carry dates and party size. | Preserve explicit guest intent; carry selected stay context and avoid turning a save into permission to contact. Do not copy Airbnb's policy without Encho approval. |
| [Airbnb unified messages](https://www.airbnb.com/help/article/3558) | Guest, host and support threads are findable in one account experience, with filters and qualified read receipts. | One account may have Guest and Host queues, but property participant threads and Encho support cases must keep distinct access scopes. A read receipt requires an explicit view acknowledgement. |
| [Booking.com conversation API](https://developers.booking.com/connectivity/docs/messaging-api/managing-conversations) | Stable conversation identity and retrievable property/guest exchanges. | Treat thread ID and context as durable navigation/API contracts, not transient toast state. |
| [Intercom assignment](https://www.intercom.com/help/en/articles/6561699-assign-conversations-to-teammates-and-teams) and [SLA controls](https://www.intercom.com/help/en/articles/6546152-set-slas-for-conversations-and-tickets) | Named owners, team queues and first/next-response clocks. | Measure from committed events, surface accountable queues and handoffs; make no 5-minute or 24-hour promise before staffing/hours are approved and observed. |
| [Zendesk public replies versus internal notes](https://support.zendesk.com/hc/en-us/articles/4408828489370-Adding-comments-to-tickets) | Customer-visible replies and staff-only notes are distinct actions. | Keep separate commands, storage/projections and UI treatments. A private note must never be returned by participant APIs. |
| [Airbnb message reporting](https://www.airbnb.com/help/article/2020) | Participants can report inappropriate contact. | Add report/block/escalation with reviewed safety handling and audit; do not treat blanket link stripping as a complete anti-phishing system. |

These are design references. They do not establish Encho's feature completion, legal position, response SLA or conversion uplift.

## 4. Target journeys and the exact actors

### Guest inquiry to host reply

1. On a real published property/offer, Guest taps **Ask the host**. The page shows the exact property, optional selected room/offer, dates, party size and a clear “not a reservation/price guarantee” label. A heart/save remains private. A guest may edit the context before sending.
2. Unauthenticated Guest can draft locally, sign in, and return to the **same** property and compose sheet. No message or host-visible lead exists until the Guest explicitly sends. On account switch, purge the former actor's draft/queue and require a fresh send confirmation.
3. One server command resolves the current published listing owner, verifies the room/offer context, creates or finds the correct thread, appends the first message with a stable `clientEventId`, and commits one notification intent on the same held transaction. Replayed submission returns the original receipt; a changed payload under the same UUID conflicts. If a transaction outcome is unknown, reconcile by UUID rather than creating a second inquiry.
4. The response contains canonical thread ID and first message receipt. Route to `/messages?thread=<opaque-or-authorized-id>` (or equivalent route state); the Inbox loads and authorizes that exact thread. A notification deep link does the same. Unauthorized, deleted, superseded or unavailable context produces an actionable state without showing another person's conversation. If save returns definite failure, preserve editable draft and a bounded retry; if the outcome is unknown, retain the UUID and reconcile before offering another send.
5. Host sees a queue item with source-qualified listing/room/dates/party context, message age and reply action. Host response uses participant authority, not a client-supplied receiver. Guest sees the reply in the same thread after reconnect or polling even if socket delivery was lost.
6. Mark messages *saved to Encho*, *alert queued*, *device delivery confirmed* and *read* only with the corresponding server evidence. A socket hint is not device delivery. A host reply is not a booking. If the room/date later changes, show a fresh canonical availability/price lookup or an “unknown/changed” warning rather than replaying a stale claim.

### Encho assistance without surveillance or identity confusion

1. Guest or Host explicitly requests help from a property conversation or opens a separate support case. Support case metadata may reference the participant thread, but content is not globally copied into an admin inbox.
2. A scoped staff member claims/receives the case through workforce IAM. The system commits an access-purpose/assignment receipt **before** protected content is returned; every later read and send rechecks active session, role, assignment, scope and consent. Unassigned staff and a broad legacy `users.role='admin'` alone cannot browse content.
3. The staff interface distinguishes an **internal note**, a **draft for host review**, and a **guest-visible Encho reply**. If policy permits entering the property thread, show a participant-visible “Encho support joined” event and sender identity. Never post as the Host or silently transfer the guest to another property.
4. Safety/abuse emergency access is a separate, narrowly scoped break-glass action with reason, expiry, review and immutable access receipts. Admin gets queue health and case metadata by default; body access requires case assignment or approved emergency authority.
5. An unresolved or unanswered inquiry can be escalated without promising a specific response time until `OPS-01` defines staffed hours, ownership and escalation. The host retains the accommodation relationship; staff do not change price, inventory, refund or booking state from chat.

```mermaid
sequenceDiagram
  participant G as Guest
  participant UI as Listing/Inbox
  participant API as Conversation command
  participant DB as PostgreSQL transaction
  participant W as Notification worker
  participant H as Host
  participant S as Assigned Encho staff
  G->>UI: Explicit inquiry with stay context
  UI->>API: Create/find + first message, UUID
  API->>DB: Validate owner/context; commit thread + message + intent
  DB-->>API: Canonical receipt
  API-->>UI: Exact authorized thread ID
  W-->>H: In-app hint/catch-up (truthful receipt)
  H->>API: Reply in same thread, UUID
  API->>DB: Commit reply + guest intent
  W-->>G: In-app hint/catch-up
  G->>UI: View reply; explicit read acknowledgement
  G->>S: Request help (case, not broad admin surveillance)
  S->>DB: Scoped access receipt, then read/notes
  S-->>G: Disclosed Encho reply only if authorized
```

## 5. Authority, data and lifecycle contracts

**Use existing tables/commands first.** Existing `threads`, `messages`, `conversation_read_cursors`, `notification_intents`/events and service-case tables are the starting point. Reconcile the deployed migration history before allocating any new migration number; never edit applied SQL bytes. Add only fields/relations that cannot be expressed safely in current schema, after a compatibility plan and restricted-role tests.

| Record | Required invariant | Existing vs proposed |
|---|---|---|
| Conversation identity | One participant-owned property inquiry per defined context, stable thread ID, exact owner resolved server-side. If multiple room/date inquiries share a thread, each message/context snapshot identifies which offer it concerns; do not overwrite old meaning. | Current create dedupes by listing, guest and host, not room/date. Define context-version behavior before schema change. |
| Inquiry context | Accepted snapshot has listing/approved offer reference, proposed dates, party size and source version; contains no invented availability or price guarantee. | Current contact command sends only listing and claimed host ID. Offer authority is still being remediated; context is explicitly provisional until accepted offer exists. |
| Message | Immutable sender/recipient actor, content policy outcome, UUID/request hash, server sequence/time, optional approved context and moderation state. User-visible edits or tombstones, if approved, retain audit lineage. | Current participant send has client UUID replay and transaction. The silent contact masking requires privacy decision and careful migration. |
| Notification | Exactly one durable intent per committed recipient message; recipient preference/consent checked at dispatch, provider receipt recorded separately, retry bounded, DLQ reconciled. | Current worker is socket-hint only, external channels not configured. A socket success cannot be renamed `DELIVERED`. |
| Read | Only a participant's explicit authorized view advances cursor; GET/history, socket arrival and staff read do not. | Current explicit read path exists; validate old queue/logout and mixed-device replays. |
| Service case | Case has subject, requester, scope, assigned staff, purpose, state/version, access receipts, separate internal notes/public replies and disclosure. | Current read/notes exist; public reply and assignment/revocation integration are unfinished. |
| Booking link | A conversation references the canonical booking/offer once accepted; a chat promise cannot mutate the order. Support retains the exact booking/refund scope and permissions. | Checkout is currently disabled; booking integration is a later gated acceptance, not a CRM shortcut. |

**Trust boundaries:** user ID comes from authenticated account, host/room/current publication from database, staff from current workforce principal, notification recipient from committed participant relation, AI source facts from accepted offer/policy. Zod-validate all request/context/worker payloads, parameterize SQL, use one held connection for coupled writes, separate guest/host/staff RLS roles and prove them with non-BYPASSRLS LOGIN accounts. Read/update authorization must be checked again after worker claim and before protected send. Cache, service-worker queues and deep links must be actor-scoped; logout and account switch revoke replay and erase private local data. Consumer server-token revocation is separately open under R1-03.

**Privacy and safety:** the existing `maskContactInfo` function blocks some contact routes but can corrupt legitimate content, including itinerary URLs and phone-like booking references. Keep XSS-safe *rendering* independent of storage policy. Recommend a policy-driven warn/block/review path with original text retained only where lawfully necessary and access-controlled, plus participant-visible disposition; do not silently rewrite a sent message while `PRIV-01` is open. Add abuse reporting, link/phishing scanning, rate limits, blocked-user behavior, retention/export/erasure, consented external notification preference and no PII in push/email previews. Escalation must still allow safety help even if a sender is blocked.

**AI:** no auto-send, availability, price, refund or policy invention. Suggested replies and translations display the original text, a source/time label for any fact, model/prompt/schema version, uncertainty and a human send confirmation. Unapproved private guest content must not enter an AI prompt. A timeout or prompt injection returns human-only mode. AI scoring of lead value cannot silently deny or delay service.

## 6. API and UI compatibility design (proposal, not existing routes)

| Command/projection | Proposed contract and compatibility | Negative case |
|---|---|---|
| `POST /api/conversations/v1/inquiries` | Authenticated `listingId`, optional accepted `offerVersionId` and typed trip intent, message text, `clientEventId: UUID`; server derives host and applies policy. Returns `threadId`, canonical message receipt, context version and notification-intent state. Keep existing `/api/threads` and `/api/threads/:id/messages` for compatible clients during migration, without allowing an empty-thread path to masquerade as a submitted inquiry. | Two submits/network loss yield one message/intent; stale offer or unauthorized listing fails before write; lost COMMIT reconciles by UUID. |
| `GET /api/threads/:id/...` | Existing participant history/list/read routes remain source of truth; add an authorized exact-thread deep link and explicit unavailable/unknown statuses. | Forged thread ID/other host returns indistinguishable denied/not-found; no body leak in errors/logs. |
| `POST /operations/service/cases/:id/public-replies` | Dedicated staff command with current workforce session, assignment/version/purpose, visible staff identity, UUID, disclosure and outbox in one transaction. Do not reuse an internal-note route or spoof a participant ID. | Revoked/unassigned staff, stale case version, withdrawn assistance, duplicate UUID, concurrent host reply and lost COMMIT have defined outcomes. |
| `POST /operations/service/cases/:id/notes` | Existing note path remains staff-only, separate representation and query. | Participant APIs/browser caches never receive note body. |
| Notification projections | Return saved/queued/hint/transport receipt/read as different fields, never collapse to `sent`; external channel not configured is explicit. | Worker disabled, socket lost, preference withdrawn, email bounce, queue retry and DLQ are not shown as delivery. |

The API names above are implementation candidates; the engineering owner must confirm current route inventory and migration compatibility before coding. Preserve the account's existing Guest/Host role switching; do not create a separate CRM identity or parallel wallet/booking store.

## 7. Operator experience and measurable reliability

Guest UI: property/offer identity above composer; accessible context edits; clear pending/saved/failed states with editable retry for definite rejection and UUID-preserving reconciliation for unknown outcomes; no empty-thread landing; exact thread restored after auth/reconnect; report/help controls; concise mobile layout at 360px, keyboard/focus/screen-reader checks, reduced motion and slow-network recovery. Do not auto-scroll a reader who is inspecting older messages; show a new-message affordance. Host UI: unified owned-property queue, property/offer/date filters, latest unanswered message age, factual response composer, safe templates, notification-health warning and bounded assistance request. Staff UI: assigned/unassigned/overdue/safety queues by permission; explicit internal-note versus public-reply action; visible current assignment and reply actor; audit/incident link; no global content browse. Admin UI: aggregate backlog, oldest age, delivery failure counts, response distributions, escalation and audited access review; default metadata view.

Instrument `inquiry_committed`, `first_host_reply_committed`, `guest_reply_committed`, `notification_intent_created`, `hint_attempted`, `transport_confirmed`, `read_acknowledged`, `case_assigned`, `staff_access_recorded`, `case_resolved` with correlation, actor scope and source; avoid message bodies/PII in ordinary logs. Histograms: first meaningful response from commit (business-hours and wall-clock separately), next response, queue age, abandoned inquiries, notification lag, delivery failure, staff case load and outcome to verified booking. Do not call a click/view a captured booking or a 5-minute target an SLA before `OPS-01` staffing is defined. Establish p95 API and retry/recovery targets from measured staging load and on-call capacity, then alert on breached **approved** thresholds. Runbook covers notification-worker stop, PG outage, duplicate submission, leaked content, staff revocation, phishing report and backlog surge.

## 8. Incremental engineering packages and exit evidence

| Slice / owner / priority | Scope, dependency and rollback | Acceptance evidence |
|---|---|---|
| **C0: identity and failing-before journey** — CRM lead + frontend, P0 | Reconcile exact source/index/migration/role state (R0/R1/R2). Reproduce empty-thread, pre-auth intent loss, no exact-link navigation, content rewriting and missing staff reply. Rollback is documentation/tests only. | Actual mounted Guest→Host route tests plus component/browser failing-before recordings, no live customer message. |
| **C1: inquiry continuity** — CRM backend + Guest UI, P0 | Add atomic create/find + first send using canonical inbox/outbox; actor-scoped auth return and exact-thread route; carry typed provisional offer context. Preserve old routes until clients migrate. Rollback feature-flags new entry while retaining accepted messages. | Two accounts on disposable PG; one UUID/one message/one intent after retry, unknown COMMIT replay, correct listing/offer, 401/login return and IDOR denial; Guest sees same thread at 360px and desktop. Maps R4-01, R6-03 and P3.1–P3.3. |
| **C2: host and guest reply reliability** — CRM/backend + notification/SRE, P0 | Complete worker/retry/DLQ/preference receipt contract, actor-scoped offline queue and server revocation dependency. External transport remains off until approved. Rollback disables transport/hints, not canonical message or reconciliation. | Host replies and Guest receives after restart/socket loss/account switch; explicit read only; two worker processes and fencing, duplicate command, stale consent, no missing accepted intent. Maps R1-03, R4-01. |
| **C3: scoped staff assistance** — workforce/CRM + Operations UI, P1 | Complete assignment/claim, audited access and disclosed public staff reply, separate notes, revocation, break-glass design. Wait for staff visibility/contact policy (`PRIV-01`, `IAM-01`) before enabling body access remotely. Rollback to assigned read/notes only. | Restricted LOGIN-role RLS, forbidden cross-case read, assignment race, stale response, note leak, no impersonation, staff identity in participant thread. Maps R1-02/R4-02/P3.4–P3.6. |
| **C4: content, safety and AI** — privacy/security/product + CRM, P1 | Approve contact-handling/retention, decouple XSS rendering from policy, add report/block/escalation, grounded optional AI drafts. No auto-send or unconsented channel. Rollback disables AI/channel, preserves evidence and service. | Harmless and malicious links, contact details, multilingual numbers, injection/timeout, erasure/export, blocked-user safety, human-confirmed fact-bound send. Maps R4-01/02 and `PRIV-01`. |
| **C5: booking/marketing connection and operations** — commerce/marketing/analytics, P1 | Bind inquiry to accepted offer, consented attribution and later canonical booking; service case can reference incident without mutating finance. Paid booking waits for W1/W2 legal/finance gates. | One property/room/campaign/inquiry/booking trace with no double attribution and no invented ROAS; separate organic/paid inquiry source; owner-only projections; fail/recovery drill. Maps R3/R4/R5/R6. |
| **C6: independent release review** — release/SRE/security, P0 gate | Freeze artifact, full relevant tests at required phase exit, staging restricted roles, browser/accessibility/performance, restore and incident drills; external transport/provider/payment gates assessed separately. | Independent reviewer signs local/staging predicates. A real resort trial requires signed policy/pilot charter and observed two-account/device/staff workflow; no fictional or mocked receipt clears release. Maps R7. |

### Adversarial acceptance matrix

1. Guest A sends from Stay X while Guest B/Host Y probes guessed thread IDs; only A and X's actual Host see content. Staff without assignment sees metadata only. Repeat with separate non-bypass LOGIN roles and direct SQL RLS checks.
2. Double-click, dropped HTTP response after COMMIT, process restart and UUID replay result in exactly one first message and one recipient intent, with stable canonical receipt. Changed content under same UUID conflicts.
3. Guest signs in from the contact sheet and lands in the selected thread; Guest logout/account switch cannot replay a queued old-account message or show cached content to another account.
4. Host answers while Guest is offline; restart the worker, lose the socket, then Guest reconnects and sees the same reply. Queue `SUCCEEDED`/socket hint alone never produces “device delivered” or “read”.
5. Host changes price or removes a room between guest compose and send. The inquiry remains possible only with accurate context and a changed/unknown offer notice; it cannot create a booking or advertise stale final price.
6. Two staff claim one case, one loses assignment, and a delayed browser response returns after revocation. Only the current authorized assignee can read/reply. A private note is absent from all Guest/Host API payloads and caches.
7. Abuse report, URL/phone-like legitimate booking text, XSS, phishing link, contact-policy warning, AI prompt injection, malformed translation and failed channel each yield a defined, user-visible disposition without silent invented content.
8. Mobile 360px + desktop browser, keyboard-only, screen reader, 200% zoom, reduced motion, slow/offline and error states are tested on the **production bundle**. Fixture browser success is labelled as fixture evidence.

## 9. Decision and release register

| Decision | Recommendation and effect | Owner / gate |
|---|---|---|
| Save/like visibility | Keep private. An explicit guest inquiry or separate, clear contact opt-in is required before host outreach. | Founder/product + privacy (`PRIV-01`); user answer requested. |
| Staff participation | Distinguish guest–host participant thread from Guest/Host–Encho support case. Staff enters property thread only via disclosed, audited join under assignment. | Founder/product + IAM/privacy (`IAM-01`, `PRIV-01`). |
| Contact details and links | Reject silent anti-circumvention rewriting as a release policy. Choose reviewed warn/block/report rules and retention/tombstone treatment; preserve security against XSS/phishing. | Privacy counsel/product (`PRIV-01`); current masking remains a known gap until replacement is accepted. |
| Response promise | Set business hours, first/next-response thresholds, after-hours escalation, case owner and funded staffing before publishing an SLA. | Operations/founder (`OPS-01`). |
| External notifications | In-app canonical first. Enable email/push/SMS one channel at a time only after endpoint verification, consent, receipts, unsubscribe/withdrawal, retry and privacy review. | Privacy/SRE (`PRIV-01`, `ENV-01`). |
| Staff-visible AI and booking help | Human-confirmed drafts only; no private-content inference without approval. Booking/payment/refund actions remain in canonical commerce. | Product/privacy/commerce (`LEGAL-01`, `PRIV-01`). |

**Release statement:** This blueprint can guide estimates and implementation. It does not make the current CRM 10/10 or “million-dollar ready”. The first independently credible claim is narrower: *a real Guest can send one contextual inquiry; the correct Host receives and answers it; the Guest reliably sees the answer; a scoped Encho worker can help under the approved policy; every acceptance, access, notification and failure is reconstructible*. No production percentage advances from a document or a mocked UI test.
