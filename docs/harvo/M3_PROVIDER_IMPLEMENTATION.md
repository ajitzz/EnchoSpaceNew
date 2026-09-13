# M3 provider implementation evidence

Updated 13 September 2026. Source implemented and locally tested; no real provider mutation, spend, delivery or production-account permission has been demonstrated. This report supplements HARVO and does not clear checkout, financial, provider or legal acceptance gates.

## Implemented boundary

`MetaAdProvider` now creates actual paused website-booking campaign, ad set, creative and ad objects through a bounded authenticated Graph v26.0 transport. It consumes explicit account/Page/pixel identities, approved property media, the canonical property destination, explicit placements/countries/category classification, and a trusted server authorization callback. Missing configuration or authorization fails closed. No fabricated IDs, implicit sandbox, random targeting or automatic activation remains in this adapter.

Image creatives use listing media in link data. Video creatives upload the approved listing video, verify processing, and bind the confirmed ID and approved thumbnail to the creative. A confirmed upload still processing is recorded as `ASSET_PREPARING`; the exact same campaign, fingerprint and idempotency key can continue after another readiness read without another upload. An ambiguous upload cannot use this continuation. Reels require video; Instagram placements require the configured Instagram identity to match the Page association.

Every remote create is preceded by durable intent and followed by returned-ID persistence. The completed hierarchy is read back for account, parentage, configured paused state, budget, pixel, Page/Instagram and destination identity. Partial or ambiguous attempts preserve observed IDs and require reconciliation; they never automatically recreate the hierarchy. Partial objects are created paused, avoiding speculative cleanup of uncertain remote resources.

Google and Meta pause/resume/budget controls now issue real provider mutations and verify remote state. Google status changes include the approved campaign, ad group, ad and exact published keyword set in one atomic mutate request. Unexpected keywords block activation. Google budget changes verify the unshared budget resource and exact micros. Meta controls verify and update campaign/ad set/ad hierarchy in a direction appropriate to pause or resume. A request to resume does not establish actual delivery: results retain observed configured status and normalized `UNKNOWN`, never an invented `LIVE` state.

## Trusted authorization port

`src/lib/providers/ProviderOperationStore.ts` exports:

```ts
type ProviderAuthorizationGuard = (
  context: ProviderAuthorizationContext,
  transactionClient: any
) => Promise<{ authorizationId: string }>;
```

The context contains provider, campaign ID, operation, semantic fingerprint, idempotency key, correlation ID, optional external campaign ID, and optional budget amount/currency/kind. The callback runs while the campaign row is locked in a short PostgreSQL transaction. Trusted server composition must establish ownership, approved revision, operator/provider clearance, current funding/reservation and risk limits using that transaction. A request-body boolean is not authorization. Network operations occur after the transaction commits.

Meta creation and all control operations require the callback. Google creation with the `HARVO_V2` protocol also requires it. The older Google paused preparation path retains its M1 financial ceiling when no callback is installed; it cannot activate a campaign. Google daily budgets are explicitly identified as `DAILY`; Meta campaign budgets are `LIFETIME`. A Google daily budget alone cannot enforce a total campaign authorization.

Durable operation claims serialize conflicting attempts per campaign/provider. Unknown outcomes are never released merely because a lease or timeout expires. Same-key completed replay requires the same semantic fingerprint. Financial ledger values are not altered by these provider controls.

## Verification

On 13 September 2026 the isolated Google provider/store, Meta client/provider and provider-controls suites passed **104 tests across five suites**, using injected HTTP responses and fresh local PostgreSQL clusters. Focused strict TypeScript checking passed. Tests cover concurrent claims, actual request fields, paused creation and readback, missing approval/configuration, foreign media/accounts/keywords, partial failures, lost responses, malformed results, readback mismatch, durable-write failure, exact budget units and same-key video continuation. These tests prove local behavior against the checked contracts; they do not prove provider acceptance or bookings.

The pre-existing Google transport suite separately passed 49 tests during M1. Its conversion upload singleton remains disabled. No legacy `CONFIRMED` booking cron is accepted as canonical conversion evidence.

## Remaining evidence and integration limits

- Root runtime must wire the trusted guard and finance reservation, enforce checkout/provider gates, and contain retired publishing/activation workers. This adapter alone does not authorize the old server entry points.
- Operator classification of accommodation policy categories, account structure, Page/Instagram relationships, pixel and conversion eligibility must be verified for the real accounts. Explicit fields are not evidence of eligibility.
- Media suitability, copyright permission, API review and platform asset processing remain external conditions. No adaptive creative optimization or instant approval is claimed.
- Paused creation, effective eligibility, measured delivery, attributed conversion, captured payment and fulfilled booking are distinct facts. M4 must preserve these distinctions and source freshness.
- No production load or chaos test, real API mutation, legal sign-off, refund-policy acceptance or launch acceptance was performed here.

## Primary contract sources

- [Meta official Python Business SDK API version](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/apiconfig.py) and [SDK releases](https://github.com/facebook/facebook-python-business-sdk/releases).
- [Ad account operation fields](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccount.py), [ad set fields](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adset.py), [creative object story spec](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreativeobjectstoryspec.py), [link data](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreativelinkdata.py), and [video data](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreativevideodata.py).
- [Google v25 mutate contract](https://developers.google.com/google-ads/api/reference/rpc/v25/MutateGoogleAdsRequest) and [REST search](https://developers.google.com/google-ads/api/rest/common/search).

## Follow-up: verified Google Search campaign total budgets

The current [Google API budget guide](https://developers.google.com/google-ads/api/docs/campaigns/budgets/create-budgets), updated 10 September 2026, explicitly supports Search campaign total budgets with fixed start/end dates, `period: CUSTOM_PERIOD`, `total_amount_micros`, and `explicitly_shared: false`. The [v25 CampaignBudget contract](https://developers.google.com/google-ads/api/reference/rpc/v25/CampaignBudget) makes total and daily amount fields mutually exclusive. [Google's product documentation](https://support.google.com/google-ads/answer/10486938?hl=en) describes 3–90 day Search flights, a billed total cap, no daily spending cap and an immutable budget type. Account eligibility and actual API acceptance still require controlled verification.

Implemented an explicit `metadata.googleSearch.budgetMode: 'CAMPAIGN_TOTAL'` option for new campaigns. It uses the approved total media authorization as provider total micros, requires 3–90 inclusive calendar days, verifies the serving-account timezone and reads back dates, amount and budget type. Daily mode remains the default solely for M1 compatibility. An optional daily number in total mode is a planning hint and is never transmitted as `amountMicros`. Root V2 composition must select total mode and describe its daily pacing honestly.

Budget controls derive lifetime versus daily authorization from durable provider evidence. They cannot switch budget type. Both Google and Meta now compare the observed remote amount with recorded approval before activation, and pass the recorded amount/kind to the trusted guard. Verified amount updates persist locally. This closes the gap where a manual remote budget change could otherwise survive an unrelated resume.

Unresolved operations serialize across action types: an uncertain resume prevents a new-key pause or another activation from racing the old request. A remote service does not honor Encho's PostgreSQL fencing token. Operations staff must establish the old remote outcome before automatic controls can resume; a local lease expiry alone is never sufficient evidence. The UI must state that pause is unconfirmed when this occurs, and the incident procedure must provide controlled provider-side containment. No automatic cleanup or forced successful pause is invented.

Final scoped verification after the total-budget and activation-readback changes passed **298 tests across eight suites** (Google transport, Search plan, provider/store, Meta client/provider, controls and measurement). The final measurement service-principal adjustment separately passed all 49 measurement tests; focused strict TypeScript checking of all changed provider/measurement code and tests passed. This remains isolated HTTP/PostgreSQL evidence, not live provider certification.
