# HARVO — Decisions, assumptions and discussion history

Maintained alongside `../../HARVO.md`. Only an explicit founder decision or a controlling approved document changes an approved business rule. An assistant suggestion is a proposal. Historical source behavior is not approval. Preserve superseded entries and link replacements.

## Founder instruction recorded in this session

| ID | Date | Statement | Status | Impact |
|---|---|---|---|---|
| HARVO-001 | 2026-09-13 | Create a living blueprint named HARVO recording detailed project understanding and insights from discussions; revise it when ideas/understanding change; use it in future work. | APPROVED — explicit user request | Repository documentation and startup guidance. No automatic phase transition or product implementation. |
| HARVO-002 | 2026-09-13 | Remain in Boardroom for discussion; treat this blueprint as understanding/evidence rather than authorization for a new execution milestone. | INTERPRETATION of current request and existing phase rules | No production-code changes. Founder can explicitly change phase. |

## Controlling decisions inherited, not newly approved here

| ID | Decision | Authority/status |
|---|---|---|
| INHERITED-001 | India domestic stays; unified guest/host account; experiences outside active launch scope | Guest Booking Decision Register, APPROVED |
| INHERITED-002 | Host supplier; Encho disclosed marketplace/collection agent | Constitution and guest register, APPROVED |
| INHERITED-003 | No guest booking commission or gateway surcharge | Guest register, APPROVED |
| INHERITED-004 | Flex default 15%; commission snapshot at confirmation | Guest register, APPROVED |
| INHERITED-005 | Growth ₹4,999 + applicable GST/property/rolling 30 days; qualifying bookings retain zero commission; active term extends | Guest register, APPROVED; implementation not proven |
| INHERITED-006 | Historical optional advertising: actual media spend + 15% management fee + applicable tax | SUPERSEDED as future business direction by HARVO-008. Existing contracts/code remain unchanged pending a complete replacement specification. |
| INHERITED-007 | Canonical relational room/media authority and strict publication/media evidence | Guest register, APPROVED |
| INHERITED-008 | Inventory default hold 600 seconds; signed principal and idempotency/fingerprint | Guest register and M4 implementation, APPROVED |
| INHERITED-009 | No fabricated guest facts, reviews, ratings, urgency, room tiers or access credentials | Guest register, APPROVED/REJECTED legacy patterns |
| INHERITED-010 | M5/M6B cannot execute without written Indian CA/tax-lawyer sign-off | Existing LEGAL GATE; not cleared by browsing or this review |
| INHERITED-011 | Guest booking confirmation requires captured-payment evidence and canonical server authority | Guest register, APPROVED; future milestones incomplete |
| INHERITED-012 | Master Encho advertising account, AI + human review, preserved financial boundaries | Existing marketing architecture, APPROVED; provider permission/current readiness unknown |

## Existing unresolved founder/provider decisions

Read the full guest decision register before proposing implementation. These are inherited gates, not requests for the founder to approve code in this session.

| Gate | Unresolved subject | Existing dependency |
|---|---|---|
| PROPOSED-003 | Versioned cancellation templates/windows | M11 |
| PROPOSED-008 | Check-in verification mechanism | M11 |
| PROPOSED-009 | Time-based automatic check-in confirmation | M11 |
| PROPOSED-010 | High-risk host payout timing | M11 |
| PROPOSED-012 | Automatic full refund after late capture without inventory | M9 |
| PROVIDER-001 | Payout rail and approved merchant capabilities | M9/M11 as applicable |
| PROVIDER-002 | Reliable order reconciliation by receipt/notes vs signed webhook investigation | M9 |
| LEGAL-001 | Tax rules, invoice format, withholding/collection obligations, refund disclosures and marketplace agreement | M5/M6B and downstream financial milestones |

## New boardroom proposals — not approved

| ID | Proposal | Reason/evidence | Decision status |
|---|---|---|---|
| BOARD-001 | Measure fulfilled, undisputed stay nights with reconciled payment/payout and positive contribution | Bookings/clicks alone can hide failure or unprofitable demand | PROPOSED |
| BOARD-002 | Select one initial destination/guest use case based on real supply, support capacity and demand evidence | Launch geography/segment is not established by code examples | PROPOSED |
| BOARD-003 | Make trust/identity/payment correctness the release priority before acquisition expansion | H-001 through H-011 | PROPOSED prioritization; fixes not authorized in Phase 1 |
| BOARD-004 | Model Growth economics by booking-volume band and variable service cost | ₹4,999 term revenue vs unlimited variable costs | PROPOSED analysis; no price change |
| BOARD-005 | Retain hosts through measurable value and transparent spending controls | “Refuel” urgency and forced wallet liquidity do not prove value | PROPOSED; wallet/refund policy changes need separate approval/legal review |
| BOARD-006 | Keep public availability separate from private operational calendar | H-005 | PROPOSED implementation direction, existing privacy requirement already approved |
| BOARD-007 | Require external evidence for “delivered,” “synced,” “live,” and “verified” | H-008, H-013–H-017 | PROPOSED cross-project operational acceptance rule |
| BOARD-008 | Reconcile current documentation status with a source/deployment/test-evidence matrix | H-030 | PROPOSED governance cleanup; historical acceptance remains preserved |

## Business unknowns

Await founder input: live vs pre-launch status; source-to-deployment match; verified properties and active hosts; completed paid stays and GMV/revenue; operating budget/runway and team; first market/customer segment; ad cohort returns; merchant/legal approvals; support coverage.

No response was available when v0.1 was written. Never assume zero traction or live traction in the absence of this evidence. Seed data is not traction.

## Revisions to understanding during initial review

| Previous possible assumption | New understanding | Evidence | Status |
|---|---|---|---|
| Marketing certifications might establish whole-product readiness | Marketing and stays are separate tracks; local guest/identity issues block a readiness claim | Constitution active track, code and tests | SOURCE/TEST OBSERVED |
| Canonical guest presentation may already satisfy M6A | Current truth suite fails 17/24 tests; gallery interaction fails too | VALIDATION.md | TEST OBSERVED; M6A not accepted |
| Approved M2 means current guest view uses only public V2 data | Current component refetches older listing/calendar paths | App/component/API trace and failing M2 test | SOURCE/TEST OBSERVED |
| Alerts/pricing/retargeting helpers imply real integration completion | Specific methods record success without external delivery/update | H-014–H-016 | SOURCE VERIFIED |
| Master account removes shared enforcement exposure | It centralizes control and concentrates dependency risk | Architecture/business reasoning | INFERENCE; policy review still required |
| Earlier survival percentages are measured business evidence | No supporting model/traction evidence found | Historical strategy review | HISTORICAL OPINION |

## Entry format for future discussions

### Discussion 010 — Marketing execution authorization and M1, 13 September 2026

**HARVO-012 — APPROVED founder authorization:** execute and test the documented marketing plan, including Meta/Google and premium interactive host/admin setup. This explicitly advances the marketing work to Phase 3; one milestone per response remains. No repeated phase approval is needed. Read [HARVO_MARKETING_EXECUTION_PLAN.md](../implementation/HARVO_MARKETING_EXECUTION_PLAN.md) for the numbered track.

**ADR-HARVO-MKT-001 — IMPLEMENTED M1 architecture:** real authenticated Google v25 paused Search preparation, explicit serving account/origin, published property destination binding, durable per-campaign claims and semantic request replay, returned-ID/readback evidence, quarantined unknown outcomes, provider-sourced reads and unavailable unimplemented controls. No automatic live dispatch, implicit simulator, guessed IDs, funding capture or lifetime-budget guarantee. Existing Google dispatch gate remains; canonical conversion uploads default unavailable. Local evidence and independent review in [M1_VERIFICATION.md](M1_VERIFICATION.md).

The earlier “no execution authorized” status of discussions 001–009 is historical and superseded by HARVO-012 for this track. Business cost/tax/variance terms, provider account classification, host campaign authorization and legal sign-offs remain unresolved where previously recorded; generic execution permission does not fabricate those facts. M1 does not accept any guest milestone or certify production readiness. Progress: 1/10 marketing milestones locally verified.

### Discussion 009 — Expected production-readiness rating, 13 September 2026

**REVIEW-005 — CONDITIONAL assistant judgment, not founder approval or certification:** Target approximately 8/10 for a bounded first launch after full implementation and independent pre-release verification; approximately 9/10 after representative controlled production evidence across the selected provider and booking/payment lifecycle. Implementation alone earns no readiness upgrade. Current inspected paid-funnel readiness remains 2/10. Critical money, security, booking and provider/legal gates override any aggregate rating; no 10/10 or booking-profit guarantee. See HARVO section 26 for evidence requirements and limits. No code changes, tests rerun, phase switch, launch authorization or findings closure occurred.

### Discussion 008 — Booking growth research and premium campaign experience, 13 September 2026

**HARVO-011 — APPROVED scope:** investigate Google and Meta acquisition using authentic listing media/data, AI guidance, maximum useful booking conversion and an interactive host/admin experience. Research and local concept work authorized. No explicit command to leave Phase 1 or operate real accounts/spend.

**BOARD-011 — PROPOSED:** preserve centralized Encho operation but select provider-compliant advertiser account structure after classification; no-host-OAuth does not mean all independent advertisers must share one ad account. Google third-party policy and manager/client creation capability support this distinction.

**BOARD-012 — PROPOSED:** focused Search plus eligible Hotel Ads/free booking links and authentic Meta creative; test PMax/AI Max expansion after reliable booking signals and property-specific URL controls. September 30, 2026 third-party-rate retirement changes the feed strategy.

**BOARD-013 — PROPOSED:** optimize incremental fulfilled contribution, use valid timely booking signals with adjustments, and distinguish attributed from causal outcomes. Explicit sample/stopping/guardrail rules replace unconditional 24-hour DCO winners.

**BOARD-014 — PROPOSED:** bounded AI responsibilities and observable provider mutations; no invented facts/forecasts, self-authorized spend or unsupported successful evaluation.

**BOARD-015 — APPROVED experience ambition / PROPOSED implementation:** engaging, interactive premium host/admin setup with micro-animation. Specific designs/libraries remain unselected. Prefer existing Motion where adequate; introduce GSAP/Three.js only for justified interaction with performance/accessibility evidence. Local concept is illustrative, not accepted production UI.

**SOURCE VERIFIED:** H-048–H-052 expand the Google implementation audit; previous version-only migration shorthand is incomplete. [Research](BOOKING_GROWTH_RESEARCH.md) records primary sources, conflicts and limitations. Existing marketing readiness remains 2/10; no tests or source changes closed findings.

### Discussion 007 — Paid host campaign funnel audit, 13 September 2026

**HARVO-010 — APPROVED scope instruction:** the founder requested detailed current Host Dashboard/Marketing Engine analysis, including AI optimization, admin final confirmation, paid Meta publication, reporting transparency, ratings and production ideas. This remains Phase 1; it does not authorize implementation or a phase transition.

**SOURCE VERIFIED / TEST OBSERVED:** [PAID_CAMPAIGN_AUDIT.md](PAID_CAMPAIGN_AUDIT.md) records the actual paths, limitations, H-034–H-047 and selected validation. The earlier assumption that the main remaining task was stress-testing is superseded by concrete correctness failures: simulated persisted analytics, fabricated proof, approval manufacturing paid state, daily/total budget confusion and broken wallet/telemetry calls. No deployed incident is asserted.

**BOARD-009 — PROPOSED:** separate immutable creative approval, verified funding/reservation, risk clearance, provider creation/activation and observed delivery; one truthful metric contract and externally verified DCO action state. Production-readiness rating 2/10 is the assistant's evidence-based judgment, not founder approval or a milestone percentage.

**BOARD-010 — PROPOSED:** prioritize host contribution, budget control, genuine optimization evidence and repeat purchase over refuel urgency. The approved C × p markup formula is unchanged. Exact cost/tax and variance treatment remain open; no live rate was set.

**Change boundary:** documentation and isolated source diagnostics only. No application/schema/API/financial-contract change; no engineering phase advanced. Full project line-by-line review remains unfinished.

### Discussion 006 — Cost denominator selected, 13 September 2026

**HARVO-009 — APPROVED:** Founder explicitly chooses profit on campaign costs. Profit = C × p; charge for the defined cost base = C × (1 + p). At 5% on ₹10,000 costs: ₹500 profit, ₹10,500 charge. This supersedes the margin-on-charge option and assistant's previous preference for that option. Separate Flex/Growth booking terms remain unchanged. No live rate or code change authorized by this Boardroom clarification.

**OPEN-FEE-002 — RESOLVED:** Expenses recovered first; profit percentage calculated on campaign costs. Do not repeat this question.

**OPEN-FEE-003 — PARTIALLY RESOLVED:** Denominator resolved as costs. Recognized cost/tax scope, charge-dependent processor fees, allocation, rounding, quote/variance/refund rules and rollout remain open. Historical OPEN-FEE-001's additive/gross-split debate is superseded for future design by HARVO-008/009; treatment of accepted legacy contracts remains pending.

### Discussion 005 — Profit after campaign expenses, 13 September 2026

**HARVO-008 — APPROVED founder business direction:** The admin-selected 3–5% should be retained after campaign expenses, explicitly including Meta/Google expenses and applicable taxes, rather than being a fee that must subsequently cover those costs. This replaces the previous fixed 15% advertising-fee direction for future design; separate Flex booking commission remains. It does not authorize a code/live-rate change or establish final tax/cost allocation, fee earning/refund rules or the percentage denominator.

**OPEN-FEE-002 — PARTIALLY RESOLVED:** Cost recovery before campaign profit is now selected. Fee-inclusive-of-costs interpretation is superseded. Percentage of cost versus percentage of the campaign charge remains open; do not ask the founder again whether costs come out of the 3–5%.

**BOARD-019 — SUPERSEDED:** Assistant's prior 5% management-fee-includes-costs suggestion is not the selected model. Preserve historical sensitivity calculations rather than apply them to the new model.

**OPEN-FEE-003 — OPEN:** Define denominator, recognized campaign cost categories, recoverable versus nonrecoverable taxes, overhead allocation, payment-cost gross-up, rounding, quote limits and treatment of actual-cost variance. Campaign profit is distinct from host profitability and company-wide net profit.

### Discussion 004 — Introductory advertising fee, 13 September 2026

| ID | Understanding / proposal | Status |
|---|---|---|
| HARVO-007 | Founder wants evolving logic clearly maintained, including replacement of old ideas when decisions change | APPROVED maintenance preference; preserve superseded history alongside current policy. |
| BOARD-018 | Admin-configurable introductory advertising profit/fee of 3–5%, with separate 15% booking commission | FOUNDER PROPOSAL for evaluation; not a final rate or implementation authorization. |
| OPEN-FEE-002 | Does 3–5% mean management fee with Encho absorbing costs, or disclosed cost recovery plus markup; on which base? | UNRESOLVED; clarification requested. No new charges assumed approved. |
| REVIEW-004 | Previous host-loss table is hypothetical, not actual Encho results; reducing fee alone leaves the example negative | CALCULATED: −₹1,500 at 5%, −₹1,300 at 3%, −₹1,000 at 0%, under stated assumptions. |
| BOARD-019 | Consider a bounded 5% introductory management-fee pilot only if Encho cost/subsidy limits support it | ASSISTANT PROPOSAL, not an optimal-rate claim; distinguish Flex/Growth and disclose renewal terms. |
| BOARD-020 | Admin sets versioned commercial policies; actual profit is reconciled, not guaranteed by a slider | PROPOSED design; separate tax rules, revenue, recovered costs and estimates; prospective snapshots/audit. |

See HARVO section 21. This develops OPEN-FEE-001 without resolving it or superseding INHERITED-006. No tax rule, guest surcharge, Growth exception removal, code or live-rate change was approved. Current administrative commission controls do not prove the proposed profit calculation exists.

### Discussion 003 — Marketplace success and precedents, 13 September 2026

| ID | Understanding / proposal | Status |
|---|---|---|
| HARVO-006 | Founder reaffirms integrated host advertising, direct property guest booking and admin management | APPROVED intent; no phase transition. Narrative guest/admin “phases” interpreted as product areas. |
| REVIEW-002 | Etsy validates managed execution but pays upfront and charges attributed sales; Encho host prepayment assigns risk differently | VERIFIED primary-source distinction; no financial-model replacement. |
| REVIEW-003 | Slice's current offering includes merchant-branded sites and merchant customer-data ownership; fixed radius/master identity/app-only precedent not established | VERIFIED current product claims and explicit limits. |
| BOARD-012 | Evaluate success by incremental fulfilled booking contribution and host voluntary repeat funding | PROPOSED; refine BOARD-001/005 using actual host economics and attribution limitations. |
| BOARD-013 | Use outcome-focused campaign setup and bounded learning budgets with evidence-based pause/review | PROPOSED; no new budget automation or promised return. |
| BOARD-014 | Preserve gallery quality while putting suitability, dates, room choice and total-price clarity first | PROPOSED guest experience direction; existing truth requirements still binding. |
| BOARD-015 | Prioritize admin work by customer harm and unresolved financial/operational obligations | PROPOSED; each action needs existing auth, audit and state-machine protections. |
| BOARD-016 | Validate a focused destination/trip/host cohort before expanding acquisition and infrastructure | PROPOSED; destination, supply, budget and staffing unknown. |
| BOARD-017 | Consider modular application boundaries and separate worker operations before a broad infrastructure rewrite | PROPOSED architecture discussion only; implementation needs normal impact analysis/phase authorization. |

See HARVO section 20 for assumptions, sample economics, product proposals and source coverage. No founder answer has resolved OPEN-FEE-001; no "world's most profitable" or numerical business rating is accepted as fact.

### Discussion 002 — Boardroom working agreement, 13 September 2026

**HARVO-005 — APPROVED communication preference:** Founder explicitly requests candid challenge across strategy, investment, marketing, operations, engineering and behavioral considerations throughout the eventual production upgrade. Avoid reassurance unsupported by evidence; explain ratings and disagreements, offer stronger alternatives and revise the assistant's own conclusions when warranted. Record evolving discussion understanding in HARVO. This changes the collaboration style, not the product architecture, approved fee rule, acceptance status or current Phase 1. No implementation began and OPEN-FEE-001 remains unresolved.

### Discussion 001 — 13 September 2026

| ID | Statement | Status / rationale |
|---|---|---|
| HARVO-003 | Reaffirm living HARVO and integrated listing → managed advertising → guest landing/gallery → nightly booking vision | APPROVED founder intent; implementation completeness is not implied. |
| HARVO-004 | Hosts require comprehensive and prompt transparency into their own provider campaign activity | APPROVED product intent. Exact API coverage/freshness SLA remains to be specified; other tenants and master secrets stay private. |
| BOARD-009 | Treat zero-delay complete provider reporting as unattainable promise; expose observed/confirmed/reconciled state and freshness | PROPOSED interpretation of HARVO-004; supported by provider reporting constraints. |
| BOARD-010 | Prioritize correctness, financial safety, recoverability, measured speed and release evidence | PROPOSED quality framework in HARVO section 19; no phase/milestone transition. |
| OPEN-FEE-001 | Latest founder example uses 15% of gross, conflicting with inherited media-plus-15% approval | UNRESOLVED, not an explicit policy replacement. Preserve INHERITED-006 until the founder decides. |
| REVIEW-001 | Google v16, mandatory SERIALIZABLE, synchronous-webhook and Redis-only worker diagnoses are not adopted verbatim | Corrected against current source and official documentation in HARVO section 19. Real concurrency/production behavior remains unverified. |
| BOARD-011 | A reliable stays/Meta launch with Google deferred is the proposed first scope decision | PROPOSED; existing Google containment remains binding. |

The founder's message includes a recommendation to enter Phase 4 alongside an explicit request to discuss in the Boardroom and report readiness. Current task remains Phase 1 discussion/documentation; no implementation was undertaken. Subsequent explicit phase instructions can change this.

Use a new stable ID, date, exact decision/assumption, who established it, status, rationale/evidence, affected flows, superseded entry, and required verification. Update HARVO's relevant current section in the same task. Do not append disconnected chat transcripts or secret-bearing operational logs.

### Discussion 011 — Continuous execution, 13 September 2026

**HARVO-013 (APPROVED, founder):** Complete all remaining marketing milestones without routine confirmation breaks. Supersedes the response-level limit in HARVO-012/AGENTS, preserves accurate milestone evidence and existing external/guest legal requirements. Root may coordinate parallel bounded implementations and independently verify integration. This is execution authorization, not evidence of real provider delivery, legal sign-off or successful commercial outcomes.

### Engineering execution record — 13 September 2026

Under approved HARVO-013, the implementation uses immutable revisions, an independent cost-plus finance ledger, genuine provider transport/identities, fenced durable jobs and quarantined remote ambiguity, minimal signed event envelopes, bounded AI/human review, immutable upload contracts and truthful host/admin projections. This is an implementation record and local acceptance judgment, not a new founder approval of legal/account terms. Exact ADRs and incident findings are synchronized in Constitution section 20. Five milestones are locally verified; the remaining five retain their incomplete acceptance dependencies. Future discussion must use the current plan/verification and preserve the explicit gap between source availability and live outcomes.

### Discussion 012 — Current Vercel deployment and experience evaluation, 13 September 2026

**HARVO-014 (APPROVED evaluation scope, founder):** Assess whether pushing the current project to GitHub and deploying on Vercel lets hosts successfully advertise through Encho's Meta/Google accounts; rate host and admin experiences. This requests evaluation and continuing blueprint maintenance, not an immediate deployment or paid pilot.

**EVAL-VERCEL-001 (SOURCE VERIFIED):** The current Vercel configuration has only a daily rewarm cron and HTTP functions. HARVO publication/control/payment/refund/telemetry depend on the separately executed marketing worker. The current deployment does not start that worker. Last configured-database inspection also found missing inventory/HARVO tables and an application role bypassing RLS. See HARVO section 29 and the continuous verification report. No production incident is asserted.

**EVAL-UX-001 (REVIEWER JUDGMENT):** Current local visual presentation 8/10, host setup usability 6/10, admin review experience 7/10; current Vercel paid-launch readiness 2/10. Technical targeting input and incomplete operational integrations constrain the experience. Ratings are scoped subjective judgments, not customer research, a 50% milestone conversion, or live certification. Historical UI/provider defects must be read against the latest v2 remediation record.

**EVAL-DEPLOY-001 (RECOMMENDATION):** Validate web/API on Vercel and operate the existing worker as a separately supervised Node process against the migrated least-privilege database. Alternatively design and verify a durable serverless job adaptation. Neither topology has been deployed or accepted by this evaluation. Actual configuration, signed payment lifecycle, canonical checkout, final billing, observability and bounded per-provider pilot remain required.

### Discussion 013 — Hosting recommendation, 13 September 2026

**HARVO-015 (APPROVED guidance scope, founder):** Compare Vercel, Cloudflare and suitable alternatives, recommend next steps and maintain the blueprint. No specific hosting purchase or DNS/database migration has been completed or accepted.

**DEPLOY-REC-001 (RECOMMENDATION):** Prefer Render web/API plus a separate Render HARVO worker while retaining Neon and S3. This refines EVAL-DEPLOY-001's deployment options after review of the conventional Express/native-media runtime and current packaging. Vercel plus a worker remains viable; no blanket platform inadequacy is asserted. Use the hosting/rollout guide for current source evidence and provider documentation.

**DEPLOY-FIND-001 (SOURCE VERIFIED, REMEDIATION OPEN):** Existing Dockerfiles use an EOL Node major, the worker image starts the legacy worker, environment-file exclusions are incomplete, and public/backend build outputs overlap. Disabling legacy loops also disables the canonical expired-hold sweeper. Correct these before deploying; no production disclosure, lost booking or incident is inferred. Guidance changed documentation only, with no new test/deployment acceptance.

### Discussion 014 — Hypothetical post-hosting readiness, 13 September 2026

**HARVO-016 (APPROVED evaluation scope, founder):** Assume prior hosting guidance has been completed and rate production readiness of the implemented plan. This is a hypothetical premise, not observed deployment acceptance.

**EVAL-CONDITIONAL-001 (REVIEWER JUDGMENT):** Approximately 5/10 if infrastructure, packaging, schema/roles and configuration are correctly complete but recorded functional/live-acceptance gaps persist. Approximately 8/10 is conditional on remaining critical integrations and a verified bounded launch pilot; approximately 9/10 additionally requires representative production operation/recovery evidence. Ratings refer to the reviewed marketing-to-booking architecture and are neither averages of milestone completion nor certifications of the entire repository. Missing critical gates still prevent unrestricted paid launch regardless of a numerical score. See HARVO section 31. No actual milestone, production finding or acceptance status is changed by this scenario.

### Discussion 015 — Remaining-gap execution, 13 September 2026

**HARVO-017 (APPROVED, founder):** Resume continuous execution and verification to close all remaining documented marketing production gaps. Apply the existing no-routine-permission instruction; do not reinterpret the hypothetical hosting premise as observed deployment. Follow GAP_CLOSURE_EXECUTION.md and bounded component impact plans, preserving verified financial/provider/checkout authority and accurate milestone evidence. A 10/10 aspiration is not acceptance evidence.


### HARVO-017 — Implementation evidence refinement

The authorized gap-closure execution adopts ADR-HARVO-MKT-006 through009 in Constitution20: private server artifacts/explicit worker ownership; documentary independent financial closure; claimed canonical conversion delivery; provider-resolved targeting and grounded human-applied AI guidance. The 3–5% rate remains profit markup on the defined cost base, separately from booking commission. Neither documentary upload nor provider PAUSED status certifies absolute final billing. Existing legal/checkout/provider gates remain. Actual deployment is founder-reported, with remote acceptance not yet observed. See GAP_CLOSURE_VERIFICATION.md for source-aligned verification and unfinished criteria; no 10/10 score is approved.

### Discussion 016 — Click-by-click hosting rollout, 13 September 2026

**HARVO-018 (APPROVED guidance scope, founder):** Provide the best hosting option and exact account-side setup path. This authorizes the founder to create staging infrastructure; it does not report that Codex created or verified any external service.

**DEPLOY-REC-002 (CURRENT):** Render paid Web Service plus a separate Render paid Background Worker is the recommended first production topology for the compiled Express/React app and durable HARVO consumer. Neon Postgres, S3 and the existing DNS provider remain. Cloudflare is deferred to DNS/immutable-media edge delivery after staging. Vercel remains viable only with a separately supervised worker; Cloudflare Workers/Containers require a runtime port and new acceptance.

**DEPLOY-GUIDE-002:** The founder sequence is private GitHub repository → isolated Neon staging branch/restore check → Render Blueprint from `render.yaml` → one web and one worker service → server-only secrets → migrations 009–016 and RLS/role check → liveness then readiness health → custom domain/DNS → no-spend smoke → bounded real-provider/payment/booking pilot. Stop gates remain cost/legal/checkout, provider identity, canonical conversion, final billing and live pilot evidence. Hosting status must remain separate from milestone completion and production-readiness scoring.
