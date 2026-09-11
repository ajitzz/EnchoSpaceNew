# ENCHO STAYS — GUEST BOOKING EXPERIENCE V2 BLUEPRINT
**Status:** ACCEPTED — ARCHITECTURAL BASELINE (Phase 3 Milestone 1)
**Owner:** Principal Software Architect / Encho Engineering Leadership
**Date:** September 2026
**Scope:** Encho Stays — India Domestic Stays Customer Journey
**Precedence & Super-Session Notice:** Subordinate only to statutory Indian law and the Encho Engineering Constitution (`docs/ENCHO_ENGINEERING_CONSTITUTION.md`). This document, along with `GUEST_BOOKING_DECISION_REGISTER.md`, **SUPERSEDES AND OVERRULES** all legacy guest checkout documents and legacy host builder blueprints (`MASTER_HOST_LISTING_BUILDER_BLUEPRINT.md` and `HOST_LISTING_BUILDER_DECISION_REGISTER.md`) on:
1. **Media Authority:** Relational `media_assets` table is primary; JSONB arrays are legacy fallback only.
2. **Pricing Authority:** Server-stored quotes (`booking_quotes`) are authoritative; client-side price comparisons and tolerance matching are strictly prohibited.
3. **Step Architecture:** 8-step Listing Builder is canonical.
4. **Database Governance:** Runtime DDL (`ensureListingsTable` / `ALTER TABLE` on boot) is prohibited. Non-destructive migrations only.

---

> [!CAUTION]
> **CURRENT-STATE ARCHITECTURAL WARNING**
> The target architecture, state machines, inventory ledgers, and quote contracts defined in this document **DO NOT YET EXIST** in the live codebase. The current live implementation relies on client-side price math, unvalidated mock payment branches, and lacks server-side webhook fulfillment for guest stays. This document serves as the formal specification for future milestones (M2–M15). No production traffic may be admitted to these flows until every gate in this document is certified.
> **Current Status:** Milestone 1 is ACCEPTED — ARCHITECTURAL BASELINE. Milestone 2 is AWAITING INDEPENDENT ACCEPTANCE. Milestones 3–15 are NOT STARTED.

---

## 1. Version-One Scope and Exclusions

### In Scope (Version 1.0)
1. **Public Brand:** Encho Stays.
2. **Target Region:** India domestic stays (INR transactions, domestic phone numbers, Indian billing addresses).
3. **Inventory Model:** Multi-night boutique stays with pooled and unit-level room inventory.
4. **Canonical Route Architecture (PROPOSED — REQUIRES FOUNDER APPROVAL):** `/stay/:propertySlug` with backwards-compatible redirects from legacy `/listing/:id` and `/listings/:id`.
5. **Canonical Customer Property Presentation:** `ListingDetailsNew.tsx`.
6. **Payment Processing:** Server-orchestrated Razorpay order creation and cryptographic server-to-server webhook fulfillment.
7. **Identity Requirement:** Anonymous browsing, date exploration, and quoting; verified unified Encho account required before payment initiation.

### Explicitly Excluded (Out of Scope for Version 1.0)
1. **Encho Experiences:** Post-launch track; completely decoupled from stays checkout.
2. **Google Ads Retargeting:** Excluded from the guest stay transformation pipeline.
3. **Physical Access Credentials:** Door PINs, lockbox codes, Wi-Fi network passwords, gate passes, and smart-lock API integrations are **STRICTLY EXCLUDED** from version one. Arrival credentials will be handled via a future private arrival-guide system.
4. **Hardware Smart Lock Integrations:** Out of scope.
5. **Static Manual UPI VPAs & External QR Codes:** Rejected as high-fraud, unverified vectors.
6. **Destructive Table Drops:** Strictly prohibited across all database migrations and rollbacks.

---

## 2. Customer Promise & Positioning

1. **Property-First Hospitality Positioning:** Encho Stays offers distinct properties for traveler stays. The UI reflects honest, high-end hospitality editorial design without synthetic e-commerce pressure tactics. Standard guest-facing actions are: "Check availability", "Choose a room", "Continue to booking", and "Pay ₹X".
2. **Absolute Content Integrity:** No synthetic urgency counters, fake live viewers, fabricated reviews, or Unsplash stock photos mixed into property galleries. Every word and image must be backed by an authoritative database record. No claims that Encho currently curates or verifies properties are permitted unless supported by an approved verification fact.
3. **Price Guarantee:** The guest never pays an Encho booking commission. The total displayed on the initial quote must match the checkout invoice, the bank OTP prompt, and the final confirmation down to the exact rupee.

---

## 3. End-to-End Customer Journey

```mermaid
sequenceDiagram
    autonumber
    participant Guest as Guest Browser
    participant App as Encho SPA / Router
    participant API as Encho Stays API
    participant DB as Neon Postgres
    participant Rzp as Razorpay Gateway
    participant WebhookHandler as Webhook Receiver
    participant Worker as Webhook Worker Service

    Note over Guest,API: Step A & B: Public Projection & Search
    Guest->>App: Navigates to /stay/:propertySlug (PROPOSED)
    App->>API: GET /api/v2/stays/:propertySlug (Public Projection)
    API-->>App: Returns property details (Locality only, approx coordinates, no exact address)
    Guest->>App: Checks availability for stay dates & room type

    Note over Guest,API: Step C: Server-Stored Quote (Opaque ID)
    Guest->>App: Clicks "Choose a room"
    App->>API: POST /api/v2/stays/quote (dates, room_type_id, guest_count)
    API->>DB: Calculate rent & snapshot versioned tax rules (CA/Tax-lawyer gate)
    API->>DB: INSERT INTO booking_quotes (opaque quote_id, immutable price lines)
    API-->>App: Return quote_id and displayed line items (Opaque ID, client price ignored)

    Note over Guest,API: Step D & E: Verified Identity & Atomic Hold
    Guest->>App: Clicks "Continue to booking"
    App->>App: Enforces verified unified Encho account authentication
    App->>API: POST /api/v2/stays/holds (quote_id) with Auth Token
    API->>DB: BEGIN Transaction
    API->>DB: Lock inventory_days rows FOR UPDATE (Sorted by date ASC)
    API->>DB: Verify capacity (held + booked + requested <= total_units)
    API->>DB: INSERT INTO booking_holds & booking_hold_nights (Hold TTL, default 10m PROPOSED)
    API->>DB: COMMIT Transaction
    API-->>App: Return hold_id, expires_at

    Note over Guest,Rzp: Step F, G, H & I: PAYMENT_PENDING Booking & Razorpay Order Orchestration (Payment Saga / Outbox)
    Guest->>App: Reviews details and clicks "Pay ₹X" (Provides client Idempotency-Key UUID)
    App->>API: POST /api/v2/stays/orders (hold_id, quote_id, Idempotency-Key Header)
    API->>API: Compute request_fingerprint = SHA256(user_id + ":" + quote_id + ":" + hold_id)
    API->>DB: BEGIN Transaction
    API->>DB: Lock booking_holds FOR UPDATE (by id)
    API->>DB: Reload & verify stored quote & active hold state (Hold must be ACTIVE)
    API->>DB: Verify zero active unresolved attempts exist for hold_id (Enforced by partial unique index on active states)
    API->>DB: INSERT INTO bookings (status = 'PAYMENT_PENDING', quote_id, hold_id)
    API->>DB: INSERT INTO payment_attempts (status = 'ORDER_CREATING', user_id, operation='STAYS_BOOKING_ORDER', idempotency_key, request_fingerprint, hold_id)
    Note over API,DB: DB enforces UNIQUE (user_id, operation, idempotency_key) & partial unique index on unresolved hold_id
    API->>DB: COMMIT Transaction (Local attempt committed before external provider API call)
    Note over API,Rzp: Orchestration is an idempotent payment saga/outbox across local PostgreSQL and external provider API; no atomic distributed transaction exists with Razorpay
    API->>Rzp: POST /v1/orders (amount = quote.total_amount_paise, currency = 'INR', receipt = attempt_id, notes = {booking_id, quote_id, attempt_id})
    alt Definite Gateway Rejection (Explicit deterministic provider rejection payload)
        API->>DB: UPDATE payment_attempts SET status = 'FAILED', failure_reason = err.message
        API-->>App: Return 400/502 Definite Gateway Failure
    else Gateway Timeout / Ambiguous Outcome (Timeout, connection reset, HTTP 5xx, malformed response, missing order ID)
        API->>DB: UPDATE payment_attempts SET status = 'UNKNOWN_OUTCOME'
        API-->>App: Return 504 Gateway Timeout (Reconciliation must resolve UNKNOWN_OUTCOME before another order can be created)
    else Successful Order Initialization (HTTP 200 with valid razorpay_order_id)
        Rzp-->>API: 200 OK with razorpay_order_id
        API->>DB: UPDATE payment_attempts SET status = 'ORDER_CREATED', razorpay_order_id = $1
        API-->>App: Return razorpay_order_id, key_id
    end

    Note over Guest,Rzp: Step J: Browser Checkout Handshake
    App->>Rzp: Opens Razorpay Checkout Modal
    Guest->>Rzp: Authorizes Payment (UPI / Card / NetBanking)

    Note over Rzp,WebhookHandler: Step K & L: Webhook Receipt & Durable Ingestion (Anti-Replay Ingestion)
    Rzp->>WebhookHandler: POST /api/payments/webhook (order.paid / payment.captured)
    WebhookHandler->>WebhookHandler: Capture rawBody & verify HMAC-SHA256 signature
    WebhookHandler->>DB: INSERT INTO inbound_webhooks (provider_event_id, payload, status='pending') ON CONFLICT (provider_event_id) DO NOTHING
    WebhookHandler-->>Rzp: Return HTTP 200 OK Immediately (<200ms)

    Note over Worker,DB: Step M: Asynchronous Worker Fulfillment & Financial Application
    Worker->>DB: Claim pending webhook event with lease
    Worker->>DB: BEGIN Transaction
    Worker->>DB: Lock payment_attempts FOR UPDATE (by id)
    Worker->>DB: Lock bookings FOR UPDATE (by id)
    Worker->>DB: Lock inventory_days FOR UPDATE (Sorted by calendar_date ASC)
    Worker->>DB: Lock booking_holds FOR UPDATE (by id)
    Worker->>Worker: Validate Provider Binding:
    Note over Worker: Case A (Existing gateway_order_id): Require exact match (payload.order_id == payment_attempts.gateway_order_id)
    Note over Worker: Case B (gateway_order_id IS NULL / Crash Boundary 3): Write-once binding ONLY from verified signed HMAC payload containing trusted immutable correlation (notes.attempt_id or receipt == attempt_id)
    Note over Worker: Case C (Insufficient trusted correlation or client-only data): Reject binding -> RECONCILIATION_REQUIRED
    Worker->>Worker: Validate Currency ('INR'), Amount == quote.total_amount_paise, & Status ('captured')
    alt Validation Failed (Amount / Currency / Provider Binding Mismatch / Insufficient Correlation)
        Worker->>DB: UPDATE payment_attempts SET status = 'RECONCILIATION_REQUIRED'
        Worker->>DB: UPDATE inbound_webhooks SET status = 'dead_letter', last_error = 'VALIDATION_MISMATCH'
        Worker->>DB: INSERT INTO payment_reconciliation_cases (provider='RAZORPAY', payment_attempt_id, booking_id, reason_code='VALIDATION_MISMATCH', severity='P1_CRITICAL', status='OPEN')
        Worker->>DB: COMMIT Transaction (Financial effects rolled back; manual investigation opened; zero automated refund; zero retry loop)
    else Validation Succeeded (Definitive Captured Payment)
        Worker->>DB: INSERT INTO processed_payments (razorpay_payment_id, payment_attempt_id, booking_id, amount_paise, currency) VALUES (...) ON CONFLICT (razorpay_payment_id) DO NOTHING RETURNING razorpay_payment_id
        alt Zero Rows Returned (NULL - Replay Attack / Duplicate Webhook Delivery)
            Worker->>DB: UPDATE inbound_webhooks SET status = 'completed'
            Worker->>DB: COMMIT Transaction (Replay acknowledged cleanly; zero duplicate financial side effects)
        else Row Returned (1 row - First and Only Execution)
            Worker->>DB: Check hold expiration state & inventory availability
            alt Hold Expired Before Capture (Late Payment) & Inventory Sold Out
                Worker->>DB: UPDATE bookings SET status = 'PAYMENT_CAPTURED_INVENTORY_UNAVAILABLE'
                Worker->>DB: UPDATE payment_attempts SET status = 'CAPTURED'
                Note over Worker,DB: Pre-approval path: flags manual finance reconciliation case with operational alert (ZERO auto-refund)
                alt PROPOSED-012 Approved by Founder (Conditional Automated Branch)
                    Worker->>DB: INSERT INTO guest_refunds (status = 'REQUESTED', reason_code = 'LATE_PAYMENT_INVENTORY_UNAVAILABLE')
                    Worker->>DB: INSERT INTO transactional_outbox (event = 'REFUND_DISPATCH_REQUIRED')
                else Pre-Approval Standard Path (PROPOSED-012 Unapproved / Default)
                    Worker->>DB: INSERT INTO payment_reconciliation_cases (provider='RAZORPAY', payment_attempt_id, booking_id, reason_code='LATE_CAPTURE_INVENTORY_UNAVAILABLE', severity='P2_HIGH', status='OPEN')
                end
                Worker->>DB: UPDATE inbound_webhooks SET status = 'completed'
                Worker->>DB: COMMIT Transaction
            else Hold Active OR (Hold Expired AND Inventory Still Available)
                Worker->>DB: Re-allocate or finalize units into booked_units in inventory_days
                Worker->>DB: UPDATE bookings SET status = 'CONFIRMED'
                Worker->>DB: UPDATE payment_attempts SET status = 'CAPTURED'
                Worker->>DB: UPDATE booking_holds SET status = 'CONSUMED'
                Worker->>DB: UPDATE booking_quotes SET status = 'CONSUMED' (Quote consumed only upon booking confirmation)
                Worker->>DB: INSERT INTO booking_commission_snapshots (snapshot flex/growth rate)
                Worker->>DB: INSERT INTO internal_booking_settlements (gross, commission, net host settlement)
                Worker->>DB: INSERT INTO host_payout_obligations (status = 'BLOCKED', scheduled_release_at = derived from versioned approved payout-policy snapshot)
                Worker->>DB: INSERT INTO booking_audit_events (action = 'BOOKING_CONFIRMED')
                Worker->>DB: INSERT INTO transactional_outbox (event = 'BOOKING_CONFIRMED')
                Worker->>DB: UPDATE inbound_webhooks SET status = 'completed'
                Worker->>DB: COMMIT Transaction
            end
        end
    end

    Note over Guest,App: Step N: Authoritative Confirmation Poll
    App->>API: Polls /api/v2/bookings/:bookingId
    API->>DB: Read confirmed booking record
    API-->>App: Return authoritative confirmed booking, receipt, and host contact
```

### Explicit Gateway Crash Boundaries & Recovery Invariants

To guarantee absolute financial integrity across distributed gateway interactions, the order creation and fulfillment pipeline defines four explicit crash boundaries:

1. **Crash Boundary 1 — Crash Before Provider Request:**
   - **Point of Failure:** Local database transaction commits `payment_attempts(status = 'ORDER_CREATING')`, but server process crashes or network cuts out before the outbound HTTP request reaches Razorpay.
   - **Gateway State:** Zero order exists on Razorpay gateway (or provider status indeterminate).
   - **Local State:** Local DB has `ORDER_CREATING` (and local `gateway_order_id` is `NULL`).
   - **Recovery Mechanism:** Sweeper worker scans for abandoned `ORDER_CREATING` records exceeding lease TTL (2 minutes). Local database state cannot prove whether an outbound packet was dispatched over the wire. Since provider lookup by arbitrary receipt/notes is **PROVIDER BLOCKED**, provider absence cannot be conclusively proven. Therefore, the sweeper **NEVER** marks an attempt `FAILED` merely because a local lease expired. The stale attempt must transition to `UNKNOWN_OUTCOME` and fail closed into `RECONCILIATION_REQUIRED`, creating a record in `payment_reconciliation_cases`. Creating another provider order for the same hold/quote is strictly prohibited until reconciliation resolves the attempt.

2. **Crash Boundary 2 — Crash During Provider Request:**
   - **Point of Failure:** Outbound HTTP request dispatched to Razorpay, but connection resets, times out, or returns HTTP 5xx before response payload can be read.
   - **Gateway State:** Order may or may not have been created on Razorpay.
   - **Local State:** Attempt transitioned to `UNKNOWN_OUTCOME` (local `gateway_order_id` is `NULL`).
   - **Recovery Mechanism:** Background reconciliation worker investigates provider or awaits inbound webhook. Note that querying orders by arbitrary `notes` or `receipt` is **PROVIDER BLOCKED** pending sandbox capability verification; safe operational fallback uses webhook-driven correlation via verified signed provider payload or escalates to `payment_reconciliation_cases`. Crucial Invariant: Unresolved attempts fail closed into `RECONCILIATION_REQUIRED` and open a `payment_reconciliation_cases` record. Reconciliation must resolve `UNKNOWN_OUTCOME` before another provider order can be created for the same hold/quote.

3. **Crash Boundary 3 — Crash After Provider Creation, Before Local Persistence:**
   - **Point of Failure:** Razorpay successfully creates order and returns HTTP 200 with `razorpay_order_id`, but server process terminates before executing `UPDATE payment_attempts SET status = 'ORDER_CREATED'`.
   - **Gateway State:** Active order exists on Razorpay.
   - **Local State:** Local `gateway_order_id` is `NULL`, and attempt remains `ORDER_CREATING` in database.
   - **Recovery Mechanism & Webhook Binding:**
     - The worker cannot require equality against null and simultaneously claim the webhook can recover the attempt.
     - **Binding Rules:**
       a. **Existing local `gateway_order_id`:** Require exact match (`payload.order_id == payment_attempts.gateway_order_id`).
       b. **Null local `gateway_order_id`:** Permit write-once binding ONLY from a verified HMAC-SHA256 signed provider payload containing a trusted immutable provider-side correlation to `payment_attempt.id` (e.g., `payload.payment.entity.notes.attempt_id` or `payload.order.entity.receipt == payment_attempts.id::text`).
       c. **Insufficient / Untrusted Correlation:** If the provider webhook does not expose sufficient trusted correlation, the attempt must transition to `RECONCILIATION_REQUIRED` and create a `payment_reconciliation_cases` record for manual investigation.
     - **Zero Trust on Client:** Never trust guest- or client-submitted correlation metadata.
     - **Provider Lookup Capability:** Receipt-based provider API lookup remains **PROVIDER BLOCKED** pending sandbox proof; recovery relies on signed webhook correlation where sufficient, or manual reconciliation.

4. **Crash Boundary 4 — Crash After Local Persistence, Before Client Delivery:**
   - **Point of Failure:** Database commits `payment_attempts(status = 'ORDER_CREATED')`, but connection drops before client receives HTTP 200 response with `razorpay_order_id`.
   - **Gateway State:** Active order exists on Razorpay.
   - **Local State:** Record committed as `ORDER_CREATED`.
   - **Recovery Mechanism:** Client reconnects and retries `POST /api/v2/stays/orders` using identical client `Idempotency-Key` and `request_fingerprint`. Server re-returns existing `ORDER_CREATED` payload immediately without invoking Razorpay API again.

---

### Deterministic Transaction Lock Order & Deadlock Prevention

To completely eliminate database deadlocks under high-concurrency checkout contention, all booking fulfillment, cancellation, and settlement operations must acquire row locks strictly in the following canonical global sequence:

```
1. payment_attempts FOR UPDATE (by id ASC)
   │
2. bookings FOR UPDATE (by id ASC)
   │
3. inventory_days FOR UPDATE (strictly sorted by calendar_date ASC)
   │
4. booking_holds FOR UPDATE (by id ASC)
```

**Deadlock Retry Policy (PostgreSQL Error Code `40P01`):**
Any transaction encountering PostgreSQL error code `40P01` (`deadlock_detected`) must be automatically retried using exponential backoff:
- Maximum Retries: `3`
- Initial Backoff Delay: `50ms`
- Jitter: Random uniform jitter between `0ms` and `50ms` (`delay = (50ms * 2^attempt) + random(0, 50ms)`)
- If all 3 retries fail, transaction fails closed, rolls back, and emits a high-priority operational telemetry alert.

---

## 4. Source-of-Truth Hierarchy

When code, documentation, or client inputs conflict, the following hierarchy strictly governs:

```
1. Statutory Laws & Regulations (Indian Consumer Protection, IT Act, GST Laws)
   │
2. Guest Booking Decision Register (docs/blueprints/GUEST_BOOKING_DECISION_REGISTER.md)
   │
3. Encho Engineering Constitution (docs/ENCHO_ENGINEERING_CONSTITUTION.md)
   │
4. Architecture Blueprint & State Machines (This Document)
   │
5. Versioned PostgreSQL Schema Migrations
   │
6. Server Domain Services
   │
7. Public API Projections
   │
8. Client UI Components (React / Vite)
```

> [!IMPORTANT]
> **Client Authority Invariant:**
> The React frontend is **NEVER** an authority for availability, nightly prices, tax amounts, commission deductions, payment status, booking status, refund status, host payouts, property verification, or access credentials.

---

## 5. Target Data Domains & Conceptual Entities

The target model structures property, booking, financial, reconciliation, and inventory data across normalized, authoritative conceptual entities across 8 core domains. Each entity is strictly governed by its designated authority, mutability contract, guest visibility boundary, and retention specification:

### 1. `published_property_projections`
- **Purpose:** High-performance, edge-cacheable public projection of published property listings.
- **Owner / Authority:** Encho Projection Compiler (server-side background worker).
- **Required Relationships:** References `listings.id`.
- **Mutable Fields:** Title, tagline, locality, approximate coordinates, curated guidelines, amenities, clusters, child safety specs.
- **Immutable Fields:** Projection ID, `listing_id`, compiled timestamp.
- **Guest Visibility:** Fully public to unauthenticated and authenticated guests.
- **Audit / Retention:** Historical snapshots retained for 7 years [PROPOSED / LEGAL REVIEW] for consumer protection compliance.
- **Current vs Target Status:** TARGET (Currently raw `listings` table queried directly in `ListingDetailsNew.tsx` with exposed street address).

### 2. `room_types`
- **Purpose:** Relational unit configuration defining room identity, capacity, nightly rates, and unit inventory.
- **Owner / Authority:** Host via Host Listing Builder; verified by Admin Moderation.
- **Required Relationships:** Foreign key to `listings.id`.
- **Mutable Fields:** `name`, `type`, `description`, `specs`, `base_price_paise`, `max_occupancy`, `inventory_count`, `features`, `amenities`, `icon`, `tag`.
- **Immutable Fields:** `id`, `listing_id`, `created_at`.
- **Guest Visibility:** Publicly readable on property details and room selection modals.
- **Audit / Retention:** Mutated records logged to `property_audit_events`. Retained 7 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** PARTIAL (Relational table exists in Neon; currently dual-read in `ListingDetailsNew.tsx`, not yet authoritative server-side source).

### 3. `media_assets`
- **Purpose:** Authoritative storage and categorization of photography and video assets.
- **Owner / Authority:** Host upload pipeline; verified by automated QC and Admin Moderation.
- **Required Relationships:** Foreign key to `listings.id`, optional foreign key to `room_types.id`.
- **Mutable Fields:** `title`, `description`, `category`, `tier`, `display_order`, `moderation_status`.
- **Immutable Fields:** `id`, `listing_id`, `storage_key`, `url`, `created_at`.
- **Guest Visibility:** Public only when `moderation_status = 'approved'`.
- **Audit / Retention:** Permanent retention of asset metadata; soft-deleted assets retained 90 days [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** PARTIAL (Relational table exists in Neon; currently `ListingDetailsNew.tsx` and `SanctuaryGalleryModal.tsx` still read legacy JSONB and fallback pools).

### 4. `inventory_days`
- **Purpose:** Master daily capacity ledger tracking physical unit availability across calendar dates.
- **Owner / Authority:** Inventory Domain Service (server-side only).
- **Required Relationships:** Foreign key to `room_types.id` and `listings.id`.
- **Mutable Fields:** `held_units`, `booked_units`, `blocked_units`.
- **Immutable Fields:** `id`, `room_type_id`, `calendar_date`.
- **Guest Visibility:** Availability status derived; raw unit counters completely hidden from guests.
- **Audit / Retention:** Permanent retention for capacity reconciliation.
- **Current vs Target Status:** TARGET (Milestone 4 implementation; replaces legacy unindexed blocks in `room_calendar_blocks`).

### 5. `booking_holds`
- **Purpose:** Atomic reservation session holding inventory units during checkout (default 10-minute TTL [PROPOSED]).
- **Owner / Authority:** Checkout Hold Service (server-side only).
- **Required Relationships:** References `quote_id`, `room_type_id`, `user_id` (integer).
- **Mutable Fields:** `status` (`ACTIVE`, `CONSUMED`, `EXPIRED`, `RELEASED`), `expires_at`.
- **Immutable Fields:** `id` (UUID), `room_type_id`, `quote_id`, `units_held`, `created_at`.
- **Guest Visibility:** Private to the holding guest session.
- **Audit / Retention:** 30 days retention after expiration/consumption [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 4 implementation).

### 6. `booking_hold_nights`
- **Purpose:** Granular per-night unit allocation linking a hold session to specific `inventory_days`.
- **Owner / Authority:** Checkout Hold Service.
- **Required Relationships:** Foreign key to `booking_holds.id` and `inventory_days.id`.
- **Mutable Fields:** None (immutable allocation).
- **Immutable Fields:** `id`, `hold_id`, `inventory_day_id`, `units`.
- **Guest Visibility:** Hidden from guest.
- **Audit / Retention:** Cascadable with parent hold.
- **Current vs Target Status:** TARGET (Milestone 4 implementation).

### 7. `booking_quotes`
- **Purpose:** Immutable server-stored price contract binding dates, room, occupancy, and snapshotted tax rules.
- **Owner / Authority:** Server Pricing Engine.
- **Required Relationships:** References `room_types.id`, `listings.id`, optional `user_id` (integer).
- **Mutable Fields:** `status` (`ACTIVE`, `CONSUMED`, `EXPIRED`, `SUPERSEDED`).
- **Immutable Fields:** `id` (opaque string/UUID), `room_type_id`, `check_in_date`, `check_out_date`, `guest_count`, `currency`, `total_amount_paise`, `created_at`, `expires_at`.
- **Guest Visibility:** Exposed to quoting guest via opaque `quote_id`; client-submitted price completely ignored.
- **Audit / Retention:** Retained 7 years [PROPOSED / LEGAL REVIEW] for commercial auditability.
- **Current vs Target Status:** TARGET (Milestone 5 implementation; replaces client-side price calculation in `ListingDetailsNew.tsx` and `CheckoutPage.tsx`).

### 8. `quote_price_lines`
- **Purpose:** Itemized commercial line items forming the quote total (base rent, extra guests).
- **Owner / Authority:** Server Pricing Engine.
- **Required Relationships:** Foreign key to `booking_quotes.id`.
- **Mutable Fields:** None (strictly immutable).
- **Immutable Fields:** `id`, `quote_id`, `line_type`, `description`, `unit_amount_paise`, `quantity`, `total_amount_paise`.
- **Guest Visibility:** Itemized breakdown visible on checkout screen and confirmation receipt.
- **Audit / Retention:** Retained 7 years [PROPOSED / LEGAL REVIEW] with parent quote.
- **Current vs Target Status:** TARGET (Milestone 5 implementation).

### 9. `quote_tax_lines`
- **Purpose:** Snapshotted statutory tax lines derived from versioned Indian tax rules.
- **Owner / Authority:** Server Tax Engine (gated by formal CA/tax-lawyer sign-off).
- **Required Relationships:** Foreign key to `booking_quotes.id`, references `tax_rule_versions.id`.
- **Mutable Fields:** None (strictly immutable).
- **Immutable Fields:** `id`, `quote_id`, `tax_rule_version_id`, `tax_name` (e.g. CGST, SGST, IGST), `rate_basis_points`, `tax_amount_paise`.
- **Guest Visibility:** Displayed on invoice and checkout breakdown.
- **Audit / Retention:** Retained 8 years [PROPOSED / LEGAL REVIEW] under Indian GST compliance statutes.
- **Current vs Target Status:** TARGET (Milestone 5 implementation; legally blocked pending CA sign-off).

### 10. `tax_rule_versions`
- **Purpose:** Versioned statutory tax computation schedules (rate basis points, eligibility thresholds, intra/inter-state logic).
- **Owner / Authority:** Finance Operations & Statutory Compliance.
- **Required Relationships:** None (master parameter table).
- **Mutable Fields:** `is_active`, `deprecated_at`.
- **Immutable Fields:** `id`, `version_code`, `tax_type`, `rate_basis_points`, `effective_from`, `created_at`.
- **Guest Visibility:** Rates and names reflected on tax breakdowns.
- **Audit / Retention:** Permanent retention [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 5 implementation; LEGAL BLOCKED pending formal CA/tax attorney sign-off).

### 11. `growth_subscriptions`
- **Purpose:** Authoritative record of per-property Encho Growth plan subscriptions (₹4,999 + GST for rolling 30 days).
- **Owner / Authority:** Subscription & Billing Service.
- **Required Relationships:** Foreign key to `listings.id`, `users.id` (host integer user ID).
- **Mutable Fields:** `status` (`PENDING_ACTIVATION`, `ACTIVE`, `EXPIRED`, `CANCELLED_NON_RENEWAL`, `REFUNDED_DUPLICATE`, `REFUNDED_TECHNICAL`, `REFUNDED_LEGAL`), `expires_at`, `refund_reason_code`.
- **Write-Once-After-Null Fields:** `payment_id`, `activated_at` (null at creation; once set upon payment capture, strictly immutable).
- **Immutable Fields:** `id` (UUID), `listing_id`, `host_id`, `amount_paise` (499900), `tax_amount_paise`, `currency` ('INR'), `created_at`.
- **Overlapping Term Rule:** Purchasing Encho Growth while an existing Growth subscription is active extends its expiration by 30 days from the current expires_at. The active term is never truncated. If no active term exists, expiration is calculated from successful activation time. (Formerly PROPOSED-011; Approved Decision #37).
- **Guest Visibility:** Completely hidden from guests.
- **Audit / Retention:** Retained 10 years [PROPOSED / LEGAL REVIEW] for statutory corporate accounting.
- **Current vs Target Status:** TARGET (Milestone 5 implementation; non-refundable invariant except for duplicate charges, technical failures, or legal mandates).

### 11b. `subscription_payment_attempts`
- **Purpose:** Independent payment attempt ledger for host Growth subscriptions, completely decoupled from booking-bound checkouts.
- **Owner / Authority:** Host Subscription Billing Service.
- **Required Relationships:** Foreign key to `growth_subscriptions.id`, `users.id` (host).
- **Mutable Fields:** `status` (`ORDER_CREATING`, `ORDER_CREATED`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `EXPIRED`, `UNKNOWN_OUTCOME`, `RECONCILIATION_REQUIRED`), `error_code`, `error_description`.
- **Write-Once-After-Null Fields:** `gateway_order_id`, `gateway_payment_id` (null at `ORDER_CREATING` creation; once written, strictly immutable).
- **Immutable Fields:** `id` (UUID), `subscription_id`, `host_id`, `idempotency_key`, `request_fingerprint`, `amount_paise`, `currency`, `created_at`.
- **Deduplication Boundary:** Growth payments use `subscription_processed_payments`, completely decoupled from booking-specific `processed_payments(booking_id)`. Exactly-once subscription activation on capture.
- **Guest Visibility:** Completely hidden from guests.
- **Audit / Retention:** Retained 7 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 5 implementation).

### 11c. `subscription_processed_payments`
- **Purpose:** Anti-replay deduplication ledger guaranteeing that no gateway payment ID activates a Growth subscription more than once.
- **Owner / Authority:** Subscription Billing Worker.
- **Required Relationships:** References `growth_subscriptions.id`, `subscription_payment_attempts.id`, and `users.id` (host).
- **Mutable Fields:** None (insert-only deduplication ledger).
- **Immutable Fields:** `gateway_payment_id` (PRIMARY KEY, VARCHAR), `subscription_id`, `subscription_payment_attempt_id`, `host_id`, `amount_paise`, `currency`, `processed_at`.
- **Execution Contract:**
  ```sql
  INSERT INTO subscription_processed_payments (
    gateway_payment_id, subscription_id, subscription_payment_attempt_id, host_id, amount_paise, currency, processed_at
  ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
  ON CONFLICT (gateway_payment_id) DO NOTHING
  RETURNING gateway_payment_id;
  ```
  - **Returned row exists (1 row):** Transaction owns subscription activation (sets `status = 'ACTIVE'`, updates `activated_at`, extends `expires_at`, marks webhook `completed`).
  - **Zero rows returned (NULL):** Replay! Webhook worker marks inbound webhook `completed` and commits immediately without repeating activation side effects or aborting the transaction.
- **Guest Visibility:** Completely hidden from guests.
- **Audit / Retention:** Retained 10 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 5 implementation).

### 12. `commission_policies`
- **Purpose:** Versioned admin-configurable Flex commission policy master (default 15% / 1500 basis points).
- **Owner / Authority:** Platform Administrator.
- **Required Relationships:** None (master policy table).
- **Mutable Fields:** `is_active`, `deprecated_at`.
- **Immutable Fields:** `id`, `plan_code` ('FLEX'), `rate_basis_points` (default 1500), `effective_from`, `created_by_admin_id`, `created_at`.
- **Guest Visibility:** Completely hidden from guests.
- **Audit / Retention:** Permanent retention [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 5 implementation; eliminates hardcoded string semantics).

### 13. `booking_commission_snapshots`
- **Purpose:** Immutable snapshot of the exact commission policy and rate bound to a booking at the moment of confirmation.
- **Owner / Authority:** Settlement & Clearing Engine.
- **Required Relationships:** Foreign key to `bookings.id`, references `commission_policies.id`, optional reference to `growth_subscriptions.id`.
- **Mutable Fields:** None (strictly immutable snapshot).
- **Immutable Fields:** `id`, `booking_id`, `commission_plan` ('FLEX' or 'GROWTH'), `applied_rate_basis_points` (0 for Growth, or snapshot from Flex policy), `policy_id`, `subscription_id`, `created_at`.
- **Guest Visibility:** Completely hidden from guests.
- **Audit / Retention:** Retained 10 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 5 implementation).

### 14. `internal_booking_settlements`
- **Purpose:** Private financial ledger snapshotting marketplace deductions, gateway costs, and host net settlement.
- **Owner / Authority:** Server Financial Clearing Engine.
- **Required Relationships:** Foreign key to `bookings.id`, `booking_quotes.id`, and `booking_commission_snapshots.id`.
- **Mutable Fields:** `settlement_status` (`PENDING`, `SETTLED`, `REVERSED`).
- **Immutable Fields:** `id`, `booking_id`, `gross_amount_paise`, `commission_plan` ('FLEX' or 'GROWTH'), `commission_rate_basis_points`, `commission_amount_paise`, `gateway_fee_paise`, `net_host_settlement_paise`.
- **Guest Visibility:** STRICTLY CONFIDENTIAL. Never exposed to guests or guest-facing APIs.
- **Audit / Retention:** Retained 10 years [PROPOSED / LEGAL REVIEW] for statutory tax and financial audits.
- **Current vs Target Status:** TARGET (Milestone 5 implementation).

### 15. `accommodation_invoices`
- **Purpose:** Host-issued accommodation invoice generated by Encho on the host's behalf in its disclosed marketplace agent capacity.
- **Owner / Authority:** Billing & Invoicing Engine.
- **Required Relationships:** Foreign key to `bookings.id`, `listings.id`, `users.id` (host), `users.id` (guest).
- **Document Immutability:** Invoices are strictly immutable once `ISSUED`. They cannot be mutated or overwritten in-place. Cancellations, adjustments, or amendments must generate sequentially numbered `linked_adjustment_documents` referencing the original invoice record.
- **Mutable Fields:** `pdf_storage_url` (document status cannot be mutated in-place).
- **Immutable Fields:** `id` (UUID), `invoice_number` (statutory sequential sequence), `booking_id`, `host_legal_name`, `host_gstin`, `guest_name`, `guest_state_code`, `taxable_value_paise`, `cgst_amount_paise`, `sgst_amount_paise`, `igst_amount_paise`, `total_amount_paise`, `issued_at`.
- **Guest Visibility:** Downloadable by authenticated booking guest on confirmation/itinerary screen.
- **Audit / Retention:** Retained 8 years [PROPOSED / LEGAL REVIEW] under GST statutory requirements.
- **Current vs Target Status:** TARGET (Milestone 10 implementation; LEGAL BLOCKED on statutory format & GST rules).

### 15b. `linked_adjustment_documents`
- **Purpose:** Generic statutory adjustment ledger referencing issued accommodation invoices for cancellations, modifications, or financial corrections.
- **Owner / Authority:** Billing & Invoicing Engine.
- **Required Relationships:** Foreign key to `accommodation_invoices.id`, `bookings.id`.
- **Statutory Gate:** Specific statutory classifications (credit note vs amended invoice vs debit note) and mandatory GST compliance fields are **LEGAL BLOCKED** pending written sign-off by Indian CA/tax attorney.
- **Mutable Fields:** `pdf_storage_url`.
- **Immutable Fields:** `id` (UUID), `document_number` (statutory sequential sequence), `original_invoice_id`, `booking_id`, `adjustment_type` (`CREDIT_ADJUSTMENT`, `DEBIT_ADJUSTMENT`, `AMENDMENT`), `adjustment_reason`, `taxable_adjustment_paise`, `tax_adjustment_paise`, `total_adjustment_paise`, `issued_at`.
- **Guest Visibility:** Downloadable alongside original invoice.
- **Audit / Retention:** Retained 8 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 10 implementation; LEGAL BLOCKED).

### 16. `bookings`
- **Purpose:** Authoritative legal reservation contract between guest and host.
- **Owner / Authority:** Booking Domain Service.
- **Required Relationships:** References `listings.id`, `room_types.id`, `user_id` (guest integer ID), `quote_id`.
- **Mutable Fields:** `status` (`PAYMENT_PENDING`, `CONFIRMED`, `CHECKED_IN`, `CHECKED_OUT`, `CANCELLATION_PENDING`, `CANCELLED`, `NO_SHOW`, `PAYMENT_FAILED`, `PAYMENT_CAPTURED_INVENTORY_UNAVAILABLE`, `EXPIRED`), `cancellation_reason`, `cancelled_at`.
- **Write-Once-After-Null Fields:** `razorpay_order_id` (null at creation; once bound upon order creation, strictly immutable).
- **Immutable Fields:** `id` (integer), `reference_number` (unique string), `listing_id`, `room_type_id`, `guest_id`, `check_in_date`, `check_out_date`, `currency`, `total_amount_paid_paise`, `created_at`.
- **Guest Visibility:** Private to the authenticated booking guest; full details including exact address released upon confirmation.
- **Audit / Retention:** Permanent historical retention [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** LEGACY (Table exists in Neon; currently lacks `PAYMENT_PENDING` transition, order binding, and server-generated reference numbers).

### 17. `payment_attempts`
- **Purpose:** Tracks every interaction with the payment gateway for guest bookings (order creation, authorization, verification).
- **Owner / Authority:** Payment Orchestration Service.
- **Required Relationships:** Foreign key to `bookings.id`, references `booking_quotes.id`.
- **Mutable Fields:** `status` (`ORDER_CREATING`, `ORDER_CREATED`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `EXPIRED`, `DISPUTED`, `REVERSED`, `UNKNOWN_OUTCOME`, `RECONCILIATION_REQUIRED`), `error_code`, `error_description`.
- **Write-Once-After-Null Fields:** `gateway_order_id`, `gateway_payment_id` (null at `ORDER_CREATING` creation; once written, strictly immutable).
- **Immutable Fields:** `id`, `booking_id`, `idempotency_key`, `request_fingerprint`, `amount_paise`, `currency`, `created_at`.
- **Guest Visibility:** Payment status visible on checkout modal; raw gateway payloads hidden.
- **Audit / Retention:** Retained 7 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 9 implementation; replaces mock payment branches in `CheckoutPage.tsx`).

### 18. `processed_payments`
- **Purpose:** Anti-replay ledger guaranteeing that no gateway payment ID is ever fulfilled more than once.
- **Owner / Authority:** Webhook Worker Service.
- **Required Relationships:** References `bookings.id` and `payment_attempts.id`.
- **Mutable Fields:** None (insert-only deduplication ledger).
- **Immutable Fields:** `gateway_payment_id` (PRIMARY KEY), `booking_id`, `payment_attempt_id`, `amount_paise`, `currency`, `processed_at`.
- **Execution Contract:**
  ```sql
  INSERT INTO processed_payments (
    gateway_payment_id, payment_attempt_id, booking_id, amount_paise, currency, processed_at
  ) VALUES ($1, $2, $3, $4, $5, NOW())
  ON CONFLICT (gateway_payment_id) DO NOTHING
  RETURNING gateway_payment_id;
  ```
  - **Returned row exists (1 row):** Transaction owns financial fulfillment (confirms booking, snapshots commission, settles internally, creates payout obligation, dispatches outbox, marks webhook `completed`).
  - **Zero rows returned (NULL):** Replay! Webhook worker marks inbound webhook `completed` and commits immediately without repeating financial side effects or aborting the transaction.
- **Guest Visibility:** Hidden from guest.
- **Audit / Retention:** Permanent retention [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 9 implementation).

### 18b. `payment_reconciliation_cases`
- **Purpose:** Authoritative operational dispute and exception domain entity tracking payment mismatches, late capture inventory exhaustion, unbound webhooks, and crash boundary recovery failures requiring human admin investigation.
- **Owner / Authority:** Financial Operations & Automated Reconciliation Worker.
- **Required Relationships:** Foreign key to `payment_attempts.id` (nullable), `subscription_payment_attempts.id` (nullable), `bookings.id` (nullable), `growth_subscriptions.id` (nullable), `users.id` (assigned admin, nullable).
- **Uniqueness / Idempotency Boundary:** Database constraints `UNIQUE (provider, payment_attempt_id, reason_code)` and `UNIQUE (provider, subscription_payment_attempt_id, reason_code)` guarantee that duplicate failure events or repeated webhook deliveries cannot open duplicate reconciliation cases.
- **Mutable Fields:** `status` (`OPEN`, `INVESTIGATING`, `RESOLVED_ORDER_FOUND`, `RESOLVED_NO_ORDER`, `REFUND_REQUIRED`, `CLOSED`), `severity` (`P1_CRITICAL`, `P2_HIGH`, `P3_MEDIUM`), `assigned_admin_id`, `resolution_code` (`ORDER_LINKED_CONFIRMED`, `HOLD_RELEASED_REFUNDED`, `DEFICIT_RECOVERED`, `FALSE_POSITIVE_CLEARED`, `UNRESOLVABLE_WRITTEN_OFF`), `admin_notes`, `resolved_at`, `updated_at`.
- **Immutable Fields:** `id` (UUID), `case_number` (unique human-readable sequential identifier e.g. `REC-2026-XXXXX`), `provider` (`RAZORPAY`), `payment_attempt_id`, `subscription_payment_attempt_id`, `booking_id`, `subscription_id`, `reason_code` (`VALIDATION_MISMATCH`, `LATE_CAPTURE_INVENTORY_UNAVAILABLE`, `STALE_ORDER_CREATING_UNRESOLVED`, `UNBOUND_WEBHOOK_PAYLOAD`, `GATEWAY_AMOUNT_MISMATCH`), `evidence` (JSONB snapshot containing raw webhook headers, payload, provider response, and audit log IDs), `created_at`.
- **Guest Visibility:** STRICTLY CONFIDENTIAL. Never exposed to guests.
- **Audit / Retention:** Retained 10 years [PROPOSED / LEGAL REVIEW] for financial governance and auditing compliance.
- **Current vs Target Status:** TARGET (Milestone 9 implementation; eliminates undefined ad-hoc queues).

### 19. `inbound_webhooks`
- **Purpose:** Durable, audit-trailed storage of raw inbound HTTP webhook payloads before asynchronous processing.
- **Owner / Authority:** Webhook Receiver Handler.
- **Required Relationships:** Optional reference to `bookings.id` after resolution.
- **Mutable Fields:** `processing_status` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `DEAD_LETTER`), `attempts`, `last_error`, `processed_at`.
- **Immutable Fields:** `id` (UUID), `provider` (`RAZORPAY`), `provider_event_id`, `signature`, `raw_payload`, `received_at`.
- **Guest Visibility:** Hidden from guest.
- **Audit / Retention:** Retained 1 year; dead-letter events retained 3 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** LEGACY (`inbound_webhooks` table exists in Neon, but lacks target contract/worker fulfillment for guest stays).

### 20. `checkin_verification_records`
- **Purpose:** Authoritative evidence of guest arrival and physical occupancy unlocking host payout release.
- **Owner / Authority:** Check-in Verification Domain.
- **Required Relationships:** Foreign key to `bookings.id`, `listings.id`, `users.id` (guest).
- **Mutable Fields:** `verification_status` (`CONFIRMED`, `DISPUTED`, `AUTO_CONFIRMED_WINDOW`), `dispute_reason`.
- **Immutable Fields:** `id`, `booking_id`, `method` (`HOST_PIN_SCAN`, `GUEST_GPS_CONFIRM`, `AUTO_TIME_RELEASE`), `verified_at`.
- **Guest Visibility:** Visible to booking guest as check-in status.
- **Audit / Retention:** Retained 7 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 11 implementation).

### 21. `host_payout_accounts`
- **Purpose:** Authoritative banking and payment rail configurations for host disbursements.
- **Owner / Authority:** Payout & Settlement Service.
- **Required Relationships:** Foreign key to `users.id` (host integer user ID).
- **Mutable Fields:** `status` (`PENDING_VERIFICATION`, `ACTIVE`, `DISABLED`), `account_holder_name`, `bank_name`, `ifsc_code`, `account_number_encrypted`, `beneficiary_id`.
- **Immutable Fields:** `id`, `host_id`, `created_at`.
- **Guest Visibility:** Completely hidden from guests.
- **Audit / Retention:** Retained 10 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 11 implementation; PROVIDER BLOCKED on payout rail selection).

### 22. `payout_transfers`
- **Purpose:** Physical banking rail transaction log recording actual fund transfers dispatched to hosts.
- **Owner / Authority:** Payout & Settlement Service.
- **Required Relationships:** Foreign key to `host_payout_obligations.id` and `host_payout_accounts.id`.
- **Mutable Fields:** `status` (`PENDING`, `SUCCESS`, `FAILED`, `REVERSED`), `failure_reason`, `settled_at`.
- **Immutable Fields:** `id`, `obligation_id`, `account_id`, `amount_paise`, `currency` ('INR'), `rail_provider` ('RAZORPAYX' / 'DIRECT_BANK'), `rail_reference_number`, `dispatched_at`.
- **Guest Visibility:** Completely hidden from guests.
- **Audit / Retention:** Retained 10 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 11 implementation).

### 23. `host_payout_obligations`
- **Purpose:** Escrow and disbursement ledger tracking funds due to hosts following guest stay completion.
- **Owner / Authority:** Host Payout Service.
- **Required Relationships:** Foreign key to `bookings.id`, `listings.id`, `users.id` (host integer ID), and foreign key to `payout_policy_versions.id`.
- **Mutable Fields:** `status` (`BLOCKED`, `ELIGIBLE`, `INITIATED`, `SETTLED`, `FAILED`, `HELD_FOR_REVIEW`, `REVERSED`), `scheduled_release_at`, `payout_reference`.
- **Immutable Fields:** `id`, `booking_id`, `payout_policy_version_id`, `host_id`, `gross_settlement_paise`, `reserve_deduction_paise`, `net_payable_paise`, `created_at`.
- **Guest Visibility:** Hidden from guest.
- **Audit / Retention:** Retained 10 years [PROPOSED / LEGAL REVIEW] for statutory accounting compliance.
- **Current vs Target Status:** TARGET (Milestone 11 implementation).

### 23b. `payout_policy_versions`
- **Purpose:** Master versioned policy entity defining host disbursement rules, hold windows, and release triggers. Prevents policy mutation from altering historical payout obligations.
- **Owner / Authority:** Platform Administrator & Finance Policy Engine.
- **Required Relationships:** Foreign key from `host_payout_obligations.payout_policy_version_id`. References `users.id` (`created_by_admin_id`).
- **Immutability Contract:** Once created and marked active, policy version parameters are strictly immutable. Existing obligations bound to a version never change their scheduled release calculations when new policy versions are published.
- **High-Risk Payout Gate:** Standard tier release timing is check-in + 24 hours (subject to Founder Gates [PROPOSED-008, PROPOSED-009]). High-risk host release timing is strictly UNRESOLVED and GATED behind Founder Gate [PROPOSED-010] (unresolved between checkout vs checkout + 24h); no unresolved choice is hardcoded.
- **Mutable Fields:** `deprecated_at`, `is_default`.
- **Immutable Fields:** `id` (UUID), `version_code` (e.g., `PAYOUT-STD-V1`, `PAYOUT-RISK-V1`), `host_tier` (`STANDARD`, `HIGH_RISK`), `release_trigger` (`CHECKIN_PLUS_HOURS`, `CHECKOUT_PLUS_HOURS`), `delay_hours` (e.g. 24 for standard; gated for high-risk), `requires_checkin_verification` (boolean, true), `effective_from`, `created_by_admin_id`, `created_at`.
- **Guest Visibility:** STRICTLY CONFIDENTIAL. Never exposed to guests.
- **Audit / Retention:** Permanent historical retention [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 5 / 11 implementation).

### 24. `host_reserve_ledgers`
- **Purpose:** Security deposit and deficit-protection ledger for new or high-risk hosts (default 10% for 30 days).
- **Owner / Authority:** Risk & Compliance Engine.
- **Required Relationships:** Foreign key to `users.id` (host integer ID), optional reference to `bookings.id`.
- **Mutable Fields:** `status` (`HELD`, `RELEASED`, `FORFEITED_FOR_DEFICIT`).
- **Immutable Fields:** `id`, `host_id`, `booking_id`, `amount_paise`, `release_due_at`, `created_at`.
- **Guest Visibility:** Hidden from guest.
- **Audit / Retention:** Retained 10 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 11 implementation).

### 25. `reserve_deficit_recovery_ledgers`
- **Purpose:** Tracks unrecovered negative balances resulting from guest refunds or reversals exceeding available reserve funds.
- **Owner / Authority:** Risk & Finance Operations.
- **Required Relationships:** Foreign key to `users.id` (host), references `bookings.id`.
- **Mutable Fields:** `recovery_status` (`OUTSTANDING`, `PARTIALLY_RECOVERED`, `SETTLED`, `WRITTEN_OFF`), `recovered_amount_paise`.
- **Immutable Fields:** `id`, `host_id`, `booking_id`, `deficit_amount_paise`, `currency` ('INR'), `created_at`.
- **Guest Visibility:** Completely hidden from guests.
- **Audit / Retention:** Retained 10 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 11 implementation).

### 26. `guest_refunds`
- **Purpose:** Authoritative record of statutory or policy-driven refunds dispatched to guests.
- **Owner / Authority:** Refund Orchestration Worker.
- **Required Relationships:** Foreign key to `bookings.id`, references `payment_attempts.id`.
- **Mutable Fields:** `status` (`REQUESTED`, `APPROVED`, `REJECTED`, `MANUAL_REVIEW`, `PROVIDER_PENDING`, `REFUNDED`, `PARTIALLY_REFUNDED`), `provider_refund_id`, `failure_reason`.
- **Immutable Fields:** `id`, `booking_id`, `requested_amount_paise`, `approved_amount_paise`, `currency`, `reason_code`, `created_at`.
- **Guest Visibility:** Visible to guest on cancellation receipt and refund tracking screen.
- **Audit / Retention:** Retained 7 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 11 implementation).

### 27. `property_audit_events`
- **Purpose:** Immutable append-only audit trail capturing every state change, price change, or moderation action on a property.
- **Owner / Authority:** Server Domain Interceptors.
- **Required Relationships:** Foreign key to `listings.id`, optional `user_id` (actor integer ID).
- **Mutable Fields:** None (strictly append-only).
- **Immutable Fields:** `id` (BIGINT), `listing_id`, `actor_id`, `actor_role`, `action`, `previous_state`, `new_state`, `ip_address`, `created_at`.
- **Guest Visibility:** Hidden from guest.
- **Audit / Retention:** Retained permanently [PROPOSED / LEGAL REVIEW] for compliance and dispute resolution.
- **Current vs Target Status:** TARGET (Milestone 12 implementation).

### 28. `booking_audit_events`
- **Purpose:** Immutable append-only lifecycle event log recording every state transition from hold to checkout.
- **Owner / Authority:** Server Domain Interceptors.
- **Required Relationships:** Foreign key to `bookings.id`.
- **Mutable Fields:** None (strictly append-only).
- **Immutable Fields:** `id` (BIGINT), `booking_id`, `actor_id`, `actor_role`, `from_status`, `to_status`, `transition_reason`, `correlation_id`, `created_at`.
- **Guest Visibility:** State transition timestamps reflected in customer booking timeline.
- **Audit / Retention:** Retained permanently [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 9 / Milestone 10 implementation).

### 29. `reviews`
- **Purpose:** Traveler feedback and satisfaction ratings tied to verified completed stays.
- **Owner / Authority:** Guest Review Service; moderated by Admin.
- **Required Relationships:** Foreign key to `bookings.id`, `listings.id`, `users.id` (guest integer ID).
- **Mutable Fields:** `moderation_status` (`PENDING`, `APPROVED`, `REJECTED`), `admin_notes`.
- **Immutable Fields:** `id`, `booking_id`, `listing_id`, `guest_id`, `cleanliness_rating`, `accuracy_rating`, `value_rating`, `overall_rating`, `review_text`, `created_at`.
- **Guest Visibility:** Publicly readable on property details only after verified booking completion and admin approval.
- **Audit / Retention:** Retained permanently [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** LEGACY (Table exists in Neon, but `ListingDetailsNew.tsx` renders hardcoded 4.95 rating, 124 reviews, and 3 static testimonial quotes).

### 30. `property_verification_records`
- **Purpose:** Authoritative factual evidence supporting public property verification (audit method, inspector ID, date).
- **Owner / Authority:** Admin Inspection Operations.
- **Required Relationships:** Foreign key to `listings.id`, references `users.id` (inspector integer ID).
- **Mutable Fields:** `verification_status` (`UNVERIFIED`, `PHYSICAL_INSPECTION_PASSED`, `DOCUMENT_VERIFIED`, `REVOKED`), `notes`.
- **Immutable Fields:** `id`, `listing_id`, `inspector_id`, `inspection_date`, `certificate_hash`, `created_at`.
- **Guest Visibility:** Public display of verification fact (date and audit standard) on property page; replaces unproven badges.
- **Audit / Retention:** Retained 10 years [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 6 / Milestone 12 implementation).

### 31. `transactional_outbox`
- **Purpose:** Transactionally reliable message dispatch for downstream side effects (guest confirmation email, host SMS, analytics sync).
- **Owner / Authority:** Domain Services (within local database transactions).
- **Required Relationships:** Optional reference to `bookings.id` or `listings.id`.
- **Mutable Fields:** `status` (`PENDING`, `PROCESSING`, `SENT`, `FAILED`), `attempts`, `last_attempted_at`.
- **Immutable Fields:** `id` (BIGINT), `aggregate_type`, `aggregate_id`, `event_type`, `payload_json`, `created_at`.
- **Guest Visibility:** Hidden from guest.
- **Audit / Retention:** Processed events retained 30 days; failed events retained 1 year [PROPOSED / LEGAL REVIEW].
- **Current vs Target Status:** TARGET (Milestone 9 implementation).

---

## 6. Canonical State Machines

All domain state transitions are strictly governed by formal state machines. Any transition not explicitly documented in the transition matrices below is strictly illegal, must fail closed, and will throw a domain state rejection exception.

```
```
PROPERTY PUBLICATION:
  DRAFT ────────► IN_REVIEW ────────► PUBLISHED ────────► PAUSED
    ▲                 │                   │                 │
    │                 ▼                   ▼                 ▼
    └──────── CHANGES_REQUESTED       ARCHIVED          ARCHIVED

QUOTE:
  ACTIVE ────────► CONSUMED (Triggered upon BOOKING_CONFIRMED)
    │   ▲ (Reused across retries while valid)
    │   │
    ├────────────► EXPIRED (TTL elapsed)
    │
    └────────────► SUPERSEDED (Date/guest change)

HOLD:
  ACTIVE ────────► CONSUMED
    │
    ├────────────► EXPIRED
    │
    └────────────► RELEASED

BOOKING:
  PAYMENT_PENDING ──► CONFIRMED ──► CHECKED_IN ──► CHECKED_OUT
        │                 │
        ├─► PAYMENT_FAILED├─► CANCELLATION_PENDING ──► CANCELLED
        │                 │
        ├─► EXPIRED       └─► NO_SHOW
        │
        └─► PAYMENT_CAPTURED_INVENTORY_UNAVAILABLE (Late payment manual review / conditional refund)

PAYMENT ATTEMPT:
  ORDER_CREATING ──► ORDER_CREATED ──► AUTHORIZED ──► CAPTURED
        │                 │                │             │
        ├─► FAILED        ├─► FAILED       ├─► FAILED    ├─► DISPUTED ──► REVERSED / DEFICIT_LOGGED
        │                 │                │             │
        ├─► UNKNOWN_OUT.. ├─► EXPIRED      ├─► RECONCIL..└─► RECONCILIATION_REQUIRED
        │   (Timeout/stale│                │
        │    sweeper)     ├─► UNKNOWN_OUTCOME (Timeout)
        │                 │
        │                 └─► RECONCILIATION_REQUIRED (Mismatch)
        ▼
  UNKNOWN_OUTCOME ──► ORDER_CREATED (Reconciled found via receipt=attempt_id)
        │
        └─► RECONCILIATION_REQUIRED / Manual Review (Order unverified / provider blocked)

REFUND:
  REQUESTED ──────► APPROVED ────────► PROVIDER_PENDING ──► REFUNDED
        │              ▲                       │                 ▲
        ├─► REJECTED   │                       ├─► FAILED ──► RETRY_SCHEDULED ──► PROVIDER_PENDING
        │              │                       │                 │
        │              │                       │                 └─► MANUAL_REVIEW (Exhausted)
        │              │                       ▼
        │              └─ MANUAL_REVIEW ──► PARTIALLY_REFUNDED ──┘
        │                       ▲              │
        └─► MANUAL_REVIEW ──────┴──────────────┴─► REJECTED

HOST PAYOUT (Release timing derived from approved policy snapshot; Standard: Check-in + 24h; High-Risk: Unresolved [PROPOSED-010]):
  BLOCKED ──► ELIGIBLE ──► INITIATED ──► SETTLED
                │              │
                │              ├─► FAILED ──► RETRY_SCHEDULED ──► INITIATED
                │              │     │
                │              │     └─► MANUAL_RESOLUTION (Terminal after max retries)
                │              │
                │              └─► REVERSED ──► DEFICIT_LOGGED
                │
                └─► HELD_FOR_REVIEW ──► ELIGIBLE

GROWTH SUBSCRIPTION LIFECYCLE:
  PENDING_ACTIVATION ──► ACTIVE ──► EXPIRED
          │                │
          │                ├─► CANCELLED_NON_RENEWAL
          │                │
          │                ├─► REFUNDED_DUPLICATE
          │                │
          │                ├─► REFUNDED_TECHNICAL
          │                │
          │                └─► REFUNDED_LEGAL
          ▼
       EXPIRED

SUBSCRIPTION PAYMENT ATTEMPT:
  ORDER_CREATING ──► ORDER_CREATED ──► AUTHORIZED ──► CAPTURED
        │                 │                │             │
        ├─► FAILED        ├─► FAILED       ├─► FAILED    └─► RECONCILIATION_REQUIRED
        │                 │                │
        ├─► UNKNOWN_OUT.. ├─► EXPIRED      └─► RECONCILIATION_REQUIRED
        │   (Timeout/stale│
        │    sweeper)     └─► UNKNOWN_OUTCOME
        ▼
  UNKNOWN_OUTCOME ──► ORDER_CREATED (Reconciled found)
        │
        └─► RECONCILIATION_REQUIRED (Order unverified / provider blocked; opens payment_reconciliation_cases)

PAYMENT RECONCILIATION CASES:
  OPEN ──────────► INVESTIGATING ──► RESOLVED_ORDER_FOUND ──► CLOSED
    │                    │
    ├─► INVESTIGATING ───┼─► RESOLVED_NO_ORDER ─────────────► CLOSED
    │                    │
    └─► INVESTIGATING ───┴─► REFUND_REQUIRED ───────────────► CLOSED (via guest_refunds)

ACCOMMODATION INVOICE (IMMUTABLE DOCUMENT):
  (INITIAL) ────────► ISSUED ──► [IMMUTABLE DOCUMENT LOCKED]
                         │
                         └─► Linked linked_adjustment_documents generated (LEGAL BLOCKED statutory classification)
```

### Transition Matrices

#### 1. Property Publication State Machine
| From State | To State | Trigger / Event | Actor | Preconditions | Transaction Boundary | Idempotency Behavior | Audit Event Dispatched | Terminal State? |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| `DRAFT` | `IN_REVIEW` | `SUBMIT_FOR_REVIEW` | Host | All required presentation fields populated; each bookable room type has >= 3 approved room-specific photos (incl. sleeping area; Decision #35) | Local DB Tx | No-op if already `IN_REVIEW` | `PROPERTY_SUBMITTED_FOR_REVIEW` | NO |
| `IN_REVIEW` | `CHANGES_REQUESTED` | `REQUEST_CHANGES` | Admin | Moderator notes provided | Local DB Tx | Reject if already resolved | `PROPERTY_CHANGES_REQUESTED` | NO |
| `IN_REVIEW` | `PUBLISHED` | `APPROVE_AND_PUBLISH` | Admin | QC check passed; verification fact recorded | Local DB Tx + Outbox | No-op if already `PUBLISHED` | `PROPERTY_PUBLISHED` | NO |
| `PUBLISHED` | `PAUSED` | `PAUSE_LISTING` | Host / Admin | Listing currently published | Local DB Tx | No-op if already `PAUSED` | `PROPERTY_PAUSED` | NO |
| `PAUSED` | `PUBLISHED` | `RESUME_LISTING` | Host / Admin | Property valid and approved | Local DB Tx | No-op if already `PUBLISHED` | `PROPERTY_RESUMED` | NO |
| `PUBLISHED` | `ARCHIVED` | `ARCHIVE_LISTING` | Admin | Zero active bookings | Local DB Tx | Reject if active bookings exist | `PROPERTY_ARCHIVED` | YES |
| `PAUSED` | `ARCHIVED` | `ARCHIVE_LISTING` | Admin | Zero active bookings | Local DB Tx | Reject if active bookings exist | `PROPERTY_ARCHIVED` | YES |

#### 2. Quote State Machine
| From State | To State | Trigger / Event | Actor | Preconditions | Transaction Boundary | Idempotency Behavior | Audit Event Dispatched | Terminal State? |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| `(INITIAL)` | `ACTIVE` | `CALCULATE_QUOTE` | Guest / Engine | Stay dates valid; occupancy within limits | Local DB Tx | Immutable insert (new `quote_id`) | `QUOTE_GENERATED` | NO |
| `ACTIVE` | `ACTIVE` | `RETRY_ORDER_CREATION` | Checkout / Guest | Quote still valid (`NOW() <= expires_at`); prior order attempt failed/expired | Local DB Tx | Reusable across payment attempts until expiration; returns existing quote total | `QUOTE_REUSED_FOR_RETRY` | NO |
| `ACTIVE` | `CONSUMED` | `BOOKING_CONFIRMED` | Webhook Worker | Payment captured; booking confirmed | Local DB Tx (with Booking) | Consumed strictly upon booking confirmation; immutable; transition once | `QUOTE_CONSUMED` | YES |
| `ACTIVE` | `EXPIRED` | `QUOTE_TIMEOUT` | Expiration Worker | `NOW() > expires_at` (15m default) | Local DB Tx | No-op if already non-active | `QUOTE_EXPIRED` | YES |
| `ACTIVE` | `SUPERSEDED` | `REQUOTE_REQUESTED` | Guest | Guest altered dates or guest count | Local DB Tx | Marks prior quote superseded | `QUOTE_SUPERSEDED` | YES |

#### 3. Hold State Machine
| From State | To State | Trigger / Event | Actor | Preconditions | Transaction Boundary | Idempotency Behavior | Audit Event Dispatched | Terminal State? |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| `(INITIAL)` | `ACTIVE` | `ACQUIRE_HOLD` | Guest Session | `inventory_days` locked `FOR UPDATE`; capacity available | DB Tx (Row lock on inventory) | Reject if units unavailable (409) | `HOLD_ACQUIRED` | NO |
| `ACTIVE` | `CONSUMED` | `BOOKING_CONFIRMED` | Webhook Worker | Captured payment verified | Local DB Tx (with Booking) | Idempotent on webhook replay | `HOLD_CONSUMED` | YES |
| `ACTIVE` | `EXPIRED` | `HOLD_TIMEOUT` | Hold Sweeper | `NOW() > expires_at` (10m default [PROPOSED-004]) | DB Tx (Decrement held_units) | No-op if already transitioned | `HOLD_EXPIRED` | YES |
| `ACTIVE` | `RELEASED` | `GUEST_ABANDONED` | Guest / SPA | Guest navigated back or canceled | DB Tx (Decrement held_units) | No-op if already released | `HOLD_RELEASED` | YES |

#### 4. Booking State Machine
| From State | To State | Trigger / Event | Actor | Preconditions | Transaction Boundary | Idempotency Behavior | Audit Event Dispatched | Terminal State? |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| `(INITIAL)` | `PAYMENT_PENDING` | `CREATE_BOOKING_ORDER` | Checkout Service | Hold is `ACTIVE`; authenticated user | DB Tx (Insert booking & attempt) | Deduplicated by idempotency key & request fingerprint | `BOOKING_ORDER_CREATED` | NO |
| `PAYMENT_PENDING` | `CONFIRMED` | `PAYMENT_CAPTURED_EVENT` | Webhook Worker | HMAC valid; exact amount match; anti-replay clean; hold active or inventory re-locked | DB Tx (Booking, hold, settlement, outbox) | Idempotent via `processed_payments` | `BOOKING_CONFIRMED` | NO |
| `PAYMENT_PENDING` | `PAYMENT_CAPTURED_INVENTORY_UNAVAILABLE` | `LATE_CAPTURE_INVENTORY_DEPLETED` | Webhook Worker | Payment captured but hold expired and units unavailable | DB Tx (Booking + manual reconciliation queue) | Idempotent via `processed_payments` (Pre-approval: manual review queue; automated refund gated behind PROPOSED-012) | `BOOKING_LATE_CAPTURE_DEPLETED` | YES |
| `PAYMENT_PENDING` | `PAYMENT_FAILED` | `GATEWAY_PAYMENT_FAILED` | Gateway Webhook | Razorpay reports failed transaction | Local DB Tx | No-op if already failed/expired | `BOOKING_PAYMENT_FAILED` | YES |
| `PAYMENT_PENDING` | `EXPIRED` | `ORDER_EXPIRED_SWEEPER` | Sweeper Worker | Hold expired without payment capture | Local DB Tx | No-op if already resolved | `BOOKING_ORDER_EXPIRED` | YES |
| `CONFIRMED` | `CHECKED_IN` | `GUEST_ARRIVED` | Host / System | Arrival date reached; verified by arrival record | Local DB Tx | Idempotent check-in mark | `BOOKING_CHECKED_IN` | NO |
| `CHECKED_IN` | `CHECKED_OUT` | `STAY_COMPLETED` | System / Host | Check-out date reached | Local DB Tx | Idempotent completion mark | `BOOKING_CHECKED_OUT` | YES |
| `CONFIRMED` | `CANCELLATION_PENDING` | `GUEST_CANCEL_REQUEST` | Guest | Within cancellation window | Local DB Tx | Reject if already cancelling | `BOOKING_CANCELLATION_REQUESTED` | NO |
| `CANCELLATION_PENDING` | `CANCELLED` | `CANCELLATION_PROCESSED` | Refund Worker | Inventory freed; refund record created | DB Tx (Inventory + Refund) | Idempotent refund completion | `BOOKING_CANCELLED` | YES |
| `CONFIRMED` | `NO_SHOW` | `MARK_NO_SHOW` | Host / Admin | Check-in date passed + 24h grace without arrival | Local DB Tx | Reject if already checked in | `BOOKING_MARKED_NO_SHOW` | YES |

#### 5. Payment Attempt State Machine
| From State | To State | Trigger / Event | Actor | Preconditions | Transaction Boundary | Idempotency Behavior | Audit Event Dispatched | Terminal State? |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| `(INITIAL)` | `ORDER_CREATING` | `CREATE_PAYMENT_ATTEMPT` | Payment Engine | Hold `ACTIVE`; valid quote | Local DB Tx | Keyed by idempotency key & request fingerprint | `PAYMENT_ORDER_CREATING` | NO |
| `ORDER_CREATING` | `ORDER_CREATED` | `GATEWAY_ORDER_SUCCESS` | Payment Engine | Razorpay API returns 200 with order ID | Local DB Tx | Updates gateway_order_id | `PAYMENT_ORDER_INITIALIZED` | NO |
| `ORDER_CREATING` | `FAILED` | `GATEWAY_DEFINITE_ERROR` | Payment Engine | Provider returns explicit deterministic 4xx rejection payload | Local DB Tx | Records error code & description | `PAYMENT_ORDER_DEFINITE_FAILED` | YES |
| `ORDER_CREATING` | `UNKNOWN_OUTCOME` | `GATEWAY_HTTP_TIMEOUT` | Payment Engine | Gateway call timed out or network severed before response | Local DB Tx | Flags record for background reconciliation worker | `PAYMENT_ORDER_TIMEOUT_RECORDED` | NO |
| `ORDER_CREATING` | `UNKNOWN_OUTCOME` | `SWEEPER_STALE_LEASE` | Sweeper Worker | Lease TTL expired (>2m); local state cannot prove dispatch | Local DB Tx | Never mark FAILED on lease expiration; fail closed to UNKNOWN_OUTCOME | `PAYMENT_STALE_LEASE_UNKNOWN` | NO |
| `UNKNOWN_OUTCOME` | `ORDER_CREATED` | `GATEWAY_POLL_RECONCILED` | Reconciliation Worker | Gateway queried by correlation receipt; order confirmed created | Local DB Tx | Updates gateway_order_id | `PAYMENT_RECONCILIATION_ORDER_FOUND` | NO |
| `UNKNOWN_OUTCOME` | `RECONCILIATION_REQUIRED` | `GATEWAY_LOOKUP_BLOCKED` | Reconciliation Worker | Querying by receipt/notes provider blocked; unresolved attempt | Local DB Tx | Escalates to manual admin queue; zero blind retry | `PAYMENT_RECONCILIATION_REQUIRED_FLAGGED` | YES |
| `ORDER_CREATED` | `AUTHORIZED` | `GATEWAY_AUTH_WEBHOOK` | Webhook Handler | Razorpay reports `payment.authorized` | Local DB Tx | Idempotent update | `PAYMENT_AUTHORIZED` | NO |
| `ORDER_CREATED` | `CAPTURED` | `GATEWAY_CAPTURE_WEBHOOK` | Webhook Worker | Direct capture report (`order.paid`) | DB Tx (Fulfill booking) | Anti-replay via `processed_payments` (RETURNING contract) | `PAYMENT_CAPTURED` | NO |
| `AUTHORIZED` | `CAPTURED` | `GATEWAY_CAPTURE_WEBHOOK` | Webhook Worker | Razorpay reports capture; exact amount match | DB Tx (Fulfill booking) | Anti-replay via `processed_payments` (RETURNING contract) | `PAYMENT_CAPTURED` | NO |
| `ORDER_CREATED` | `FAILED` | `GATEWAY_FAIL_WEBHOOK` | Webhook Handler | Payment authorization failed | Local DB Tx | Idempotent failure mark | `PAYMENT_ATTEMPT_FAILED` | YES |
| `AUTHORIZED` | `FAILED` | `CAPTURE_FAILED_EVENT` | Gateway Worker | Auto-capture timeout or bank rejection | Local DB Tx | Idempotent failure mark | `PAYMENT_CAPTURE_FAILED` | YES |
| `ORDER_CREATED` | `EXPIRED` | `SWEEPER_EXPIRED` | Sweeper Worker | Order TTL elapsed without payment | Local DB Tx | Idempotent expiration mark | `PAYMENT_ORDER_EXPIRED` | YES |
| `CAPTURED` | `DISPUTED` | `CHARGEBACK_RECEIVED` | Admin / Gateway | Bank dispute filed by cardholder | Local DB Tx + Hold Payout | Immediate payout hold freeze | `PAYMENT_DISPUTED` | NO |
| `DISPUTED` | `REVERSED` | `CHARGEBACK_LOST` | Admin / Bank | Dispute decided in cardholder favor | Local DB Tx + Deficit Ledger | Logs deficit recovery obligation | `PAYMENT_CHARGEBACK_REVERSED` | YES |
| `ORDER_CREATED` | `RECONCILIATION_REQUIRED` | `AMOUNT_CURRENCY_MISMATCH` | Webhook Worker | Amount != quote total OR currency != 'INR' | Local DB Tx | Locks booking; flags manual review | `PAYMENT_RECONCILIATION_FLAGGED` | YES |
| `AUTHORIZED` | `RECONCILIATION_REQUIRED` | `AUTH_AMOUNT_MISMATCH` | Webhook Worker | Authorized amount != quote total | Local DB Tx | Blocks capture; flags manual review | `PAYMENT_AUTH_MISMATCH_FLAGGED` | YES |

#### 6. Refund State Machine
| From State | To State | Trigger / Event | Actor | Preconditions | Transaction Boundary | Idempotency Behavior | Audit Event Dispatched | Terminal State? |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| `(INITIAL)` | `REQUESTED` | `INITIATE_REFUND` | Guest / Admin / Worker | Booking cancelled, disputed, or inventory unavailable | Local DB Tx | Single active refund per booking | `REFUND_REQUESTED` | NO |
| `REQUESTED` | `APPROVED` | `APPROVE_REFUND` | Policy Engine / Admin | Within statutory cancellation rules or system failure | Local DB Tx | Idempotent approval | `REFUND_APPROVED` | NO |
| `REQUESTED` | `REJECTED` | `REJECT_REFUND` | Policy Engine / Admin | Outside policy window; non-refundable | Local DB Tx | Terminal rejection | `REFUND_REJECTED` | YES |
| `REQUESTED` | `MANUAL_REVIEW` | `FLAG_MANUAL_REVIEW` | Fraud / Risk Service | High-value refund or host dispute | Local DB Tx | Pauses automated gateway dispatch | `REFUND_FLAGGED_MANUAL_REVIEW` | NO |
| `MANUAL_REVIEW` | `APPROVED` | `ADMIN_OVERRIDE_APPROVE` | Admin / Risk Ops | Manual review completed and sanctioned | Local DB Tx | Advances to dispatch queue | `REFUND_MANUAL_REVIEW_APPROVED` | NO |
| `MANUAL_REVIEW` | `REJECTED` | `ADMIN_OVERRIDE_REJECT` | Admin / Risk Ops | Manual review completed; fraud/breach confirmed | Local DB Tx | Terminal rejection | `REFUND_MANUAL_REVIEW_REJECTED` | YES |
| `APPROVED` | `PROVIDER_PENDING` | `DISPATCH_RAZORPAY_REFUND` | Refund Worker | Razorpay refund API invoked | Local DB Tx | Idempotent gateway dispatch | `REFUND_DISPATCHED_TO_GATEWAY` | NO |
| `PROVIDER_PENDING` | `REFUNDED` | `GATEWAY_REFUND_PROCESSED` | Webhook Worker | Razorpay reports refund processed | Local DB Tx + Outbox | Anti-replay via refund ID | `REFUND_PROCESSED_SUCCESS` | YES |
| `PROVIDER_PENDING` | `PARTIALLY_REFUNDED` | `PARTIAL_CAPTURE_RESOLVED` | Webhook Worker | Partial refund cleared by provider | Local DB Tx + Outbox | Anti-replay via refund ID | `REFUND_PARTIAL_PROCESSED` | NO |
| `PROVIDER_PENDING` | `FAILED` | `GATEWAY_REFUND_FAILED` | Gateway Webhook / Error | Provider rejects refund transfer | Local DB Tx | Flags for retry or manual review | `REFUND_DISPATCH_FAILED` | NO |
| `FAILED` | `RETRY_SCHEDULED` | `SCHEDULE_REFUND_RETRY` | Refund Worker | Retry count < max; backoff delay elapsed | Local DB Tx | Re-queues dispatch | `REFUND_RETRY_SCHEDULED` | NO |
| `RETRY_SCHEDULED` | `PROVIDER_PENDING` | `DISPATCH_RAZORPAY_REFUND` | Refund Worker | Backoff elapsed; retrying API call | Local DB Tx | Gateway call | `REFUND_DISPATCHED_TO_GATEWAY` | NO |
| `FAILED` | `MANUAL_REVIEW` | `MAX_REFUND_RETRIES_EXCEEDED` | Refund Scheduler | Retries exhausted | Local DB Tx | Escalates to finance ops | `REFUND_ESCALATED_MANUAL_REVIEW` | NO |
| `PARTIALLY_REFUNDED` | `REFUNDED` | `REMAINDER_REFUND_PROCESSED` | Webhook Worker | Final remaining refund balance cleared | Local DB Tx + Outbox | Terminal full refund completion | `REFUND_REMAINDER_PROCESSED` | YES |

#### 7. Host Payout State Machine
| From State | To State | Trigger / Event | Actor | Preconditions | Transaction Boundary | Idempotency Behavior | Audit Event Dispatched | Terminal State? |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| `(INITIAL)` | `BLOCKED` | `BOOKING_CONFIRMED` | Webhook Worker | Booking confirmed; funds in escrow | Local DB Tx (with Booking) | Created with `scheduled_release_at` derived from versioned approved payout-policy snapshot | `HOST_PAYOUT_ESCROWED` | NO |
| `BLOCKED` | `ELIGIBLE` | `POLICY_MATURITY_REACHED` | Payout Scheduler | Policy release time reached (Standard: Check-in + 24h; High-Risk: Gated behind PROPOSED-010); verified arrival; zero open disputes | Local DB Tx | Transitions mature payouts | `HOST_PAYOUT_ELIGIBLE` | NO |
| `BLOCKED` | `HELD_FOR_REVIEW` | `DISPUTE_OR_RISK_FLAG` | Risk Engine / Admin | Guest dispute filed; high risk detected | Local DB Tx | Freezes release | `HOST_PAYOUT_FROZEN` | NO |
| `HELD_FOR_REVIEW` | `ELIGIBLE` | `ADMIN_UNFREEZE` | Admin | Dispute resolved in host's favor | Local DB Tx | Clears hold | `HOST_PAYOUT_UNFROZEN` | NO |
| `ELIGIBLE` | `INITIATED` | `DISPATCH_BANK_PAYOUT` | Payout Worker | Payout rail online; bank details verified | Local DB Tx | Idempotency key per payout obligation | `HOST_PAYOUT_DISPATCHED` | NO |
| `INITIATED` | `SETTLED` | `BANK_SETTLEMENT_CONFIRMED` | Rail Webhook / Ack | Bank reports successful transfer | Local DB Tx | Anti-replay on rail transfer ID | `HOST_PAYOUT_SETTLED` | YES |
| `INITIATED` | `FAILED` | `BANK_TRANSFER_REJECTED` | Rail Webhook / Error | Invalid IFSC / account blocked | Local DB Tx | Triggers automatic retry evaluation | `HOST_PAYOUT_FAILED` | NO |
| `FAILED` | `RETRY_SCHEDULED` | `SCHEDULE_PAYOUT_RETRY` | Payout Scheduler | Retry counter < max retries; backoff delay elapsed | Local DB Tx | Schedules retry window | `HOST_PAYOUT_RETRY_SCHEDULED` | NO |
| `RETRY_SCHEDULED` | `INITIATED` | `RETRY_SCHEDULED_DISPATCH` | Payout Worker | Backoff delay elapsed; re-initiating bank transfer | Local DB Tx | Exponential backoff retry | `HOST_PAYOUT_RETRY_DISPATCHED` | NO |
| `FAILED` | `MANUAL_RESOLUTION` | `MAX_RETRIES_EXCEEDED` | Payout Scheduler | Retries exhausted or fatal bank code | Local DB Tx | Escalates to finance operations | `HOST_PAYOUT_ESCALATED_MANUAL` | YES |
| `INITIATED` | `REVERSED` | `PAYOUT_REVERSED_EVENT` | Payout Rail Webhook | Bank recall or clearing reversal | Local DB Tx | Adjusts host balance ledger | `HOST_PAYOUT_REVERSED` | YES |

#### 8. Accommodation Invoice Lifecycle (Immutable Document Contract)
| From State | To State | Trigger / Event | Actor | Preconditions | Transaction Boundary | Idempotency Behavior | Audit Event Dispatched | Terminal State? |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| `(INITIAL)` | `ISSUED` | `GENERATE_INVOICE` | Billing Engine | Booking `CONFIRMED`; valid GSTIN/details | Local DB Tx | Unique per booking ID | `ACCOMMODATION_INVOICE_ISSUED` | NO |
| `ISSUED` | `ISSUED (ADJUSTMENT LINKED)` | `GENERATE_ADJUSTMENT_DOC` | Billing Engine | Booking cancelled or modified; linked adjustment issued | Local DB Tx | Generates sequentially numbered `linked_adjustment_documents` record (LEGAL BLOCKED statutory classification); original invoice remains immutable | `ADJUSTMENT_DOC_ISSUED` | YES |

#### 9. Growth Subscription Lifecycle State Machine
| From State | To State | Trigger / Event | Actor | Preconditions | Transaction Boundary | Idempotency Behavior | Audit Event Dispatched | Terminal State? |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| `(INITIAL)` | `PENDING_ACTIVATION` | `PURCHASE_GROWTH_PLAN` | Host | Listing exists and owned by host | Local DB Tx | Keyed by subscription ID | `SUBSCRIPTION_CREATED` | NO |
| `PENDING_ACTIVATION` | `ACTIVE` | `PAYMENT_CAPTURED` | Webhook Worker | Captured payment verified | Local DB Tx | Idempotent on payment capture via `subscription_processed_payments` | `SUBSCRIPTION_ACTIVATED` | NO |
| `ACTIVE` | `ACTIVE` | `EXTEND_ACTIVE_TERM` | Host / Webhook Worker | New Growth purchase while active | Local DB Tx | Extends expires_at by 30 days from current expires_at without truncating active term (Approved Decision #37) | `SUBSCRIPTION_TERM_EXTENDED` | NO |
| `ACTIVE` | `EXPIRED` | `SUBSCRIPTION_EXPIRED` | Sweeper Worker | `NOW() > expires_at` | Local DB Tx | No-op if already expired | `SUBSCRIPTION_EXPIRED` | YES |
| `ACTIVE` | `CANCELLED_NON_RENEWAL` | `CANCEL_AUTO_RENEW` | Host / System | Active subscription | Local DB Tx | Retains active until expires_at | `SUBSCRIPTION_CANCELLED_NON_RENEWAL` | YES |
| `ACTIVE` | `REFUNDED_DUPLICATE` | `REFUND_DUPLICATE_CHARGE` | Admin / Worker | Confirmed duplicate gateway charge | DB Tx (Ledger + Refund) | Processed once | `SUBSCRIPTION_REFUNDED_DUPLICATE` | YES |
| `ACTIVE` | `REFUNDED_TECHNICAL` | `REFUND_TECH_FAILURE` | Admin / System | Gateway outage or technical billing failure | DB Tx (Ledger + Refund) | Processed once | `SUBSCRIPTION_REFUNDED_TECHNICAL` | YES |
| `ACTIVE` | `REFUNDED_LEGAL` | `REFUND_LEGAL_MANDATE` | Legal / Admin | Statutory or court/regulatory order | DB Tx (Ledger + Refund) | Processed once | `SUBSCRIPTION_REFUNDED_LEGAL` | YES |

#### 10. Payment Reconciliation Case State Machine
| From State | To State | Trigger / Event | Actor | Preconditions | Transaction Boundary | Idempotency Behavior | Audit Event Dispatched | Terminal State? |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| `(INITIAL)` | `OPEN` | `FLAG_RECONCILIATION_CASE` | Worker / Sweeper | Validation mismatch, late capture inventory unavailable, stale order creating, or unbound webhook | Local DB Tx | Unique on `(provider, payment_attempt_id, reason_code)` | `RECONCILIATION_CASE_OPENED` | NO |
| `OPEN` | `INVESTIGATING` | `ASSIGN_INVESTIGATION` | Admin / Worker | Case assigned to admin or automated crawler | Local DB Tx | Idempotent status update | `RECONCILIATION_CASE_ASSIGNED` | NO |
| `INVESTIGATING` | `RESOLVED_ORDER_FOUND` | `CONFIRM_PROVIDER_ORDER` | Admin / Worker | Provider order verified and linked to local attempt | Local DB Tx | Transitions attempt to `ORDER_CREATED` or captured | `RECONCILIATION_ORDER_FOUND` | NO |
| `INVESTIGATING` | `RESOLVED_NO_ORDER` | `CONFIRM_NO_PROVIDER_ORDER` | Admin / Worker | Provider audit conclusively proves zero order created | Local DB Tx | Transitions attempt to `FAILED`; frees hold | `RECONCILIATION_NO_ORDER_CONFIRMED` | NO |
| `INVESTIGATING` | `REFUND_REQUIRED` | `FLAG_MANUAL_REFUND` | Admin | Captured funds cannot be fulfilled (e.g. inventory unavailable) | Local DB Tx | Creates `guest_refunds` record with `status = REQUESTED` | `RECONCILIATION_REFUND_SANCTIONED` | NO |
| `RESOLVED_ORDER_FOUND` | `CLOSED` | `CLOSE_CASE_FULFILLED` | Admin / System | Booking confirmed or manual financial settlement completed | Local DB Tx | Idempotent terminal closure | `RECONCILIATION_CASE_CLOSED` | YES |
| `RESOLVED_NO_ORDER` | `CLOSED` | `CLOSE_CASE_CLEARED` | Admin / System | Attempt marked terminal failed and audit trail persisted | Local DB Tx | Idempotent terminal closure | `RECONCILIATION_CASE_CLOSED` | YES |
| `REFUND_REQUIRED` | `CLOSED` | `CLOSE_CASE_REFUNDED` | Admin / Worker | Approved refund processed and settled through gateway | Local DB Tx | Idempotent terminal closure | `RECONCILIATION_CASE_CLOSED` | YES |

#### 10. Subscription Payment Attempt State Machine
| From State | To State | Trigger / Event | Actor | Preconditions | Transaction Boundary | Idempotency Behavior | Audit Event Dispatched | Terminal State? |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| `(INITIAL)` | `ORDER_CREATING` | `INITIATE_SUBSCRIPTION_PAYMENT` | Host / Service | Valid subscription ID | Local DB Tx | Keyed by idempotency_key | `SUB_PAYMENT_ORDER_CREATING` | NO |
| `ORDER_CREATING` | `ORDER_CREATED` | `GATEWAY_ORDER_SUCCESS` | Payment Service | Razorpay API returns 200 with order ID | Local DB Tx | Updates gateway_order_id | `SUB_PAYMENT_ORDER_CREATED` | NO |
| `ORDER_CREATING` | `FAILED` | `GATEWAY_DEFINITE_REJECTION` | Payment Service | Provider returns explicit deterministic 4xx rejection payload | Local DB Tx | Terminal failure mark | `SUB_PAYMENT_ORDER_FAILED` | YES |
| `ORDER_CREATING` | `UNKNOWN_OUTCOME` | `GATEWAY_HTTP_TIMEOUT` | Payment Service | Provider timeout or connection reset | Local DB Tx | Flags for reconciliation | `SUB_PAYMENT_UNKNOWN_OUTCOME` | NO |
| `ORDER_CREATING` | `UNKNOWN_OUTCOME` | `SWEEPER_STALE_LEASE` | Sweeper Worker | Lease TTL expired (>2m); local state cannot prove dispatch | Local DB Tx | Never mark FAILED on lease expiration; fail closed to UNKNOWN_OUTCOME | `SUB_PAYMENT_STALE_LEASE_UNKNOWN` | NO |
| `UNKNOWN_OUTCOME` | `ORDER_CREATED` | `GATEWAY_POLL_RECONCILED` | Reconciliation Worker | Order found on gateway via correlation receipt | Local DB Tx | Updates gateway_order_id | `SUB_PAYMENT_ORDER_RECONCILED` | NO |
| `UNKNOWN_OUTCOME` | `RECONCILIATION_REQUIRED` | `GATEWAY_LOOKUP_BLOCKED` | Reconciliation Worker | Order querying provider blocked; unresolved attempt | Local DB Tx | Escalates to manual admin queue; zero blind retry | `SUB_PAYMENT_RECONCILIATION_REQUIRED_FLAGGED` | YES |
| `ORDER_CREATED` | `AUTHORIZED` | `GATEWAY_AUTH_WEBHOOK` | Webhook Handler | Razorpay reports authorized | Local DB Tx | Idempotent mark | `SUB_PAYMENT_AUTHORIZED` | NO |
| `ORDER_CREATED` | `CAPTURED` | `GATEWAY_CAPTURE_WEBHOOK` | Webhook Worker | Razorpay reports capture; exact amount (₹4,999 + GST) | DB Tx (Activate subscription) | Anti-replay via `subscription_processed_payments` (RETURNING contract) | `SUB_PAYMENT_CAPTURED` | NO |
| `AUTHORIZED` | `CAPTURED` | `GATEWAY_CAPTURE_WEBHOOK` | Webhook Worker | Direct capture report | DB Tx (Activate subscription) | Anti-replay via `subscription_processed_payments` (RETURNING contract) | `SUB_PAYMENT_CAPTURED` | NO |
| `ORDER_CREATED` | `FAILED` | `GATEWAY_FAIL_WEBHOOK` | Webhook Handler | Payment failed | Local DB Tx | Terminal failure mark | `SUB_PAYMENT_FAILED` | YES |
| `ORDER_CREATED` | `EXPIRED` | `SWEEPER_EXPIRED` | Sweeper Worker | Payment window expired | Local DB Tx | Terminal expiration mark | `SUB_PAYMENT_EXPIRED` | YES |
| `ORDER_CREATED` | `RECONCILIATION_REQUIRED` | `AMOUNT_CURRENCY_MISMATCH` | Webhook Worker | Amount != subscription quote or currency != 'INR' | Local DB Tx | Blocks activation; flags manual review | `SUB_PAYMENT_RECONCILIATION_REQUIRED` | YES |

---

## 7. Canonical Field Migration Strategy

To transition from legacy untyped JSONB fields to authoritative relational structures without downtime, data corruption, or service interruption, all domain field migrations strictly adhere to the FAANG-grade **Expand-DualWrite-Backfill-Reconcile-ShadowRead-Cutover-Retire** protocol:

```
[EXPAND] ──────► [DUAL_WRITE] ──────► [BACKFILL] ──────► [RECONCILE]
                                                              │
[RETIRE] ◄────── [CUTOVER] ◄────── [SHADOW_READ] ◄────────────┘
```

1. **Phase 1: Expand (Database Layer)**
   - Add new nullable relational tables, columns, indexes, and constraints (`room_types`, `media_assets`, `inventory_days`, `booking_quotes`, `internal_booking_settlements`).
   - Existing live queries continue reading from and writing to legacy columns (`listings.rooms`, `listings.photos`, `listings.amenities`).
2. **Phase 2: Dual Write (Application Services)**
   - All mutation endpoints (`HostForm.tsx` via `POST /api/listings/draft` and admin moderation APIs) write concurrently to BOTH the legacy JSONB columns and the new normalized relational tables within a local transaction.
   - Dual-write failures to the new relational tables trigger non-blocking telemetry warnings during the burn-in period.
3. **Phase 3: Backfill (Background Workers)**
   - A background migration worker runs idempotently to parse and backfill historical JSONB records into relational `room_types` and `media_assets`.
   - Records with corrupt or unparseable JSONB are isolated in an exception table for manual engineering review.
4. **Phase 4: Reconcile (Continuous Parity Audit)**
   - An automated audit job compares historical legacy JSONB payloads against migrated relational records.
   - 100% data parity and zero checksum deviations must be verified across 100% of published property records.
5. **Phase 5: Shadow Read (Dark Launch)**
   - Read APIs fetch data from BOTH the legacy columns and the relational tables.
   - The application serves the response from the legacy source, but compares it against the relational result in memory, emitting telemetry on any divergence.
6. **Phase 6: Cutover (Authoritative Shift)**
   - Read and write paths are flipped to treat relational tables (`room_types`, `media_assets`) as the primary authority.
   - Legacy JSONB columns are marked read-only or deprecated.
7. **Phase 7: Retire (Decommissioning)**
   - Legacy read fallbacks are removed from codebase.
   - Under no circumstances are financial, inventory, or booking tables dropped. Legacy columns may be archived or marked deprecated.

---

## 8. Relational Room and Media Authority Migration

### Room Types Migration Contract
- **Legacy Storage:** `listings.rooms` (`JSONB` array of unvalidated objects).
- **Target Storage:** `room_types` relational table with explicit columns (`id`, `listing_id`, `name`, `type`, `description`, `specs`, `base_price`, `max_occupancy`, `inventory_count`, `features`, `amenities`, `icon`, `tag`).
- **Dual-Read Rule (MIG-001):**
  - If `room_types` rows exist for a listing, they are the **sole source of truth**.
  - If `room_types` is empty, the application falls back to `listings.rooms` JSONB, triggering an asynchronous backfill task.
  - Hardcoded client room configuration arrays (`ROOM_TIER_CONFIG`) are strictly relegated to legacy fallback and prohibited from overriding database values.

### Media Assets Migration Contract
- **Legacy Storage:** `listings.photos` (`JSONB` array of string URLs or partial objects) and `listings.imageUrls` (`text[]`).
- **Target Storage:** `media_assets` relational table with explicit columns (`id`, `listing_id`, `room_type_id`, `storage_key`, `url`, `category`, `tier`, `is_hero`, `display_order`, `moderation_status`).
- **Categorization Rule (MIG-002):**
  - Media tagged with `tier = 'common'` belongs to property-wide amenities and grounds.
  - Media tagged with `room_type_id` belongs exclusively to that specific room tier.
  - Any asset with `moderation_status != 'approved'` is strictly omitted from public projections.

---

## 9. Row-Level Security (RLS) & API Authorization Contract
> [!CAUTION]
> **RLS STATUS: TARGET ARCHITECTURE (NOT CURRENT LIVE REALITY)**
> Direct inspection of the live Neon PostgreSQL database proves that RLS is currently **DISABLED** (`rowsecurity = false`) across all primary tables (`listings`, `bookings`, `reviews`, `payment_attempts`, `inbound_webhooks`). The policies, session context variables, and roles defined below represent the **TARGET ARCHITECTURE** to be provisioned in future milestones under strict least-privilege standards.

To guarantee tenant and account data isolation across unified user accounts, the target architecture enforces strict Row-Level Security (RLS) in Neon PostgreSQL:

1. **User Identity & Type Compatibility:**
   - The current Neon schema defines `users.id` and all referencing foreign keys (`listings.host_id`, `bookings.user_id`, `reviews.user_id`) as **INTEGER / SERIAL** (not UUID).
   - Target session variables must accept integer string representations:
     ```sql
     SET LOCAL app.current_user_id = '123'; -- Parsed as integer via current_setting('app.current_user_id')::integer
     SET LOCAL app.current_user_role = 'GUEST'; -- 'GUEST' | 'HOST' | 'ADMIN'
     ```
2. **Dedicated Least-Privilege Application Role:**
   - Web application queries must NOT run as the Postgres superuser or table owner.
   - A dedicated runtime database role (`encho_app_user`) must be provisioned with:
     - `NOBYPASSRLS`
     - Least privilege `SELECT`, `INSERT`, `UPDATE` grants on domain tables.
     - Target tables must execute `ALTER TABLE <table_name> FORCE ROW LEVEL SECURITY;` to ensure RLS is enforced even against table owners.
3. **Transaction-Local Context & Connection Pool Isolation:**
   - All session settings must use `SET LOCAL` within an explicit transaction block (`BEGIN ... COMMIT`).
   - `SET LOCAL` guarantees that session configuration variables automatically clear upon transaction commit/rollback, preventing accidental identity leakage across reused pooled connections in Node.js `pg.Pool`.
   - Automated test suite must include connection pool isolation tests that verify no leakage occurs when sequential queries with different user contexts reuse the same physical connection.
4. **Defense-in-Depth:**
   - Database RLS serves as the secondary defense layer.
   - Application-level authentication and authorization middleware in `server.ts` must continue to validate JWT tokens and enforce tenant boundaries independently.
5. **Target RLS Policy Definitions:**
   - **`published_property_projections`:**
     - `SELECT`: Permitted for `anon`, `guest`, `host`, and `admin` where property status is `'PUBLISHED'`.
   - **`listings`:**
     - `SELECT`: Public for published summary; full record restricted to owning host (`host_id = NULLIF(current_setting('app.current_user_id', true), '')::integer`) or `admin`.
     - `UPDATE / DELETE`: Owning host or `admin` only.
   - **`bookings`:**
     - `SELECT`: Restricted to `user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer`, owning listing host, or `admin`.
     - `UPDATE`: Restricted to domain service transactions with explicit status transition validation.
   - **`booking_holds`:**
     - `SELECT`: Restricted to holding `user_id` or session token.
   - **`internal_booking_settlements` & `host_payout_obligations`:**
     - `SELECT`: Owning host sees only their own net settlements; guests have **ZERO ACCESS**; full access for `admin`.
6. **Public Projection Privacy Firewall:**
   - Public listing API endpoints (`GET /api/v2/stays/:slug`) query the projection model, which explicitly omits:
     - `listings.address` (exact street address masked).
     - Private host contact phone/email.
     - Unprocessed host payout details.
     - Exact physical GPS pin (approximate coordinates only).

---

## 10. Analytics & Tracking Event Contract

To maintain behavioral observability and audit commercial conversion funnels without leaking guest PII or violating Indian data privacy norms:

| Event Name | Trigger Location | Authority | Payload Structure | Privacy Constraints |
|:---|:---|:---|:---|:---|
| `stay_viewed` | `ListingDetailsNew.tsx` mount | Client | `property_id`, `slug`, `city`, `property_type`, `referrer`, `utm_source` | Zero PII; anonymized session hash |
| `room_tier_selected` | Room card click | Client | `property_id`, `room_type_id`, `nightly_price_paise`, `stay_nights` | Zero PII |
| `quote_requested` | "Choose a room" action | Server API | `quote_id`, `property_id`, `room_type_id`, `check_in`, `check_out`, `guests` | Zero PII |
| `hold_acquired` | "Continue to booking" action | Server API | `hold_id`, `quote_id`, `units_held`, `expires_at` | Server-logged; guest ID hash |
| `checkout_initiated` | Checkout page mount | Client / Server | `quote_id`, `hold_id`, `total_amount_paise`, `auth_status` | No payment credentials logged |
| `payment_attempt_started`| Razorpay modal opened | Client | `quote_id`, `razorpay_order_id`, `payment_method` | Zero card numbers / UPI VPAs |
| `booking_confirmed` | Webhook worker fulfillment | Server Worker | `booking_id`, `reference_number`, `gross_amount_paise`, `currency` | Server-side transactional outbox |
| `booking_cancelled` | Cancellation processed | Server Worker | `booking_id`, `reason_code`, `refund_amount_paise` | Server-side transactional outbox |

---

## 11. Accessibility & Core Web Vitals Performance Budgets

Customer trust and conversion rates demand rigorous technical performance and complete accessibility compliance:

### Core Web Vitals Budgets (75th Percentile on Mobile 4G)
- **Largest Contentful Paint (LCP):** `<= 2.2 seconds` (Hero image loaded with `fetchpriority="high"` and responsive `srcset`).
- **Interaction to Next Paint (INP):** `<= 150 milliseconds` (Zero main-thread blocking operations; date calculations offloaded).
- **Cumulative Layout Shift (CLS):** `<= 0.05` (Explicit aspect ratios on all image containers and skeleton loaders).
- **First Input Delay (FID):** `<= 80 milliseconds`.
- **Total Bundle Size:** Maximum `< 220 KB` compressed JavaScript on initial stay view route (dynamic code-splitting via `React.lazy`).

### Web Accessibility Standards (WCAG 2.1 Level AA)
- **Contrast Ratios:** Minimum `4.5:1` for normal text; `3:1` for large text and interactive icons against dark/light backgrounds.
- **Keyboard Navigation:** 100% of interactive controls (room selector, gallery carousel, date pickers, modal dialogs) navigable via standard Tab, Enter, Space, and Escape keys.
- **ARIA Semantics:**
  - Gallery dialog tagged with `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
  - Image thumbnails include descriptive `alt` tags (e.g., "Master En-Suite bathroom with stone soaking tub") — zero empty or generic "image" alt strings.
  - Pricing breakdown includes screen-reader accessible itemized announcements (`aria-live="polite"`).

---

## 12. Failure & Reconciliation Matrix

| Failure Mode | Detection Mechanism | Immediate System Response | Resolution / Reconciliation Strategy | Actor / Owner |
|:---|:---|:---|:---|:---|
| **Concurrent Hold Contention** | PostgreSQL lock wait / `409 Conflict` on `inventory_days` | Second caller receives immediate HTTP `409 Conflict` | SPA notifies guest: "Room just held by another traveler; please choose another room or date." | Guest / Inventory Service |
| **Guest Drops Off During 3D-Secure** | Unfulfilled Razorpay order; hold approaching expiration | Payment captured at gateway; webhook arrives at server | Webhook worker auto-creates confirmed booking, claims payment, and sends asynchronous confirmation email/SMS. | Webhook Worker |
| **Webhook Delivery Failure / Delay** | Webhook not received within 60s of client completion | Client polling detects `PAYMENT_PENDING` | Client triggers explicit server check (`POST /api/v2/payments/verify`), server queries Razorpay API directly, and confirms transaction. | Payment Service |
| **Duplicate Webhook Delivery** | `processed_payments` SQL insert returns zero rows (`ON CONFLICT (gateway_payment_id) DO NOTHING RETURNING gateway_payment_id`) | Worker detects NULL returned row | Worker instantly acks with HTTP `200 OK` and skips fulfillment to prevent duplicate inventory/booking operations without aborting transaction. | Webhook Worker |
| **Late Capture with Inventory Unavailable** | Hold expired before gateway capture; `inventory_days` units exhausted | Booking set to `PAYMENT_CAPTURED_INVENTORY_UNAVAILABLE`; payment attempt marked `CAPTURED` | Pre-approval default: Creates manual finance reconciliation case with operational alert (zero auto-refund). Conditional branch: Automated refund dispatch enabled ONLY after formal approval of `[PROPOSED-012]`. | Finance Ops / Webhook Worker |
| **Stale ORDER_CREATING Attempt** | Worker lease TTL expired (>2m); local DB state indeterminate | Sweeper transitions attempt to `UNKNOWN_OUTCOME` | Sweeper NEVER marks FAILED merely on lease expiry. Fails closed into `RECONCILIATION_REQUIRED` and opens `payment_reconciliation_cases` record; creating another provider order for the hold/quote is strictly blocked until reconciliation resolves the attempt. | Sweeper Worker / Admin |
| **Amount / Currency Tampering** | Payment capture webhook amount != `quote.total_amount_paise` | Worker marks payment `RECONCILIATION_REQUIRED` | Holds inventory, blocks booking confirmation, marks webhook `dead_letter`, and opens `payment_reconciliation_cases` record with severity `P1_CRITICAL`. Automated refund is strictly prevented; refunds occur only via manual review sanction. | Fraud / Finance Worker |
| **Abandoned Checkout** | `booking_holds.expires_at < NOW()` | Hold sweeper cron executes every 5 minutes | Sweeper marks hold `EXPIRED`, decrements `held_units` in `inventory_days`, and frees calendar availability. | Background Sweeper |
| **Razorpay Gateway Outage** | Gateway API returns 5xx or connection timeout | Checkout modal displays honest failure state | Guest notified: "Payment rails temporarily unreachable. Your room hold is preserved for 10 minutes. Please retry." | Checkout SPA / SRE |
| **Over-Capacity Invariant Breach** | Integrity constraint `held + booked <= total_units` violated | Database throws check constraint violation | Transaction rolls back completely; incident alert dispatched to engineering SRE. | Database Engine / SRE |

---

## 13. Non-Negotiable System Invariants

1. **Zero Fabrication Policy:** No synthetic urgency counters, fake live viewers, fabricated reviews, or Unsplash stock photos mixed into property galleries. Every word and image must be backed by an authoritative database record.
2. **Clean Pricing Hierarchy:** Guests never pay Encho’s booking commission. Guests never pay payment-gateway charges. The commission is an internal deduction from the host's gross settlement.
3. **Atomic Hold Allocation:** Simultaneous checkout requests for the final available unit must be handled via transactional row locks (`SELECT ... FOR UPDATE` ordered by date ASC). The second concurrent caller must receive `409 Conflict`.
4. **Idempotent Webhook Fulfillment:** The server webhook endpoint must verify HMAC-SHA256 signatures and insert events into `inbound_webhooks` with an idempotency key. Duplicate events must return `200 OK` with zero side effects.
5. **Exact Match Currency & Amount:** Payment authorization amounts must match the server-stored quote total down to the exact paisa/rupee. Mismatched amounts must be marked `DISPUTED` or `RECONCILIATION_REQUIRED` and immediately blocked from auto-confirmation.
6. **Address Privacy Boundary:** Public property projections must expose only city, locality, and approximate map coordinates. The exact physical street address is released only upon confirmed booking to an authenticated guest.
7. **UTC Time Standard:** All timestamp columns must store and evaluate explicit UTC timestamps (`TIMESTAMP WITH TIME ZONE`).

---

## 14. Enumerated Guest UI Fabrication Register (Evidence-Backed Forensic Audit)

The following 29 concrete items of deceptive, fabricated, or unbacked guest UI behaviors have been forensically verified in the codebase (`components/ListingDetailsNew.tsx`, `components/CheckoutPage.tsx`, and `components/BookingPage.tsx`). Every finding below has been verified against actual source code lines, with exact minimum code fragments cited. Each must be eliminated in its designated milestone and guarded with an automated test:

| # | Component / File | Verified Line Anchor | Identifying Source Evidence / Minimum Code Fragment | Verified Behavior / Fabrication Type | Target Honest Behavior | Target Milestone | Guarding Automated Test |
|:---:|:---|:---|:---|:---|:---|:---:|:---|
| 1 | `ListingDetailsNew.tsx` | Line 736 | `Math.floor(Math.random() * 5) + 2` | Synthetic urgency / randomized live viewers | Completely removed; zero fake viewer elements | M6 | `test('zero synthetic live viewer elements rendered')` |
| 2 | `ListingDetailsNew.tsx` | Lines 126–151 | `const LUXURY_BACKUP_POOL = [` | 24-item Unsplash pool injected into gallery | Only host-uploaded `media_assets` rendered; honest empty gallery state | M7 | `test('zero external unsplash images in gallery')` |
| 3 | `ListingDetailsNew.tsx` | Lines 351–362 | `const fallbackImages: Record<string, string> = {` | Hardcoded Unsplash stock images for POIs | POIs render without fake stock photos if host provided none | M6 | `test('poi cards render without hardcoded unsplash urls')` |
| 4 | `ListingDetailsNew.tsx` | Lines 712–717 | `parsedGuidelines = [` | Hardcoded fallback rules ('Quiet hours after 10 PM') | Curated guidelines render strictly from DB; empty state if none | M6 | `test('house rules render strictly from listing record')` |
| 5 | `ListingDetailsNew.tsx` | Line 1334 | `listing.concierge_privileges \|\| "Complimentary 24/7 dedicated sanctuary host"` | Hardcoded concierge privileges fallback string | Render only host-configured concierge perks; omit if null | M6 | `test('concierge privileges omitted if null')` |
| 6 | `ListingDetailsNew.tsx` | Lines 1350–1352 | `100% In-Person Verified` / `Physically audited by Encho luxury architects` | Unverified physical inspection marketing claim | Render verification fact only if backed by DB audit record | M6 | `test('verification claim requires physical audit record')` |
| 7 | `ListingDetailsNew.tsx` | Lines 1360–1362 | `Walled Garden Escrow` / `Payments held safely in platform escrow` | Unbacked escrow marketing badge | Render honest escrow notice only when supported by target ledger | M6 | `test('escrow badge reflects authoritative payment state')` |
| 8 | `ListingDetailsNew.tsx` | Line 1377 | `Superhost` badge | Unverified host marketing badge | Display only if verified by host audit record; omit otherwise | M6 | `test('superhost badge omitted unless verified fact exists')` |
| 9 | `ListingDetailsNew.tsx` | Line 1379 | `Fast response under 5 mins` | Synthetic host responsiveness metric | Omit response metric unless computed from genuine CRM messaging logs | M6 | `test('response metric omitted without crm evidence')` |
| 10 | `ListingDetailsNew.tsx` | Line 1398 | `listing.host_philosophy \|\| listing.editorial_quote \|\| "Our design philosophy..."` | Hardcoded philosophical quote fallback | Render host quote only if explicitly provided; omit otherwise | M6 | `test('host philosophy omitted if unpopulated')` |
| 11 | `ListingDetailsNew.tsx` | Lines 2512–2514 | `listing.rating?.toFixed(2) \|\| '4.95'` | Hardcoded `4.95` fallback rating | Derived strictly from completed booking reviews; "New on Encho Stays" if 0 | M6 | `test('rating renders strictly from database reviews')` |
| 12 | `ListingDetailsNew.tsx` | Line 2517 | `listing.reviewCount \|\| 124` | Hardcoded `124` fallback review count | Review count derived strictly from DB join; 0 if unreviewed | M6 | `test('review count derived strictly from database')` |
| 13 | `ListingDetailsNew.tsx` | Lines 2521–2542 | `name: "Michael R."`, `name: "Sarah K."`, `name: "Aarav M."` | Hardcoded static customer reviews | Verified reviews from completed bookings only; empty state if none | M6 | `test('zero hardcoded mock testimonial quotes')` |
| 14 | `CheckoutPage.tsx` | Line 400 | `mockPaymentId = pay_rzp_${Date.now()}_...` | Mock payment ID generation in checkout | Removed; all checkouts require server Razorpay order creation | M9 | `test('mock payment branch completely removed')` |
| 15 | `CheckoutPage.tsx` | Line 401 | `mockSignature = rzp_sig_${Date.now()}_...` | Mock cryptographic signature generation | Client never creates signatures; server verifies HMAC from gateway | M9 | `test('client signature generation removed')` |
| 16 | `CheckoutPage.tsx` | Line 468 | `Sanctuary held in escrow for` + volatile timer | Volatile timer without server hold binding | Server-backed `booking_holds` TTL enforced via API | M8 | `test('hold timer syncs with server expires_at')` |
| 17 | `CheckoutPage.tsx` | Lines 633–635 | `Concierge & Escrow Protection (15%)` | Client-side 15% markup added to client total | Zero guest commission; quotes generated exclusively by server engine | M5 | `test('concierge fee not added client side')` |
| 18 | `CheckoutPage.tsx` | Lines 637–639 | `Statutory GST (18%)` | Client-side 18% GST calculation | Statutory tax lines from server quote engine only | M5 | `test('tax lines derived exclusively from server quote')` |
| 19 | `CheckoutPage.tsx` | Lines 816–820 | `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=...` | Insecure external QR code payment generator | External QR API removed; gateway modal or UPI Intent only | M9 | `test('external qr code generator removed')` |
| 20 | `CheckoutPage.tsx` | Line 953 | `Instant WhatsApp Confirmation` | Unbacked instant messaging confirmation claim | Omit until transactional outbox WhatsApp integration certified | M8 | `test('instant whatsapp claim omitted unless enabled')` |
| 21 | `CheckoutPage.tsx` | Line 958 | `100% Escrow Protection` | Unbacked escrow badge in checkout footer | Badge renders only when authoritative payment attempt initialized | M8 | `test('escrow badge bound to server order state')` |
| 22 | `BookingPage.tsx` | Lines 58–61 | `ENC-${seed}-${Math.abs(numId * 7331)...}` | Deterministic pseudo-random booking reference | Server-generated `reference_number` displayed from DB | M10 | `test('confirmation reference hydrated from database')` |
| 23 | `BookingPage.tsx` | Line 64 | `accessPin = '4829'` | Hardcoded physical door PIN | Access credentials excluded from v1; private arrival guide in v2 | M10 | `test('hardcoded door pin completely removed')` |
| 24 | `BookingPage.tsx` | Line 68 | `wifiPassword = 'EnchoSanctuary2026'` | Hardcoded physical Wi-Fi password | Private credentials excluded from v1 itinerary | M10 | `test('hardcoded wifi password completely removed')` |
| 25 | `BookingPage.tsx` | Line 114 | `phone = whatsappConfig?.number \|\| '919876543210'` | Hardcoded fallback host phone `919876543210` | Real host contact phone revealed only upon confirmed booking | M10 | `test('host contact loaded from authenticated user record')` |
| 26 | `BookingPage.tsx` | Lines 135–146 | Plaintext `listing?.address` & `accessPin` in `.ics` calendar file | Physical address and PIN leakage in generated calendar invite | Mask exact address and omit door credentials in calendar download | M10 | `test('calendar invite masks address and omits pin')` |
| 27 | `BookingPage.tsx` | Line 348 | Secondary `api.qrserver.com` QR code render | External third-party QR code generation | Native SVG QR code generated locally if needed; external API removed | M10 | `test('external qr code api completely removed from confirmation')` |
| 28 | `BookingPage.tsx` | Line 468 | `100% Escrow Secured` | Unbacked confirmation escrow guarantee badge | Render authoritative payment status from DB | M10 | `test('payment status hydrated from database record')` |
| 29 | `BookingPage.tsx` | Lines 478–481 | `Free cancellation / Up to 48 hours before check-in` | Hardcoded static cancellation policy copy | Render property-configured cancellation template from DB | M10 | `test('cancellation policy renders from property record')` |

---

## 15. Traceability Matrix

| Approved Decision # | Domain Entity | Canonical State Machine | Implementation Milestone | Guarding Automated Acceptance Test |
|:---:|:---|:---|:---:|:---|
| **1** (Encho Stays Brand) | `published_property_projections` | Property Publication | **M2** | `test('property page title displays Encho Stays')` |
| **5, 6** (Disclosed Agent / Invoice) | `accommodation_invoices` | Booking State Machine | **M10** | `test('invoice generated with host as supplier and Encho as agent')` |
| **7, 8** (No Guest Commission / Gateway Fees) | `booking_quotes`, `quote_price_lines` | Quote State Machine | **M5** | `test('guest quote total contains zero commission or gateway surcharges')` |
| **9, 10** (Flex Commission Policy & Snapshot) | `commission_policies`, `booking_commission_snapshots` | Booking State Machine | **M5** | `test('confirmed booking snapshots immutable flex commission rate')` |
| **11, 12, 13** (Growth Subscription & 0% Invariant)| `growth_subscriptions`, `booking_commission_snapshots` | Subscription Lifecycle | **M5** | `test('growth subscription grants 0% booking commission snapshot')` |
| **16, 18** (Host Payout Policy & Timing) | `host_payout_obligations`, `payout_policy_versions`, `checkin_verification_records` | Host Payout State Machine | **M11** | `test('standard payout scheduled for checkin + 24h after verified arrival')` |
| **19, 20** (Host Reserve & Deficit Recovery) | `host_reserve_ledgers`, `reserve_deficit_recovery_ledgers` | Host Payout State Machine | **M11** | `test('high risk host holds 10% reserve; deficit recovers from future payouts')` |
| **21, 26, 27** (Razorpay & Server Fulfillment) | `payment_attempts`, `processed_payments`, `inbound_webhooks`, `payment_reconciliation_cases` | Payment Attempt State Machine | **M9** | `test('booking confirmed exclusively from verified razorpay capture webhook')` |
| **22** (Unified Identity Boundary) | `bookings`, `users` | Booking State Machine | **M8** | `test('unauthenticated guest blocked from checkout order creation')` |
| **23** (Canonical ListingDetailsNew) | `ListingDetailsNew.tsx` | Property Presentation | **M6A** | `test('listingdetailsnew renders authoritative property data')` |
| **24, 25** (Zero Fabrication & Content Integrity) | All entities / UI components | All State Machines | **M6A, M7, M10** | `test('zero fabricated fields across listing, checkout, and confirmation')` |
| **28** (Server Quote Lock) | `booking_quotes` | Quote State Machine | **M5** | `test('checkout rejects payment if client amount diverges from server quote')` |
| **29** (Address Privacy Boundary) | `published_property_projections` | Property Publication | **M2** | `test('street address masked until booking confirmed')` |
| **30** (Access Credentials Exclusion) | N/A (Excluded from v1) | N/A | **M10** | `test('door pin and wifi password fields excluded from v1 api response')` |
| **31** (Verified Review Integrity) | `reviews`, `bookings` | Review Moderation | **M6A** | `test('reviews rejected unless linked to completed verified booking')` |
| **32** (Statutory Tax Gate) | `tax_rule_versions`, `quote_tax_lines` | Quote State Machine | **M5** | `test('tax rules blocked on formal CA approval gate')` |
| **38** (Verification Badge Method/Date Rule) | `published_property_projections` | Property Presentation | **M6A** | `test('verification badge renders only with recorded method and date')` |
| **39** (Zero-Review "New on Encho Stays") | `ListingDetailsNew.tsx` | Property Presentation | **M6A** | `test('zero review listings display New on Encho Stays with no ratings')` |
| **40** (M6A / M6B Milestone Split) | Frontend vs Quote/Disclosure Layer | Commercial Governance | **M6A / M6B** | `test('M6A independent of M5; M6B blocked on legal CA sign-off')` |

---

## 16. Definition of Done for Guest Experience V2

The guest booking transformation is certified complete only when:
- [ ] Canonical URL `/stay/:propertySlug` routes cleanly with complete address masking for unbooked users.
- [ ] Multi-unit inventory is allocated atomically with zero race conditions under 100-thread concurrent stress testing.
- [ ] All 29 documented UI fabrications and deceptive fallbacks in the forensic register are completely eliminated from the frontend.
- [ ] Razorpay checkout strictly binds order IDs to quotes and auto-fulfills bookings via server webhooks.
- [ ] Booking confirmation screen hydrates strictly from PostgreSQL database records upon browser refresh.
- [ ] Automated end-to-end Playwright tests verify discovery, quoting, checkout, capture, and confirmation.
- [ ] Zero financial, inventory, or booking tables are dropped during migration or rollback.
