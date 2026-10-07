# Managed Marketing — Founder-Approved Planning Boundary

**Decision:** DECISION-037-H2

**Status:** FOUNDER_APPROVED_PLANNING_BOUNDARY

**Date:** 7 October 2026

**Inspected canonical base:** `e2479b1c7601e21a6198b7784fa93ac3a4e27dad` (`codex/canonical-development`; local and live remote matched).

**Provenance:** The founder explicitly confirmed “yes” in this conversation to the managed-marketing product boundary, the six conservative planning directions below, and leaving the remaining commercial, staffing, legal/provider and implementation details unresolved. The founder's subsequent documentation instruction defines the approved scope recorded here; no chat identifier or implementation acceptance is asserted.

This decision refines DECISION-037-H1's accepted delegated-operations direction. It resolves the two preparation modes, owner/author distinction and conservative planning limits; it does not approve every recommendation in the preceding analysis. Earlier proposals remain historical records. The [Engineering Constitution](../ENCHO_ENGINEERING_CONSTITUTION.md), [three-sided blueprint](ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md), [workforce separation specification](../implementation/CR1_P2_IAM_TECHNICAL_DESIGN.md) and [external gates](../implementation/CR1_EXTERNAL_GATE_REGISTER.md) continue to control their domains. No material conflict was found in this bounded source review.

## Approved product boundary

Encho supports Host-guided campaign preparation and Host-requested managed setup through one Host-owned campaign system. An explicitly assigned and currently authorized Encho marketing planner may prepare supported drafts for the Host's eligible property or offer. The Host remains the economic owner; the actual author is the authenticated Host or workforce actor. AI assistance is recorded as assistance, never as an accountable principal.

A setup request authorizes preparation only. Assignment alone is not a domain execution permission. The authenticated Host must accept the exact material creative/commercial package and financial quote. Staff cannot supply that acceptance as the Host, increase accepted exposure or move Host money between campaigns.

Both modes reuse the same campaign/revision, review, finance, command, provider-readback and reconciliation authorities. Host acceptance, independent review, verified funding/risk, PAUSED provider creation, authenticated readback and guarded activation remain separate gates. Passing one does not manufacture another. Activation intent is not observed provider delivery.

## Six approved conservative planning directions

| Direction | Approved boundary |
|---|---|
| A. Preparation mandate and ownership | Require an explicit Host preparation request, canonical economic-owner resolution, actual authorship and current workforce/resource authorization. Keep preparation scope separate from execution and preserve the mandate and historical evidence. |
| B. Acceptance and optimization | Require exact package acceptance. Material changes require renewed Host acceptance and relevant review. No open-ended optimization permission. Only declared meaning-preserving technical compilation and authorized safety pause can avoid another commercial acceptance; other applicable gates remain. Safety pause grants no resume, exposure increase, subject change, new audience or fund-transfer authority. |
| C. Commercial service envelope | Distinguish media allocation from total Host charge. Use versioned, enumerated cost lines and accepted ceilings. No hidden extra-work billing or unlimited-service promise. An ambiguous Host amount must not silently become either an all-in charge or a media-only allocation. |
| D. Workforce separation | Preserve conservative independent-checker rules for protected actions; a small initial team does not relax them. Production role combinations, thresholds and staffing remain unresolved. |
| E. Monitoring and service | Plan bounded, staffed coverage, truthful observation age and explicit escalation ownership. Do not invent coverage hours, response targets, 24/7 monitoring or instant-pause guarantees. |
| F. Initial managed-setup pilot | Plan fixed-scope, separately accepted single-provider flights with truthful financial summaries. No pooled budget or silent transfer/reallocation. Top-up, statement/export and combined-allocation behavior need their own contracts. This pilot boundary does not remove planned full W7 obligations or authorize a pilot to run. |

## Still open — specification or external evidence required

- Mandate duration, expiry, withdrawal and handoff details.
- Detailed material-change classifications and any future preaccepted optimization envelope.
- Managed-service pricing and viable minimum commercial scope; recognized cost C, labor/revision/support treatment and cost recognition.
- Taxes, invoice treatment, refunds, earning and variance rules. Existing commercial rates and historical accepted contracts are unchanged.
- Production staff-role combinations and financial/step-up thresholds; staffing, coverage hours, response commitments and emergency responsibility.
- Provider advertiser/account eligibility and supported capability evidence; live payment/provider readiness and deployed permissions.
- Top-up, statement/export and combined-allocation contracts.
- Pilot economics, willingness to pay, retention and profitability. None is proved by this planning approval.

## Current implementation gaps — source evidence only

At the inspected base, the complete delegated setup workflow is not implemented:

- [Campaign creation](../../src/lib/marketing/workflow.ts) binds ownership and creation replay scope to `actor.id`; this is not an authorized staff-on-behalf-of-Host creation path. Existing [event evidence](../../src/lib/marketing/database.ts) already distinguishes Host and actor, so this decision does not claim author attribution is globally absent.
- The mounted [marketing router](../../src/server/marketing/router.ts) resolves consumer Host/Admin actors. Broad Admin access does not establish the required assigned workforce preparation authority. [AssignmentService](../../src/lib/iam/assignmentService.ts) explicitly supplies queue ownership, not a domain/provider execution grant.
- [Creative confirmation/review](../../src/lib/marketing/creativeWorkflow.ts) provides exact image evidence, not the complete delegated campaign-package handoff and acceptance contract. Mandate lifecycle and detailed material-change rules remain to be specified and implemented.
- Existing revision, finance, provider operation and monitoring foundations must be reused. Their presence is not proof of the connected managed workflow. The [deployed marketing composition boundary](../../src/server/marketing/runtime.ts) retains checkout/consent dependencies; the current public canonical Guest journey stops at a temporary hold.

These are bounded source observations, not a new runtime test result. The [integration ledger](../implementation/AGENT_INTEGRATION_LEDGER.md) remains unchanged: W4-C3 is the latest accepted engineering slice. Ongoing W4-C4 safety work retains its existing instructions and base.

## Placement in the existing program — planning only

| Wave | Managed-marketing placement and dependency |
|---|---|
| W5 | Offer/creative binding; both preparation modes; scoped staff authorship; owner/author separation; exact Host handoff/acceptance; material-change rules. Depends on canonical accommodation truth and workforce authority. |
| W6 | Bind the accepted package, independent review and financial authority to supported provider/account execution. Preserve PAUSED create, readback, activation, recovery and financial close; commercial/provider gates remain independent. |
| W7 | Host monitoring and change requests; assigned multi-Host exceptions; campaign-linked support; qualified canonical outcomes and financial summaries. Preserve separately gated planned top-up obligations. |
| W8 | Prove the connected restricted-role Host/staff/Guest journey, authorized external payment/provider operations, failure recovery and bounded pilot scope. Local source/tests cannot substitute for external evidence. |

This placement adds no wave, migration number, table or API contract. It neither starts W5 work nor changes W4-C4/W4-D sequencing or authority.

## Minimum future Host → staff → Guest journey

**Every demonstration below is REQUIRED / NOT YET RUN for this managed workflow.** These are future acceptance requirements, not claims that this task executed tests or deployed capability.

| Stage | Required durable authority and visible result |
|---|---|
| Host requests preparation | Bind the eligible owned subject and bounded preparation intent. Host sees requested scope; staff see an assignable request. No spend or provider execution is authorized. |
| Assigned planner prepares | Recheck workforce/resource authority; retain the Host as owner and staff as author, with AI assistance separately identified. Staff prepare only supported drafts; Host sees who prepared them. |
| Host reviews exact package and quote | Show creative, subject, dates, supported provider/targeting bounds, media allocation, total charge and enumerated ceilings. The authenticated Host accepts that exact revision or requests changes; stale previews cannot accept a different revision. |
| Independent review and finance/risk | Retain separate exact review, verified funding and risk evidence. Neither staff authorship nor Host consent substitutes for another gate. Material changes require the appropriate renewed acceptance/review. |
| PAUSED create → readback → activation | Execute the accepted command once through existing authorities; compare authenticated readback before guarded activation. Unknown provider outcomes enter reconciliation, not blind recreation. Host sees desired and observed state separately. |
| Monitoring and Guest booking connection | Show observation age, spend source, actions required and qualified outcomes. A campaign click preserves permitted context but cannot override current accommodation truth. The Guest must traverse canonical quote, hold, payment and reservation authority once that public paid path is separately accepted. |
| Support and financial close | Assigned staff handle campaign-linked cases and exceptions; pause requests differ from confirmed pause and never imply resume authority. Reconcile provider/financial evidence before a truthful close; provider conversions are not relabeled canonical bookings. |

Across the journey, future demonstrations must prove tenant isolation, no staff-supplied Host consent/spend, correct material-change invalidation, declared technical-compilation bounds, command/funding/provider idempotency, unknown-outcome recovery and independent financial isolation across multiple Host campaigns. Mandate expiry/withdrawal demonstrations depend on their still-open detailed contract.

## Exclusions and acceptance limits

This is a product/planning decision only: no application, test, migration, database, public-ingress or provider change; no live advertising, spending, deployment or new engineering-slice authorization. No W4-C4 change, W4-D/W5 implementation, integration-ledger acceptance row, canonical integration or main-branch update follows. No commercial rate, historical accepted contract, legal/provider gate or production-readiness percentage changes. Documentation review and remote visibility do not constitute delivery, deployed permissions or pilot acceptance.
