# HARVO marketing M1 — implementation and local verification

Date: 13 September 2026. Scope: Google v25 paused Search foundation. Status: implemented and locally verified. This is one of ten numbered marketing milestones, not a complete paid funnel or live provider certification.

## What changed

GoogleAdsClient now sends authenticated v25 requests with explicit OAuth/manager/serving-customer configuration. Missing configuration fails; there is no ambient test/development simulator. Tests inject an HTTP transport explicitly. The client bounds request/response size and deadlines, validates resource-operation kinds and returned names, preserves safe provider request IDs and never automatically retries a mutation whose outcome may be unknown. Manager-read success does not claim write permission. Legacy offline conversion upload defaults unavailable because its current caller lacks canonical booking/account lineage.

GoogleSearchPlan builds explicit grouped operations with a distinct daily budget, paused campaign/ad group/RSA/keywords, exact/phrase keywords, resolved geo/language criteria and a fixed canonical property destination. It accepts only the supported, explicit M1 configuration; it does not invent missing headlines, descriptions, audience restrictions, political-content disclosure or bidding intent. Negative temporary IDs are Google request-local references only. Search M1 uses text and does not upload property images/video; creative media integration belongs to later milestones.

GooglePublishingStore verifies campaign and published-listing ownership, the exact stored/generated canonical slug and a matching financial ceiling. It commits a request claim before the provider operation, with a semantic fingerprint and protocol/customer identity. Same-key committed requests can replay; another key, changed request, uncertain prior attempt or existing entities without evidence block new creation. Completion atomically persists provider-returned paused entities and transaction outcome. Unknown outcomes cannot expire into blind retries, and a late failure cannot overwrite a committed result or clear quarantine. No money is debited or captured by this store.

GoogleAdsProvider validates the actual non-manager serving account/currency, executes one atomic create request, validates returned IDs and reads back all three configured paused statuses, destination and unshared daily budget before persisting success. Read failures, unexpected IDs/statuses or persistence failures after provider acceptance retain uncertainty. Reporting fetches real provider-shaped values; unavailable metrics are not replaced by simulated numbers or zeros. Parent eligibility alone never becomes a LIVE claim. Structural reconciliation compares expected parents, child statuses and budget association/amount; it does not certify targeting, creative or delivery.

Unimplemented pause/resume/budget controls explicitly return failure. DCO no longer invents applied asset updates. No new host/admin launch endpoint calls this foundation; server.ts's unconditional Google dispatch gate is unchanged. Meta/admin launch defects and provider-neutral reporting defects remain unresolved.

## Configuration and internal input contract

Server configuration: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_MCC_CUSTOMER_ID`, `GOOGLE_ADS_CUSTOMER_ID`, and `GOOGLE_ADS_LANDING_ORIGIN`. The serving ID must be explicit and distinct from the manager; account eligibility/classification still needs verification. Landing origin must be the public HTTPS origin, without a path/query/credentials. Optional `GOOGLE_ADS_DEVELOPER_TOKEN` is not treated as proof of current Cloud-project API access. No values were read or operated during this milestone.

Existing `ProviderPublishRequest` method signatures are retained, but Google creation now requires `objective: BOOKINGS` and `metadata.googleSearch` matching the exported `GoogleSearchConfig` in `GoogleSearchPlan.ts`. Required settings are version 1; three to fifteen headlines; two to four descriptions; explicit exact/phrase keywords; resolved location/language constants; presence mode; daily budget minor units; MAXIMIZE_CONVERSIONS; and explicit non-EU-political-advertising declaration. Existing creative headline/description must occur in the submitted text set. INR/USD only; unsupported currency/implicit FX is rejected. Optional startTime/endTime are paired YYYY-MM-DD calendar dates, translated to day boundaries in the serving customer's timezone. These constraints intentionally reject legacy incomplete requests.

`createCampaignHierarchy` requires a PostgreSQL pool supporting `connect()`, not a connection already inside an unknown caller transaction. Its success describes recorded paused creation, not policy approval or delivery. Financial contract limits are checked as integer minor units; they do not establish captured funds or an enforceable lifetime provider cap. Activation remains unavailable until the finance/control milestones are accepted.

No schema migration, public API route, property field, pricing contract or UI was changed. The existing provider/financial table definitions are used. Temporary test fixtures add only minimal parent listing/campaign tables and read exact provider/financial DDL as text from server.ts, without importing the application.

## Verification results

| Suite | Passed | What it exercises |
|---|---:|---|
| google_client | 49 | Real HTTP code with explicit fixtures: credential failure, deadlines, atomic request shape, response identities, error redaction/classification and conversion containment |
| google_search_plan | 81 | Actual payload builder, input boundaries, temporary references, currency/micros, dates, destination and semantic fingerprints |
| google_store | 39 | Real local PostgreSQL claims/replays, competing keys, owner/slug/contract boundaries, legacy entities, atomic inserts, uncertain outcomes and rollback |
| google_provider | 25 | Real adapter/client code plus real local PostgreSQL: paused creation/readback, simultaneous publish calls, lost/malformed responses, post-provider persistence failure, child/budget drift, telemetry and source-extracted dispatch containment |
| Existing google_budget | 11 | Existing pure integer budget conversion regressions |
| Updated google_dco | 2 | No fabricated optimization, no local writes for an unapplied winner, inconclusive no-op |
| **Total** | **207** | **Six suites; no failures or skips; final run 7.30 seconds** |

Full `npm run typecheck` passed (both app and server no-emit checks). The existing server.ts `@ts-nocheck` limits what that proves about the server; the new provider modules have no such suppression. Vite production build passed in 21.32 seconds with existing large-chunk warnings; server TypeScript compilation passed. The Vite build used the project's actual configuration with `envDir:false` and a cleared environment to avoid environment-file loading. No frontend runtime/UX acceptance was performed for this backend milestone.

An additional strict TypeScript check rooted at GoogleAdsProvider.ts and its dependencies passed. Final source integrity found only the four intended pre-existing Google implementation files changed among the 154 inventoried application/migration files; server.ts and all migrations remain unchanged. Thirteen scoped implementation/test files are hashed in M1_SOURCE_HASHES.json. Updated document links resolve, and the temporary PostgreSQL fixture directories were removed after shutdown.

Independent agents reviewed provider boundaries, transport/payload contracts and storage. Review caught canonical destination/owner binding, integer precision in readback, local parent corruption, child-state/budget drift, legacy entities without transaction evidence and false LIVE from parent-only eligibility. These were corrected and regression-tested. Re-review found no additional blocker within this M1 scope; this is not an external certification of Encho.

Reproduction commands (each is a separate command):

```sh
env -i PATH="$PATH" NODE_ENV=test node node_modules/vitest/vitest.mjs run --config vitest.marketing-m1.config.ts
env -i PATH="$PATH" NODE_ENV=test npm run typecheck
env -i PATH="$PATH" NODE_ENV=production node --input-type=module -e 'import { build } from "vite"; await build({ envDir: false });'
env -i PATH="$PATH" NODE_ENV=production node node_modules/typescript/bin/tsc -p tsconfig.server.json
```

The isolated Vitest config has no dotenv or application setup. PostgreSQL binaries are discovered via `HARVO_POSTGRES_BIN`, PATH or the macOS installation fallback. Fixtures launch a fresh temporary Unix-socket-only cluster, never use DATABASE_URL/Neon, and shut it down afterward. Provider HTTP responses and IDs are explicitly synthetic test fixtures; no request reached Google or Meta. Concurrency was exercised against real PostgreSQL, while network failure and post-provider persistence failure were injected. This is not a process-kill, production RLS or full load/soak certification.

Earlier intermediate failures were corrected: a test incorrectly named the existing dispatch function and expected it to throw, while the actual gate returns `dispatched:false`; one strict TypeScript computed-key cast failed and was replaced with an exhaustive typed switch. Neither failed intermediate run is represented as acceptance. Historical server-importing Google sandbox suites still assume fabricated IDs/fixed telemetry and are not acceptance evidence for this adapter; they were not run against an ambient database or rewritten wholesale here.

Temporary raw logs: `/tmp/harvo-m1-tests.log`, `/tmp/harvo-m1-typecheck.log`, `/tmp/harvo-m1-build.log`, `/tmp/harvo-m1-server-build.log`. Those files are not durable evidence; relevant outcomes are recorded here. Scoped pre-edit snapshots are under `/tmp/encho-harvo-m1-before`; no Git repository existed in this workspace. `M1_SOURCE_HASHES.json` records the final scoped sources.

## Remaining release boundaries

- Real Google/Meta account access, billing/advertiser classification and a host-authorized live campaign have not been validated.
- The existing admin/Meta funding, active-creation and daily/total-budget defects remain M2/M3 blockers. No real payments or ad spend occurred.
- Unknown Google creation requires manual investigation through recorded IDs/request evidence; automatic recovery/control and paused-keyword activation are not implemented in M1.
- Google worker bodies currently only import the adapter and return success. They cannot reconcile M1 records. The control-center transaction query is not provider-scoped and must be repaired before these records reach ordinary dashboards.
- The Meta provider abstraction also constructs synthetic IDs. Do not connect a generic registry publisher assuming that adapter is real.
- Host/admin interactive production UI, media processing, calibrated AI recommendations, canonical conversion uploads and booking-lift experiments remain later milestones.
- Current whole-funnel readiness stays 2/10. Local milestone completion is not permission to launch the existing system or a promise of profitable bookings.

## Provider references

Contracts were checked against [v25 mutation requests](https://developers.google.com/google-ads/api/reference/rpc/v25/MutateGoogleAdsRequest), [REST Search](https://developers.google.com/google-ads/api/rest/common/search), [grouped operations](https://developers.google.com/google-ads/api/rest/examples#grouped_operations), [RSA creation](https://developers.google.com/google-ads/api/docs/responsive-search-ads/create-responsive-search-ads), [v25 Campaign protobuf](https://raw.githubusercontent.com/googleapis/googleapis/master/google/ads/googleads/v25/resources/campaign.proto), [EU declaration guidance](https://developers.google.com/google-ads/api/docs/api-policy/eu-par), [developer-token migration](https://developers.google.com/google-ads/api/docs/api-policy/developer-token) and [offline conversion guidance](https://developers.google.com/google-ads/api/docs/conversions/upload-offline). Current conversion-upload eligibility may require a different ingestion integration for new accounts; M4 must verify this rather than assume an endpoint grants access.
