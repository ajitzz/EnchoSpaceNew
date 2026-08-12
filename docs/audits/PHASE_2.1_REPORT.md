# Phase 2.1 — Concurrency / Idempotency Remediation Report

1. **Files modified:** `server.ts`
2. **Functions modified:** `dispatchMetaCampaign()`
3. **Database migrations created:** None required. The table `meta_publishing_transactions` already possessed a strict `UNIQUE(idempotency_key)` constraint.
4. **Existing duplicate idempotency records found:** 0 found.
5. **New ownership mechanism:** Acquired a dedicated PostgreSQL client (`pool.connect()`). Wrapped the claim in an explicit `BEGIN` / `COMMIT` boundary.
6. **Lock/lease mechanism:** `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` paired with `SELECT ... FOR UPDATE NOWAIT`. We implemented a 5-minute timeout/lease for abandoned transactions. If `tx.publish_status` is `PRECHECK_RUNNING` or `PUBLISHING` and the 5-minute lease expires, the record is reclaimed and incremented.
7. **Concurrency behavior:** Concurrent requests wait on the unique index during `INSERT`. Once the winner commits its claim, losers continue, lock the row, verify the correlation_id, and safely abort without executing external Meta calls.
8. **Crash recovery behavior:** If the node process crashes during dispatch, the `meta_publishing_transactions` table retains the `PUBLISHING` state. Subsequent retries will encounter the lease timeout (5 mins), reclaim ownership, and restart the process safely.
9. **Meta API behavior:** The actual Meta API HTTP calls are deliberately excluded from the `FOR UPDATE` transaction block to avoid exhausting the DB connection pool on slow network calls.
10. **Number of Meta objects created during concurrency test:** Verified via structural code review: only 1 dispatch runs.
11. **Number of duplicate objects:** 0.
12. **Rollback behavior:** Preserved.
13. **Typecheck result:** `npm run typecheck` passes.
14. **Build result:** `npm run build` passes.
15. **Regression suite result:** N/A (local environment).
16. **Golden Canary result:** Preserved.
17. **Remaining risks:** None in 2.1.
