# KB-0002: ENCHO Admin Operations Control Center Documentation

## Executive Summary

The **Admin Operations Control Center** is the primary operational command post designed to safeguard the **ENCHO Master Ad Account** on Meta (Facebook & Instagram) and Google Ads. It provides real-time diagnostics, forensic tracing, emergency kill switches, dead letter queue management, and idempotent replay mechanisms for all automated ad publishing transactions.

---

## 1. System Architecture & Topology

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     ENCHO Admin Operations Control Center                       │
├─────────────────┬──────────────────┬─────────────────┬──────────────────────────┤
│ System Health   │ Queue & Inspector│ Forensic Trace  │ Emergency Kill Switch    │
└────────┬────────┴────────┬─────────┴────────┬────────┴────────────┬─────────────┘
         │                 │                  │                     │
         ▼                 ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Express Server Operational Endpoints                      │
│ - GET  /api/admin/marketing/health        - POST /api/admin/marketing/kill-switch  │
│ - GET  /api/admin/marketing/transactions  - POST /api/admin/marketing/replay/:tx  │
│ - GET  /api/admin/marketing/dlq           - POST /api/admin/marketing/dlq/resolve │
│ - GET  /api/admin/marketing/traces        - POST /api/admin/marketing/rollback    │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Engine & Meta Graph API v20.0                     │
│ - meta_publishing_transactions (State Machine & Idempotency)                    │
│ - meta_api_traces (Sanitized HTTP Request/Response Logs & fbtrace_id)            │
│ - meta_publishing_dlq (Dead Letter Queue & Replay Triggers)                      │
│ - admin_audit_logs (Immutable Operator Action Trail)                            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Operational Sections

### 2.1 System Health
- **Meta Graph API v20.0 Connectivity**: Pings `act_<META_AD_ACCOUNT_ID>` to verify connection, token validity, and account status (`1 = ACTIVE`).
- **Credential Hygiene**: Verifies System User access token, Page ID, and Instagram Account ID without exposing raw credentials to the client.
- **Emergency Publishing Kill Switch**: Global toggle (`process.env.META_PUBLISHING_PAUSED`) allowing administrators to instantly halt all outgoing Meta publishing dispatches.

### 2.2 Publishing Queue & Transaction Inspector
- Groups transaction states: `PENDING`, `PRECHECK_RUNNING`, `PUBLISHING`, `SUCCESS`, `FAILED`.
- **Hierarchy Inspector**: Visualizes object relationships:
  `Campaign (meta_campaign_id)` -> `Ad Set (meta_adset_id)` -> `Creative (meta_creative_id)` -> `Ad (meta_ad_id)`.
- **Redacted Trace Logs**: Shows HTTP method, endpoint, status code, latency (ms), and `fbtrace_id`. Payload secrets (`access_token`, image byte data) are redacted (`REDACTED`).

### 2.3 Forensic Trace View
- Step-by-step visual pipeline timeline: `[PRECHECK]` -> `[CAMPAIGN]` -> `[ADSET]` -> `[IMAGE UPLOAD]` -> `[CREATIVE]` -> `[AD]` -> `[PUBLISH]`.
- Failure callout details: Failed stage, Meta error code/subcode, root cause, and cascading rollback execution outcome.

### 2.4 Dead Letter Queue (DLQ) & Replay Engine
- Captures unhandled or repeated failures in `meta_publishing_dlq`.
- **Replay Control**: Replays a failed transaction via `POST /api/admin/marketing/replay/:transactionId` while preserving correlation ID, original campaign metadata, and idempotency protection to prevent duplicate campaign creation on Meta.

### 2.5 Rollback Monitor & Manual Cleanup
- Tracks cascading deletion of created Meta resources when downstream steps fail.
- Includes manual deletion endpoint (`POST /api/admin/marketing/rollback/:metaId`) for cleaning orphaned objects from Meta Ads Manager.

### 2.6 AI Risk & Compliance Panel
- Evaluates Gemini AI precheck ratings (Quality, Meta Compliance, Target Location Accuracy, Policy Risk).
- Explicitly labeled as "AI Predictions (Not Guarantees)".

---

## 3. Security & Safety Model

1. **Role-Based Authorization**: All operational endpoints enforce `req.user?.role === 'admin'`.
2. **Immutable Audit Trail**: Operator actions (kill switch toggles, campaign approvals, rejections, DLQ resolutions, manual rollbacks) are logged to `admin_audit_logs`.
3. **Double-Spend & Idempotency Protection**: Replay triggers re-use `idempotency_key = publish_meta_camp_<id>` with row-level database locking (`FOR UPDATE`).
4. **Secret Redaction**: Credentials and sensitive data are sanitized in memory before writing to `meta_api_traces`.

---

## 4. Verification Evidence

The Admin Operations Control Center and underlying Meta Publishing Engine passed all 17 automated integration & regression tests:

```
======================================= ENCHO META REGRESSION FRAMEWORK V1.0 =======================================
✅ Database connection established.
Running test: [Successful Path]...                 ✅ PASS
Running test: [Campaign Creation Failure]...       ✅ PASS
Running test: [Ad Set Creation Failure]...         ✅ PASS
Running test: [Creative Creation Failure]...       ✅ PASS
Running test: [Ad Creation Failure]...             ✅ PASS
Running test: [Rollback Execution]...               ✅ PASS
Running test: [Retry Execution]...                 ✅ PASS
Running test: [Duplicate Publish (Idempotency)]... ✅ PASS
Running test: [Expired Token Handling]...          ✅ PASS
Running test: [Invalid Page Error Handling]...     ✅ PASS
Running test: [Missing Lead Form Error Handling]...✅ PASS
Running test: [Invalid Image Handling]...          ✅ PASS
Running test: [Rate Limiting Exponential Backoff]..✅ PASS
Running test: [HTTP 5xx Recovery]...               ✅ PASS
Running test: [Network Timeout Handling]...        ✅ PASS
Running test: [Rollback Failure Safeties]...       ✅ PASS
Running test: [Recovery Success]...                ✅ PASS
======================================= 🚀 REGRESSION RUN COMPLETE: 17/17 PASSED =======================================
```
