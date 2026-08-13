# PHASE 2.7 — MILESTONE 3 CERTIFICATION REPORT
## FAILURE INTELLIGENCE & OPERATOR GUIDANCE ENGINE

---

### EXECUTIVE SUMMARY
- **Milestone:** Phase 2.7 — Milestone 3 (Failure Intelligence & Operator Guidance)
- **Status:** **CERTIFIED — 100% PASS**
- **Core Objective:** Build a pure deterministic Failure Intelligence and Operator Guidance layer on top of `CampaignControlCenterService` that accurately classifies operational failures, isolates failure ownership across Host, Admin, Meta, Payment, and Infrastructure domains, and delivers role-projected remediation guidance without ever risking money, state mutation, or unverified external state transitions.
- **AI Safety Invariant:** AI models and generative text layers **MUST NOT** decide infrastructure actions or alter operational outcomes. All classification, retry eligibility, failure ownership, and financial safety flags are calculated strictly by deterministic rule evaluation prior to any text rendering.

---

### 1. ARCHITECTURE & DESIGN PRINCIPLES

1. **Pure Read-Only Engine (`FailureIntelligenceService`)**:
   - `FailureIntelligenceService.classifyFailure(...)` accepts raw execution signals (`http_status`, `meta_error_code`, `meta_error_subcode`, `meta_error_type`, `network_exception_type`, `publishing_stage`, `current_publish_status`, `rollback_status`, `external_outcome`, `financial_state`, `raw_message`, `correlation_id`, `response_headers`).
   - Produces a normalized, immutable `FailureIntelligenceContract`.
   - **Zero DB writes, zero escrow state mutations, zero refund side-effects.**

2. **Role-Based Projection & Redaction**:
   - **Admin Projection:** Complete diagnostic transparency including `correlation_id`, `meta_error_code`, `meta_subcode`, `http_status`, `exact_exception_type`, `external_object_state`, `rollback_status`, `reconciliation_required`, `admin_action_required`, and `admin_guidance`.
   - **Host Projection:** Redacts correlation IDs, tokens, raw traces, Meta error codes, HTTP status codes, and internal diagnostic logs. Delivers plain-English explanations, host remediation steps, payment safety assurances, and estimated system actions.

3. **Financial & External Safety**:
   - Error classification never mutates financial state or refunds escrow balances directly.
   - `EXTERNAL_OUTCOME_UNKNOWN` remains visibly `EXTERNAL_OUTCOME_UNKNOWN` until active reconciliation provides authoritative proof of external Meta object state.

---

### 2. NORMALIZED ERROR TAXONOMY

| Error Class | Severity | Owner | Retryable | Host Action Req. | Admin Action Req. | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `RATE_LIMIT` | `MEDIUM` | `SYSTEM_INFRA_ERROR` | `true` | `false` | `false` | Meta Graph API rate limit hit. Exponential backoff retry eligible. |
| `TRANSIENT_INFRA` | `HIGH` | `SYSTEM_INFRA_ERROR` | `true` | `false` | `false` | Gateway timeout or TCP connection drop during dispatch. |
| `AUTH_EXPIRED` | `CRITICAL` | `SYSTEM_INFRA_ERROR` | `false` | `false` | `true` | System Master Access Token expired or invalidated. Requires Admin re-auth. |
| `POLICY_DISAPPROVED` | `HIGH` | `META_POLICY_ERROR` | `false` | `true` | `true` | Meta Special Ad Category (Housing) policy disapproval. Host edit required. |
| `DETERMINISTIC_ASSET_ERROR` | `MEDIUM` | `HOST_ERROR` | `false` | `true` | `false` | Creative image aspect ratio/resolution non-compliant. Host re-upload required. |
| `INVALID_PARAMETER` | `MEDIUM` | `HOST_ERROR` | `false` | `true` | `true` | Payload validation failed due to missing or invalid fields. |
| `BILLING_ERROR` | `CRITICAL` | `PAYMENT_GATEWAY_ERROR` | `false` | `false` | `true` | Master Ad Account credit limit reached or payment method declined. |
| `PERMISSION_ERROR` | `CRITICAL` | `ADMIN_ERROR` | `false` | `false` | `true` | Master System User lacks required Page or Ad Account management permissions. |
| `EXTERNAL_OUTCOME_UNKNOWN` | `HIGH` | `SYSTEM_INFRA_ERROR` | `false` | `false` | `true` | Response timeout during write. Requires active reconciliation. |
| `RECONCILIATION_FAILURE` | `CRITICAL` | `ADMIN_ERROR` | `false` | `false` | `true` | Automated rollback or reconciliation failed to clean up external objects. |
| `INTERNAL_SYSTEM_ERROR` | `HIGH` | `SYSTEM_INFRA_ERROR` | `true` | `false` | `true` | Internal application server or DB exception during processing. |
| `UNKNOWN` | `MEDIUM` | `SYSTEM_INFRA_ERROR` | `false` | `false` | `true` | Unclassified operational exception fallback. |

---

### 3. SAMPLE HOST GUIDANCE EXAMPLES

1. **Policy Disapproval (`POLICY_DISAPPROVED`)**:
   - **Friendly Delivery State:** `Action Required: Policy Re-check Needed`
   - **Host Action Required:** `true`
   - **Host Guidance:** `ACTION REQUIRED: Ad text or targeting flags require adjustment under Meta Housing Policy. Please update prohibited claims and re-submit.`
   - **Financial Safety:** `Escrow funds held safely; money is 100% protected.`

2. **Asset Failure (`DETERMINISTIC_ASSET_ERROR`)**:
   - **Friendly Delivery State:** `Action Required: Media Adjustment Needed`
   - **Host Action Required:** `true`
   - **Host Guidance:** `ACTION REQUIRED: Creative image does not meet Meta resolution constraints. Please upload high-resolution 1:1 media.`

3. **Rate Limit (`RATE_LIMIT`)**:
   - **Friendly Delivery State:** `Retrying Delivery Setup`
   - **Host Action Required:** `false`
   - **Host Guidance:** `Temporary high network traffic. Our automated queue is retrying setup automatically; no action required.`

---

### 4. SAMPLE ADMIN GUIDANCE EXAMPLES

1. **Auth Expired (`AUTH_EXPIRED`)**:
   - **Error Class:** `AUTH_EXPIRED`
   - **HTTP Status:** `401` | **Meta Error Code:** `190` | **Subcode:** `460`
   - **Correlation ID:** `corr_auth_999`
   - **Admin Action Required:** `true`
   - **Admin Guidance:** `ACTION REQUIRED: Meta System Master Access Token expired or invalid. Re-authenticate Meta OAuth in Admin Settings.`

2. **Unknown External Outcome (`EXTERNAL_OUTCOME_UNKNOWN`)**:
   - **Error Class:** `EXTERNAL_OUTCOME_UNKNOWN`
   - **External Object State:** `UNVERIFIED_EXTERNAL_OBJECTS`
   - **Reconciliation Required:** `true`
   - **Admin Guidance:** `ACTION REQUIRED: External outcome unknown. Run active reconciliation or verify Meta campaign ID manually.`

---

### 5. CERTIFICATION TEST MATRIX

| Test ID | Test Scenario | Result |
| :--- | :--- | :--- |
| **Test 1** | Rate-limit classification (`RATE_LIMIT`) | **PASS** |
| **Test 2** | Network timeout classification (`TRANSIENT_INFRA`) | **PASS** |
| **Test 3** | OAuth/auth classification (`AUTH_EXPIRED`) | **PASS** |
| **Test 4** | Policy error classification (`POLICY_DISAPPROVED`) | **PASS** |
| **Test 5** | Asset failure classification (`DETERMINISTIC_ASSET_ERROR`) | **PASS** |
| **Test 6** | Invalid parameter classification (`INVALID_PARAMETER`) | **PASS** |
| **Test 7** | Unknown external outcome (`EXTERNAL_OUTCOME_UNKNOWN`) | **PASS** |
| **Test 8** | Rollback failed (`RECONCILIATION_FAILURE`) | **PASS** |
| **Test 9** | Reconciliation required flag correctness | **PASS** |
| **Test 10** | Host remediation ownership (`HOST_ERROR`) | **PASS** |
| **Test 11** | Admin remediation visibility in control center service | **PASS** |
| **Test 12** | Financial safety remains unchanged by error classification | **PASS** |
| **Test 13** | AI explanation cannot change operational outcome | **PASS** |
| **Test 14** | Tenant isolation (Host 2 blocked with 403) | **PASS** |
| **Test 15** | Correlation ID visible only to Admin | **PASS** |
| **Test 16** | Retry eligibility correctness | **PASS** |
| **Test 17** | Existing P0 regression check | **PASS** |
| **Test 18** | Existing Phase 2.6 regression check | **PASS** |

---

### 6. CERTIFICATION SIGN-OFF

- **Total Suite Tests:** 18 / 18 PASSING
- **Linter Status:** Clean (0 errors, 0 warnings)
- **Applet Compilation:** Succeeded
- **Milestone 3 Execution:** **COMPLETE & CERTIFIED**
