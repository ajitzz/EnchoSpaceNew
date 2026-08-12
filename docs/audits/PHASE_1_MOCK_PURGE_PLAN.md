# ENCHO META ADVERTISING INFRASTRUCTURE - PHASE 1 MOCK PURGE PLAN

## 1. Mock Meta Token Fallback
- **File:** `server.ts`, `src/lib/integrationInspector.ts`
- **Line/function:** Global constant `META_API_TOKEN`, Integration Inspector mock checks.
- **Current behavior:** Falls back to `EAAkr7Y9S...` if `META_API_TOKEN` is missing.
- **Production reachability:** YES.
- **Why it is unsafe:** Can silently authenticate with a fake token, causing downstream Meta API failures or masking misconfiguration.
- **Replacement behavior:** Remove fallback. Require `META_ACCESS_TOKEN`. Fail closed if not present where needed.
- **Golden Canary impact:** None, as Golden Canary uses valid `.env` tokens.
- **Database impact:** None.
- **UI impact:** Will show missing configuration instead of fake token logic.
- **Meta API impact:** Ensures only real tokens hit Meta.
- **Test impact:** Mock-based tests relying on `EAAkr7` will fail unless they supply a test token.
- **Rollback plan:** Revert file.

## 2. Simulated Meta Object IDs
- **File:** `server.ts`
- **Line/function:** Campaign sync loops, Dashboard GET routes (lines ~2920, 4614).
- **Current behavior:** Generates `act_8849203_camp_${id}` or `act_adset_${Math.random()}` if missing.
- **Production reachability:** YES.
- **Why it is unsafe:** Falsifies database/Meta synchronization.
- **Replacement behavior:** Use `null` or explicit `UNKNOWN`.
- **Golden Canary impact:** None, Golden Canary creates real IDs.
- **Database impact:** Prevents fake IDs from entering sync logs.
- **UI impact:** UI will correctly display missing/unknown status.
- **Meta API impact:** None.
- **Test impact:** Tests expecting fake IDs will need update.
- **Rollback plan:** Revert file.

## 3. Fake Analytics (Likes, Comments, Impressions)
- **File:** `server.ts`
- **Line/function:** Sandbox feed, dashboard analytics routes.
- **Current behavior:** Uses `Math.random()` to generate metrics.
- **Production reachability:** YES.
- **Why it is unsafe:** Misleads hosts about ad performance.
- **Replacement behavior:** Return actual DB metrics or 0/null.
- **Golden Canary impact:** None.
- **Database impact:** None.
- **UI impact:** Sandbox will show 0 or actual metrics.
- **Meta API impact:** None.
- **Test impact:** UI tests expecting random numbers.
- **Rollback plan:** Revert file.

## 4. Fake Payment Intent IDs & Logic
- **File:** `server.ts`
- **Line/function:** `/api/host/campaigns/:id/fund`
- **Current behavior:** Generates `mockIntentId` using `Math.random()`.
- **Production reachability:** YES.
- **Why it is unsafe:** Bypasses real financial gateway verification.
- **Replacement behavior:** Block flow with `PAYMENT_VERIFICATION_REQUIRED` or `PAYMENT_NOT_IMPLEMENTED` if no real gateway.
- **Golden Canary impact:** Golden Canary is already authorized/bypassed if run via Admin or uses wallet.
- **Database impact:** None.
- **UI impact:** Funding flow will halt appropriately.
- **Meta API impact:** Prevents unfunded campaigns from dispatching.
- **Test impact:** Financial tests using mocks.
- **Rollback plan:** Revert file.

## 5. Hardcoded Housing Policy Bypass (HEC)
- **File:** `server.ts`
- **Line/function:** AI precheck logic / Gatekeeper.
- **Current behavior:** `passed: true` for HEC.
- **Production reachability:** YES.
- **Why it is unsafe:** Approves potentially discriminatory ads automatically.
- **Replacement behavior:** Mark as `POLICY_REVIEW_REQUIRED` or use actual prompt evaluation.
- **Golden Canary impact:** None if the prompt accurately evaluates or Admin approves.
- **Database impact:** None.
- **UI impact:** Will show policy review status.
- **Meta API impact:** Adheres to Special Ad Category logic securely.
- **Test impact:** Policy tests.
- **Rollback plan:** Revert file.

## 6. Simulated Google Campaign IDs
- **File:** `server.ts`
- **Line/function:** Sync logic.
- **Current behavior:** Generates `simulatedGoogleId`.
- **Production reachability:** YES.
- **Why it is unsafe:** Falsifies Google Ads sync.
- **Replacement behavior:** Remove or set to null.
- **Golden Canary impact:** None.

## 7. Fake Lead Webhook Query (mockCampaignRes)
- **File:** `server.ts`
- **Line/function:** Lead webhook.
- **Current behavior:** Assigns fake variables like `mockCampaignRes`.
- **Production reachability:** YES.
- **Why it is unsafe:** Misnames actual queries, risks fake logic.
- **Replacement behavior:** Rename variables to reflect reality, ensure strict DB query.

## 8. Random Idempotency Keys and Order IDs
- **File:** `server.ts`
- **Line/function:** Webhook processing, Orders.
- **Current behavior:** Uses `Math.random()`.
- **Production reachability:** YES.
- **Why it is unsafe:** Not cryptographically secure, risks collisions.
- **Replacement behavior:** Use `crypto.randomUUID()`.

