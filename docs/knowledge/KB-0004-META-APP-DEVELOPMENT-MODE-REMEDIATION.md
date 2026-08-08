## Knowledge ID
KB-0004

---

### Topic
Meta App Development Mode Restriction, Error Code 100 / Subcode 1885183 Remediation, and Pre-Canary #2 Hard Preflight Gate

---

### Problem
During the execution of Controlled Live Canary #1 against Meta Graph API v20.0 (`act_1681483723153196`), the campaign creation and ad set creation succeeded with HTTP 200, but the creative creation request failed with HTTP 400:
- **Error Code:** 100
- **Error Subcode:** 1885183
- **User Title:** `"Ads creative post was created by an app that is in development mode"`
- **User Message:** `"Ads creative post was created by an app that is in development mode. It must be in public to create this ad."`
- **`fbtrace_id`:** `AUqaoQnn0lXPacnJVRk3ATj`
- **Correlation ID:** `417790c4-44b2-4a4d-a200-8c42557fad05`

---

### Symptoms
- Meta Graph API `POST /v20.0/act_1681483723153196/adcreatives` rejected link/page post ad creative creation.
- Preflight safety gates (13/13) passed prior to network dispatch.
- Automatic deterministic rollback engine immediately deleted the created Campaign (`120248017716230302`) and AdSet (`120248017717620302`), leaving zero orphaned objects on Meta servers.

---

### Root Cause
1. **Meta App Status Restriction:** The Meta App ID `1347659864208278` (`Encho Space APP`) owned by Business Manager `861178506709725` (`Encho Enterprises`) is currently set to **Development Mode** on the Meta Developers Console (`https://developers.facebook.com/apps/1347659864208278/`).
2. Meta Graph API v20.0 strictly enforces that Page Link/Feed Post Ad Creatives cannot be published via an app in Development Mode unless the App is transitioned to **Live / Public Mode** or Advanced Access permissions are granted.

---

### Investigation & Forensic Evidence
1. **Token & App Discovery via Graph API Inspection:**
   - **App ID:** `1347659864208278`
   - **App Name:** `Encho Space APP`
   - **Ad Account:** `act_1681483723153196` (`Encho Space Ad Account`, Status: Active, Currency: INR)
   - **Business Manager:** `861178506709725` (`Encho Enterprises`)
   - **Page ID:** `554884541034223` (`Encho Enclave`, Published)
   - **System User ID:** `122134891815203315` (`Ajitt`)
   - **Granted Permissions:** `pages_show_list`, `ads_management`, `ads_read`, `business_management`, `instagram_basic`, `instagram_manage_insights`, `instagram_content_publish`, `pages_read_engagement`, `pages_manage_posts`, `public_profile`.
2. **Code Payload Audit Verdict:**
   - Evaluated `/server.ts` and `/src/lib/metaGraphApi.ts` creative creation logic (`object_story_spec`, `page_id`, `link_data`, `call_to_action`).
   - Verdict: **NO CREATIVE PAYLOAD CHANGE REQUIRED.**
   - The JSON payload structure is valid and standard for Meta Graph API v20.0. Modifying working code payload fields will not resolve the Meta-side Development Mode platform block.

---

### Solution
1. **Added Hard Server-Side Gate 14 (`META_CANARY_2_READY`):**
   - Updated `runMetaPreflightEngine()` in `/server.ts` to require `process.env.META_CANARY_2_READY === 'true'`.
   - Updated `/scripts/run_canary.cjs` to enforce the `META_CANARY_2_READY` hard gate before making any Graph API mutation.
   - If `META_CANARY_2_READY` is not `true`, execution aborts immediately before sending any HTTP request.
2. **Meta Developers Console Remediation Step-by-Step:**
   - Operator logs into Meta Developers Console: `https://developers.facebook.com/apps/1347659864208278/`.
   - Complete App Review / Privacy Policy URL / Category requirement for `Encho Space APP`.
   - Switch App Mode toggle from **Development Mode** to **Live / Public Mode**.
   - Ensure `ads_management` feature has Advanced Access or approved App Review status.
   - Set environment variable `META_CANARY_2_READY=true` once Meta App transition is confirmed.

---

### Verification
1. Executed `node scripts/run_canary.cjs` without `META_CANARY_2_READY=true`.
2. Confirmed hard gate aborted dispatch cleanly: `[CANARY #2 GATE ABORT] Dispatch aborted because META_CANARY_2_READY is not set to "true"`.
3. Verified `compile_applet` build and `lint_applet` passed with 0 errors.

---

### Regression Risks
- Attempting to set `META_CANARY_2_READY=true` before Meta Developers Console App Mode transition will result in Meta returning Error Code 100 / Subcode 1885183 again.
- App Mode transition requires a valid Privacy Policy URL (`https://encho-space-chi.vercel.app/privacy`) in Meta Developers Console Settings.

---

### Related Files
- `/server.ts` (14 Meta Safety Gates preflight engine)
- `/scripts/run_canary.cjs` (Live canary execution & gate check script)
- `/src/lib/metaGraphApi.ts` (Graph API compatibility layer)
- `/docs/meta/certification/ENCHO_CONTROLLED_LIVE_CANARY_CERTIFICATION.md`

---

### Related Incident
INC-0004-META-APP-DEVELOPMENT-MODE-RESTRICTION

---

### Last Verified
August 7, 2026

---

### Status
Documented & Hard Preflight Gate Enforced (Awaiting Meta Developer Console App Mode Switch)
