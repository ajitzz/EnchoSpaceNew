# META ERROR TAXONOMY SPECIFICATION

**Document ID:** `META_ERROR_TAXONOMY.md`  
**Date:** 2026-08-10  
**Status:** AUTHORITATIVE SPECIFICATION  
**Target:** Meta Graph API Error Classification & Handling Engine  

---

## 1. ERROR CLASSIFICATION MATRIX

| Meta Code | Subcode | Error Category | Retryable | Severity | Action Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `100` | `1885183` | `APP_CONFIGURATION` | **NO** | `BLOCKER` | Switch Meta App from Development to Live/Public Mode in Meta Developers Console. |
| `190` / `102` | Any | `AUTHENTICATION` | **NO** | `BLOCKER` | Regenerate system user long-lived access token in Meta Business Manager. |
| `200` / `10` | Any | `AUTHORIZATION` | **NO** | `BLOCKER` | Ensure system user has `ads_management`, `pages_read_engagement` scopes. |
| `100` | `1885016` | `AD_ACCOUNT` | **NO** | `BLOCKER` | Inspect Ad Account status and submit appeal in Meta Business Manager. |
| `100` | `1359188` | `EXTERNAL_BILLING` | **NO** | `BLOCKER` | Add valid Meta-supported payment method to Master Meta Ad Account in Meta Billing. |
| `100` | `1885006` | `POLICY_VIOLATION` | **NO** | `BLOCKER` | Ensure `special_ad_categories: ['HOUSING']` is configured and target targeting excludes restricted demographics. |
| `4` / `17` / `32` / `613` | Any | `RATE_LIMIT` | **YES** | `TRANSIENT` | Back off exponentially with jitter and retry request. |
| `500` / `502` / `503` / `504` | Any | `GRAPH_API_FAULT` | **YES** | `TRANSIENT` | Back off exponentially with jitter; perform external lookup before retry. |
| `NETWORK_TIMEOUT` | Any | `NETWORK` | **YES** | `TRANSIENT` | Transition to `EXTERNAL_OUTCOME_UNKNOWN`; perform external Graph API lookup before retry. |

---

## 2. DLQ & AUDIT LOG PERSISTENCE

Whenever a non-retryable error or exhausted retry occurs:
1. Insert trace record into `meta_api_traces` with HTTP status, `fbtrace_id`, latency, and normalized error.
2. Insert incident record into `meta_publishing_dlq` with `transaction_id`, `campaign_id`, `failure_stage`, `failure_code`, `requires_human_action`, `recommended_action`.
3. Transition `host_marketing_campaigns` status to `failed_publish` and update `admin_feedback`.
