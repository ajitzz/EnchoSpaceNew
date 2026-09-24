# CR1 P3 — Participant notification preferences and evidence

Authority: continuous founder CR1 execution; blueprint FR-H14, FR-P01/P07 and Phase P3. Scope: additive local database/backend contract. No provider send, production rollout, or channel consent is implied.

## Source findings and decision

Migration037 already commits one routing-only alert intent with each canonical message. The dedicated worker records socket-hint dispatch, retry and DLQ evidence. Recipient RLS is present; sender lifecycle access is deliberately absent. There is no canonical notification-preference table or participant evidence API. Historical `lead_notification_intents` contains synthetic addresses and a logging-only default dispatcher; these legacy rows are not delivery evidence and will not be imported.

This slice adds one useful, bounded preference: show or mute optional in-app inquiry alerts. Muting must never prevent durable messages, canonical unread refresh, socket reconciliation, or read acknowledgement. EMAIL, PUSH and SMS remain unavailable with no consent recorded; a saved preference is not channel authorization. External channel adapters, verified destinations, consent records and authenticated delivery callbacks remain separate work.

The evidence reader shows only the authenticated recipient's recent canonical intents. It separates queue state, attempts, observed socket-hint dispatch and the participant's committed read cursor. It never turns SUCCEEDED into device delivery or a read receipt. Raw queue payloads, correlation IDs, worker identities, error bodies, message text, contact information and other users' evidence are excluded.

## Impact and implementation plan

- Add migration039 with `conversation_notification_preferences` and immutable `conversation_notification_preference_events`; no historical preference or consent backfill. All tables force RLS.
- Preference changes use expected-version CAS, stable request UUID and database-generated before/after audit receipt in one transaction. Missing preference projects version0/default SHOW; it is an application presentation default, not an opt-in.
- Preserve037 intent/worker behavior. Add a recipient/time/UUID descending keyset index for bounded evidence pages if the existing reverse-scan index is adequate, reuse it instead.
- Shared strict Zod projections in `src/shared/conversation/notifications.ts`; modular `ConversationNotifications` service with an ACCOUNT principal only and actor set locally on every transaction. The service fails closed on exact catalog/grant drift and returns committed receipts only.
- Explicit runtime grants permit scoped preference changes and their trigger-owned immutable audit writes. Queue-only workers, workforce and legacy admin identities receive no new authority. Trigger guards reject direct forged audit insertion and protect immutable identity/version/provenance.
- Evidence pagination uses an existing recipient-owned notification UUID as cursor and compares the canonical `(created_at,id)` tuple; no client date rounding or unscoped cursor lookup.

## Integration contract and user experience

Parent composition will mount authenticated read/preferences/evidence endpoints and rate-limited JSON mutations. Authenticated actor supplies accountId; never accept accountId in request bodies. Responses contain accountId for client fencing and must use no-store. Preference mutation contains `{requestId,expectedVersion,inAppAlerts}`. Stable UUID must survive unknown HTTP/commit outcomes until reconciled; stale CAS requires refreshed state.

UI must label the setting “In-app inquiry alerts,” disclose that messages remain in the inbox, and describe external channels as unavailable. Socket listeners always reload canonical state; only optional visual toast display consults this preference. Evidence labels: queued, processing, retrying, failed, unresolved, socket hint dispatched / not recorded. Device delivery is always “not recorded” in this slice. Read acknowledgement is a separate sequence-based observation, never inferred from GET history.

## Safety, validation and rollback

Tests use disposable local PostgreSQL and distinct non-owner/non-BYPASSRLS application and queue roles. Validate concurrent CAS/replay, request UUID mismatch, rollback/lost commit, recipient isolation, admin-GUC spoofing, audit immutability, exact policy/function/trigger/grant tamper rejection, stable pages and queue/read-state distinctions. Run targeted037/worker regression; no full suite during this slice. No remote database connection or notification send.

Disable new routes/UI on rollback; retain additive tables and receipts. Do not remove037 or downgrade immutable history. Missing039 returns unavailable without changing message delivery. Production grants/checksums, consent, real channels, legal retention and full P3 acceptance remain open.

## Implemented backend contract

`ConversationNotifications(participantPool)` exposes `preferences(ACCOUNT)`, `setPreference(ACCOUNT, {requestId, expectedVersion, inAppAlerts})` and `evidence(ACCOUNT, {beforeId?, limit?})`. Versions are canonical decimal strings, not JavaScript floating-point counters. Mutation returns its immutable receipt; replay after later changes returns the original receipt, so the UI must refresh the current preference afterward. Mutation COMMIT acknowledgement loss returns `OUTCOME_UNKNOWN`; the same UUID safely reconciles.

`verifyNotificationPreferenceCatalog(client)` checks inherited037 authority plus exact039 columns/defaults, constraints/indexes, policy role/qualifications, trigger/function definitions, forced RLS and narrow grants. `notificationPreferenceRuntimeGrants(role)` is explicit DBA-only rollout SQL, never runtime self-provisioning. No new worker privilege is needed. Migration039 numbering is allocated additively; the blueprint's proposed future offer/media numbers are not deployed identities and must be allocated when implemented.

Evidence exposes recipient-owned notification/thread/message IDs, creation time, queue state, attempt count, exact socket dispatch evidence and that participant's explicit read cursor. A cursor acknowledgement at or beyond the message sequence confirms the committed acknowledgement boundary; its timestamp is not an exact per-message reading time. Queue completion with missing or unrelated evidence leaves socket dispatch `NOT_RECORDED`. Device delivery stays `NOT_RECORDED` regardless of socket/read state. Historical legacy dispatcher records are excluded.

Parent HTTP composition requirements: no-store responses, existing participant authentication, server-created ACCOUNT principal, JSON-only/rate-limited mutation, no accountId request field, stable UUID on retry and actor/session-fenced UI memory. The UI must continue canonical socket refresh when optional alerts are muted. No external-channel preferences, consent, delivery configuration or historical data are fabricated.

## Additive HTTP and UI integration plan

Parent authorized modular routes/runtime and a participant panel after the foundation. Add `notificationRouter.ts` under `/api/conversations/v1`: GET/PUT `/notifications/preferences`, GET `/notifications/evidence`. Every route authenticates the participant, validates strict request and response shapes, checks response account identity, and sends no-store. PUT requires JSON and `X-Encho-Conversation-Command: 1`, plus the injected mutation limiter. Public failures use CR1's canonical safe error contract; unknown commit maps to `OPERATION_OUTCOME_UNKNOWN`, not an invitation to submit a new UUID.

`notificationRuntimeAdapter.ts` uses the existing participant pool and server execution context. It activates only with `CR1_CONVERSATION_NOTIFICATIONS_ENABLED=true`; every call still validates catalog/role authority. No environment loader, new database connection, worker loop, or external transport is introduced.

A new participant panel uses strict response schemas, bounded fetch timeouts, abort/generation fencing, explicit actor/token keying and memory-only evidence. It supports load, save/reconcile, safe pagination and unavailable/error states. A parent callback applies only optional visual-alert preferences; the panel does not own socket listeners, unread counters or read acknowledgements. Parent mounts it into Inbox and preserves all canonical synchronization.
