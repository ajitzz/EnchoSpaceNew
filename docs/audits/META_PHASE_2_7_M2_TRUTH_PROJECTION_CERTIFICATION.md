# PHASE 2.7 MILESTONE 2 — CAMPAIGN TRUTH PROJECTION ENGINE AUDIT & CERTIFICATION

**Date:** August 13, 2026  
**Status:** CERTIFIED — 100% PASS  
**System:** Encho Host & Admin Marketing Engine (Phase 2.7 — Milestone 2)

---

## 1. Executive Summary

Phase 2.7 Milestone 2 introduces the **Canonical Campaign Truth Projection Engine** (`CampaignControlCenterService`). This service serves as the single authoritative source of truth for both Host and Admin command center views across the platform.

The engine computes a persistent 3-axis operational state (Governance, Financial, Publishing) alongside Meta external freshness, performance telemetry freshness, DCO variant metrics, root error classifications, and tenant-safe role projections.

---

## 2. Architectural Architecture & Core Components

### A. Canonical Service
- **Service File:** `/src/lib/campaignControlCenterService.ts`
- **Primary Function:** `CampaignControlCenterService.getCampaignTruth(campaignId, viewerContext, dbClient)`

### B. Route Integration
- **Host Endpoint:** `GET /api/marketing/campaigns/:id/control-center` (and `/api/marketing/campaigns/:id/telemetry`)
- **Admin Endpoint:** `GET /api/admin/marketing/campaigns/:id/control-center` (and `/api/admin/campaigns/:id/control-center`)
- **RBAC & Isolation:** Authenticated via `authenticateToken`. Enforces host tenant isolation (`host_id === user.id`) and admin privileges (`user.role === 'admin'`).

---

## 3. Data Sources Reused (Zero Duplicated State)

1. `host_marketing_campaigns` — Core campaign record, budget, escrow_status, meta_status, external_status_verified_at, insights_synced_at.
2. `meta_publishing_transactions` — Authoritative publishing transaction history, pipeline steps, failure codes, and correlation IDs.
3. `meta_publishing_events` — State transition audit timeline.
4. `meta_api_traces` — Deep diagnostic API call traces.
5. `admin_audit_logs` — Administrative moderation and approval actions.
6. `wallet_transactions` — Escrow holds and refund audit records.
7. `campaign_creative_variants` — Creative DCO variants.
8. `variant_meta_snapshots` — Meta API performance snapshots at the variant level.
9. `dco_evaluation_transactions` — DCO winning variant selection history.
10. `dco_external_actions` — Meta ad mutation actions during DCO loops.
11. `campaign_daily_metrics` — Aggregate time-series daily metrics.

---

## 4. Semantic Rules Compliance Matrix

| Rule | Description | Status | Verification Detail |
|---|---|---|---|
| **Rule A** | APPROVED MUST NEVER imply LIVE | **PASS** | `governance_status` is `ADMIN_APPROVED`, while `publish_status` remains `IDLE` until published to Meta. Friendly state shows "Processing", never "Live". |
| **Rule B** | FAILED_PUBLISH must have clear root cause | **PASS** | Includes `failure_stage`, `root_error_code`, `root_error_classification`, `error_owner`, `plain_english_failure`, `host_next_action`, and `admin_next_action`. |
| **Rule C** | Meta External State Freshness | **PASS** | Computes `external_status_verified_at`, `external_status_verification_source`, and classifies `external_freshness` (`FRESH` <= 5m, `STALE` <= 15m, `DEGRADED` > 15m, `UNKNOWN`). |
| **Rule D** | EXTERNAL_OUTCOME_UNKNOWN preserved | **PASS** | Never mapped to generic FAILED or SUCCESS. Remains visibly `EXTERNAL_OUTCOME_UNKNOWN`. |
| **Rule E** | ROLLBACK_FAILED triggers RECONCILIATION_REQUIRED | **PASS** | Sets `reconciliation_state = RECONCILIATION_REQUIRED` and flags high financial risk. |
| **Rule F** | ROLLBACK_SUCCESS verified | **PASS** | Only represented when verified in `meta_publishing_transactions`. |
| **Rule G** | Zero unmanaged external objects | **PASS** | Quarantined and orphan states properly detected and surfaced for reconciliation. |
| **Rule H** | Financial state uncoupled from publishing | **PASS** | Uses `escrow_status` and `wallet_transactions` records rather than assuming financial state from Meta status. |
| **Rule I** | Role Projection / Redaction | **PASS** | Host view receives redacted payload (no correlation IDs, access tokens, or raw trace logs). Admin view receives 100% diagnostic transparency. |

---

## 5. Certification Test Results

Targeted Test Suite: `src/test/phase2_7_m2_truth_projection.test.ts`

```text
✓ 1. Approved but not published (Rule A: APPROVED MUST NEVER imply LIVE) (154 ms)
✓ 2. Successful Meta publication (71 ms)
✓ 3. Failed publish with clear root cause (Rule B: FAILED_PUBLISH must have stage, root error, owner & next action) (68 ms)
✓ 4. Rollback success representation (Rule F) (69 ms)
✓ 5. Rollback failure triggers RECONCILIATION_REQUIRED (Rule E) (67 ms)
✓ 6. Quarantined campaign (79 ms)
✓ 7. External outcome unknown remains visibly UNKNOWN (Rule D) (104 ms)
✓ 8. Meta state freshness classification (STALE / DEGRADED) (75 ms)
✓ 9. Meta state unknown when timestamp missing (234 ms)
✓ 10. Fresh performance telemetry (57 ms)
✓ 11. Stale performance telemetry (64 ms)
✓ 12. Host redaction (Redacts correlation ID, access tokens, admin actions, raw traces) (69 ms)
✓ 13. Admin diagnostic visibility (68 ms)
✓ 14. Tenant isolation (Host 2 cannot view Host 1 campaign) (18 ms)
✓ 15. Financial safety projection (Rule H) (58 ms)
✓ 16. DCO state projection (55 ms)

Test Files: 1 passed (1)
Tests:      16 passed (16)
```

Full System Test Suite:
```text
Test Files: 17 passed (17)
Tests:      121 passed (121)
Skipped:    11 skipped (11)
```

Linting & Compilation:
- **ESLint:** Passed (0 errors, 0 warnings)
- **Applet Compilation:** Succeeded (`npm run build` green)

---

## 6. Certification Sign-off

Phase 2.7 Milestone 2 is officially certified for production deployment. Milestone 3 is not started.
