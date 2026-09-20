# HARVO: Gemini POV & Engineering Architecture Review
*Comprehensive strategic feedback, operational reality check, and architectural specifications for the Encho Marketing Engine (Google Ads & Meta Ads integrations).*

## Executive Summary
This document captures the strategic evaluation of the Encho Marketing Engine's state machine, financial integrity controls, and operational recovery pipelines.

**The Bottom Line:**
- **Financial & Security Architecture: 9.5/10 (Masterpiece).** The double-entry ledger, cryptographic fingerprinting, idempotency locks (`reservation:10:1`), and balance-drift triggers guarantee that Encho will not double-spend or lose track of host capital.
- **Operational & UI Resilience: 2/10 (Operational Suicide).** The system is built for a sterile laboratory with zero operational recovery paths. When real-world external APIs (Google/Meta) reject inputs or encounter billing delays, campaigns fall into an unrecoverable `RECONCILIATION_REQUIRED` deadlock that currently requires senior engineers to manually manipulate production Postgres rows.

---

## Pillar 1: The "Reconciliation Death Trap" & The Admin Override UI

### The Problem
When an external ad provider rejects a payload (e.g., Google rejecting commas in keywords via `GOOGLE_INVALID_ARGUMENT`, or Meta rejecting missing placements or reporting an unsettled ad account via `META_ACCOUNT_UNAVAILABLE`), the Encho workflow engine defensively locks the campaign:
1. The workflow transitions to `RECONCILIATION_REQUIRED`.
2. The associated background job (`marketing_jobs`) transitions to `RECONCILIATION_REQUIRED` with an active `dedupe_key` lock (e.g., `PUBLISH:10:1`).
3. The Admin Dashboard UI turns the action buttons completely grey, displays an opaque banner (`Reconciliation Required` or `AI could not certify this revision`), and provides **zero controls** to recover.

Because the `dedupe_key` remains bound, any subsequent attempt by an Admin or Host to resend the campaign immediately fails with:
`OPERATION_RECONCILIATION_REQUIRED: The previous operation needs verified reconciliation before another attempt`.

In our live testing sessions, the only way to recover was executing manual SQL transactions to clear `last_error`, reset workflow states to `APPROVED`, and rename dead dedupe keys (`dedupe_key || ':FAILED'`).

### Mandatory Specification for Original Engineers
1. **Admin "Clear Lock & Retry" Button:**
   The Admin Dashboard must include an authorized action: `POST /api/marketing/v2/admin/campaigns/:id/reconcile-retry`.
   - Safely closes or archives the failed transaction in `provider_publishing_transactions` and `marketing_jobs`.
   - Clears the workflow `last_error` and resets state from `RECONCILIATION_REQUIRED` back to `APPROVED` (or `PROVIDER_PAUSED` if previously paused).
   - Generates an immutable admin audit log entry (`ADMIN_RECONCILIATION_RESET`) capturing who cleared the lock and why.
2. **Actionable UI Error Surfacing:**
   Replace generic banners with transparent, actionable provider feedback. Instead of simply showing `META_INVALID_ARGUMENT` or `Unknown Outcome`, extract and display the exact underlying error message from the provider client (e.g., *"Meta rejected campaign: Account act_1381407594129620 is UNSETTLED due to outstanding balance"* or *"Google rejected keyword: commas are prohibited in exact match"*).
3. **Graceful Degradation:**
   Non-fatal provider validation errors should route back to a draft-correction state allowing hosts/admins to edit invalid fields in the UI without permanently deadlocking the campaign hierarchy.

---

## Pillar 2: The Config Monolith (Migrate from `.env` to Postgres)

### The Problem
The entire platform's marketing operational rules are currently stored as a single monolithic JSON blob inside the `HARVO_MARKETING_CONFIG` environment variable.

During our Meta integration, the campaign publishing engine crashed with `META_INVALID_ARGUMENT` solely because `HARVO_MARKETING_CONFIG.meta.placements` was an empty array (`[]`) and `conversions.meta.pixelId` was missing.

Storing critical operational routing settings in an `.env` JSON string introduces severe risks:
- Any missing key or malformed syntax crashes the advertising pipeline silently.
- Updating a single setting (like adding a pixel ID or changing markup BPS) requires redeploying Vercel or restarting background worker processes.
- The background worker can easily desynchronize if it boots with a stale `.env` while the web server runs a newer configuration.

### Mandatory Specification for Original Engineers
1. **Database-Driven Global Marketing Configuration:**
   Create a dedicated database table:
   ```sql
   CREATE TABLE marketing_global_configs (
     id SERIAL PRIMARY KEY,
     provider VARCHAR(32) NOT NULL, -- 'META', 'GOOGLE', 'SYSTEM'
     config JSONB NOT NULL,
     version INT NOT NULL DEFAULT 1,
     updated_by INT REFERENCES users(id),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );
   ```
2. **Admin Config Management UI:**
   Provide a dedicated Admin Settings view to manage:
   - Provider placements (Feed, Stories, Reels).
   - Dataset / Pixel IDs.
   - Profit markups, currency minimums, and default country targets.
3. **Dynamic Cache with TTL:**
   The marketing runtime and background worker must pull active configurations from Postgres (with a 60-second in-memory TTL cache or pub/sub cache invalidation), eliminating the fragile monolithic `.env` string entirely.

---

## Pillar 3: Master Account Single Point of Failure (SPOF) — Mandatory Day 1 Requirement

### The Problem
Encho operates on a **Walled Garden Master Account Model**: Hosts fund advertising campaigns, but Encho executes all ad spend under its own centralized master provider accounts. This protects Encho's 15% optimization margin and ensures host retention.

However, during our live Meta test, the Meta Graph API returned:
```json
{
  "id": "act_1381407594129620",
  "account_status": 3,
  "currency": "INR"
}
```
In Meta's API specification, `account_status: 3` signifies **UNSETTLED** (unpaid ad balance or billing gateway lock). Because of this single status code, Encho's `MetaAdProvider` correctly aborted publishing with `META_ACCOUNT_UNAVAILABLE`.

**The Existential Business Risk:**
Because every host's ad runs on a single Master Account, an issue with that one account instantly paralyzes advertising for **100% of hosts on the platform**. Furthermore, if a single host uploads controversial copy or policy-violating imagery that triggers an ad account suspension by Meta/Google, Encho's entire ad-tech revenue stream is destroyed overnight.

### Mandatory Specification for Original Engineers: Multi-Account Master Pool & Dynamic Router
This capability CANNOT be deferred to a post-launch phase. The following multi-account pool architecture must be built for production stability:

1. **Master Account Pool Management:**
   Maintain an active pool of Master Business Ad Accounts across each provider (e.g., 3–5 operational ad accounts per region/currency).
   ```sql
   CREATE TABLE marketing_master_ad_accounts (
     id SERIAL PRIMARY KEY,
     provider VARCHAR(32) NOT NULL, -- 'META', 'GOOGLE'
     account_id VARCHAR(128) NOT NULL UNIQUE, -- e.g. 'act_1381407594129620'
     account_name VARCHAR(128) NOT NULL,
     currency VARCHAR(8) NOT NULL,
     status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'UNSETTLED', 'DISABLED', 'DRAINING'
     risk_tier VARCHAR(32) NOT NULL DEFAULT 'STANDARD', -- 'HIGH_TRUST', 'STANDARD', 'SANDBOX'
     last_health_check_at TIMESTAMP WITH TIME ZONE,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **Automated Health-Check Circuit Breaker:**
   A lightweight background cron job must probe each account's status every 15 minutes:
   - For Meta: Verify `account_status === 1` (Active) and check remaining credit lines.
   - For Google: Verify billing budget status and policy strike thresholds.
   - If an account transitions to `account_status: 3` (Unsettled) or flags a policy warning, mark the account as `UNSETTLED` or `DRAINING` immediately and raise a high-severity alert to the Encho Operations Slack/dashboard.

3. **Dynamic Campaign Routing & Failover:**
   When a campaign transitions to `PUBLISH_QUEUED`:
   - The provider service queries the pool for an available, healthy account (`status = 'ACTIVE'`) matching the campaign currency.
   - The campaign is dynamically bound to that specific `master_account_id`.
   - If the assigned account encounters an unexpected settlement or rate-limit failure before publishing, the router automatically fails over to the next healthy account in the pool, avoiding unrecoverable deadlocks.

4. **Host Risk Partitioning:**
   - **New / Unverified Hosts:** Route campaigns through a secondary "Standard/New Host" account pool with strict AI pre-checks and tighter spend caps.
   - **Superhosts / Verified Listings:** Route campaigns through a primary "High-Trust" account pool with clean historical standing and maximum ad delivery velocity.
   - This isolates bad actors and ensures that an ad policy violation from a single host cannot taint or disable ad accounts serving reliable hosts.

---

## Pillar 4: Additional Systemic Friction Points

### 4. Split-Brain UI vs. Worker Capability Detection
The frontend currently evaluates provider readiness using client-accessible environment variables. If Vercel lacks a specific server-only token, the UI grays out buttons even though the dedicated background worker possesses the valid credentials.
* **Requirement:** UI action buttons must query an internal API endpoint (`/api/marketing/v2/admin/provider-status`) backed by the worker's verified runtime capabilities, eliminating false-negative UI blocks.

### 5. Webhook Configuration Observability
When incoming payment webhooks (e.g. Razorpay) were received, mismatched account prefixes (`acc_`) caused the webhook to be silently dropped, leaving the campaign in "Awaiting Capture" with zero diagnostic breadcrumbs.
* **Requirement:** Webhook handlers must write invalid/mismatched payloads to a `marketing_webhook_audit_log` table with an explicit error code (`ACCOUNT_PREFIX_MISMATCH`) and notify system monitoring.

### 6. Pre-Flight Input Sanitization
Google Ads rejects commas in exact match keywords, and Meta rejects unformatted country codes. The system must aggressively normalize, trim, and reformat all copy, keywords, and geographic codes before external transmission.

### 7. Native Sandbox Testing Mode
Build a strict `HARVO_SANDBOX_MODE=true` toggle for local and staging environments that mocks external provider delivery, fast-forwards escrow hold intervals (`risk_release_at`), and generates verified mock telemetry without requiring real credit cards or manual SQL surgery.
