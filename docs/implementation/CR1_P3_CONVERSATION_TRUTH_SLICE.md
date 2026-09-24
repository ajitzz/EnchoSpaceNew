# P3 conversation truth: first compatibility slice

Authority: CR1 continuous execution mandate; blueprint FR-G/FR-H conversation requirements and P3 acceptance criteria. Status: local work in progress, not P3 acceptance.

## Verified source and decision

`InquiryInbox` already owns participant-scoped inquiry thread creation, message replay identity and consent-bound campaign attribution. Preserve that identity and history. Its `messages()` GET currently mutates `is_read` and unread totals even for prefetch/pagination. `InboxPage` contains canned claims of full availability, elite noise protection and workspace amenities, plus keyword substitution presented as translation; “not available” can become “fully available.” These violate the approved truth boundary.

## Additive scope

1. Make history GET read-only. Add an explicit participant-authorized `POST /api/threads/:id/read` carrying an actually observed message ID. Under the existing thread transaction lock, validate that message belongs to this thread, mark only received messages through that cursor, and recompute the participant's unread count. Replay and older cursors are naturally monotonic and idempotent. The response acknowledges the committed cursor; no GET, prefetch or failed request claims it read.
2. Update the existing Inbox caller to acknowledge messages only when the document is visible and the same actor/thread remains current. Offline history remains readable but does not invent a server read receipt. Reconnection retries the monotonic acknowledgement.
3. Replace ungrounded canned answers with neutral drafts requiring explicit send. Remove simulated translation entirely and disclose that verified translation is unavailable. No new AI provider or external message dispatch.
4. Keep legacy API response shapes and thread/message IDs. This changes GET side effects intentionally; callers migrate in the same change. Canonical conversation/outbox/read-cursor tables, staff cases, durable notification delivery and notification receipts are still subsequent P3 work.

## Evidence and rollback

Targeted real PostgreSQL tests must prove GET is side-effect free, foreign cursors and nonparticipants fail, advancing reads preserves newer unread messages, and stale/replayed cursors cannot restore unread state. UI tests must prove original message text is never replaced by synthetic translated claims and neutral drafts do not assert availability or amenities. A rollback may disable read acknowledgement while retaining history; it must not restore fabricated translation or GET mutation.

No support SLA, legal retention, external channel consent, staff conversation access or notification delivery is approved by this compatibility slice.

## Integrated local checkpoint — 24 September 2026

The first-slice boundary above is historical. The following source integration is now implemented:

- Migration 037 is required by the production conversation router; the old `deliveryRequired:false` behavior remains only for legacy isolated service fixtures. An unavailable or privileged database role yields a truthful unavailable response.
- New writes require a client UUID, allocate canonical per-thread order, and create a content-free notification intent in the same commit. A lost COMMIT response is `OPERATION_OUTCOME_UNKNOWN`; the browser retains the same identity and reconciles without inventing a failed payment or a second message.
- Thread lists have bounded activity cursors, and unread projections count canonical received messages. Historical nullable read flags are treated as unread; old cached counters do not establish unread truth. Booking-only history remains participant-readable and read-only until an audited identity bridge exists.
- `InboxPage` merges replay, socket and history by canonical ID/client UUID, preserves unconfirmed drafts, paginates history, fences actors/sessions/threads, and refreshes only while visible/online. An IntersectionObserver acknowledges an incoming cursor only when its bubble is actually visible. Hidden pages and prefetched history do not acknowledge reads.
- Routing-only socket hints trigger authenticated state refresh. The queue worker has an explicit independent restricted connection and is disabled by default. `SOCKET_HINT_DISPATCHED` is not a claim of external delivery or recipient presence.
- The UI preserves original text, labels unavailable translation honestly, provides intentional question drafts, supports reduced motion, and removes fabricated property thumbnails. Mobile/desktop checks include no horizontal overflow, visible read acknowledgement, canonical send convergence and pending-send truth.

Focused evidence: service/API/projection checks pass (18 tests in the combined page/integration run); inbox React checks pass (6); actor-queue/read/containment checks pass (34). These overlap other receipts and must not be summed into a repository-wide regression count. The isolated actual-browser harness `scripts/testing/cr1-inbox-browser/run.mjs` passes 9 checks across 1440px and 360px, with outbound network blocked and fixture identity/API ports. Screenshot review led to higher-contrast timestamps and bubbles. This is not live user/provider evidence or full accessibility certification.

Still open: service-case deployment/integration, complete legacy context bridging, approved channel preferences and external notification adapters, independent end-to-end acceptance, production restricted-role rollout, and legal retention policy. No external message was sent and no remote migration applied.
