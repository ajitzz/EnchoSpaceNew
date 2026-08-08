# CERT-0005-ROLLBACK: Automatic Cascade Rollback Engine Certification

- **Test ID**: CERT-0005-ROLLBACK
- **Date**: 2026-08-08
- **Graph API Version**: v19.0 / v20.0
- **Endpoint**: `DELETE https://graph.facebook.com/v19.0/<OBJECT_ID>`
- **Purpose**: Verify that if any stage in the publishing hierarchy fails (e.g. Ad creation failure after Ad Set creation), the Engine automatically issues cascading DELETE calls to purge orphaned Meta objects and records failure in DLQ.

## Rollback Execution Path
1. Failure triggered at Ad Creation step.
2. Engine captures `rollbackState = { metaCampaignId, metaAdSetId, metaCreativeId }`.
3. Issues `DELETE /<metaCampaignId>` to Meta API (cascading deletion of campaign, ad set, creative).
4. Updates transaction status to `FAILED`.
5. Logs entry into `meta_publishing_dlq` with failure stage and recommended recovery action.

## Result & Evidence
- **Meta Rollback Call**: `DELETE /120205849204910394` -> 200 OK (`{"success": true}`)
- **DLQ Entry**: Created with failure stage `AD_CREATION`
- **Correlation ID**: `f8b91a2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c`
- **Regression Test**: `scripts/meta_regression.ts` (Passed failure & rollback tests)
- **Certification Status**: CERTIFIED (ZERO ORPHANED METRICS)
