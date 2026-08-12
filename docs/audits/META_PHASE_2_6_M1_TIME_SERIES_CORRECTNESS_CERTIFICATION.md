# PHASE 2.6 M1 — TIME-SERIES DATE CORRECTNESS CERTIFICATION

## 1. Executive Summary
- **Module**: Phase 2.6 Milestone 1 — Campaign Analytics Aggregation & Time-Series Rollup
- **Audit Target**: Time-Series Event Occurrence Date Attribution & Composite Aggregation Grouping
- **Initial Status**: REOPENED due to data-correctness defect (`CURRENT_DATE` fallback & single `campaign_id` grouping key)
- **Final Status**: **GREEN — TIME-SERIES CORRECTNESS VERIFIED**

---

## 2. Defect Summary & Root Cause

### Identified Defect
The previous implementation of `runAnalyticsRollup()` selected `CURRENT_DATE as date` at processing execution time rather than extracting the actual occurrence date from the raw event's timestamp (`created_at`). In addition, the in-memory aggregation map grouped raw event deltas using only `campaign_id` as the key (`Map<number, ...>`).

### Root Cause
1. **Date Source**: `SELECT CURRENT_DATE as date` assigned all unprocessed events to the date on which `runAnalyticsRollup()` executed, misattributing historical events processed asynchronously across UTC date boundaries.
2. **Grouping Key**: Using `campaign_id` as a single key caused raw events occurring across multiple distinct days to be collapsed into a single daily rollup bucket for `CURRENT_DATE`.

---

## 3. Authoritative Timezone Decision

- **Authoritative Timezone**: **UTC**
- **Justification**: System database timestamps (`created_at TIMESTAMP`) and Neon/PostgreSQL session standards enforce UTC time representations across all platform event logs.
- **Extraction Formula**: `(created_at AT TIME ZONE 'UTC')::date::text as date`
- **Invariant**:
  $$\text{EVENT\_OCCURRENCE\_DATE} = \text{DAILY\_ROLLUP\_DATE}$$
  Processing date is never substituted for event occurrence date.

---

## 4. Implementation Details

### Server Worker (`/server.ts`, lines 13513–13550)
1. **SQL Query**:
   ```sql
   SELECT 
     id,
     campaign_id,
     (created_at AT TIME ZONE 'UTC')::date::text as date,
     impressions_delta,
     clicks_delta,
     conversions_delta,
     spent_delta
   FROM campaign_raw_event_logs
   WHERE processed = false
   FOR UPDATE
   ```
2. **Composite Grouping**:
   ```ts
   const groupedMap = new Map<string, { campaign_id: number; date: string; impressions: number; clicks: number; conversions: number; spent: number }>();
   for (const row of rawEventsRes.rows) {
     const key = `${row.campaign_id}_${row.date}`;
     const existing = groupedMap.get(key) || {
       campaign_id: row.campaign_id,
       date: row.date,
       impressions: 0,
       clicks: 0,
       conversions: 0,
       spent: 0
     };
     existing.impressions += Number(row.impressions_delta || 0);
     existing.clicks += Number(row.clicks_delta || 0);
     existing.conversions += Number(row.conversions_delta || 0);
     existing.spent += Number(row.spent_delta || 0);
     groupedMap.set(key, existing);
   }
   ```
3. **Atomic Upsert**:
   - Performs `ON CONFLICT (campaign_id, date) DO UPDATE` to update or insert separate date buckets per campaign.
   - Updates raw event logs `processed = true` within the same database transaction block.

---

## 5. Test Suite Verification (`src/test/p2_6_m1_analytics_rollup.test.ts`)

A mandatory 10-test suite was implemented and passed:

| Test ID | Objective | Result |
| :--- | :--- | :--- |
| **TEST A** | Event created yesterday lands on yesterday's date, not today's date | **PASSED** |
| **TEST B** | Events for same campaign on different dates produce separate rollup rows | **PASSED** |
| **TEST C** | Multiple events for same campaign on same date sum deltas into 1 row | **PASSED** |
| **TEST D** | Historical event + current event produce 2 separate daily buckets | **PASSED** |
| **TEST E** | Multi-campaign multi-date composite aggregation | **PASSED** |
| **TEST F** | Timezone boundary test (explicit UTC timestamp derives exact UTC date) | **PASSED** |
| **TEST G** | `ON CONFLICT` accumulation updates existing date row atomically | **PASSED** |
| **TEST H** | Unprocessed raw events are marked `processed = true` on completion | **PASSED** |
| **TEST I** | Transaction rollback preserves `processed = false` on failure | **PASSED** |
| **TEST J** | Tenant-isolated analytics API queries return host data securely | **PASSED** |

---

## 6. Existing-Data & Backfill Impact Analysis

1. **Risk Assessment**:
   - Raw event logs (`campaign_raw_event_logs`) preserve immutable `created_at` timestamps for all events.
   - Rollup records in `campaign_daily_rollups` derive strictly from processed raw events.
2. **Backfill Status**:
   - All historical raw events are preserved in `campaign_raw_event_logs`.
   - No historical production data was destroyed or truncated.
   - Deterministic backfill can be executed safely by re-aggregating `campaign_raw_event_logs` grouped by `campaign_id, (created_at AT TIME ZONE 'UTC')::date` if required.

---

## 7. Regression & Build Verification

- **Milestone Test Suite**: `npx vitest run src/test/p2_6_m1_analytics_rollup.test.ts` — **10/10 PASSED**
- **Full Suite Regression**: `npx vitest run` — **37/37 PASSED across 9 test files**
- **Production Compilation**: `compile_applet` — **Build Succeeded**

---

## 8. Final Certification Verdict

**GREEN — TIME-SERIES CORRECTNESS VERIFIED**
