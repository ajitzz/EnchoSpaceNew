# CR1 External Gate Register

**Date:** 23 September 2026  
**Purpose:** distinguish executable engineering work from evidence Encho cannot manufacture in source code

An `OPEN` gate does not stop unrelated local implementation. It blocks only the release action named in its stop condition. A gate closes through the evidence column, never through an optimistic status edit.

| Gate | Current verified state | Required owner | Evidence required to close | Stop condition while open |
|---|---|---|---|---|
| ENV-01 Isolated staging | **OPEN.** The founder previously confirmed that staging is not configured. Generic `.env`/`.env.local` Neon endpoints are not staging evidence. | Infrastructure owner | Named isolated branch/project, restricted web/worker URLs stored in a staging-only secret source, deployment identity, retention/reset policy and successful restore drill | No staging claim, remote migration rehearsal, provider canary or production cutover |
| DB-01 Restricted runtime | **LOCAL EVIDENCE ONLY.** Disposable PostgreSQL tests show non-superuser/non-`BYPASSRLS` patterns; exact deployed web and worker principals remain unproved. | Database/Infrastructure owner | Read-only receipt from each deployed runtime login showing `rolsuper=false`, `rolbypassrls=false`, required grants, FORCE RLS catalog readiness and no owner membership/`SET ROLE` path | No production-readiness certification for sensitive multi-tenant expansion |
| LEGAL-01 India commerce/tax | **OPEN.** No written Indian CA/tax-lawyer sign-off is present. | Founder + qualified Indian CA/tax lawyer | Written decision for quote/order/invoice tax treatment, cancellation/refund, marketplace/merchant-of-record classification, payouts, withholding and record retention | No M5/M6B acceptance or live customer-capital booking/payment launch |
| PROV-G-01 Google advertiser topology | **OPEN/STALE EVIDENCE.** Historical screenshots and discussion do not prove current Basic Access, advertiser-of-record classification or the permitted account/customer topology. | Founder + Google Ads account owner/provider counsel | Current authenticated access level, developer-token status, account hierarchy, customer/advertiser mapping, allowed API operations and paused create/readback evidence | No Google live activation or universal control claim |
| PROV-M-01 Meta advertiser topology | **OPEN.** Source has versioned capability contracts, but current business/app/ad-account eligibility and permissions are not externally verified for CR1. | Founder + Meta Business owner/provider counsel | Current app mode/review, business/ad-account/page/Instagram/pixel bindings, token permissions, feature eligibility and paused create/readback evidence | No Meta live activation or universal control claim |
| COMM-01 Advertising economics | **PARTIAL.** Cost-plus direction with an admin-selected initial 3–5% markup is accepted; the recognized cost basis and tax/variance/refund rules are incomplete. | Founder + Finance/Legal | Versioned definition of recognized cost `C`, markup bounds, tax, provider variance/overdelivery, cancellation, refund/wallet treatment, expiry and disclosure | No final campaign financial contract or customer-capital pilot |
| IAM-01 Workforce separation policy | **PARTIAL.** Scoped delegation is accepted; exact production role combinations and checker/step-up/amount thresholds remain open. | Founder + Security/Operations | Approved role catalog, forbidden combinations, checker thresholds, safety-pause asymmetry, owner bootstrap and access-review cadence | Implement deny-by-default safe baseline; no broad delegated production authority until approved |
| OPS-01 Support and service policy | **OPEN.** Staffing hours, inquiry SLA, escalation authority, retention and channel commitments are not fixed. | Founder + Operations | Published operating hours, SLA targets, escalation matrix, staff capacity, channel consent policy and privacy/retention schedule | No guaranteed response-time marketing claim or autonomous escalation beyond configured safe defaults |
| PILOT-01 Bounded CR1 pilot | **OPEN.** No isolated environment/account/offer set and stop-loss package is currently certified for the three-sided CR1 path. | Founder + Operations + Engineering | Named guest offer, host, staff actors, provider accounts, corridor, budget/stop-loss, rollback contacts, success/failure criteria and signed go/no-go receipt | No real spend, public launch or commercial-proof claim |
| PRIV-01 CRM/privacy policy | **OPEN.** Walled-garden intent is clear; automatic contact redaction, staff monitoring scope, retention and AI processing disclosure require explicit policy/legal authority. | Founder + Privacy/Legal + Operations | Approved contact-sharing/redaction policy, participant/staff disclosure, lawful basis/consent, retention/deletion, AI drafting/translation disclosure and access review | Preserve participant scoping and audit; do not silently censor or expose private conversation content |

## Closure protocol

1. Record the artifact by immutable path/hash or external receipt identifier without copying secrets into Git.
2. Name the environment, provider account scope, actor and timestamp.
3. Run the gate-specific readiness check and adversarial negative case.
4. Update this register, HARVO and the decision register with the exact evidence and limitation.
5. Advance only the phase/release action that the evidence actually unlocks.
6. Follow the comprehensive release protocols and sign-off matrices established in `docs/releases/CR1_PRODUCTION_RELEASE_MANIFEST_AND_EXTERNAL_GATE_DOSSIER.md`.


