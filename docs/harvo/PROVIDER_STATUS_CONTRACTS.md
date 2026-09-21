# Provider delivery status contracts — SP0

Verified source contract, 21 September 2026. This document does not certify production traffic or provider approval.

## Version authority

The adapters currently call Google Ads v25 and Meta Graph v26.0. A new version needs an explicit enum review before its statuses can be classified. Unrecognized versions/values, missing required fields, or incorrect hierarchy identity return unknown evidence requiring reconciliation. Labels and cumulative metrics never prove present-tense delivery.

Google primary statuses are taken from the official v25 [campaign enum](https://developers.google.com/google-ads/api/reference/rpc/v25/CampaignPrimaryStatusEnum.CampaignPrimaryStatus), [ad-group enum](https://developers.google.com/google-ads/api/reference/rpc/v25/AdGroupPrimaryStatusEnum.AdGroupPrimaryStatus), and [ad enum](https://developers.google.com/google-ads/api/reference/rpc/v25/AdGroupAdPrimaryStatusEnum.AdGroupAdPrimaryStatus). Policy states follow the [review enum](https://developers.google.com/google-ads/api/reference/rpc/v25/PolicyReviewStatusEnum.PolicyReviewStatus) and [approval enum](https://developers.google.com/google-ads/api/reference/rpc/v25/PolicyApprovalStatusEnum.PolicyApprovalStatus).

Meta configured/effective statuses follow the pinned official SDK 26.0.0 definitions for [campaign](https://github.com/facebook/facebook-python-business-sdk/blob/26.0.0/facebook_business/adobjects/campaign.py), [ad set](https://github.com/facebook/facebook-python-business-sdk/blob/26.0.0/facebook_business/adobjects/adset.py), and [ad](https://github.com/facebook/facebook-python-business-sdk/blob/26.0.0/facebook_business/adobjects/ad.py). The SDK enums are layer-specific; they do not establish permissions, placement eligibility, or actual impressions.

## Reduction

| Evidence | Readiness / operational meaning |
| --- | --- |
| Verified configured parent pause | PAUSED; this proves the parent is configured stopped |
| Paused child with enabled parent | BLOCKED; does not certify parent-wide pause |
| Removed/deleted/archived, rejected ad, billing issue, ineligible hierarchy | BLOCKED |
| Explicit policy review / appeal / Meta processing | REVIEWING |
| Google future eligibility | PENDING; no assertion of delivery or exact start time |
| Google bidding learning | LEARNING; no assertion of live delivery |
| Google limited policy/eligibility or provisional may-serve review | LIMITED |
| Complete eligible Google hierarchy and reviewed approval; or Meta active hierarchy with eligible account | ELIGIBLE; still `isLive=false`, `isServingImpressions=false` |
| Missing/unknown/unreviewed version or incorrect enum for layer | UNKNOWN; reconciliation required |

Configured stop evidence takes precedence over stale effective/primary statuses after identity checks. Block/review/limited evidence takes precedence over a learning label. Google unknown or unspecified enums are not positive evidence. Provider observation exceptions return no successful observation timestamp.

## Impact and validation

`PENDING` and `LEARNING` are additive JSON readiness values with plain-language UI labels. No money, lifecycle, provider activation, or schema state is inferred from them. Pure enum tests cover v25 campaign and v26 ad values, invalid layers, policy combinations, future versions, and no false LIVE. Adapter tests validate ownership before reduction. Migration, RLS, pilot, and monitoring acceptance are independent gates.
