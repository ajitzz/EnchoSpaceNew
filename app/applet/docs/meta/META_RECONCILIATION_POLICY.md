# META RECONCILIATION POLICY SPECIFICATION

**Document ID:** `META_RECONCILIATION_POLICY.md`  
**Date:** 2026-08-10  
**Status:** AUTHORITATIVE SPECIFICATION  
**Target:** Automated Meta Reconciliation Engine  

---

## 1. RECONCILIATION SCENARIOS & RESOLUTIONS

| Local Status | Meta Live Status | Discrepancy Cause | Reconciliation Resolution |
| :--- | :--- | :--- | :--- |
| `PRECHECK_RUNNING` / `PUBLISHING` (`updated_at` > 5 mins) | All 4 Objects Live & Verified | Worker crashed after dispatch completed | Bind IDs to DB, set status to `SUCCESS` and campaign status to `CAMPAIGN_LIVE`. |
| `PRECHECK_RUNNING` / `PUBLISHING` (`updated_at` > 5 mins) | Partially Created Objects | Worker crashed mid-dispatch | Execute reverse rollback (or Quarantine), set transaction status to `ROLLBACK_SUCCESS` or `ROLLBACK_FAILED`, set campaign status to `failed_publish`. |
| `PRECHECK_RUNNING` / `PUBLISHING` (`updated_at` > 5 mins) | No Objects on Meta | Worker crashed before creation | Reset transaction status to `FAILED_PUBLISH` allowing host/admin to re-trigger. |
| `EXTERNAL_OUTCOME_UNKNOWN` | Object Exists on Meta | Network timeout during POST response | Attach Meta Object ID to transaction, resume delivery pipeline. |
| `EXTERNAL_OUTCOME_UNKNOWN` | Object Missing on Meta | POST failed before reaching Meta | Retry creation POST request. |
| `ROLLBACK_FAILED` | Objects PAUSED on Meta | Hard DELETE rejected by Graph API | Confirm objects are `PAUSED` (Quarantined), mark transaction `ROLLBACK_SUCCESS`, notify admin. |

---

## 2. AUTOMATED RECONCILIATION WORKER

The system runs `runMetaReconciliationEngine` as a periodic background background job or on-demand admin action:
1. Queries `meta_publishing_transactions` where `updated_at < NOW() - INTERVAL '5 minutes'` or `publish_status IN ('PARTIALLY_CREATED', 'EXTERNAL_OUTCOME_UNKNOWN', 'ROLLBACK_FAILED')`.
2. Inspects live Meta Graph API objects using `metaGraphClient`.
3. Applies authoritative resolution rules above.
4. Logs full audit trace in `meta_api_traces` and `admin_audit_logs`.
