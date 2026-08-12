# META RETRY POLICY SPECIFICATION

**Document ID:** `META_RETRY_POLICY.md`  
**Date:** 2026-08-10  
**Status:** AUTHORITATIVE SPECIFICATION  
**Target:** Meta Graph API Retry Engine  

---

## 1. BOUNDED EXPONENTIAL BACKOFF WITH JITTER

### Retry Parameters
- **Maximum Retry Attempts:** 3 attempts
- **Initial Delay:** 1000ms
- **Backoff Multiplier:** 2.0
- **Random Jitter:** 0 - 500ms
- **Formula:** `delay = (initial_delay * (2 ^ (attempt - 1))) + (Math.random() * 500)`

```
Attempt 1: Initial request (0ms delay)
Attempt 2: Failed transient error -> Delay ~1000ms + Jitter
Attempt 3: Failed transient error -> Delay ~2000ms + Jitter
Exhausted: Max retries (3) reached -> Abort & Trigger Rollback
```

---

## 2. MANDATORY PRE-RETRY EXTERNAL LOOKUP

To prevent double object creation on Meta:
Before re-sending a `POST` creation request on Attempt 2 or Attempt 3 following a timeout or 5xx response:
1. System transitions transaction status to `EXTERNAL_OUTCOME_UNKNOWN`.
2. System executes a `GET` search on Meta Graph API to verify whether the object was already created:
   - **Campaign:** Search `GET /{ad_account_id}/campaigns` by campaign name pattern.
   - **AdSet:** Search `GET /{campaign_id}/adsets`.
   - **Creative:** Search `GET /{ad_account_id}/adcreatives`.
   - **Ad:** Search `GET /{adset_id}/ads`.
3. If found on Meta: bind object ID to local state and resume at next stage (skip `POST` retry).
4. If not found on Meta: proceed with `POST` retry attempt.
