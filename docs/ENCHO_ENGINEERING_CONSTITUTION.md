# ENCHO ENGINEERING CONSTITUTION
**Status:** Active | **Last Updated:** 2026-09-24

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
- **Disclosed Marketplace Model:** The property host is the accommodation supplier. Encho operates as a disclosed marketplace and collection agent, generating invoices on the host's behalf.
- **Guest Pricing:** Guests never pay Encho booking commissions or payment gateway surcharges. The price quoted is the price charged.
- **Host Booking Commission:**
  - **Flex Plan:** Default 15% booking commission (admin-configurable, snapshotted at booking confirmation) deducted from host payouts.
  - **Growth Plan:** ₹4,999 + GST per property per rolling 30-day period. Bookings confirmed during active Growth retain 0% booking commission.
- **Advertising Engine — founder direction updated 2026-09-13:** Optional campaigns recover defined campaign costs C plus an admin-selected profit markup p on those costs: profit = C × p; charge for that cost base = C × (1 + p). Intended introductory markup: 3–5%. At 5% on ₹10,000 costs, profit is ₹500 and charge is ₹10,500. This supersedes the earlier fixed 15% advertising-fee direction for future design. Cost/tax scope, charge-dependent fees, rounding, recognition/refund and variance rules remain to be specified; see HARVO section 23 and decisions HARVO-008/009. Existing accepted contracts and live rates are unchanged, and no implementation or legal gate is cleared by this decision.
- **Walled Garden CRM:** Leads and inquiries remain on-platform to convert directly into verified reservations.

---

## 2. Product Architecture

### Guest System
Property discovery, search, filtering, booking flow, guest messaging, and itinerary management.

### Host System
Property listing creation, amenity configuration, pricing management, availability calendar, host inbox, and the "Dopamine-driven" Host Marketing Dashboard.

### Admin Dashboard
Centralized command center for platform administrators to moderate properties, approve/reject marketing campaigns, manage users, and monitor financial transactions.

### Marketing Engine (The Core Differentiator)
A managed-distribution pipeline in which hosts select bounded commercial intent while Encho's scoped staff, versioned programs and server-side provider adapters perform the dangerous configuration. Zero Host OAuth is the user experience; it is not permission to place unrelated end advertisers in one serving account. Google campaigns require provider-compliant MCC/client-account mapping unless Encho obtains explicit advertiser-of-record approval. Meta account topology remains capability- and contract-bound.

### Walled Garden CRM
An integrated guest-host conversation and service system that keeps inquiry, trip and booking context on-platform. Message delivery, staff access and AI assistance must be durable, disclosed and truth-bound. Contact-detail handling, retention and assisted-sales policy require explicit legal/product approval; the application must not silently alter guest meaning under an unapproved anti-circumvention rule.

### Payments & Wallet
Razorpay is the current India-oriented payment adapter; Stripe/international routing remains a future provider/legal decision. Every accepted payment or advertising amount uses immutable quotes, strict idempotency and double-entry accounting. Unused advertising funds may not be automatically trapped, transferred between offers or converted to platform credit without an explicit host-accepted financial contract and approved refund/tax policy.

---

## 3. System Architecture

- **Frontend:** React/Vite SPA with route-level performance and accessibility budgets. Server rendering is not a current production fact.
- **Backend:** Node.js/TypeScript modular monolith. `server.ts` remains the legacy composition root while canonical domain routers/services are extracted additively. Dedicated workers execute durable asynchronous jobs.
- **Database:** Neon Postgres (Relational). Enforces strict Row-Level Security (RLS) to isolate host data.
- **AI Integration:** Google Gemini API (via `@google/genai`) through bounded structured ports for evidence and drafts. AI has no approval, publication, provider-ID, financial or activation authority.
- **External Services:**
  - Meta Marketing API through versioned capability releases rather than a Constitution-hardcoded Graph version.
  - Google Ads API through versioned capability releases and provider-compliant advertiser-account bindings.
  - Razorpay for the current approved India scope; other rails remain gated.
- **Real-time:** WebSockets (`socket.io`) are a delivery optimization. PostgreSQL state and transactional outbox evidence remain canonical.
- **Asynchronous Processing:** Fenced, leased worker lanes with bounded retries, jitter, DLQ/reconciliation and safety-priority operations.

---

## 4. Managed Marketing Engine (Current Definitive Boundary)

This pipeline supports exact released Meta and Google workflows while protecting provider identities, host funds and canonical guest truth. AI/human review reduces risk but cannot guarantee provider approval or prevent an account restriction.

**Pipeline Flow:**
1. **Host draft:** the host selects an owned canonical offer or property-discovery subject, approved/future-reviewed creative, plain-language outcome, dates, accepted budget and bounded released feeder preferences.
2. **Immutable evidence:** the server resolves offer price/inventory/facts/media, strategy/program release, provider account capability and finance scope into a revision-bound snapshot.
3. **Deterministic and AI preflight:** deterministic checks are authoritative. AI returns structured evidence, assumptions, confidence and recommended corrections; a failed/uncertain AI call routes to human review rather than approval.
4. **Independent human review:** scoped staff review exact creative bytes/claims/rights, targeting, finance, provider capability and revision hash. An actor cannot approve their own protected work where maker/checker applies.
5. **Funding and risk:** verified captured/reserved funds, exposure caps and risk release are required before spend activation.
6. **Paused provider creation:** an idempotent command compiles the exact bound revision and creates only supported Meta or Google resources in a non-spending state.
7. **Authenticated readback:** requested, compiled and observed provider configuration are compared; drift or an ambiguous remote write enters reconciliation.
8. **Guarded activation:** a separately authorized operation activates the exact read-back revision. Safety pause remains available even if optional strategy evidence later fails.
9. **Observation:** provider status and metrics are observed on their actual delayed cadence; first-party visits, inquiries and bookings remain separate canonical evidence.
10. **Host projection:** every campaign displays desired/observed state, source, reporting window, freshness, spend and consented outcomes. No generic `LIVE` badge proves delivery.
11. **Inventory/finance protection:** unavailable inventory queues a verified provider pause; invoices, corrections, refunds and overrun settle through the journal.
12. **CRM integration:** consented provider or first-party inquiries enter the canonical Encho conversation service and durable notification outbox.

**Failure & Recovery:**
- External failures retain correlation and provider trace identifiers with secrets/PII redacted.
- A possibly successful remote write is never blindly retried or represented as failure. It enters `RECONCILIATION_REQUIRED` until readback establishes the outcome.
- Partially created resources are paused/quarantined and reconciled. Deletion is not assumed to be a safe rollback.

### Automatic Activation Policy (Policy B Specification)
ENCHO strictly enforces **Policy B**:
1. **Safe Creation**: Campaign and AdSet objects are created on Meta in the `PAUSED` state to prevent accidental live-firing before escrow clearance, preflight verification, and admin approval.
2. **Explicit Activation Operation (`activateMetaCampaign`)**: Once approved and escrow-released, an explicit, idempotent, audited, read-after-write verified activation operation is executed.
3. **Hierarchy Verification**: The activation engine issues only capability-supported status mutations and verifies them by read-after-write. Encho records desired state separately from observed provider state and does not translate an enabled configuration into proof of delivery.
4. **Financial Safety**: Activation controls delivery status only and never alters financial parameters (`gross_host_charge`, `encho_fee_amount`, `escrow`, `meta_authorized_spend`).

---


## 4.5 AI Campaign Copilot and evidence boundary
The AI Copilot may evaluate canonical copy, media, targeting and landing evidence against the active provider/program policy and propose corrections.
- Scores and thresholds are versioned program hypotheses, not universal constitutional truth. A low score may block automatic progression under that released program; a missing/failed AI result never grants approval.
- AI output shows source hashes, assumptions, confidence, model/prompt/schema version and reviewer disposition.
- “Apply” creates a new host-visible draft revision; it never silently modifies an accepted revision.
- Provider failure evidence may inform future recommendations only after sanitization and evaluation. Runtime prompt injection is not an autonomous policy-learning mechanism.
- AI cannot approve itself, publish a strategy, activate spend, alter money, manufacture provider constants or guarantee conversion.


## 5. State Machines

### Canonical marketing workflow state

The revision-bound v2 workflow uses the persisted states below. Provider entity-creation steps and effective delivery remain separate evidence; they are not encoded as synthetic workflow success states.

* `DRAFT`, `EVALUATING`, `AI_REJECTED`, `PENDING_ADMIN`, `ADMIN_REJECTED`, `APPROVED`
* `PUBLISH_QUEUED`, `PROVIDER_PAUSED`, `ACTIVATION_QUEUED`, `PROVIDER_REVIEW`
* `LIVE`, `PAUSE_QUEUED`, `PAUSED`, `FAILED`, `RECONCILIATION_REQUIRED`, `CANCELLED`

`LIVE` is a workflow label retained for compatibility. User-facing projections must qualify it with requested/observed provider state, reporting source and freshness; it cannot by itself claim current impressions or spend.

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
- **Walled Garden Integrity:** CRM keeps canonical inquiry/booking context on-platform, but message transformation or contact-detail masking requires an approved, disclosed legal/product policy. Never fabricate, reverse or silently rewrite guest meaning.
- **Fraud Escrow:** New campaign funds are held in a 24-hour escrow before Meta dispatch to mitigate stolen credit card chargebacks.

---

## 11. Reliability Standards

- **Fail-Fast:** If pre-flight validation fails, do not touch the Meta API.
- **Retry Policy:** Transient database or network errors should employ exponential backoff with jitter.
- **Dead Letter Queue (DLQ):** Failed inbound webhooks (from Meta leads) must be stored securely for manual replay.
- **Circuit Breaker:** The "Smart Auto-Pause" prevents ad spend when a property is fully booked.

---

## 12. Testing Standards

- **Validation Testing:** Ensure payload builders match the exact versioned provider capability, account eligibility and approved program. No universal `HOUSING` classification is assumed.
- **Failure Simulation:** Test handling of Meta 400 (Bad Request), 429 (Rate Limit), and 500 errors.
- **Idempotency Testing:** Simulate double-clicks on the "Approve & Launch" button.

---

## 13. Incident History

13 September 2026 M1 note: the Google synthetic-success defects are source/test findings, not a demonstrated production incident. Their remediation and remaining acceptance scope are recorded in `docs/harvo/M1_VERIFICATION.md` and findings H-048–H-052/H-054. INC-001 is not closed by this work; no live Meta incident root cause is asserted.

| Incident ID | Date | Symptoms | Root Cause | Files Changed | Permanent Fix | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| INC-001 | 2026-08-07 | Campaign created, but Ad Set, Creative, Ad missing. Meta API Rejection. | TBD (Under Forensic Investigation) | `server.ts` | TBD | Investigating |
| INC-002 | 2026-08-07 | SyntaxError: "[object Object]" is not valid JSON on opening Publishing Queue and Transaction Inspector. | `JSON.parse` called directly on `request_payload`/`response_payload` which were auto-parsed JavaScript objects returned by node-postgres. | `components/AdminOpsControlCenter.tsx` | Replaced direct `JSON.parse` with `safeJsonFormat` defensive formatter handling Objects, strings, and null values without throwing. | Resolved |

---

## 14. Architecture Decision Record (ADR)

| Decision # | Date | Problem | Chosen Solution | Reason | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ADR-001 | 2026-08-07 | Unclear Meta API failures | Implemented strict Correlation ID tracing | Need exact forensic evidence of API failure | Active |
| ADR-002 | 2026-08-07 | Master Ad Account Risk | Historical single Encho serving-account assumption | Zero Host OAuth remains, but provider-compliant advertiser/account partitioning and explicit advertiser-of-record evidence now control | Superseded by ADR-CR1-001 |
| ADR-CR1-001 | 2026-09-23 | Complete three-sided release and provider concentration | Modular-monolith CR1 with canonical offer truth, scoped workforce IAM, durable CRM/outbox, immutable provider programs/account bindings and paused readback | Completes one Guest–Host–Staff truth loop without promising native-console parity or bypassing provider rules | Active |

---

## 15. Definition of Done (Managed Provider Publishing)

The supported Meta or Google publishing path is not complete until:
- [ ] Exact campaign revision, offer snapshot, creative package, program release, provider account binding and finance contract are immutable and accepted.
- [ ] Every exposed control is supported by provider schema, account eligibility, Encho compilation and readback evidence.
- [ ] Provider resources are created paused with stable idempotency and authenticated identity.
- [ ] Requested, compiled and observed configuration are compared; drift and unknown outcomes reconcile explicitly.
- [ ] Guarded activation and verified safety pause work without altering accepted finance scope.
- [ ] Telemetry models calibration, delay, correction, reporting window and stale state honestly.
- [ ] Host, staff and CRM projections consume the same canonical campaign/outcome identities.
- [ ] Partial/ambiguous resources are paused or quarantined; no deletion-based rollback is assumed.
- [ ] Correlation/causation, provider trace and actor evidence are present with secrets/PII redacted.
- [ ] The exact provider/account path passes a paused zero-spend canary and its operating runbook.

---

## 16. Development Phases

**Current authorized CR1 execution, 23 September 2026:** The founder advanced `docs/blueprints/ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md` into continuous Phase 3 execution through `docs/implementation/CR1_EXECUTION_PLAN.md`. Earlier paid-marketing authorizations remain historical foundations within CR1. The versioned HARVO workflow, cost-plus finance, provider adapters, AI/human review, host/admin studios and operational hardening are implemented only to the extent recorded in current verification. Legal/provider/runtime/pilot gates remain evidence-based and fail closed. The legacy phase labels/certifications below are historical; they do not override the CR1 plan or accept the guest track.

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
  - Phase 2.7 Milestones 1-9: Unified Canonical Truth Projection Engine, Dual Projection (Host Transparency vs Admin Ops Command Center), Root-Cause Failure Intelligence, Drift Detection Worker, and Financial Authorization Boundary Enforcement (`campaign_financial_contracts` with DB check constraints, Scenarios A-O adversarial test matrix certified) — **Completed & Certified Green**

**Phase 3: DCO & AI Expansion / Guest Booking V2 Architecture**
- Objectives: Fully dynamic creative optimization, Lead Intent Scoring, Walled Garden CRM Integration, and Guest Booking V2 Architecture.
- Active Track: Guest Booking Experience V2 (Scope: India domestic stays customer journey).
  - Status: Milestone 1 — ACCEPTED: Architectural Baseline; Milestone 2 — ACCEPTED: Public Projection, Canonical Routing & Privacy Baseline; Milestone 3 — ACCEPTED: Canonical Relational Room & Media Authority; Milestone 4 — ACCEPTED: Inventory Days & Atomic Holds.
  - Milestone 5: NOT STARTED — LEGALLY BLOCKED pending written Indian CA/tax-lawyer sign-off.
  - Milestone 6A: AWAITING INDEPENDENT ACCEPTANCE — GUEST PRESENTATION TRUTH & LUXURY UX FOUNDATION.
  - Milestone 6B: NOT STARTED — LEGALLY BLOCKED pending Milestone 5 and written Indian CA/tax-lawyer sign-off.
  - Milestones 7–15: NOT STARTED.
  - No claims of completion, certification, or production readiness permitted prior to formal independent acceptance.

---

## 17. Future Roadmap

### Active Track: Encho Stays — India Stays Customer Journey
- **Current Status:** Milestone 6A — Guest Presentation Truth & Luxury UX Foundation (AWAITING INDEPENDENT ACCEPTANCE).
- **Legally Blocked Milestones:** Milestone 5 (Immutable Quotes & Internal Settlement Snapshots) and Milestone 6B (Verified Quote and Booking Disclosure Layer) — NOT STARTED (LEGALLY BLOCKED pending written Indian CA/tax-lawyer sign-off).
- **Subsequent Milestones:** Milestones 7–15 — NOT STARTED.

### Historical / Marketing Engine Track (Superseded & Deferred)
- *Legacy Phase 2.6 Milestone 2:* Lead Intent Scoring & Walled Garden CRM Analytics (deferred post-Stays launch).
- *Legacy Near Term:* Multi-channel alerting (SMS/Push) for marketing leads; Razorpay campaign routing completion.
- *Legacy Long Term:* Google Display Network retargeting pipeline.

---

## 18. Living Document Rules

1. Update this document first (or immediately after implementation) upon architectural changes.
2. Record all Architecture Decisions (ADR).
3. Log all production incidents.
4. This document is the absolute source of truth. Do not rely on AI conversation memory.

## 19. Current Google paused publishing boundary — HARVO M1

The Google adapter now issues v25 REST operations for an explicitly configured Search campaign, ad group, responsive-search ad, keywords and geo/language criteria. All spend-bearing objects start PAUSED. `success` means paused creation was read back and durably recorded, not advertising is live. Requests require the server-configured serving customer and landing origin, exact published-listing ownership/destination, and explicit Search inputs. INR/USD are the supported M1 currencies; daily budget is distinct from total authorization. Existing financial contracts provide a ceiling only, never evidence of captured funding.

Short PostgreSQL transactions claim campaign-bound requests before network operations. Matching committed requests may replay; conflicting keys/payloads, abandoned requests, legacy entities without evidence and ambiguous external outcomes require reconciliation. No automatic claim takeover or re-creation. Provider identities must come from validated remote responses. Readback/persistence failures preserve uncertainty. Paused configuration, policy status and observed delivery remain distinct.

Live dispatch in server.ts remains unconditionally contained. Adapter control and DCO methods cannot claim successful changes; implementation awaits the later authorization/optimization milestones. Legacy conversion uploads are unavailable by default. Google read methods return provider-sourced results or explicit unknown/unavailable states. Structural reconciliation does not certify creative/targeting, account eligibility or live delivery.

M1 definition of done (local scope): explicit configuration and negative-path tests; actual transport/payload execution against isolated provider fixtures; real isolated PostgreSQL concurrency, replay and persistence tests; independent code review; full typecheck and build; synchronized evidence. These checks passed. Live provider acceptance, production RLS/load/restore validation, end-to-end financial/booking operation and UI acceptance remain later milestones. Existing guest legal gates remain intact.



## 4.6 Campaign engineering assistance
The Campaign Copilot may provide bounded media, landing-page, audience, budget, keyword, geography, policy and copy evidence for both supported providers. Estimates are hypotheses with source, cohort, window and confidence—not concrete performance promises. Provider failures may enter a sanitized evaluation corpus only through reviewed, versioned policy updates. A rewrite is a proposed new draft and receives the same fact, rights, AI and human review as host-authored text.

## Architecture Decision Record (ADR) Additions
| Decision # | Date | Problem | Chosen Solution | Reason | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ADR-003 | 2026-08-07 | Meta API Policy Rejections | Deterministic preflight plus evidence-bound AI and independent review | Prevent unsupported payloads before provider submission without granting AI approval or autonomous policy authority | Active, refined by CR1 |
| ADR-004 | 2026-08-11 | High-frequency analytics DB degradation | Raw Event Logging + Daily Upsert Rollup | Isolates write deltas into `campaign_raw_event_logs` and aggregates into `campaign_daily_rollups` to protect query performance. | Active |
| ADR-005 | 2026-08-14 | Split UI Divergence & State Drift | Dual-Projection Canonical Truth Engine | Serves single source of truth to both Host Transparency View and Admin Ops Command Center with role-scoped projections. | Active |
| ADR-006 | 2026-08-15 | Financial Risk & External Budget Over-spend | `campaign_financial_contracts` with DB Invariant Constraints | Enforces hard DB and runtime boundary: `gross_host_charge = encho_fee + meta_authorized_spend` & `configured_max <= authorized_spend`. Blocks external Meta over-spend. | Active |
| ADR-HARVO-MKT-001 | 2026-09-13 | Google synthetic creation/control/reporting and ambiguous-write replay | Authenticated v25 paused Search foundation with durable claims, exact destination binding and verified provider evidence; live dispatch stays contained | Prevent fabricated success and duplicate creation while subsequent funding/control milestones are implemented | Implemented and locally verified; live acceptance pending |

## 20. Current HARVO v2 authority — continuous execution, 13 September 2026

This section supersedes conflicting historical marketing capabilities and certification language above. The current implementation and limitations are recorded in `docs/harvo/CONTINUOUS_EXECUTION_VERIFICATION.md`, `docs/harvo/OPERATIONS_RUNBOOK.md` and the milestone plan. Historical AI predictions, synthetic metrics or a successful local test are not production authority.

The additive workflow is DRAFT → EVALUATING → AI_REJECTED or PENDING_ADMIN → APPROVED/ADMIN_REJECTED. Exact content revision, immutable quote, captured funds, risk hold and reserved budget remain independent. Publication uses PUBLISH_QUEUED → verified PROVIDER_PAUSED; activation uses ACTIVATION_QUEUED → observed PROVIDER_REVIEW. PAUSE_QUEUED/PAUSED and RECONCILIATION_REQUIRED retain actual operation identity and evidence. Configured ACTIVE does not establish current serving or fulfilled bookings. AI evaluation IDs/leases prevent expired or late reviews from changing later authority.

Money uses new integer-minor-unit finance tables, immutable policy/quote/capture/journal evidence, balanced entries and transactionally guarded available/reserved/refund-payable balances. Admin markup is prospective 3–5% of defined costs. Booking commission and legacy balances are separate. Refund requests and jobs commit together; only a matching original-provider final refund changes refund payable. Final ad-cost settlement requires trusted billing-close evidence. The documentary dual-control workflow described below is implemented; automated provider import and post-close correction handling remain unconnected.

Workers run in a separate explicit process with PostgreSQL claims, leases/fences and pending-job/revision checks. Unknown remote mutation is quarantined: a fence does not undo an HTTP request already sent. Signed webhook ingress persists minimal identifiers before acknowledgement; no provider/network query precedes durable receipt. Reporting retains unknown metrics and source freshness. Canonical booking events/corrections/outbox and actual conversion delivery transports exist. Trusted guest-checkout/capture and current-consent attribution authority remain unconnected; delivery stays blocked without those code-level verifier ports.

Authentication resolves persisted roles, verifies Google identity server-side and contains historical email/OTP/password shortcuts. Uploads require current user authority and immutable object keys; conditional S3 write/client/CORS support is part of the scoped hardening. Application DB roles must not be superusers or BYPASSRLS. No migration or live spending was performed by the local verification run.

Incident/findings record HARVO-CONT-001: independent local audit reproduced stale reservation/retry/read-state, payment-number/identity, webhook PII, interrupted-AI, legacy authorization and media-overwrite defects. These were corrected with bounded regression tests. No production compromise or financial loss was observed or asserted. Remaining configuration, settlement, checkout, storage deployment, model-quality and live-pilot evidence stay open.

ADR-HARVO-MKT-002: adopt additive revision-bound workflow and cost-plus ledger without importing synthetic legacy balances. ADR-HARVO-MKT-003: separate local fences from irreversible remote outcome; require verified identities/readback and quarantine. ADR-HARVO-MKT-004: replace impression-led success claims with explicit provider observations and canonical booking evidence; keep advanced optimization gated. ADR-HARVO-MKT-005: authenticated immutable media and minimized signed-event envelopes protect reviewed assets and sensitive information.

Definition of done: source and schema are synchronized; scoped adversarial contracts, real local PG/RLS/concurrency/restore tests, strict new-module checks and application build pass; host/admin browser acceptance is recorded; all external limitations are explicit. Production acceptance additionally requires real configured accounts, approved cost policy, canonical checkout/legal acceptance, actual bounded delivery/capture/refund/settlement and representative operating evidence. No completion percentage substitutes for those facts.

### HARVO-017 implementation refinement — 13 September 2026

The current marketing contract includes provider-origin Google targeting lookup, exact resource/label validation, immutable create-intent replay before read-only network verification, literal tenant-scoped history search and bounded keyset pagination. Marketing lookup and drafting budgets are atomically consumed in PostgreSQL (`014`), not independently reset per web instance. Grounded AI drafting cites existing listing phrases and requires explicit host application; it cannot change financial or publication authority.

Documentary accounting close (`012`) stores original immutable document bytes/hashes and source provenance, exact provider-account/campaign/revision and invoice allocations, and an independent named currently persisted finance administrator's review. Commit rechecks authenticated provider stop, immutable evidence, reservation, pending/unknown operations and the independent authority inside a single ledger transaction. Configured stop is not billing finality. Provider overrun and released funds follow the accepted quote/cost policy. A host sees only owned summary amounts. Invoice imports, accounting sign-off and later billing-correction treatment are not inferred from document upload.

Conversion delivery (`013`) uses pre-HTTP immutable destination/payload claims, Google Data Manager v1 purchases with destination diagnostics, Google Ads v25 order adjustments and Meta v26 Purchase CAPI. Unknown writes are never automatically resubmitted. Raw click identifiers exist only in accepted resolver memory and the outbound body; durable delivery records retain hashes, bounded receipts and account/action bindings. Canonical booking/capture and consent/attribution ports require accepted code integration; configuration strings cannot provide those ports. Meta correction/deletion limits remain explicit.

Live activation requires those source ports and the selected channel's destination. A persisted queued activation repeats the guard before provider dispatch. Meta's configured canonical Purchase pixel must match both the publisher identity and the observed ad-set promoted object before a spending operation; a changed destination preserves the separate safety-pause path. This does not establish Google account-goal linkage or provider conversion acceptance without the corresponding remote evidence.

Production builds place public Vite assets in `dist` and private compiled modules/migrations in `build/server`. Node24 is the defined image/runtime line. Web requests do not own legacy paid loops; the dedicated HARVO worker owns durable marketing work, canonical expired-hold cleanup, observations and the blocked-or-enabled canonical consumer. Worker progress/stall supervision and a bounded shutdown drain preserve unresolved remote outcomes. Health distinguishes process liveness from actual database/schema/RLS readiness; no production startup DDL is accepted as readiness. The deployment runbook and isolated compiled-process tests describe the current boundary.

ADR-HARVO-MKT-006: separate public/private artifacts and explicit worker ownership; reject unsafe role/schema readiness rather than concealing missing migrations. ADR-HARVO-MKT-007: documentary dual-control financial closure, with authenticated containment evidence distinct from final billing. ADR-HARVO-MKT-008: canonical conversion delivery claims/receipts and explicit absent checkout/consent authority. ADR-HARVO-MKT-009: provider-resolved targeting and grounded human-applied drafting, with shared quotas and tenant-scoped historical navigation.

Local finding record HARVO-GAP-001: deployment review reproduced wrong worker/public-artifact boundaries; compiled smoke reproduced symlinked entrypoint skipping startup. Integration review reproduced stale finance review UI and a search-debounce timer resetting initial pagination. These were corrected and scoped regression evidence is retained. This is a local engineering finding record, not a claim of an observed production incident. Existing guest phase/legal status remains unchanged. The Definition of Done in section20 still requires external operating and provider/financial/booking acceptance before a public launch claim.

## 21. Production remediation implementation — 20 September 2026

HARVO-026 authorizes execution of the reviewed remediation plan. Current implementation, evidence and open gates are maintained in [REMEDIATION_EXECUTION_VERIFICATION.md](harvo/REMEDIATION_EXECUTION_VERIFICATION.md).

**ADR:** Deployed marketing authority cannot be inferred from testing defaults, legacy booking rows or fabricated consent. Calendar guest availability is separate from private owner/admin records; canonical room-type capacity is not a physical-unit registry. Every pooled query/client uses explicit transaction-local authority. Calendar mutations retain idempotency receipts and immutable evidence. Delivery state, report availability, source freshness and funding/safety are independent observations. Unknown reporting coverage does not authorize blind spending.

**Incident register (source findings; no unverified production incident claim):** Unsafe defaults/composition, weakened role readiness, public calendar data, stale-selection exposure, inconsistent block release, fabricated payment identity, permissive pool/lead policy and coupled status/report persistence are addressed in local source. Remote effects and deployment are unverified. The earlier application/server compiler defects are corrected locally; full-repository, deployment and operating acceptance remain separate.

**ADR / current implementation addendum:** Private realtime subscriptions require signed sessions, persisted roles and participant checks; ongoing subscriptions are revalidated and role changes disconnect before any new authenticated packet can retain a privileged room. HTTP and Socket.IO share exact origin policy. Recovery inspection is read-only, admin/revision-bound and bounded; it is never permission to reset workflow or delete financial evidence. Guest/host/admin presentation uses supplied property facts and neutral missing-data states. The legacy client-calculated guest fee/tax checkout is unavailable pending accepted canonical pricing/payment; this does not alter a commercial or legal decision.

**Incident / verification addendum:** The original unrestricted socket joins and synthetic public listing/host-preview facts were source-proven defects, not proof of a production breach. Isolated checks now include 936 HARVO tests (including the realtime race and operational RLS fixes) and 33 guest presentation tests, plus 12 fixture browser screen/viewport combinations. Full lint and both typechecks pass. Migration 019 now forces RLS on the three operational tables with owned receipts/enqueue and trusted service claims/global work; immutable attempt/preference history is preserved. Seven real non-bypass-role tests and the restore drill pass. Production grants, wider caller audit, complete recovery actions, provider hierarchy evidence and canonical checkout/measurement remain unaccepted. See the execution evidence for exact build/smoke results and test limitations.

**Phase / Definition of Done:** Marketing remains in authorized Phase 3 with local adversarial validation. Release requires full checks, forced-RLS non-bypass-role tests, browser tenant switching, migration/grant verification, bounded provider/payment pilot and accepted genuine checkout/consent authority. Existing guest M5/M6B legal gates and historical milestone qualifications remain unchanged. No new milestone is accepted by this addendum.

## 22. Remaining execution — HARVO-028, 21 September 2026

The founder explicitly resumes Phase 3 after Boardroom HARVO-027. Scoped implementation and dated checks are recorded in [remaining execution verification](harvo/REMAINING_EXECUTION_VERIFICATION.md). Historical accepted milestone count remains five of ten; production readiness is not inferred from local tests.

**ADR-HARVO-MKT-010 — Evidence-bound pause recovery.** An administrator may adopt a previously COMMITTED v2 pause only with the exact original revision/job/correlation/account binding, no ambiguous competing or legacy operation, fresh authenticated whole-campaign PAUSED readback and transactionally revalidated authority/fences. Migration 020 stores immutable admin-only forced-RLS receipts. This updates only local containment/job state; no provider write, dedupe reset, funding release, quote mutation, activation or automatic account failover occurs. Preserve independent pre-existing safety conditions. Unknown publication/activation remains quarantined. This supplements the earlier read-only recovery inspection; it does not generalize to arbitrary workflow overrides.

**ADR-HARVO-MKT-011 — Hierarchy readiness is distinct from delivery.** Host/admin projections can expose verified hierarchy eligibility/review/blockage separately from live serving. Every accepted status read must match the provider/campaign and be current; failures retain historical evidence with a visible failed-attempt marker. Pausing an ad/group does not prove that the parent campaign stopped. Source coverage and final billing retain their separate authority.

**ADR-HARVO-MKT-012 — Isolated test entry and preserved failing gate.** Node 24 tests start from an environment allowlist, disable dotenv loading and separate real-PG marketing/guest fixtures from historical pg-mem fixtures. All suites remain in the default gate. Report artifacts cannot overwrite historical acceptance documents. The old fixed-database inventory benchmark is replaced with disposable migration-backed PostgreSQL and may no longer silently pass when unavailable. The green gate and remote promotion prerequisite remain required release evidence, not assumed configuration.

**Incident findings HARVO-EXEC-028 (local evidence, not a production-loss claim):** The former default test setup loaded ambient dotenv/shared pg-mem into current suites; a child inventory benchmark performed destructive cleanup against a fixed localhost URL and swallowed connection refusal. Status refresh failures could retain apparent current readiness, and a committed pause with lost local completion lacked a safe admin adoption path. The scoped changes above address these findings locally. The full historical test gate still fails and requires per-failure disposition; new code does not certify the untouched legacy surface.

**Definition of Done refinement:** Add immutable pause-recovery concurrency, demotion, original-account evidence and non-bypass-role tests; unknown-outcome refusal; hierarchy/readback identity and freshness tests; and actual host/admin mobile/desktop interaction checks. Migration/grant rollout, real recovery/restore drill, green whole-repository CI, configured promotion controls and independent external/provider/financial/guest acceptance remain mandatory. Guest legal phases and accepted commercial rules are unchanged.

**HARVO-EXEC-028 security follow-up:** The full run also exposed noncanonical Base64 aliases accepted by local upload-ticket verification. Verification now requires the exact signature spelling issued by the service before timing-safe MAC comparison. Deterministic alias/tampering regression tests pass. This is representation hardening, not evidence that a signature could be forged, and does not change the authorization payload or valid issued-ticket contract.

## 23. Search Portfolio and RFC integration — HARVO-031

The founder approves two products: dedicated property campaigns and opt-in pooled destination campaigns, with canonical property/collection landing pages and transparent allocation. The founder expressly authorizes the integrated SP0–SP7 blueprint and execution; this supersedes the later HARVO-029 Boardroom pause. Follow `docs/implementation/SEARCH_PORTFOLIO_SP0_SP1_BLUEPRINT.md` and the execution evidence, retaining the original RFC as proposal history.

**ADR-HARVO-MKT-013 — Product and evidence boundaries.** Canonical approved facts/media are the only creative authority. Signed opaque attribution references are integrity evidence, not proof of consent, human clicks, booking or payment. Pooled membership cannot itself debit a wallet or move a dedicated reservation. Provider-selected ad impressions and Encho-controlled collection exposure are distinct. Account proliferation is not an auction/policy workaround.

**Phase / Definition of Done:** Blueprint and local engineering are authorized now. SP0 requires a complete green release gate and operational proof; SP1 requires versioned contracts, tenant-safe projections and threat review. Keyword research starts read-only; overlap analysis starts in shadow mode. Existing guest legal, canonical checkout/consent, provider-policy, independent review and bounded-pilot gates remain. No milestone or production-readiness acceptance is implied by the directive.

**ADR-HARVO-MKT-014 — Host-safe campaign projection.** The authenticated workflow projection exposes `delivery.submitted` for host controls. External provider identity is populated only for the persisted admin audience; the default projector is host-safe. Event history exposes structural event metadata to hosts, with an explicit allowance for the host’s own refund reason, while internal audit payloads remain administrative. The database audit record is unchanged. Host pause, refresh and settlement controls use Encho campaign IDs and the submission flag. Deploy client and server together and refresh cached clients; this is an intentional response-contract narrowing, not a new provider identity.

**Incident findings HARVO-SP0-031 (source/local evidence):** Shared host delivery JSON and presentation exposed external campaign IDs and the event endpoint exposed arbitrary internal evidence. Meta status-read failures were returned as unknown without diagnostic context. CI uploaded raw test payloads without a retention bound. The inventory benchmark selected DDL fragments with regex and fixed calendar dates. Scoped corrections are locally tested; no production data breach is inferred. One historical Google credential test also required synthetic success without authenticated account evidence; it is replaced with real-transport positive and negative fixture coverage. The full release failure register remains authoritative for unresolved failures.


### 23.1 HARVO-032 continued execution — SP0 local gate and SP1 foundation

Founder authorizes continuous SP0–SP7/RFC implementation. SP3 remains strictly shadow-only. Local SP0 suite is green at 1,748/1,748, zero pending; this supersedes earlier failing local-gate statements without changing historical acceptance or production gates.

**ADR-HARVO-MKT-015:** migration 022 persists fenced, leased read-only pause-recovery attempts. Serialize before remote inspection, release all database locks during HTTP, revalidate actor and original operation before commit, retain failure/expiry history, never delete provider keys or release funds. Runtime readiness checks exact packaged migration checksums, recovery policies/immutable triggers/partial unique claim index and minimal grants. Deployment must apply 021/022, grant SELECT/INSERT on recovery receipts and SELECT/INSERT/UPDATE on attempts; do not grant DELETE/TRUNCATE/TRIGGER to runtime roles. The migration role remains separate and runtime schema_migrations is read-only.

**Incident findings HARVO-SP0-032 (source/local only):** an obsolete escrow-release endpoint could update escrow before invoking a retired activation dispatcher. It now returns 410 before writes for all actors. Legacy telemetry readers referenced columns absent from bootstrap/migrations; 021 adds nullable evidence without fabricating observations. Rollup day boundaries depended on the session timezone; UTC is now explicit. No production breach, financial loss or live correction is asserted.

**SP1 implementation boundary:** strict product and contribution contracts distinguish dedicated canonical stays from opt-in collection exposure. Migration 023 adds immutable tenant-scoped fact snapshots and a bounded capture-request scope; source facts retain HOST_SUPPLIED_PUBLISHED authority, not independent certification. Existing reviewed derivative manifest/byte verification is the asset authority. These contracts cannot debit, publish, move funds, promise provider impressions, or override consent. Pooled accounting, full asset composition and service/UI integration remain work in progress.

### 23.2 SP1–SP3 composition and deployment boundary

**ADR-HARVO-MKT-016 — Immutable dedicated revisions, research and separate observation.** New dedicated revisions atomically bind canonical room/listing/asset evidence through migrations 023/025. Existing review/publication guards revalidate it; historical rows are not backfilled with invented evidence. Migration 024 provides a tenant-scoped historical keyword cache and a durable shared-customer lease/cooldown. Research uses a read-only port, fixed serving identity and trusted canonical URL, bounded request budgets, explicit stale/error states and exact integer metrics. It cannot change a host's campaign or authorize payment.

Migration 026 is an admin-only shadow index and immutable assessment/review store. It has no publication/funding authority and is not called by their transactions or the main operational worker loop. Bounded identical-term comparison labels geography/semantic uncertainty and truncation. Operator annotations use stable idempotency identities; they are evidence review, not an automatic decision or proof of auction harm. Dedicated observer scheduling and real-traffic validation remain outstanding.

**Incident findings HARVO-SP1-032 (local regression):** initial product binding aliased the canonical listing object, changing the freshness hash when adding product evidence. Copying the snapshot before adding the contract preserves canonical hashes; a regression verifies immediate validity followed by rejection after room facts change. A remaining host pause button checked a now-admin-only provider ID; it now uses the intended `delivery.submitted` projection, verified in browser checks. No deployed incident is claimed.

**Security / Definition of Done:** database readiness now also checks exact portfolio policy expressions/counts, immutable trigger/function bodies, forced RLS, non-owner roles and minimum grants. Runtime cannot mutate evidence tables or truncate caches. The operator validates all packaged migration checksums. The complete impact/threat/grant/rollback contract is [SP1–SP3 delivery](implementation/SEARCH_PORTFOLIO_SP1_SP3_DELIVERY.md); dated checks remain in the execution verification. Production Neon role/grant evidence, remote required checks, pooled accounting/allocation, accepted checkout/consent, provider capability/creative clearance and a bounded pilot remain open. An older publisher that ignores bound fact contracts is not an acceptable rollback for newly bound revisions.


### 23.3 HARVO-033 — bounded execution, consent and presentation contracts

Phase 3 execution remains authorized continuously. Additive migrations 027–031 bind signed attribution, immutable consent evidence, expiring browser payloads, pool contributions, independently reviewed spatial stories and inquiry attribution. See `docs/implementation/SEARCH_PORTFOLIO_FINAL_DELIVERY.md` for the source, validation and unfulfilled definition of done. Earlier SP1–SP3 limitations are historical where this delivery now supplies a versioned India schedule and actual public spatial anchors.

**ADR-HARVO-033:** scheduled activation is an explicit, delayed administrator intent. Cancellation fences only an undispatched activation; provider pause/readback remains required. Advisory economics is exact-minor-unit scenario arithmetic, not a predicted CAC. Story labels and asset hashes bind current published facts and independent review; neutral framing avoids new unsupported claims. Consent records and inquiry attribution are immutable; optional browser identifiers are separate expiring records. The browser/server conversion contract uses a stable UUID, but no Purchase may be sent without accepted booking/consent authority.

**ADR-HARVO-033 pool boundary:** invitation/consent/eligibility/reservation are distinct from remote publication and financial settlement. Weighted collection-response ordering is disclosed exactly; it is not an observed ad-network impression. The paid pool publisher and provider-bill allocation are absent. Production composition therefore refuses pool funding and activation. Occupancy checks, membership pause/resume and collection serving never debit or transfer another member's funds. These are incomplete product contracts, not a completed paid offering.

**Incident history (local findings):** the development audit found a future activation could remain queued after a pause intent; optional browser-parameter storage lacked a deletion boundary; and inquiry routes trusted client recipient identifiers without the new canonical participant service. New scheduling, consent-retention and inquiry tests cover these repairs. No production exploitation or financial-loss incident is asserted, and INC-001 remains separate.

**Development/DoD:** local contract verification does not close production Neon migrations/grants, canonical booking/Purchase integration, provider review, quality/performance acceptance or the named live pilot. Historical five-of-ten accepted marketing milestones remain unchanged until their individual criteria are met.

### 23.4 HARVO-034 — local rollout rehearsal and key custody

Founder accepts the local HARVO-033 systems and retains the unavailable paid-pool boundary. Subsequent clarification confines this execution to disposable local PostgreSQL and local release checks; `.env.staging.local` will be supplied separately. Do not infer staging identity from the developer's generic Neon URLs.

**ADR-HARVO-034:** local key provisioning creates an ignored owner-readable file, preserves existing keys and never logs secret values. Deployment injects the same environment-specific key ring into web/worker; it does not replace canonical booking or consent authority. The new operator rehearsal executes exact 027–031 SQL with bounded locks/timeouts and a shared migration advisory lock, rejects checksum drift and privileged/owner runtime membership, validates minimum portfolio grants/forced RLS/immutable receipts, and always rolls back. No automatic startup migration, live activation or new business authority is introduced.

**Phase / DoD / findings:** Phase 3 rollout preparation remains authorized. Existing legacy migration checksum warnings are insufficient for unattended promotion; use the fail-closed rehearsal and a separately reviewed persistent apply. This is a source finding, not an observed production incident. Local schema fixtures and synthetic prior history cannot attest Neon or a full bootstrap. Staged runtime-login readiness, reviewed release artifacts, provider capabilities, accepted canonical financial/guest/consent integration and named bounded pilot evidence remain required. See `docs/implementation/HARVO_034_ROLLOUT_PLAN.md`; historical completion remains five of ten.

### 23.5 Discussion 034 — dynamic strategy architecture, planned 22 September 2026

The subsequent narrow founder directive authorized production migrations 017–031; Discussion 033 and HARVO section 49 record successful application and authenticated workspace recovery. That evidence supersedes the preceding local-only boundary for that completed operation, not for unrelated future operations or milestone acceptance.

The founder now authorizes database-managed price-tier strategies, provider-resolved feeder targeting and privileged strategy administration. The source-reviewed [AdTech execution plan](implementation/ADTECH_STRATEGY_EXECUTION_PLAN.md) is the implementation reference. This paragraph records architectural direction, not delivered code: immutable profile/corridor versions and atomic releases; owned canonical price/geography evidence; exact campaign-revision strategy bindings before review; supported provider compilation/readback; append-only admin change evidence; non-bypass RLS; and bounded, grounded AI proposals. Runtime business knobs may move to PostgreSQL; executable validation, financial/identity/consent safeguards and provider capability contracts remain enforced code.

**Review findings / DoD:** the current worker's use of current Meta configuration at publish time must be replaced for new strategy-bound contracts before editable strategies are enabled. New provider settings require effective-setting readback. Missing geography must never silently widen reach. Tier price alone cannot establish amenities, target guest wealth, per-person prices or acquisition performance. Existing booking/consent/provider/pilot gates and paid-pool isolation remain. No production failure or financial loss from the source findings is asserted. Track implementation as ADT-0 through ADT-7 with targeted development checks and one final full regression; this planning session does not increase historical acceptance.


### 23.6 Discussion 034 — locally delivered AdTech authority

The founder's later execution directive supersedes section 23.5's plan-only status. ADT-0–ADT-6 are locally implemented: exact-paise canonical price classification; PostgreSQL profile/corridor versions; CAS releases and immutable audits; atomic per-revision strategy bindings; compiled Meta/Google geography/attribution/bidding readback; admin strategy operations; adaptive host presets/approved-feeder controls; and proposal-only, independently supervised research. Executable financial, identity, capability and consent safeguards remain code-enforced. SQL seeds carry editable business hypotheses, never invented listing claims or provider IDs.

**ADR-ADTECH-034:** new adaptive campaign revisions retain their own profile/geography/compiler hash. Published provider metadata retains a reference to that immutable revision, and spending controls reload and verify it. Failed/missing strategy evidence must not broaden geography or prevent a safety pause. AI research uses public destination geography and cannot release a corridor or spend money; approval and publication are distinct audited operations. Research has its own fenced/quota-bound worker, separate from critical operational jobs. All 032–035 tables enforce FORCE RLS; actual non-bypass role and hostile-catalog checks are mandatory before rollout.

**Local incident findings:** seed insertion order was corrected for a non-bypass migration owner; strategy drift checks were extended from publication to spending control. A legacy telemetry UTC/local wall-time mismatch surfaced in the final full regression; explicit UTC writes and non-UTC session tests correct future observations without guessing the timezone of historical data. No deployed incident or financial loss is inferred.

**Phase / DoD:** the founder explicitly says staging is not configured and directs local verification only. Local fixtures do not attest Neon or real provider geography. Unsupported provider options remain blocked, paid pools remain unavailable, and existing canonical checkout/current-consent/legal gates remain. Production requires reviewed migration/checksum/grant evidence, the actual restricted runtime login, provider canaries and independent pilot acceptance. Exact local outcomes and the failed-sweep/targeted-repair distinction are recorded in [AdTech execution verification](harvo/ADTECH_EXECUTION_VERIFICATION.md), with the [delivery/runbook](implementation/ADTECH_STRATEGY_DELIVERY.md). No historical milestone acceptance is silently promoted.

### 23.7 ADT-7 production migration authority and observed rollout limits

The subsequent founder directive expressly authorizes primary Neon from `.env`, migrations 032–035 under lock 82749102, and a strictly PAUSED, zero-spend canary using approved Listing 1. Staging remains unconfigured. This supersedes section 23.6's local-only boundary for that specified operation, without authorizing activation or clearing existing legal/checkout/consent gates.

**Observed production findings:** all four migrations committed in one held-connection transaction with exact checksum verification and minimum new-table grants to `encho_app_prod`. New-table named-role catalog inspection passes; actual runtime login is not proven. Production readiness remains 503 because the deployed owner role bypasses RLS; the alternative role also lacks predecessor application grants. A correct production VARCHAR publication-status policy was rejected by the earlier TEXT-only catalog spelling. The checker now derives that exact cast spelling from the catalog type; it still rejects changed grouping or policy authority. Neither schema types nor security policies are changed by this repair.

**DoD / status:** preserve all additive evidence tables and do not switch database credentials until complete grants and real-login application behavior pass. Live provider lookups found no exact district target accepted by the current adapter; maintain `EXCLUSION_UNRESOLVED`. No synthetic stay, provider mutation or spend was performed. Listing 1's canonical INR 48,000 nightly price takes precedence over the instruction's INR 8,000 description. Baseline regression passed 1,947 tests, with 47 targeted checks after the narrow readiness correction. ADT-7 remains partial; [production rollout](implementation/ADTECH_PRODUCTION_ROLLOUT.md) is the current receipt, not a production certificate.


### 23.8 CR1 local workforce and conversation authority

Current CR1 development adds isolated workforce identity/permissions, exact command approval, durable work claims and atomic conversation delivery. Consumer account roles cannot manufacture staff authority. New migration 037 enforces canonical participant/thread identity, ordered immutable messages, content-free notification intents and explicit monotonic read acknowledgements under restricted non-bypass roles. Historical booking-only content remains participant-readable without inventing a new context. Legacy broad staff access and direct message deletion remain contained pending assigned Service Desk authority.

**Reliability and privacy rules:** history GET/prefetch is not a read receipt; viewport-visible content can request a committed acknowledgement. Socket dispatch is not recipient delivery. Lost commit acknowledgement is an unknown outcome reconciled with the same event identity. Unavailable counts must not be presented as zero. Queue workers receive no guest-message body access; notification previews contain routing identifiers and intentional generic copy only. Staff content access needs a previously committed bounded access receipt plus fresh scoped authority before content is returned.

**Source findings / development status:** experience image storage is JSONB, not a PostgreSQL array; canonical ownership/publication checks are required on both service and database paths. These are local source findings, not claims of a production incident. Follow the CR1 execution plan and slice evidence for acceptance. The new schemas have not been applied remotely; actual production logins, legal/provider policy, staged rollout, channel consent, retention and pilot evidence remain independent release gates. No P2 phase exit or production certification follows from local scoped tests.
