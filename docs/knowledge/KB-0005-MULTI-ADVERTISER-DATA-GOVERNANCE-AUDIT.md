## Knowledge ID
KB-0005

---

### Topic
Phase 1: Multi-Advertiser Architecture & Data Governance Audit

---

### 1. Current Architecture
The current ENCHO Meta Campaign Engineer operates on a **Single Master Account** architecture.
- All outbound Graph API requests utilize global environment variables (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_INSTAGRAM_ACCOUNT_ID`).
- API requests do not dynamically resolve advertiser-owned or host-owned Meta asset identities.

---

### 2. Current Ownership Model
- **PostgreSQL Representation:** Host ownership is represented purely internally via `host_id` on tables like `host_marketing_campaigns`, `host_social_posts`, and `listings`. 
- **Meta Representation:** Host ownership is **not** represented in Meta. Meta sees all campaigns, ad sets, and creatives as belonging solely to ENCHO's central Business Manager and Master Ad Account.

---

### 3. Current Multi-Tenant Model
- Multi-tenancy is enforced at the database query level for CRUD operations (e.g., `WHERE c.host_id = $2`).
- Multi-tenancy is **broken** at the AI contextual level (The Learning Engine queries globally).
- Multi-tenancy is **non-existent** at the Meta Graph API level (All traffic flows through one Ad Account).

---

### 4. Meta Asset Ownership Map
- **ENCHO Owns:** Business Manager, Master Ad Account (`act_1681483723153196`), Facebook Page (`554884541034223`), Instagram Account, Meta Pixel, all campaigns, ad sets, ads, and lead forms.
- **Individual Hosts Own:** Nothing on Meta's infrastructure. They only own internal DB records linking to ENCHO's Meta assets.

---

### 5. Data Classification
- **A. Platform Engineering Knowledge:** Meta Policy markdown files (Safe to share globally).
- **B. Aggregated Campaign Performance:** Currently not aggregated safely; raw payloads are used.
- **C. Advertiser-Specific Data:** Budgets, schedules, targeting (Commingled in AI).
- **D. User/Lead Data:** CRM Leads (Isolated by `host_id` in CRM queries, but Lead Forms are attached to the Master Page).
- **E. Meta-Derived Data:** `meta_api_traces` responses (Leaked globally to AI).
- **F. Targeting Data:** Locations, personas (Leaked globally to AI).
- **G. PII:** If present in traces, leaked globally to AI.
- **H. Sensitive Campaign Information:** Approval hashes (Isolated).

---

### 6. Learning Engine Data Flow
**CRITICAL FLAW DETECTED.**
The current `server.ts` executes:
`SELECT step, request_payload, response_payload FROM meta_api_traces WHERE http_status >= 400 ORDER BY created_at DESC LIMIT 5`
This query lacks a `WHERE host_id = req.user.id` clause.
**Result:** Host A's campaign trace (including target locations, copy, budgets, and Meta error messages) is injected into the Gemini context window when Host B clicks "AI Pre-Check". The AI can hallucinate or explicitly reveal Host A's strategies or PII to Host B.

---

### 7. Cross-Tenant Risk Analysis
- **Host A accessing Host B Campaign:** Blocked (DB level).
- **Host A modifying Host B Campaign:** Blocked (DB level).
- **Host A accessing Host B trace via AI:** **VULNERABLE** (Learning Engine global query).
- **Host A accessing Host B Meta credentials:** Not applicable (credentials are global).
- **Host A publishing via Host B Ad Account:** Not applicable (only one Ad Account exists).

---

### 8. Meta Account Architecture Risk
**CRITICAL POLICY VIOLATION.**
The Master Ad Account model violates Meta's Multi-Advertiser policies (Section AB). Running multiple distinct real estate hosts/businesses through a single Ad Account and Facebook Page is considered Circumventing Systems or Inauthentic Behavior. This risks a permanent Business Manager and Ad Account ban.

---

### 9. Admin Override Risk
**HIGH RISK.**
When an Admin hits `POST /api/admin/marketing/campaigns/:id/approve`, the system:
1. Overwrites `status` to `active`.
2. Sets `admin_approved = true`.
3. Dispatches to Meta.
This bypasses the AI Gatekeeper entirely. The Preflight Engine checks `if (campaign.status === 'rejected')`, but the Admin approval forcefully removes the 'rejected' status, neutralizing the safety gate.

---

### 10. Required Database Changes
- `host_meta_identities` table needed to map `host_id` -> `meta_ad_account_id`, `meta_page_id`, `meta_ig_account_id`.
- `meta_api_traces` must include `host_id` for tenant-isolated queries.
- `host_marketing_campaigns` must store `owner_meta_ad_account_id` as an immutable reference upon creation.

---

### 11. Required API Changes
- Update Learning Engine 2.0 to enforce `WHERE host_id = $1` on all trace queries.
- Remove global `process.env.META_AD_ACCOUNT_ID` usage for campaign publishing. Fetch dynamically via Host Meta Identity mapping.
- Lead Form webhook intake must verify Lead Form ownership against Host mapping before routing to CRM.

---

### 12. Required Preflight Changes
- **Ownership Gate:** Assert that the Campaign's `host_id` owns the `AdAccountID` and `PageID` about to be dispatched.
- **Admin Bypass Fix:** Admin approval must run the AI Gatekeeper synchronously OR Preflight must check an immutable `policy_cleared` flag independent of `admin_approved`.

---

### 13. Required Regression Tests
- AI Context Isolation Test (Verify Host A cannot see Host B traces).
- Ownership Mismatch Dispatch Test (Assert Graph API is not called if host doesn't own Ad Account).
- Admin Bypass Prevention Test (Admin cannot approve a campaign containing Walled-Garden violations).

---

### 14. Unknowns Requiring Meta Verification
- **UNKNOWN:** Does Meta require ENCHO to use the "System User" token pattern, or standard OAuth per-host for Ad Account provisioning?
- **UNKNOWN:** Can ENCHO programmatically create Ad Accounts on behalf of hosts using Business Manager API, or must hosts Bring-Your-Own-Account (BYOA)?

---

### 15. Recommended Target Architecture
A **Multi-Ad Account (Hub and Spoke) Model**:
1. ENCHO Business Manager acts as the Agency (Hub).
2. Each Host has a dedicated Meta Ad Account (Spoke).
3. `server.ts` dynamically pulls `host_meta_identities.ad_account_id` during Preflight.
4. The Learning Engine is tenant-isolated.
5. All AI interactions have Walled-Garden and Policy rules deterministically verified in Preflight, impossible to bypass via Admin approval.

---

### 16. GO / NO-GO Recommendation
**NO-GO FOR PRODUCTION PUBLISHING.**
The current architecture poses severe data governance leaks and explicit Meta Policy violations. Code modifications must be frozen until the Multi-Advertiser identity model is implemented. Phase 1 implementation (Data Governance boundary fixes and Preflight Hardening) should proceed immediately.
