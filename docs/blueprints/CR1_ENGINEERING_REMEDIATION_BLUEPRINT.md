# CR1 engineering remediation blueprint

**Version:** 1.0 · 28 September 2026  
**Purpose:** repair the audited release, preserve working foundations and establish defensible CR1 acceptance.  
**Authority:** founder request for detailed engineering guidance following CR1-045. This document specifies future work; it does not claim that repairs, deployment, professional approval or release certification have occurred.

## 1. Executive direction

Encho needs one reliable three-sided operating platform: truthful guest discovery and booking, offer-led host advertising and communication, and scoped staff operations. The objective is to complete these connected journeys with sound financial, identity and provider boundaries.

Do not optimize for a “10/10” label. L7/L8 is not a product certification. Optimize for the acceptance criteria in this blueprint and §18 of the controlling CR1 blueprint. An honest blocked gate is better engineering than an invented clearance.

The audited release was judged approximately 4/10 because integration and verification did not support its claims. That judgment is not a measured completion percentage. Existing sound modules must be retained.

### Deliverable set and precedence

1. Founder’s explicit current decisions and the Engineering Constitution govern authority.
2. [Original CR1 blueprint](ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md) governs CR1 product scope and Definition of Done.
3. [CR1 execution plan](../implementation/CR1_EXECUTION_PLAN.md) remains the historical 48-package ledger.
4. [Independent quality audit](../audits/CR1_ENGINEERING_QUALITY_AUDIT_2026_09_28.md) supplies findings A01–A15 and verification limits.
5. This document is the corrective architectural addendum.
6. [Corrective work packages](../implementation/CR1_REMEDIATION_WORK_PACKAGES.md) supply 32 work cards and CR1 traceability.
7. [Engineer and reviewer prompts](../implementation/CR1_ENGINEER_AND_REVIEWER_PROMPTS.md) supply copy-ready implementation and independent-review instructions.

Do not renumber the original 48 packages or erase accepted historical evidence. Reaccept each package only against its current implementation and actual required evidence. The 32 corrective cards are coordination units, not a substitute CR1 completion metric.

## 2. Evidence baseline and change boundary

The audit inspected HEAD 0e4c6fec2fe86f1b793760c5f7a3daf08bbf7508 plus 66 pre-existing staged changes. Those changes included removals of migrations 041–046, extracted modules, UI, tests and a worker. server.ts was 19,180 lines.

Audit receipt: 97 passing and 2 failing targeted tests across 8 files; client/server TypeScript and scoped lint passed; route inventory failed. No full current release sweep, remote role inspection, deployed browser, authenticated provider canary or live payment was verified.

Re-read git status, current sources, manifests and the audit receipt before editing. Later source may differ. A finding fixed by intervening work requires proof, not duplicate implementation.

### Additional source observations made while preparing this guide

These are source findings, not executed production incidents:

- src/server/operations/sessionRuntime.ts has its own owner-enabled fallback chain, advertising/general OAuth audience fallbacks and a default organization UUID. Fixing staffSessionIssuer alone would leave related configuration defects.
- StaffSessionIssuer.complete conditionally binds users.google_id/email_verified by email when its connection has UPDATE privileges. Session issuance must not acquire separate identity-enrollment authority.
- scripts/deployment/run-staging-deployment.mjs can generate a certified receipt when no database client was supplied.
- scripts/deployment/provider-canary-runner.mjs converts missing spend to zero and assumes universal Meta HOUSING. Missing evidence must remain unknown; policy category belongs to an approved capability.
- src/server/conversations/router.ts returns zero unread counts when readiness is unavailable. Unknown must not masquerade as zero.
- The participant notification router exists, but inspected composition did not establish its mounting. Require route reachability proof.
- Canonical IAM SQL writers do not all use the admin service’s hash-chain format. Audit-stream repair must cover every writer and preserve historical records.

## 3. Non-negotiable target invariants

| ID | Invariant | Proof required |
|---|---|---|
| I01 | Every production claim identifies authentic evidence and exact subject | Invalid/missing/fixture/stale evidence cannot authorize promotion |
| I02 | Customer and workforce identity boundaries remain separate | Consumer admin cannot create workforce authority as a side effect |
| I03 | Runtime roles cannot bypass tenant boundaries | Actual LOGIN tests, inherited privilege checks and hostile RLS cases |
| I04 | Command identity survives restart and concurrent workers | Database uniqueness, semantic fingerprint, durable status and fencing |
| I05 | Financial authority is exact and immutable | Accepted policy/quote, capture matching, balanced journal and reconciled corrections |
| I06 | Accepted guest offer and campaign facts agree | One immutable room/rate/conditions source used across all surfaces |
| I07 | Provider uncertainty never becomes blind retry or invented success | Authenticated readback and explicit reconciliation |
| I08 | Unavailable metrics/counts remain unavailable | Source/window/freshness/error semantics tested in UI and API |
| I09 | Private commands do not survive logout as another actor’s intent | Real service-worker/IndexedDB/account-switch tests |
| I10 | Staff content access and protected actions are scoped and attributable | Assignment, consent, fresh permission, exact step-up and immutable receipts |
| I11 | Review covers exact immutable bytes and revision | Changed facts/media/program invalidate material approvals |
| I12 | Migration and rollback preserve history and obligations | Exact checksums, additive compatibility, actual-role readiness and rehearsed recovery |

One violation of a critical invariant prevents the relevant release gate. Passing many unrelated tests cannot average it away.

## 4. Architecture to preserve and complete

Keep the modular monolith, PostgreSQL authority, dedicated worker and existing public/private build separation. Do not introduce microservices, another financial ledger, a second queue framework or a new CRM authority without a measured need and reviewed ADR.

~~~mermaid
flowchart TD
  Guest[Guest discovery and trip] --> API[Canonical application services]
  Host[Host offers campaigns and inbox] --> API
  Staff[Scoped Operations desks] --> IAM[Session policy factor and checker]
  IAM --> API
  API --> DB[(PostgreSQL authority and RLS)]
  API --> OUT[Transactional outbox]
  OUT --> Worker[Fenced workers with fresh authorization]
  Worker --> Provider[Versioned provider and payment adapters]
  Provider --> Obs[Authenticated observations and reconciliation]
  Obs --> DB
  DB --> Proj[Privacy-scoped projections]
  Proj --> Guest
  Proj --> Host
  Proj --> Staff
~~~

### Canonical implementation boundaries

| Area | Existing authority to reuse | Required extension |
|---|---|---|
| Marketing finance | src/lib/marketing/financeService.ts, financeQuote.ts, settlementService.ts | Accepted incremental funding and approved cost/tax/variance policy |
| Durable work | src/lib/platform/durableOutbox.ts | Adopt across new domain commands; no Map-only authority |
| Identity | src/lib/iam and src/server/operations | Explicit issuer/runtime configuration and canonical UI transport |
| Messaging | src/lib/conversations and src/server/conversations | Integrated receipts, service assignment, disclosed replies and grounded assist |
| Offer evidence | src/lib/offers/canonicalRoomReader.ts, evidence.ts, releasedTierResolver.ts | Accepted sellable offer/rate/conditions authority, not observation relabeling |
| Campaign/provider | src/lib/marketing/workflow.ts, engine.ts, adtech and provider adapters | Exact offer/creative/program/account binding and supported expert controls |
| Migration | src/migrations/execution.ts and deployment readiness modules | One checksum/history/catalog validation contract |
| Client persistence | lib/syncService.ts | Explicit domain allowlist and service-worker lifecycle cleanup |
| Legacy containment | src/server/marketing/legacyBoundary.ts | Caller migration and retirement evidence; no revival of unsafe mutations |

Classes under compliance or other directories do not become canonical merely because a test imports them. Every retained engine needs a traced UI/API/worker-to-database path or an explicit fixture-only classification.

## 5. Engineer, reviewer and operator responsibilities

| Role | Owns | Must not do |
|---|---|---|
| Implementation assistant | Small coherent code changes, local tests, evidence capture and handoff | Self-certify external approvals or edit tests simply to hide a regression |
| Senior reviewer assistant | Threat model, contract coherence, independent diff/source review, challenge tests and acceptance recommendation | Accept a narrative/test count without examining the actual artifact |
| Release/integration owner | Shared-file integration, dependency sequencing, evidence validation, artifact identity and promotion | Merge incompatible parallel work or use an old passing receipt for changed code |
| Product/founder | Commercial tradeoffs, rollout cohort, loss/spend limits, staff operating rules | Substitute approval for provider/legal facts |
| Professional/provider/operations authority | Written policy approval, actual account/environment evidence and staffed readiness | Be impersonated by an AI-authored document or identifier |

A second assistant’s review improves engineering scrutiny; it is not legal, provider or organizational approval. Security-critical acceptance requires an independently reviewed change and appropriate actual execution evidence.

### Work protocol

1. Read the exact active card and dependencies; inspect current code and failure evidence.
2. Write a short impact note: invariant, source of truth, affected routes/tables/UI, compatibility, risks, tests and rollback.
3. Preserve existing user changes. Do not reset, force-push, bulk-stage or restore deleted modules blindly.
4. Implement additively using narrow services, Zod trust boundaries and held-client transactions.
5. Run one or two targeted suites during iteration; add new adversarial cases where required.
6. Hand off the exact diff/artifact and evidence to the reviewer.
7. Reviewer either records concrete rejection criteria or accepts the specific evidence level.
8. Update the corrective ledger, original CR1 package evidence, HARVO and ADR together.
9. Continue independent unblocked work. Routine steps do not require founder micro-approval.
10. If external input is genuinely required, identify the exact gate and missing evidence; do not simulate it or stall unrelated local work.

Parallelize disjoint service/test areas after contracts are agreed. One integration owner controls shared migration allocation, server.ts composition, package manifests and acceptance ledgers.

## 6. Identity, workforce and audit contracts

### 6.1 Configuration and runtime authority

Explicit workforce issuer URL, runtime URL, environment, organization, origin and OAuth audience are required. Do not infer them from advertising OAuth clients, generic DATABASE_URL, arbitrary allowlists or a fixed organization identifier.

Production/staging remote database connections validate certificate chain and hostname. LOCAL behavior is an explicitly selected environment, not “anything outside tests.” Distinct roles may share a database but not a broad owner credential.

Issuer access is limited to narrow reviewed identity helpers. Normal login cannot bootstrap owners, grant roles or opportunistically update consumer identity by email. Reviewed invitation and subject-binding operations own those changes.

Verify actual LOGIN roles, not just SET ROLE or catalog flags under a superuser session. Assess role inheritance/SET ROLE capability, schema creation, table/column access, security-definer ownership/search_path and grants. FORCE RLS is useful but does not make privileged roles harmless; PostgreSQL explicitly documents superuser/BYPASSRLS and owner behavior. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

### 6.2 Canonical command flow

Trusted staff session → current permission/scope/environment → command fingerprint/version → step-up bound to exact action → independent checker where policy requires → same-transaction authorization consumption + domain change + audit/outbox → execution-time reauthorization.

Existing ownerBootstrap, workforceInvitations, workforceLifecycle, workforceReview, privilegedActions and factor services supply the foundation. The newer /api/admin/workforce UI must adapt to those contracts; general consumer admin status is not a substitute.

RESUME, quota edits and department/global freezes need explicit supported command contracts. Where no canonical contract exists, the UI must explain unavailability; do not silently fall back to direct SQL.

### 6.3 Audit evidence

Define a versioned canonical envelope covering organization/environment, event ID/order, actor/session, command/policy version, resource, evidence digest, correlation/causation and time.

Serialize append-head allocation per audit scope in the domain transaction, or use an equivalently justified event-stream design. Include SQL and application writers. Existing null-hash/legacy events retain their original meaning; do not rewrite immutable history to manufacture a continuous chain.

Use explicit legacy coverage boundaries/checkpoints. Sequence gaps caused by rolled-back sequence allocation are not automatically tampering. An independently protected export/anchor is required for stronger privileged-administrator tamper detection claims. Call a linear hash chain a hash chain.

## 7. Durable commands, money and uncertainty

### 7.1 Minimum logical command contract

Reuse existing fields/services where equivalent; the names below are design requirements, not a new universal table mandate.

| Field | Required meaning |
|---|---|
| commandId / operationId | Stable server identity returned on acceptance |
| idempotency scope | Organization/tenant + domain/operation + key |
| request fingerprint | Canonical validated semantic payload, resource/revision and currency where relevant |
| principal reference | Actor/session/policy evidence; never a persisted bearer token |
| expectedVersion | Optimistic version of the mutable aggregate |
| status | Accepted, executing, completed, rejected or outcome unknown using canonical domain states |
| lease/fence | Durable worker generation and lease authority |
| result/evidence | Stable replay result and exact observation references |
| outbox | Same-transaction intent to perform external work |

Same scope/key + same semantic payload returns the same result. Same key + changed payload produces a conflict. Keys do not authorize access; every replay is scoped to the current permitted actor/resource.

Do not promise universal exactly-once external effects. Use at-least-once delivery plus durable idempotency and reconciliation. If a provider succeeds but the acknowledgement is lost, reconcile the existing remote operation before creating another.

### 7.2 Financial rules

- Quote and settle in integer minor units with currency, policy version and approved rounding.
- Read price and cost authority server-side; do not accept client amount as proof of cost or payment.
- A top-up is an accepted incremental contract and funding/reservation event, not UPDATE budget = budget + amount.
- Payment rail is an allowlisted server decision. Changing paymentMethod cannot bypass funding.
- Bind verified capture to exact order/quote/account/amount/currency; unique provider event/payment IDs prevent reuse.
- Keep ledger journal, reservation and domain transition atomic. External provider calls happen through durable commands, not within long database locks.
- Overrun, refund, chargeback and partial capture follow approved policies. No silent host debt, cross-host transfer or trapped-wallet conversion.
- On ambiguous COMMIT or external outcome, expose pending reconciliation. A generic retry button cannot clear accounting history.

## 8. Canonical offers and guest commerce

A selected room, rate plan and conditions—not the resort’s lowest advertised price—define a sellable offer.

### Immutable offer evidence

Owned listing/room IDs; rate-plan/version; currency/minor-unit price basis; occupancy and capacity; validity/availability scope; verified amenities and claims; media references; cancellation/tax/fee policy versions; materiality hash; provenance and effective time.

A room observation remains an observation. An offer snapshot remains different from a timed quote; a quote remains different from an inventory hold; a hold remains different from captured/confirmed booking.

### Guest transaction contract

1. Guest submits room/offer, dates and occupancy.
2. Server resolves canonical rate/conditions and generates expiring quote.
3. Atomic hold checks authoritative capacity under concurrency.
4. Payment order binds quote/hold and an idempotent intent.
5. Authenticated gateway event records durable receipt and matching capture.
6. Booking confirmation consumes the correct hold and records financial obligations atomically.
7. Late capture after hold expiry enters recovery/refund or explicit re-accommodation policy; never auto-confirm unavailable inventory.
8. Trip management, cancellation and refunds reference immutable booking policy and verified gateway/journal receipts.
9. Review eligibility derives from the controlling guest decision register and canonical stay fulfillment—not possession of a booking ID. Reject foreign-user, duplicate and ineligible cancelled/non-fulfilled submissions; explicitly test the approved refund/cancellation exceptions.

A new price after acceptance does not rewrite history. Material changes produce new versions and reacceptance or safety pause as appropriate.

Approved tax/commission/cancellation/refund policy is required for executable paid commerce. Engineering can build adapters and synthetic policy fixtures locally while that evidence is missing; production activation stays blocked. Do not use identifier formatting or fixed rates as professional approval.

All new property/room/media fields require Guest display, Host creation/edit and Admin moderation coverage.

## 9. Creative, strategy and provider execution

### Host control versus staff authority

| Host may select within released bounds | Staff/program owns |
|---|---|
| Owned room offer or explicitly labeled property-discovery subject | Provider account, eligibility and policy category |
| Approved/new-to-review image, carousel or video | Optimization, bidding, conversion configuration and supported attribution |
| Guest-fit intent such as couples/family/workation | Translation of intent into policy-supported provider targeting |
| Feeder preferences and allowed radius adjustments | Provider resolution, exclusion rules, exposure caps and exceptions |
| Dates and accepted budget | Review, risk release, paused creation, readback and activation |

Guest-fit intent is a product label, not proof of a person’s relationship status or permission to expose every native targeting field. A released capability controls executable age/demographic options. Explain unsupported choices.

### Creative package authority

Record asset ownership/rights, listing/offer scope, original digest, scan results, rendition lineage, dimensions/duration, transcript/OCR where applicable, verified claims and review of exact immutable bytes. Upload from outside a listing is permitted only through this authority. It does not automatically publish to the guest gallery.

Restrict MIME/size/decompression, remote URL fetching and signed asset delivery. Missing rights, rejected content, expired review or changed hashes block publication. Organic posting to Encho brand accounts is separately entitled and reviewed.

Organic distribution and paid pooled destination execution remain unavailable/deferred under their existing gates. This corrective release does not unlock either product. Regression tests must prove that unavailable pooled checkout cannot collect contributions or activate pooled spend.

### Program and corridor authority

Compose economics tier, destination/feeder evidence, guest intent, objective, inventory and creative independently. Pin the exact released program/profile/corridor/account-capability version to the campaign revision before review.

Churam/Adivaram/Thusharagiri-style local cases require canonical destination resolution and the smallest approved provider-expressible suppression. Do not substitute a nationwide fallback, invent geographic IDs, or impose an unsupported universal district exclusion.

AI proposes grounded configuration and explains assumptions. Deterministic validation and scoped human review supply authority. AI cannot approve itself or fabricate account/geographic/provider facts.

Preflight evaluates canonical facts, inventory, creative eligibility, economics assumptions, account/program policy and aggregate portfolio exposure. Preserve the approved shadow/advisory boundary for keyword/geographic overlap. Concurrent flights sharing an offer, dates, keywords or feeder region must be visible to authorized operators; overlap and budget-fragmentation warnings do not acquire automatic consolidation, funding-blocking or traffic-allocation authority. Approved hard financial exposure caps remain authoritative and must block unauthorized funding/activation independently of advisory overlap analysis.

### Paused create/readback/activation

Compare provider/account/API capability, campaign revision, child hierarchy, immutable assets, bidding/budget semantics, conversion/attribution settings, geography/suppression and schedules using capability-specific normalization.

Missing data stays unknown. Zero budget, zero spend and no reported impressions are different facts. A paused canary must use valid provider settings and genuine observation evidence. No source-generated HTTP status closes the gate.

Activation is a separately authorized exact-revision command. Unknown writes enter reconciliation; partially created resources remain paused/quarantined. Risk/account restrictions do not authorize evasive failover or duplicate serving.

Canonical inventory and material offer-change events must produce durable campaign-protection work. Sold-out dates, host blocks or invalidated advertised price/conditions trigger the approved safety response for affected revisions. Record requested versus observed pause, account for spend through confirmation and escalate delayed/failed pauses. A reopened calendar or cancelled booking does not silently resume ads: revalidate inventory, accepted facts, funding, account eligibility and exact revision first.

## 10. CRM, notifications and AI assistance

The canonical message transaction persists ordered content plus notification intent. Socket delivery is a hint; it cannot be the only durable mechanism.

Distinguish saved, queued, provider-accepted, delivered, failed and read states. A delivery receipt does not prove the recipient read the message. Read cursors advance through explicit authenticated commands.

Unavailable unread counts return typed unavailability; they do not become zero. Notification preference and evidence routes must be demonstrably mounted, owned and authorized.

Staff access requires current scope, assignment, consent/disclosure where required and committed content-access evidence. Internal notes must not leak into guest messages. Staff replies identify Encho assistance; no host impersonation.

AI drafts/translation use source facts, preserve original text, record model/prompt/source versions and require confirmation. Evaluate prompt injection, invented availability/prices, contact data and unsupported refund promises. Timeouts route to manual work, not fabricated output.

Notification channels require consent and approved adapters. Alert previews do not contain guest private content. Tests use sinks/sandbox destinations, never real customer messaging.

Apply the approved privacy lifecycle to messages, AI context, attachments, exports and channel receipts. Consent withdrawal must be rechecked before dispatch/retry, not just at enqueue. Erasure/export requests require scoped identity and retention-policy handling; use documented redaction/tombstones where retention obligations require financial or audit evidence to remain. Do not invent retention periods or treat deletion of the UI row as completed erasure.

## 11. UI and experience acceptance

The target is an understandable premium operating product, not an animated demonstration.

- Guest: truthful room/price/date context, accessible gallery, trustworthy quote/confirmation and own-trip management.
- Host: property/offer choice, intent/creative/date/budget and optional bounded feeder controls; no mandatory expert ad configuration.
- Staff: My Work, Strategy, Creative, Flight, Provider, Finance, Service and Audit views limited by permission.
- Every disabled action explains unmet prerequisites and the responsible next action.
- Every command reports queued/observed/failed/unknown truth. Never label requested activation as confirmed delivery.
- Budget meter separates authorized, reserved, observed spend, pending reconciliation and refundable amounts.
- Four simultaneous campaigns retain independent state, provider, offer, schedule, budget, reporting window and freshness.
- Property booking totals deduplicate canonical bookings; disclose multi-touch attribution without summing credit into extra bookings.
- Keep visits, inquiries, provider-reported conversions, verified captured bookings and fulfilled stays distinct. Opaque attribution tokens validate the integrity and scope of referenced attribution metadata; they do not prove a human visit, consent, booking or purchase. Any approved conversion export must bind consent and canonical events, use a stable event UUID for browser/server deduplication, and reject forged/expired tokens or synthetic/redirect-only purchase claims.
- Unavailable/delayed/zero metrics are visually distinct. Preserve last valid observations with stale labels.
- Layouts at 360px mobile and desktop, keyboard/focus, screen-reader announcements, contrast, zoom and reduced motion are release evidence.
- Use motion only where it improves comprehension. No artificial viewer counts, guaranteed ROI, spend pressure or hidden errors.

WCAG 2.2 provides the accessibility verification reference; passing an automated scanner alone is not the complete manual test. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## 12. Evidence and acceptance system

### Proposed evidence record contract

Implement strict schemas and machine validation. This table specifies requirements, not a certificate to fill with invented sample success.

| Group | Fields / rules |
|---|---|
| Identity | schemaVersion, evidenceId, packageId, findingIds, runId, producer identity, independent reviewer identity |
| Subject | commit, complete source-tree digest, lockfile digest, built artifact digest, migration manifest digest, sanitized configuration digest |
| Environment | LOCAL/STAGING/PRODUCTION, named environment/branch/account scope; no credential values |
| Provenance | collection method, executed command/tool version, started/finished/observed time, exit code |
| Evidence type | UNIT, DATABASE, BROWSER, BUILD, DEPLOYMENT, PROVIDER, PROFESSIONAL_APPROVAL, PILOT; typed, never freely interchangeable |
| Simulation | explicit fixture flag and provider/database actually-contacted flags |
| Claims | predicate ID, pass/fail/unknown/not-run result, artifact references and sanitized evidence hashes |
| Dependencies | exact receipt IDs/hashes, applicability window, invalidation causes |
| Approval | reviewed subject digest, signer role/identity, decision/time, trusted verification reference |
| Privacy | redaction classification, restricted raw-evidence location, retention/access policy |

A local hash is not an authenticated signature. Use CI/workload provenance and independent trust anchors for release evidence; a developer key next to mutable fixtures is not independent proof. The design borrows artifact/source provenance concepts, not a claim of SLSA certification. [SLSA provenance](https://slsa.dev/spec/v1.2/provenance).

### Acceptance state machine

PLANNED → IN_PROGRESS → READY_FOR_REVIEW → ACCEPTED_LOCAL → ACCEPTED_INTEGRATED → EXTERNAL_VERIFIED where applicable → RELEASE_ACCEPTED.

REJECTED, BLOCKED_EXTERNAL and INVALIDATED are explicit states. Do not overload COMPLETE_LOCAL to mean all stages. Reviewed records are append-only decisions; later changes invalidate only affected claims, with dependency propagation.

A package is accepted only when all required predicates and evidence levels pass. A failure/unknown/not-run is not a success. Derived evidence cannot claim a stronger environment or authority than its inputs.

### Required negative controls

Fixture passed as provider receipt; absent database client; wrong provider/account; old artifact hash; changed migration SQL; unknown applied migration; missing log; nonzero command exit; forged 18-character attestation; revoked approval; wrong environment; absent spend; skipped required test; changed command after review; untrusted receipt signer. Each must prevent relevant gate closure.

Inspect all compliance and deployment entry points, not just four generators. Preserve prior invalid artifacts with qualification; block their consumption by the release evaluator.

## 13. Testing, security and performance strategy

### Cadence

Use Node 24 and scripts/testing/run.mjs for sanitized local test execution. Run one or two directly relevant files during iteration. Do not use test environment defaults as evidence that production configuration is safe.

Full regression, repository typecheck/lint, isolated client/server build and affected browser/security checks occur at reaccepted P2, P4, P6 and P8 exits. In this corrective plan those checkpoints correspond to R2-04, R3-04, R5-04 and R7-01. Reuse the exact final candidate’s completed sweep when unchanged; rerun affected checks and invalidate evidence when it changes.

Build must be independent of .env/remote production databases before normal build execution. Deployment checks use explicitly named targets and roles.

### Required test layers

- Pure functions: money rounding, tier boundaries, normalization and state transitions.
- Contract: Zod request/response, error vocabulary, API compatibility and provider normalization.
- Actual disposable PostgreSQL: exact migrations/grants, real LOGIN roles, RLS, SQL triggers, locks, transaction rollback and concurrent processes.
- Mounted HTTP: principal construction, body/URL ownership, cookies/origin/CSRF, permissions and current role changes.
- Browser: real production service worker, identity switching, interrupted requests, mobile and keyboard journeys.
- Provider/payment: recorded sanitized fixtures locally, authenticated scoped sandbox/paused operations for external gates.
- Fault/resilience: worker crash before/after remote write, lost COMMIT, late capture, backlog/DLQ, restore and account restriction.
- AI/media: untrusted content, malformed outputs, policy/rights issues and conservative fallback.
- Supply chain: secret/dependency scanning, artifact separation and trusted build provenance.

Use version-pinned OWASP ASVS requirements for the applicable web-security controls and record exclusions with rationale. This is a coverage method, not automatic certification. [OWASP ASVS](https://owasp.org/projects/asvs).

### Proposed measurable non-functional acceptance

Product/SRE must record the named workload and approve release targets before performance sign-off. These are planning defaults, not measured current behavior or new provider promises:

| Target | Proposed measurement |
|---|---|
| UI responsiveness | Adopt documented route-specific LCP/interaction/layout budgets; capture actual lab/device/network configuration and field instrumentation |
| API projections | p95 ≤500ms excluding external provider latency, at the agreed seeded data volume/concurrency |
| Command acceptance | p95 ≤500ms to durable acceptance; external completion is separately observed |
| Inquiry reliability | Zero lost accepted messages or notification intents under defined crash/retry suite |
| Safety operations | Measure detection-to-durable-pause-intent, queue-to-dispatch and provider-confirmation separately; approve thresholds from pilot risk limits |
| Restore | Proposed RPO 5 min/RTO 60 min remains subject to infrastructure approval and an actual restore drill |
| Accessibility | WCAG 2.2 AA journey coverage and existing 44px product touch-target requirement |
| Financial correctness | Zero unexplained journal imbalance, duplicate financial effect or unauthorized spend in acceptance scenarios |

Do not label testing at an unspecified load “scalable.” Record dataset cardinality, concurrency, request mix, cache state, hardware, duration, error rate and query plans. Avoid high-cardinality sensitive metrics.

## 14. Database and compatibility plan

1. Reconcile actual source/index/deployed migration history before allocating any new migration number.
2. Existing names 038–040 are already used by service/conversation work. Earlier blueprint candidate numbers are not executable allocation instructions.
3. Do not edit an applied migration or silently repair a checksum. Do not restore deleted migrations without investigating whether they were ever deployed.
4. Use the existing migration runner, held connection and advisory lock 82749102.
5. Apply additive tables/columns/helpers/grants with FORCE RLS and explicit role ownership. Rehearse both fresh bootstrap and upgrades from the known predecessor.
6. Backfill with resumable checkpoints, idempotency and shadow count/hash comparisons; no business authority is inferred from legacy incomplete rows.
7. Roll out dual-compatible readers/writers with flags. Disable new mutations on rollback; preserve journal, provider mappings, messages and accepted history.
8. Add immutable audit format versions rather than rewriting historical events.
9. Record actual restricted-login readiness after migration. Owner execution alone proves only DDL application.
10. Stop on unknown COMMIT and inspect history through the canonical recovery procedure; never blindly rerun.

## 15. External gates and rollout

| Gate | Local work allowed now | Evidence required before live acceptance |
|---|---|---|
| ENV-01; STAGE-01 composite | Disposable DB, deterministic configuration validators, runbook | Named isolated deployment/branch, dedicated secrets, exact artifact and retention/reset/restore policy; STAGE-01 does not replace the original gate IDs |
| DB-01 | Local real-PostgreSQL role/RLS tests | Actual deployed web/worker/issuer login, exact grants/FORCE RLS, no unintended ownership/BYPASSRLS or SET ROLE escalation |
| LEGAL-01 | Policy interfaces and clearly synthetic examples | Written applicable tax/invoice/cancellation/refund approval, scope/effective dates/reviewer |
| COMM-01 | Cost-plus arithmetic, contract schema, ledger simulations | Approved cost base, markup/tax/variance/refund/earning and exposure limits |
| IAM-01 | Role catalog, conflict/step-up/checker tests | Approved production role combinations, approval thresholds, safety-pause asymmetry, bootstrap and access-review procedure |
| OPS-01 | Service workflows, notification sinks and runbooks | Approved support hours, response/escalation coverage, channel consent, capacity and retention responsibilities |
| PRIV-01 | Privacy controls, synthetic export/erasure/AI tests | Approved disclosure/lawful basis, redaction/contact-sharing policy, retention/deletion, AI processing and access-review rules |
| PROV-M-01 / PROV-G-01 | Adapter fixtures, capability contracts, paused harness | Actual account identity/topology/access/capability evidence; syntax is insufficient |
| CANARY-01 | Failure/replay/readback tests | Approved property/offer/account, real PAUSED creation, exact authenticated readback and bounded observation |
| PILOT-01 | Pilot charter, dashboards, support/stop runbooks | Named cohort, real approved spend window, reconciled outcomes and independent go/no-go |

Historical permission for a bounded production operation is not blanket approval for unrelated future external effects. Inspect existing authorization; do not ask again when it already covers the exact operation. Never reinterpret an unlabeled .env connection as staging.

The [existing external gate register](../implementation/CR1_EXTERNAL_GATE_REGISTER.md) supplies the original IDs and required owners. Historical generated clearance is qualified by CR1-045. Carry every applicable ENV/DB/LEGAL/PROV/COMM/IAM/OPS/PRIV/PILOT predicate into the evidence registry; aggregate aliases must not hide an open constituent gate.

### Promotion order

Local acceptance → isolated staging → production shadow with mutations gated → authorized paused canary → bounded live pilot → explicitly approved expansion.

R7-02 has independently accepted STAGING and PROD subgates. Production requires an explicitly identified authorized target, preflight against its real schema, reviewed additive migrations/grants where needed, actual restricted-login checks, and exact web/worker/client artifact plus configuration identities. Observe a predefined window with success/stop predicates. Shadow observation must not duplicate payment creation, provider writes, customer notifications or worker ownership. Staging evidence cannot substitute for this production deployment gate. A staging-only canary must remain labeled staging and cannot clear production rollout by itself.

Dependency labels distinguish LOCAL contract acceptance from EXTERNAL proof. Local policy/capability adapters can be integrated using explicit synthetic fixtures while genuine approvals/account observations remain blocked. R7-01 accepts the software candidate only after required local predicates and critical/high implementation defects are resolved; it does not require its downstream external exercises to have happened first. Final release requires both kinds of evidence.

A canary can prove controlled provider operation. It cannot prove booking conversion, profitable acquisition or commercial demand. A short pilot with no bookings must report that outcome and decide whether to extend, revise or stop; no invented ROAS success.

### Stop and recovery conditions

Unexpected spend, cross-tenant access, journal drift, untraceable capture, unsupported account policy, unresolved high-severity security finding or wrong artifact/environment prevents promotion.

Disable new affected commands, queue safe provider pauses through preserved authority, observe confirmation, reconcile obligations and preserve evidence. Do not equate a local feature flag with provider-confirmed pause. No destructive database rollback, forced provider recreation or log deletion.

## 16. Success criteria and reporting

Software quality acceptance requires repaired findings, all original CR1 requirements traced to mounted flows and current tests, clean milestone exits and maintainable canonical ownership.

Production readiness additionally requires actual environment, provider, legal, operating and bounded pilot evidence. Unknown external gates remain open even if every local test passes.

Report three separate measures:

- Corrective engineering: accepted local/integrated cards and rejected/blocked cards out of 32.
- Original CR1: individually reaccepted packages out of 48 at the required evidence level.
- Production gates: named gate state, evidence and blocking owner.

Do not convert 4/10 into “40% complete,” reset historical work to zero or inflate local progress by counting external templates as verified.

The practical standard is: a new engineer can trace authority, reproduce failures, implement a narrow change, prove recovery and explain precisely what is safe to release. This is the discipline that can make Encho a dependable business platform.

**Blueprint delivery does not alter implementation completion. Historical 100% remains disputed; corrective packages are specified, not executed.**

## 17. Documentation review and limits

On 28 September 2026, separate read-only security, product and release reviews checked the corrective contracts. Their feedback corrected local/external dependency semantics, production deployment evidence, original gate coverage, protection/attribution/privacy requirements, and the distinction between advisory overlap and hard exposure caps.

Static documentation validation confirmed 32 complete work-card contracts, an acyclic card dependency graph, coverage of all 48 original packages exactly once in the coverage table, and A01–A15 in the closure matrix. The pre-existing staged diff digest and all 19 source hashes recorded in the audit validation remained unchanged. See the [documentation-only validation record](../implementation/CR1_REMEDIATION_DOCUMENTATION_VALIDATION.json).

These checks validate the plan's structure and traceability. They do not validate implementation, live source reachability for every proposed task, production performance, external policy, deployment or a canary. No application test/build was rerun for this documentation-only change. Future implementers must reverify source and execute the specified checks.
