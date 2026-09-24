# CR1 P1 Actor-Scoped Browser Persistence

**Status:** `IMPLEMENTED_LOCAL`  
**Date:** 24 September 2026  
**Blueprint requirements:** FR-P09; P1.3; Discussion 037 CRM audit

## Problem proved from source

The legacy browser synchronization service stored private response caches and an offline mutation queue under global IndexedDB keys. Queued entries could include the complete `Authorization` header. `AuthContext.logout()` removed the token and user from `localStorage`, but did not purge IndexedDB, campaign/reservation caches or draft listing state. A later account in the same browser could therefore inherit private cached data or replay an earlier principal's queued command.

## Delivered boundary

- Private caches and mutation queues are namespaced by authenticated actor. Only explicitly public listing reads use public cache keys; unknown routes remain private even if a caller omits its Authorization header.
- Authorization credentials are never persisted in IndexedDB.
- Credential-like fields nested in a queued body fail closed rather than being written to IndexedDB.
- First dispatch and replay use the current browser session token. Actor/session identity is fenced before each dispatch, after asynchronous responses, and inside private cache/queue updates. A switched account cannot inherit a delayed response or the next command in an older replay batch.
- Every replayable HTTP mutation receives a stable idempotency key before its first network attempt, so a timeout followed by replay preserves the same identity.
- Replay uses the browser Web Locks API where available and an atomic IndexedDB lease fallback elsewhere. The lease is renewed and checked before each dispatch. A crashed/throttled tab can leave an ambiguous in-flight request; server domain idempotency remains mandatory.
- Concurrent enqueues use atomic IndexedDB read/write updates. Replay acknowledges completed command IDs against the latest queue rather than overwriting its initial snapshot, preserving commands appended while a network request is pending.
- Automatic offline retries are limited to same-origin wishlist mutations and inquiry messages carrying their canonical `clientEventId` UUID. Booking, cancellation, payment, campaign and arbitrary external/custom commands are never persisted/replayed by this generic browser service. Historical unsupported queue items are retired without issuing network operations.
- Legacy custom handler registration is retained as an import-compatible no-op; custom queue submission returns false until a reviewed domain-specific replay contract exists. There are no remaining custom enqueue callers in the current source scan.
- Persisted queue size is capped at 100 commands per actor and each serialized body at 64 KiB. These are technical storage limits, not an approved business data-retention policy.
- Immediate commits return the canonical server representation; later offline commits emit a scoped reconciliation event. The inquiry UI binds optimistic messages to the server's stable `client_event_id` and replaces temporary IDs with canonical message IDs.
- Ownerless offline mutations fail closed.
- Logout, account switching and terminal authentication failure purge the actor namespace plus un-attributable legacy private keys.
- Public listing cache entries remain reusable.
- The duplicate `src/lib/syncService.ts` implementation now re-exports the canonical module, preventing security drift.
- A mismatched post-success `CREATE_OR_UPDATE_LISTING` queue call was removed; it was retaining full listing payloads forever under an unregistered handler after the canonical write had already succeeded.
- Permanent client validation failures are not queued indefinitely; transient, throttling and server failures remain retryable. Authentication failures encountered during replay remain retained for a future valid session of the same actor.

## Focused verification

`src/test/cr1_actor_scoped_sync.test.ts` proves:

1. actor-scoped persistence with no bearer secret;
2. cross-account replay denial;
3. current-token rehydration with stable idempotency identity;
4. logout purge with public-cache preservation;
5. denial of stale private cache after `401`/`403`;
6. fail-closed behavior without an actor.
7. single replay under concurrent executors;
8. canonical data returned for an immediate commit;
9. canonical reconciliation event after an offline commit.
10. rejection of credential-like fields nested in a durable body;
11. atomic parallel enqueue preserving all 20 commands;
12. command appended during replay survives acknowledgment;
13. account switch stops the batch and suppresses stale response events;
14. failed direct request cannot be queued under a replacement actor;
15. stale committed response cannot enter a replacement actor's UI;
16. private cache cannot be recreated by a response arriving after logout;
17. money/booking/campaign/custom commands are denied offline persistence;
18. absolute URLs never receive a browser bearer token;
19. previously queued unsafe operations are retired without execution;
20. initial dispatch normalizes stale caller credentials to the current session;
21. queue/body storage limits are enforced;
22. omitted Authorization does not turn an unknown read into a public cache;
23. explicit public listing reads remain available to guests;
24. room-specific wishlist deletions preserve their query-bound identity;
25. message retry requires the server's domain deduplication UUID.

Validation on the repository's required Node 24 runtime:

- focused Vitest: **25/25 passed**;
- focused ESLint: passed;
- focused TypeScript compile: passed.

## Honest limits

The focused tests mock IndexedDB with atomic `update` semantics; they exercise the original lost-update races and account-switch interleavings, but are not a cross-browser storage/crash certification. Server authorization remains canonical: browser actor metadata does not grant database permissions. A request already sent before logout may commit under the original credential; the browser suppresses its stale response and does not dispatch later items under another identity.

P1 remains incomplete because direct `localStorage` consumers still require migration, financial/booking UI must consume canonical server commit evidence, and non-message offline features need domain-specific reconciliation. The read-only review identified that `App.tsx` inserted an optimistic reservation and entered its booking-success view before the server response, and marked cancellations before acknowledgment. This service's rejection closes browser retry authority, but those separate presentation paths require the parent execution task's repair. No production checkout, deployment, provider acceptance or CR1 completion is implied.
