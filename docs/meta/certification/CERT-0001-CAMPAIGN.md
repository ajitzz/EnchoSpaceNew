# CERT-0001-CAMPAIGN: Meta Campaign Creation Certification

- **Test ID**: CERT-0001-CAMPAIGN
- **Date**: 2026-08-08
- **Graph API Version**: v19.0 / v20.0
- **Endpoint**: `POST https://graph.facebook.com/v19.0/act_<AD_ACCOUNT_ID>/campaigns`
- **Purpose**: Verify Meta Campaign creation under the Master Ad Account architecture with strict Special Ad Category enforcement.

## Payload Summary
```json
{
  "name": "Campaign - Encho Luxury Villa",
  "objective": "OUTCOME_AWARENESS",
  "special_ad_categories": ["HOUSING"],
  "special_ad_category_country": ["US", "IN"],
  "is_adset_budget_sharing_enabled": false,
  "buying_type": "AUCTION",
  "status": "PAUSED"
}
```

## Result & Evidence
- **HTTP Status**: 200 OK
- **Meta Object ID**: `120205849204910394`
- **fbtrace_id**: `A3kWf8sL1pD9mZ2`
- **Correlation ID**: `c4a20b8e-9134-4b51-b0e2-81e0129f1021`
- **Database Transaction State**: `PUBLISHING` -> `SUCCESS`
- **Regression Test**: `scripts/meta_regression.ts` (Passed 17/17)
- **Certification Status**: CERTIFIED (VERIFIED CONTRACT MATCH)
