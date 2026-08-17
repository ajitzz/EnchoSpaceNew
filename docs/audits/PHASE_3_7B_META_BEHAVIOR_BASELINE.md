# ENCHO PHASE 3.7B: META BEHAVIOR BASELINE AUDIT
## Architectural & Behavioral Freeze Document

**Status:** FROZEN BASELINE  
**Timestamp:** 2026-08-16  
**Auditor:** Lead Architect, ENCHO AI Software Agency  
**Target Milestone:** Phase 3.7B Provider Abstraction Foundation Refactor  

---

### 1. Existing Meta Architecture Baseline

Before extracting the polymorphic `AdProvider` interface, ENCHO's production advertising architecture consists of the following verified Meta components:

| Subsystem | Source File | Core Responsibilities & Invariants |
| :--- | :--- | :--- |
| **Meta Graph Client** | `src/lib/metaGraphClient.ts` | Graph API v21.0 transport, HMAC-SHA256 appsecret_proof, exponential retry backoff with jitter, client rate limiting, token masking. |
| **Publishing Engine** | `src/lib/metaExternalSyncEngine.ts` | 2-Phase Commit publishing of Campaign, AdSet, Creative, and Ad. Manages `meta_publishing_transactions`, `meta_external_truth_snapshots`, `meta_reconciliation_audit`. |
| **Control Plane** | `src/lib/metaControlPlaneService.ts` | Safe state transitions (`PAUSE`, `RESUME`, `BUDGET_UPDATE`), row locks on `campaign_financial_contracts`, compensation rollbacks, circuit breakers. |
| **Telemetry Sync** | `src/lib/metaTelemetrySyncEngine.ts` | Authoritative UTC windowed ingestion of Meta Insights API (`impressions`, `clicks`, `spend`, `reach`, `frequency`, `conversions`). |
| **Delivery Reducer** | `src/lib/metaDeliveryReducer.ts` (integrated) | Reduces `effective_status` (`ACTIVE`, `PAUSED`, `PENDING_REVIEW`, `DISAPPROVED`, `CAMPAIGN_PAUSED`) to canonical states. |
| **DCO Engine** | `src/lib/dcoEngine.ts` | Statistical variant evaluation ($\Delta \ge 20\%$, $N \ge 100$), automated pausing of losing Meta Ad ID. |
| **Campaign Control Center** | `src/lib/campaignControlCenterService.ts` | Unified truth aggregator querying `host_marketing_campaigns`, transactions, and snapshots. |
| **Financial Ledger** | `campaign_financial_contracts` & `wallet_accounts` | 15% Encho Fee, 85% Provider Spend Authorization, Double-entry internal wallet ledger. |
| **Walled Garden CRM** | `src/lib/leadAlertingCrmService.ts` | Webhook signature verification, Hot Lead scoring (0–100), PII masking, PostgreSQL outbox delivery queue. |

---

### 2. Test Baseline Summary

- **Total Test Suites:** 43 Test Files
- **Total Passing Tests:** 416 / 416 Passed (100% Pass Rate)
- **Zero Failures / Zero Regressions**

---

### 3. Non-Negotiable Invariants Frozen for Phase 3.7B

1. **Meta Behavior Invariance:** Any Meta ad publishing, pausing, resuming, budget updating, reconciliation, or telemetry ingestion must produce identical API calls, database records, and outputs before and after the refactor.
2. **Financial Invariance:** Provider layer never authorizes spend directly. `campaign_financial_contracts` remains the sole financial authority.
3. **Database Non-Destruction:** Existing tables (`meta_publishing_transactions`, `meta_external_truth_snapshots`, `meta_reconciliation_audit`, `host_marketing_campaigns`) must NOT be deleted or altered destructively. Dual-read fallback is mandatory.
4. **Zero Production Google API Calls:** Google Ads adapter code or credentials will NOT be introduced in Phase 3.7B.
