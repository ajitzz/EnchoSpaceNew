# ENCHO ENGINEERING CONSTITUTION
**Status:** Active | **Last Updated:** 2026-08-07

## 1. Executive Summary

### What ENCHO is
ENCHO is a fully integrated, enterprise-grade property hosting web application operating on a unified account model (similar to Airbnb/Booking.com). It enables seamless property booking (Guest mode) and property listing (Host mode).

### Vision
To empower property hosts with a "One-Click Walled Garden Marketing Engine," allowing them to launch professional Meta and Google Ads campaigns effortlessly without needing external marketing agencies or complex ad manager setups.

### Mission
To provide an ecosystem where high-quality property listings are matched with high-intent leads generated through automated, AI-optimized marketing, maximizing occupancy rates and host revenue while capturing a sustainable optimization fee.

### Long-term Goals
- Become the industry standard for automated property marketing.
- Expand global footprint with localized compliance and payment routing.
- Evolve AI capabilities for hyper-personalized dynamic creative optimization (DCO) and predictive pricing.

### Business Model
- **SaaS/Commission Hybrid:** When a host funds an ad campaign (e.g., $100), Encho retains an "AI Optimization & Management Fee" (e.g., 15%), with the remainder directly funding the ad network.
- **Walled Garden CRM:** Leads are captured directly into the ENCHO ecosystem, ensuring transactions and bookings occur on-platform, protecting the commission structure.

---

## 2. Product Architecture

### Guest System
Property discovery, search, filtering, booking flow, guest messaging, and itinerary management.

### Host System
Property listing creation, amenity configuration, pricing management, availability calendar, host inbox, and the "Dopamine-driven" Host Marketing Dashboard.

### Admin Dashboard
Centralized command center for platform administrators to moderate properties, approve/reject marketing campaigns, manage users, and monitor financial transactions.

### Marketing Engine (The Core Differentiator)
A sophisticated pipeline allowing hosts to fund campaigns, which are then pre-vetted by an AI Gatekeeper, approved by Admins, and dispatched via a Master Encho Ad Account to Meta (and Google Ads).

### Walled Garden CRM
An integrated inbox that captures leads from marketing campaigns. It aggressively masks external contact info (phone/email) to prevent platform circumvention. Includes AI Intent Scoring.

### Payments & Wallet
A hybrid Geo-Router (Stripe for international, Razorpay for India) with strict idempotency, 3D Secure verification, and an internal ledger ("Trapped Cash" Wallet) for unspent funds and refunds.

---

## 3. System Architecture

- **Frontend:** Modern SPA/SSR framework (React/Vite). Responsive, mobile-first design.
- **Backend:** Node.js (TypeScript) server (`server.ts`). Handles API routes, WebSockets, and background tasks.
- **Database:** Neon Postgres (Relational). Enforces strict Row-Level Security (RLS) to isolate host data.
- **AI Integration:** Google Gemini API (via `@google/genai`) for Gatekeeper compliance, copywriting, and intent scoring.
- **External Services:**
  - Meta Marketing API (Graph API v19.0)
  - Stripe / Razorpay (Payments)
- **Real-time:** WebSockets (`socket.io`) for instant notifications (e.g., campaign approvals, new leads).
- **Asynchronous Processing:** Background cron jobs for Escrow release, Dynamic Creative Optimization (DCO), and analytics rollups.

---

## 4. Meta Marketing Engine (Definitive Specification)

This pipeline ensures that only high-quality, compliant ads are published to Meta, protecting the Master Ad Account from bans.

**Pipeline Flow:**
1. **Host Draft:** Host configures budget and targeting in the dashboard.
2. **AI Compliance (Gatekeeper):** Gemini AI grades the listing copy, media, and targeting. If score < 8/10, auto-rejected with feedback.
3. **Pending Admin:** Campaign enters the Admin queue.
4. **Admin Approval:** Human admin reviews the AI-approved campaign.
5. **Backend Publish Engine:** Kicked off post-approval.
6. **Meta Campaign Creation:** (`/campaigns`) Objective: OUTCOME_LEADS, HOUSING category.
7. **Meta Ad Set Creation:** (`/adsets`) Enforces HOUSING rules (Age 18-65, strict geo-radius).
8. **Meta Creative Creation:** (`/adcreatives`) Uploads 1:1, 9:16, 16:9 images. Assembles Asset Feed Spec for DCO. Attaches Lead Gen Form.
9. **Meta Ad Creation:** (`/ads`) Links Ad Set and Creative. Starts in PAUSED state.
10. **Publish / Active:** Ad status updated to ACTIVE (based on payment/escrow clearance).
11. **Webhook Sync:** Asynchronous updates from Meta regarding campaign performance.
12. **Insights Synchronization:** Cron jobs aggregate clicks/impressions.
13. **Dashboard Update:** Host UI reflects real-time metrics ("Fuel Gauge").
14. **CRM Integration:** Meta Lead Webhooks inject leads directly into the ENCHO Inbox.

**Failure & Recovery:**
- If any Meta API call fails, the pipeline aborts. The error is logged with a specific `correlationId` and `fbtrace_id`.
- The system must support rollback of partially created objects to prevent orphan resources.

---


## 4.5 AI Campaign Copilot & Live Compliance Engine
To proactively prevent Meta rejections, the AI Campaign Copilot evaluates host campaigns in real-time.
- Continuous Validation: As the host edits, Gemini evaluates the draft against Meta Housing Policies and ENCHO standards.
- Live Scoring: Returns an overall score (0-100) and breakdown (Copy, Media, Compliance, Targeting, Landing Page).
- Auto-Fix: Generates one-click improvements for non-compliant fields.
- Admin Reporting: Submits the AI Risk Report directly to the Admin Moderation Dashboard.
- Learning Engine: Inject recent Meta API failures into the AI's context window to prevent repeated errors.


## 5. State Machines

### Marketing Campaign State Flow

* `DRAFT`: Initial creation by host.
* `PENDING_AI`: Awaiting Gemini evaluation.
* `AI_REJECTED`: Failed Gatekeeper check.
* `PENDING_ADMIN`: Passed AI, awaiting human review.
* `ADMIN_REJECTED`: Rejected by human admin.
* `ASSET_PREP`: Gathering and resizing media.
* `CAMPAIGN_CREATED`: Meta Campaign ID generated.
* `ADSET_CREATED`: Meta Ad Set ID generated.
* `CREATIVE_CREATED`: Meta Creative ID generated.
* `AD_CREATED`: Meta Ad ID generated.
* `PUBLISHED`: Successfully transmitted to Meta.
* `ACTIVE`: Ad is live and spending.
* `PAUSED`: Paused manually or via Smart Auto-Pause (occupancy full).
* `FAILED`: Critical failure during dispatch.
* `ROLLED_BACK`: Partial creation cleaned up safely.
* `CANCELLED`: Terminated by Host/Admin, funds refunded to Wallet.

---

## 6. Database Standards

- **Core Tables:** `host_marketing_campaigns`, `host_wallets`, `wallet_transactions`, `admin_audit_logs`.
- **Primary Keys:** UUIDs or Auto-incrementing Integers depending on legacy constraints.
- **Tracking:** All external IDs (e.g., `meta_campaign_id`) must be stored persistently.
- **Audit:** The `admin_audit_logs` table is immutable. Every state change by an admin must record `previous_state`, `new_state`, and `admin_id`.
- **Soft Deletes:** Prefer status updates (e.g., `status = 'deleted'`) over hard row deletions for historical integrity.

---

## 7. API Standards

- **RESTful:** Standard HTTP methods (GET, POST, PUT, PATCH, DELETE).
- **Authentication:** JWT tokens via Authorization header.
- **Validation:** All incoming payloads must be strictly validated before processing.
- **Error Format:** Consistent JSON structure: `{ "error": "Message", "code": "ERR_CODE" }`.
- **Idempotency:** Payment endpoints and publish endpoints MUST use idempotency keys to prevent double-spending or duplicate publishing.

---

## 8. Engineering Standards

1. **No Fake Meta IDs:** The system must never fabricate `act_` or `camp_` IDs outside of explicitly flagged sandbox/mock environments. Production code must halt if a real ID is not returned.
2. **No Swallowed Exceptions:** `catch` blocks must log the error completely and propagate actionable feedback.
3. **Always Validate:** Pre-flight checks must run before the first Meta API call (check tokens, page IDs, image accessibility).
4. **Traceability:** Every publish attempt requires a unique `Correlation ID`.
5. **No Orphan Resources:** A failure at the `Ad` level must trigger a rollback or pause of the `Ad Set` and `Campaign`.

---

## 9. Observability Standards

- **Tracing:** Meta API dispatch must log `[META TRACE <correlationId>] Step | Payload`.
- **Redaction:** Access tokens and base64 image bytes MUST be redacted from logs.
- **Metrics:** Track API latency, rejection rates, and Gatekeeper approval ratios.
- **Audit Trails:** Database triggers or application-level logging for all financial and campaign state changes.

---

## 10. Security Standards

- **Row Level Security (RLS):** Enforced in Postgres to ensure a compromised host account cannot query another host's data.
- **Secret Management:** API keys (Gemini, Meta, Stripe) reside strictly in server environment variables. Never exposed to the client.
- **Walled Garden Enforcement:** The CRM must aggressively parse and redact external phone numbers, emails, and URLs to prevent off-platform booking.
- **Fraud Escrow:** New campaign funds are held in a 24-hour escrow before Meta dispatch to mitigate stolen credit card chargebacks.

---

## 11. Reliability Standards

- **Fail-Fast:** If pre-flight validation fails, do not touch the Meta API.
- **Retry Policy:** Transient database or network errors should employ exponential backoff with jitter.
- **Dead Letter Queue (DLQ):** Failed inbound webhooks (from Meta leads) must be stored securely for manual replay.
- **Circuit Breaker:** The "Smart Auto-Pause" prevents ad spend when a property is fully booked.

---

## 12. Testing Standards

- **Validation Testing:** Ensure payload builders generate strict HOUSING compliant JSON.
- **Failure Simulation:** Test handling of Meta 400 (Bad Request), 429 (Rate Limit), and 500 errors.
- **Idempotency Testing:** Simulate double-clicks on the "Approve & Launch" button.

---

## 13. Incident History

| Incident ID | Date | Symptoms | Root Cause | Files Changed | Permanent Fix | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| INC-001 | 2026-08-07 | Campaign created, but Ad Set, Creative, Ad missing. Meta API Rejection. | TBD (Under Forensic Investigation) | `server.ts` | TBD | Investigating |
| INC-002 | 2026-08-07 | SyntaxError: "[object Object]" is not valid JSON on opening Publishing Queue and Transaction Inspector. | `JSON.parse` called directly on `request_payload`/`response_payload` which were auto-parsed JavaScript objects returned by node-postgres. | `components/AdminOpsControlCenter.tsx` | Replaced direct `JSON.parse` with `safeJsonFormat` defensive formatter handling Objects, strings, and null values without throwing. | Resolved |

---

## 14. Architecture Decision Record (ADR)

| Decision # | Date | Problem | Chosen Solution | Reason | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ADR-001 | 2026-08-07 | Unclear Meta API failures | Implemented strict Correlation ID tracing | Need exact forensic evidence of API failure | Active |
| ADR-002 | 2026-08-07 | Master Ad Account Risk | Single Encho Ad Account with AI Gatekeeper | Host API keys are too volatile; protects ENCHO platform | Active |

---

## 15. Definition of Done (Meta Publishing Engine)

The Meta Publishing Engine is NOT complete until:
- [ ] Campaign creation verified.
- [ ] Ad Set creation verified.
- [ ] Creative creation verified.
- [ ] Ad creation verified.
- [ ] Publish verified.
- [ ] Insights synchronized.
- [ ] Dashboard synchronized.
- [ ] CRM synchronized.
- [ ] No orphan Meta objects (Rollback engine active).
- [ ] Idempotent publishing verified.
- [ ] Correlation IDs verified in logs.

---

## 16. Development Phases

**Phase 1: Architecture & Tracing (Current)**
- Objectives: Establish visibility into the Meta API pipeline. Stop blind failures.
- Completed: Inject Correlation IDs, strict payload logging, pre-flight checks.
- Remaining: Identify Root Cause of INC-001.

**Phase 2: Reliability & Rollback**
- Objectives: Ensure idempotent publishing, state transition invariants (P0-1 through P0-5), and time-series analytics rollups (Phase 2.6).
- Completed:
  - P0-1: Rollback Semantics & Quarantine Invariants
  - P0-2: Unknown Outcome & Quarantine Guard
  - P0-3: Reconciliation & Recovery Worker
  - P0-4: Centralized FSM Bypass Remediation
  - P0-5: Atomic Immutable Event Ledger
  - Phase 2.6 Milestone 1: Campaign Analytics Aggregation & Time-Series Rollup (`campaign_raw_event_logs`, `campaign_daily_rollups`, `runAnalyticsRollup` with UTC occurrence date extraction and composite `campaign_id + event_date` grouping, tenant-isolated analytics endpoints) — **Remediated & Certified Green**

**Phase 3: DCO & AI Expansion**
- Objectives: Fully dynamic creative optimization and predictive pricing.

---

## 17. Future Roadmap

**Immediate:** Phase 2.6 Milestone 2 — Lead Intent Scoring & Walled Garden CRM Analytics.
**Near Term:** Multi-channel alerting (SMS/Push) for new leads; Razorpay routing completion.
**Long Term:** Google Display Network retargeting pipeline.

---

## 18. Living Document Rules

1. Update this document first (or immediately after implementation) upon architectural changes.
2. Record all Architecture Decisions (ADR).
3. Log all production incidents.
4. This document is the absolute source of truth. Do not rely on AI conversation memory.



## 4.6 Meta Campaign Engineering Brain
The AI Campaign Copilot has been upgraded to a full Campaign Engineering Brain.
Capabilities include:
- **Meta Policy Intelligence Engine**: Real-time evaluation against HOUSING and CREATIVE policies defined in the `/docs/meta` knowledge layer.
- **Media Intelligence**: Pre-submission analysis of image resolution, blur, text overlay %, and aspect ratios.
- **Landing Page Inspector**: Validates the destination URL for 200 HTTP status and broken link prevention.
- **Audience & Budget Engineering**: Provides concrete estimates for Audience Size, Expected CPM, Recommended Daily Budget, Expected Leads, and CPL.
- **Confidence Engine**: Calculates expected Approval Confidence, CTR, CPC, and Lead Quality before submission.
- **Learning Engine 2.0**: Automatically injects recent Meta API successes (200 OK) and failures (400+ errors) into the AI's prompt context so it learns dynamically over time.
- **AI Rewrite Engine**: Offers 1-click apply fixes for Headings, Primary Text, Descriptions, and CTA that violate Meta policies or underperform.

## Architecture Decision Record (ADR) Additions
| Decision # | Date | Problem | Chosen Solution | Reason | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ADR-003 | 2026-08-07 | Meta API Policy Rejections | Live Preflight & AI Engineering Brain | Waiting for Meta to reject a payload hurts Master Ad Account standing. Preventing it client-side is safer. | Active |
| ADR-004 | 2026-08-11 | High-frequency analytics DB degradation | Raw Event Logging + Daily Upsert Rollup | Isolates write deltas into `campaign_raw_event_logs` and aggregates into `campaign_daily_rollups` to protect query performance. | Active |
