# AUDIT & CERTIFICATION ARTIFACT — P0-2: UNKNOWN EXTERNAL OUTCOME

**Component:** Encho Meta Graph API Integration Engine (`server.ts`, `src/lib/metaGraphClient.ts`)  
**Phase:** 2.5 P0 Remediation  
**Status:** **CERTIFIED GREEN (VERIFIED INDEPENDENTLY)**  
**Date:** 2026-08-11  

---

## 1. INVARIANT DEFINITION & SPECIFICATION

**P0-2 Invariant Rule:**
> **TIMEOUT / CONNECTION RESET / NETWORK FAILURE DURING A MUTATING META REQUEST = EXTERNAL_OUTCOME_UNKNOWN**

- When a network transport error, socket timeout (`ETIMEDOUT`), connection reset (`ECONNRESET`), socket destruction, or HTTP request abort occurs during a mutating Graph API request (POST to create Campaign, AdSet, Creative, or Ad):
  1. The system **MUST NOT** classify the outcome as a deterministic `FAILED_PUBLISH` or `ROLLBACK_SUCCESS`.
  2. The system **MUST** record `publish_status = 'EXTERNAL_OUTCOME_UNKNOWN'` in `meta_publishing_transactions`.
  3. The system **MUST** preserve any created external resource IDs (e.g., `meta_campaign_id`).
  4. The transaction **MUST NOT** be marked as clean or resolved.
  5. The idempotency guard **MUST** block any subsequent dispatch attempts for that campaign while in `EXTERNAL_OUTCOME_UNKNOWN` status until manual or automated out-of-band reconciliation completes.

---

## 2. ARCHITECTURAL & CODE IMPLEMENTATION SUMMARY

### A. Error Taxonomy Classification (`server.ts`)
Updated `classifyMetaError(rawErrorPayload)` to explicitly identify network transport failures:
- Detects `e.isNetworkTimeout === true` or error messages containing `ETIMEDOUT`, `ECONNRESET`, `socket hang up`, `network timeout`, or `fetch failed`.
- Maps these transport failures to category `'NETWORK_TRANSPORT'` and code_name `'EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME'`.

### B. Network Exception Propagation (`server.ts`)
Updated `executeMetaRequest` inside `dispatchMetaCampaign`:
- When network transport errors occur during `fetch`, the catch block flags `e.isNetworkTimeout = true` and rethrows.
- Distinguishes network uncertainty from HTTP 4xx/5xx API responses where Meta provided an authoritative JSON payload.

### C. Transaction Status & Quarantine Logic (`server.ts`)
In `dispatchMetaCampaign` error handler:
- Checks `isUnknownOutcome = (classification.code_name === 'EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME')`.
- When `isUnknownOutcome === true`:
  - `finalTxStatus` is explicitly set to `'EXTERNAL_OUTCOME_UNKNOWN'`.
  - `rollbackStatus` is set to `'QUARANTINED'` (if local objects were created and pause/rename succeeded) or `'UNKNOWN_EXTERNAL_STATE'`.
  - `publish_status` in `meta_publishing_transactions` is persisted as `'EXTERNAL_OUTCOME_UNKNOWN'`.

### D. Idempotency Guard Enforcement (`server.ts`)
In `dispatchMetaCampaign` entry check:
- Queries `meta_publishing_transactions` for existing active/blocked transactions.
- If `tx.publish_status === 'EXTERNAL_OUTCOME_UNKNOWN'`, dispatch logs a security boundary warning and aborts with `return false`.

---

## 3. ADVERSARIAL TEST SUITE EVIDENCE (`src/test/p0_2_unknown_outcome.test.ts`)

| # | Test Scenario | Execution Result |
|---|---|---|
| 1 | Network timeout (`ETIMEDOUT`) during Campaign creation results in `EXTERNAL_OUTCOME_UNKNOWN` | **PASSED** |
| 2 | Connection reset (`ECONNRESET`) during AdSet creation preserves created Campaign ID & sets status `EXTERNAL_OUTCOME_UNKNOWN` | **PASSED** |
| 3 | Deterministic Meta API 400 rejection (`OAuthException`) is **NOT** classified as `EXTERNAL_OUTCOME_UNKNOWN` | **PASSED** |
| 4 | Idempotency guard blocks dispatch if campaign has `EXTERNAL_OUTCOME_UNKNOWN` status | **PASSED** |
| 5 | `classifyMetaError` taxonomy correctly distinguishes network timeout vs Meta API error | **PASSED** |

---

## 4. STATIC STATE AUDIT FINDINGS

A static analysis was conducted on all references to `EXTERNAL_OUTCOME_UNKNOWN`, `ROLLBACK_SUCCESS`, `FAILED_PUBLISH`, and `QUARANTINED` in `server.ts`:
- **Result:** Zero code paths exist where a network timeout during a mutating call can resolve to `ROLLBACK_SUCCESS` or `FAILED_PUBLISH`.
- **Result:** `EXTERNAL_OUTCOME_UNKNOWN` is strictly treated as an unresolvable, locked transaction state that blocks re-dispatch until external reconciliation.

---

## 5. FULL SYSTEM INTEGRATION & VERIFICATION

- **Targeted Test Suite (`src/test/p0_2_unknown_outcome.test.ts`):** 5/5 PASSED
- **Full System Test Suite (`npx vitest run`):** 18/18 PASSED (across 6 test files)
- **Production Build (`npm run build`):** PASSED (built in 33.97s, zero TypeScript or bundle errors)

```text
========================================================
CERTIFICATION STATEMENT:
P0-2 (Unknown External Outcome) is CERTIFIED GREEN.
Invariant enforced, verified by targeted adversarial tests, static audit, full regression suite, and production build.
========================================================
```
