# META DELIVERY CONTRACT SPECIFICATION

**Document ID:** `META_DELIVERY_CONTRACT.md`  
**Date:** 2026-08-10  
**Status:** AUTHORITATIVE SPECIFICATION  
**Target:** Meta Graph API Delivery Engine  

---

## 1. PURPOSE & PRINCIPLES

The Meta Delivery Contract specifies the authoritative, deterministic end-to-end lifecycle for publishing Encho Marketing Campaigns to the Meta Graph API.

### Golden Rules
1. **Real External Truth is Authoritative:** Local state must always reflect verified live objects on Meta.
2. **Zero Fabrication:** Never generate synthetic or mock Meta campaign, adset, creative, or ad IDs.
3. **Strict Idempotency:** Exactly ONE logical Encho campaign equals ONE Meta publishing transaction.
4. **Fail-Closed Execution:** Any unrecoverable preflight, asset, or creation failure halts dispatch immediately and executes reverse-cascade rollback or quarantine.
5. **Post-Creation External Verification:** No dispatch is marked `SUCCESS` without live Meta Graph API `GET` verification of created objects.

---

## 2. DISPATCH LIFECYCLE STAGES

```
[STAGE 0: PREFLIGHT & GATE 14]
  │  └─ Validates System Access Token, App Mode, Scope, Ad Account Status, Page Role
  ▼
[STAGE 1: IDEMPOTENCY LOCK & LEASE ACQUISITION]
  │  └─ Acquires Postgres transaction row lock on meta_publishing_transactions
  ▼
[STAGE 2: ASSET INTEGRITY & VALIDATION]
  │  └─ Validates MIME type, byte size (>0, <30MB), computes SHA-256 asset hash
  ▼
[STAGE 3: CAMPAIGN CREATION]
  │  └─ POST /{ad_account_id}/campaigns (HOUSING special ad category, PAUSED status)
  ▼
[STAGE 4: AD SET CREATION]
  │  └─ POST /{ad_account_id}/adsets (BOUND to page_id, geo_locations, PAUSED status)
  ▼
[STAGE 5: ASSET UPLOAD]
  │  └─ POST /{ad_account_id}/adimages (returns image_hash)
  ▼
[STAGE 6: AD CREATIVE CREATION]
  │  └─ POST /{ad_account_id}/adcreatives (object_story_spec, BOOK_TRAVEL CTA)
  ▼
[STAGE 7: AD CREATION]
  │  └─ POST /{ad_account_id}/ads (binds adset_id and creative_id, PAUSED status)
  ▼
[STAGE 8: EXTERNAL LIVE OBJECT VERIFICATION]
  │  └─ GET /{campaign_id}, GET /{adset_id}, GET /{creative_id}, GET /{ad_id}
  ▼
[STAGE 9: ATOMIC DB COMMIT & CAMPAIGN LIVE TRANSITION]
     └─ Updates host_marketing_campaigns & meta_publishing_transactions -> SUCCESS
```

---

## 3. STATE MACHINE TRANSITION SPECIFICATION

| From State | Trigger Event | To State | Actions Executed |
| :--- | :--- | :--- | :--- |
| `draft` / `pending_approval` | Admin Approve + Payment | `ASSET_PREP` | Invalidation of approval hash if modified; state lock. |
| `ASSET_PREP` | Asset Validation Success | `META_API_PUSH` | Triggers `dispatchMetaCampaign`. |
| `META_API_PUSH` | Preflight Verification Pass | `PUBLISHING` | Acquire transaction lease `PRECHECK_RUNNING` -> `PUBLISHING`. |
| `PUBLISHING` | All 4 Objects Created + Verified | `CAMPAIGN_LIVE` | Atomic DB commit of returned Meta IDs; status `SUCCESS`. |
| `PUBLISHING` | Creation Failure / Rollback Success | `failed_publish` | Executed reverse rollback; DLQ recorded. |
| `PUBLISHING` | Rollback Delete Failure | `ROLLBACK_FAILED` | Fail-safe Quarantine (`PAUSED`) attempted; DLQ incident logged. |
| `PUBLISHING` | Network Timeout / 5xx | `EXTERNAL_OUTCOME_UNKNOWN` | Invokes Reconciliation Engine lookup before retry or rollback. |

---

## 4. TENANT BOUNDARY CONTRACT

- **Host Authentication:** All host-initiated dispatch, sync, preflight, or metric endpoints MUST verify that `campaign.host_id === req.user.id` or `req.user.role === 'admin'`.
- **Administrative Overrides:** Admin endpoints (`/api/admin/marketing/campaigns/*`) require explicit `req.user.role === 'admin'` authorization and generate an entry in `admin_audit_logs`.
