# ENCHO META MARKETING ENGINE: OPERATIONAL RUNBOOKS

## 1. Meta Outage
- **Symptom:** Operations Dashboard shows elevated 5xx errors for Meta endpoints.
- **Action:** 
  1. Go to Admin Dashboard -> Marketing -> Dashboard.
  2. Click "Emergency Publishing Stop" to halt queue.
  3. Wait for Meta API status page to clear.
  4. Resume queue and use Replay Engine on failed DLQ transactions.

## 2. Expired Token
- **Symptom:** Secret Health Dashboard shows `AUTH_ERROR_TOKEN_EXPIRED`.
- **Action:** 
  1. Rotate `META_ACCESS_TOKEN` in environment variables.
  2. Restart server to pick up new variable.
  3. Use Replay Engine on affected campaigns.

## 3. Permission Revoked
- **Symptom:** Admin Dashboard reports `OAuthException` with permissions missing.
- **Action:** Re-authenticate the system user via Business Manager and approve required permissions (ads_management, pages_read_engagement).

## 4. Rollback Failure
- **Symptom:** Transaction is FAILED, but Meta API shows orphaned Ad Sets or Campaigns.
- **Action:** Use Manual Rollback tool in Admin Dashboard, passing the Meta IDs manually to force delete them.

## 5. Retry Exhaustion
- **Symptom:** Transaction hits DLQ after 3 failed retries.
- **Action:** 
  1. Inspect the `error_payload` in DLQ.
  2. Fix the underlying data (e.g. invalid image format, bad targeting).
  3. Click "Replay" in DLQ dashboard.

## 6. Manual Replay
- **Action:** Navigate to the transaction list or DLQ, and click "Replay". The engine will automatically reuse the original Idempotency Key and Correlation ID.

## 7. Manual Rollback
- **Action:** Can be executed via API `/api/admin/marketing/rollback/:metaId`.

## 8. Emergency Publishing Stop
- **Action:** Set `META_PUBLISHING_PAUSED=true` in environment. The queue will gracefully reject new dispatches.

## 9. Credential Rotation
- **Action:** Go to Vercel/Render, rotate `META_ACCESS_TOKEN`, restart services.

## 10. Disaster Recovery
- **Action:** In case of total database loss, restore from Neon backups. Meta resources will remain active. Use the Sync tool (Phase 15 - Future) to reconnect local states to active Meta Campaigns.
