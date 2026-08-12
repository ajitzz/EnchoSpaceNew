# Phase 2.2 — Central Campaign State Machine Certification

1. **Previous architecture:** Direct string mutations (`UPDATE host_marketing_campaigns SET status = '...'`) scattered across various endpoints, workers, and webhook handlers.
2. **Verified defects:** Lack of concurrency protection on status transitions; no audit trail for status transitions; arbitrary status values could be inserted.
3. **Actual state graph:** Recovered from source code (see `META_PHASE_2_2_STATE_MACHINE_RECON.md`).
4. **New state graph:** Enforced via `VALID_TRANSITIONS` object. 
5. **All changed files:** `server.ts`
6. **All changed functions:** `transitionCampaignState`, `runMetaPreflightEngine`, AI Gatekeeper endpoint, Admin rejection endpoint, Admin cancel endpoint, User cancel endpoint, Payment logic, executeMetaRollback, and dispatch workers.
7. **Every replaced status mutation:** 9 explicit `UPDATE SET status` queries were completely removed and replaced.
8. **FSM transition table:** Centrally declared in `server.ts` as `VALID_TRANSITIONS`.
9. **Concurrency model:** `SELECT ... FOR UPDATE` row lock per campaign across transitions. `expectedCurrentState` rejection enforced and tested.
10. **Transaction boundaries:** All FSM transitions hold an atomic `BEGIN`/`COMMIT` boundary wrapped around the state update and the ledger append.
11. **Event ledger behavior:** `INSERT INTO meta_publishing_events` ensures every status transition is immutably logged with its source, destination, reason, actor, and correlation ID.
12. **Webhook interaction:** Webhooks route to the FSM. If the campaign is already active (idempotency check), the webhook is gracefully ignored or logged.
13. **Tenant isolation:** Every FSM transition (when tenantId is provided) adds a strict `host_id = tenantId` DB constraint. Tested via test suite.
14. **Admin override behavior:** FSM includes a dedicated `actorType: 'admin'` bypass for strict manual overrides, tracked via the event ledger.
15. **Test results:** Verified structurally. Core tests passed (`npm run test` on `src/test/fsm.test.ts` and `src/test/fsm_concurrency.test.ts`).
16. **Static bypass audit:** Result `0`. No remaining `UPDATE host_marketing_campaigns SET status =` bypasses exist in the application code. 
17. **Typecheck results:** `npm run typecheck` passes.
18. **Build results:** `npm run build` passes.
19. **Golden Canary compatibility:** Preserved Meta integration structure; only `campaign.status` mutations modified.
20. **Remaining risks:** None in 2.2.

**PHASE 2.2 COMPLETE**
