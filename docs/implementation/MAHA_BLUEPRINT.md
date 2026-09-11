# Maha — connected product and engineering blueprint

Updated 2026-09-11. Execution is authorized. This expands the existing Maha plan; it does not replace completed implementation. Constitution governs architecture, MAHA.md records evidence, and RESUME.md identifies the first incomplete task.

## Production certification execution contract

The owner now requires publication readiness, not only local implementation. [MAHA_PRODUCTION_CERTIFICATION.md](MAHA_PRODUCTION_CERTIFICATION.md) is the mandatory release acceptance contract for all six milestones below. It adds evidence gates without renumbering, restarting or marking unfinished tasks complete. Active phase remains Execution; acceptance is performed within each task and the final release milestone.

Each milestone must progress through implementation, local verification, staging verification, release approval and observed production acceptance. A build, unit-test count, disabled implementation or provider mock cannot certify a production capability. Certification here means Encho's evidence-backed internal release acceptance, not independent regulatory, security or provider certification.

First implementation task is MAHA-03D audited resolution and signed recovery; persisted-observation details and current fulfillment revalidation are now locally verified (2026-09-11). MAHA-06A preparation has started with a verified private PostgreSQL runner; full app/browser/staging isolation remains open. Do not defer discovering deployment incompatibility until the end. Full Maha completion requires all six milestone gates and their dependencies, including external integrations. A restricted pilot must be labelled restricted, never reported as complete Maha.

## 1. Product understanding

Encho gives a property owner a hosted property storefront, booking operations and managed demand generation in one workspace. It is not merely a directory. Guests discover trustworthy property information and book; hosts manage property content, inventory, campaigns and inquiries; Admin controls publication, advertising permissions, financial exceptions and operational safety.

Preserve the approved guest ListingDetailsNew/gallery design. Improve its correctness, accessibility and speed without replacing its visual direction. Host/Admin redesign must be coherent across workflows, not a collection of attractive but disconnected panels. “10/10” is the quality ambition, not a measured certification.

India-first INR stays are the launch scope. Experiences, organic social publishing, additional Google formats and custom domains are separate scope. A unified account can act as guest and host. Admin starts as one person; later staff receive explicit, revocable capabilities.

Hosts use Encho-managed Meta and Google accounts, not host OAuth. Routine campaign creation, review, control and reporting belong inside Encho. Provider account verification, billing setup, appeals or permission grants may still require a provider-owned interface; the product must explain those exceptions rather than promise impossible API coverage. Shared master accounts concentrate platform risk and do not prevent platform-wide suspension.

## 2. Required journeys and connected ownership

| Journey | Host responsibility | Admin responsibility | Guest/downstream consequence |
| --- | --- | --- | --- |
| Listing creation/edit | Draft, durable media upload, room setup, preview, submit | Exact-version comparison, approve/reject with notes | Only approved property version becomes public |
| Room inventory | Retain room IDs, configure stock, calendar and external-channel source | Investigate mappings, stale feeds and conflicts | Authoritative quote and dated hold; no invented availability |
| Campaign launch | Choose approved property/version, stay dates, channel, creative, audience and budget | Policy review and explicit permission before dispatch | Ad destination matches approved content and availability |
| Campaign control | Request pause, view actual delivery, request material edits | Audited override and recovery, no funding bypass | No obsolete prices or false availability claims |
| Lead conversion | Prioritized inbox, reply and direct guest to booking | Tenant-safe oversight and delivery investigation | Verified guest identity and protected conversation |
| Financial operations | Transparent funding, fees, usable balance and statements | Reconcile captures/refunds/disputes/provider spend | Correct payment, booking and cancellation state |

## 3. Host and Admin experience architecture

Host navigation: Overview, Properties, Availability, Reservations, Marketing, Inbox, Finance, Settings. Overview prioritizes actionable failures and work due, not fabricated activity. Properties combines published cards with draft/review progress. Availability explains inventory source and freshness. Marketing separates approved, funded, awaiting dispatch, network processing, delivering, paused and failed states. Inbox has genuine unread/intent signals and response status. Finance distinguishes cash received, fees, escrow, authorized spend, network spend and reusable balance.

Admin navigation: Operational overview, Property review, Campaign review, Provider operations, Reservations/recovery, Users/access, Finance, Audit. Queue items expose who owns the next action, exact version, blocking reason, last update and permitted actions. Separate review permission from financial override and provider configuration. Dangerous actions require context, audit and appropriate confirmation; no local UI success before persisted server success.

Design rules: consistent typography/spacing and interaction patterns; usable narrow-screen layouts; keyboard focus and accessible labels; visible loading, empty, stale, offline and failure states; retry without duplicating mutations; reduced-motion support. Budget visualizations show genuine allocated/remaining amounts and fee breakdown, not pressure tactics or invented projections. Charts include freshness and unavailable states. Never guarantee bookings or return on ad spend.

## 4. Architecture and contracts

Retain React/Vite, Express, Socket.IO and Postgres with the existing worker/control-plane architecture. Extract bounded, dependency-injected services from server.ts as needed; no broad rewrite for its own sake. Do not introduce microservices without a demonstrated boundary or scaling need.

- Property publication: version-bound draft snapshot → policy validation → Admin decision → atomic published version and audit. Existing published content stays visible during review.
- Room identity: listings.rooms is canonical. Existing IDs persist; zero stock retires a room. Retain legacy room_types associations during compatibility migration; do not match by name or array position.
- Availability: exact room IDs and half-open local stay dates. Internal reservations and active/unknown-outcome holds reduce stock per night. Calendar blocks and fresh external inventory constrain eligibility. Unknown is a distinct result, not available.
- Campaign proposal: persist an immutable content/version reference, channel, explicit stay-date scope distinct from ad runtime, selected room IDs, assets, targeting and gross/fee/network allocations. Material changes invalidate prior approval. New fields require Host input, Admin inspection, server validation and downstream consumption in the same change.
- AI precheck: rate-limited server-only evaluation with stored model/policy version and explanation. Below-threshold proposals receive actionable corrections; timeout/error goes to explicit human-review-required state, never auto-approval. AI policy checks are risk signals, not proof of provider acceptance.
- Publication eligibility: human approval, policy clearance, verified funding, escrow release, inventory eligibility and provider prerequisites are independent persisted facts. No event name, admin role or optimistic UI bypasses these checks.
- Provider operations: durable operation ID, idempotency, per-stage external IDs, safe paused creation, reconciliation before retries, external read-after-write observation, bounded retry/jitter and dead-letter handling. An accepted API request is not observed delivery.
- Finance: integer minor units; currency-bound accounts; double-entry balance invariants; payment/order/campaign binding; fee recognition recorded separately from collection. New/unverified funding respects escrow. Rejected/unlaunched/unused funds require a transparent policy and dispute workflow; wallet credits must not silently extinguish refund rights.
- CRM: authenticated tenant ownership, verified guest linking, protected PII, contact-safe notifications and explicit delivery adapters. Preserve inquiries until resolved. Intent labels require evidence and must not pretend certainty.
- Reporting: daily rollups and pagination, no fake totals or attribution. Show source, last sync and attribution window. Spend discrepancies remain visible until reconciled.

## 5. Numbered execution milestones

### MAHA-01 — mutation safety foundation

Locally verified: owner/admin calendar authorization, listing locking, atomic calendar writes and audit, truthful client errors. Preserve regression evidence. Real database/role and provider acceptance remain release checks.

### MAHA-02 — Host/Admin property workspace

Locally implemented: review/draft/version workflow; side-by-side comparison; paginated queues; source-currency property cards; guarded deletion; accessible form labels; stable room identity; canonical inventory safety.

Remaining tasks:

1. MAHA-02D: archive/unpublish lifecycle for used properties, guest discovery/detail behavior, pending reservations, campaign stopping and audit. Do not repurpose permanent deletion to silently archive.
2. MAHA-02E: invalidate every affected public cache after approved edits/deletion; check media metadata and normalized fallback compatibility against real schema.
3. MAHA-02F: browser acceptance of draft save/resume, upload errors, narrow-screen form, review conflicts and host/admin action feedback. Complete remaining field validation/accessibility findings rather than claim WCAG from input labels alone.

Exit: Host edit → Admin exact-version approval → guest display is consistent; rejected/stale changes do not publish; archived properties stop accepting new bookings without erasing history.

### MAHA-03 — dated inventory and booking operations

1. MAHA-03A: shared pure internal dated room availability, used by checkout; conservative malformed-history handling. Current implementation slice.
2. MAHA-03B: persist campaign stay-date/room scope, review-bound and separate from ad dates. Build Host input/Admin inspection and a read-only availability projection using shared rules. Unknown or stale external availability cannot permit auto-resume or claim instant-book stock.
3. MAHA-03C: provider-neutral inventory source/mapping contract and isolated connector adapter. Channex is a candidate, not purchased or verified. Collect property-specific channels/PMS. Explicit Encho allotments or request-to-book are fallback modes; iCal is not pooled-inventory real-time synchronization.
4. MAHA-03D: Admin checkout recovery queue, ownership-safe details, provider reconciliation and audited resolution. Unknown create/capture outcomes cannot be blindly retried. Browser abandonment must not lose payment recovery.
5. MAHA-03E: implement the recorded 72-hour cancellation policy with property-local check-in time, immutable policy snapshot, refundable components, signed gateway recovery, refund idempotency and host/admin/guest status projections. Tax and legal acceptance remain separate release requirements.

Exit: last-room contention, overlapping holds, late capture, duplicate events, cancellation/refund and external-staleness tests pass. Checkout stays disabled until full acceptance.

### MAHA-04 — campaign builder and moderation

1. MAHA-04A: connected campaign wizard and truthful preview from approved listing/media/version. Explicit budgets, optimization fee and network allocation; targeting suggestions explain assumptions and permit safe correction.
2. MAHA-04B: AI gatekeeper rate limiting, timeout fallback, resubmission versions and durable reports; no approval from an unavailable AI service.
3. MAHA-04C: Admin queue with reviewer ownership, notes, risk evidence, exact-version decisions and conflict protection; future staff roles enforced server-side.
4. MAHA-04D: material-edit classification, reapproval and price/media change propagation; controlled pause/resume/budget requests with permission checks and complete event history.

Exit: every publication and resume entry point enforces shared eligibility; approval alone cannot clear funds or escrow. Host/Admin state agrees under stale requests and repeated actions.

### MAHA-05 — provider operations, money and CRM

1. MAHA-05A: Meta FB/Instagram identity/permission preflight, durable paused hierarchy creation, activation observation, control/reporting and reconciliation. Validate current official API documentation when implementation begins; existing versions and legacy claims are not assumed current.
2. MAHA-05B: real Google Search hierarchy, ads/assets, control and reporting under a distinct network allocation. Remove the live unsupported-operation gates only after verified implementation and canaries.
3. MAHA-05C: funding geo-router, payment signature/capture binding, idempotency, escrow, fee ledger, disputes and spend reconciliation. Stripe readiness is not yet verified; reported Razorpay readiness is not a successful canary.
4. MAHA-05D: durable availability/content-triggered provider jobs, retries, jitter, dead-letter queue and stale-operation fencing. No financial mutation during auto-pause. Auto-resume requires independently verified eligibility and respects manual pauses.
5. MAHA-05E: genuine lead ingestion, verified inbox identity, delivery adapters, notifications, contact handling and booking/refund attribution. No synthetic people, lead metrics or delivery success.
6. MAHA-05F: media variants and creative experiments only after asset permissions, network constraints, allocation bounds and observation exist. Consent-aware tracking/retargeting is gated separately; no silent cross-platform tracking.

Exit: provider sandbox/canary evidence supports create/control/reconcile/reporting; replay cannot double-spend or duplicate lead delivery; unsupported features remain explicitly unavailable.

### MAHA-06 — release acceptance

1. Provision isolated Node-compatible staging with disposable database, sandbox secrets and worker controls. Do not deploy a static shell in place of the Express backend.
2. Apply reviewed migrations with backup/restore rehearsal and production-schema compatibility checks, least-privilege DB roles and RLS tests.
3. Run guest/host/admin browser journeys, keyboard/screen-reader checks, responsive visual QA and accessibility issue closure.
4. Measure performance: target p75 LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1 on agreed representative journeys/devices; profile real route/database latency before promising sub-200 ms dashboards. These are acceptance targets, not current results.
5. Exercise provider outages, lost callbacks, duplicate webhooks, inventory races, account suspension, refund failures and restart recovery. Verify alert routing, secret rotation, PII handling and audit retention.
6. Rehearse rollback via feature flags and backward-compatible changes; preserve payments, bookings and audit history. Release only the capabilities whose gates pass; obtain any external account/billing/legal approvals that code cannot supply.

Exit: evidence-linked release checklist, known limitations, operational runbooks, restore test and accountable deployment decision. No “industrial-grade complete” declaration based solely on unit tests or a successful build.

## 6. Reset-safe execution protocol

Each bounded task records ID, dependency, files/contracts, status, acceptance evidence and unresolved gates. Status vocabulary: todo, in_progress, implemented, verified_locally, verified_staging, release_approved, verified_production, blocked_external. Local completion is not staging or production acceptance. Release approval permits only the documented rollout scope; verified_production additionally requires post-deployment observation against the certification contract. Record implementation status separately from acceptance status so an external gate does not erase local evidence.

Before a reset/handoff, update RESUME.md with exact next action, changed files, pending process IDs, latest verified test commands/results and external operations with uncertain outcomes. Never store secrets. Inspect pending processes/diffs after resumption. Reconcile provider references and idempotency records before repeating any external write. Do not discard user changes or rerun completed implementation.

When asked “Maha status,” report milestones against this ledger, delivered acceptance evidence, current task and release blockers. Avoid invented percentages or estimating a production rating. Checkpoints survive local conversation resets but are not remote backups or a guarantee of automatic future execution.

Routine scoped implementation proceeds without repeated permission requests. Missing external access, real spend, irreversible data operations or materially new product choices remain explicit operational boundaries; permission does not substitute for safe evidence.
