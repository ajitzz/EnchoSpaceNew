# Antigravity R1-03 browser-race review — 30 September 2026

**Disposition:** selective local fixture correction accepted for review; full R1-03 remains `READY_FOR_REVIEW`. No production or external gate advanced.

Antigravity worked in the separate clean `cr1_offline_worker_race` worktree from HEAD `7d924d152cd783bcc03b9ef7aac2b1593c62e867`. Its frozen two-file diff SHA-256 was `02da6a6fa4a194e7b554d6807d09f040cf304f6d7f4187995fc1c082af843e9b`. It did not edit the primary checkout. The assistant reports a 10-case baseline Node 24 browser run and local typecheck/diff hygiene; that older worktree lacks the newer primary auth repairs, so its passing count is not an integrated receipt.

## Source disposition

- The fixture set `audit.state = 'READY'` before React mounted `Account`; its exported `login` callback still pointed to a no-op. The one-line move into `Account`'s effect is correct. Codex selectively made that change in the primary fixture and independently reran the **current production-built Chromium suite 16/16**, scoped ESLint and diff check.
- The Antigravity test hunk waits for the mounted actor and clears the mock 409 response before fresh sign-in. The current primary test already has the stronger signed-out actor wait, `denyExpiredAuth` check and pre-login `uncertainMessages = false`; importing the older hunk would weaken that test. No test hunk was copied.
- Antigravity identified a separate runtime authorization defect: `processOfflineQueue()` on baseline HEAD could replay saved credentials before `/me`. The current primary runtime grant was independently reproduced, implemented and tested separately. Neither a fixture timing correction nor one passing run proves all replay races are gone.

## Open follow-up

The agent also flagged that `processOfflineQueue()` acknowledges `completedIds` only after its whole batch. If processing is interrupted after an earlier item receives HTTP 200, that item may be retried after restart. The canonical message event ID and server idempotency should prevent duplicate durable effects, but the extra network attempt and any non-message allowlisted domains require a bounded test and review. Antigravity was assigned a new **test-only** clean-worktree reproduction. No production code or release evidence was accepted from that assignment yet.

The browser fixture and tests are local. An already-running old service worker, cross-device logout and privacy retention remain outside this review.
