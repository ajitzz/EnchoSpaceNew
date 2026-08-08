## Knowledge ID
KB-0006

---
### Topic
Meta Identity Architecture, BYOA OAuth Flow & Multi-Tenant Governance

---
### Problem
Multi-tenant property hosting platform required a legally compliant, scalable Meta advertising infrastructure. Commingling multiple host listings in a single ENCHO Master Ad Account risked platform-wide account suspension due to Meta's End-Advertiser Transparency policies, while programmatic Ad Account creation was blocked by Meta's hard limit of 5 API-created ad accounts per Business Manager.

---
### Symptoms
1. Controlled production canary failed with Meta Error Code `100` / Subcode `1885183` ("Ads creative post was created by an app that is in development mode. It must be in public to create this ad.").
2. Risk of account ban contagion: Policy violations on a single host's listing would disable advertising capabilities for all ENCHO hosts if using a single Master Ad Account.
3. Scaling wall: `POST /{business-id}/adaccount` rejected after 5 ad accounts created via API per Business Manager.

---
### Root Cause
1. **Meta App Development Mode Restriction:** Meta restricts API creation of dark/unpublished ad creatives on external pages/accounts when the calling Meta App is in Development Mode (requires Meta App Review, Business Verification, and Live Mode switch).
2. **Multi-Advertiser Policy Mandate:** Meta Ads API Terms require each distinct end advertiser to have an independent Ad Account or a declared `end_advertiser` Business ID. Commingling unmapped clients in one account violates Meta Business Terms.
3. **API Hard Quota:** Programmatic Ad Account creation via `POST /{business-id}/adaccount` is subject to a hard system limit of 5 accounts per Business Manager.

---
### Investigation
Executed Phase 2A Read-Only Architectural Verification Gate. Evaluated 4 candidate models (Master Account, Manual Host Management, BYOA OAuth, Hybrid) against official Meta Developer Documentation (Graph API v20.0), Ads API Terms, and Business Manager Specs. Tested 15 server-side safety gates via `scripts/meta_regression.ts`.

---
### Solution
Adopted **MODEL C (BYOA - Bring Your Own Account)** via Meta OAuth 2.0 as the primary ENCHO Meta Identity Architecture (Option A):
1. **Tenant Isolation:** Bind `host_id` to their own Meta Ad Account, Facebook Page, and Instagram Business Profile in `host_meta_identities`.
2. **Credential Security:** Encrypt long-lived user OAuth access tokens at rest using AES-256-GCM. Public identifiers (`meta_ad_account_id`, `meta_page_id`) remain readable; sensitive tokens are never stored in campaign records or exposed in logs.
3. **Preflight Gates:** Retain all 16 server-side preflight gates, including Gate 15 (Independent Policy Clearance Gate) and Gate 16 (Tenant Ownership Mismatch Gate).
4. **App Review Path:** Require Business Verification and App Review for `ads_management`, `business_management`, `pages_manage_ads`, `pages_read_engagement`, `instagram_basic` prior to switching Meta App to Live Mode.

---
### Verification
1. E2E Certification Test Suite (`scripts/meta_regression.ts`): 15/15 PASS.
   - DB Schema & Table Integrity Check: PASS
   - Approval Integrity Invalidation: PASS
   - Meta Preflight & Emergency Kill Switch Gates: PASS
   - Housing Special Ad Category 25km Radius Gate: PASS
   - Tenant Isolated Learning Engine: PASS
   - Independent Policy Clearance Preflight Gate: PASS
   - Tenant Ownership Mismatch Gate: PASS
   - Immutable Host Identity Binding: PASS
   - SHA256 Snapshot Hash Sensitivity: PASS

---
### Regression Risks
1. **Token Expiration:** User OAuth access tokens expire after 60 days. System must handle token refresh or prompt host re-authentication gracefully before dispatch.
2. **Permission Revocation:** Host revoking ENCHO app access in Facebook User Settings will cause preflight Gate 7 / dispatch failure; system must update `connection_status` to 'unlinked'.
3. **App Review Scope Creep:** Modifying requested Meta permission scopes after App Review approval will require re-review by Meta.

---
### Related Files
- `/server.ts`
- `/scripts/meta_regression.ts`
- `/docs/meta/architecture/ENCHO_META_IDENTITY_ARCHITECTURE_AUDIT.md`

---
### Related ADR
ADR-0006 (Meta BYOA Identity Architecture & OAuth Governance)

---
### Related Incident
INC-2026-08-08-CANARY-DEVMODE-SUBCODE-1885183

---
### Last Verified
August 8, 2026

---
### Status
Verified
