# CR1 P3.1/P3.2 — Conversation delivery foundation

**Authority:** Founder CR1 execution; blueprint FR-P01/P07, FR-H14 and Phase P3.  
**Scope:** Local additive migration 037, typed payload, catalog/grant verification and adversarial disposable PostgreSQL tests. No remote migration, channel dispatch, staff Service Desk or production certification.

## Verified problem and design

`InquiryInbox` already checks thread participants and preserves message UUID replay and consented campaign attribution. Its message transaction currently ends before a best-effort socket notification. A crash between those operations loses alert intent. History is being changed to an explicitly read-only GET with a separate participant acknowledgement command; this foundation supplies durable sequence/cursor authority to that command.

Migration 037 preserves all existing message IDs, content, sender/receiver identities, attribution and client-event hashes. It locks threads/messages while assigning deterministic per-thread sequence in ascending legacy message ID order. This is an ordering backfill, not a claim that historical delivery/read evidence exists. Historical rows receive no alert; booking-only messages with NULL thread stay unbridged. New messages without a real participant thread fail closed until an explicit bridge exists.

## Integration contract

- `threads.last_message_sequence BIGINT NOT NULL DEFAULT 0` is a transactionally fenced sequence counter.
- `messages.conversation_sequence BIGINT` is server-assigned for canonical thread messages; historical NULL-thread rows retain NULL.
- `messages.notification_intent_id UUID` is generated for new canonical messages only. Historical rows retain NULL. A before-insert trigger locks the thread and assigns identity/sequence; an after-insert trigger advances the counter and writes one notification intent plus immutable ENQUEUED event. Any failure rolls all three back. Failed/conflicting inserts do not advance the counter.
- `notification_intents` implements the shared `DurableOutbox` column contract. Additional relational evidence binds recipient/thread/message/sequence and trace source. Routing payload is strictly `{type:'new_message',threadId,messageId,notificationId}`. No message, contact, name, property address or preview appears in payload. These are pseudonymous internal identities, not anonymous data.
- Initial execution class is `LOCAL_EFFECT`: success means a future consumer durably recorded its local effect, never proof of email/push/SMS receipt. Channel consent, delivery attempts and provider receipts require a later worker/adapter slice.
- `notification_intent_events` is append-only. Sender has no outbox lifecycle read authority; the canonical message's pinned notification UUID permits only initial ENQUEUED insertion. Recipient may read their own intent/evidence; the dedicated worker has explicitly generated role policies/grants and cannot read message content.
- `conversation_read_cursors(thread_id,user_id,last_read_sequence)` records explicit monotonic participant acknowledgement. `conversation_acknowledge_read(integer,integer)` takes canonical thread ID and observed message ID; returns `thread_id,through_message_id,last_read_sequence,unread`; updates the cursor and existing compatibility unread fields under the thread lock. No historical read cursor is invented.
- Existing `INSERT ... RETURNING *` receives sequence/intent identity automatically. Services must stringify PostgreSQL BIGINT sequences and never renumber client IDs. Client UUID replay continues returning the existing canonical message without inserting a second alert.
- Request trace comes only from validated `app.correlation_id`/`app.operation_id`. Missing/invalid correlation creates a fresh UUID with `trace_source='SYSTEM'`; raw arbitrary settings never enter alert evidence.

## Impact and security

Follow-up identity guard: new threads must have exactly one canonical listing or experience, its actual host, a different authenticated guest as creator, and zero initial counters/sequence with no fabricated last message. Published listing status and published experience status are verified from current canonical rows. Existing historical rows remain unchanged. The guard also assigns the update timestamp; host/publication changes after creation require a separate reassignment policy and do not rewrite historical participants.

Add FORCE RLS to threads/messages and every new table. Restrictive participant policies constrain older permissive admin-GUC policies, including if legacy startup recreates them. Message meaning, thread participant identity, notification meaning and audit evidence become immutable; history deletion/cascade is denied until approved retention tooling exists. This intentionally contains broad legacy admin browsing/deletion and unbridged message writes; it does not silently grant staff conversation access.

Application and notification-worker grants are separate and explicit. No role is created automatically, no role name is inferred from an environment string inside SQL policy, and no new admin bypass GUC is introduced. A dedicated role's permission applies only to the content-free queue lifecycle. Readiness must reject superuser/BYPASSRLS/table-owner/schema-creator runtime roles and missing/altered policies/triggers/grants.

`verifyConversationCatalog(client, 'runtime' | 'worker')` verifies exact policy expressions, WITH CHECK, command, permissiveness and role targets; expected trigger timing/function/configuration/body; column nullability/type; checked constraint and valid index definitions; column-level mutation permissions; function EXECUTE; sequence usage without setval authority. Whitespace normalization preserves SQL literal contents. `conversationCatalogContract.ts` records the reviewed metadata contract; another PostgreSQL version's incompatible expression representation fails closed and requires an explicit compatibility rehearsal, never a name-only fallback.

Apply the statements from `conversationRuntimeGrants(runtimeRole)` and `conversationWorkerGrants(workerRole)` only under migration authority, after selecting two distinct existing least-privilege roles. Runtime startup never grants itself privileges. Both schemas and exact grants are deployment prerequisites. The worker role has no access to messages, threads, read cursors, guest contacts or recipient credentials.

## Verification and rollback

Use a fresh local PostgreSQL cluster with non-owner, non-BYPASSRLS runtime and worker logins. Verify deterministic preserved backfill, no historical alerts, parallel sequence assignment, rollback on intent/event failure, exact replay, participant/recipient RLS, forged admin GUC denial, immutability, monotonic read cursor, foreign cursor rejection, explicit worker scope, stale-worker fencing and catalog drift. Do not weaken application tests to ignore database authority.

Roll back application activation via a readiness/feature gate, keeping additive data and evidence. Never drop sequences/intents, rewrite history or restore best-effort delivery claims. An unapplied local migration may be amended; an applied deployment requires a new compensating migration. No deployment is performed by this work package.

## Local exit evidence — 24 September 2026

- `npx -y node@24 scripts/testing/run.mjs src/test/harvo/conversation_delivery.test.ts --reporter=dot`: **25 passed**, zero failures. Uses a disposable Unix-socket PostgreSQL cluster and non-superuser migration owner plus distinct non-owner/non-BYPASSRLS runtime and notification-worker roles. No `.env` database is read.
- Adversarial readiness cases reject `original_policy OR true`, permissive WITH CHECK changes, PUBLIC worker policies, a known policy name copied onto the wrong table, removed/extra function EXECUTE, content-column mutation grants, sequence UPDATE, a replaced CHECK(true), missing enqueue uniqueness, nullable routing payload and altered actor function.
- Concurrent sends produce ordered, unique per-thread sequences; replay/conflicting inserts preserve the sequence and single intent. Injected event failure rolls back message, counter and intent. Expired worker leases produce a new fence and reject the abandoned claim.
- Targeted ESLint and isolated strict TypeScript checks pass for the new contract, readiness, fixture and tests.
- Reusable test fixture: `src/test/harvo/helpers/conversationFixture.ts`; service/router integration is a separate work package owned by the parent execution stream.

This closes this local **P3.1/P3.2 foundation slice**, not all of P3, CR1 or production readiness. Remote migration/checksum registration, provider notifications, channel consent/preferences, recipient delivery receipts, delivery worker runtime activation, staff Service Desk authorization and approved retention workflows remain unverified or unimplemented by this slice.

## Follow-up worker impact and design

The queue consumer is a separate `ConversationNotificationWorker` using only the notification worker pool and injected bounded socket-hint dispatch port. It verifies the worker catalog, claims through `DurableOutbox`, revalidates the canonical recipient and payload/fingerprint under the current lease/fence, then submits a routing-only hint. The port must respect its abort signal; late callback completion never commits a successful outcome. A success event records only `SOCKET_HINT_DISPATCHED`, not recipient presence, delivery, read acknowledgement or email/SMS/push acceptance.

Dispatch is at least once: a crash after a socket emission but before queue finalization can repeat the same stable notification UUID. Consumers deduplicate this UUID and reload canonical state; hints do not increment unread counts. Transient dispatch errors retry with bounded backoff/jitter and eventually dead-letter. Protocol-invalid adapter responses fail permanently. Lost leases cannot finalize, and database-finalization uncertainty is surfaced rather than falsely reported as success. No provider network adapter, automatic polling, secrets, message text or contact lookup belongs in this module. Runtime integration is a separate release gate.

Worker entry point: `src/server/conversation/notificationWorker.ts`, constructor `(queueOnlyPool, dispatchPort, options)` and explicit `runOnce()`. Options validate worker identity, bounded batch/lease/dispatch duration. Results count claimed, completed hint commands, retried, dead and lost claims. Overlapping calls on one instance reject; independent workers co-ordinate through durable leases. Ports receive only `{recipientId,payload}` and an abort signal and acknowledge `{outcome:'SOCKET_HINT_DISPATCHED'}`.

Follow-up verification: schema and worker suites jointly pass **35 tests** (25 schema plus 10 worker), zero failures. Worker evidence covers exact content-free projection, separate-role readiness denial, sanitized retry/backoff, timeout/late completion, invalid adapter response, expired lease after dispatch, stable-UUID replay, concurrent consumers, same-instance exclusion, lost COMMIT acknowledgement and exhausted-attempt dead lettering. Targeted ESLint and isolated strict TypeScript pass. The disposable fixture uses canonical `experiences.image_urls JSONB` and `status`, exposing and preventing the service's former array/JSONB projection mismatch.

Recent-activity indexes for guest and host use `(participant_id, coalesce(updated_at,'epoch'::timestamp) DESC, id DESC)` and are included in exact readiness checks. They support the parent service's stable recent-activity thread pagination without inventing historical timestamps.
