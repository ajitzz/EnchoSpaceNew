# ENCHO STAYS — GUEST BOOKING V2 IMPLEMENTATION PLAN
**Status:** ACTIVE IMPLEMENTATION PLAN
**Current State:** Milestone 1 ACCEPTED — ARCHITECTURAL BASELINE (Phase 3 Milestone 1 Governance Gate)
**Milestones 2–15:** NOT STARTED
**Operating Standard:** 10/10 FAANG-Grade Architectural Rigor

---

## MILESTONE PROGRESS DASHBOARD

| Milestone | Title | Status | Dependencies | Execution Type |
|:---|:---|:---:|:---|:---:|
| **M1** | Truth Contract, Governance & Decision Register | **ACCEPTED — ARCHITECTURAL BASELINE** | None | Documentation Only |
| **M2** | Published Projection, Canonical Routes & Address Privacy | **ACCEPTED — PUBLIC PROJECTION, CANONICAL ROUTING & PRIVACY BASELINE** | M1 Acceptance, Founder Gates Approved | Code & Routing |
| **M3** | Canonical Relational Room/Media Authority | **ACCEPTED — CANONICAL RELATIONAL ROOM & MEDIA AUTHORITY** | M2, Founder Gates Approved | DB & API |
| **M4** | Inventory Days & Atomic Holds | **ACCEPTED — INVENTORY DAYS & ATOMIC HOLDS** | M3, Founder Gate [PROPOSED-004] (Approved) | DB, Services & Concurrency |
| **M5** | Immutable Quotes & Internal Settlement Snapshots | **NOT STARTED — LEGALLY BLOCKED pending written Indian CA/tax-lawyer sign-off** | M4, Formal CA/Tax Sign-off (LEGAL BLOCKED), Founder Gate [PROPOSED-011] (Approved) | Core Financial Engine |
| **M6** | ListingDetailsNew Customer-Information Architecture | **NOT STARTED** | M2, M3, M5, Founder Gate [PROPOSED-005, PROPOSED-006] | Frontend UX & Clean Data |
| **M7** | Spatial Gallery Truth & Accessibility | **NOT STARTED** | M3, M6 | Frontend & Media Assets |
| **M8** | Identity & Three-Stage Checkout | **NOT STARTED** | M5, M6 | Auth & Checkout Flow |
| **M9** | Razorpay Order Binding, Webhook Fulfillment & Reconciliation | **NOT STARTED** | M4, M5, M8, Live Webhook Secrets, Founder Gate [PROPOSED-012], Provider Reconciliation (PROVIDER BLOCKED) | Payment Gateway & Worker |
| **M10** | Server-Backed Confirmation & Manage Booking | **NOT STARTED** | M9, GST Invoice Legal Format (LEGAL BLOCKED) | Frontend & Confirmation API |
| **M11** | Cancellation, Refund, Payout & Reserve Lifecycle | **NOT STARTED** | M9, M10, Founder Gate [PROPOSED-003, PROPOSED-008, PROPOSED-009, PROPOSED-010], Payout Rail Selection (PROVIDER BLOCKED) | Ledger & Refund Worker |
| **M12** | Host/Admin Parity & Publication Gate | **NOT STARTED** | M3, M6, M11 | HostForm & AdminDashboard |
| **M13** | Analytics, Attribution & Meta Landing Integrity | **NOT STARTED** | M2, M10 | AdTech & Analytics Pipeline |
| **M14** | Performance, Security, Concurrency & E2E Certification | **NOT STARTED** | M1–M13 | Automated QA & Audits |
| **M15** | Controlled Cutover & Legacy Retirement | **NOT STARTED** | M14 | Decommissioning & Cutover |

---

## DETAILED MILESTONE SPECIFICATIONS

### Milestone 1 — Truth Contract, Governance & Decision Register
- **Status:** **ACCEPTED — ARCHITECTURAL BASELINE**
- **Execution Type:** Documentation Only
- **Objective:** Establish formal engineering blueprints, decision registers, presentation contracts, state machines, and implementation plans across the guest journey.
- **Dependencies:** None.
- **Exact Scope:**
  - Author `docs/blueprints/GUEST_BOOKING_EXPERIENCE_V2_BLUEPRINT.md`.
  - Author `docs/blueprints/GUEST_BOOKING_DECISION_REGISTER.md`.
  - Author `docs/blueprints/GUEST_PROPERTY_PRESENTATION_CONTRACT.md`.
  - Author `docs/implementation/GUEST_BOOKING_V2_IMPLEMENTATION_PLAN.md`.
  - Synchronize `AGENTS.md` and `docs/ENCHO_ENGINEERING_CONSTITUTION.md`.
- **Exclusions:** No application code changes, database migrations, package installations, or runtime modifications.
- **Likely Files / Systems:** Governance documentation files only.
- **Database Impact:** None (zero schema or data changes).
- **API Impact:** None (zero runtime API changes).
- **UI Impact:** None (zero UI rendering changes).
- **Security Impact:** Establishes security and privacy contracts (address masking, RLS boundaries).
- **Performance Impact:** Establishes Core Web Vitals performance budgets.
- **Backward Compatibility:** Preserves all existing operational requirements.
- **Acceptance Criteria:**
  - All 6 governance documents are synchronized and free of contradictions.
  - State machines define complete transition matrices with actors, boundaries, and terminal states.
  - Quote authority and payment fulfillment are architecturally decoupled from client state.
- **Testing Strategy:** Static linting and cross-document integrity checks (`git diff --check`).
- **Observability:** Document versioning and audit trails in git.
- **Non-Destructive Rollback Strategy:** Git revert documentation commits.
- **Definition of Done:** Independent architect review and formal sign-off.

---

### Milestone 2 — Published Projection, Canonical Routes & Address Privacy
- **Status:** **ACCEPTED — PUBLIC PROJECTION, CANONICAL ROUTING & PRIVACY BASELINE**
- **Execution Type:** Code & Routing
- **Objective:** Establish canonical property URLs (`/stay/:propertySlug`), permanent redirects from legacy routes (`/listing/:id`, `/listings/:id`), and mask exact physical street addresses in public read projections.
- **Dependencies:** Milestone 1 Acceptance, Founder Decision Gate [PROPOSED-001, PROPOSED-002].
- **Decision Gates:**
  > [!WARNING]
  > BLOCKED — CANONICAL URL SCHEME NOT EXECUTABLE UNTIL DECISION [PROPOSED-001] IS APPROVED.
  > BLOCKED — PUBLIC LOCATION MASKING RADIUS NOT EXECUTABLE UNTIL DECISION [PROPOSED-002] IS APPROVED.
- **Exact Scope:**
  - Create property projection endpoint `GET /api/v2/stays/:propertySlug`.
  - Implement server-side address privacy firewall (mask street address; return locality and approximate coordinates only).
  - Add client routing in `App.tsx` for `/stay/:propertySlug`.
  - Configure 301 permanent redirects for legacy `/listing/:id` and `/listings/:id`.
- **Exclusions:** Checkout, quoting, room builder modifications.
- **Likely Files / Systems:** `App.tsx`, `server.ts`, `vercel.json`, `components/ListingDetailsNew.tsx`.
- **Database Impact:** Add `slug` (`VARCHAR(255) UNIQUE`) to `listings` table without table rewrite.
- **API Impact:** Introduces `GET /api/v2/stays/:propertySlug`; legacy `GET /api/listings/:id` remains supported.
- **UI Impact:** URL bar displays clean hospitality slug; map displays approximate locality.
- **Security Impact:** Eliminates public street address exposure for unbooked users.
- **Performance Impact:** Read projection is lightweight and edge-cacheable.
- **Backward Compatibility:** All existing bookmarks and inbound ad URLs permanently redirect to canonical slug.
- **Acceptance Criteria:**
  - Navigating to `/stay/:propertySlug` renders property details.
  - Navigating to `/listing/123` returns HTTP 301 redirecting to `/stay/slug-123`.
  - Public API response contains zero exact street address strings.
- **Testing Strategy:**
  - Unit: Slug generation and sanitization tests.
  - Integration: Route redirection and privacy masking API tests.
  - E2E: Browser navigation to legacy and canonical URLs.
- **Observability:** Structured logs capturing route redirection latency and cache hit ratios.
- **Non-Destructive Rollback Strategy:** Revert client routing; disable redirect middleware; database column remains intact.
- **Definition of Done:** 100% of legacy routes redirect correctly; public API passes privacy audit.

---

### Milestone 3 — Canonical Relational Room & Media Authority
- **Status:** **AWAITING INDEPENDENT ACCEPTANCE**
- **Execution Type:** DB & API
- **Objective:** Establish relational tables `room_types` and `media_assets` as the authoritative source of truth for accommodations and imagery, retiring reliance on raw unvalidated JSONB blobs.
- **Dependencies:** Milestone 2 Acceptance, Founder Decision Gate [PROPOSED-007] Approved (Decision #35).
- **Decision Gates:**
  - Founder Gate [PROPOSED-007] APPROVED: “A property cannot be published if any bookable room type has fewer than three approved, room-specific photos. At least one photo must show the sleeping area. Property-wide media does not satisfy this requirement.” (Enforced at publication validation in M3 / M12).
- **Exact Scope:**
  - Execute Phase 1 & 2 of Canonical Field Migration: dual-write and idempotent backfill.
  - Enforce foreign keys and check constraints on `room_types` and `media_assets`.
  - Update `GET /api/listings/:id` and `GET /api/v2/stays/:slug` to hydrate from relational tables first (MIG-001 / MIG-002).
- **Exclusions:** Changes to pricing calculation or inventory ledger.
- **Likely Files / Systems:** `server.ts`, `components/ListingDetailsNew.tsx`, `components/SanctuaryGalleryModal.tsx`.
- **Database Impact:** Add indexes on `room_types(listing_id)` and `media_assets(listing_id, room_type_id)`.
- **API Impact:** Returns normalized room objects and typed media arrays.
- **UI Impact:** Gallery tabs and room cards render dynamic host-defined room tiers.
- **Security Impact:** Strict asset moderation filtering (`moderation_status = 'approved'`).
- **Performance Impact:** Fast index lookups replacing expensive JSONB array manipulation.
- **Backward Compatibility:** Dual-read fallback reads legacy JSONB if relational tables are empty.
- **Acceptance Criteria:**
  - Room pricing, inventory, and specs hydrate strictly from `room_types`.
  - Gallery modal renders host-defined room categories dynamically.
- **Testing Strategy:**
  - Unit: Schema deserialization and dual-read fallback tests.
  - Integration: Idempotent backfill script verification.
  - E2E: Room type selection renders matching gallery imagery.
- **Observability:** Metrics tracking dual-read fallback invocations (target: 0 after backfill).
- **Non-Destructive Rollback Strategy:** Flip dual-read preference back to JSONB; keep relational tables intact.
- **Definition of Done:** Zero data loss during backfill; 100% of published listings have relational rooms and media.

---

### Milestone 4 — Inventory Days & Atomic Holds
- **Status:** **ACCEPTED — INVENTORY DAYS & ATOMIC HOLDS**
- **Execution Type:** DB, Services & Concurrency
- **Objective:** Prevent overbooking through atomic transactional inventory locking on `inventory_days` and time-bounded `booking_holds` (default 10-minute TTL per approved Decision #36).
- **Dependencies:** Milestone 3, Founder Decision Gate [PROPOSED-004] (Approved).
- **Exact Scope:**
  - Create tables `inventory_days`, `booking_holds`, and `booking_hold_nights`.
  - Implement hold acquisition endpoint `POST /api/v2/stays/holds` using `SELECT ... FOR UPDATE` ordered by date ASC.
  - Implement hold release endpoint `POST /api/v2/stays/holds/:id/release`.
  - Implement background hold sweeper cron expiring abandoned holds after 10 minutes.
- **Backward Compatibility:** Legacy calendar block queries check `inventory_days` in shadow mode.
- **Acceptance Criteria:**
  - 100 concurrent checkout requests for the final available room unit result in exactly 1 hold acquired and 99 `409 Conflict` responses.
  - Abandoned holds cleanly return capacity to `inventory_days` upon expiration.
- **Testing Strategy:**
  - Unit: Date range lock ordering tests.
  - Concurrency: 100-thread parallel race condition test suite.
  - Integration: Hold expiration sweeper verification.
- **Observability:** Metrics for hold acquisition latency, hold expiration rate, and lock contention counts.
- **Non-Destructive Rollback Strategy:** Fail closed: If atomic hold engine detects systemic failure, inventory booking endpoint enters maintenance mode (`MAINTENANCE_MODE_HOLDS=true`) and rejects new checkout sessions with an honest system message. Never silently fall back to client pricing or unindexed non-atomic calendar blocks.
- **Definition of Done:** Zero race condition overbookings under automated stress testing.

---

### Milestone 5 — Immutable Quotes & Internal Settlement Snapshots
- **Status:** **NOT STARTED — LEGALLY BLOCKED pending written Indian CA/tax-lawyer sign-off**
- **Execution Type:** Core Financial Engine
- **Objective:** Establish server-authoritative pricing via immutable server-stored `booking_quotes` identified by opaque IDs, snapshot private host settlement records, implement Growth subscription purchase flow, and manage versioned commission and tax rules.
- **Dependencies:** Milestone 4, Formal Indian CA / Tax-Lawyer Sign-Off, Founder Decision Gate [PROPOSED-011] (Approved).
- **Decision Gates:**
  > [!WARNING]
  > BLOCKED — TAX RULES NOT EXECUTABLE UNTIL FORMAL INDIAN CA / TAX-LAWYER WRITTEN SIGN-OFF.
  > FOUNDER GATE [PROPOSED-011] APPROVED — Growth subscription overlap behavior: “Purchasing Encho Growth while an existing Growth subscription is active extends its expiration by 30 days from the current expires_at. The active term is never truncated. If no active term exists, expiration is calculated from successful activation time.”
- **Exact Scope:**
  - Implement `POST /api/v2/stays/quote` calculating room rent, approved taxes, and zero guest fees.
  - Store immutable quote record in `booking_quotes`, `quote_price_lines`, and `quote_tax_lines`.
  - Implement versioned `commission_policies` (default 1500 basis points Flex).
  - Snapshot booking commission at confirmation into `booking_commission_snapshots`.
  - Implement internal settlement logic snapshotting host commission (15% Flex vs 0% Growth) in `internal_booking_settlements`.
  - Implement Growth subscription purchase and lifecycle endpoint `POST /api/v2/subscriptions/growth` (₹4,999 + GST for rolling 30 days) with dedicated `subscription_payment_attempts` and `subscription_processed_payments`.
  - Enforce strict 8-point payment binding validation before `subscription_processed_payments` may claim execution ownership and activate Growth:
    1. Verified HMAC-SHA256 signature on inbound webhook.
    2. Event type is `payment.captured` or `order.paid` with captured payment status.
    3. Gateway order ID matches `subscription_payment_attempts.gateway_order_id` (or write-once binding if null via trusted signed payload correlation).
    4. Provider receipt / notes correlates to `subscription_payment_attempt_id`.
    5. `subscription_id` matches active `growth_subscriptions.id`.
    6. `host_id` matches owning host of the listing.
    7. Currency is strictly 'INR'.
    8. Payment amount exactly equals the immutable server-generated Growth subscription quote, including applicable tax lines produced by the legally approved tax-rule version.
  - Any validation failure on Growth webhook prevents activation and opens a `payment_reconciliation_cases` record with status 'OPEN'.
  - Implement master `payout_policy_versions` table defining versioned disbursement parameters (Standard: check-in + 24h; High-Risk: gated behind [PROPOSED-010]).
- **Exclusions:** Razorpay booking order creation, browser checkout UI.
- **Likely Files / Systems:** `server.ts`, `src/services/quoteService.ts`, `src/services/settlementService.ts`, `src/services/subscriptionService.ts`.
- **Database Impact:** Create `booking_quotes`, `quote_price_lines`, `quote_tax_lines`, `commission_policies`, `booking_commission_snapshots`, `internal_booking_settlements`, `tax_rule_versions`, `growth_subscriptions`, `subscription_payment_attempts`, `subscription_processed_payments`, `payout_policy_versions`.
- **API Impact:** Introduces quote generation API and subscription purchase API; client-submitted nightly prices completely rejected.
- **UI Impact:** Displays verified itemized breakdown with explicit tax transparency.
- **Security Impact:** Cryptographic quote integrity (opaque UUID stored in DB); opaque IDs prevent price manipulation.
- **Performance Impact:** Quote generation executes in <30ms without external network calls.
- **Backward Compatibility:** Legacy booking endpoint checks server quote table if `quote_id` provided.
- **Acceptance Criteria:**
  - Guest total equals Room Rent × Nights + Approved Statutory Taxes.
  - Guest commission is exactly ₹0.00.
  - Client-submitted prices are ignored; server re-reads stored quote on order creation.
  - Active Growth subscription grants 0% commission snapshot on confirmed bookings.
  - Exactly-once subscription activation enforced via `subscription_processed_payments` using `ON CONFLICT (gateway_payment_id) DO NOTHING RETURNING gateway_payment_id`.
- **Testing Strategy:**
  - Unit: Penny-rounding financial calculation tests across multi-night stays.
  - Integration: Quote snapshot immutability verification; Growth subscription lifecycle verification.
  - Concurrency & Anti-Replay: Parallel quote generation under load; duplicate webhook delivery simulation against `subscription_processed_payments` ensuring zero double-activation.
- **Observability:** Structured logs for quote generation, fee snapshots, and tax line calculations.
- **Non-Destructive Rollback Strategy:** Maintenance gate on quote and subscription endpoints; existing stored quotes and subscriptions honored.
- **Definition of Done:** CA sign-off obtained; zero math discrepancy between quote and settlement.

---

---

### Milestone 6A — Guest Presentation Truth and Luxury UX Foundation
- **Status:** **AWAITING INDEPENDENT ACCEPTANCE — GUEST PRESENTATION TRUTH & LUXURY UX FOUNDATION**
- **Execution Type:** Frontend UX & Clean Data Foundation (Independent of M5; executable before M5)
- **Objective:** Eliminate deceptive UI patterns, randomized viewer counters, Unsplash stock image pooling, static fake reviews, invented transit/Wayanad claims, and unverified superhost/verification badges from `ListingDetailsNew.tsx` and directly related guest-view components. Establish honest zero-review ("New on Encho Stays") state and explicit verification facts while preserving protected luxury design invariants.
- **Dependencies:** Milestone 2, Milestone 3, Decision #38 (PROPOSED-005 Approved), Decision #39 (PROPOSED-006 Approved), Decision #40 (M6 Split Approved).
- **Decision Gates:**
  - Decision #38: Public verification badge appears only when Encho has a recorded verification method and verification date. If either fact is unavailable, show no badge or equivalent trust claim.
  - Decision #39: Property with zero verified reviews displays “New on Encho Stays” with no rating, review count, fabricated testimonial, or substitute social-proof claim.
- **Protected Design Invariants (Must NOT Be Flattened or Removed):**
  1. **Hero Promo Video:** Hero video playback preserved; if unavailable, authoritative property images remain the primary visual fallback.
  2. **“Our Sanctuary Chambers” Room-First Concept:** Room-first visual exploration architecture preserved with authoritative rooms data.
  3. **Encho Spatial Gallery:** Premium room-media exploration experience preserved with host-authored media assets.
  4. **Neighborhood Radar Visual Behavior:**
     - Dormant satellite/terrain map rendered in subtle grayscale at 50% opacity while scrolling.
     - On hover, transitions to full natural color over 1000ms ease-out. Interaction preserved exactly.
  5. **Location Privacy:** Exact address remains strictly private; locality, city, and coarsened approximate coordinates only.
- **Deceptive Patterns Removed / Replaced in M6A:**
  - Randomized viewer counters (`Math.floor(Math.random() * ...)`) deleted.
  - 24-item Unsplash luxury backup pool deleted; renders only authoritative media assets or honest empty state.
  - Hardcoded Wayanad POIs and fake transit metrics deleted; renders strictly `listing.nearby` or honest empty state.
  - Hardcoded ratings (`4.95`), fake review counts (`124 Verified Stays`), and mock customer testimonials deleted; zero reviews render "New on Encho Stays".
  - Generic verification and Superhost badges removed unless backed by recorded verification method and date in database projection.
  - Fabricated room titles, amenities, descriptions, or concierge privileges fallbacks removed.
- **Exclusions:** Checkout, payment routing, server quotes, statutory tax calculations, fees, booking confirmations, invoices, refunds, payouts, or M6B work.
- **Likely Files / Systems:** `components/ListingDetailsNew.tsx`, `components/SanctuaryGalleryModal.tsx`, `src/lib/stayProjection.ts`.
- **Database Impact:** None.
- **API Impact:** Consumes existing public projection (`GET /api/v2/stays/:slug`).
- **UI Impact:** 10/10 industrial-grade honest hospitality presentation; zero deceptive elements.
- **Security Impact:** Zero synthetic claims; consumer protection compliance.
- **Performance Impact:** Eliminates periodic random interval timers; preserves 60fps animations and `<2.2s` LCP.
- **Backward Compatibility:** Preserves existing props and navigation callbacks.
- **Acceptance Criteria:**
  - Zero occurrences of `Math.random()` or synthetic urgency counters in render tree.
  - 100% of rendered imagery originates from authoritative listing media assets; zero Unsplash URLs.
  - Zero unverified review quotes or fallback ratings displayed.
  - Neighborhood radar maintains 50% grayscale to 100% natural color transition on hover (1000ms ease-out).
  - Exact address never exposed in public UI.
- **Testing Strategy:**
  - Unit/Integration: Vitest component render tests in standard Node environment via `renderToStaticMarkup`.
  - Accessibility: Keyboard navigation, WCAG 2.1 AA color contrast, and descriptive `alt` tags.
  - Visual Regression: Snapshot and visual comparison for desktop and mobile viewports.
- **Non-Destructive Rollback Strategy:** Git revert component changes to restore prior UI revision.
- **Definition of Done:** Zero deceptive patterns detected in automated DOM scan; all protected luxury interactions intact.

---

### Milestone 6B — Verified Quote and Booking Disclosure Layer
- **Status:** **NOT STARTED — BLOCKED pending Milestone 5 and written Indian CA/tax-lawyer sign-off**
- **Execution Type:** Financial Presentation & Booking Disclosure Layer
- **Objective:** Connect the honest guest stay presentation with the authoritative server-side quote engine, displaying verified itemized price breakdowns, statutory tax disclosures, cancellation policy schedules, and hold acquisition triggers.
- **Dependencies:** Milestone 5 (Immutable Quotes & Internal Settlement Snapshots), Formal Indian CA / Tax-Lawyer Written Sign-Off, Decision #33, Decision #37.
- **Exact Scope:**
  - Display server-generated immutable quote itemization on room selection.
  - Render approved statutory GST and accommodation lines from server quote engine.
  - Display centralized versioned cancellation policy disclosures.
  - Trigger atomic inventory hold acquisition (`POST /api/v2/stays/hold`) upon guest progression to booking.
- **Likely Files / Systems:** `components/ListingDetailsNew.tsx`, `components/BookingModal.tsx`, `src/services/quoteService.ts`.
- **Database Impact:** None directly (consumes M5 schema).
- **API Impact:** Consumes `POST /api/v2/stays/quote` and `POST /api/v2/stays/hold`.
- **Definition of Done:** Zero client-side fee calculation; 100% pricing disclosure driven by authoritative server quote.

---

### Milestone 7 — Spatial Gallery Truth & Accessibility
- **Status:** **NOT STARTED**
- **Execution Type:** Frontend & Media Assets
- **Objective:** Refactor `SanctuaryGalleryModal.tsx` to dynamically categorize photography by host-defined room tiers and common grounds, adding complete WCAG 2.1 AA accessibility.
- **Dependencies:** Milestone 3, Milestone 6.
- **Exact Scope:**
  - Dynamically build gallery tabs from `listing.rooms` / `room_types`.
  - Filter images strictly by `tier` and `room_type_id`.
  - Add descriptive image `alt` attributes, ARIA dialog roles, and focus trapping.
- **Exclusions:** Property view page restructuring.
- **Likely Files / Systems:** `components/SanctuaryGalleryModal.tsx`.
- **Database Impact:** None.
- **API Impact:** Consumes normalized `media_assets` array.
- **UI Impact:** Fluid spatial photo exploration with accurate category badge counters.
- **Security Impact:** Prevents unapproved photos from leaking into modal view.
- **Performance Impact:** Lazy-loads high-resolution images; pre-loads active thumbnail.
- **Backward Compatibility:** Falls back to common photos if room tier lacks specific imagery.
- **Acceptance Criteria:**
  - Gallery tabs match host-defined room types exactly.
  - Modal traps keyboard focus and closes cleanly on Escape.
  - 100% of photos have descriptive `alt` text.
- **Testing Strategy:**
  - Accessibility: Screen reader and keyboard navigation verification.
  - Unit: Gallery category builder tests.
- **Observability:** Image load failure telemetry.
- **Non-Destructive Rollback Strategy:** Git revert modal component.
- **Definition of Done:** WCAG 2.1 AA certification passed; zero static hardcoded gallery tabs.

---

### Milestone 8 — Identity & Three-Stage Checkout
- **Status:** **NOT STARTED**
- **Execution Type:** Auth & Checkout Flow
- **Objective:** Rebuild `CheckoutPage.tsx` into a three-stage verified flow (Review Stay -> Guest Identity -> Payment). Enforce authenticated unified Encho account before payment initiation.
- **Dependencies:** Milestone 5, Milestone 6.
- **Exact Scope:**
  - Gate payment step behind verified user authentication.
  - Bind checkout session to server-stored `quote_id` and active `hold_id`.
  - Completely eliminate fake UPI QR code generator and client mock payment branches.
- **Exclusions:** Webhook worker execution, host payout settlement.
- **Likely Files / Systems:** `components/CheckoutPage.tsx`, `App.tsx`.
- **Database Impact:** None.
- **API Impact:** Calls `POST /api/v2/stays/orders` with verified JWT auth header.
- **UI Impact:** Clear three-stage checkout progress stepper; honest pricing breakdown.
- **Security Impact:** Eliminates anonymous checkout fraud; guarantees verified identity.
- **Performance Impact:** Zero external scripts loaded until Razorpay modal is explicitly requested.
- **Backward Compatibility:** Redirects unauthenticated users to login with stateful return URL.
- **Acceptance Criteria:**
  - Unauthenticated guests cannot trigger Razorpay checkout modal.
  - Client cannot mutate nightly price, tax amounts, or total payable.
  - Mock payment branch is completely deleted from codebase.
- **Testing Strategy:**
  - E2E: Full checkout user journey with authentication boundary tests.
  - Unit: Checkout state machine transition tests.
- **Observability:** Funnel drop-off analytics per checkout stage.
- **Non-Destructive Rollback Strategy:** Git revert `CheckoutPage.tsx`.
- **Definition of Done:** Zero mock payment paths exist; verified identity required for all orders.

---

---

### Milestone 9 — Razorpay Order Binding, Webhook Fulfillment & Reconciliation
- **Status:** **NOT STARTED**
- **Execution Type:** Payment Gateway & Worker
- **Objective:** Orchestrate an idempotent payment saga across local PostgreSQL transactions and Razorpay (no atomic distributed transaction exists with provider), bind orders strictly to server quotes, record local `ORDER_CREATING` attempt before provider API call, handle network timeouts with `UNKNOWN_OUTCOME` reconciliation worker, enforce deterministic 4-table lock order, ingest webhooks with durable anti-replay deduplication, and execute asynchronous booking fulfillment or late-capture inventory re-lock checks.
- **Dependencies:** Milestone 4, Milestone 5, Milestone 8, Live Webhook Secrets, Founder Gate [PROPOSED-012], Provider Reconciliation Capability (PROVIDER BLOCKED).
- **Decision Gates:**
  > [!WARNING]
  > BLOCKED — AUTOMATED REFUND ON LATE-CAPTURE NOT EXECUTABLE UNTIL DECISION [PROPOSED-012] IS APPROVED.
  > BLOCKED — PROVIDER ORDER RECONCILIATION BY RECEIPT/NOTES IS PROVIDER BLOCKED PENDING DOCUMENTATION VERIFICATION / SANDBOX INTEGRATION PROOF.
- **Exact Scope:**
  - Implement `POST /api/v2/stays/orders` creating local `ORDER_CREATING` attempt before invoking Razorpay API.
  - Server computes `request_fingerprint = SHA256(user_id + ":" + quote_id + ":" + hold_id)`.
  - Enforce database-level order creation idempotency via `UNIQUE (user_id, operation, idempotency_key)` on `payment_attempts`. If identical key arrives with identical fingerprint, replay stored record cleanly; if key arrives with different fingerprint, return HTTP 409 Conflict (`IDEMPOTENCY_FINGERPRINT_MISMATCH`).
  - Enforce single unresolved payment attempt invariant per hold/booking via partial unique index:
    `CREATE UNIQUE INDEX uq_payment_attempts_active_hold ON payment_attempts (hold_id) WHERE status IN (ORDER_CREATING, ORDER_CREATED, AUTHORIZED, UNKNOWN_OUTCOME, RECONCILIATION_REQUIRED);`
  - Handle gateway responses: 200 OK -> `ORDER_CREATED`; deterministic provider 4xx rejection -> `FAILED`; timeout/network interruption -> `UNKNOWN_OUTCOME`.
  - Define and handle explicit crash boundaries:
    - Boundary 1: Local attempt committed before request; sweeper NEVER marks FAILED on lease expiry; transitions to `UNKNOWN_OUTCOME` and fails closed to `payment_reconciliation_cases`.
    - Boundary 2: Interrupted outbound request transitions to `UNKNOWN_OUTCOME` and opens `payment_reconciliation_cases`.
    - Boundary 3: Provider order created but crash occurs before local DB update (`gateway_order_id` is NULL):
      a. If local `gateway_order_id` exists: require exact match against payload.
      b. If local `gateway_order_id` IS NULL: permit write-once binding ONLY from verified HMAC-SHA256 signed provider payload containing trusted immutable provider correlation to `payment_attempt.id` (`notes.attempt_id` or `receipt == attempt_id`).
      c. If provider payload lacks sufficient trusted correlation or client-only data is submitted: reject binding and transition to `RECONCILIATION_REQUIRED` in `payment_reconciliation_cases`.
      d. Provider lookup by receipt/notes remains PROVIDER BLOCKED pending sandbox proof.
    - Boundary 4: Client disconnect after DB commit; client retries with identical `Idempotency-Key` and receives stored order payload without provider re-invocation.
  - Background reconciliation worker resolves `UNKNOWN_OUTCOME` before any retry. Querying orders by receipt/notes is PROVIDER BLOCKED pending proof; fallback uses webhook correlation via verified signed payload or manual investigation via `payment_reconciliation_cases`, never blind retry.
  - Ingest inbound webhooks at `POST /api/payments/webhook`: capture `rawBody`, verify HMAC-SHA256 signature, insert into `inbound_webhooks` with idempotency on `provider_event_id`, and return HTTP 200 in <200ms.
  - Build asynchronous `WebhookWorkerService`: claim pending webhooks with leasing, acquire deterministic 4-table locks (`payment_attempts` -> `bookings` -> `inventory_days` ASC -> `booking_holds`), wrap in PostgreSQL error code `40P01` deadlock retry loop (max 3 retries, 50ms initial delay + random jitter), and validate provider binding, currency ('INR'), and exact amount (`quote.total_amount_paise`).
  - On validation mismatch: flag `payment_attempts.status = RECONCILIATION_REQUIRED`, mark webhook `status = dead_letter`, insert record into `payment_reconciliation_cases` (status = OPEN, severity = P1_CRITICAL, reason_code = VALIDATION_MISMATCH), rollback financial effects, and trigger high-priority alert (zero automated refund dispatch; zero endless retry loops).
  - Only after validation passes: execute `INSERT INTO processed_payments (...) ON CONFLICT (gateway_payment_id) DO NOTHING RETURNING gateway_payment_id`. If NULL returned, commit/ack immediately as clean replay. If 1 row returned, execute atomic financial fulfillment.
  - Late-capture handling: If hold expired and inventory sold out, mark booking `PAYMENT_CAPTURED_INVENTORY_UNAVAILABLE` and update payment attempt to `CAPTURED`. Pre-approval default: create manual finance reconciliation case with operational alert (zero auto-refund). Conditional branch: automated refund dispatch enabled ONLY after formal approval of `[PROPOSED-012]`.
- **Exclusions:** Frontend confirmation rendering, standard cancellation refunds.
- **Likely Files / Systems:** `server.ts`, `src/lib/webhookWorkerService.ts`, `src/cron/paymentReconciliation.ts`.
  - Add `payment_attempts`, `processed_payments`, `transactional_outbox`, `booking_audit_events`, `payment_reconciliation_cases` tables; add `razorpay_order_id` to `bookings`; add partial unique index on active holds.
- **API Impact:** Secure webhook ingestion and order creation endpoints.
- **UI Impact:** Checkout modal receives real Razorpay `order_id` and public `key_id`.
- **Security Impact:** Cryptographic webhook signature verification; defense against replay attacks.
- **Performance Impact:** Immediate HTTP 200 webhook acknowledgment decouples fulfillment from gateway latency.
- **Backward Compatibility:** Legacy webhook handler routes through durable ingestion pipeline.
- **Acceptance Criteria:**
  - Inbound webhook returns HTTP 200 in <200ms under load.
  - Duplicate webhook delivery results in zero duplicate side effects (guaranteed via `processed_payments` `ON CONFLICT DO NOTHING RETURNING` execution).
  - Disconnected browser during payment still confirms booking via background worker.
  - Late payment capture with sold-out inventory marks booking `PAYMENT_CAPTURED_INVENTORY_UNAVAILABLE` and creates manual reconciliation case (or automated refund if `[PROPOSED-012]` approved).
- **Testing Strategy:**
  - Integration: Signature verification with valid and invalid HMAC secrets.
  - Concurrency & Anti-Replay: Replay attack simulation (concurrent duplicate webhook delivery testing `processed_payments` RETURNING contract).
  - Failure: Network disconnection, stale `ORDER_CREATING` fail-closed to `UNKNOWN_OUTCOME`, and late-capture sold-out inventory simulation.
- **Observability:** Prometheus metrics for webhook ingestion rate, worker processing lag, and failed signature attempts.
- **Non-Destructive Rollback Strategy:** Webhook worker falls back to manual queue flag; all raw events preserved in `inbound_webhooks`.
- **Definition of Done:** 100% of captured payments fulfilled with zero double-confirmations or silent overbookings.

---

### Milestone 10 — Server-Backed Confirmation & Manage Booking
- **Status:** **NOT STARTED**
- **Execution Type:** Frontend & Confirmation API
- **Objective:** Rebuild `BookingPage.tsx` to hydrate strictly from `GET /api/v2/bookings/:id`. Eliminate hardcoded physical access credentials (PIN '4829', fake WiFi), and implement legally gated immutable `accommodation_invoices`.
- **Dependencies:** Milestone 9, Indian GST Legal Format Sign-Off (LEGAL BLOCKED).
- **Decision Gates:**
  > [!WARNING]
  > BLOCKED — ACCOMMODATION INVOICE GENERATION NOT EXECUTABLE UNTIL STATUTORY GST RULES & INVOICE FORMAT SIGN-OFF.
- **Exact Scope:**
  - Implement `GET /api/v2/bookings/:id` enforcing RLS (authenticated guest or host only).
  - Reveal full physical street address strictly upon confirmed booking status.
  - Completely remove hardcoded PINs and WiFi network credentials.
  - Rebuild `BookingPage.tsx` with polling confirmation and printable receipt view.
  - Implement legally gated immutable `accommodation_invoices` (host-issued, generated by Encho as disclosed marketplace agent; once `ISSUED`, document is strictly immutable; amendments/cancellations generate sequentially numbered `linked_adjustment_documents`, with specific statutory classifications such as credit notes/amended invoices being LEGAL BLOCKED pending written CA/tax-attorney sign-off).
- **Exclusions:** Automated refunds, host payout release.
- **Likely Files / Systems:** `components/BookingPage.tsx`, `components/ReservationsList.tsx`, `server.ts`, `src/services/invoiceService.ts`.
- **Database Impact:** Add `accommodation_invoices`, `linked_adjustment_documents` tables.
- **API Impact:** Introduces authenticated booking receipt endpoint and invoice download endpoint.
- **UI Impact:** Authoritative booking voucher showing real check-in dates, reference number, and masked location.
- **Security Impact:** Protects physical property access credentials and host privacy.
- **Performance Impact:** Fast single-row primary key hydration.
- **Backward Compatibility:** Supports legacy booking IDs with stateful lookup redirect.
- **Acceptance Criteria:**
  - Browser refresh on confirmation page maintains complete booking voucher.
  - Zero hardcoded PINs or WiFi passwords rendered.
  - Unauthenticated users cannot view booking receipt.
  - Invoice generated with host as legal supplier and Encho as disclosed collection agent, remaining strictly immutable once issued; any adjustment creates a sequentially numbered `linked_adjustment_documents` record.
- **Testing Strategy:**
  - E2E: Full payment to confirmation page load.
  - Security: IDOR testing on booking receipt endpoint.
- **Observability:** Confirmation page load failure logs.
- **Non-Destructive Rollback Strategy:** Git revert `BookingPage.tsx`.
- **Definition of Done:** Booking voucher hydrates 100% from database with zero hardcoded credentials.

---

### Milestone 11 — Cancellation, Refund, Payout & Reserve Lifecycle
- **Status:** **NOT STARTED**
- **Execution Type:** Ledger & Refund Worker
- **Objective:** Implement cancellation rules engine, automated Razorpay refunds, check-in verification records, host payout accounts, payout transfers, host reserve balance ledgers (10% for 30 days for high-risk hosts), deficit recovery ledgers, and payout obligations with release timing derived from versioned approved payout-policy snapshots.
- **Dependencies:** Milestone 9, Milestone 10, Founder Gates [PROPOSED-003, PROPOSED-008, PROPOSED-009, PROPOSED-010], Provider Payout Rail Selection (PROVIDER BLOCKED).
- **Decision Gates:**
  > [!WARNING]
  > BLOCKED — CANCELLATION ENGINE NOT EXECUTABLE UNTIL DECISION [PROPOSED-003] IS APPROVED.
  > BLOCKED — CHECK-IN VERIFICATION NOT EXECUTABLE UNTIL DECISIONS [PROPOSED-008, PROPOSED-009] ARE APPROVED.
  > BLOCKED — HIGH-RISK PAYOUT TIMING NOT EXECUTABLE UNTIL DECISION [PROPOSED-010] IS APPROVED (UNRESOLVED BETWEEN CHECKOUT VS CHECKOUT + 24H).
  > BLOCKED — PAYOUT DISPATCH NOT EXECUTABLE UNTIL PROVIDER PAYOUT RAIL SELECTION IS APPROVED.
- **Exact Scope:**
  - Implement `POST /api/v2/bookings/:id/cancel` calculating refund eligibility from versioned cancellation templates.
  - Dispatch automated gateway refunds via `guest_refunds` ledger.
  - Implement `checkin_verification_records` validating physical occupancy.
  - Implement `host_payout_accounts` with banking rail configs.
  - Schedule host payouts in `host_payout_obligations` with status `BLOCKED` and `scheduled_release_at` derived strictly from versioned approved payout-policy snapshot:
    - Standard hosts: Check-in + 24 hours (subject to Founder Gate [PROPOSED-008, PROPOSED-009] on check-in verification).
    - High-risk hosts: Timing is UNRESOLVED and GATED behind Founder Gate [PROPOSED-010] (unresolved between checkout vs checkout + 24h; system must NOT encode a proposed high-risk choice until PROPOSED-010 is formally approved).
  - Execute bank transfers via `payout_transfers` table.
  - Deduct host reserve balance in `host_reserve_ledgers` for high-risk hosts.
  - Implement `reserve_deficit_recovery_ledgers` tracking unrecovered balances from refunds/reversals.
- **Exclusions:** Host listing builder modifications.
- **Likely Files / Systems:** `server.ts`, `src/services/refundService.ts`, `src/services/payoutService.ts`, `src/services/checkinService.ts`.
- **Database Impact:** Create `host_payout_obligations`, `host_reserve_ledgers`, `reserve_deficit_recovery_ledgers`, `host_payout_accounts`, `payout_transfers`, `checkin_verification_records`, `guest_refunds`.
- **API Impact:** Introduces cancellation, check-in verification, and refund tracking endpoints.
- **UI Impact:** Displays clear cancellation timeline, check-in verification status, and refund estimate.
- **Security Impact:** Role-based gating on manual refund approvals; automated dispute freezes.
- **Performance Impact:** Asynchronous background worker handles gateway refund calls.
- **Backward Compatibility:** Historical bookings remain unaffected.
- **Acceptance Criteria:**
  - Guest cancellation within policy window triggers accurate gateway refund.
  - Host payout obligation remains `BLOCKED` until `scheduled_release_at` derived from versioned approved payout-policy snapshot.
  - Open guest dispute freezes host payout automatically.
  - Deficit recovery ledgers record negative balances resulting from excess refunds.
- **Testing Strategy:**
  - Unit: Cancellation fee and refund calculation test matrix; deficit recovery test matrix.
  - Integration: Razorpay refund dispatch and webhook reconciliation.
- **Observability:** Metrics for refund volume, payout escrow balance, and deficit alerts.
- **Non-Destructive Rollback Strategy:** Disable automated payout worker; require manual admin approval for disbursements.
- **Definition of Done:** Automated refunds, check-in verification, payout escrow, and deficit ledgers verified against financial test suite.

---

### Milestone 12 — Host & Admin Parity & Publication Gate
- **Status:** **NOT STARTED**
- **Execution Type:** HostForm & AdminDashboard
- **Objective:** Update `HostForm.tsx` and `AdminDashboard.tsx` to ensure 100% three-way parity across Guest, Host, and Admin interfaces without synthetic attributes or orphaned fields.
- **Dependencies:** Milestone 3, Milestone 6, Milestone 11.
- **Exact Scope:**
  - Ensure all fields displayed in `ListingDetailsNew.tsx` can be edited in `HostForm.tsx` and moderated in `AdminDashboard.tsx`.
  - Connect AI pre-flight gatekeeper API (`POST /api/ai/evaluate-listing`) enforcing score >= 8.0 for advertising clearance.
  - Implement admin moderation queue for new and modified listings.
- **Exclusions:** Marketing engine ad-spend processing.
- **Likely Files / Systems:** `components/HostForm.tsx`, `components/AdminDashboard.tsx`, `server.ts`.
- **Database Impact:** Add `property_audit_events` table; add `moderation_status` to listings.
- **API Impact:** Connects moderation review endpoints.
- **UI Impact:** Clean host editing steps and comprehensive admin moderation controls.
- **Security Impact:** Prevents unapproved or fraudulent listings from publishing publicly.
- **Performance Impact:** Debounced draft autosave prevents unnecessary API spam.
- **Backward Compatibility:** Existing listings retain current publication status.
- **Acceptance Criteria:**
  - Every field in the presentation contract has an authoritative host input and admin moderation view.
  - Sub-8.0 AI score blocks automated advertising clearance.
- **Testing Strategy:**
  - E2E: Complete host listing creation -> admin approval -> guest booking flow.
  - Integration: AI gatekeeper evaluation tests.
- **Observability:** Audit logs capturing moderator ID and timestamp for every state change.
- **Non-Destructive Rollback Strategy:** Git revert form components; moderation tables preserved.
- **Definition of Done:** Full three-way feature parity certified across Guest, Host, and Admin.

---

### Milestone 13 — Analytics, Attribution & Meta Landing Integrity
- **Status:** **NOT STARTED**
- **Execution Type:** AdTech & Analytics Pipeline
- **Objective:** Update Meta ad campaign creative destination URLs to `/stay/:propertySlug`, track UTM parameters through the booking lifecycle, and eliminate 404 landing page errors.
- **Dependencies:** Milestone 2, Milestone 10.
- **Exact Scope:**
  - Update ad network generator in `server.ts` to generate canonical `/stay/:slug` links.
  - Persist UTM attribution parameters from landing through quote and confirmed booking.
  - Enforce server-side privacy filtering on analytics events.
- **Exclusions:** Google Ads integration (out of scope for v1).
- **Likely Files / Systems:** `server.ts`, `src/services/analyticsService.ts`, `components/ListingDetailsNew.tsx`.
- **Database Impact:** Add `utm_source`, `utm_medium`, `utm_campaign` columns to `bookings`.
- **API Impact:** Analytics ingestion endpoints accept sanitized payloads.
- **UI Impact:** Seamless ad landing experience with zero route bouncing.
- **Security Impact:** Zero PII leakage in analytics payloads; compliance with IT Act.
- **Performance Impact:** Asynchronous beacon API dispatch (`navigator.sendBeacon`).
- **Backward Compatibility:** Legacy ad URLs automatically redirect via M2 301 middleware.
- **Acceptance Criteria:**
  - 100% of Meta ad links resolve to valid, active canonical property URLs.
  - UTM attribution successfully recorded on confirmed bookings.
- **Testing Strategy:**
  - E2E: Simulated ad click landing with UTM parameters through checkout completion.
  - Integration: Analytics payload validation tests.
- **Observability:** Telemetry tracking ad landing 404 rates (target: 0.00%).
- **Non-Destructive Rollback Strategy:** Revert URL generator in `server.ts:9168`.
- **Definition of Done:** Zero ad landing 404 errors across all active campaigns.

---

### Milestone 14 — Performance, Security, Concurrency & E2E Certification
- **Status:** **NOT STARTED**
- **Execution Type:** Automated QA & Audits
- **Objective:** Optimize bundle chunks, execute OWASP security review, run 100-thread checkout stress tests, and verify end-to-end guest journey with automated Playwright suites.
- **Dependencies:** Milestone 1 through Milestone 13.
- **Exact Scope:**
  - Execute 100-thread parallel race condition test suite against inventory holds.
  - Run automated OWASP ZAP security scan on public and authenticated APIs.
  - Execute full Playwright E2E suite covering discovery, quoting, checkout, capture, and confirmation.
  - Verify Core Web Vitals performance budgets on mobile 4G emulation.
- **Exclusions:** Production cutover.
- **Likely Files / Systems:** Test suites, CI/CD pipeline configuration, Vite build configuration.
- **Database Impact:** None.
- **API Impact:** None.
- **UI Impact:** Verified sub-2.2s LCP and sub-150ms INP.
- **Security Impact:** Closes any identified IDOR, injection, or rate-limiting vulnerabilities.
- **Performance Impact:** Optimizes client code-splitting and asset compression.
- **Backward Compatibility:** Ensures zero regression across existing platform functionality.
- **Acceptance Criteria:**
  - 100% test pass rate across unit, integration, and E2E suites.
  - Zero overbookings under 100-thread concurrent stress testing.
  - Zero high or critical vulnerabilities on OWASP security audit.
- **Testing Strategy:** Automated CI/CD test execution with parallel workers.
- **Observability:** Comprehensive test reports and performance audit artifacts.
- **Non-Destructive Rollback Strategy:** N/A (Testing milestone).
- **Definition of Done:** Formal certification of readiness signed off by Lead Architect.

---

### Milestone 15 — Controlled Cutover & Legacy Retirement
- **Status:** **NOT STARTED**
- **Execution Type:** Decommissioning & Cutover
- **Objective:** Safely retire legacy `ListingDetails.tsx`, clean up deprecated code paths, and finalize production telemetry without dropping any database tables.
- **Dependencies:** Milestone 14.
- **Exact Scope:**
  - Remove legacy `ListingDetails.tsx` after verifying zero dead import references.
  - Finalize production error budgets and alerting thresholds.
  - Archive deprecated JSONB read paths in server endpoints.
- **Exclusions:** Dropping any financial, inventory, or booking tables (strictly prohibited).
- **Likely Files / Systems:** `components/ListingDetails.tsx`, `App.tsx`, `server.ts`.
- **Database Impact:** Deprecated columns marked for historical retention only; NO TABLES DROPPED.
- **API Impact:** Deprecated v1 endpoints disabled; v2 endpoints established as default.
- **UI Impact:** Unified, clean codebase running exclusively on canonical components.
- **Security Impact:** Eliminates attack surface from legacy unvalidated endpoints.
- **Performance Impact:** Smaller production bundle size; faster cold starts.
- **Backward Compatibility:** 301 redirects remain permanently in place.
- **Acceptance Criteria:**
  - Clean production build with 0 TypeScript or lint errors.
  - Zero references to legacy `ListingDetails.tsx`.
  - Zero database tables dropped.
- **Testing Strategy:** Production smoke tests and synthetic monitoring.
- **Observability:** Real-time production error rates and uptime dashboards.
- **Non-Destructive Rollback Strategy:** Restore legacy export alias from version control if needed.
- **Definition of Done:** 100% of guest traffic served by V2 architecture with zero legacy regressions.
