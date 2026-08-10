PRE-CANARY STATUS:
NO-GO

Configuration:
APP ID: 1389606149648324 (RUNTIME MISMATCH - Expected 1347659864208278)
AD ACCOUNT: 1381407594129620
TOKEN APP ID: 1347659864208278
APP MODE: undefined (Expected LIVE)
CANARY FLAG: undefined (Expected true)
DEPLOYMENT: Latest surgical patch (Historical trace lock removed)

Identity consistency:
FAIL

Historical contamination:
PASS (Historical lock successfully removed from Gate 14)

App Mode consistency:
FAIL (META_APP_MODE is undefined in the runtime environment)

Billing:
EXTERNAL_UNVERIFIABLE (Payment method attached to portfolio but pending Ad Account verification)

Preflight blockers:
LIST
1. META_APP_ID mismatch (Environment has 1389606149648324, but token requires 1347659864208278)
2. META_APP_MODE is unset (Defaults to development)
3. META_CANARY_2_READY is unset

HUMAN ACTION REQUIRED:
The runtime environment variables have NOT been successfully updated. The API server and background workers are still reading the old configuration. 
Please ensure you have saved the variables exactly as follows in the AI Studio Settings (API Keys & Secrets), and that the changes have propagated to the runtime:

META_APP_ID = 1347659864208278
META_APP_MODE = live
META_CANARY_2_READY = true

Do NOT dispatch the campaign. We will wait for the environment to reflect the correct variables before giving the green light.
