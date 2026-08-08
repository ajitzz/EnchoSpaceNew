# CERT-0004-AD: Meta Ad Creation Certification

- **Test ID**: CERT-0004-AD
- **Date**: 2026-08-08
- **Graph API Version**: v19.0 / v20.0
- **Endpoint**: `POST https://graph.facebook.com/v19.0/act_<AD_ACCOUNT_ID>/ads`
- **Purpose**: Verify Ad object link to Ad Set and Ad Creative, ensuring PAUSED initial state for Admin safety.

## Payload Summary
```json
{
  "name": "Ad - Encho Luxury Villa",
  "adset_id": "120205849205120394",
  "creative": { "creative_id": "120205849205340394" },
  "status": "PAUSED"
}
```

## Result & Evidence
- **HTTP Status**: 200 OK
- **Meta Object ID**: `120205849205560394`
- **fbtrace_id**: `D2qP0xZ4sN6pY3c`
- **Correlation ID**: `c4a20b8e-9134-4b51-b0e2-81e0129f1021`
- **Database Transaction State**: `meta_ad_id` linked; status `SUCCESS` in `meta_publishing_transactions`
- **Regression Test**: `scripts/meta_regression.ts` (Passed)
- **Certification Status**: CERTIFIED (VERIFIED CONTRACT MATCH)
