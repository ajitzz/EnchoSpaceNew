# R4-01 unread availability impact

28 September 2026 · bounded dependency-independent repair within R4-01; full card still depends on R2-04.

**Source of truth.** Canonical `InquiryInbox.unread` returns `{unread}` from participant-scoped messages. `src/server/conversations/router.ts` currently manufactures HTTP 200 plus zero counts when readiness is false. `components/Header.tsx` and `components/BottomNav.tsx` are the two `/api/unread-counts` consumers; both default to zero, accept unvalidated responses and silently keep previous values after failure. This hides an unavailable inbox and can expose the prior actor's stale count after a slow response.

**Bounded change.** Preserve successful `{unread}` and participant identity. Remove the readiness zero fallback and use canonical `FEATURE_UNAVAILABLE` HTTP 503 with correlation/operation context and no-store. Add one typed, account/token-fenced unread hook and a shared accessible status indicator for both navigation surfaces. Distinguish signed out, loading, known count (including zero), and unavailable; retain only validated diagnostic reference on failure. Fetch failure/malformed response cannot become zero. Cancel obsolete requests, bound request time, poll without overlapping, and retry on focus/online.

**Affected contracts.** Router error behavior intentionally changes from fabricated success to the existing error catalog. No migration, inbox/history identity, read cursor mutation, worker dispatch, notification preference or external channel changes. Existing buttons continue opening the canonical inbox; guest/host navigation both use the authenticated unified account count.

**Validation.** Reproduce readiness-false HTTP regression first. Targeted Express boundary plus React DOM navigation cases: actual zero versus 503/network/malformed response, loading, recovery, account switch, logout and late responses. Node 24 sanitized runner; no full suite or external targets. Scoped TypeScript/lint and reusable fixture rendering, not a claim of full-app browser acceptance.

**Rollback.** Disable the new indicator/polling if necessary while preserving API unavailable semantics. Never restore zero as a readiness/error fallback. Full notification delivery/privacy retention acceptance remains open.

## Notification mount discovery (not executed)

`createParticipantNotificationRouter` is unmounted. Its intended prefix is `/api/conversations/v1`; it exposes GET/PUT `/notifications/preferences` and GET `/notifications/evidence`. It requires `authenticateToken`, the existing mutation limiter, server-derived account ID, and sanitized failure logging. The runtime adapter activates only with `CR1_CONVERSATION_NOTIFICATIONS_ENABLED=true`, receives the existing restricted participant pool, and creates ACCOUNT context from execution IDs. It does not create a worker, open ambient credentials or authorize channel sends.

Before mounting: exact immutable039 identity/grants must be verified; inherited037 conversation readiness must pass with a genuine restricted login;039's current-user-only grant checks must include forbidden reachable NOINHERIT privileges. Existing API tests are modular fixtures, not reachable-route proof. Inbox currently has no mounted preferences/evidence panel. In-app alert preference affects optional presentation only; mute cannot disable canonical synchronization. EMAIL/PUSH/SMS remain NOT_CONFIGURED/NOT_RECORDED. Parent owns `server.ts` and route inventory; mounting requires an authenticated integration test and actor-fenced UI integration after these checks.

## Bounded local result

The readiness-false regression initially failed with HTTP200 instead of503 (six prior API tests still passed). After the repair, **16/16** targeted tests pass: seven Express route boundary cases and nine React DOM cases exercising the actual Header/BottomNav plus shared hook. Cases cover valid zero, explicit503/ref, malformed projections, network failure after known counts, focus recovery, actor/token switch and logout, stale completions, bounded timeout and non-overlap. Both navigation buttons expose an accessible status name and diagnostic title; desktop also renders “Inbox unavailable.” Successful response remains `{unread}`.

`scripts/testing/tsconfig.unread.json` passes strict checking for this dependency graph; scoped lint and diff checks pass. Tests use synthetic auth/network responses with actual component rendering, not a deployed browser or live customer journey. No new preference UI, mount, channel send, consent, retention or production-readiness evidence is implied. Status **READY_FOR_REVIEW**; full R4-01 remains open. Exact files/commands/receipts: `CR1_R4_01_UNREAD_RECEIPT.json`.
