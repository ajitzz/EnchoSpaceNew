# ENCHO Marketing Engine - Phase 2 Pre-implementation Audit

## 1. Executive Summary
This document serves as the structural audit of the ENCHO Meta Marketing Engine prior to Phase 2 industrial hardening. The purpose of this audit is to catalog current state machines, mutation locations, transaction boundaries, retry loops, webhooks, concurrency control, and potential invalid transition or race-condition risks.

## 2. Current State Models

### 2.1 Campaign Lifecycle States (`host_marketing_campaigns.status`)
Based on grep results, the `status` column inside `host_marketing_campaigns` can currently hold:
* `paused` (Auto-paused for target dates, or admin manually paused)
* `rejected` (Rejected by AI Gatekeeper or Admin)
* `killed` (Archived by admin, budget refunded)
* `cancelled` (Cancelled by user)
* `failed` (Meta API push failed, legacy naming)
* `failed_publish` (Failed during `dispatchMetaCampaign`)
* `META_API_PUSH` (Intermediate pipeline state)
* `CAMPAIGN_LIVE` (Legacy success state)
* `ASSET_PREP` (After escrow release/approval)
* `active` (Webhook success state / manual admin override)
* `escrow` / `pending` (Intermediate waiting state)

### 2.2 Payment / Escrow States
`payment_status`:
* `pending_webhook`
* `paid`
* `refunded`
* `PAYMENT_SUCCESS` (Legacy?)

`escrow_status`:
* `holding`
* `released`

### 2.3 Meta Publishing Transaction States (`meta_publishing_transactions.publish_status`)
* `PENDING`
* `PRECHECK_RUNNING`
* `PUBLISHING`
* `SUCCESS`
* `ROLLBACK_SUCCESS`
* `ROLLBACK_FAILED`
* `FAILED_PUBLISH`
* `LIVE` (Legacy/mismatch checked during reconciliation)
* `FAILED`

## 3. Mutation Locations (State Updates)
There are multiple scattered locations directly updating the database:
* Webhooks (`/api/marketing/webhooks/meta-leads`, Ad Network webhook updating to `active`)
* Admin Routes (Approvals, Refunds, Escrow force release, Pause)
* `dispatchMetaCampaign` function (Transactions, Campaign status on failure)
* Escrow background worker (Releasing to `ASSET_PREP` and calling dispatch)
* Chaos / Test routes (some potentially remaining)
* User actions (Pause, Cancel)
* AI Gatekeeper logic

## 4. Current Meta Mutation Locations
The primary external mutation location is `executeMetaRequest` calls inside `dispatchMetaCampaign`:
1. `campaign_creation`
2. `adset_creation`
3. `adimage_upload_square`
4. `creative_creation`
5. `ad_creation`

The rollback location is `executeMetaRollback`.

## 5. Transaction Boundaries
Currently, the transaction `txId` is created in `meta_publishing_transactions`. There is a `FOR UPDATE` lock on `SELECT * FROM meta_publishing_transactions WHERE idempotency_key = $1 FOR UPDATE`. However, PostgreSQL row-level locks via `FOR UPDATE` only work if they are inside an explicit `BEGIN` ... `COMMIT` transaction block. Right now `dispatchMetaCampaign` uses `await pool.query(...)` without a client checkout and `BEGIN`, making the `FOR UPDATE` clause functionally useless to block concurrent workers (they immediately release the lock as the statement finishes).

## 6. Race Conditions & Concurrency Risks
* **Idempotency Lock Failure:** Because `pool.query('SELECT ... FOR UPDATE')` is not inside a `BEGIN; ... COMMIT;` transaction, two concurrent invocations will simply execute sequentially in auto-commit mode. The second invocation will see `txCheck.rows.length === 0` (if it executes before the first one INSERTS) and both will attempt to publish to Meta.
* **State Machine Bypasses:** Arbitrary `status = 'active'` updates in webhooks can override a `paused` or `killed` campaign if the webhook arrives late.

## 7. Invalid Transition Risks
Because states are directly updated with `UPDATE host_marketing_campaigns SET status = ...`, there is no validation preventing `cancelled` -> `active`, or `rejected` -> `ASSET_PREP` if a rogue admin clicks a button, or a delayed webhook fires.

## 8. Retry & Rollback Boundaries
* The `executeMetaRequest` currently implements an exponential backoff retry loop.
* The `dispatchMetaCampaign` implements an explicit catch block that triggers `executeMetaRollback`.

## 9. Configuration Governance
Current configuration check relies on `process.env.META_ACCESS_TOKEN` directly inside functions. There is no central validation enforcing that Meta is structurally configured (e.g. matching App ID / Ad Account ID).

## 10. Existing Invariants to Preserve
* The "Golden Canary #112" sequence (Campaign -> AdSet -> Image -> Creative -> Ad) using real Graph API calls and returning actual Meta IDs.
* Idempotency (preventing double billing/dispatch).
* Walled garden leads tracking.
* The 24-hour escrow system.
* Reconciliation worker validating the presence of Meta IDs.
