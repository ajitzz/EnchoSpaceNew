# R3-01 Publication TOCTOU Race Condition — Reproduction & Defect Report

**Date:** 2026-10-02
**Work Package:** R3-01 (Establish canonical room-offer versions across three surfaces / publication authority)
**Task:** Controlled validate-then-update TOCTOU reproduction and bounded route repair against mounted production route
**Repository State:** HEAD `6ec5b6602ab8e9c2cb4776ba5d178ae923876710` (with dirty worktree preserved)
**Test Suite File:** `src/test/harvo/r3_01_publication_toctou_repro.test.ts`
**Execution Command:** `node scripts/testing/run.mjs src/test/harvo/r3_01_publication_toctou_repro.test.ts`
**Test Exit Code:** `1` before repair (preserved below); `0` after bounded route repair (3/3 tests, independently rerun by Codex)

**Evidence labels:** All database and HTTP evidence in this file is local disposable PostgreSQL and a mounted local Express app. It is not staging, provider, legal, pilot, or production evidence. Sections 1–4 preserve the failing-before analysis and proposed broader design; the current result and scope are recorded in Section 6.

---

## 1. Executive Summary

This deliverable provides an end-to-end, deterministic failing-before reproduction of the **validate-then-update Time-of-Check to Time-of-Use (TOCTOU)** race condition in `PATCH /api/admin/listings/:id/status`.

The reproduction:
- Mounts the **actual imported production Express application** (`app` from `server.ts`) via Supertest.
- Executes against a **real disposable PostgreSQL cluster** (`createLocalPostgresFixture`) communicating through a local loopback proxy matching `src/test/isolation.ts` socket rules.
- Exercises **two independent database connections** (`connA` and `connB`) alongside the application's connection pool.
- Uses `pg_stat_activity` inspection (`state = 'active' AND wait_event_type = 'Lock'`) to verify that the production route has completed room/media validation and is actively blocked on the listing row lock before the competing writer intervenes.
- Proves both failure modes mandated by PROPOSED-007:
  1. **Case 1:** A listing is successfully published with `< 3` approved room photos.
  2. **Case 2:** A listing is successfully published with `0` sleeping-area photos.
- Fails strictly on the invariant assertion (`expect(postValidation.valid).toBe(true)` -> `received: false`), confirming that the failure is a genuine invariant defect and not a harness timeout or connection crash.

---

## 2. Root Cause Analysis: Validate-then-Update TOCTOU

### 2.1 The Vulnerability in `PATCH /api/admin/listings/:id/status`
In `server.ts` (lines 4168–4206):

```typescript
// 1. Validation Phase (Un-locked ambient pool queries)
if (publication_status === 'published') {
  const validation = await validatePropertyPublication(listingId, pool);
  if (!validation.valid) {
    return res.status(422).json({ ... });
  }
}

// 2. Race Window: Any concurrent transaction modifying room_types or media_assets
// can commit here without conflict!

// 3. Execution Phase (Un-locked pool update)
await pool.query('UPDATE listings SET publication_status = $1 WHERE id = $2', [publication_status, listingId]);
```

Inside `validatePropertyPublication(listingId, pool)` (lines 312–380):
- Executes `SELECT id, name FROM room_types WHERE listing_id = $1` without locks.
- Executes `SELECT room_type_id, moderation_status, is_sleeping_area FROM media_assets WHERE entity_type = 'listing' AND entity_id = $1` without locks.
- Validation runs outside any database transaction.

### 2.2 Competing Writers & Absent Concurrency Controls

| Route / Service | Code Location | Locks Acquired | Absent Locks & Defect |
|---|---|---|---|
| `PATCH /api/admin/listings/:id/status` | `server.ts:4168` | None | No transaction boundary; does not lock `listings` (`FOR UPDATE`) before validation; does not lock related `room_types` or `media_assets`. |
| `moderateMediaAsset` | `mediaModerationService.ts:81` | `media_assets FOR UPDATE` | Acquires lock on `media_assets` only. Does **not** acquire a lock on the parent `listings` row; does not check listing publication status. Can reject an approved photo while publication validation is in-flight. |
| `PUT /api/listings/:id/rooms` | `server.ts:4209` | None on `listings` | Deletes and recreates `room_types` within transaction, but does **not** lock `listings` (`FOR UPDATE`). Cascading deletes or unlinking of `media_assets.room_type_id` can invalidate media requirements concurrently. |
| `PUT /api/listings/:id` | `server.ts:4136` | None | Re-runs `validatePropertyPublication` without locks, then updates `publication_status`. Suffers identical TOCTOU window as PATCH. |

---

## 3. Reproduction Test Design & Execution

### 3.1 Interleaving Sequence

```
Connection A (Harness Lock)   Production Route (PATCH :id/status)     Connection B (Competing Writer)
---------------------------   -----------------------------------     -------------------------------
1. BEGIN;
2. SELECT * FROM listings
   WHERE id = 801 FOR UPDATE;
                              3. Dispatches PATCH /api/admin/listings/801/status
                              4. validatePropertyPublication(801, pool)
                                 -> Queries room_types (sees 1 room)
                                 -> Queries media_assets (sees 3 approved photos)
                                 -> validation.valid = true
                              5. UPDATE listings SET publication_status = 'published'
                                 -> BLOCKS waiting on Connection A's row lock!
6. Polls pg_stat_activity:
   confirms route is blocked
   (wait_event_type = 'Lock')
                                                                      7. BEGIN;
                                                                      8. UPDATE media_assets
                                                                         SET moderation_status = 'rejected'
                                                                         WHERE id = 8003;
                                                                      9. COMMIT;
                                                                         (Database now has only 2 approved photos)
10. COMMIT (releases lock);
                              11. UPDATE proceeds & finishes!
                              12. Returns HTTP 200 { publication_status: 'published' }
13. Invariant check:
    SELECT publication_status FROM listings -> 'published'
    validatePropertyPublication(801, pool)   -> valid: false
    ASSERTION FAILS: expected false to be true
```

### 3.2 Test Output & Execution Evidence

```
$ node scripts/testing/run.mjs src/test/harvo/r3_01_publication_toctou_repro.test.ts

 ❯ |marketing| src/test/harvo/r3_01_publication_toctou_repro.test.ts (2 tests | 2 failed) 3214ms
   ❯ R3-01 Publication TOCTOU Reproduction — Mounted Route & Real PG Interleaving (2)
     × proves validate-then-update TOCTOU on mounted PATCH /api/admin/listings/:id/status leaving published listing with < 3 approved room photos 94ms
     × proves validate-then-update TOCTOU on mounted PATCH /api/admin/listings/:id/status leaving published listing with 0 sleeping-area photos 59ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  |marketing| src/test/harvo/r3_01_publication_toctou_repro.test.ts > R3-01 Publication TOCTOU Reproduction — Mounted Route & Real PG Interleaving > proves validate-then-update TOCTOU on mounted PATCH /api/admin/listings/:id/status leaving published listing with < 3 approved room photos
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/test/harvo/r3_01_publication_toctou_repro.test.ts:234:36
    232|       const postValidation = await validatePropertyPublication(listingId, pool);
    233|       // FAILS: Under unpatched production code, the listing was published despite having only 2 approved photos!
    234|       expect(postValidation.valid).toBe(true);
       |                                    ^
    235|       expect(postValidation.roomSummaries[0].approvedPhotosCount).toBeGreaterThanOrEqual(3);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |marketing| src/test/harvo/r3_01_publication_toctou_repro.test.ts > R3-01 Publication TOCTOU Reproduction — Mounted Route & Real PG Interleaving > proves validate-then-update TOCTOU on mounted PATCH /api/admin/listings/:id/status leaving published listing with 0 sleeping-area photos
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/test/harvo/r3_01_publication_toctou_repro.test.ts:328:36
    226|       const postValidation = await validatePropertyPublication(listingId, pool);
    227|       // FAILS: Under unpatched production code, the listing was published with 0 sleeping-area photos!
    228|       expect(postValidation.valid).toBe(true);
       |                                    ^
    229|       expect(postValidation.roomSummaries[0].sleepingAreaPhotosCount).toBeGreaterThanOrEqual(1);

Test Files  1 failed (1)
Tests       2 failed (2)
Duration    3.42s
Exit Code   1
```

---

## 4. Proposed Lock-Order & Rollback Design for Codex Review

To eliminate the TOCTOU race without deadlocks or performance regressions, the following transactional pattern is proposed for the upcoming production patch:

### 4.1 Strict Lock Hierarchy (Prevent Deadlocks)
To avoid deadlocks between publication validation, media moderation, and room updates, all writers MUST acquire locks in consistent hierarchical order:

1. **Level 1 — Listing Parent Row:**
   - Always lock `listings` first:
     ```sql
     SELECT id, user_id, publication_status FROM listings WHERE id = $1 FOR UPDATE;
     ```
2. **Level 2 — Room Types:**
   - When modifying or validating room types:
     ```sql
     SELECT id FROM room_types WHERE listing_id = $1 ORDER BY id FOR SHARE; -- (or FOR UPDATE if modifying)
     ```
3. **Level 3 — Media Assets:**
   - When modifying or validating media assets:
     ```sql
     SELECT id, moderation_status, is_sleeping_area FROM media_assets
     WHERE entity_type = 'listing' AND entity_id = $1 ORDER BY id FOR SHARE; -- (or FOR UPDATE in media moderation)
     ```

### 4.2 Transactional Publication Mutation
In `PATCH /api/admin/listings/:id/status` (and `PUT /api/listings/:id`):
```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');

  // 1. Lock the listing row exclusively. All competing writers on this listing will block.
  const listingRes = await client.query(
    'SELECT user_id, title, publication_status FROM listings WHERE id = $1 FOR UPDATE',
    [listingId]
  );
  if (listingRes.rows.length === 0) {
    await client.query('ROLLBACK');
    return res.status(404).json({ error: 'Listing not found' });
  }

  // 2. Validate on the EXACT SAME client connection within the transaction
  if (publication_status === 'published') {
    const validation = await validatePropertyPublication(listingId, client);
    if (!validation.valid) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: 'Cannot publish listing: Failed room and media authority requirements (PROPOSED-007).',
        details: validation.errors,
        roomSummaries: validation.roomSummaries
      });
    }
  }

  // 3. Perform the update while holding the lock
  await client.query(
    'UPDATE listings SET publication_status = $1 WHERE id = $2',
    [publication_status, listingId]
  );

  // 4. Audit log write within the same transaction (atomic with status update)
  await client.query(
    `INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state)
     VALUES ($1, 'listing', $2, 'PUBLICATION_STATUS_CHANGE', $3, $4)`,
    [req.user.id, listingId, JSON.stringify({ publication_status: listingRes.rows[0].publication_status }), JSON.stringify({ publication_status })]
  );

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

### 4.3 Competing Writer Alignment (`moderateMediaAsset`)
In `src/server/media/mediaModerationService.ts`:
- When moderating an asset belonging to an entity of type `'listing'`:
  Acquire a lock on the parent listing row (e.g. `SELECT id, publication_status FROM listings WHERE id = $listingId FOR UPDATE` or `FOR SHARE`) **before** locking and updating `media_assets`.
- If the listing is already published and an approved photo is rejected (or sleeping area flag removed) such that PROPOSED-007 would be violated:
  Either atomically unpublish the listing (revert to `draft` with audit log), or block moderation until admin acknowledges unpublishing.

---

## 5. Status & Next Actions

- **Current Status:** R3-01 TOCTOU defect is fully and deterministically reproduced on the real route without synthetic mocks or cloned handlers.
- **Card State:** R3-01 remains `PLANNED` / unaccepted (reproduction only; production fix pending).
- **Next Step:** Submit handoff report and test log to Codex for design approval of the lock-order pattern before implementing the production patch.

## 6. Bounded route repair and independent follow-up (2 October 2026)

Antigravity subsequently changed only the mounted `PATCH /api/admin/listings/:id/status` route: a held PostgreSQL connection begins a transaction, locks the listing row before checking owner/admin authority and room/media facts, validates on that same connection, updates status, commits, and rolls back on early failures. The real-route test now waits for the route's `SELECT ... FOR UPDATE` lock, commits an independent media mutation, then asserts HTTP 422 and a persisted draft listing. A third case checks rollback and lock release. Codex independently ran `node scripts/testing/run.mjs src/test/harvo/r3_01_publication_toctou_repro.test.ts`: exit 0, **3/3**. The failing-before log remains at `/tmp/encho_r3_01_repro_20261002.log` on this machine; that temporary path is not a durable release artifact.

Adjacent independent runs passed `admin_media_review_desk.test.ts` **9/9**, `m3_room_media_authority.test.ts` **28/28**, and `admin_media_moderation_service_pg.test.ts` **10/10**. `npx tsc --noEmit`, scoped ESLint of the route/test, and `git diff --check` exited 0 after a comment-only empty-catch lint cleanup. No full regression, deployed role test, browser journey, or migration apply was run for this patch.

**Remaining defect boundary:** A direct or application media/room writer can still change facts after this status transaction commits. The host listing update path performs its own validate-then-update; room management and media moderation do not yet share a parent-first publication lock and post-change invariant policy. Thus the route race is repaired, but R3-01's canonical published offer/version guarantee is **not accepted**. The current route also has no new atomic publication audit entry; the before-repair proposed audit SQL in Section 4 is a design proposal, not delivered code. Do not promote this local result to production or paid-pilot clearance.
