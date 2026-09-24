# CR1 P3 — Inbox receipt convergence

## Observed defect and impact analysis

The isolated real-browser Inbox check fails `Optimistic reply duplicated` immediately after sending a message. `InboxPage` gives an optimistic message a negative local ID, replaces it with its canonical server message, and keys the animated row by `msg.id`. The request already carries a stable `client_event_id`. The animation boundary can retain the exiting negative-ID row while mounting the positive-ID row. Source state reconciliation and rendered identity must both be checked before attributing the full defect to animation.

Scope: `InboxPage.tsx`, focused Inbox tests, isolated browser ports/harness and its Tailwind scan. No server, schema, delivery worker, migration or queue-persistence change. Preserve unsent drafts, actor/session fences, exact canonical message schemas, server read cursors, queued/not-confirmed distinction and socket reconciliation.

## Plan before code

1. Trace the rendered optimistic/canonical transition in the failing browser fixture. Keep its single-visible-message assertion.
2. If confirmed, bind React row identity to stable client event identity (with sender/thread scoping); use canonical message ID for historical messages without an event UUID.
3. Converge direct receipts, durable replay events and socket/history through the existing canonical merge primitive. Reject mismatched sender/receiver/event receipts instead of silently replacing a different request.
4. Test canonical response and socket arrival in both orders, replay convergence and retention of unrelated pending messages.
5. Extend the isolated assistance fixture and CSS scan so participant help controls are styled and explicitly consented. No production API, provider, environment or customer data is used.

Validation: targeted message-merging/Inbox tests, desktop/mobile isolated browser, scoped TypeScript/lint. Rollback: revert only the presentation/reconciliation fix if necessary; preserve durable message identities and stored content.

## Verification and resolution

The browser reproduced two separate reply paragraphs in the same animated list during negative-ID → canonical-ID replacement. Row identity now uses thread/sender/client event UUID; historical messages without an event retain canonical-ID identity. Receipts and durable replay reuse the canonical merge routine. Distinct senders cannot erase one another by choosing the same UUID. A late queued/error response only updates still-optimistic rows, preserving an already observed canonical socket result. Direct receipt identity must match the original sender, receiver, thread and client event.

- Focused projection and Inbox UI suites: **17 passed**, including socket-first/receipt-first ordering, same DOM node, durable replay, unrelated queued drafts, malformed receipt and no downgrade of observed canonical content.
- Isolated browser: **15 passed** at **1440/360 px**, with real Framer Motion/Tailwind, a MutationObserver checking every reply transition, socket replay, honest pending state, assistance disclosure/request/withdrawal, read-only list and exact visible-message read acknowledgement. The duplicate assertion was preserved and strengthened, not delayed until the error disappears.
- Browser artifacts: `/var/folders/xz/n8vtdw5x6js6lj7q5y211s3h0000gn/T/encho-cr1-inbox-arixYt`; all external network blocked. Fixture API/auth adapters contain synthetic data only. No remote/provider changes.
