# PHASE 2.5 — INDUSTRIAL META DELIVERY INTEGRITY FORENSIC RECONNAISSANCE REPORT

**Document ID:** `META_PHASE_2_5_DELIVERY_RECON.md`  
**Date:** 2026-08-10  
**Author:** AI Lead Architect & Senior Principal Systems Engineer  
**Status:** COMPLETE (READ-ONLY FORENSIC AUDIT)  
**Target Component:** Meta Graph API Delivery Pipeline & Publishing Engine (`server.ts`, `src/lib/metaGraphClient.ts`)  

---

## EXECUTIVE SUMMARY

Phase 2.4 External Truth / Meta Identity Preflight has been certified **GREEN** with 22/22 tests passing. This reconnaissance report initiates **Phase 2.5 — Industrial Meta Delivery Integrity Hardening**.

In accordance with strict governance rules, this report provides an exhaustive, read-only forensic audit of the post-preflight Meta delivery pipeline. No code modifications were performed during this audit stage.

### Key Audit Findings & Critical Gaps Identified
1. **Missing Post-Creation External Verification (Phase 2.5G):** After Meta Graph API returns object IDs (`campData.id`, `adSetData.id`, `creativeData.id`, `adData.id`), the delivery engine in `dispatchMetaCampaign` immediately assumes success without calling `GET /{object_id}` to verify object existence, account ownership, or status.
2. **Timeout Vulnerability & Unknown-Outcome Risk (Phase 2.5D):** If an HTTP request times out or disconnects *after* Meta has created the object, `executeMetaRequest` re-throws or retries. Because the local variable for the object ID has not yet been saved, `executeMetaRollback` cannot delete or quarantine the created Meta object, leaving orphaned live objects on Meta and risking double creation on retry.
3. **Incomplete Rollback / Quarantine Strategy (Phase 2.5J):** `executeMetaRollback` attempts hard `DELETE` requests on Meta objects. If a Meta object cannot be deleted (e.g. status restrictions or API errors), the rollback engine records `ROLLBACK_FAILED`, but does not attempt a secondary fail-safe `PAUSE` (Quarantine) operation.
4. **Asset Integrity Deficits (Phase 2.5H):** Asset uploads (`POST /{ad_account_id}/adimages`) fetch images over HTTP without validating MIME type, checking for zero-byte payloads, enforcing size limits, or computing/persisting a local cryptographic SHA-256 asset hash.
5. **Tenant Boundary Vulnerabilities (Phase 2.5M):** Endpoints `/api/marketing/campaigns/:id/sync-meta` and `/api/marketing/campaigns/:id/preflight` do not enforce `WHERE host_id = req.user.id` or verify admin credentials, allowing authenticated users to query or trigger syncs for campaigns belonging to other hosts.
6. **State Transition Discrepancies (Phase 2.5C/2.5K):** Upon dispatch failure, `dispatchMetaCampaign` sets campaign status to `failed_publish`, but `executeCampaignStateMachine` subsequently overwrites it with `failed`.
7. **Missing Automated Reconciliation Engine (Phase 2.5N):** No background reconciliation process exists to resolve campaigns trapped in intermediate or inconsistent states (`PRECHECK_RUNNING`, `PUBLISHING`, `PARTIALLY_CREATED`, `ROLLBACK_FAILED`, or `EXTERNAL_OUTCOME_UNKNOWN`).

---

## 1. PHASE 2.5A — DELIVERY PIPELINE FORENSIC PATH AUDIT

Below is the complete step-by-step audit of the production delivery pipeline from Host Request to DB Commit and Observability.

```
Host Request / Admin Action
       │
       ▼
[Step 1] Campaign Creation / Update
  ├─ File: server.ts (lines 3550-3770)
  ├─ Function: POST /api/marketing/campaigns & PUT /api/marketing/campaigns/:id
  ├─ DB Mutation: INSERT/UPDATE host_marketing_campaigns (status: draft / pending_approval)
  ├─ Meta Endpoint: None
  ├─ Tenant Boundary: Enforced (WHERE host_id = req.user.id)
  └─ Audit Event: Insert into admin_audit_logs
       │
       ▼
[Step 2] AI Policy Check / Copilot Scan
  ├─ File: server.ts (lines 3850-3950)
  ├─ Function: POST /api/marketing/campaigns/:id/ai-policy-check
  ├─ DB Mutation: UPDATE host_marketing_campaigns (ai_generated_ad_copies, policy_cleared)
  ├─ Meta Endpoint: None
  └─ Audit Event: Recorded in DB
       │
       ▼
[Step 3] Admin Approval
  ├─ File: server.ts (lines 8279-8365)
  ├─ Function: POST /api/admin/marketing/campaigns/:id/approve
  ├─ DB Mutation: UPDATE host_marketing_campaigns (admin_approved = true, policy_cleared = true, status = 'admin_approved', payment_status = 'paid')
  ├─ Audit Event: Insert into admin_audit_logs (action: approve_campaign, approval_hash, approval_snapshot)
  └─ Triggers: executeCampaignStateMachine(id, 'PAYMENT_SUCCESS', req)
       │
       ▼
[Step 4] Payment & Escrow Authorization
  ├─ File: server.ts (lines 5693-5775 & 7200-7300)
  ├─ Function: executeCampaignStateMachine & handleVerifiedPayment
  ├─ DB Mutation: UPDATE host_marketing_campaigns (escrow_status, payment_status = 'paid')
  └─ State Transition: draft/pending_approval -> ASSET_PREP -> META_API_PUSH
       │
       ▼
[Step 5] Preflight Safety Gates Verification (Gate 14)
  ├─ File: server.ts (lines 6225-6260 & 6690-6710)
  ├─ Function: runMetaPreflightEngine -> metaGraphClient.checkExternalMetaReadiness
  ├─ Meta Endpoint: GET /debug_token, GET /me, GET /{ad_account_id}, GET /{page_id}
  ├─ Verification: Token validity, scopes, App ID, Ad Account status, Page admin role
  └─ Failure Handling: Aborts dispatch if any blocker gate fails; throws Preflight Exception
       │
       ▼
[Step 6] Idempotency & Transaction Lease Acquisition
  ├─ File: server.ts (lines 6720-6775)
  ├─ Function: dispatchMetaCampaign
  ├─ DB Mutation: INSERT INTO meta_publishing_transactions (publish_status = 'PRECHECK_RUNNING', idempotency_key = 'publish_meta_camp_{id}') FOR UPDATE NOWAIT
  ├─ Idempotency Check: Returns existing success if publish_status IN ('SUCCESS', 'LIVE'); reclaims lease if updated_at > 5 mins
  └─ Concurrency Lock: Postgres row lock prevents simultaneous dispatches
       │
       ▼
[Step 7] Meta Campaign Creation
  ├─ File: server.ts (lines 6900-6912)
  ├─ Meta Endpoint: POST /{cleanAdAccountId}/campaigns
  ├─ Payload: { access_token, name, objective: 'OUTCOME_AWARENESS', special_ad_categories: ['HOUSING'], special_ad_category_country: ['US', 'IN'], buying_type: 'AUCTION', status: 'PAUSED' }
  ├─ DB Mutation: UPDATE meta_publishing_transactions SET meta_campaign_id = $1
  ├─ Retry Behavior: Up to 3 attempts with exponential backoff & jitter
  └─ Failure Handling: Triggers executeMetaRollback, updates meta_publishing_transactions to FAILED_PUBLISH, inserts into meta_publishing_dlq
       │
       ▼
[Step 8] Meta Ad Set Creation
  ├─ File: server.ts (lines 6915-6935)
  ├─ Meta Endpoint: POST /{cleanAdAccountId}/adsets
  ├─ Payload: { access_token, name, campaign_id, daily_budget, billing_event: 'IMPRESSIONS', optimization_goal: 'REACH', promoted_object: { page_id }, targeting: { geo_locations: { countries: ['US', 'IN'] } }, status: 'PAUSED' }
  ├─ DB Mutation: UPDATE meta_publishing_transactions SET meta_adset_id = $1
  └─ Failure Handling: Triggers executeMetaRollback (deletes campaign), updates DLQ
       │
       ▼
[Step 9] Asset Fetch & Image Upload
  ├─ File: server.ts (lines 6938-6968)
  ├─ Action: HTTP GET listing_image -> Buffer -> Base64
  ├─ Meta Endpoint: POST /{cleanAdAccountId}/adimages
  ├─ Payload: { access_token, bytes: imgBase64 }
  ├─ Response Handling: Extracts image_hash from response
  └─ Failure Handling: Hard throw if image fetch fails or Meta returns no hash; triggers rollback
       │
       ▼
[Step 10] Meta Ad Creative Creation
  ├─ File: server.ts (lines 6970-6983)
  ├─ Meta Endpoint: POST /{cleanAdAccountId}/adcreatives
  ├─ Payload: { access_token, name, object_story_spec: { page_id, link_data: { image_hash, link, message, name, description, call_to_action: { type: 'BOOK_TRAVEL', value: { link } } } } }
  ├─ DB Mutation: UPDATE meta_publishing_transactions SET meta_creative_id = $1
  └─ Failure Handling: Triggers executeMetaRollback (deletes AdSet, Campaign)
       │
       ▼
[Step 11] Meta Ad Creation
  ├─ File: server.ts (lines 6985-6995)
  ├─ Meta Endpoint: POST /{cleanAdAccountId}/ads
  ├─ Payload: { access_token, name, adset_id, creative: { creative_id }, status: 'PAUSED' }
  ├─ DB Mutation: UPDATE meta_publishing_transactions SET meta_ad_id = $1
  └─ Failure Handling: Triggers executeMetaRollback (deletes Creative, AdSet, Campaign)
       │
       ▼
[Step 12] External Verification (GAP IDENTIFIED)
  ├─ Current Implementation: NONE. The engine proceeds directly to DB commit.
  └─ Required Hardening: Must execute GET /{object_id} for campaign, adset, creative, and ad to verify Meta-side persistence before declaring success.
       │
       ▼
[Step 13] DB Final Commit
  ├─ File: server.ts (lines 6998-7006)
  ├─ DB Mutations: 
  │   1. UPDATE host_marketing_campaigns SET meta_campaign_id, meta_adset_id, meta_creative_id, meta_ad_id, meta_dispatched_at = CURRENT_TIMESTAMP
  │   2. UPDATE meta_publishing_transactions SET publish_status = 'SUCCESS'
  └─ State Transition: host_marketing_campaigns status -> CAMPAIGN_LIVE (via state machine)
       │
       ▼
[Step 14] Observability & Tracing
  ├─ DB Mutations:
  │   1. INSERT INTO meta_api_traces (step, endpoint, request_payload, response_payload, http_status, latency_ms)
  │   2. INSERT INTO meta_publishing_dlq (on failure)
  └─ Secret Redaction: access_token replaced with 'REDACTED', bytes replaced with 'REDACTED_BASE64_IMAGE'
```

---

## 2. PHASE 2.5B — META OBJECT CREATION INTEGRITY AUDIT

| Integrity Criteria | Audit Finding | Status / Risk | Remediation Required |
| :--- | :--- | :--- | :--- |
| **1. Authoritative Account ID** | Uses `cleanAdAccountId` formatted as `act_{id}` from `process.env.META_AD_ACCOUNT_ID`. Validated in Gate 14. | PASS | None. |
| **2. Correlation ID Propagation** | `correlationId` generated via `crypto.randomUUID()` at start of dispatch and passed to preflight, traces, and DLQ. | PASS | Ensure passed to external verification queries. |
| **3. Idempotency Ownership** | Secured via `meta_publishing_transactions` table with unique constraint on `idempotency_key` (`publish_meta_camp_{id}`) and row lock `FOR UPDATE NOWAIT`. | PASS | Retain existing Phase 2.1 implementation. |
| **4. No Fabricated IDs** | IDs are assigned strictly from Meta Graph API response JSON (`campData.id`, etc.). No synthetic IDs generated. | PASS | Maintain zero tolerance for mock IDs. |
| **5. No Mock Payload Fields** | All payload fields derived from real campaign configuration or validated environment credentials. | PASS | Remove any legacy fallback defaults. |
| **6. No Deprecated Fields** | Currently uses v20.0 endpoints (`/campaigns`, `/adsets`, `/adimages`, `/adcreatives`, `/ads`). | PASS | Document exact schema contract in `/docs/meta/CREATIVE_CONTRACT.md`. |
| **7. Response Parsing Rigidity** | Checks `!res.ok \|\| data.error`. Throws if response is non-OK or contains `data.error`. | PASS | Add explicit check that returned ID string is non-empty. |
| **8. Meta Error Persistence** | Traces recorded in `meta_api_traces` with HTTP status, `fbtrace_id`, error codes, and latency. | PASS | Ensure DB errors during trace writing do not mask the root cause. |
| **9. Atomic Local ID Storage** | `meta_publishing_transactions` updated immediately after each object creation step. | PASS | Ensure rollback state accurately mirrors DB state. |
| **10. Sequential ID Propagation** | `meta_campaign_id` passed into AdSet payload; `meta_adset_id` and `meta_creative_id` passed into Ad payload. | PASS | Maintain strict ordering. |
| **11. Failed Stage Representation** | If any step fails, exception caught; campaign marked `failed_publish`; DLQ entry written with `failure_stage`. | PARTIAL FAIL | Inconsistent campaign state (`failed_publish` vs `failed`). Must unify state machine transitions. |
| **12. Malformed Response Handling** | Throws if response lacks expected ID or image hash object. | PASS | Add explicit structural validation for response objects. |

---

## 3. PHASE 2.5C — PARTIAL FAILURE STATE MACHINE AUDIT

### Failure Boundary Matrix

| Scenario | Local State | Meta External State | Reconciliation State | Rollback State | Recovery Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Campaign SUCCESS → AdSet FAILURE** | `FAILED_PUBLISH` | Campaign created (`PAUSED`) | `RECONCILIATION_REQUIRED` | `SUCCESS` (Campaign deleted) | Rollback deletes campaign on Meta. If delete fails, transition to `ROLLBACK_FAILED` & alert Admin. |
| **AdSet SUCCESS → Asset FAILURE** | `FAILED_PUBLISH` | Campaign & AdSet created | `RECONCILIATION_REQUIRED` | `SUCCESS` (AdSet & Campaign deleted) | Rollback deletes AdSet then Campaign in reverse cascade order. |
| **Asset SUCCESS → Creative FAILURE** | `FAILED_PUBLISH` | Campaign, AdSet, Asset created | `RECONCILIATION_REQUIRED` | `SUCCESS` (AdSet & Campaign deleted; Asset preserved on Meta) | Rollback deletes AdSet & Campaign. Image hash remains in Meta Ad Library. |
| **Creative SUCCESS → Ad FAILURE** | `FAILED_PUBLISH` | Campaign, AdSet, Creative created | `RECONCILIATION_REQUIRED` | `SUCCESS` (Creative, AdSet, Campaign deleted) | Rollback deletes Creative, AdSet, Campaign. |
| **Network Timeout on POST /campaigns** | `EXTERNAL_OUTCOME_UNKNOWN` | Unknown (Created or Not) | `RECONCILIATION_REQUIRED` | `ROLLBACK_PENDING` | Call Meta GET query to search by campaign name/external reference before retrying or rolling back. |
| **Meta 500 on POST /adsets** | `EXTERNAL_OUTCOME_UNKNOWN` | Unknown (Created or Not) | `RECONCILIATION_REQUIRED` | `ROLLBACK_PENDING` | Execute Graph API lookup for AdSet under Campaign ID. If found, proceed or delete; do not duplicate. |
| **Process / Worker Crash mid-dispatch** | `PRECHECK_RUNNING` / `PUBLISHING` (Lease active) | Objects partially created on Meta | `RECONCILIATION_REQUIRED` | `ROLLBACK_PENDING` | Lease expires after 5 minutes. Secondary worker reclaims lease, inspects Meta API, and triggers reconciliation. |
| **Duplicate Concurrent Worker** | `PRECHECK_RUNNING` (Locked) | Single dispatch in progress | `IN_PROGRESS` | `N/A` | Concurrent worker rejected via `FOR UPDATE NOWAIT` lock or idempotency check; returns immediately without duplicate dispatch. |

---

## 4. PHASE 2.5D — UNKNOWN-OUTCOME PROTECTION AUDIT

### Deficit Analysis
Currently, `executeMetaRequest` wraps HTTP `fetch()` calls in a try-catch loop. If `fetch()` throws a network error or timeout:
```typescript
catch (e: any) {
  if (attempt === maxRetries) throw e;
  await delay();
}
```
If the timeout occurs *after* Meta receives and processes the request, Meta creates the object. The local application receives a network timeout error and retries the exact same `POST` request, causing Meta to create a **second duplicate campaign/adset**.

### Required Architecture Hardening
1. On network timeout or 5xx response for object creation:
   - Transition transaction state to `EXTERNAL_OUTCOME_UNKNOWN`.
   - Before executing any retry `POST`, perform an **External Truth Lookup**:
     - For Campaign: Query `GET /{ad_account_id}/campaigns?fields=id,name` filtering by `name` containing `Campaign #{id}`.
     - For AdSet: Query `GET /{campaign_id}/adsets?fields=id,name`.
     - For Creative: Query `GET /{ad_account_id}/adcreatives?fields=id,name`.
     - For Ad: Query `GET /{adset_id}/ads?fields=id,name`.
   - If the object exists on Meta: attach its ID to local state and resume the pipeline at the next stage.
   - If the object does NOT exist on Meta: proceed with the single bounded retry.

---

## 5. PHASE 2.5E — IDEMPOTENCY ADVERSARIAL AUDIT

| Scenario | Expected Invariant | Current Mechanism | Recon Evaluation |
| :--- | :--- | :--- | :--- |
| **1. Identical Dual Dispatch** | 1 Meta Transaction | Postgres `FOR UPDATE NOWAIT` on `meta_publishing_transactions` | PASS: Second request receives lock failure code `55P03` and exits cleanly. |
| **2. 10-Way Burst Dispatch** | 1 Meta Transaction | Row lock + Unique constraint on `idempotency_key` | PASS: First worker acquires lock; 9 workers fail lock acquisition and abort. |
| **3. Worker Crash with Lock** | No Permanent Lockup | 5-Minute lease timeout (`updated_at < NOW() - INTERVAL '5 minutes'`) | PASS: Lock released on process termination or reclaimed after 5 minutes. |
| **4. Crash after Campaign Creation** | No Orphaned Meta Object | Transaction status remains `PUBLISHING`; lease expires | GAP: Needs automated reconciliation worker to inspect and clean up expired lease transactions. |
| **5. Crash after AdSet Creation** | No Duplicate AdSets | Same as above | GAP: Same as above. |
| **6. Crash after Creative Creation** | No Duplicate Creatives | Same as above | GAP: Same as above. |
| **7. Duplicate HTTP Request** | Idempotent Response | Checks `publish_status IN ('SUCCESS', 'LIVE')` | PASS: Returns `true` immediately without re-dispatching to Meta. |
| **8. Duplicate Queue Message** | Idempotent Processing | Unique key check on `idempotency_key` | PASS: `ON CONFLICT (idempotency_key) DO NOTHING` prevents duplicate insertion. |
| **9. Retry after Timeout** | No Duplicate Objects | Re-executes `executeMetaRequest` | GAP: Lacks external lookup before retry; risk of duplicate object creation on Meta. |
| **10. Retry after Meta 500** | No Duplicate Objects | Same as above | GAP: Same as above. |
| **11. Retry after Meta 429** | Backoff & Retry | Exponential backoff with jitter | PASS: Backoff logic implemented (`delayMs *= 2 + jitter`). |
| **12. Retry after Process Restart** | Resume or Rollback | Reads state from DB | PASS: `meta_publishing_transactions` preserves exact state across process restarts. |

---

## 6. PHASE 2.5F — META RATE LIMIT / RETRY POLICY AUDIT

### Error Taxonomy Audit

```
Graph API Error
  ├── Transient (Retryable)
  │     ├── Rate Limit / Throttling (Code 4, 17, 32, 613, HTTP 429)
  │     ├── Server / Network Faults (HTTP 500, 502, 503, 504)
  │     └── Temporary Graph API Service Disruptions (is_transient === true)
  │
  └── Non-Transient (BLOCKER - Unretryable / Immediate Rollback)
        ├── App Configuration (Error 100, Subcode 1885183 - Development Mode)
        ├── Authentication (Error 190, 102 - Expired / Invalid Token)
        ├── Authorization (Error 200, 10 - Missing Scope / Permissions)
        ├── Ad Account Disabled (Error 100, Subcode 1885016 - Account Restricted)
        ├── Billing Failure (Error 100, Subcode 1359188 - Payment Method Missing)
        ├── Policy Violation (Error 100, Subcode 1885006 - Housing/Special Ad Category)
        └── Validation Error (Error 100 - Invalid Object ID, Malformed Creative Payload)
```

### Audit Findings
- `classifyMetaError` in `server.ts` correctly identifies non-transient errors (development mode, expired token, missing permissions, disabled account, payment required) and marks `retryable: false`.
- `executeMetaRequest` checks `errorClassification.retryable`: if `false`, retries are immediately skipped and an exception is thrown to trigger rollback.
- Bounded retry params: `maxRetries = 3`, initial delay = 1000ms, backoff factor = 2x, jitter = 0-500ms.

---

## 7. PHASE 2.5G — EXTERNAL OBJECT VERIFICATION AUDIT

### Forensic Gap
Currently, after each Meta creation step completes, the pipeline takes the returned JSON object (`{ id: "123456..." }`) and immediately proceeds to the next step or DB commit.

### Required Hardening Plan
Before marking `meta_publishing_transactions` as `SUCCESS` and setting campaign status to `CAMPAIGN_LIVE`, the delivery engine must execute live read verification queries:
1. **Campaign Verification:** `GET /{meta_campaign_id}?fields=id,name,status,effective_status,account_id`
   - Verify `id` matches stored ID.
   - Verify `account_id` matches `cleanAdAccountId` (without `act_` prefix).
2. **AdSet Verification:** `GET /{meta_adset_id}?fields=id,name,status,campaign_id`
   - Verify `campaign_id` matches stored `meta_campaign_id`.
3. **Creative Verification:** `GET /{meta_creative_id}?fields=id,name`
   - Verify object existence.
4. **Ad Verification:** `GET /{meta_ad_id}?fields=id,name,status,adset_id`
   - Verify `adset_id` matches stored `meta_adset_id`.

Only when all 4 objects are verified live on Meta Graph API will the state transition to `SUCCESS` and `CAMPAIGN_LIVE`.

---

## 8. PHASE 2.5H — ASSET INTEGRITY AUDIT

### Forensic Audit of Image Handling
In `dispatchMetaCampaign` (lines 6938-6968):
```typescript
const imgUrl = campaign.listing_image || campaign.media_urls[0];
const imgRes = await fetch(imgUrl);
if (imgRes.ok) {
  const imgBuffer = await imgRes.arrayBuffer();
  imgBase64 = Buffer.from(imgBuffer).toString('base64');
}
```

### Identified Deficits
1. **Missing MIME Type Validation:** Accepts any payload returned by `fetch(imgUrl)` without checking `imgRes.headers.get('content-type')` for valid image types (`image/jpeg`, `image/png`, `image/webp`).
2. **Missing Zero-Byte Check:** Does not verify `imgBuffer.byteLength > 0`.
3. **Missing Size Limits:** Does not enforce Meta maximum file size limits (e.g. 30MB for images).
4. **Missing Cryptographic SHA-256 Hash:** Does not compute or store `sha256(imgBuffer)` in local DB metadata for auditability.
5. **No Local Asset Metadata Persistence:** Image hash returned by Meta (`squareHash`) is stored in local variable but not persisted in a dedicated asset tracking table.

---

## 9. PHASE 2.5I — CREATIVE INTEGRITY AUDIT

### Creative Payload Audit
In `dispatchMetaCampaign` (lines 6970-6983):
```typescript
const creativePayload = {
  access_token: accessToken,
  name: `Creative - ${adHeadline}`,
  object_story_spec: {
    page_id: pageId,
    link_data: {
      image_hash: squareHash,
      link: destinationUrl,
      message: sanitizedDescription,
      name: adHeadline,
      description: feedDescription,
      call_to_action: { type: 'BOOK_TRAVEL', value: { link: destinationUrl } }
    }
  }
};
```

### Verification Against Meta API Contract
- **Page ID:** Bound to validated `process.env.META_PAGE_ID`.
- **CTA Type:** Uses valid Meta CTA type `BOOK_TRAVEL`.
- **Link Data:** Contains valid `image_hash`, `link`, `message`, `name`, `description`.
- **No Mock / Deprecated / Synthetic Inputs:** No hardcoded mock lead form IDs, no fake Instagram actor IDs, no deprecated feed fields.
- **Documentation:** A formal creative contract specification will be created at `/docs/meta/CREATIVE_CONTRACT.md`.

---

## 10. PHASE 2.5J — ROLLBACK / QUARANTINE AUDIT

### Forensic Audit of `executeMetaRollback`
In `server.ts` (lines 6635-6685):
```typescript
const deleteObject = async (objType: string, objId: string | undefined) => {
  if (!objId) return;
  const res = await fetch(`https://graph.facebook.com/v20.0/${objId}?access_token=${accessToken}`, { method: 'DELETE' });
  const data = await res.json();
  const isSuccess = data.success === true || data.result === 'true' || res.status === 404 || ...;
  if (!isSuccess) allSucceeded = false;
};

await deleteObject('Ad', state.metaAdId);
await deleteObject('Creative', state.metaCreativeId);
await deleteObject('AdSet', state.metaAdSetId);
await deleteObject('Campaign', state.metaCampaignId);
```

### Audit Findings
1. **Cascading Order:** Correct reverse order: `Ad` → `Creative` → `AdSet` → `Campaign`.
2. **Idempotent Handling:** Treats HTTP 404 and error codes 100/10 as already deleted/not found (success).
3. **Quarantine Fallback Deficit:** If `DELETE` fails (e.g. Meta Graph API refuses deletion due to status or permissions), `deleteObject` sets `allSucceeded = false`, but does NOT attempt to send `POST /{objId}?status=PAUSED` as a fail-safe Quarantine measure.
4. **DLQ Alerting:** If rollback fails, `meta_publishing_transactions` is set to `ROLLBACK_FAILED`, but no explicit human administrative alert is triggered beyond recording in DLQ.

---

## 11. PHASE 2.5K — DATABASE ATOMICITY AUDIT

### Atomicity Analysis
- **PostgreSQL Transactions:** Enforces local atomicity for DB updates (`BEGIN ... COMMIT ... ROLLBACK`).
- **External Non-Atomicity:** Meta Graph API HTTP requests are external network operations that cannot be wrapped inside a Postgres transaction block.
- **Consistency Risk:** If Postgres commits local transaction but process crashes before sending response to client, client sees HTTP failure while DB records success. Conversely, if Meta API creates objects but Postgres transaction aborts, Meta objects exist while local DB records failure.
- **Required Mitigation:** Mandatory two-phase transaction lifecycle where Meta IDs are written to DB after *each* individual step, and an automated background Reconciliation Engine handles non-atomic discrepancies.

---

## 12. PHASE 2.5L — OBSERVABILITY AUDIT

### Audit of `meta_api_traces`
- **Fields Captured:** `correlation_id`, `campaign_id`, `host_id`, `step`, `endpoint`, `request_payload`, `response_payload`, `http_status`, `fbtrace_id`, `meta_error_code`, `meta_error_subcode`, `meta_error_message`, `meta_error_type`, `meta_error_is_transient`, `meta_error_user_title`, `meta_error_user_msg`, `latency_ms`.
- **Secret Redaction Audit:**
  - `access_token`: Explicitly replaced with `'REDACTED'`.
  - `bytes` (base64 image): Explicitly replaced with `'REDACTED_BASE64_IMAGE'`.
  - Passwords / App Secrets: Verified absent from trace payloads.

---

## 13. PHASE 2.5M — TENANT OWNERSHIP & SECURITY AUDIT

### Audit of Endpoints

| Endpoint | Auth Middleware | Host Ownership Check | Role Check | Audit Finding | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST /api/marketing/campaigns` | `authenticateToken` | Implicit (creates with `req.user.id`) | Any Host | Properly scoped | PASS |
| `PUT /api/marketing/campaigns/:id` | `authenticateToken` | Enforced (`WHERE host_id = req.user.id`) | Any Host | Properly scoped | PASS |
| `DELETE /api/marketing/campaigns/:id` | `authenticateToken` | Enforced (`WHERE host_id = req.user.id`) | Any Host | Properly scoped | PASS |
| `POST /api/marketing/campaigns/:id/ai-policy-check` | `authenticateToken` | Enforced (`WHERE host_id = req.user.id`) | Any Host | Properly scoped | PASS |
| `GET /api/marketing/campaigns/:id/leads` | `authenticateToken` | Enforced (`WHERE host_id = req.user.id`) | Any Host | Properly scoped | PASS |
| `POST /api/marketing/campaigns/:id/sync-meta` | `authenticateToken` | **MISSING** (Queries `WHERE id = $1` without checking `host_id`) | Any User | **Tenant Violation Risk** | **FAIL** |
| `GET /api/marketing/campaigns/:id/preflight` | `authenticateToken` | **MISSING** (Evaluates preflight without checking `host_id` or admin) | Any User | **Tenant Violation Risk** | **FAIL** |
| `POST /api/admin/marketing/campaigns/:id/approve` | `authenticateToken` | Admin Check (`req.user.role === 'admin'`) | Admin Only | Properly scoped | PASS |
| `POST /api/admin/marketing/campaigns/:id/resync-meta` | `authenticateToken` | Admin Check (`req.user.role === 'admin'`) | Admin Only | Properly scoped | PASS |

---

## 14. PHASE 2.5N — RECONCILIATION ENGINE GAP ANALYSIS

### Current State
There is no background worker or automated reconciliation routine. If a campaign becomes trapped in `PRECHECK_RUNNING`, `PUBLISHING`, `PARTIALLY_CREATED`, `ROLLBACK_FAILED`, or `EXTERNAL_OUTCOME_UNKNOWN`, human intervention is required to inspect `meta_publishing_dlq` and `meta_api_traces`.

### Required Reconciliation Engine Specifications
Create a periodic background job (`runMetaReconciliationEngine`):
1. **Target Identification:** Queries `meta_publishing_transactions` for records with:
   - `publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING')` and `updated_at < NOW() - INTERVAL '5 minutes'` (Stale Leases)
   - `publish_status IN ('PARTIALLY_CREATED', 'EXTERNAL_OUTCOME_UNKNOWN', 'ROLLBACK_FAILED')`
2. **Meta Truth Lookup:** Queries Meta Graph API for stored object IDs (`meta_campaign_id`, `meta_adset_id`, `meta_creative_id`, `meta_ad_id`).
3. **State Resolution:**
   - If all 4 objects exist and are valid on Meta: update local transaction status to `SUCCESS` and campaign status to `CAMPAIGN_LIVE`.
   - If objects are partially created: execute `executeMetaRollback` with quarantine fallback, then set status to `ROLLBACK_SUCCESS` or `ROLLBACK_FAILED`.
   - If no objects exist on Meta: clear stale transaction status to allow re-dispatch.

---

## 15. PHASE 2.5O — PRODUCTION TEST MATRIX DEFINITION

The implementation and certification phase must execute and pass the following 20 adversarial test scenarios:

| Test ID | Scenario | Expected Outcome |
| :--- | :--- | :--- |
| **TEST A** | Full Happy Path Delivery Dispatch | All 4 Meta objects created, externally verified via GET, DB updated, status `CAMPAIGN_LIVE`. |
| **TEST B** | Duplicate Concurrent Dispatch (2 workers) | First worker proceeds; second worker blocked by `55P03` lock and exits without duplicate Meta calls. |
| **TEST C** | 10-Way Burst Concurrent Dispatch | Exactly 1 Meta publishing transaction created; 9 concurrent attempts rejected cleanly. |
| **TEST D** | Campaign Creation Network Timeout | System transitions to `EXTERNAL_OUTCOME_UNKNOWN`, queries Meta GET by name, reconciles outcome. |
| **TEST E** | AdSet Creation Network Timeout | Transitions to `EXTERNAL_OUTCOME_UNKNOWN`, performs lookup under Campaign ID, prevents duplicate AdSet. |
| **TEST F** | Creative Creation Network Timeout | Performs lookup under Ad Account, prevents duplicate Creative creation. |
| **TEST G** | Ad Creation Network Timeout | Performs lookup under AdSet ID, prevents duplicate Ad creation. |
| **TEST H** | Meta 429 Rate Limit Response | Retries with exponential backoff & jitter up to max retries; succeeds on subsequent try. |
| **TEST I** | Meta 500 Internal Server Error | Handled as transient; executes lookup before retrying; fails closed if max retries exceeded. |
| **TEST J** | Meta Token Expired (Error 190) | Non-transient; immediate abort; no retries; triggers rollback; records in DLQ. |
| **TEST K** | Meta Scope Missing (Error 200) | Non-transient; immediate abort; no retries; triggers rollback; records in DLQ. |
| **TEST L** | Meta Billing Required (Error 100/1359188) | Non-transient; immediate abort; records billing required failure code. |
| **TEST M** | Meta Housing Policy Reject | Non-transient; immediate abort; policy error classified. |
| **TEST N** | Invalid / Corrupted Image URL | Hard failure during asset prep; zero Meta calls made; transaction aborted cleanly. |
| **TEST O** | Malformed Meta Response JSON | Fails structural validation; triggers rollback; records in DLQ. |
| **TEST P** | Process / Worker Crash Mid-Dispatch | Lease expires after 5 mins; secondary worker/reconciliation reclaims transaction safely. |
| **TEST Q** | Worker Restart During Rollback | Rollback engine re-executes idempotently from stored `meta_publishing_transactions` state. |
| **TEST R** | Meta Reject DELETE on Rollback | Failsafe Quarantine triggers `POST /{objId}?status=PAUSED`; status set to `ROLLBACK_FAILED`. |
| **TEST S** | Automated Reconciliation Recovery | Trapped transaction inspected against live Meta Graph API and reconciled to authoritative state. |
| **TEST T** | Tenant Boundary Violation Attempt | Request from Unauthorized Host rejected with HTTP 403/404 before reaching Meta engine. |

---

## 16. PHASE 2.5P — CERTIFICATION CHECKLIST

- [x] Read-Only Forensic Reconnaissance Report Generated (`/docs/audits/META_PHASE_2_5_DELIVERY_RECON.md`)
- [ ] Delivery Contract Specification Created (`/docs/meta/META_DELIVERY_CONTRACT.md`)
- [ ] Creative Contract Specification Created (`/docs/meta/CREATIVE_CONTRACT.md`)
- [ ] Meta Error Taxonomy Documented (`/docs/meta/META_ERROR_TAXONOMY.md`)
- [ ] Meta Retry Policy Documented (`/docs/meta/META_RETRY_POLICY.md`)
- [ ] Meta Reconciliation Policy Documented (`/docs/meta/META_RECONCILIATION_POLICY.md`)
- [ ] Implementation Remediation Applied (`/docs/audits/META_PHASE_2_5_IMPLEMENTATION.md`)
- [ ] Adversarial Test Matrix Execution Executed (`/docs/audits/META_PHASE_2_5_ADVERSARIAL_CERTIFICATION.md`)

---

## RECONNAISSANCE CONCLUSION & NEXT STEPS

The forensic audit is complete. All current implementation paths, state machines, error classifications, rollback behaviors, and security boundaries have been fully mapped and evaluated.

### Next Execution Step
Proceeding to documentation of supporting contracts (`META_DELIVERY_CONTRACT.md`, `CREATIVE_CONTRACT.md`, `META_ERROR_TAXONOMY.md`, `META_RETRY_POLICY.md`, `META_RECONCILIATION_POLICY.md`) followed by code remediation and adversarial test suite execution.
