# R3-01 Post-Publication Competing Writers Reproduction & Media Moderation Containment Handoff

**Date:** 2026-10-02
**Work Package:** R3-01 (Establish canonical room-offer versions across three surfaces / publication authority)
**Task:** Bounded Slice: `PUT /api/listings/:id/rooms` containment, parent-first row locking, and Admin UI error handling
**Primary Checkout:** `<repository-root>`
**Git HEAD:** `6ec5b6602ab8e9c2cb4776ba5d178ae923876710`
**Git Worktree Identity:** `<repository-root> [main]`
**Git Status:** Dirty files preserved (no resets, restores, or commits)

**Evidence labels:** All database and HTTP evidence in this document was executed against local disposable PostgreSQL instances and a mounted local Express application (`app` from `server.ts`). It is not staging, provider, legal, pilot, or production evidence.

---

## 1. Architectural Repair & Implementation Summary

In response to independent code review feedback and the continuous bounded execution plan, the interim publication containment architecture was extended to cover the dedicated room management endpoint (`PUT /api/listings/:id/rooms`) and synchronize the Admin room editor UI:

### 1.1 Canonical Validator Extraction (`src/server/listings/publicationValidation.ts`)
- The existing `validatePropertyPublication` function was extracted unchanged from `server.ts` into a dedicated, typed module:
  `src/server/listings/publicationValidation.ts`.
- Exports typed interfaces `RoomPublicationSummary` and `PublicationValidationResult`.
- Upgraded `QueryablePort` to a pg-compatible interface parameterized with `QueryResultRow`:
  `query<R extends QueryResultRow = QueryResultRow>(queryText: string, values?: readonly unknown[] | unknown[]): Promise<QueryResultLike<R>>`.
- Uses explicit, narrow typed row models `RoomTypeRow` and `MediaCountRow` without unsafe type casts.
- `server.ts` imports `validatePropertyPublication` from `publicationValidation.js` and re-exports it (`export { validatePropertyPublication };`), preserving backward compatibility with all external callers and existing test suites.

### 1.2 Strict Media Moderation Containment (`src/server/media/mediaModerationService.ts`)
- **Direct Import:** `moderateMediaAsset` directly imports `validatePropertyPublication` from `../listings/publicationValidation.js`.
- **Eliminated Vulnerabilities:**
  - Removed duplicate fallback validator implementation.
  - Removed dynamic `import('../../../server.js')`.
  - Removed cached validator variable.
  - Removed caller-supplied `publicationValidator` command parameter (eliminating caller-supplied authority bypass).
  - Enforced fail-closed behavior on validation failure.
- **Parent-First Lock Order Hierarchy:**
  1. Preliminary unlocked asset identity read:
     `SELECT id, entity_type, entity_id FROM media_assets WHERE id = $1`
  2. If `entity_type === 'listing'`, acquire parent listing row lock FIRST:
     `SELECT id, publication_status FROM listings WHERE id = $1 FOR UPDATE`
  3. Re-read and lock media asset:
     `SELECT id, entity_type, entity_id, room_type_id, moderation_status, is_sleeping_area FROM media_assets WHERE id = $1 FOR UPDATE`
  4. Concurrency Verification: If `entity_type` or `entity_id` changed between unlocked and locked reads, transaction rolls back and returns HTTP 409 (`Concurrent modification`).
  5. If `room_type_id` is supplied, lock `room_types WHERE id = $1 FOR UPDATE` and enforce same-listing binding.
  6. Execute media mutation on the single held PostgreSQL connection.
  7. **Interim Publication Containment Policy:** If `listings.publication_status === 'published'`:
     Execute `await validatePropertyPublication(asset.entity_id, client)` on the held connection.
     If `!validation.valid`:
     - Transaction executes `ROLLBACK`.
     - Returns actionable HTTP 422:
       `Cannot modify media on published listing: modification would violate room photo requirements (...). Unpublish listing first.`
     - No mutation or audit log is committed.
  8. If validation remains valid (e.g. removing 1 noncritical photo when 4 approved photos exist):
     - Insert immutable record into `admin_audit_logs`.
     - Transaction executes `COMMIT`.
     - Returns HTTP 200 `{ success: true, assetId }`.

### 1.3 Dedicated Room Route Containment & Parent-First Locking (`PUT /api/listings/:id/rooms` in `server.ts`)
- **Proper PoolClient Typing & Connection Lifecycle:**
  `let client: PoolClient | null = null;` using strictly typed `import type { PoolClient } from 'pg';`. The connection is guaranteed to be released in the `finally` block.
- **Zod Validation Boundary (`roomInputSchema` & `updateRoomsBodySchema`):**
  Pre-validates the entire request payload before database connection acquisition or mutation:
  - **Safe Body Guard:** Rejects missing, non-object, or array request bodies (`!req.body || typeof req.body !== 'object' || Array.isArray(req.body)`) with HTTP 400.
  - **Array Guard:** Rejects missing or non-array `rooms` with HTTP 400 (`rooms must be an array`), and enforces `.min(1, 'rooms must be a non-empty array')`.
  - **Passthrough Rationale (`.passthrough()`):** `HostForm.tsx` sends client photo metadata (`photos`, `imageUrls`) embedded within room objects. The schema uses `.passthrough()` so dual-writing `rooms` to `listings.rooms` JSON preserves photo arrays for the frontend gallery and marketing engine, while relational columns are strictly validated and mapped.
  - **Nightly Price Validation & Numeric String Coercion:** Nightly price is strictly required and must be a finite positive value (`price > 0`). It accepts both numeric literals and string-encoded numbers (e.g. `"15000"`), transforming them via `.transform(val => Number(val))` for HTTP form compatibility. Missing price yields HTTP 400 (`Nightly price is required`); negative numbers, zero (`price: 0`), boolean literals, or non-finite strings yield HTTP 400 (`Invalid price: must be a positive number`). Note on "no-zero defaults": This route boundary strictly prevents sellable rooms from being defaulted or coerced to ₹0 via `Number(...) || 0`. However, this is an application route guard; the underlying PostgreSQL DDL column definition remains `base_price DECIMAL NOT NULL DEFAULT 0`, meaning unvalidated external write paths outside this endpoint could still write or default to 0.
  - **Capacity & Inventory Bounds:** `capacity` and `inventory_count` accept numbers or numeric strings. `capacity` validates between 1 and 1000 (defaults to 2 if omitted or empty string/null); `inventory_count` validates between 0 and 100000 (defaults to 1 if omitted or empty string/null). Note: `inventory_count = 0` is permitted to represent sold-out/unavailable inventory. Non-integers, out-of-range values, or booleans reject with HTTP 400.
  - **Features & Amenities Arrays:** `features` and `amenities` are defined as `z.array(z.string()).optional().default([])`. When omitted from the payload, they default to `[]` (they are not rejected as missing). Rejection with HTTP 400 occurs when an explicit non-array or an array with non-string items is provided.
  - **Payload Duplicate ID Guard:** Tracks stringified room IDs in `seenIds`. Any duplicate ID in the submitted array immediately rejects with HTTP 400 (`Duplicate room ID "<id>" at index <i>`).
  - **Malformed ID Guard:** Rejects non-integer numbers, negative numbers (`<= 0`), numbers exceeding PostgreSQL INT4 max (`> 2147483647`), and malformed strings (unless matching accepted temporary client prefixes `new-*`, `temp*`, `admin-room-*`, `room-*`) with HTTP 400.
- **Parent-First Lock Acquisition:**
  `SELECT id, user_id, publication_status FROM listings WHERE id = $1 FOR UPDATE` is executed *before* querying or mutating child `room_types`.
- **Connection-Held Authorization:**
  Verifies that `req.user.id === listing.user_id` or `req.user.role === 'admin'` against the held locked record. Unauthorized attempts abort with HTTP 403.
- **Draft-Only Mutation & Publication Containment (Actionable HTTP 422):**
  - If `listing.publication_status === 'published'`: aborts with HTTP 422:
    `Cannot modify rooms on a published listing: modification would alter verified room authority. Unpublish listing first or submit a draft successor review.`
  - If `listing.publication_status !== 'draft'` (e.g. `unlisted`): aborts with HTTP 422:
    `Cannot modify rooms on an unlisted listing: unlisted listings represent accepted historical authority. Return listing to draft status or submit a draft successor review.`
  - **Rationale for Blocking `unlisted` Status:** Listings with `unlisted` status represent properties that were previously reviewed, verified, and published, then temporarily toggled to unlisted. Permitting direct room modifications on unlisted properties would allow hosts to alter accepted room pricing, capacity, or structure and subsequently unpause the property without undergoing review. Enforcing that only explicit `draft` status is mutable guarantees that any modification to previously accepted facts requires an explicit transition to draft or draft successor review.
- **Foreign Room ID Hijacking Prevention:**
  Pre-validates all explicit room IDs in the payload against `room_types WHERE id = $1`. If a room ID belongs to a different listing, the transaction aborts with HTTP 422:
  `Cross-property room update rejected: Room type #${rawNum} belongs to a different listing`.
- **Fail-Closed Unique Legacy Mapping (Replacing Ambiguous `type OR name` Fallback):**
  The previous implementation evaluated `existingRooms.find(er => er.type === room.type || er.name === room.name)`, which could map two distinct submitted rooms to the same relational row while dual-write JSON stored both. This was replaced with a strict 3-pass mapping algorithm:
  - *Pass 1 (Explicit Database IDs):* Submissions with valid database primary keys claim their target rows and record them in `claimedExistingIds`.
  - *Pass 2 (Legacy Matching for Rooms Without IDs):* Matches against unmapped existing rooms. Requires a unique exact match on `name` AND `type`, or a unique match on `name`. If multiple candidate rows match (ambiguous), the transaction rolls back and aborts with HTTP 422 (`Ambiguous room update: multiple existing rooms match ...`). Submissions with temporary client prefixes (`new-*`, `temp*`, etc.) explicitly declare intent to create new rooms and are treated as inserts (`targetId = null`).
  - *Pass 3 (Target ID Collision Invariant Guard):* A final pass iterates across all `roomTargetIds` using `mappedTargetIds: Set<number>`. If two submitted rooms would map to the same relational row ID, the transaction aborts with HTTP 422 (`Ambiguous room mapping: multiple submitted rooms map to the same existing room type #${tid}`).
- **Draft Upsert Semantics with Stable IDs:**
  On draft listings, rooms with mapped target IDs update in-place via parameterized `UPDATE room_types ... WHERE id = $12 AND listing_id = $13`. New rooms (omitting ID or temporary ID) are inserted via parameterized `INSERT INTO room_types`. Existing primary key IDs and media foreign keys are strictly preserved.
- **Atomic Dual-Write & Rollback:**
  The `listings.rooms` JSON column is updated within the exact same transaction. Any error or constraint violation triggers an atomic `ROLLBACK`.
- **Demonstrated Lock Hierarchy (Bounded Scope):**
  Because both `moderateMediaAsset` and `PUT /api/listings/:id/rooms` now acquire `listings FOR UPDATE` first before touching child records (`media_assets` / `room_types`), the lock order between media moderation and room editing is established. NOTE: This demonstrates a bounded two-route lock hierarchy, NOT global deadlock elimination across the platform. Other writer boundaries remain open (see Section 6).

### 1.4 Admin UI Room Editor Error Transparency, Positive Price Validation & Footer Copy (`components/AdminDashboard.tsx`)
- **Client-Side Positive Price Validation (`saveRoomsData`):**
  - Added `editingRoomsError: string | null` state. Cleared on modal open and before save.
  - Before dispatching any HTTP request, `saveRoomsData` validates that at least one room exists, every room has a non-empty name (`room.name?.trim()`), and every room has an authoritative positive nightly price (`Number(room.price) > 0`).
  - If a room has `price <= 0` or missing name, dispatch is halted and an actionable inline error alert is rendered in the modal:
    `Room "<name>" must have a positive nightly price (greater than ₹0).`
  - Prevents false green requests where `price: 0` would be submitted to the server.
- **Inline Server Error Transparency:**
  - If the server returns HTTP 400 (bad input) or HTTP 422 (locked published authority), `saveRoomsData` parses `errorData?.error` and renders it directly inside the modal via an inline alert banner (`role="alert"`), in addition to `alert(errorMessage)`.
  - The modal remains open, preserving the admin's unsaved edits for correction.
- **Truthful Footer Copy (Eliminated False Unpublish Bypass Claim):**
  - The previous copy claimed: `"Changes will update the guest booking page and gallery immediately"`, which was false under draft-only authority.
  - An interim revision stated: `"Edits require unpublishing first to return to draft authority"`. This was corrected because accepted platform facts lack a proven successor flow, and unpublishing must not be implied as an unreviewed bypass of publication invariants.
  - Current truthful copy:
    - If `published`: `'This listing is published. Room authority is locked against direct edits; modifications require publication review and cannot alter live guest inventory directly.'`
    - If `draft`: `'Edits save to draft authority with positive room pricing. Verified changes require publication review before appearing on the live guest booking page.'`
- **Mounted React UI Interaction & Client Contract Test (`src/test/admin_room_editor_ui_contract.test.tsx`):**
  - Added 4 mounted tests verifying:
    1. Client-side validation halts dispatch when room has price 0 or empty name, rendering inline error without sending false green HTTP requests.
    2. Entering positive price (e.g. ₹18,000) with temporary ID `admin-room-${Date.now()}` dispatches compliant `PUT /api/listings/:id/rooms` payload and closes modal on HTTP 200.
    3. Server HTTP error (e.g. 400 validation failure) is rendered inline and alerted without closing modal.
    4. Published listing displays locked room authority notice (without unpublish bypass implication), alerts 422 on attempted save, and preserves modal state.
  - All 4 tests pass cleanly (`Exit 0`).

### 1.5 M3 Regression Fixture Alignment (`src/test/m3_room_media_authority.test.ts` line 339)
- Test 8 fixture previously inserted an invalid published listing (`publication_status: 'published'`) and executed room updates on it. Under R3-01 publication containment, editing rooms on a published listing is rejected with HTTP 422.
- The test fixture was updated to `publication_status: 'draft'`, with an explicit evidence comment documenting the change:
  `// Note: Listing must be in 'draft' state; editing rooms on a published listing is rejected with 422 under R3-01 publication containment.`.
- Assertion rigor was fully preserved (validating stable room ID retention, base price update, and media foreign key integrity).

---

## 2. Test Execution & Verified Evidence

### 2.1 Failing-Before Trace (Unpatched Baseline)
Under unpatched production code, `moderateMediaAsset` acquired no lock on `listings` and did not evaluate publication status, permitting approved photos or sleeping area classifications to be removed from live published listings:

```
$ node scripts/testing/run.mjs src/test/harvo/r3_01_post_publication_writer_repro.test.ts

 ❯ |marketing| src/test/harvo/r3_01_post_publication_writer_repro.test.ts (5 tests | 5 failed) 3586ms
   ❯ R3-01 Post-Publication Competing Writers Reproduction — Real Mounted Routes & PG (5)
     × reproduces admin media moderation invalidating approved room photo requirement (< 3 photos) on published listing 38ms
     × reproduces admin media moderation invalidating sleeping-area requirement (0 sleeping area photos) on published listing 9ms
     × reproduces host room edit via PUT /api/listings/:id/rooms invalidating published listing by adding unverified rooms 7ms
     × reproduces host edit via PUT /api/listings/:id detaching approved room media and altering price on published listing 16ms
     × reproduces concurrency interleaving where admin moderation bypasses parent listing row lock (green-after safe) 221ms

  FAIL  src/test/harvo/r3_01_post_publication_writer_repro.test.ts > reproduces admin media moderation invalidating approved room photo requirement
  AssertionError: expected false to be true
   ❯ src/test/harvo/r3_01_post_publication_writer_repro.test.ts:274:34
      274|     expect(postValidation.valid).toBe(true);
```

### 2.2 Passing-After Trace (`r3_01_post_publication_writer_repro.test.ts`)
With `publicationValidation.ts` extracted, `mediaModerationService.ts` patched, and `PUT /api/listings/:id/rooms` contained:
- Admin photo removal dropping below 3 approved photos: **422 denial**, asset/listing/audit unchanged (**PASS**).
- Admin photo removal of sole sleeping-area photo: **422 denial**, asset/listing/audit unchanged (**PASS**).
- Admin photo removal when 4 approved photos exist: **200 OK**, asset mutated to `rejected`, listing remains published and valid, audit logged (**PASS**).
- Host room edit on published listing: **422 denial**, rooms/media/listing unchanged (**PASS**).
- Host room edit on draft listing: **200 OK**, preserves stable IDs, inserts new room, updates dual-write JSON (**PASS**).
- Foreign room ID on draft listing: **422 denial**, zero mutations in DB (**PASS**).
- Publish-versus-edit race: Connection A publishes listing while Connection B room PUT waits on parent listing lock, then unblocks and returns 422 with zero mutations (**PASS**).
- Reverse settlement directed lock-wait test: Connection A uses direct SQL within a raw PoolClient transaction holding `SELECT ... FOR UPDATE` to hold the lock deterministically while Supertest PATCH is dispatched; mutates draft rooms to non-compliant state, then commits; waiting publish PATCH unblocks and returns 422. (Evidence label: proves publication PATCH unblocking and re-validation, but does not mount room PUT as first writer) (**PASS**).
- Dual-mounted race test: concurrently dispatches both mounted Supertest routes (`PUT /api/listings/:id/rooms` and `PATCH /api/admin/listings/:id/status`); proves mutual exclusion, parent row lock contention, and publication containment under concurrent mounted execution (exactly one route acquires lock, second reacts with 422, zero published-invalid states) (**PASS**).
- Room input validation: rejects invalid price and capacity with 400 and never coerces to 0 (**PASS**).
- Request body structure: rejects missing body, non-object body, and empty rooms array with 400 (**PASS**).
- Price authority: enforces exact draft vs publish price rule (rejects missing, negative, boolean, and zero prices with 400, and permits publication only with positive price) (**PASS**).
- Payload duplicate ID guard: rejects duplicate room IDs and duplicate room references with 400 (**PASS**).
- Malformed ID guard: rejects malformed and out-of-range room IDs with 400 (**PASS**).
- Non-draft rejection: rejects room edits on an unlisted listing with 422, enforcing that unlisted represents accepted historical authority (**PASS**).
- Ambiguous legacy matching: fails closed with 422 when multiple existing rooms match name and type, with zero DB mutations (**PASS**).
- Host edit (`PUT /api/listings/:id`): reproduces invariant violation (**EXPECTED FAIL / OPEN GAP**).
- Admin moderation interleaving bypass: verified parent listing row locking (**PASS**).

```
$ node scripts/testing/run.mjs src/test/harvo/r3_01_post_publication_writer_repro.test.ts

 ❯ |marketing| src/test/harvo/r3_01_post_publication_writer_repro.test.ts (18 tests | 1 failed) 7509ms
   ❯ R3-01 Post-Publication Competing Writers Reproduction — Real Mounted Routes & PG (18)
     ✓ enforces publication containment: rejects admin media moderation with 422 when approved room photos would drop below 3 on published listing 66ms
     ✓ enforces publication containment: rejects admin media moderation with 422 when removing sole sleeping-area photo on published listing 16ms
     ✓ permits admin media rejection on published listing when 4 approved photos exist and remaining 3 satisfy publication invariant 12ms
     ✓ enforces publication containment: rejects host room edit via PUT /api/listings/:id/rooms on published listing with 422, leaving rooms, media, and listing unchanged 16ms
     ✓ permits room edits via PUT /api/listings/:id/rooms on draft listing: updates existing room and inserts new room while preserving stable IDs 18ms
     ✓ rejects foreign room ID belonging to another listing with 422 and leaves database completely unmodified 9ms
     ✓ proves publish-versus-edit race: Connection A publishes listing while Connection B room PUT waits on parent listing lock, then unblocks and returns 422 with zero mutations 169ms
     ✓ proves reverse settlement race: Connection A direct SQL room edit holds listing lock, mutates draft rooms to non-compliant state, then commits; waiting publish PATCH unblocks and returns 422 161ms
     ✓ proves mutual exclusion and publication containment under concurrent mounted room PUT and publish PATCH 18ms
     ✓ validates every room input before mutation; rejects invalid price and capacity with 400 and never coerces to 0 10ms
     ✓ validates request body structure and rejects missing body, non-object body, and empty rooms array with 400 12ms
     ✓ enforces exact draft vs publish price rule: rejects missing, negative, and zero prices with 400, and permits publication only with positive price 55ms
     ✓ rejects duplicate room IDs and duplicate room references in payload with 400 7ms
     ✓ rejects malformed and out-of-range room IDs with 400 10ms
     ✓ rejects room edits on an unlisted listing with 422: unlisted represents accepted historical authority and requires return to draft 5ms
     ✓ fails closed with 422 on ambiguous legacy room matches when multiple existing rooms match name and type 5ms
     × [OPEN GAP] reproduces host edit via PUT /api/listings/:id detaching approved room media and altering price on published listing 19ms
     ✓ reproduces concurrency interleaving where admin moderation bypasses parent listing row lock (green-after safe) 156ms

 Test Files  1 failed (1)
      Tests  1 failed | 17 passed (18)
   Duration  8.64s
```

### 2.3 Direct Service Unit Test Suite (`admin_media_moderation_service_pg.test.ts`)
All 15 tests pass cleanly against disposable PostgreSQL:

```
$ node scripts/testing/run.mjs src/test/harvo/admin_media_moderation_service_pg.test.ts

 ✓ |marketing| src/test/harvo/admin_media_moderation_service_pg.test.ts (15 tests) 1584ms
   ✓ Admin Media Moderation Service — Atomic Transaction & Rollback on Disposable PostgreSQL (15)
     ✓ proves that a failed audit log insert causes an atomic transaction ROLLBACK, leaving media_assets unchanged 12ms
     ✓ atomically commits both media asset moderation and audit log record when audit write succeeds 7ms
     ✓ rejects cross-property room assignment with 422 and leaves database completely unmodified 3ms
     ✓ validates input parameters and rejects invalid values with 400 or 404 before mutation 2ms
     ✓ proves that changing room_type_id on an approved photo resets moderation_status to pending_review when moderation_status is omitted 4ms
     ✓ proves that changing is_sleeping_area on an approved photo resets moderation_status to pending_review when moderation_status is omitted 3ms
     ✓ allows atomic reapproval of exact binding when moderation_status="approved" is explicitly passed alongside room_type_id or is_sleeping_area 2ms
     ✓ retains approved status when room_type_id and is_sleeping_area are updated with their existing values 4ms
     ✓ independently validates exact boolean and positive safe integer IDs, rejecting malformed and unparsed values with 400 and zero writes 6ms
     ✓ enforces entity boundary by rejecting room binding and sleeping area claims on non-listing media assets with 422 3ms
     ✓ permits media rejection on published listing when 4 approved photos exist and remaining photos satisfy publication invariant 5ms
     ✓ rejects media rejection with 422 on published listing when approved photo count drops below 3, leaving asset, listing, and audit unchanged 3ms
     ✓ rejects unflagging sleeping area with 422 on published listing when it is the sole sleeping area photo, leaving asset, listing, and audit unchanged 3ms
     ✓ demonstrates parent-first listing row locking and two-connection lock wait settlement in moderateMediaAsset 136ms
     ✓ REGRESSION: canonical room authority uses room_type_id not tier; unassigned NULL cannot satisfy room gates, while common-tier bound asset does 8ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
   Duration  1.84s
```

### 2.4 Adjacent Regression Suites
```
$ node scripts/testing/run.mjs src/test/m3_room_media_authority.test.ts

 ✓ |legacy| src/test/m3_room_media_authority.test.ts (28 tests) 795ms
   ✓ Phase 3 Milestone 3 — Canonical Relational Room & Media Authority (28)
     ✓ Test 1: Property cannot be published if a room type has < 3 approved photos 81ms
     ✓ ...
     ✓ Test 8: Non-destructive room updates via PUT /api/listings/:id/rooms preserve existing room IDs 22ms
     ✓ ...
     ✓ Test 28: Preflight enforces BEGIN READ ONLY and fails closed when tables are missing 1ms

 Test Files  1 passed (1)
      Tests  28 passed (28)
   Duration  5.11s
```

```
$ node scripts/testing/run.mjs src/test/admin_media_review_desk.test.ts

 ✓ |legacy| src/test/admin_media_review_desk.test.ts (9 tests) 533ms
   ✓ Admin Media Review Desk — Relational Media Read & Atomic Moderation Audit (9)
     ✓ Test 1: Mounted admin-only GET and PATCH endpoints reject host role with 403 Forbidden 70ms
     ✓ ...
     ✓ Test 9: Mounted PATCH route rejects non-listing media asset room binding and sleeping area designation with 422 23ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  6.27s
```

### 2.5 Vitest Teardown Defect Disclosure (Unresolved Test Harness Issue)
When running test suites concurrently in a single Vitest invocation:
```
$ node scripts/testing/run.mjs src/test/admin_media_review_desk.test.ts src/test/harvo/admin_media_moderation_service_pg.test.ts src/test/harvo/r3_01_publication_toctou_repro.test.ts
```
The test runner executes all 28/28 assertions successfully. However, in parallel multi-file runs where disposable pg proxy pools close while idle clients remain in Express server's pool, Vitest throws a worker unhandled rejection:
```
EnvironmentTeardownError: [vitest-worker]: Closing rpc while "onUserConsoleLog" was pending
[DATABASE POOL ERROR] Unexpected error on idle client: Connection terminated unexpectedly
```
This is an **unresolved test-harness defect**, not a benign artifact. It must not be hidden or excused. When executed serially (`--fileParallelism=false`) or in isolation, the exact same command completes with **Exit 0** and zero teardown errors:
```
$ node scripts/testing/run.mjs --fileParallelism=false src/test/admin_media_review_desk.test.ts src/test/harvo/admin_media_moderation_service_pg.test.ts src/test/harvo/r3_01_publication_toctou_repro.test.ts

 Test Files  3 passed (3)
      Tests  28 passed (28)
   Duration  13.08s
```
Both the failed parallel run and the successful serial run are preserved as evidence.

---

## 3. Tooling & Verification Matrix

| Check / Tool | Command Executed | Result |
|---|---|---|
| Service Unit Suite | `node scripts/testing/run.mjs src/test/harvo/admin_media_moderation_service_pg.test.ts` | **Exit 0** (15/15 passed) |
| Admin Media Review Desk | `node scripts/testing/run.mjs src/test/admin_media_review_desk.test.ts` | **Exit 0** (9/9 passed) |
| Canonical M3 Suite | `node scripts/testing/run.mjs src/test/m3_room_media_authority.test.ts` | **Exit 0** (28/28 passed) |
| Publication TOCTOU Suite | `node scripts/testing/run.mjs src/test/harvo/r3_01_publication_toctou_repro.test.ts` | **Exit 0** (4/4 passed) |
| Serial Multi-Suite Run | `node scripts/testing/run.mjs --fileParallelism=false src/test/admin_media_review_desk.test.ts src/test/harvo/admin_media_moderation_service_pg.test.ts src/test/harvo/r3_01_publication_toctou_repro.test.ts` | **Exit 0** (28/28 passed) |
| Competing Writers Suite | `node scripts/testing/run.mjs src/test/harvo/r3_01_post_publication_writer_repro.test.ts` | **Exit 1** (17 passed, 1 open host gap failed, 18 total) |
| Admin Room Editor UI Contract | `node scripts/testing/run.mjs src/test/admin_room_editor_ui_contract.test.tsx` | **Exit 0** (4/4 passed) |
| TypeScript Compiler Check | `npx tsc --noEmit` | **Exit 0** (clean, zero errors) |
| Scoped ESLint | `npx eslint components/AdminDashboard.tsx src/test/admin_room_editor_ui_contract.test.tsx src/test/harvo/r3_01_post_publication_writer_repro.test.ts` | **Exit 0** (0 errors, 0 warnings) |
| Git Whitespace/Diff Check | `git diff --check` | **Exit 0** (clean) |

---

## 4. Verified Source Findings: Room Association Authority vs Display Tier

### 4.1 Cross-Surface Contradiction in Existing Codebase
Inspection of the current codebase reveals a clear distinction between canonical room authority and display tier:
1. **Admin Review Desk (`components/AdminDashboard.tsx` ~5939):**
   - The room association dropdown selectively mutates `room_type_id`:
     `handleModerateAsset(asset.id, { room_type_id: val ? Number(val) : null })`.
   - Selecting "Property-Wide / Common (Unassigned)" clears `room_type_id` to `null`.
   - The asset's `tier` column is NOT mutated when room association changes.
2. **Admin Moderation Service Test (`src/test/harvo/admin_media_moderation_service_pg.test.ts` ~396):**
   - Existing test verifies atomic reapproval of a previously common photo (`tier = 'common'`) bound to a room (`room_type_id = roomId`, `moderation_status = 'approved'`).
   - The `tier` column remains `'common'`, but the asset is canonically bound to the room type.
3. **Host Form (`components/HostForm.tsx` ~747):**
   - Ordinary room uploads set `tier: room.type || 'suites'`.
   - Property-wide uploads set `tier: 'common'`.

### 4.2 Canonical Publication Authority Decision
- **Canonical Authority:** Room media association is governed strictly by an explicitly reviewed foreign key `room_type_id` plus `moderation_status = 'approved'`.
- **Role of Tier:** `tier` is legacy/display metadata, NOT publication authority.
- **Unassigned Media Exclusion:** Property-wide assets (`room_type_id IS NULL`) cannot count toward any room's minimum photos or sleeping-area requirement, even if marked `is_sleeping_area = true` or `moderation_status = 'approved'`.
- **Common-Tier Bound Assets Permitted:** An asset with `tier = 'common'` that is explicitly assigned to a room (`room_type_id = room.id`) and approved CAN and DOES satisfy publication requirements.
- **Mounted Admin Moderation & Audit Verification:**
  - In `src/test/harvo/r3_01_publication_toctou_repro.test.ts` (test 4), all fixture queries are parameterized ($1..$9).
  - Binding the common asset (8303) is executed via the live mounted Admin API: `PATCH /api/admin/media-assets/8303/moderation` with `{ room_type_id: roomId }`.
  - The test verifies that reassigning room association immediately resets `moderation_status` to `pending_review` in PostgreSQL and commits an immutable record to `admin_audit_logs`.
  - The test verifies that publication while the asset is `pending_review` is rejected with HTTP 422.
  - The admin explicitly reapproves the asset via the mounted API (`{ moderation_status: 'approved' }`), committing a second audit log while `tier` remains `'common'`.
  - The listing then successfully publishes with HTTP 200 via `PATCH /api/admin/listings/:id/status`.

---

## 5. Verified Source Findings: Separate Guest Projection Gap

A structural discrepancy exists between the Guest projection layer and Guest UI presentation:
1. **`src/server/guest/publicStayAuthority.ts` (lines 32 & 35):**
   - Queries `room_types` without `id` (`SELECT name, type, icon, ...`).
   - Queries `media_assets` without `room_type_id` (`SELECT url, tier, category, ...`).
   - As a result, `result.rooms` omits relational room IDs, and `result.photos` omits `room_type_id`.
2. **`src/lib/stayProjection.ts` (lines 21-43, 58-70):**
   - `PublicRoomTier` and `PublicMediaAsset` schemas completely omit `id` and `room_type_id` for address/identifier privacy coarsening.
3. **`src/shared/guest/roomPresentation.ts` (line 19):**
   - The presentation helper explicitly prefers the relational FK:
     `if (photo.room_type_id !== undefined && photo.room_type_id !== null) return uniqueId(room) && String(photo.room_type_id) === String(room.id);`
   - Because `publicStayAuthority.ts` and `stayProjection.ts` drop `room.id` and `photo.room_type_id`, `roomPresentation.ts` is forced to fall back to display tier string matching (`photo.tier === tier`).
   - If a photo has `tier = 'common'` despite being bound to a room via FK, or if multiple rooms share a tier string, guest room photo presentation will fail to group correctly.
4. **Boundary Note:**
   - This gap is recorded as a verified source finding. Public projection was intentionally NOT modified in this bounded task and is queued for subsequent remediation.

---

## 6. Demonstrated Lock Hierarchy & Open Writer Boundaries

1. **Demonstrated Lock Hierarchy on `PUT /api/listings/:id/rooms` and `moderateMediaAsset`:**
   - Both `moderateMediaAsset` and `PUT /api/listings/:id/rooms` now acquire `listings FOR UPDATE` first before querying or mutating child records (`media_assets` / `room_types`).
   - This proves that lock waiting and orderly settlement occurs between room edits and media moderation without deadlock between these two endpoints.
   - **CRITICAL SCOPE LIMITATION:** This demonstrates a bounded lock hierarchy between these two specific endpoints only; it does **NOT** represent global deadlock elimination across the platform.

2. **Published Listing Room Mutation Contained:**
   - `PUT /api/listings/:id/rooms` now rejects modifications on published listings with HTTP 422:
     `Cannot modify rooms on a published listing: modification would alter verified room authority. Unpublish listing first or submit a draft successor review.`
   - Bidirectional race settlement and concurrency containment are empirically proven against real PostgreSQL:
     a) **Directed publish-versus-edit race:** Transaction A publishes listing; concurrent room PUT waiting on parent lock unblocks and receives 422; database remains published and untouched.
     b) **Directed reverse settlement test:** Connection A uses direct SQL within a raw PoolClient transaction holding `SELECT ... FOR UPDATE` to hold the lock deterministically while Supertest PATCH is dispatched; mutates draft rooms to non-compliant state, then commits; waiting publish PATCH unblocks, runs publication validation on held connection, and receives 422. (Evidence label: proves publication PATCH unblocking and re-validation, but does not mount room PUT as first writer).
     c) **Dual-mounted race test:** Concurrently dispatches both mounted Supertest routes (`PUT /api/listings/:id/rooms` and `PATCH /api/admin/listings/:id/status`), proving mutual exclusion where exactly one route acquires the parent row lock, the second unblocks and receives 422, and no invalid published state can ever be persisted.

3. **Open Writer Boundaries (Uncontained Platforms Gaps):**
   The following writer paths remain open architectural gaps that do not participate in this lock hierarchy:
   - **General Listing Writer (`PUT /api/listings/:id`):** Allows hosts to unilaterally alter published nightly rates (e.g. ₹15,000 to ₹35,000) on live offers and detach approved room media without offer versioning. The listing remains `published` while violating PROPOSED-007. This remains intentionally reproduced as a RED test (`[OPEN GAP] reproduces host edit via PUT /api/listings/:id detaching approved room media and altering price on published listing`) in `src/test/harvo/r3_01_post_publication_writer_repro.test.ts`.
   - **Draft Approval / Publishing Flows:** Other draft-publish paths still write without a shared version/lock rule.
   - **Listing Rental Mode Writer (`PUT /api/listings/:id/mode`):** Modifies `rental_mode` without parent row locking or publication containment checks.
   - **Legacy Backfill Operations:** Migration scripts and background workers mutating legacy JSON vs relational tables.

---

## 7. R3-01 Card State & Scope Disclosure

- **Card State:** **IN PROGRESS / UNACCEPTED**.
- **Scope Contained:** Admin media moderation (`PATCH /api/admin/media-assets/:id/moderation`) and Dedicated Room updates (`PUT /api/listings/:id/rooms`) now adhere to parent-first row locking, typed `PoolClient` lifecycle, strict room input validation, entity binding re-verification, and publication containment with actionable HTTP 422 denial.
- **Unaddressed Scope:** General host listing edits (`PUT /api/listings/:id`), listing mode edits (`PUT /api/listings/:id/mode`), draft publishing paths, backfill workers, and Guest projection room FK propagation remain open gaps.
- **No Gate Clearance:** No release, golden-path certification, or external gate clearance is claimed.

---

## 8. Impact Note: PUT 409 Reconciliation Guard, Persisted Principal Reauthorization, & Truthful Room Retirement Boundary

**Date:** 2026-10-02
**Task:** Bounded Slice Completion: `PUT /api/listings/:id/rooms` fail-closed 409 reconciliation guard, persisted user authorization, and truthful persisted room delete UI control.

### 8.1 Source of Truth
- Relational `room_types` table is the sole source of canonical room authority.
- Parent row lock on `listings` (`SELECT id, user_id, publication_status, rooms FROM listings WHERE id = $1 FOR UPDATE`) guarantees serialization and holds the single connection throughout validation and execution.
- If `room_types` has 0 rows but `listings.rooms` has legacy room data, the inventory is un-reconciled. Relational insertion must fail closed with HTTP 409 `ROOMS_UNRECONCILED` before any write.
- **Factored Strict Predicate (`hasUnreconciledLegacyRooms`):** PostgreSQL `listings.rooms` is defined as `JSONB DEFAULT '[]'`. Node-postgres parses JSONB columns into JavaScript objects, arrays, strings, or primitives. The strict predicate treats every nonempty array, nonempty object (e.g. `{rooms: [...]}`, `{legacy: true}`), unparseable string, or malformed nonempty primitive (number, boolean) as unreconciled. Only `null`, `undefined`, empty array `[]`, empty object `{}`, or empty string `""` are treated as genuinely empty.

### 8.2 Affected Route, UI, and Schema
- **Route (`server.ts`):**
  - `hasUnreconciledLegacyRooms(rawRooms: unknown): boolean`: Factored strict predicate exported and used across both GET and PUT.
  - `GET /api/listings/:id/rooms`: Queries `SELECT id, role, is_active FROM users WHERE id = $1` via pooled read (`pool.query`, not a held connection) with strict `is_active === true` verification. Fails closed with HTTP 503 if the column is missing from the database, and rejects non-true (null, false, missing) states with HTTP 403 (no default-allow). Uses `hasUnreconciledLegacyRooms(listing.rooms)` when `room_types` has 0 rows, returning HTTP 409 `ROOMS_UNRECONCILED` for nonempty arrays, nonempty objects, unparseable strings, or malformed primitives. Returns 200 with `rooms: []` when genuinely empty (`[]`, `{}`, or `null`).
  - `PUT /api/listings/:id/rooms`:
    - Queries `listings` parent row with `rooms` under exclusive lock (`FOR UPDATE`).
    - Reauthorizes principal against database on held connection (`SELECT id, role, is_active FROM users WHERE id = $1`) with strict `is_active === true` requirement. Rejects unauthenticated (401), revoked/inactive (403), downgraded (403), or foreign users (403). Fails closed with 503 on missing column.
    - Inspects `existingRooms` from `room_types`. If 0 relational rows exist, evaluates `hasUnreconciledLegacyRooms(listing.rooms)`. If true, rolls back and rejects with HTTP 409 `ROOMS_UNRECONCILED` with zero mutations.
    - If `existingRooms` has 0 rows and `listings.rooms` is genuinely empty (`[]`, `{}`, or empty draft), permits creation of canonical room types.
- **UI (`components/AdminDashboard.tsx`):**
  - Room editor modal: examines room delete action.
  - Only positively identified unsaved temporary IDs (`admin-room-*`, `room-*`, `new-*`, `temp*`) allow `"Remove Unsaved Room"` to discard client-only drafts without server dispatch.
  - Ambiguous legacy rooms lacking an explicit `id` property (`!room.id`) are protected against accidental omission: delete is disabled with explanatory notice `"Legacy room missing ID; canonical reconciliation required before deletion."`.
  - Persisted rooms (integer IDs) truthfully disable the delete button with explanatory copy: `"Persisted rooms cannot be deleted by omission; retirement command required."` (omission in PUT is not deletion; avoids bookable ghosts).
  - Preserves unknown-outcome locking on network/shape errors until verified canonical reload.
- **Schema & Test Fixtures:**
  - Production `ensureUsersTable` adds `is_active BOOLEAN DEFAULT true`.
  - Disposable test fixture (`src/test/setup.ts`) updated to include `is_active BOOLEAN DEFAULT true` to represent the true column schema.

### 8.3 Security & Compatibility
- Eliminates JWT-only trust in `PUT /api/listings/:id/rooms`: persisted role and `is_active` are verified on the held connection.
- Strict fail-closed authorization: `is_active` must be strictly `true`. Never grants access on `null`, `undefined`, or missing states.
- Prevents silent recreation or duplication of legacy rooms during PUT, whether legacy storage is an array, a non-array JSONB object (e.g. `{rooms: [...]}` or `{legacy: true}`), an unparseable string, or a malformed primitive.
- Preserves current partial-update semantics and stable primary keys for existing room types.
- Fail closed on relational query read errors with HTTP 500 and schema readiness errors with HTTP 503.

### 8.4 Targeted Tests
- `src/test/harvo/r3_01_post_publication_writer_repro.test.ts`:
  - Mounted HTTP PUT 409 `ROOMS_UNRECONCILED` on legacy array listing, verifying zero DB mutations.
  - Mounted HTTP PUT 409 `ROOMS_UNRECONCILED` on nonempty JSONB object (`{rooms: [...]}` and `{legacy: true}`), verifying zero DB mutations.
  - Mounted HTTP PUT 409 `ROOMS_UNRECONCILED` on malformed nonempty primitive (`true`::jsonb), verifying zero DB mutations.
  - Mounted HTTP PUT 200 on genuinely empty/new draft listing (`[]` and `{}`), verifying successful canonical creation.
  - Mounted HTTP GET 409 on nonempty JSONB object and 200 on empty object `{}`.
  - Mounted HTTP PUT 403 on revoked/inactive account (`is_active = false`).
  - Mounted HTTP PUT 403 on downgraded account (JWT admin, DB user).
  - Mounted HTTP PUT 403 on foreign user (not owner or admin).
  - Mounted HTTP GET/PUT strict `is_active` fail-closed verification.
  - Unit tests for `hasUnreconciledLegacyRooms` covering empty, array, object, string, and primitive cases.
- `src/test/admin_room_editor_ui_contract.test.tsx`:
  - UI contract test 16 verifying persisted rooms have disabled delete control with retirement requirement notice.
  - UI contract test 17 verifying positively identified unsaved temporary rooms can be removed.
  - UI contract test 18 verifying ambiguous legacy rooms lacking IDs disable delete with reconciliation notice.

### 8.5 Rollback Strategy
- **Targeted Patch Rollback:** Revert only the specific R3-01 room authority hunks in `server.ts` (GET/PUT `/api/listings/:id/rooms` authorization and reconciliation blocks), `components/AdminDashboard.tsx` (delete/remove control and temporary ID checks), and `src/test/setup.ts` using hunk-level patch reversal (`git apply --reverse <r3-01-slice.patch>`) or interactive hunk checkout (`git checkout -p`).
- **CRITICAL:** Do NOT execute whole-file `git checkout` or `git restore`, as the pre-existing dirty tree contains critical in-flight CR1 work (e.g. AdminDashboard, server.ts marketing/finance boundaries) that must remain preserved.

---

## 9. Impact Note: General Listing Writer (`PUT /api/listings/:id`) P0 Containment

**Date:** 2026-10-02
**Task:** P0 containment of the general listing writer (`PUT /api/listings/:id`) in `server.ts` against published authority alteration, unverified JWT trust, uncontained publication status mutations, and unlocked partial writes.

### 9.1 Source of Truth
- Relational tables `listings` (parent record), `room_types` (canonical room inventory, pricing, capacity), and `media_assets` (relational media bindings, moderation status, sleeping-area flags) are the authoritative source of truth.
- A single PostgreSQL client is acquired for the entire request lifecycle and held in an explicit transaction (`BEGIN` ... `COMMIT` / `ROLLBACK`).
- Exclusive row locking (`SELECT id, user_id, publication_status, price, type, currency FROM listings WHERE id = $1 FOR UPDATE`) guarantees serial execution and prevents race conditions with concurrent publication status changes or moderation updates.

### 9.2 Affected Route, Tables, and UI
- **Route (`server.ts`):** `PUT /api/listings/:id`.
- **Tables Affected:** `listings`, `users` (persisted reauthorization), `room_types` (draft upserts), `media_assets` (draft upserts).
- **UI:** Host listing editor (`components/HostForm.tsx`) and Admin property detail views.

### 9.3 Authority & Identity Reauthorization
- Eliminates unverified JWT-only claims: every update request verifies persisted user identity and status directly from the `users` table on the held connection (`SELECT id, role, is_active FROM users WHERE id = $1`).
- Strict fail-closed policy: `is_active === true` is required. Inactive or suspended accounts (`is_active !== true`) receive HTTP 403 Forbidden.
- Role downgrades (e.g. JWT claims admin, but database record shows user on non-owned listing) are rejected with HTTP 403 Forbidden.
- Schema readiness: missing `users.is_active` column (PostgreSQL error `42703`) fails closed with HTTP 503 Service Unavailable.
- Unauthenticated requests receive HTTP 401 Unauthorized; missing listings receive HTTP 404 Not Found.

### 9.4 Transaction & Publication Containment
- **Single Held Client:** Connection is acquired once via `pool.connect()` and released in `finally`. Standalone pool writes are eliminated.
- **Published & Unlisted Rejection (Pre-Mutation Guard):**
  - If `listing.publication_status === 'published'`: aborts immediately with HTTP 422:
    `Cannot modify listing on a published listing: modification would alter verified listing and offer authority. Unpublish listing first or submit a draft successor review.`
  - If `listing.publication_status !== 'draft'` (e.g. `'unlisted'`): aborts with HTTP 422:
    `Cannot modify listing on an unlisted listing: unlisted listings represent accepted historical authority. Return listing to draft status or submit a draft successor review.`
  - Zero row mutations or partial updates are committed on published or unlisted listings.
- **Direct `publication_status` Mutation Rejected:**
  - `publication_status` in `req.body` is rejected with HTTP 400 Bad Request:
    `Direct publication_status mutation rejected on general listing endpoint. Use dedicated transition route (/api/admin/listings/:id/status).`
- **Draft Updates Preserved:**
  - For listings in `draft` status, full updates (with `title`) continue to update `listings`, `room_types`, and `media_assets` preserving stable IDs.
  - Partial updates (e.g. `videoUrl`, `amenities`, etc.) execute within the held transaction on the held client.
  - Unhandled partial fields fail closed with HTTP 400 Bad Request, preventing deceptive HTTP 200 returns on unmutated listings.
- **Truthful Logging:**
  - Standalone writes to pool and false claims of instant Meta API sync without provider readback are removed.

### 9.5 Compatibility
- Draft property creation and editing in `HostForm.tsx` and admin tools remain intact.
- Published properties are protected against silent modification of pricing, media, room inventory, or coordinates.
- Legacy endpoints attempting to pass `publication_status` via general PUT must use `PATCH /api/admin/listings/:id/status`.

### 9.6 Targeted Tests
- `src/test/harvo/r3_01_post_publication_writer_repro.test.ts`:
  - Enforces publication containment: rejects host `PUT /api/listings/:id` on a published listing with HTTP 422, leaving `listings`, `room_types`, and `media_assets` completely unchanged.
  - Rejects deactivated account (`is_active = false`) with HTTP 403 Forbidden.
  - Rejects downgraded account (JWT admin, DB user) with HTTP 403 Forbidden.
  - Rejects direct `publication_status` mutation on general PUT with HTTP 400 Bad Request.
  - Rejects partial-field mutation on published listing with HTTP 422.
  - Permits partial-field mutation on draft listing with HTTP 200 on held client.
  - Fails closed on unsupported partial payload on draft listing with HTTP 400 Bad Request.
  - Proves concurrent publish-versus-general-edit serialization on disposable PostgreSQL via two-connection lock wait.

### 9.7 Rollback Strategy
- Revert the `PUT /api/listings/:id` block in `server.ts` using hunk-level reversal (`git apply --reverse` or patch restore).
- Preserve existing dirty working tree changes across `AdminDashboard.tsx`, `setup.ts`, and other endpoints.

---

## 10. Codex Review Corrections (2026-10-02)

Following Codex review, surgical containment was applied to address three critical concerns:

### 10.1 Elimination of Non-Numeric ID Deceptive Success (PUT /api/listings/:id)
- **Problem:** `PUT /api/listings/:id` contained a legacy short-circuit `if (isNaN(Number(req.params.id))) return res.json({ id: req.params.id, message: "Demo listing preserved" });`, which returned HTTP 200 on non-numeric IDs (e.g. `/api/listings/demo`, `/api/listings/not-a-number`) before validation or database authority checks.
- **Remediation:** Removed the demo short-circuit. Added strict positive safe integer regex and range validation:
  ```typescript
  const rawId = String(req.params.id || '').trim();
  const listingId = Number(rawId);
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(listingId) || listingId <= 0 || listingId > 2147483647) {
    return res.status(400).json({ error: 'Invalid listing ID: must be a positive integer' });
  }
  ```
- **Verification:** Verified that `/api/listings/demo`, `/api/listings/not-a-number`, negative integers, zero, floats, and overflow integers return HTTP 400 Bad Request.

### 10.2 Deceptive Copy Removal & Dedicated Status Transition Route Hardening (PATCH /api/admin/listings/:id/status)
- **Problem:**
  - Error messages in `PUT /api/listings/:id` previously advised: `"Unpublish listing first or submit a draft successor review"` / `"Return listing to draft status or submit a draft successor review"`.
  - The dedicated status endpoint `PATCH /api/admin/listings/:id/status` permitted an owner or admin to transition `published -> draft -> published`, checking only relational room/media validity upon publication. An owner could demote to `draft`, alter room prices, coordinates, or listing facts via `PUT /api/listings/:id`, and then re-publish without successor review of accepted facts.
- **Remediation:**
  1. Removed misleading copy mentioning "Unpublish listing first" or "Return listing to draft". Replaced with direct prohibition:
     - Published: `Cannot modify listing on a published listing: modification would alter verified listing and offer authority. Direct modification of published listings is prohibited; submit a draft successor review.`
     - Non-draft (unlisted): `Cannot modify listing on an ${status} listing: ${status} listings represent accepted historical authority. Direct modification is prohibited; submit a draft successor review.`
  2. Hardened `PATCH /api/admin/listings/:id/status`:
     - Added strict positive integer validation on `req.params.id`.
     - Blocked unreviewed demotions: if a listing is `published` or `unlisted`, attempting to set `publication_status = 'draft'` is rejected with HTTP 422 Unprocessable Entity:
       `Transition from ${listing.publication_status} to draft rejected: direct demotion reopens accepted authority without reviewed successor contract. Submit a formal successor revision.`
     - The listing remains `published` or `unlisted` in PostgreSQL under parent row lock.
- **Architectural Scope & Open P0 Status:**
  - Status route containment prevents arbitrary owner/admin demotion to draft.
  - A formal successor revision workflow (`POST /api/admin/listings/draft/:id/approve` or successor branching) remains an **OPEN P0** architectural requirement. We do **not** claim publication containment across all writers until successor reviews and other write paths (`POST /api/admin/listings/draft/:id/approve`, `PUT /api/listings/:id/mode`, backfill workers) are contained.

### 10.3 Truthful Output: No False Provider-Sync Claims
- Verified that `PUT /api/listings/:id` emits no false provider-sync claims (`metaAdsSynced`, `providerSync`, etc.) in response payloads and no fake `[META ADS SYNC]` console logs when updating prices without real provider readback.

### 10.4 Test Suite Summary
- `src/test/harvo/r3_01_post_publication_writer_repro.test.ts`: **54/54 passed (Exit 0)**.
- `src/test/admin_room_editor_ui_contract.test.tsx`: **18/18 passed (Exit 0)**.
- `npx tsc --noEmit`: **Exit 0**.
- `npx eslint server.ts src/test/harvo/r3_01_post_publication_writer_repro.test.ts`: **Exit 0**.
- `git diff --check`: **Exit 0**.
- R3-01 status: **OPEN / IN PROGRESS** (0/32 corrective cards, 0/48 packages, ~55% provisional).

---

## 11. Follow-up Bounded P0 Status Transition Repair Impact Note (2026-10-02)

### 11.1 Source of Truth
- PostgreSQL `listings` and `users` tables, queried under a single held connection with exclusive row lock (`SELECT id, user_id, title, publication_status FROM listings WHERE id = $1 FOR UPDATE`).
- Authority and state are evaluated strictly on the held client in an explicit transaction (`BEGIN` -> `COMMIT`/`ROLLBACK`).

### 11.2 Affected Route, Tables, and UI
- **Route (`server.ts`):** `PATCH /api/admin/listings/:id/status`.
- **Tables Affected:** `listings` (`publication_status`), `users` (persisted reauthorization).
- **UI:** Admin property moderation/review desk, Host property status controls (pause/unlist).

### 11.3 Authority & Identity Reauthorization
- **Eliminates Stale JWT Claims:** Queries `SELECT id, role, is_active FROM users WHERE id = $1` on the held connection.
- **Fail-Closed Gate:** Account must have `is_active === true`; suspended or deactivated accounts receive HTTP 403 Forbidden. Missing `users.is_active` schema column (`42703`) fails closed with HTTP 503.
- **Publication/Republication Authority:** Transition to `published` (from either `draft` or `unlisted`) strictly requires current persisted `admin` authority (`requesterUser.role === 'admin'`). Host/owner self-publication is denied with HTTP 403 Forbidden (`Forbidden: Only administrators can approve and publish listings.`).
  - *Interim Authority Note:* `users.role === 'admin'` serves as interim workforce authority until scoped workforce IAM is designed and wired; the release gate remains open.
- **Safe Host Action Preserved:** A listing owner (`String(requesterId) === String(listing.user_id)`) may safely transition an accepted listing from `published -> unlisted` (unlisting or pausing their property).
- **All Routes Back to Draft Denied:** Neither owner nor admin can transition `published -> draft` or `unlisted -> draft` via this route. Direct demotion back to draft reopens accepted authority without a reviewed successor contract and is rejected with HTTP 422.

### 11.4 Transaction, Zod Allowlist & Transition Matrix
- **Single Held Client:** `client = await pool.connect()` wrapped in `try/finally` with `client.release()`.
- **Strict Zod Body Allowlist:**
  ```typescript
  const listingStatusTransitionBodySchema = z.object({
    publication_status: z.enum(['draft', 'published', 'unlisted'], {
      errorMap: () => ({ message: "Invalid publication_status: must be one of 'draft', 'published', 'unlisted'" })
    })
  }).strict();
  ```
  Arbitrary states (such as `"bogus"`) are rejected immediately with HTTP 400 Bad Request before database acquisition.
- **Explicit Transition Matrix:**
  - `draft -> published`: Admin only; requires `validatePropertyPublication(listingId, client) === true` on held client.
  - `draft -> unlisted`: Denied with HTTP 422 (unlisting an unapproved draft is invalid).
  - `published -> unlisted`: Allowed for Owner and Admin (safe pause/unlist).
  - `published -> draft`: Denied with HTTP 422 for all callers.
  - `unlisted -> published`: Admin only; requires `validatePropertyPublication(listingId, client) === true` on held client.
  - `unlisted -> draft`: Denied with HTTP 422 for all callers.
  - Same-state transitions (`status -> status`): No-op with HTTP 200.
  - Corrupt/unmanaged database states: Denied with HTTP 422.
- **No Provider Claims:** No simulated or false external provider effect is claimed or logged.

### 11.5 Compatibility
- Preserves admin review and publication flow.
- Preserves host ability to unlist/pause an active listing.
- Completely blocks the `published -> bogus -> draft` bypass and host self-publishing bypass.

### 11.6 Targeted Tests
- Input validation: reject non-enum, malformed, empty, or non-object payloads with HTTP 400.
- `published -> bogus` rejected with HTTP 400.
- Host `draft -> published` rejected with HTTP 403.
- Host `unlisted -> published` rejected with HTTP 403.
- Host `published -> unlisted` permitted with HTTP 200.
- Admin `published -> unlisted` permitted with HTTP 200.
- Admin `draft -> published` permitted with HTTP 200 when canonical validation passes.
- Revoked/downgraded admin (`role = 'user'` or `is_active = false`) rejected with HTTP 403.
- Database and audit logs unchanged on any denied transition.
- Two-connection concurrency serialization.

### 11.7 Rollback Strategy
- Revert changes to `PATCH /api/admin/listings/:id/status` in `server.ts` using hunk-level reversal.
- Preserve existing dirty working tree files.

---

## 12. Impact Note: Quarantine of Legacy Uncontained Writer (`POST /api/admin/listings/draft/:id/approve`) (2026-10-02)

### 12.1 Source of Truth & Vulnerability Proof
- **Route:** `POST /api/admin/listings/draft/:id/approve` (in `server.ts` near line 13552).
- **Core Defect:** Route had only generic `authenticateToken` middleware without role checking, persisted caller verification, parent listing row locking, or ownership validation.
- **Critical Exploit Vector:**
  1. Any signed-in user (including unprivileged guests or foreign hosts) could submit a draft approval.
  2. The endpoint reads unversioned draft data from `listings_drafts` unlocked.
  3. If `draft.published_listing_id` points to an existing published listing (even one owned by another host), the route directly executed an unconditional `UPDATE listings` overwriting accepted listing facts.
  4. Missing draft fields defaulted price to `0` and city to `'Berlin'`.
  5. The route accepted numeric `photo.room_type_id` without same-listing proof and updated `media_assets` and `room_types` without locks.
  6. The listing was transitioned to `publication_status = 'published'` without creating any audit trail in `admin_audit_logs`.

### 12.2 Caller Inventory & Scope Check
- A comprehensive repository scan confirmed **zero frontend or client callers** for `/api/admin/listings/draft/:id/approve`:
  - `HostForm.tsx` saves drafts via `/api/listings/draft` and creates listings via `/api/listings`.
  - `AdminDashboard.tsx` uses the canonical status transition endpoint `/api/admin/listings/:id/status`.
  - No mobile or third-party client calls this route.
- The route was a dangerous vestigial backdoor from early development that was never decommissioned.

### 12.3 Strangler Containment Design
- Fail-close the legacy route immediately with **HTTP 410 Gone**:
  - Response body:
    ```json
    {
      "error": "Legacy draft approval endpoint has been permanently retired and quarantined (HTTP 410 Gone). Direct replay of unversioned drafts into published listings is prohibited. Use the canonical admin status review workflow (/api/admin/listings/:id/status).",
      "code": "LEGACY_DRAFT_APPROVAL_ENDPOINT_DEPRECATED_AND_QUARANTINED",
      "status": "quarantined"
    }
    ```
  - Executed before acquiring any database client or executing any queries.
  - Returns HTTP 410 for all principals (guest, host, admin).
  - No environment flag or bypass toggle is provided.
  - The canonical admin review route `PATCH /api/admin/listings/:id/status` remains the sole, supported status modification route.

### 12.4 Safety Boundaries & Architectural Non-Claims
- **Quarantine Safety Only:** Quarantining this legacy route eliminates a severe unauthenticated writer backdoor.
- **NO Successor Approval Claim:** Quarantining this route **DOES NOT** deliver a versioned successor approval mechanism or close the open architectural need for successor revisions.
- **Status of Track:** R3-01 remains **UNACCEPTED / IN PROGRESS** (0/32 corrective cards accepted, 0/48 packages reaccepted, ~55% provisional planning judgment preserved).

### 12.5 Targeted Tests & Verified Evidence
1. **Failing-Before Repro:** Proven on disposable PostgreSQL test mount:
   ```text
   AssertionError: expected 200 to be 410 // Object.is equality (- 410, + 200)
     at <repository-root>/src/test/harvo/r3_01_post_publication_writer_repro.test.ts:2962:33
   ```
   Proved that an unprivileged foreign guest calling `POST /api/admin/listings/draft/:id/approve` succeeded with HTTP 200, replaying draft data into published listing 8950, zeroing price to 0 and city to `'Berlin'` with zero row locks or audit logging.
2. **Post-Fix Verification (68/68 Passed):**
   - Foreign guest token denied with HTTP 410 Gone, code `LEGACY_DRAFT_APPROVAL_ENDPOINT_DEPRECATED_AND_QUARANTINED`, status `'quarantined'`.
   - Host token denied with HTTP 410 Gone, code `LEGACY_DRAFT_APPROVAL_ENDPOINT_DEPRECATED_AND_QUARANTINED`, status `'quarantined'`.
   - Admin token denied with HTTP 410 Gone, code `LEGACY_DRAFT_APPROVAL_ENDPOINT_DEPRECATED_AND_QUARANTINED`, status `'quarantined'` (preventing unversioned direct draft replay).
   - Unauthenticated request rejected with HTTP 401 Unauthorized.
   - Deep database immutability verified: zero writes to `listings`, `listings_drafts`, `room_types`, `media_assets`, and `admin_audit_logs`.

### 12.6 Rollback Strategy
- Revert the quarantined handler block in `server.ts` via hunk-level patch.
- Preserve all existing dirty working tree files.

### 12.7 Architectural Non-Claims & R3-01 Status
- **Containment Scope:** Quarantining this legacy route permanently eliminates an unauthenticated writer backdoor without breaking any active frontend workflows.
- **NO Successor Approval Claim:** Quarantining this route **DOES NOT** deliver a versioned successor approval mechanism or close the open architectural need for successor revisions.
- **Controlling Status:** R3-01 remains **UNACCEPTED / IN PROGRESS** (0/32 corrective cards accepted, 0/48 packages reaccepted, ~55% provisional planning judgment preserved).

---

## 13. Impact Note: Rental Mode Writer (`PUT /api/listings/:id/mode`) P0 Containment

**Date:** 2026-10-02
**Task:** P0 containment of the rental mode writer (`PUT /api/listings/:id/mode`) in `server.ts` against published/unlisted fact alteration, unverified JWT trust, arbitrary input values, unlocked standalone writes, and broadcast before commit.

### 13.1 Source of Truth
- Relational table `listings` (`rental_mode`, `publication_status`, `user_id`) is the authoritative source of truth.
- A single PostgreSQL client is acquired for the entire request lifecycle and held in an explicit transaction (`BEGIN` ... `COMMIT` / `ROLLBACK`).
- Exclusive row locking (`SELECT id, user_id, publication_status, rental_mode FROM listings WHERE id = $1 FOR UPDATE`) guarantees serial execution and prevents race conditions with concurrent publication status changes or moderation updates.

### 13.2 Affected Route, Tables, and UI
- **Route (`server.ts`):** `PUT /api/listings/:id/mode`.
- **Tables Affected:** `listings`, `users` (persisted reauthorization).
- **UI (`components/AdminDashboard.tsx`):** `handleEditRentalMode`.

### 13.3 Core Defects in Unpatched Route
1. **Deceptive Demo Bypass:** Non-numeric IDs returned HTTP 200 with `{ id: req.params.id, message: "Demo listing preserved" }`.
2. **Weak JWT Authorization:** Unlocked query checked `authCheck.rows[0].user_id !== req.user?.id && req.user?.role !== 'admin'`, trusting JWT claim without verifying persisted `users.is_active` or current `users.role` on the database.
3. **Arbitrary Mode String:** Allowed any arbitrary string (e.g. `'bogus'`, `'malicious'`) without enum schema validation.
4. **Unlocked Read & Standalone Write:** Performed unlocked read followed by standalone `pool.query('UPDATE listings SET rental_mode = $1 WHERE id = $2')`.
5. **Publication Containment Bypass:** Mutated `rental_mode` on `published` and `unlisted` listings without locking or publication validation, altering accepted commercial and booking authority post-publication.
6. **Premature Broadcast:** Broadcasted DB event via `broadcastDbEvent(req, 'listing')` before ensuring transaction durability.

### 13.4 Repaired Architecture & Boundaries
1. **Positive Safe INT4 Validation:** `req.params.id` validated against `/^[1-9]\d*$/` and `MAX_INT4 (2147483647)`. Non-numeric or out-of-range IDs rejected with HTTP 400.
2. **Strict Zod Enum Boundary:** Validates request body with `z.object({ rentalMode: z.enum(['entire_place', 'private_rooms', 'hybrid']) }).strict()`. Invalid enum values, missing fields, or unexpected properties rejected with HTTP 400.
3. **Single Held Client & Transaction:** Connection acquired via `pool.connect()` and held in `BEGIN` ... `COMMIT` / `ROLLBACK`.
4. **Parent Row Locking:** `SELECT id, user_id, publication_status, rental_mode FROM listings WHERE id = $1 FOR UPDATE`.
5. **Persisted Actor Reauthorization:** `SELECT id, role, is_active FROM users WHERE id = $1` on held client. Requires `is_active === true`. Fails closed on missing column/schema readiness (503), missing user (401), or deactivated/downgraded/foreign users (403).
6. **Draft-Only Mutation & Refusal on Accepted Authority:**
   - If `listing.publication_status !== 'draft'`, aborts with HTTP 422:
     `Cannot modify rental_mode on a ${listing.publication_status} listing: modification would alter verified listing and booking authority. Direct modification of published or unlisted listings is prohibited; submit a reviewed successor revision.`
   - Mutates `rental_mode` only on `draft` listings within the held transaction.
7. **Post-Commit Broadcast:** `broadcastDbEvent(req, 'listing')` invoked strictly after successful `COMMIT`.
8. **UI Error Actionability (`AdminDashboard.tsx`):** `handleEditRentalMode` extracts server error message (`data?.error || data?.message`) on non-2xx status and alerts it truthfully without assuming local success.

### 13.5 Targeted Tests & Verified Evidence
1. **Failing-Before Repro:** Proven on disposable PostgreSQL test mount:
   ```text
   AssertionError: expected 200 to be 422 // Object.is equality (- 422, + 200)
     at <repository-root>/src/test/harvo/r3_01_post_publication_writer_repro.test.ts:3153:26
   ```
   Proved that an unpatched host call to `PUT /api/listings/:id/mode` succeeded with HTTP 200 on an accepted published listing, mutating `rental_mode` without parent row locks, publication validation, or transaction bounds.
2. **Post-Fix Verification (77/77 Passed):**
   - Published listing edit refused with HTTP 422 and actionable message; DB row strictly unchanged.
   - Unlisted listing edit refused with HTTP 422 and actionable message; DB row strictly unchanged.
   - Draft listing edit succeeds with HTTP 200 for owner and admin, persisting `rental_mode` to DB.
   - Positive integer INT4 parameter boundary: `/demo` (eliminating demo bypass), negative, zero, float, overflow all rejected with HTTP 400.
   - Payload validation: arbitrary enum string (`'bogus'`), missing body, extra properties rejected with HTTP 400.
   - Actor reauthorization: unauthenticated (401), foreign user (403), deactivated account (403), downgraded staff (403).
   - Concurrency serialization: two-connection lock-wait test proves competing mode PUT blocks on parent row lock during publication transition, unblocks post-commit, reads `published`, and aborts with HTTP 422 with zero mutations.
   - Database immutability: zero row modifications across `listings` and zero writes to `admin_audit_logs` on rejected mutations.

### 13.6 Rollback Strategy
- Revert the `PUT /api/listings/:id/mode` handler in `server.ts` and `handleEditRentalMode` in `components/AdminDashboard.tsx` via hunk-level patch.
- Preserve existing dirty working tree files.

### 13.7 Open Architectural Gaps & Non-Claims
- **Containment Scope:** `PUT /api/listings/:id/mode` is strictly contained to draft-only under parent exclusive row lock with post-commit event broadcast.
- **NO Successor Approval Claim:** Mode containment does **not** implement successor review workflow for published listings. Successor revision mechanism remains an open P0 architectural requirement.
- **Status of Track:** R3-01 remains **UNACCEPTED / IN PROGRESS** (0/32 corrective cards accepted, 0/48 packages reaccepted, ~55% provisional planning judgment preserved).
