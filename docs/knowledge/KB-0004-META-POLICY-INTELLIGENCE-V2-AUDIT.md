## Knowledge ID
KB-0004

---
### Topic
Meta Policy Intelligence V2 Audit

---
### Problem
An architectural and policy audit of the ENCHO Meta Campaign Engineer reveals significant gaps in Meta Advertising Standards compliance, Master Ad Account safety, Data Governance, Landing Page inspection, and Lead Ads validation.

---
### 1. META POLICY COVERAGE MATRIX
| Policy Domain | Implemented? | Location | Enforcement Method | Enforced Pre-Approval? | Enforced Pre-Dispatch? | AI False Pass Risk? | Bypass Risks | Source/Version Recorded? | Regression Test? | Audit Trail? | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-S (Unacceptable Content, Discrim, etc.) | Partial | `ai-check` & `checkout` endpoints | AI-based | Yes | No | Yes | Admin can bypass | No / No | No | No | CRITICAL |
| T (Video / Creative) | Partial | `ai-check` endpoint | AI-based | Yes | No | Yes | Admin can bypass | No / No | No | No | HIGH |
| U (Lead Ads) | No | N/A | None | No | No | N/A | N/A | No / No | No | No | CRITICAL |
| V (Targeting) | Partial | `ai-check` & Preflight | AI & Deterministic (Radius) | Yes | Yes (Radius only) | Yes | Admin can bypass AI | No / No | Yes (Radius) | No | HIGH |
| W-Z (Business Integrity, Spam, etc.) | No | N/A | None | No | No | N/A | N/A | No / No | No | No | CRITICAL |
| AA (Data Restrictions) | No | Learning Engine | AI-based | Yes | No | N/A | N/A | No / No | No | No | CRITICAL |
| AB (Multi-Advertiser / Client Accounts) | No | System Architecture | None | No | No | N/A | N/A | No / No | No | No | CRITICAL |
| AC (EU Beneficiary) | No | N/A | None | No | No | N/A | N/A | No / No | No | No | HIGH |
| AD (Version/Change Mgmt) | No | N/A | None | No | No | N/A | N/A | No / No | No | No | MEDIUM |

---
### 2. CRITICAL GAPS
1. **Multi-Advertiser Architecture (Policy AB):** ENCHO's Master Ad Account architecture violates Meta's Multi-Advertiser requirements. Meta explicitly prohibits running ads for multiple advertisers/clients through a single established ad account. Each host must have their own ad account.
2. **Data Governance / Commingling (Policy AA):** The Learning Engine globally queries `meta_api_traces` and passes `request_payload` and `response_payload` into the AI context for all hosts. This commingles advertiser data and risks exposing targeting, creative, and performance data across hosts.
3. **Admin Bypass of AI Policy Gates:** The AI Gatekeeper sets `status = 'rejected'` if an ad fails, but an Admin can directly approve a rejected campaign, overwriting the status to `active` and bypassing all AI policy checks. The Meta Preflight engine relies on `status === 'rejected'` to catch policy failures, which fails if the admin approved it.
4. **Lead Ads Form Content Validation (Policy U):** The system stores a `meta_lead_form_id` but performs zero inspection of the actual lead form questions, potentially violating policies on requesting restricted personal attributes.

---
### 3. HIGH-RISK GAPS
1. **Landing Page Inspection:** The Landing Page Inspector only checks HTTP status and HTTPS. It does not evaluate the landing page content for relevance, deceptive claims, prohibited content, or brand identity.
2. **AI Hallucination False Passes:** The AI Gatekeeper relies entirely on LLM prompts to enforce complex legal policies (e.g., Unacceptable Content, Drugs, Discriminatory Practices) without deterministic fallbacks, making it vulnerable to prompt injection or hallucination.
3. **Account Safety:** Utilizing a Master Ad Account for all user-generated content without strict Meta compliance checks exposes the master account to suspension, halting operations for all hosts.

---
### 4. MEDIUM/LOW GAPS
1. **Policy Versioning:** `docs/meta` contains fragmented markdown files (`CREATIVE_POLICY.md`, `HOUSING_POLICY.md`) without version tracking or source links, risking stale enforcement.
2. **EU Beneficiary/Payor Requirements:** Missing fields for EU digital services act compliance if campaigns target the EU.

---
### 5. CURRENT IMPLEMENTATION MAP
- **AI Gatekeeper (`/api/marketing/campaigns/:id/ai-check` & `checkout`):** Evaluates copy, Walled-Garden (contact leaks), and prompt injection via AI.
- **Admin Approval (`/api/admin/marketing/campaigns/:id/approve`):** Generates SHA256 snapshot, changes status to `active`. Does not run AI check.
- **Preflight Engine (`runMetaPreflightEngine`):** Deterministically enforces 13 gates (budget > 100, radius > 25km, snapshot integrity, status != rejected).
- **Learning Engine:** Injects recent `meta_api_traces` into AI prompt.
- **Landing Page Inspector:** Fetch request checking for HTTP 200 and HTTPS.

---
### 6. ACCOUNT SAFETY FINDINGS
**NOT COMPLIANT.** ENCHO's Master Ad Account architecture exposes the entire platform to a single point of failure. Meta's Advertising Policies (Section: Advertising policies affecting business assets) state: *"If you are managing ads on behalf of other advertisers, each advertiser or client must be managed through separate ad accounts."* ENCHO cannot use a single `act_1681483723153196` to run all hosts' ads.

---
### 7. DATA GOVERNANCE FINDINGS
**CRITICAL RISK.** The Learning Engine 2.0 implementation in `/api/marketing/campaigns/:id/ai-check` executes `SELECT step, request_payload, response_payload FROM meta_api_traces` globally. This injects Host A's potentially sensitive campaign parameters into the Gemini context window when evaluating Host B's campaign, constituting a severe data leak and violation of Meta's Data Use Restrictions (Section AA).

---
### 8. MULTI-ADVERTISER ARCHITECTURE FINDINGS
As noted in Account Safety, ENCHO's single master ad account model explicitly violates Meta's Multi-Advertiser requirement. Each Host must have a dedicated Ad Account linked under the ENCHO Business Manager, or ENCHO must operate as an Agency requesting access to the Host's owned Ad Account.

---
### 9. LANDING PAGE FINDINGS
The current Landing Page Inspector is superficial. It confirms the URL resolves (HTTP 200) but fails to assess policy compliance on the destination page (e.g., disruptive content, relevance to ad creative, privacy policy visibility).

---
### 10. LEAD ADS FINDINGS
The system handles Lead Ads by persisting `meta_lead_form_id` but never requests or inspects the form's schema via the Graph API. This leaves ENCHO blind to whether the host is requesting prohibited personal attributes (e.g., Government ID, sexual orientation).

---
### 11. POLICY VERSIONING RECOMMENDATION
Upgrade `/docs/meta` to a versioned registry:
```
/docs/meta/policies/
    advertising-standards/
    special-ad-categories/
    targeting/
    creative/
    landing-page/
    lead-ads/
    business-integrity/
    data-use/
```
Each file should include the Policy Source URL, Last Updated Date, and a Version string.

---
### 12. REQUIRED ENGINEERING CHANGES
1. **Architectural Redesign:** Transition from a Master Ad Account to a Multi-Ad Account model (one ad account per host/listing).
2. **Data Governance:** Scope the Learning Engine queries in `server.ts` to `WHERE host_id = req.user.id`.
3. **Hardened Preflight:** Execute the AI Gatekeeper *within* `runMetaPreflightEngine` deterministically, removing the ability for an Admin to bypass the AI policy checks.
4. **Deep Landing Page Inspection:** Enhance the AI Gatekeeper to scrape and analyze the landing page DOM against Meta policies.
5. **Lead Form Validation:** Implement Graph API fetches to validate `meta_lead_form_id` questions before approval.

---
### 13. REQUIRED REGRESSION TESTS
- Data isolation tests for the Learning Engine (Host A cannot see Host B's traces).
- Preflight failure test when Admin approves a campaign that violates AI policy.
- Lead Form schema validation tests.
- Landing page policy simulation tests.

---
### 14. REQUIRED META DOCUMENTATION STILL NEEDED
- Multi-Advertiser Account provisioning workflows via Graph API.
- Lead Ads schema and question restriction list.
- Meta Advanced Access requirements for programmatic Ad Account creation.

---
### 15. FINAL POLICY READINESS SCORE
**2.5 / 10 (Critical Compliance Failure)**
The current implementation possesses structural architecture flaws (Master Ad Account), severe data leaks (Learning Engine), and bypassable enforcement mechanisms (Admin override) that render the platform highly vulnerable to Meta Business Manager restriction.
