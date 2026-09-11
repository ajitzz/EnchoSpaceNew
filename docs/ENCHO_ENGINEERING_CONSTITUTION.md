# ENCHO ENGINEERING CONSTITUTION

ADR-MAHA-CAPTURE-CONTRACT (2026-09-11): /verify now uses shared server-only confirmStayCapture within its existing owner-authenticated transaction. Signature/provider read remains outside locks. After listing-before-checkout locking, assertStayCaptureContract revalidates original versus locked identity, dates, quote, provider order and exact integer amounts; persisted quote arithmetic/date span must agree. Fetched payment ID, captured amount/currency and explicit zero refunded amount are required. Malformed/missing evidence fails for reconciliation. Existing confirmed replay verifies its stored booking identity; ready confirmation retains current stock/calendar checks and atomic booking/checkout/audit writes. Recovery states are still deliberately rejected; no Admin resolution or webhook API is authorized by this extraction. New pure and actual PG drift/refund/payment-ID tests pass locally; no schema, provider or production changes. Source finding: the old route checked payment against an unlocked pre-network order, not the final locked contract.

Sites publishing compatibility check (2026-09-11): current Sites skill requires Worker-compatible server output and does not support raw TCP. This checkout has no Sites hosting manifest and its Express/Socket.IO/pg backend is not a drop-in Worker. No static-only shell was published as the full app; no new Site or deployment created. Production hosting requires a compatible backend target or an explicitly designed and accepted runtime adaptation. User was asked asynchronously which existing backend hosting account is available; safe local Maha work continues.

ADR-MAHA-CAPTURE-FULFILLMENT (2026-09-11): source review found verification used stale quote.inventory and omitted later calendar blocks after provider I/O. /verify now reads current canonical listing rooms/currency under its existing lock, validates room identity/source/capacity/stock through lib/stayFulfillment.ts and rechecks dated calendar blocks before availability and insertion. The agreed quote price is preserved. Three actual PG regressions change stock/source/calendar during gateway fetch; all reject confirmation without new booking. This is a locally remediated source finding, not a production incident. No financial recovery transition or schema change; full reconciliation/refunds remain open.

ADR-MAHA-06A-LOCAL-FIXTURE (2026-09-11): opt-in npm run test:maha:postgres now creates private TCP-disabled synthetic clusters and runs only the two isolated suites with a credential-free child environment, JSON test results, source/migration fingerprints and verified shutdown. Corrected runner passed 14 checkout and 23 inventory tests. This is local acceptance infrastructure only; it does not boot the app, provision staging or establish production compatibility. No provider or Neon writes. Details: implementation/MAHA_06A_LOCAL_ACCEPTANCE.md.

ADR-MAHA-03D-DETAIL (2026-09-11): Admin-only default-off GET /api/stay-recovery/:checkoutId exposes allowlisted order, saved observations and audit history from a read-only repeatable-read snapshot. Independent checkout-scoped cursors bound response sizes; historical payment JSON is revalidated/redacted and HTTP caching disabled. Shared recovery queue adds lazy inspection, authentication-reset/abort guards and retry/pagination without financial actions. No schema or property/Guest/Host contract change. Local ordinary suite 276 passed and 11 checkout PostgreSQL tests passed, full frontend/server build exited 0; browser/provider/staging acceptance remains open. Next source-proven prerequisite for RESOLVE: /verify used stale quote stock and skipped new calendar blocks despite locking the listing. Current fulfillment revalidation is being implemented before any new Admin transition. No production incident asserted or live operations performed.

ADR-MAHA-RELEASE-ACCEPTANCE (2026-09-11): the owner requests production-certification-level Maha execution for publishing. implementation/MAHA_PRODUCTION_CERTIFICATION.md now defines mandatory per-milestone staging/production evidence, immutable release-candidate identity, isolation, schema/role/restore checks, browser/security/performance acceptance, bounded provider canaries and controlled rollout with recovery-preserving rollback. This is an internal acceptance contract, not certification achieved or an external compliance claim. Implementation status and release acceptance remain separate; no milestone is promoted by this documentation change. Active phase remains Execution; first implementation task remains MAHA-03D persisted-observation details. Prepare isolated MAHA-06A acceptance infrastructure early without restarting verified work. No source/API/schema/runtime changes, incident closure, production migration or deployment. Historical certification labels below cannot override these gates.

MAHA-03D observation checkpoint (2026-09-11): Admin recovery now supports an independently gated, read-only Razorpay order-payment fetch and durable minimal observations. Exact stored-order binding, safe minor-unit validation, duplicate/partial collection rejection, redacted payment allowlist, listing-before-checkout locking, post-network contract revalidation and immutable observation/audit protect the boundary. No observation authorizes booking, hold release or refund. Provider adapter flag STAY_RECOVERY_PROVIDER_ENABLED remains off. New observation migration passed private PostgreSQL fixture acceptance; all ten checkout tests pass alongside the prior 23 inventory tests. Ordinary suite 267 passed; production/provider/webhook/financial resolution and Admin observation details remain open. No live payment, Neon, provider or deployment changes. See MAHA_03D_CHECKOUT_RECOVERY.md.

MAHA continuation (2026-09-11): Admin authorization history API/UI and server-only provider attestation ingestion are implemented. Identity collection commits authorization reads before network I/O and revalidates under the listing lock afterward; immutable digest evidence and operation-ID replay prevent silently refreshing history. A fixed-origin Channex STAGING room identity reader validates property/room relationships, bounds response/time and rejects redirects. No configured resolver, real credential/request or production adapter exists. Twenty-three PostgreSQL tests passed including concurrent revocation during ingestion; temporary cluster stopped. Provider access/connectivity remains open while independent MAHA-03D advances.

ADR-MAHA-03D-TRIAGE: default-off STAY_RECOVERY_ENABLED gates Admin-only read-only GET /api/stay-recovery and the new Admin Checkout recovery queue. It paginates unresolved/expired attempts, omits customer contacts/quote/secrets, preserves money and inventory states and displays no recovery success claim. UI exposes inspection/refresh only. Five new isolated route/UI tests; real recovery query/provider reconciliation/resolution/refunds remain incomplete. No schema, production data or payment mutation. Active Maha execution continues; completion is not claimed.

MAHA-03C authorization writer DB acceptance (2026-09-11): all four staged inventory migrations and 20 PostgreSQL 18 fixture tests passed. Five added writer tests verify concurrent retry uniqueness, cross-listing property claims, repeat revocation/retained evidence, registry rejection after revoke, ownership/expiry checks and paired retry metadata constraints. This supersedes earlier writer PG-unverified status for fixture behavior only; no production rollout or provider certification. Test-only changes; cluster Wv8mNc stopped and retained. Next: authenticated Admin authorization read/status workflow, then genuine provider-attestation ingestion. Existing feature flags remain off.

ADR-MAHA-03C-GRANT-WRITER (2026-09-11): default-off Admin-only inventory-connections grant/revoke routes record business authorization, not provider evidence. Listing locks bind current ownership and serialize revocation with mapping verification; cross-listing resource advisory locks reject duplicate active authorizations. Explicit bounded expiry, actor/retry-key hash binding and immutable actor/reference/reason records preserve audit and retry safety. New staged grant_idempotency SQL supports nullable legacy metadata, paired new values and unique actor/key. Neither endpoint writes attestations, provider operations or checkout permission. Eight injected regressions pass; new SQL/writer concurrency has not yet been PG-verified. Next: isolated writer acceptance then Admin read workflow/trusted provider ingestion. No flags enabled, production migration or live grants; prior registry fixture validation does not cover this new writer.

MAHA-03C registry DB acceptance (2026-09-11): all three staged inventory migrations passed 15 PostgreSQL 18 fixture tests. New registry coverage verifies identity/owner binding, expiry/future evidence, revocation, ownership transfer, server-only RLS and immutable history/lifetime constraints. This supersedes earlier registry PG-unverified wording only for tested fixture behavior, not production/provider readiness. Fixture corrections addressed UUID/text inference and RLS suppressing rows before delete triggers; production code/SQL unchanged. All temporary clusters are stopped. First incomplete task is trusted authorization/attestation ingestion with shared listing-lock discipline and genuine provider access verification. No grants were created outside synthetic fixtures, no flags enabled and no Neon deployment.

ADR-MAHA-03C-REGISTRY (2026-09-11): lifecycle verifier now receives listingId and calls verifyRegisteredInventoryBinding. Server-only registry lookup requires exact provider connection/property/room, listing/current owner, valid business grant, fresh provider attestation and no revocation; missing schema, ambiguous grants or invalid evidence fail closed. No network/credentials in the listing transaction. New staged registry SQL stores append-only grants/revocations/attestations with server-only RLS; it is unapplied and PG-unverified. No grant or attestation writer/data exists, so this is not a connected provider integration. Future writers must share the listing lock; future observation consumers must revalidate ownership/revocation. Channex PMS versus channel integration direction/access must be settled before provider implementation; API visibility does not attest Encho ownership. Guest/UI contracts unchanged, flags off. First remaining work is registry SQL/time/RLS/ownership-transfer fixture acceptance, then trusted ingestion. Source gap, not a production incident.

MAHA-03C status UI (2026-09-11): Host published properties and Admin Properties share a read-only InventoryMappingStatus panel using the existing authenticated GET. Lazy per-selected-room loading avoids fetching every property's rooms on dashboard mount. Abort/late-response guards, refresh/retry and explicit disabled/signed-out/unavailable/unmapped/mapped-not-synchronized states prevent false freshness or checkout claims. No schema/API/property field or guest eligibility changes. Six new UI tests pass within 228 isolated tests; browser layout/accessibility remains unverified. Next: actual server connection registry and trusted provider binding attestation, then validated observation ingestion; no real verifier is configured or flags enabled.

ADR-MAHA-03C-LIFECYCLE (2026-09-11): new default-off /api/inventory-mappings/:listingId/rooms/:roomId GET/PUT/DELETE uses authenticated owner/Admin reads, Admin-only mutation, canonical room membership and listing-row locks. Immutable mappings/events are separate from the current pointer; version and actor-scoped retry keys protect stale/repeated writes. Replacement/revocation and audit are transactional; provider tuple uniqueness prevents simultaneous reuse. Creation requires external_sync and a trusted server-only transactional binding verifier; none is configured, so creation fails closed even if the flag is enabled. No network I/O belongs inside that verifier. Revocation never deletes historical evidence. The additional lifecycle SQL is staged; both migrations passed nine PostgreSQL fixture tests, not production deployment. Full isolated suite: 222 passed / 16 opt-in PG skipped; build and scoped lint passed. UI status, actual registry/attestation and observation persistence remain open. All responses deny checkout/delivery authorization. Source gap was missing mapping lifecycle, not a production incident. Maha remains in execution; preserve inactive flags.

MAHA-03C database evidence (2026-09-11): the staged external inventory migration passed six real PostgreSQL 18 fixture tests: tenant-scoped mapping/observation reads, owner write denial, server insertion, local bypass reset, append-only history, event uniqueness, references, restrictive deletion, timestamps and bounded array shape. Test fixture includes listings RLS and an unprivileged application role. Both private clusters are stopped; no Neon or production migration. JSON day contents remain validated in externalInventory.ts, not fully by SQL. This supersedes the earlier PostgreSQL-unverified note for fixture behavior only. Production schema/grants and trusted-server bypass assumptions remain release gates. Next first incomplete work is authenticated mapping creation/current selection/revocation and transactional audit; no lifecycle endpoint or real adapter exists yet.

ADR-MAHA-03C-EVIDENCE (2026-09-11): src/server/externalInventory.ts defines a server-only adapter boundary and validates immutable mapping identity plus full dated snapshots. Provider, connection, property, room and mapping revision must all match the server-selected current mapping. Missing/malformed/duplicate/incomplete, future or older-than-five-minute evidence is unknown. Even fresh positive stock returns checkoutAuthorized=false and deliveryAuthorized=false. Provider errors propagate; no adapter is registered or network called. The staged 20260911_external_inventory_evidence.sql migration adds append-only mapping/evidence tables, event uniqueness and owner-read/server-insert RLS; it has not been applied or validated in PostgreSQL. No host-editable verification field, API/UI contract change or existing data reclassification. Source finding: room source declarations lacked a trusted provider evidence model; this is not a production incident. Mapping lifecycle/current revision selection, audited revocation, actual adapter, reservation propagation and DB/RLS acceptance remain incomplete. See implementation/MAHA_03C_EXTERNAL_INVENTORY.md for impact, rollback and acceptance. Active phase remains Maha execution; no launch authorization.

ADR-MAHA-03C-ALLOCATION: canonical room JSON now accepts inventory_source=unknown/encho_allocation/external_sync; missing legacy values remain unknown. Host setup explicitly chooses and preserves the value through preview/uploads/submission. Shared property review and Admin validation reject invented source states; review displays room-source labels, and guest modular room cards explain eligibility. Current stay quote requires encho_allocation, rejecting external/missing declarations with INVENTORY_SOURCE_UNVERIFIED. This is an explicit reviewed host declaration, not independently verified external stock. External synchronization remains unsupported until mappings/freshness/server-owned observations exist. No migration needed for JSON field; no existing records backfilled or reclassified. Checkout stays disabled globally. New room defaults and inventory input permit zero; legacy fixtures used for checkout now explicitly declare test-only allocations.

ADR-MAHA-03B-AVAILABILITY: campaign scope GET/save now returns an additive internal availability projection. After existing campaign/property authorization and locking, inventory reads use a transaction-local server-selected RLS bypass with listing-scoped SQL. Response contains room IDs, aggregate remaining units, unknown reasons and checkedAt—not guest records. Missing staged checkout schema returns unknown; bookings, creating/review holds and unexpired ready holds feed the shared half-open-date evaluator. Calendar booked/blocked status and disabled rooms are unavailable. Host/Admin show saved-scope internal results, timestamp, refresh and unsaved-edit warning. External availability remains unknown and deliveryAuthorized=false for every result. Flags remain disabled; no migration or network action. Actual PostgreSQL/RLS/lock-order and production-scale query verification remain release gates, not established by mocked SQL tests.

ADR-MAHA-CAMPAIGN-EDIT: generic campaign PUT now obtains the campaign row lock before ownership/state checks and performs update, lifecycle transition and audit on that same client transaction. Only unapproved drafts without known provider references may be edited; requested statuses are limited to draft/submission states, not activation. Every accepted edit clears policy/approval artifacts. Campaign video no longer updates published listings outside property review. Audit snapshots exclude meta_capi_token. Source findings were pre-transaction state/approval races, unaudited updates and direct property publication. Existing Host clients receive explicit conflicts for protected campaigns; dedicated provider controls and new-proposal workflow remain the path for live changes. This is not full provider identity coverage or stale draft-editor version protection. No schema change or external writes.

MAHA-03B continuation correction: prior checkpoint incorrectly described build 75271 as passing before server compilation ended. It failed on an implicit-any room callback in campaignStayScope.ts. The array is now explicitly typed; fresh verification is recorded in RESUME.md. Admin stay-scope approval now requires an explicit checkbox acknowledgement of the version fetched by its read-only scope panel. The locked approval route rejects stale/missing acknowledgement before claiming idempotency or changing approval. Scope edits reject known Meta/Google campaign/ad object references and ACTIVE/PAUSED observations even if local status says draft. These safeguards are locally tested; legacy campaign write races and complete provider-identity coverage remain open.

MAHA-03B staged checkpoint: campaignStayScope.ts provides authenticated GET/PUT /api/campaign-stay-scope/:id, gated by CAMPAIGN_STAY_SCOPE_ENABLED=true and configured database. The nullable stay_scope JSONB migration (20260910_campaign_stay_scope.sql) is NOT applied at startup or to Neon in this work. Scope binds exact property room IDs and check-in/exclusive-checkout independently from ad schedule. Only unapproved draft/draft_saved/rejected states may save; scope-version checks, campaign/listing locks and transactional audit protect the write. Scope changes clear policy/approval artifacts. computeCampaignApprovalHash includes non-null stay_scope; null scopes preserve legacy hash shape. Shared Host editor/Admin read-only panel is implemented. External availability remains explicitly unknown. This is staged partial MAHA-03B, not an enabled or complete review/availability workflow.

Evidence: 159 isolated tests passed, 7 opt-in PG tests skipped; frontend/server build, frontend TypeScript and scoped new scope code lint pass. Remaining before enabling: actual migration/RLS/lock-order validation, provider-object edit protection, exact Admin displayed-scope acknowledgement, UI regression tests, read-only dated inventory projection, legacy campaign update race/approval bypass audit, and all publication/activation path eligibility checks. Do not enable the scope flag or automatic resume based on these isolated tests.

Maha detailed blueprint: docs/implementation/MAHA_BLUEPRINT.md now expands product journeys, Host/Admin information architecture, state/financial/provider boundaries, numbered subtasks and reset-safe acceptance. It preserves completed work; Maha remains in execution.

ADR-MAHA-03A: lib/stayAvailability.ts is the shared pure internal dated-room calculation used by stay checkout. Exact dates, stable room IDs, integer inventory and valid half-open reservation intervals are required. Malformed/reversed legacy dates produce INVENTORY_REVIEW instead of silently disappearing; missing legacy room identity conservatively blocks applicable stock. SQL filters/excluded current hold and transaction/RLS boundaries remain in stayCheckout.ts; calendar blocks remain in quote validation. No external freshness attestation or ad auto-resume is introduced. Source finding: prior inline logic truncated arbitrary date strings and ignored reversed reservation ranges. Evidence: 149 isolated tests passed, 7 opt-in PG tests skipped; frontend/server build, frontend TypeScript, scoped lint and diff check passed. Production-schema/date-format reconciliation, campaign stay-date persistence and provider/external inventory acceptance remain open.

MAHA-02C room consistency checkpoint: 136 isolated tests passed, 7 opt-in database tests skipped; production frontend/server build, frontend TypeScript and scoped lint pass. ADR-MAHA-ROOMS: listings.rooms is authoritative for reviewed publication, Admin editing, checkout and the circuit breaker's configured inventory. Admin editing no longer deletes/recreates room_types; existing normalized identities/media references remain for legacy fallback. Under the listing lock, shared identity checks prevent removing existing canonical or legacy room IDs; zero inventory retires a room without erasing history. Host removal controls explain this for known published rooms. No schema migration. Explicit full media replacement remains a separate projection operation, not a guarantee that arbitrary media edits retain every prior association.

Circuit-breaker safety change: lifetime booking counts and SUM(room_types) no longer determine dated availability. Canonical zero inventory permits pause requests; positive, missing or malformed inventory yields is_fully_booked=null and skips automatic controls. Automatic resume is disabled until persisted campaign stay dates, dated bookings/holds/calendar and external availability are integrated. Manual pause sources and financial contracts are not modified by this patch. Committed Admin room edits and review publication invoke the existing best-effort circuit-breaker callback; debounce, durable dispatch/retry and concurrent provider verification remain release work. This is inventory consistency and fail-closed remediation, not completion of date-aware advertising automation.

MAHA-02C deletion checkpoint (2026-09-10): 122 isolated tests pass, 7 opt-in PostgreSQL tests skipped; frontend/server build, frontend TypeScript and scoped deletion lint pass. ADR-MAHA-02C-DELETE: DELETE /api/listings/:id now locks and authorizes the property, rejects linked operational history (including optional staged checkout orders), and deletes only unused properties with listing/room/media snapshots in the same audit transaction. Host/Admin callers retain rejected properties and surface explanations; Admin sends authentication. No schema or production data changes. This is guarded permanent deletion, not an implemented archive/unpublish workflow. Actual database/RLS/concurrent FK behavior and cache invalidation remain release checks. Source finding: the old cascade could erase bookings, conversations, reviews and campaign/lead history; malformed IDs falsely reported success. No production incident or actual deletion is asserted.
**Status:** Active | **Last Updated:** 2026-09-09

Latest Maha evidence (2026-09-10): 112 isolated tests pass, 7 opt-in database tests skipped; production frontend/server build, frontend TypeScript check and scoped changed-code lint pass. Review pagination is locally verified alongside the preserved review/draft and property-card/admin-edit regressions. Full workspace, database/provider integration and production acceptance remain incomplete. Older counts below describe earlier checkpoints.

ADR-MAHA-02C-PAGE: `/api/property-review` accepts an optional positive decimal `before` submission ID, retains authorization on each page and adds nullable `nextCursor` to its existing response. Ordering is now immutable submission ID descending, not last-edited time. A 101-row lookahead returns at most 100 submissions without total-count queries or schema changes. Shared Host/Admin UI loads older pages, deduplicates IDs, preserves loaded content on errors and refreshes from the first page. This is a changing queue, not snapshot isolation. Source finding: the old fixed limit made older submissions unreachable. Eight added isolated regressions cover API predicates/validation and UI retry/refresh; real database query plans and browser accessibility remain release checks.

ADR-MAHA-02C / source finding: admin property edits previously committed listing and projection writes separately without transactional audit. The extracted admin-only handler now locks the listing, updates only supplied allowlisted fields, writes supplied room/media projections and full before/after audit in one transaction. Projection/audit failures roll back. Post-commit provider work is best-effort, not durable delivery; responses explicitly report synchronization as unverified. Host property cards preserve source currency, show neutral missing media and retain cards on failed deletion. HostForm adds accessible field names, current-step semantics and busy-state editing protection. No schema change. Legacy deletion, review pagination, room projection compatibility and browser acceptance remain incomplete within MAHA-02; do not infer production readiness from unit tests.

### Current owner steering — 2026-09-10

The owner requested boardroom clarification before executing the expanded Host/Admin redesign. Start continuation at [RESUME.md](implementation/RESUME.md), which records the first incomplete task, confirmed decisions and reset protocol. Preserve the implementation below; historical milestone ratings are not production acceptance evidence.

The owner subsequently authorized **Maha** execution. [MAHA.md](implementation/MAHA.md) is the named execution ledger. MAHA-01 repairs the existing calendar mutation boundary: owner/admin authorization under a listing lock, bounded input validation, transactional batch and audit, followed by post-commit circuit-breaker invocation. No schema change. Stay quotes treat both blocked and manually booked calendar dates as unavailable. External calendar connectivity is still unimplemented.

ADR-MAHA-01: preserve the calendar API/schema while enforcing authorization and atomic writes; host consumers surface server failures. Finding MAHA-01 (source review, no production incident claimed): authenticated callers could mutate other listings and partial batches could commit without audit. Local regression evidence is tracked in MAHA.md; real database and provider synchronization remain release gates.

### Maha property review architecture — staged local implementation

`src/server/propertyReview.ts` serves authenticated `/api/property-review` submission/status and `/:id/decision` operations using existing `listings_drafts` and `admin_audit_logs`. Private DRAFT records can be resumed with an owner-bound draft ID and version. Only validated submissions enter PENDING_REVIEW. Host-scoped transaction locks, request keys and version comparisons protect duplicate saves and stale editors; submitted content cannot be overwritten via the legacy draft route. Admin-only exact-version approval publishes an allowlisted snapshot and its media projection atomically with the audit record. Linked edits also verify the original published version before replacement. Rejections require notes visible to the host. Audit entries retain draft versions and snapshots on save/submit.

ADR-MAHA-02: retain the existing listing schema and guest JSON contract; introduce the reviewed draft workflow instead of direct host publication. HostForm saves drafts/submits, host Properties shows progress and resumes drafts, and Admin has a Property review queue. Automatic startup draft promotion was removed; legacy host direct create/update and legacy unversioned draft approval cannot publish. Admin direct listing editing now uses the MAHA-02C transaction described above. Normalized room_types compatibility and live provider pricing/content propagation remain release gates; the new publisher uses canonical listings.rooms and synchronizes media_assets.

Finding MAHA-02 (source inspection, no production incident asserted): direct host publication, unguarded draft approval and startup auto-promotion bypassed review; form defaults and map initialization could invent property content. Local remediation removes these paths/defaults, preserves supplied media metadata, rejects unresolved photo uploads and keeps initial map positioning from modifying saved addresses. Remaining browser, database and provider acceptance is tracked in MAHA.md. Maha remains in execution; this is not production certification.

### Current implementation and verification boundary — 2026-09-09

The connected platform transformation is in execution. The owner's latest instruction authorizes continuation across all six milestones, superseding the earlier response cadence. Milestone 1 is locally validated; milestones 2–6 have further implementation/verification but remain incomplete. See the [implementation ledger](implementation/PLATFORM_TRANSFORMATION.md) and [release gates](implementation/PLATFORM_RELEASE_GATES.md). Historical “Certified Green” entries below are not a current end-to-end certification.

Moderation, verified funding, escrow release, publication acceptance, and observed delivery are separate facts. Admin approval must never write payment or escrow clearance. Shared `lib/campaignReadiness.ts` requires persisted approval, policy clearance, a paid payment reference, and released escrow before the guarded publication paths proceed. An event name or admin role cannot override these requirements. API acceptance alone is not live delivery: the orchestration path requires a recent external ACTIVE observation before advancing to CAMPAIGN_LIVE. Funds Released is a financial label, not a delivery claim.

The approval route retains locking, idempotency and auditing, with additive readiness information. Verified payment processing no longer sets a campaign active directly and propagates failures for retry. No schema change or production data repair was performed. Legacy records and every provider entry point still require release-stage verification.

Missing demographic/placement/geographic data and booking attribution must be shown as unavailable, not synthesized. The campaign inquiries endpoint returns persisted host-owned records. Google provider hierarchy simulation is restricted to explicit non-production sandbox/test mode; live hierarchy creation fails closed until implemented. Arbitrary API POSTs, booking and financial mutations must not be queued for offline replay; the application queue permits only scoped wishlist operations and its existing custom upload path.

Validation: 59 ordinary isolated tests pass. Seven additional tests passed against a private temporary PostgreSQL 18 fixture database, including concurrency, migration and RLS checks. Full TypeScript checking, production build and scoped new-code lint pass. Real gateway/provider operations, production-schema compatibility, browser/role E2E, measured runtime performance and deployment remain unverified.

### Stay checkout architecture — staged, disabled by default

`src/server/stayCheckout.ts` exposes authenticated `/api/stays/quote`, `/orders` and `/verify`. `lib/stayQuote.ts` is the integer-minor-unit quote contract. Prices come from exact existing room IDs and configured payment settings; zero fees/inventory are never replaced by positive defaults. Arrival/departure are validated and checkout is exclusive. Rooms with missing capacity/inventory, unsupported currency or unhandled calendar-specific rates fail explicitly. This is presently an INR-only adapter, not legal/tax validation.

`stay_checkout_orders` persists request-bound per-user idempotency, the quote snapshot, a date-scoped hold and provider/payment/booking references. Listing-row locking serializes availability writers. Gateway creation occurs after the hold commits. Unknown outcomes stay in `review` and are never automatically recreated. Only a matching captured payment plus valid HMAC can create a confirmed booking. Guest-facing confirmation uses the stored booking ID; no generated access credentials. Terminal reservation states cannot be reopened through host controls.

The migration is `docs/migrations/20260909_stay_checkout.sql`; it was applied only to an isolated test cluster. It is not part of automatic server boot. `STAY_CHECKOUT_ENABLED` defaults off until schema compatibility, account configuration, payment recovery/refunds, calendar pricing and release gates are complete. Legacy direct booking and checkout routes return `410 SECURE_CHECKOUT_REQUIRED`; production rollout must treat this as a coordinated maintenance/change, not silently deploy an unavailable checkout.

Notification delivery requires an explicit adapter; missing configuration retains the outbox without claiming delivery. Ad leads cannot be attached to arbitrary guest accounts. Google live controls/reporting that lack network implementation report unavailable instead of local synthetic success. These safeguards are not completion of the Google/CRM milestones. Hardcoded Meta-token fallbacks were removed; credential rotation and stable PII key management remain release requirements.

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
- **Advertising Engine:** Optional marketing campaigns are billed separately as actual media spend plus a 15% AI optimization/management fee plus applicable statutory taxes.
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

### Automatic Activation Policy (Policy B Specification)
ENCHO strictly enforces **Policy B**:
1. **Safe Creation**: Campaign and AdSet objects are created on Meta in the `PAUSED` state to prevent accidental live-firing before escrow clearance, preflight verification, and admin approval.
2. **Explicit Activation Operation (`activateMetaCampaign`)**: Once approved and escrow-released, an explicit, idempotent, audited, read-after-write verified activation operation is executed.
3. **Hierarchy Verification**: The activation engine issues `POST status=ACTIVE` to both Campaign and AdSet, and verifies via read-after-write GET that `effective_status === 'ACTIVE'` before marking the campaign as `LIVE`.
4. **Financial Safety**: Activation controls delivery status only and never alters financial parameters (`gross_host_charge`, `encho_fee_amount`, `escrow`, `meta_authorized_spend`).

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
| FINDING-2026-09-09-01 | 2026-09-09 | Source inspection found admin moderation could clear funding and trigger publication. No production incident or correlation ID established. | Approval wrote financial state; orchestration trusted the trigger name. | `server.ts`, `lib/campaignReadiness.ts`, host/admin campaign views | Separate moderation from money, guard publication with persisted readiness, distinguish observed delivery, retain audit/idempotency. | Locally remediated with isolated regression tests; production verification pending |
| FINDING-2026-09-09-02 | 2026-09-09 | Source review found mismatched guest totals, fabricated payment success and IDs, lifetime inventory deduction and unrelated guest assignment for leads. No production incident asserted. | Checkout lacked durable identity/order/date binding; reporting and CRM substituted synthetic success for missing integrations. | Stay quote/router/migration, guest/host/admin consumers, provider/CRM guards | Authenticated quote/order/capture contract, dated locked holds, persisted confirmation, explicit unsupported integrations, preserved zero inventory and terminal-state guards | Staged implementation and isolated tests; deployment, recovery/refunds and live integrations incomplete |

---

## 14. Architecture Decision Record (ADR)

| Decision # | Date | Problem | Chosen Solution | Reason | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ADR-001 | 2026-08-07 | Unclear Meta API failures | Implemented strict Correlation ID tracing | Need exact forensic evidence of API failure | Active |
| ADR-002 | 2026-08-07 | Master Ad Account Risk | Single Encho Ad Account with AI Gatekeeper | Host API keys are too volatile; protects ENCHO platform | Active |
| ADR-2026-09-09-01 | 2026-09-09 | Moderation, funding and delivery conflated across views and orchestration | Shared readiness contract; moderation-only approval; fail-closed live Google creation; unavailable rather than invented reporting; restrict offline replay | Prevent approval from authorizing unverified money or presenting unobserved success; retain existing architecture and schema | Implemented locally; release verification pending |
| ADR-2026-09-09-02 | 2026-09-09 | Client-priced/unbound stay payments and non-date-scoped inventory | Dependency-injected authenticated checkout router, immutable quote snapshots, durable idempotency and per-listing transaction locks; explicit opt-in migration rollout | Establish payment/guest/room/date integrity without touching production data or inventing provider success | Staged, disabled pending release gates |

---

## 15. Definition of Done (Meta Publishing Engine)

The Meta Publishing Engine is NOT complete until:
- [ ] End-to-end approval, verified payment, independent escrow release and provider observation verified together in an isolated production-like environment.
- [ ] Every publication/control entry point audited against the shared readiness boundary.
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

**Current execution update (2026-09-09):** connected transformation milestones 2–6 are in progress. Local checkout and safety verification is recorded above; full release is not approved. Earlier phase descriptions below are historical context. The active remaining work is the [release gate ledger](implementation/PLATFORM_RELEASE_GATES.md).

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
| ADR-005 | 2026-08-14 | Split UI Divergence & State Drift | Dual-Projection Canonical Truth Engine | Serves single source of truth to both Host Transparency View and Admin Ops Command Center with role-scoped projections. | Active |
| ADR-006 | 2026-08-15 | Financial Risk & External Budget Over-spend | `campaign_financial_contracts` with DB Invariant Constraints | Enforces hard DB and runtime boundary: `gross_host_charge = encho_fee + meta_authorized_spend` & `configured_max <= authorized_spend`. Blocks external Meta over-spend. | Active |
