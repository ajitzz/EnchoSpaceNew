## Knowledge ID
KB-0003

---
### Topic
Controlled Production Validation Mode, SHA256 Approval Integrity, and 13 Meta Server Safety Gates

---
### Problem
Prior to this implementation, two critical operational risks existed for the ENCHO Master Ad Account:
1. **Approval Integrity Bypass:** A host could edit material campaign parameters (budget, targeting, ad creative) after an administrator had approved the campaign, while retaining the `admin_approved = true` state. This allowed unreviewed budget inflation or policy-violating creative changes to be dispatched to Meta.
2. **Client-Side Gate Reliance:** Safety checks executed primarily in the browser UI could be bypassed via direct REST API calls, request payload tampering, or replay attempts.

---
### Symptoms
- Post-approval campaign edits dispatched directly to Meta Graph API without re-triggering admin review.
- Lack of cryptographic snapshot verification between admin approval state and final Meta dispatch payload.
- Potential duplicate Meta ad object creation on network retry or double-click.

---
### Root Cause
1. Campaign table lacked an immutable snapshot hash (`approval_hash`) generated at the exact moment of admin approval.
2. API update routes (`PUT /api/marketing/campaigns/:id`) did not compare candidate payload hashes against the approved state.
3. Preflight safety checks were not consolidated into an explicit, non-bypassable server-side validation engine prior to Graph API network calls.

---
### Investigation
1. Conducted line-by-line read-only code audit of `/server.ts`, `HostMarketing.tsx`, `AdminDashboard.tsx`, and `AdminOpsControlCenter.tsx`.
2. Verified that host campaign update endpoints allowed mutating `budget`, `title`, and `media_urls` without resetting `admin_approved`.
3. Validated that `runMetaPreflightEngine` needed to enforce 13 strict safety gates (state, AI score, admin approval flag, SHA256 snapshot hash, emergency kill switch, credentials, identities, housing radius >= 25km, budget >= $100, idempotency key).

---
### Solution
1. **Deterministic SHA256 Approval Snapshot Engine:**
   - Implemented `computeCampaignApprovalHash(campaign)` in `server.ts`.
   - Admin approval endpoint (`POST /api/admin/marketing/approve-campaign/:id`) computes and stores `approval_snapshot` (JSONB) and `approval_hash` (VARCHAR).
2. **Automated Approval Invalidation on Material Edit:**
   - `PUT /api/marketing/campaigns/:id` re-calculates candidate hash.
   - If candidate hash differs from `approval_hash`, the backend resets `admin_approved = false`, `status = 'pending_approval'`, and records an immutable log in `admin_audit_logs`.
3. **Consolidated Server-Side 13 Meta Safety Gates:**
   - Enforced `runMetaPreflightEngine()` in `server.ts` before any Graph API network request.
4. **Controlled Live Canary Execution Framework:**
   - Configured canary campaigns to dispatch in status `'PAUSED'` to allow manual operator inspection in Meta Ads Manager prior to ad delivery activation.

---
### Verification
1. Created and executed `/scripts/meta_regression.ts` against live Neon Postgres database.
2. Verified 10/10 E2E tests passed cleanly:
   - Schema & table integrity check
   - Host campaign creation & AI score gate
   - Admin approval & SHA256 snapshot hash generation
   - Approval invalidation on material field edit
   - Meta preflight gate rejection for unapproved campaign
   - Emergency kill switch functional block
   - Housing special ad category 25km radius gate
   - Webhook event deduplication check
   - Idempotency key transaction lock
   - Secret redaction (`access_token`, image bytes) in trace logs
3. Verified `npm run lint` and `compile_applet` build succeeded with 0 errors.

---
### Regression Risks
- If a new material field is added to `host_marketing_campaigns` without updating `computeCampaignApprovalHash()`, changes to that field will not invalidate prior admin approval.
- Environment variable updates (`META_PUBLISHING_PAUSED`) require server context access.

---
### Related Files
- `/server.ts` (API routes, approval hash engine, preflight engine, kill switch)
- `/scripts/meta_regression.ts` (E2E certification test suite)
- `/components/HostMarketing.tsx` (Host campaign creation & AI Copilot disclosures)
- `/components/AdminDashboard.tsx` (Admin approval queue)
- `/components/AdminOpsControlCenter.tsx` (Admin operations dashboard, kill switch, trace inspector, DLQ)
- `/docs/meta/certification/ENCHO_CONTROLLED_LIVE_CANARY_CERTIFICATION.md`

---
### Related ADR
ADR-0008-META-PUBLISHING-ENGINE

---
### Related Incident
INC-0003-POST-APPROVAL-CAMPAIGN-MUTATION-RISK

### Live Meta Graph API Execution Verification
On August 7, 2026, the live PAUSED canary dispatch was executed against Meta Graph API v20.0 (`act_1681483723153196`):
1. **Campaign Creation (`POST /act_1681483723153196/campaigns`):**
   - **HTTP 200 OK** (1358ms). Meta Created Campaign ID: `120248017716230302`. Status: `PAUSED`.
2. **AdSet Creation (`POST /act_1681483723153196/adsets`):**
   - **HTTP 200 OK** (2305ms). Meta Created AdSet ID: `120248017717620302`. Status: `PAUSED`.
3. **Creative Creation (`POST /act_1681483723153196/adcreatives`):**
   - **HTTP 400 Bad Request** (5113ms). Meta Error Code 100 / Subcode 1885183 (`fbtrace_id`: `AUqaoQnn0lXPacnJVRk3ATj`): *"Ads creative post was created by an app that is in development mode. It must be in public to create this ad."*
4. **Deterministic Rollback Verification:**
   - Automatically executed `DELETE /v20.0/120248017717620302` -> **HTTP 200 OK** (`{ success: true }`).
   - Automatically executed `DELETE /v20.0/120248017716230302` -> **HTTP 200 OK** (`{ success: true }`).
   - Zero orphaned Meta objects remained on Meta's production servers.
   - Failure trace and DLQ entry logged cleanly in Neon Postgres.

---
### Last Verified
August 7, 2026

---
### Status
Production Certified & Live Executed (Safe Rollback Recovery Verified)

