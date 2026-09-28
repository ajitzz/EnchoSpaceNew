# Antygravity mission — Host/Admin operating platform blueprint

**Status:** Founder-authorized engineering guidance, 29 September 2026. The mission name is **Antygravity**. This is an execution overlay for the existing CR1 corrective cards, not a replacement release ledger or a production certificate. The founder will bring the resulting shared-workspace changes back for independent review. The founder has not yet resolved the business choices in §11; implementation must not silently make those choices.

## 1. Objective and controlling authority

Build the verified host-to-admin-to-guest operating chain that makes Encho's managed marketing promise credible: a host presents a truthful property and exact sellable offer, prepares a bounded campaign without provider-account expertise, receives expert review and a transparent quote, and can inspect each actual provider flight, inquiry and booking outcome. Admin/scoped staff author reusable strategies, review exact revisions, handle exceptions, protect spend/account status and serve customers. Preserve what works; finish mounted journeys and prove them independently. “FAANG L7/L8” is an aspiration for engineering discipline, **not** an acceptance state.

Control order: [Constitution](../ENCHO_ENGINEERING_CONSTITUTION.md), [HARVO](../../HARVO.md) and [Decisions](../harvo/DECISIONS.md); [original CR1 blueprint](ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md) and [48-package plan](../implementation/CR1_EXECUTION_PLAN.md); [quality audit](../audits/CR1_ENGINEERING_QUALITY_AUDIT_2026_09_28.md), [corrective blueprint](CR1_ENGINEERING_REMEDIATION_BLUEPRINT.md), [32 corrective cards](../implementation/CR1_REMEDIATION_WORK_PACKAGES.md) and [reacceptance register](../implementation/CR1_PACKAGE_REACCEPTANCE_REGISTER.md); [Boardroom 038](../harvo/BOARDROOM_DISCUSSION_038_HOST_ADMIN_REALITY.md). A current source fact outranks stale documentation, but a source defect does not silently change an approved business rule.

No new percentage replaces the disputed historical 48/48. As of this blueprint, the corrective execution record reports 0/32 full-card acceptance and 0/48 independent CR1 reacceptance. Those are acceptance counts, not percent code-complete. The last observed HEAD was `0e4c6fec2fe86f1b793760c5f7a3daf08bbf7508`, with a large pre-existing staged/unstaged tree; Antygravity must recapture identity at startup. Applied Neon history includes original SQL 041–047 absent from current source, including unrecovered 047 and a 045 checksum discrepancy. No migration number is free by assumption.

## 2. What must be preserved and what remains unproven

Preserve canonical room/inventory authority, `financeService`, balanced journal, `durableOutbox`, conversation authority, existing marketing v2 workflow, AdTech release/binding system, workforce IAM command boundary, reviewed creative/spatial stories and privacy-safe public projection. Use additive adapters and migrations, not parallel wallets, command queues, approval systems or a rewrite of `server.ts`.

Current Host UI includes property/room editing, calendar, reservations, inbox and Campaign Studio. Current Admin UI includes strategy versions, corridors, audit, content review, finance/provider state and bounded recovery. These are source-visible components, not proof of an externally functioning service. Guest checkout is intentionally gated; live provider/account topology, restricted deployed roles, notification channel delivery, exact applied schema, tax/commercial policy and paid pilot remain open. Simulation receipts cannot clear them.

## 3. Target operating journey and hard boundaries

~~~mermaid
flowchart LR
 H[Host: property, exact offer, approved creative, intent and budget] --> F[Canonical fact and inventory snapshot]
 F --> S[Released program plus provider/account capability]
 S --> V[Deterministic validation and bounded AI advice]
 V --> R[Scoped human review of exact revision]
 R --> Q[Accepted quote, verified capture, risk and reservation]
 Q --> P[Durable paused provider command]
 P --> B[Authenticated readback and separate activation]
 B --> O[Observed provider status, spend and freshness]
 O --> I[Consented Encho inquiry and assigned response]
 I --> G[Verified booking and later fulfilled economics]
 O --> X[Host per-flight portfolio and Admin exception desk]
 G --> X
~~~

Authority is separate at every handoff. A listing observation is not an accepted offer; a quote is not a hold; captured funds are not provider settlement; a requested pause is not confirmed provider state; a click is not an inquiry; an inquiry is not a booking; a booking is not a fulfilled stay. Any unavailable observation remains `UNKNOWN`, never coerced to zero or success. AI cannot approve a claim, invent a provider identity, release a financial gate or activate spend.

## 4. Workstreams mapped to existing corrective cards

| Slice and outcome | Existing cards / original scope | Engineering acceptance evidence |
|---|---|---|
| **A. Establish a reproducible baseline**: source/index/artifact/schema identity, quarantined evidence and restricted authority | R0-01–04, R1-01–04, R2-01–04; original P0–P2 | Every pre-existing deletion and intended route has a reviewed disposition; original applied SQL bytes/catalog are reconciled before new numbers; actual narrow LOGIN roles deny owner/BYPASSRLS; offline build cannot contact `.env`; current full P2 sweep passes on frozen tree. Existing READY_FOR_REVIEW work is reviewed rather than rewritten. |
| **B. Truthful listing and sellable offer**: one room/entire-stay subject across Guest, Host and Admin | R3-01; R3-02–04 for lawful quote/commerce; original P4 | Immutable offer evidence binds listing/room/rate-plan/version/currency/occupancy/verified claims/media/availability scope/conditions. Three surfaces display and edit the same authorized facts. Material edit invalidates dependent approval/revision. Guest `Rooms from` is conditional, with source/date context; no fabricated bookability. Commerce remains gated until professional policy. |
| **C. Host creative and expert strategy**: simple host intent with deterministic pinned plan | R4-03–04, R5-01–02, R6-01; original P5–P7 | A host can use a default path with exact offer or labeled property discovery, goal, reviewed media, total budget and dates. Advanced preferences are bounded and provider-capability-checked. Campaign revision pins offer/fact/media hashes, program/corridor/account capability and effective plan. Admin release changes affect only future revisions. Support image/Reel/carousel only when exact-byte rights/review and provider adapters are proven. |
| **D. Review, finance and provider operations**: no unintended spend or duplicate remote effects | R5-03–04 plus R1-02/04; original P6 | Scoped checker reviews exact revision; accepted quote/capture/risk/reservation precede activation; paused creation has idempotent durable command and readback; ambiguous remote write reconciles before retry; post-publication change uses new revision and consent as required; invoices/refunds/overages settle through existing journal. Unsupported provider controls show explicit blockers. |
| **E. Inquiry/service and portfolio truth**: host can operate multiple flights without losing a guest | R4-01–02, R6-02–04; original P3/P7 | Four simultaneous campaigns retain distinct provider, offer, revision, budget, status, report window and freshness. Portfolio sums deduplicate canonical bookings. Durable notifications distinguish queued/sent/delivered/read; staff desk has assignment, escalation, actor-scoped reply and revocation. No promised response SLA until operating coverage and delivery receipts prove it. |
| **F. Independent release**: software plus external proof | R7-01–04; original P8 | Frozen exact artifact full suite/typecheck/lint/offline build/browser QA, disposable PostgreSQL/restricted LOGIN tests, staged deployment with authentic identity, authorized paused provider canary and bounded pilot only after their respective gates. Implementer may submit READY_FOR_REVIEW, never self-certify RELEASE_ACCEPTED. |

The first vertical slice must traverse **one exact offer, one approved creative and one released program** through mounted Host, Admin and provider-facing contracts. Local provider fixtures may verify code but must be labeled simulation. This slice is not permission for live spend. Expand to second provider, other media and multiple simultaneous flights after first-slice evidence is sound.

## 5. Specific contracts and data lifecycle

### Listing/offer authority

Use existing room and inventory tables. Define or extend an immutable canonical offer version with listing/room or explicit entire-stay subject, rate plan and minor-unit currency basis, occupancy/capacity, applicable dates, verified amenities/claims, media manifest digests, cancellation/tax-policy references, validity time and materiality fingerprint. Keep guest public projection separate from private coordinates, account IDs and operations records. An observed room/price must not be relabeled as a payable offer. A later quote pins exact offer version, stay dates, occupancy, tax/fee policy, total and expiry; holds/capture/bookings remain distinct transactions.

For mixed-price resorts, assign Budget/Comfort/Premium to the **selected offer's verified nightly basis**, not the property's cheapest or first room. A property-discovery “from ₹X” campaign is a separate subject with an eligible source offer, availability/conditions and clear landing; do not imply every room costs ₹X. Any material edit must block or safely pause affected promoted revisions pending reapproval. No new property/room/media field is complete until Guest view, Host edit and Admin moderation all use it.

### Campaign revision and provider boundary

The campaign snapshot must pin host-approved business intent, exact landing/subject, reviewed creative bytes and rights, released policy versions, effective host overrides, provider account/capability and geography evidence, quote/funding authority and compiler contract hash. Audit every transition with correlation, actor, expected version and idempotency key. Compile only supported provider controls; create paused; read back objective, creative, geo/exclusions, budget/bidding, conversion settings and effective status. A requested operation and provider observation are separate journal events. Material operator edits after approval require a new review/consent chain, not a mutation to the old revision.

No universal local-district exclusion, relationship-demographic translation, special-ad category or native-console parity may be assumed. Host-selected “couples/family/friends/workation” is intent/creative guidance unless a lawful, account-supported targeting mapping is explicitly approved. Suppress Churam/Adivaram/Thusharagiri-style local waste only using provider-expressible resolved geography; unresolved exclusion fails closed rather than falling back to national targeting. Keep paid destination pools and organic brand posts under their separate existing gates.

### Outcomes and money

Present per-flight configured state, last confirmed provider state, observation time, report coverage/freshness, known spend, accepted quote, captured/reserved/refundable funds, Encho fees and consented first-party visits/inquiries/verified bookings. A portfolio total deduplicates one canonical booking across campaigns and indicates attribution method/limits; do not sum provider-reported conversions as Encho bookings. Distinguish confirmed, cancelled/refunded and fulfilled stays. Delayed or missing provider reports must not imply current zero spend, paused success or available refund. Four flights on one host/property may overlap; expose advisory cannibalization and aggregate authorized exposure without silently consolidating or reallocating host money.

### CRM and workforce

Keep guest-host conversations in canonical conversation service with consent and tenancy boundaries. Enqueue notification intent durably and track channel outcome; socket emission is a hint, not proof of SMS/email/push delivery or reading. Define priority, assignment, response age and escalation without inventing service coverage. A staff reply must disclose staff identity/role as policy requires and be auditable; AI may draft grounded replies but a protected send needs current actor authority. Revocation and stale leases must fence workers and UI sessions.

## 6. UX requirements

**Host:** one default campaign path requiring only offer, goal, reviewed creative, investment and dates; explain recommended audience and forecast as uncertain hypothesis. Advanced feeder/format/guest-intent controls must expose permitted bounds and the effective plan before payment. Campaign cards show independent flight status, source/freshness, action blockers and an honest budget meter. Refund/pause labels distinguish requested from confirmed. Accessible mobile at 360px, desktop, keyboard, zoom, screen reader and reduced motion. Avoid dopamine claims that disguise risk or use fake urgency/viewer counts.

**Admin/staff:** one work queue sorted by risk, customer harm, stale observation and SLA. Separate strategy release, campaign review, finance release, provider operation and customer service permissions. Show exact diff/provenance, capability blockers, account binding, draft-versus-released state, reviewer conflict and post-publication readback. Require reason and expected version for protected commands. Allow emergency safety pause even when nonessential strategy evidence is degraded; preserve audit and provider confirmation.

## 7. Validation matrix and exit gates

| Level | Minimum tests/evidence |
|---|---|
| Domain/unit | Paise and tier boundaries, offer materiality, claim/media hashes, unsupported capability, host bounds, AI failure, unknown-vs-zero, portfolio dedup, quote expiry and state transitions. |
| Database | Actual disposable PostgreSQL; separate LOGIN non-BYPASSRLS roles; tenant escape, checker self-approval, conflict replay, transaction abort, stale lease, process restart and lost COMMIT. One held transaction connection; parameterized SQL. |
| Mounted integration | Actual Host save/submit, Admin review, funding callbacks, outbox worker, paused provider adapter/readback, inquiry notification and status projections. Tests must assert durable rows/effects, not merely class returns. |
| Browser | Real built client/service worker; old queue migration, account switch/logout, two tabs; Host and Admin flows at 360px and desktop with keyboard/focus/contrast/zoom/reduced motion; error, stale and unsupported states. |
| Release | Targeted iteration tests via Node 24 `scripts/testing/run.mjs`; full regression/typecheck/lint/isolated build at R2-04/P2, R3-04/P4, R5-04/P6 and R7-01/P8; preserve failed and repaired receipts. Deployment is separately target-bound and read-only preflight must never create/alter `schema_migrations`. |
| External | Authentic legal/finance, named environment and actual restricted roles, current provider/account classification, genuine paused readback and spend observation, and real pilot economics. Fixture generators cannot clear gates. |

Success is not a test-count target. Every original CR1 acceptance criterion and corrective card must have source/artifact identity, independent reviewer, applicable local/integrated/external evidence and explicit blockers. A change to relevant code, config, migration, role or provider account invalidates dependent receipts. Release thresholds for latency, queue age, response SLA, incident paging and spending must be measured against an approved workload and staffing plan; proposed numbers are not current SLO achievements.

## 8. Sequence, dependency and rollback

1. **Reconcile** R0/R1/R2 handoffs and dirty tree. Review existing READY_FOR_REVIEW repairs; finish P2 exit before claiming integrated foundations. Do not reimplement work already correctly done.
2. **Close offer truth** R3-01 local and the three-surface materiality chain; keep commercial booking blocked while R3-02 external policy is unavailable. Continue CRM R4-01/02 independently.
3. **Bind creative and program** R4-03/04 and account capability R5-01, then one default Host path and one Admin review/paused provider slice. No new migration numbers before original applied history is reconciled.
4. **Prove post-publication and service** R5-03/04 and R6-01–04, including four-flight projection, notification delivery and operations staffing exercises.
5. **Freeze and certify** R7-01 software artifact. R7-02 staged and production identity, R7-03 canary, R7-04 pilot remain independent external subgates. Do not deploy or spend from a local test receipt.

Rollback must disable new mutations without deleting accepted quotes, journals, messages, provider mappings or audit. A provider safety pause is a durable requested operation followed by observation; a feature flag alone does not prove it. Source migrations are append-only once applied; never edit checksummed bytes to make history appear clean. Unknown remote writes reconcile instead of blind retry.

## 9. Collaboration and change-control in the shared checkout

Antygravity and Codex share **one** filesystem. Before each coherent batch, record `git rev-parse HEAD`, `git status --short`, index-tree identity, affected file list and staged/unstaged diff summaries. Do not reset, checkout over, restore, bulk-stage, overwrite user edits or claim clean-tree tests when the tree was mixed. Claim explicit file ownership if multiple engineers work simultaneously; avoid concurrent edits to `server.ts`, `HARVO.md`, `DECISIONS.md`, migration runner and package manifests. Use small scoped commits only after review and only for owned files; preserve pre-existing staged content. No force push. A later Codex audit will compare baseline, new commits and remaining worktree changes before any requested GitHub push.

Per batch handoff: original/corrective card IDs; root-cause/impact note; files/routes/tables and compatibility; exact starting/ending commit/tree/diff; tests with commands, exit codes, passed/failed/skipped counts and durable assertions; rollback; unresolved policy/external gates; evidence labeled LOCAL, DISPOSABLE_DB, STAGING or PROD. Submit `READY_FOR_REVIEW`. Do not self-mark `RELEASE_ACCEPTED`, fabricate staging/provider/legal identities or erase prior failed evidence. Update HARVO and DECISIONS only when verified source findings or founder decisions actually change them.

## 10. Measurable product/operating outcomes to validate in pilot

Measure time from eligible host draft to human decision, review revisions per campaign, percent of campaigns with confirmed provider readback, stale-observation minutes, unauthorized or duplicated provider writes (must be zero in controlled testing), spend between safety intent and confirmed pause, inquiry delivery and first-response distribution, inquiry-to-confirmed and confirmed-to-fulfilled stay conversion, cancellation/refund rate, true recognized campaign contribution and host repeat funding. Segment by offer, provider, corridor and program release without leaking tenant data. Set targets after baseline measurement and staffed operating agreement; do not write invented success values into release documents.

## 11. Unresolved founder/external choices (no silent defaults)

| Choice | Recommended direction | Until decided |
|---|---|---|
| First/material listing publication | Admin release of first publication and material factual/media changes; precise nonmaterial self-edit policy | Keep existing behavior visible as a defect/contradiction; design and test both contract options locally, do not claim the policy resolved. |
| Pilot subject | One exact approved room or entire-stay offer; property-discovery ads separately labeled | No paid pilot or fabricated listing/room authority. |
| Host controls | Offer, goal, approved creative/format, investment, dates; bounded feeder and evidence-backed guest-fit in advanced panel | Do not expose unverified raw relationship/age/provider settings as executable targeting. |
| Staffing promise | Define staffed hours, first response and escalation from measured capacity | No five-minute guarantee or automatic-message claim. |
| Advertiser of record/account topology | Obtain current Google/Meta-specific classification; preserve zero Host OAuth UX | No universal single serving account assumption or live activation based on an internal memo. |
| Ads cost/tax/refund/legal policy | Written finance/legal contract, accepted quote and original-rail treatment | Keep affected purchase/settlement paths gated. |

## 12. Definition of Done for Antygravity mission

All applicable cards above are independently reaccepted at their required level on one frozen source/artifact/schema/config identity; Host, Guest and Admin can complete the connected release journeys without a safety or truth violation; negative security/recovery tests pass using real restricted local roles; the full current-tree suite/build/browser checks pass; actual external approvals, staging/production identities, provider canary and bounded pilot are documented by their real authorities; staffing and incident response have named owners. If any external input is absent, report **software locally ready / external gate blocked** at its precise scope, never “10/10 production-ready.”
