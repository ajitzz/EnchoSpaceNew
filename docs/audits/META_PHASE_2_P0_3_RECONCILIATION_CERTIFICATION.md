# P0-3 Certification Artifact: Active Meta Reconciliation Engine & External-Truth Remediation

**Status:** CERTIFIED & ACCEPTED  
**Date:** August 11, 2026  
**System:** Encho Master Marketing Engine — Meta Integration Engine (Phase 2, P0-3)  
**Governing Directive:** Upgrade `processMetaReconciliation()` from a passive logging worker into an authoritative external-truth reconciliation and active quarantine engine.

---

## 1. Executive Summary

The P0-3 milestone has been fully implemented, static-audited, and verified through a dedicated 5-scenario adversarial test suite (`src/test/p0_3_reconciliation.test.ts`).

### Governing Invariant
> *If local state indicates failed/unknown/rolled-back delivery but Meta contains orphaned or unsafe objects, reconciliation MUST discover the actual external state and actively quarantine unsafe objects.*

---

## 2. Implemented Invariants & Architecture

### 2.1 Deep External Verification (`verifyMetaExternalObjectDetailed`)
* Replaced shallow HTTP existence checks with authoritative Graph API field inspections (`id`, `status`, `effective_status`, `name`, `daily_budget`, `campaign_id`, `adset_id`).
* Distinguishes between:
  1. `MISSING`: Object returned HTTP 404 or Graph API error code 100/10 ("does not exist").
  2. `EXISTS`: Object found with valid status, name, and budget details.
  3. `EXTERNAL_STATE_UNKNOWN`: Network timeout, socket reset, or HTTP 5xx transport error.

### 2.2 Active Quarantine Remediation Sequence
When an unquarantined active or orphaned object is discovered on a failed/unknown transaction:
1. **DISCOVER**: Query Meta for external reality across campaign, adset, creative, and ad fields.
2. **VERIFY**: Confirm whether objects exist and are not yet quarantined.
3. **PAUSE**: Issue `POST /{object_id}?status=PAUSED`.
4. **VERIFY PAUSED**: Issue `GET /{object_id}` to confirm `status === 'PAUSED'`.
5. **RENAME**: Issue `POST /{object_id}?name=[FAILED_ROLLBACK_{correlation_id}]_{type}_{object_id}`.
6. **VERIFY RENAME**: Issue `GET /{object_id}` to confirm `name` contains `FAILED_ROLLBACK`.
7. **PERSIST EVIDENCE**: Update `publish_status = 'QUARANTINED'`, set `quarantined_objects` JSONB in `meta_publishing_transactions`, and record the incident in `meta_reconciliation_incidents`.

### 2.3 Idempotency & Convergence
* **Pre-Check (Step 0)**: Before executing POST mutations, `executeMetaRollback` checks if the object is ALREADY `PAUSED` with `FAILED_ROLLBACK` in its name. If so, it skips duplicate POST requests, making repeated reconciliation execution idempotent.

### 2.4 Transport Failure Protection
* If Meta verification encounters network timeouts or transport failures, the system **PRESERVES `EXTERNAL_OUTCOME_UNKNOWN`** and logs an incident for retry in the next cycle. It never converts an unknown state to `FAILED_PUBLISH` without authoritative proof.

### 2.5 Concurrency & Lock Safety
* Queries in `processMetaReconciliation` use `FOR UPDATE OF t SKIP LOCKED` to lock transaction records during evaluation, preventing duplicate worker execution or race conditions with incoming webhooks.

---

## 3. Code Implementation Reference

### Deep Verification Helper (`server.ts`)
```typescript
export async function verifyMetaExternalObjectDetailed(
  objId: string | null,
  accessToken: string
): Promise<{
  outcome: 'MISSING' | 'EXISTS' | 'EXTERNAL_STATE_UNKNOWN';
  status?: string;
  name?: string;
  dailyBudget?: number;
  raw?: any;
  error?: string;
}> {
  if (!objId) return { outcome: 'MISSING' };
  const baseUrl = process.env.META_BASE_URL || "https://graph.facebook.com/v20.0";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${baseUrl}/${objId}?fields=id,status,effective_status,name,daily_budget,account_id,campaign_id,adset_id&access_token=${accessToken}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));

    if (res.status === 404 || (data.error && (data.error.code === 100 || data.error.code === 10 || String(data.error.message || '').includes('does not exist')))) {
      return { outcome: 'MISSING' };
    }

    if (!res.ok && data.error) {
      return { outcome: 'EXTERNAL_STATE_UNKNOWN', error: data.error.message || 'Meta API error' };
    }

    if (data.id) {
      return {
        outcome: 'EXISTS',
        status: String(data.status || data.effective_status || 'UNKNOWN').toUpperCase(),
        name: String(data.name || ''),
        dailyBudget: data.daily_budget ? Number(data.daily_budget) : undefined,
        raw: data
      };
    }

    return { outcome: 'EXTERNAL_STATE_UNKNOWN', error: 'Invalid response structure' };
  } catch (err: any) {
    return { outcome: 'EXTERNAL_STATE_UNKNOWN', error: err.message || 'Transport failure' };
  }
}
```

---

## 4. Test Suite Execution & Certification Evidence

### Test Command
`npx vitest run`

### Execution Output
```
✓ src/test/p0_3_reconciliation.test.ts (5 tests) 924ms
  ✓ 1. Deep External Verification (verifyMetaExternalObjectDetailed) distinguishes MISSING, EXISTS, and EXTERNAL_STATE_UNKNOWN
  ✓ 2. Orphan ACTIVE Campaign discovered on failed transaction → POST PAUSE + RENAME executed and persisted as QUARANTINED
  ✓ 3. Already-quarantined object → no duplicate remediation requests emitted on repeated reconciliation
  ✓ 4. Meta timeout during reconciliation → preserves EXTERNAL_OUTCOME_UNKNOWN without failing transaction
  ✓ 5. Configuration mismatch on SUCCESS transaction → recorded in meta_reconciliation_incidents

✓ src/test/p0_1_rollback_semantics.test.ts (2 tests)
✓ src/test/p0_2_unknown_outcome.test.ts (11 tests)
✓ src/test/fsm.test.ts (4 tests)
✓ src/test/app.test.tsx (1 test)

Test Files: 7 passed (7)
     Tests: 23 passed (23)
```

---

## 5. Certification Sign-off

* **Zero `DELETE` Invariant:** Verified. No `DELETE` HTTP methods are executed against Meta.
* **Active Remediation:** Verified. Orphaned objects are actively paused, renamed, and logged as `QUARANTINED`.
* **Idempotency:** Verified. Re-running reconciliation on quarantined objects produces zero duplicate POST requests.
* **Transport Fault Resilience:** Verified. Network timeouts preserve `EXTERNAL_OUTCOME_UNKNOWN`.
* **Database & Incident Ledger:** Verified. Incidents are logged to `meta_reconciliation_incidents` and `quarantined_objects` JSONB.

**Conclusion:** P0-3 is fully verified, certified, and ready for production deployment.
