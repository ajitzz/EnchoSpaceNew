# CR1 P0 legacy calendar containment impact note — 2 October 2026

## 1. Verified defect and context

In `server.ts` (lines 3395–3425), the legacy endpoint `POST /api/listings/:id/calendar` accepts `listingId` from URL parameters along with caller-supplied `dates`, `price`, `offer_id`, and `status`. While it passes through `authenticateToken`, it executes no authorization check comparing `req.user.id` against `listings.user_id`, nor does it verify administrative privileges.

Any authenticated caller could:
1. Insert or overwrite pricing and availability status records in `calendar_prices` for any arbitrary listing ID.
2. Trigger the advertising circuit breaker (`triggerSmartAutoPause`) by passing `status: 'blocked'` or `status: 'booked'`, causing active marketing campaigns for another host's property to be paused.

The frontend (`components/HostCalendar.tsx`) already uses the canonical room-calendar endpoints (`GET /api/listings/:id/room-calendar` and `POST /api/listings/:id/room-calendar/block`), which strictly enforce listing ownership and room capacity boundaries. The legacy mutation endpoint is obsolete, unauthenticated in authorization semantics, and a critical tenant-isolation hazard.

## 2. Containment design

1. **Fail-close legacy POST to HTTP 410 (Gone):**
   `POST /api/listings/:id/calendar` enforces authentication (`authenticateToken`), rejecting unauthenticated requests with HTTP 401 (`Authentication required. No token provided.`). For any authenticated caller (whether owner, foreign host, or admin), it immediately responds with HTTP 410 (Gone) and a canonical migration hint (`/api/listings/:id/room-calendar/block`), without querying the database, mutating `calendar_prices`, or invoking `triggerSmartAutoPause`.
2. **Preserve public GET:**
   `GET /api/listings/:id/calendar` remains preserved for public calendar read availability.
3. **Preserve canonical room-calendar:**
   The canonical `registerCalendarRoutes` implementation (`/api/listings/:id/room-calendar`, `/block`, `/availability`) remains the sole authority for host calendar management, with complete owner verification and transaction-isolated capacity checks.

## 3. Verification boundary and test limits

- **Mounted production route execution on PostgreSQL (`src/test/harvo/legacy_calendar_containment.test.ts`):**
  - Mounts the extracted production route handlers (`registerLegacyCalendarRoutes` and `registerCalendarRoutes`) against a disposable PostgreSQL instance.
  - Verifies unauthenticated callers receive HTTP 401 (`Authentication required. No token provided.`).
  - Verifies that for any authenticated caller (foreign host, owner host, or admin), `POST /api/listings/:id/calendar` returns HTTP 410 (`LEGACY_CALENDAR_MUTATION_RETIRED`), mutations to `calendar_prices` are completely blocked (0 rows mutated), and marketing circuit-breaker auto-pause is unreachable.
  - Verifies public `GET /api/listings/:id/calendar` continues to return calendar pricing records joined with offers.
  - Verifies canonical owner routes (`GET /api/listings/:id/room-calendar` and `POST /api/listings/:id/room-calendar/block`) succeed for listing owners and reject foreign hosts.
- **Production wiring verification:**
  - Asserts that `server.ts` imports and invokes `registerLegacyCalendarRoutes` alongside `registerCalendarRoutes`.
  - Asserts that raw legacy `calendar_prices` mutation SQL (`INSERT INTO calendar_prices`, `ON CONFLICT (listing_id, date_string)`) and `MANUAL_BLOCK_` have been removed from `server.ts`.
- **Failing-before status note:**
  - The defect in pre-patch `server.ts` (unauthorized `POST /api/listings/:id/calendar`) was verified through code inspection and diff analysis.
  - No claim is made that earlier copied-handler simulation was an actual failing-before execution of `server.ts`. The containment is proven directly by mounting the production routes and asserting server wiring.
- **Exact test limits:**
  - The test suite executes against an isolated local PostgreSQL container fixture with synthetic actors (host/admin); it does not boot the full Express app in `server.ts` or bind to network ports.
  - The test suite does not exercise remote Neon Postgres databases, live Meta/Google ad networks, or live payment webhooks.
  - Legacy rows residing in `calendar_prices` are not migrated or dropped; historical records remain readable via public GET, while legacy writes are fail-closed to HTTP 410.
- **Runtime isolation:**
  - Node 24, `scripts/testing/run.mjs`, sanitized environment variables, no remote database or external network access.
