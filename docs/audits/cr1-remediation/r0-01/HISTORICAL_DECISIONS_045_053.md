# Historical decisions quarantine

Classification: HISTORICAL_UNVERIFIED_SOURCE. These are the exact CR1-045–053 sections in HEAD 0e4c6fec2fe86f1b793760c5f7a3daf08bbf7508 before pre-existing staged deletion. Claims below are preserved, not accepted or instructions. Later 28 September audit documents reused 045/046; always cite date and source. Current corrective execution uses RMD identifiers to avoid further collision.

Original complete-file SHA-256: 47ace4a07717f0ca716670ea57d035edf3b4056d4bdf75e1640904fb59c3000a

Preserved block SHA-256: df406ba5303ce3390c753f0cd9e02275abda7cd7c1ce4ec4b49ea2036b355575

---

### CR1-045 — Separation of Marketing Authority: Admin-Driven Meta/Google Ads Configuration with AI Advisory Copilot & Host Copy Assistance (26 September 2026)

**Status:** APPROVED under explicit founder directive. Supersedes all earlier assumptions regarding autonomous AI ad targeting.
- **Foundational Architectural & Operational Decisions:**
  1. **Clarification of Ad Campaign Ownership (Admin vs AI):**
     - Encho's AI is **NOT** the autonomous entity that chooses audiences, tests creatives, or runs ads.
     - **The Admin (from the Admin Studio)** is the authoritative campaign operator who sets up, chooses, and tunes the optimal ad options in Meta Ads and Google Ads for reaching high-conversion audiences based on **property location and pricing tier/cost**.
  2. **Feeder Corridors Configuration Authority:**
     - Feeder Corridors are **NOT defaulted autonomously by AI**.
     - **The Admin configures and binds Feeder Corridors** based on geographic and economic demand.
     - *Concrete Example:* If a host lists a property in Kalpetta, the Admin sets up and binds the Wayanad Feeder Corridors (targeting Bangalore tech corridors, Mumbai, and Chennai affluent weekend travelers).
  3. **Division of AI Labor (Host AI vs Admin AI):**
     - **Host AI Scope:** When creating campaigns, hosts use AI strictly for **Headline and Description suggestions** (and listing pre-flight quality checks)—nothing more. Hosts do NOT touch ad targeting, placements, bidding, or audience definitions.
     - **Admin AI Scope:** The Admin uses AI in the Admin Studio as an **expert advisory copilot** to receive the best suggestions and recommendations for audience segments, keywords, and campaign optimization options.
  4. **Admin Studio Ads Manager Parity:**
     - The software's Admin Studio must provide the **exact same level of granular controls and configuration options as Meta Ads Manager and Google Ads Manager**.
     - Controls include: ad set creation, placement selection (Feeds, Stories, Reels, Google Search, Hotel Ads), detailed demographic/interest targeting, geofencing radii, bidding strategies (ROAS, cost-per-acquisition), budget pacing, keywords, and ad extensions.
  5. **Preservation of the Walled Garden Model:**
     - Hosts fund campaigns via a simple 1-click bounded budget in their Host Dashboard.
     - Master Account architecture (no host OAuth) remains strictly preserved.
     - All ad-generated leads drop directly into the Encho Host Inbox without leaking to external channels.

### CR1-046 — Sprint 1 Verification: Canonical Stays Commerce Pipeline & Revenue Unblock (26 September 2026)

**Status:** Line-by-line verification, adversarial test validation, and legacy checkout containment certified under FAANG L7/L8 Zero-Trust engineering protocol.
- **Verification Matrix & Invariant Proofs:**
  1. *Zero Guest Fee Invariant:* Verified in `staysCommerceRouter.ts` and `staysCommerceEngine.ts`. Guest pricing is strictly Base Rent + 18% Statutory GST (`rent * 0.18`), with exactly ₹0 guest commission or platform surcharges.
  2. *Immutable Server-Authoritative Quotes:* Quotes stored in `stays_quotes` with 15-minute expiration (`expires_at`). Client prices in requests are discarded; quotes are verified against active room types and inventory.
  3. *Atomic Inventory Holds Integration:* Integrated with Milestone 4 `stays_holds` and `inventory_days` using PostgreSQL `FOR UPDATE` row-level locking. Overlapping hold requests fail closed with `ROOM_UNAVAILABLE`. Concurrency burst of 50 simultaneous holds for 1 room produces exactly 1 acquired hold and 49 clean rejections.
  4. *Monotonic Order State Machine:* Transitions: `INITIATED` -> `HOLD_ACQUIRED` -> `CAPTURED` -> `FULFILLED`. Out-of-order or duplicate webhook delivery is sequence-fenced without regressing terminal states.
  5. *Cryptographic Payment Confirmation:* Webhook and manual capture verify HMAC-SHA256 signature (`crypto.createHmac('sha256', secret).update(body).digest('hex')`). Invalid signatures reject immediately with HTTP 400.
  6. *Legacy Containment Enforcement:* `POST /api/checkout/razorpay/order` fails closed in production with HTTP 503 (`CANONICAL_CHECKOUT_REQUIRED`), preventing legacy unquoted orders.
- **Verified Test Suites:**
  - `cr1_stays_canonical_commerce.test.ts`: **6/6 tests passed (100%)**.
  - `cr1_commerce_pipeline.test.ts`: **4/4 tests passed (100%)**.
  - `p0_containment_remediation.test.tsx`: **14/14 tests passed (100%)**.
  - `cr1_release_candidate_certification.test.ts`: **5/5 tests passed (100%)**.

### CR1-047 — Sprint 2 Execution: Standalone Reel & Creative Package Pipeline (26 September 2026)

**Status:** Implementation, database migrations, boot-time DDL hardening, 3-area UI integrations, and adversarial regression suites certified under FAANG L7/L8 Zero-Trust engineering protocol. Fulfills Decision 037-G & Blueprint Gap G-07.
- **Architectural Deliverables & Capabilities:**
  1. *Database Schema (`src/migrations/042_marketing_creative_packages.sql`):*
     - Provisioned `marketing_creative_packages` and `marketing_creative_assets` with UUID primary keys, check constraints (`STANDALONE_REEL`, `PRIMARY_VIDEO`, `9:16`, duration <= 60.00s, positive byte sizes), and B-tree indexes.
     - Hardened cold-start serverless environments by adding matching DDL to `ensureListingsTable` in `server.ts`.
  2. *Backend Service (`src/services/creativePackageService.ts`):*
     - Strict Zod schemas validating media aspect ratios, durations, byte sizes, and MIME types.
     - Cryptographic SHA-256 Rights Attestation hashing ensuring tamper-evident proof of host advertising rights confirmation.
     - AI Preflight Gatekeeper scoring (0.0 to 10.0 scale, >= 8.0 pass threshold) evaluating headlines, descriptions, and media properties.
     - Atomic PostgreSQL transaction management (`BEGIN` / `COMMIT` / `ROLLBACK`).
     - Cross-tenant authorization boundaries ensuring hosts only access and manage their own packages.
     - Admin moderation lifecycle (`SUBMITTED` -> `APPROVED` / `REJECTED`) with rejection reasons and monotonic version bumping.
  3. *Express Router (`src/server/marketing/creativePackageRouter.ts`):*
     - Mounted at `/api/marketing/v2/creatives/packages`.
     - Endpoints: `POST /`, `GET /`, `GET /:id`, and `POST /:id/moderate`.
     - Express 5 parameter type safety (`string | string[]` normalization) and granular HTTP error mapping (400, 401, 403, 404, 500).
  4. *Three-Area UI Implementation:*
     - **Area 1 (Guest View / `ListingDetailsNew.tsx`):** Confirmed architectural gallery purity. Standalone reels never appear in guest galleries or mutate `listings.photos`.
     - **Area 2 (Host / Campaign Builder / `components/marketing/`):**
       - Built `StandaloneReelUpload.tsx`: Drag-and-drop video upload, client-side metadata inspection (aspect ratio, duration), interactive smartphone simulator frame with video playback and headline overlay, and mandatory rights attestation.
       - Built dual-tab asset selector in `CampaignStudio.tsx` ("Listing Gallery Assets" vs "✨ Standalone Phone Reel (9:16)").
     - **Area 3 (Admin Control Plane / `components/marketing/`):**
       - Built `AdminReelPackageWorkspace` in `CreativeWorkspace.tsx` displaying live video playback, aspect ratio badges, duration meters, AI preflight scores, and 1-click Approve / Reject moderation controls.
       - Embedded into `AdminMarketingWorkspace.tsx` under the creative moderation desk.
- **Verified Suite Quality Matrix:**
  - Creative pipeline adversarial suite: **1 test suite, 8 passing tests (100%)** (`sprint2_creative_pipeline.test.ts`).
  - Stays canonical commerce suite: **1 test suite, 6 passing tests (100%)** (`cr1_stays_canonical_commerce.test.ts`).
  - Creative storage/preparation suite: **1 test suite, 33 passing tests (100%)** (`creative_pipeline.test.ts`).
  - TypeScript static verification: **0 errors** (`tsc --noEmit && tsc -p tsconfig.server.json --noEmit`).

### CR1-048 — Sprint 3 Execution: Dedicated Background Container Worker Daemon & Smart Auto-Pause Circuit Breaker (26 September 2026)

**Status:** Implementation, database migrations, boot-time DDL hardening, background container worker daemon, 3-area UI integrations, and adversarial regression suites certified under FAANG L7/L8 Zero-Trust engineering protocol. Fulfills Milestone 4, Blueprint Gaps G-02, G-03, G-11, G-18, and Decision CR1-045.
- **Architectural Deliverables & Capabilities:**
  1. *Database Schema (`src/migrations/043_worker_daemon_and_circuit_breaker.sql`):*
     - Provisioned `marketing_daily_rollups` with composite primary key `(campaign_id, rollup_date)`, check constraints ensuring non-negative telemetry metrics (impressions, clicks, spend, leads, conversions), and performance B-tree index.
     - Provisioned `circuit_breaker_events` recording immutable audit logs of triggers and overrides with event types (`OCCUPANCY_100_PERCENT`, `BUDGET_STOP_LOSS_95_PERCENT`, `MANUAL_ADMIN_OVERRIDE`).
     - Provisioned `dead_letter_queue` capturing permanently failed outbox intents with error details, payload dumps, resolution state tracking, and resolution timestamps.
     - Hardened cold-start serverless environments by adding matching DDL to `ensureListingsTable` in `server.ts`.
  2. *Domain Service (`src/services/circuitBreakerService.ts`):*
     - `evaluateOccupancyCircuitBreaker(client, campaignId)`: Assesses active campaign targeting dates against room inventory. If 100% of days in target window are booked (`inventory_days.booked_count >= room_types.inventory_count`), auto-pauses campaign and records immutable circuit breaker event.
     - `evaluateBudgetStopLoss(client, campaignId)`: Assesses real-time spend against authorized budget. If spend >= 95%, auto-pauses campaign to prevent network overspend liability.
     - `overrideCircuitBreaker(client, campaignId, adminUserId, reason)`: Allows privileged Admin intervention to resume paused campaigns with mandatory audit trails.
     - `aggregateDailyRollups(client, targetDate)`: Materializes high-frequency ad events into daily rollups via PostgreSQL `ON CONFLICT DO UPDATE`, ensuring sub-200ms dashboard queries.
     - `recordDeadLetter` & `resolveDeadLetter`: Handles retry exhaustion and dead-letter triage.
  3. *Background Worker Daemon (`src/workers/platformWorker.ts`):*
     - Standalone process decoupled from web application lifecycle, deployable on Fly.io Machines or AWS ECS.
     - Loop 1 (Outbox Poller): Polls `notification_intents` every 1,000ms with exponential backoff + jitter, routing to mock dispatchers and exhausting to DLQ after 5 attempts.
     - Loop 2 (Telemetry Rollups): Aggregates daily telemetry metrics every 5,000ms.
     - Loop 3 (Smart Auto-Pause Circuit Breaker): Evaluates active campaign occupancy and stop-loss every 10,000ms.
     - Exposed deterministic `runWorkerCycle()` for automated CI/CD testing. Added `"worker:daemon": "tsx src/workers/platformWorker.ts"` to `package.json`.
  4. *Express API Router (`src/server/marketing/circuitBreakerRouter.ts`):*
     - Mounted at `/api/marketing/v2/circuit-breaker`.
     - Endpoints: `GET /status`, `POST /evaluate`, `POST /override/:id`, `GET /dlq`, `POST /dlq/:id/resolve`.
  5. *Three-Area UI Implementation:*
     - **Area 1 (Guest View / `ListingDetailsNew.tsx`):** Confirmed guest booking calendar reflects occupancy state accurately. 100% booked dates render `⚡ 100% Booked — Fully occupied for these dates` and button label `Sold out for selected dates`, disabling reservations and feeding the circuit breaker.
     - **Area 2 (Host Studio / `CampaignStudio.tsx`):** Rendered prominent `⚡ Smart Auto-Pause Triggered (100% Occupancy Reached)` alert banner informing hosts that their remaining ad budget is safely preserved in their wallet.
     - **Area 3 (Admin Control Plane / `CircuitBreakerWorkspace.tsx`):** Embedded live Circuit Breaker desk inside `AdminMarketingWorkspace.tsx`, providing live daemon heartbeats, paused campaign inspector with 1-click "Override & Resume", and Dead Letter Queue management.
- **Verified Suite Quality Matrix:**
  - Sprint 3 Worker Daemon & Circuit Breaker suite: **1 test suite, 8 passing tests (100%)** (`sprint3_worker_daemon.test.ts`).
  - Sprint 2 Creative Pipeline suite: **1 test suite, 8 passing tests (100%)** (`sprint2_creative_pipeline.test.ts`).
  - Sprint 1 Canonical Commerce suite: **1 test suite, 6 passing tests (100%)** (`cr1_stays_canonical_commerce.test.ts`).
  - Cross-Sprint Unified Suite: **22 passing tests (100%) in 5.19s**.

### CR1-049 — Sprint 4 Execution: Feeder Corridors Engine & Admin God-Mode Meta/Google Ads Manager Parity Studio (26 September 2026)

**Status:** Implementation, physical database migrations, boot-time DDL hardening, domain service with mathematical feeder formula verification, Express API router, full 3-area UI integration, and adversarial regression suites certified under FAANG L7/L8 Zero-Trust engineering protocol. Fulfills Blueprint Sections 6 & 8, Decision CR1-045, and Blueprint Gap G-01.
- **Architectural Deliverables & Capabilities:**
  1. *Database Schema (`src/migrations/044_feeder_corridors_and_godmode_targeting.sql`):*
     - Provisioned `marketing_feeder_corridor_definitions` with UUID primary keys, region codes (`WAYANAD`, `GOA`, `COORG`, etc.), source city coordinates, radius check constraints, mandatory local district exclusion, and expected ROAS benchmarks.
     - Seeded canonical high-converting corridors: Bangalore Tech Corridor (25km, 4.20x ROAS), South Mumbai Affluent (15km, 3.90x ROAS), Chennai Central (20km, 3.50x ROAS), and Mumbai/Pune hubs for Goa.
     - Provisioned `campaign_godmode_targeting` storing granular Meta and Google targeting configurations with housing special category (HEC) compliance lock, placements JSONB, bidding strategy (`TARGET_ROAS`, `MAX_CONVERSIONS`, `TARGET_CPA`, `MAX_CLICKS`), target ROAS floor slider, CPA/CPC ceilings, Google match keywords (exact, phrase, broad), negative keywords suppression list, and monotonic version tracking.
     - Hardened cold-start serverless environments by adding matching DDL to `ensureListingsTable` in `server.ts`.
  2. *Domain Service (`src/services/feederCorridorService.ts`):*
     - Mathematical Feeder Targeting Formula: Implemented and validated $FeederTargeting = \bigcup (\text{CityCenter}_{i}, \text{Radius}_{i}) \setminus \text{LocalDistrictBoundary}$, preventing ad spend waste on non-traveling local residents.
     - Targeting Collision Prevention: Guaranteed failure closed if any destination district is inadvertently targeted as a feeder source.
     - AI Advisory Copilot: Generates optimal targeting setups based on property price tier, visual amenities (e.g., private pool/view), and geographic demand with $\ge 90\%$ confidence, recommending 9:16 vertical video placements (70% Reels), ROAS floor ($\ge 3.8$ for luxury), and comprehensive negative keyword suppression lists (`cheap homestay`, `bus timings`, `dormitory`).
     - Atomic Persistence & Backward-Compatibility Sync: Saves targeting configurations with atomic transaction rollback and auto-synchronizes `host_marketing_campaigns.meta_specifications` and `adset_specifications`.
  3. *Express Router (`src/server/marketing/feederCorridorRouter.ts`):*
     - Mounted at `/api/marketing/v2/feeder-corridors`.
     - Endpoints: `GET /corridors`, `POST /recommend`, `POST /validate-formula`, `GET /campaigns/:id/targeting`, and `POST /campaigns/:id/targeting`.
     - Strict RBAC: Hosts cannot mutate targeting dials directly (Admin authority required), preserving the Host AI (copy only) vs Admin AI (targeting strategy) division of labor. Cross-tenant isolation ensures hosts only read their own campaign targeting.
  4. *Three-Area UI Implementation:*
     - **Area 1 (Guest View / `ListingDetailsNew.tsx`):** Added verified `🎯 Curated Feeder Gateway · Direct Weekend Corridor` destination badge on guest detailing page.
     - **Area 2 (Host Studio / `CampaignStudio.tsx`):** Added transparent **"Feeder Corridors & Audience Targeting"** overview card into Step 3, clearly communicating that Encho AdTech manages high-converting feeder corridors with zero local budget waste.
     - **Area 3 (Admin Control Plane / `GodmodeAdsStudio.tsx` & `AdminMarketingWorkspace.tsx`):** Built and mounted the complete God-Mode Ads Manager Studio into the Admin workspace with Meta HEC compliance, placements toggles, Feeder Corridors checkboxes, ROAS floor sliders, Google match types manager, negative keywords suppression list, and 1-click AI Advisory Copilot recommendations.
- **Verified Suite Quality Matrix:**
  - Sprint 4 Feeder Corridors suite: **1 test suite, 12 passing tests (100%)** (`sprint4_feeder_corridors.test.ts`).
  - Sprint 3 Worker Daemon suite: **1 test suite, 8 passing tests (100%)** (`sprint3_worker_daemon.test.ts`).
  - Sprint 2 Creative Pipeline suite: **1 test suite, 8 passing tests (100%)** (`sprint2_creative_pipeline.test.ts`).
  - Sprint 1 Canonical Commerce suite: **1 test suite, 6 passing tests (100%)** (`cr1_stays_canonical_commerce.test.ts`).
  - Cross-Sprint Unified Suite: **34 passing tests (100%) in 10.10s**.
  - TypeScript Static Compilation: **0 errors** across client and server.
  - ESLint Static Analysis: **0 errors, 0 warnings**.

### CR1-050 — Sprint 5 Execution: Multi-Role PostgreSQL Database Security & True Session-Scoped Row-Level Security (RLS) (26 September 2026)

**Status:** Implementation, physical database migrations, boot-time DDL hardening, domain service with catalog audit and adversarial cross-tenant verification, Express API router, full 3-area UI integration, and adversarial regression suites certified under FAANG L7/L8 Zero-Trust engineering protocol. Fulfills Blueprint Section 8, Decision CR1-045, and Blueprint Gap G-17.
- **Architectural Deliverables & Capabilities:**
  1. *Database Schema & Migrations (`src/migrations/045_multi_role_security_and_rls.sql`):*
     - Enacted `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` across 11 critical operational tables: `host_marketing_campaigns`, `campaign_godmode_targeting`, `marketing_creative_packages`, `marketing_creative_assets`, `host_wallets`, `wallet_transactions`, `host_outreach_leads`, `lead_inquiries`, `stays_holds`, `stays_orders`, and `marketing_feeder_corridor_definitions`.
     - Multi-Role Architecture: Formalized separation between DDL migration owner (`encho_migration_user` / table owner) and runtime execution role (`encho_app_user` with `NOSUPERUSER NOBYPASSRLS`), preventing table-owner RLS bypass.
     - Session Variable Scoping: Policies strictly evaluate `NULLIF(current_setting('app.current_user_id', true), '')` and `NULLIF(current_setting('app.bypass_rls', true), '') = 'true'`.
     - Added matching boot DDL in `server.ts` (`ensureListingsTable`) to guarantee RLS enforcement on server boot in any environment.
  2. *Domain Service (`src/services/databaseSecurityService.ts`):*
     - `inspectRlsCatalog(client)`: Queries `pg_class`, `pg_policy`, and `pg_roles` to verify physical RLS enforcement (`relrowsecurity = true`, `relforcerowsecurity = true`), active policy counts, and non-bypass role posture.
     - `verifyTenantIsolation(client, hostAId, hostBId)`: Executes dynamic cross-tenant adversarial checks under `encho_app_user`, asserting that Tenant B queries receive 0 rows for Tenant A records, while matching tenant queries succeed.
  3. *Express Router (`src/server/marketing/databaseSecurityRouter.ts`):*
     - Mounted at `/api/operations/v1/security`.
     - Endpoints: `GET /rls-health` and `POST /verify-isolation`.
     - Role-Based Access Control: Restricted to Admin principals; audits every security verification check.
  4. *Three-Area UI Implementation:*
     - **Area 1 (Guest View / `ListingDetailsNew.tsx` & `CheckoutPage.tsx`):** Embedded hardware-grade cryptographic RLS trust badges affirming tenant isolation and bank-grade data security.
     - **Area 2 (Host Studio / `CampaignStudio.tsx`):** Added dynamic RLS isolation status badge assuring hosts that their ad spend, leads, and wallet transactions are mathematically sealed against cross-tenant leaks.
     - **Area 3 (Admin Control Plane / `AdminRlsSecurityWorkspace.tsx` & `AdminMarketingWorkspace.tsx`):** Integrated dedicated Database Security & RLS Workspace displaying real-time catalog policy matrix, connection role security posture, and 1-click live adversarial tenant isolation tester.
- **Verified Suite Quality Matrix:**
  - Sprint 5 Database Security & RLS suite: **1 test suite, 12 passing tests (100%)** (`sprint5_database_rls.test.ts`).
  - Sprint 4 Feeder Corridors suite: **1 test suite, 12 passing tests (100%)** (`sprint4_feeder_corridors.test.ts`).
  - Sprint 3 Worker Daemon suite: **1 test suite, 8 passing tests (100%)** (`sprint3_worker_daemon.test.ts`).
  - Sprint 2 Creative Pipeline suite: **1 test suite, 8 passing tests (100%)** (`sprint2_creative_pipeline.test.ts`).
  - Sprint 1 Canonical Commerce suite: **1 test suite, 6 passing tests (100%)** (`cr1_stays_canonical_commerce.test.ts`).
  - Cross-Sprint Unified Suite: **46 passing tests (100%) in 8.51s**.
  - TypeScript Static Compilation: **0 errors** across client and server.
  - ESLint Static Analysis: **0 errors, 0 warnings**.

### CR1-051 — Sprint 6 Execution: Live Paused Canary Execution, Zero-Spend Invariants, Readback Verification & Pilot Certification (26 September 2026)

**Status:** Implementation, physical database migrations (`046_canary_execution_and_pilot_certification.sql`), boot-time DDL hardening in `server.ts`, domain service `canaryCertificationService.ts`, Express API router mounted at `/api/marketing/v2/canary`, full 3-area UI integration (`ListingDetailsNew.tsx`, `CheckoutPage.tsx`, `CampaignStudio.tsx`, `AdminCanaryWorkspace.tsx`), signed cryptographic receipt `CR1_LIVE_CANARY_RECEIPT.json` (verification checksum: `690ce47c2d9a2882aab5d9de24946668946e98411d5d6ba7a18785382f9b3e1f`), and adversarial regression suites certified under FAANG L7/L8 Zero-Trust engineering protocol. Fulfills Blueprint Domain 7 (Sprint 6 Specification), Section 10 & 11, Decision CR1-045, and Gate CANARY-01.
- **Architectural Deliverables & Capabilities:**
  1. *Database Schema & Migrations (`src/migrations/046_canary_execution_and_pilot_certification.sql`):*
     - Provisioned `platform_audit_log` (Transactional Outbox for compliance and system audits).
     - Provisioned `canary_execution_registry` with strict zero-spend check constraints: `campaign_status = 'PAUSED'` and `daily_budget_paise = 0`.
     - Provisioned `canary_readback_verifications` recording exact provider readback results.
     - Enabled and forced Row-Level Security (`ENABLE ROW LEVEL SECURITY` & `FORCE ROW LEVEL SECURITY`) across all canary tables with strict admin-only policies.
     - Added matching boot-time DDL in `server.ts` (`ensureListingsTable`).
  2. *Domain Service (`src/services/canaryCertificationService.ts`):*
     - `auditProviderConfiguration()`: Audits Meta Marketing API credentials (`act_` prefix requirement) and Google Ads MCC credentials.
     - `validateZeroSpendInvariant()`: Strictly fails closed if status !== 'PAUSED' or daily budget $> 0$ with `CANARY_ZERO_SPEND_VIOLATION`.
     - `registerCanaryExecution()`: Atomic SQL transaction with `platform_audit_log` outbox and 200ms in-flight burst deduplication.
     - `verifyRemoteReadback()`: Validates that remote provider reports status 'PAUSED' and budget 0; throws `CANARY_DRIFT_DETECTED` on active status and `FINANCIAL_DRIFT_DETECTED` on budget drift.
     - `generateCryptographicCanaryReceipt()`: Generates and signs `docs/harvo/receipts/CR1_LIVE_CANARY_RECEIPT.json` with SHA-256 verification checksum.
  3. *Express Router (`src/server/marketing/canaryCertificationRouter.ts`):*
     - Mounted at `/api/marketing/v2/canary`.
     - Endpoints: `GET /status`, `POST /execute-drill`, `POST /verify-readback`, `POST /generate-receipt`.
     - Strict RBAC: Protected by `requireAdmin` failsafe, rejecting non-admin requests with HTTP 403 `CANARY_ADMIN_AUTH_REQUIRED`.
  4. *Three-Area UI Implementation:*
     - **Area 1 (Guest View / `ListingDetailsNew.tsx` & `CheckoutPage.tsx`):** Displays verified `✨ AdTech Pilot Certified · CANARY-01 Verified` trust badge.
     - **Area 2 (Host Studio / `CampaignStudio.tsx`):** Displays `✨ CANARY-01 Certified: Meta & Google zero-spend PAUSED invariant verified` banner in Step 3.
     - **Area 3 (Admin Control Plane / `AdminCanaryWorkspace.tsx` & `AdminMarketingWorkspace.tsx`):** Mounted complete AdTech Provider Canary & Pilot Certification Control Room with live provider topology status, 4 invariant locks, interactive drill execution, exact readback verification, and cryptographic receipt viewer.
- **Verified Suite Quality Matrix:**
  - Sprint 6 Canary Certification suite: **1 test suite, 8 passing tests (100%)** (`sprint6_canary_certification.test.ts`).
  - Sprint 5 Database Security & RLS suite: **1 test suite, 12 passing tests (100%)** (`sprint5_database_rls.test.ts`).
  - Sprint 4 Feeder Corridors suite: **1 test suite, 12 passing tests (100%)** (`sprint4_feeder_corridors.test.ts`).
  - Sprint 3 Worker Daemon suite: **1 test suite, 8 passing tests (100%)** (`sprint3_worker_daemon.test.ts`).
  - Sprint 2 Creative Pipeline suite: **1 test suite, 8 passing tests (100%)** (`sprint2_creative_pipeline.test.ts`).
  - Sprint 1 Canonical Commerce suite: **1 test suite, 6 passing tests (100%)** (`cr1_stays_canonical_commerce.test.ts`).
  - Cross-Sprint Unified Suite: **54 passing tests (100%)**.
  - TypeScript Static Compilation: **0 errors** across client and server.
  - ESLint Static Analysis: **0 errors, 0 warnings**.

### CR1-052 — Stage 2 Server Monolith Decomposition: Domain Routers, DB Connection Isolation & Sub-300 Line server.ts (27 September 2026)

**Status:** Implementation, domain router modularization, backward-compatible symbol re-exports, static type safety certification, and zero-regression test verification certified under FAANG L7/L8 Principal Systems Engineering protocol.
- **Architectural Deliverables & Capabilities:**
  1. *Monolith Decomposition (<300 Line Invariant):*
     - Decomposed 19,620-line monolithic `server.ts` down to 294 lines of pure application bootstrap initialization, middleware mounting, and backward-compatible symbol re-exports.
     - Carved out dedicated modular domain architectures under `src/server/`:
       * `src/server/config/clients.ts` (162 lines): Client singletons (S3, Mux, Stripe, Razorpay, Redis, Gemini AI), environment secrets, Socket.IO instance accessors (`getGlobalIoInstance`, `setGlobalIoInstance`), and WhatsApp dispatcher.
       * `src/server/db/connection.ts` (113 lines): PostgreSQL pool, read replica pool, RLS async storage (`rlsStorage`), read analytics helper, startup error detection, and pool isolation (`installPoolIsolation`).
       * `src/server/db/bootstrap.ts` (2,120 lines): Idempotent schema migrations (`ensureUsersTable`, `ensureListingsTable`, `ensureMarketingSchema`, `ensureDbInitialized`).
       * `src/server/middleware/auth.ts` (140 lines): Session token authentication (`authenticateToken`, `optionalAuthenticateToken`), role checks (`requireAdmin`), rate limiters (`apiLimiter`, `authLimiter`, `otpLimiter`, `bookingLimiter`, `messageLimiter`, `aiGatekeeperLimiter`).
       * `src/server/services/legacyMarketingEngine.ts` (5,166 lines): Full campaign FSM state transitions, atomic escrow refunds (`processAtomicRefund`), AI gatekeeper preflight diagnostics, Meta/Google Ads sync engines, dynamic pricing listeners, DCO optimization, background worker schedulers.
       * `src/server/routes/crm.router.ts` (981 lines): 21 CRM, WhatsApp messaging, and lead routing endpoints.
       * `src/server/routes/webhooks.router.ts` (1,142 lines): External payment and provider webhooks (Meta, WhatsApp, Razorpay, Stripe), webhook HMAC validation (`verifyMetaWebhook`), Geo-Router checkout.
       * `src/server/routes/listings.router.ts` (4,277 lines): 31 listing, booking, experience, spatial photo upload, and MUX video endpoints.
       * `src/server/routes/operations.router.ts` (1,144 lines): 24 system operations, health probes, admin audit logs, telemetry, and platform inspection endpoints.
       * `src/server/routes/legacyMarketing.router.ts` (3,988 lines): All legacy `/api/marketing/*` and `/api/admin/marketing/*` endpoints.
  2. *Zero-Regression Re-export & Boundary Isolation:*
     - Maintained 100% backward compatibility for all internal and external consumers importing from `server.ts` (e.g. `pool`, `authenticateToken`, `requireAdmin`, `getGlobalIoInstance`, `CampaignState`, `AuthRequest`).
     - Fixed `isolatedModules` TS typing contracts with explicit `export type` syntax.
     - Isolated Express static asset middleware (`createPublicAssetsMiddleware`) inside `startServer()` guarded with `if (!process.env.VERCEL && fs.existsSync(path.join(distPath, 'index.html')))` to decouple build artifacts from headless test harnesses.
- **Verified Suite Quality Matrix:**
  - Working Tree: Clean, committed as `1d08c32` and pushed to `origin/main`.

### CR1-053 — Phase 4 Adversarial Audit, OWASP Fortification & Legacy Marketing Deprecation (27 September 2026)

**Status:** Implementation, adversarial vulnerability mitigation, cryptographic PII protection, input sanitization, and automated test certification certified under FAANG L7/L8 Zero-Trust engineering protocol.
- **Architectural Vulnerability Findings & Remediations:**
  1. *Broken Access Control (IDOR) on Calendar Mutation (`POST /api/listings/:id/calendar`):*
     - Fixed vulnerability where unverified authenticated users could overwrite calendar pricing or insert manual blocks.
     - Added strict host ownership or admin verification (`authCheck.rows[0].user_id !== req.user?.id && req.user?.role !== 'admin'`).
  2. *Privilege Escalation on Listing Draft Approval (`POST /api/admin/listings/draft/:id/approve`):*
     - Fixed critical missing RBAC check on draft approval route.
     - Enforced `requireAdmin` middleware and role check (`req.user?.role === 'admin'`).
  3. *Review Bounds & Anti-Fabrication Safeguards (`POST /api/listings/:id/reviews`):*
     - Enforced numerical bounds (rating integer 1..5) and non-empty content validation.
     - Sanitized review text using `maskContactInfo` to neutralize script tags and HTML injection.
     - Enforced stay completion eligibility check (`status ILIKE 'Completed'`) to prevent fabricated reviews (`INHERITED-009`).
  4. *Input Sanitization & Stored XSS Mitigation (`maskContactInfo`):*
     - Reordered regex parsing in `src/lib/maskUtils.ts` so WhatsApp URIs and URLs are neutralized before phone digit regexes, preventing URL scrambling.
     - Disallowed script/style tag bodies via XSS sanitizer.
     - Sanitized experience reviews and experience lobby messages against external contact leakage and script injection.
  5. *Field-Level PII Encryption at Rest (`POST /api/admin/outreach-leads`):*
     - Fixed plaintext persistence bug in outreach lead creation by encrypting `email` and `phone` via AES-256-CBC (`encryptPII`) before database write, aligning with `PUT` and `GET`.
     - Attached `requireAdmin` to outreach leads and admin thread inspection routes.
     - Attached `apiLimiter` to `/api/leads/soft-exit` to protect against database exhaustion.
  6. *Stage 3 Legacy Marketing Deprecation (RFC 8594):*
     - Attached deprecation middleware to `src/server/routes/legacyMarketing.router.ts` returning standard `Deprecation: true`, `Sunset: Tue, 01 Dec 2026 00:00:00 GMT`, and `Link: </api/marketing/v2>; rel="successor-version"` headers.
- **Verified Suite Quality Matrix:**
  - Dedicated Adversarial Test Suite: `src/test/security/phase4_adversarial_security.test.ts` (**22 passing tests, 100%**).
  - Cross-Sprint Unified Suite: **76 passing tests (100%)**.
  - TypeScript Static Compilation: **0 errors** across client and server (`npm run typecheck`).
  - ESLint Static Analysis: **0 errors, 0 warnings** (`npm run lint`).
