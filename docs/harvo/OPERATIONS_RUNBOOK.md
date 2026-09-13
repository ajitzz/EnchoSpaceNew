# HARVO marketing operations and release evidence

13 September 2026. This runbook accompanies the continuous implementation. Source availability and local tests do not establish a production launch. No migration, payment, ad publication, account mutation or deployment was performed against the user's live environment during these checks.

## Commercial contract and boundaries

The approved introductory setting is **3–5% profit markup on defined campaign costs**, controlled prospectively by an administrator. If the approved cost base is C and the markup is p, the quoted profit is C × p, rounded in minor units; the charge is C + profit + any separately specified remittance tax. A 5% markup on costs is not a 5% margin on receipts. The booking commission is separate. Net company profit cannot be guaranteed by this quote because support, losses and overhead may not be included in C.

The operator must supply actual accounting, tax and cost-scope references in the immutable policy. No Indian tax rate, recoverability rule or gateway fee is guessed. Quotes freeze these terms. Unused funds are refundable subject to verified availability and original-payment limits; paused delivery alone never proves final spend. Existing legacy wallet numbers are not imported as verified captures.

## Configuration and installation

Keep secrets in the deployment's server environment. Do not put them in HARVO, client bundles, screenshots or support logs. `HARVO_MARKETING_CONFIG` is a JSON object validated by `src/lib/marketing/config.ts`. Required fields are:

| Field | Required meaning |
|---|---|
| origin | Canonical public HTTPS origin serving the actual `/stay/:slug` property pages |
| mediaOrigins | Exact HTTPS origins with approved, immutable property media; no private/network-local hosts |
| currency | INR or USD; current implementation routes the supported currency to Razorpay or Stripe respectively |
| markupBps | Integer 300–500; basis points of the defined cost base |
| policyAdminId | Existing persisted administrator used as the audited service actor |
| financialPolicy | id, version, currency, costCodes, accountingApprovalReference, taxApprovalReference, costScopeReference, rounding HALF_UP, varianceHandling PLATFORM_ABSORBS_OVERRUN, markupMinBps and markupMaxBps |
| costRules | Exactly one rule for each non-media cost code: code, intentional label, base FIXED/MEDIA/CHARGE, fixedMinor decimal integer string and rateBps |
| remittanceTax | Explicit base NONE/PROFIT/COST_PLUS_PROFIT and rateBps, justified by the supplied policy |
| fundingEnabled / publishingEnabled / activationEnabled | Independent booleans; begin false |
| providerClearance | Actual META/GOOGLE account and advertiser classification acceptance references for enabled channels |
| checkoutAcceptanceReference | Actual canonical guest checkout acceptance reference, required for activation; an arbitrary string is not organizational acceptance |
| meta | Allowed ISO2 countries, supported Facebook/Instagram feed/reels placements, explicit specialAdCategories classification |
| settlement (optional) | Distinct existing human finance operatorIds, approved accounting-close policyReference and optional exact documentOrigins per issuer; at least two operators are required |
| conversions (optional) | Google customerId (conversion owner) and conversionActionId; Meta pixelId. Destination configuration does not supply accepted checkout/consent code ports |

Each provider has one MEDIA cost code. Other allowed cost kinds are SERVICE and NONRECOVERABLE_TAX. Unsupported classifications or nonconvergent charge-dependent fees fail closed. Operator references need review by the responsible people; a schema can validate format, not the validity of a legal opinion or a provider agreement.

Server environment requirements are reported by `npm run marketing:check`. The command prints names and presence only; it does not load `.env` automatically, contact providers or certify credentials. Pass an intended file explicitly with `-- --env-file /absolute/path`. Google needs developer token, OAuth client/secret/refresh token and the actual serving customer ID; an optional manager ID is distinct. Meta needs token, app secret, account, page, pixel and an Instagram identity when using Instagram placements. AI requires both a Gemini key and explicit model. Each gateway requires its real account identity and a dedicated marketing webhook secret. Production JWT secrets must be strong and server-only.

Deployment sequence:

1. Build and test the intended source revision in an isolated environment. Preserve the existing application database and an encrypted restore point. Do not run test fixtures against Neon.
2. Verify the existing parent tables/schema and all prior canonical migrations. Apply additive `009_harvo_marketing_finance.sql`, `010_harvo_marketing_workflow.sql` , `011_harvo_marketing_measurement.sql`, `012_harvo_marketing_settlement.sql`, `013_harvo_marketing_conversion_delivery.sql` and `014_harvo_marketing_request_limits.sql` using the versioned runner on the intended staging branch first. Fresh local acceptance fixtures supply the legacy parent schema; they are not a complete production database bootstrap.
3. Compare exact migration checksums and review RLS as a non-superuser application role. The legacy migration runner warns on checksum drift; treat that warning as a stop condition. Never silently replace an applied migration with edited SQL.
4. `npm run marketing:check -- --database --env-file /absolute/path` performs bounded read-only schema/checksum, persisted service actor, queue and database-role checks. A superuser/BYPASSRLS application connection is a release failure. Use existing securely supplied TLS connection parameters; never print the database URL.
5. Register the reviewed immutable policy with `npm run marketing:register-policy -- --env-file /absolute/path`. This explicit command writes the policy and verifies that the referenced actor is an actual administrator. The application does not create an approval on startup.
6. Deploy the API and UI with funding, publishing and activation disabled. The UI must show missing capability evidence. Existing production users must retain their actual roles; audit historical admin grants and rotate sessions/secrets because insecure historical identity shortcuts were removed.
7. Start `npm run marketing:worker` as a separate supervised process with the intended server environment. It verifies the persisted service actor and database/RLS readiness. Set `HARVO_HOLD_SWEEPER_ENABLED=true` to explicitly assign canonical expired-hold cleanup to this worker. The API process does not implicitly launch this worker. See DEPLOYMENT_HARDENING.md for compiled entrypoints, Node24, liveness/readiness, progress supervision and shutdown grace. SIGTERM stops new work and drains the current attempt; configure termination grace longer than bounded provider timeouts.
8. Register dedicated signed webhook URLs `/api/webhooks/marketing/v2/stripe`, `/razorpay` and `/meta` as applicable. Meta GET verification also requires `META_MARKETING_WEBHOOK_VERIFY_TOKEN`. Validate challenge/signature/replay behavior in the intended environment before real captures. Invalid events never fund campaigns.
9. Enable the supported channel only after the actual host/property, provider account, cost policy, payment/refund and checkout checks below are evidenced. Enable funding, paused publishing and activation separately. Re-run read-only preflight after every configuration change.

## Worker and recovery rules

PostgreSQL jobs use leases, SKIP LOCKED claims and increasing fences. The same campaign revision and pending job identity must authorize a write. A database fence cannot cancel a remote HTTP request already sent. Therefore ambiguous creation or activation is quarantined, never blindly retried using a fresh key. The provider store separately prevents overlapping conflicting operations.

| Situation | Required response |
|---|---|
| AI unavailable or interrupted | Null score and explicit human-review requirement; expired evaluation recovery must preserve revision/evaluation identity |
| Meta video still processing with a known upload ID | Retry the same immutable job/request after the provider delay; never upload a second copy as recovery |
| Unknown creation/activation result | Preserve job, correlation ID, request fingerprint and every known external ID; inspect the original account. Do not create a replacement campaign or edit the database to success |
| Pending activation blocks pause | Treat as an urgent operator incident. An older unknown activation may still finish; pause in the provider account and reconcile after that operation is proven quiescent. Do not claim local pause has stopped spend |
| Reporting fails during active delivery | Durable precautionary pause is queued. Keep the last observation visible with its time. A failed read cannot overwrite a separately queued host pause |
| Budget/inventory/price protection triggers | Verify the provider pause readback. The displayed request is not proof of cessation or final billing |
| Payment webhook repeats | Same verified payment/event is idempotent. A different capture against the same quote is journaled and held for review, not discarded |
| Refund request | Move eligible available money to refund payable and enqueue atomically. Return only to the verified original account/payment |
| Refund provider pending with known ID | GET-only readback of that same refund identity; no second POST |
| Refund write outcome unknown without ID | Keep the obligation held for manual provider reconciliation. Never report refunded, free the payable, or resend |
| Paused campaign has unused reserve | Obtain trustworthy final provider closure and actual cost/tax evidence before settlement/release; pause and zero impressions are insufficient |

Refund sweeps recover durable requested obligations after a process interruption. Requests with known provider IDs can be read again. Unknown writes remain quarantined. Amounts move out of refund payable only after a matching final provider status.

The admin financial-close workspace now provides documentary settlement: retain real issued documents, bind account/campaign/revision and exact costs, prepare a proposal, obtain independent currently authorized finance-admin review, then commit. The second operator must download and verify the exact document hashes and check the original billing source. The server independently checks all authority, allocations and a fresh authenticated provider stop. Unused reserve becomes available/refundable balance; no automatic card refund is claimed. See SETTLEMENT_COMPLETION.md. An automated provider invoice import and post-close correction workflow remain **unconnected**. No dashboard poll or pause flag establishes final billing. Late billing adjustments must be escalated through the accounting procedure without inventing a database success override.

## Measurement, optimization and media limits

Provider telemetry is polled at five-minute scheduling intervals; the visible workspace refreshes every 30 seconds while open. Those are refresh schedules, not a promise about provider data latency. `observedAt` means retrieval/observation time. Unknown source `dataAsOf`, missing profile visits, leads and canonical bookings remain unavailable. Provider-attributed conversions are separately labelled and never substituted for fulfilled bookings or incrementality.

The canonical measurement module supports immutable booking events, consent, cancellation/refund corrections and quarantined upload outcomes. Its trusted checkout-verifier port and real conversion-upload consumer are not connected to the legally blocked guest checkout. Conversion-guided optimization cannot be accepted until that path is verified end to end. Native provider bidding, supported Search keywords/locations and bounded protection are implemented; no empirical uplift or universal best audience has been proven. PMax, Hotel feeds, automatic retargeting, full multi-asset DCO and automatic video generation are not enabled by a marketing checkbox.

The initial Meta request uses the selected genuine lead image/video; a video requires a selected genuine thumbnail. Server AI reads approved image pixels under bounded public-origin/DNS/size limits. Video review falls back to explicit human review. For still images, the connected creative workflow can queue deterministic provider canvases, store source/output hashes in immutable S3 keys, verify the configured CDN bytes, and require host plus independent admin review before the exact derivative is bound to a Meta campaign. This is a review and delivery control, not a claim that every provider placement accepts every format. S3 presigned writes now require If-None-Match `*` and signed Content-Type; the five upload clients support that response contract. Before rollout, configure bucket CORS for PUT/content-type/if-none-match, expire or block older reusable capabilities, and verify bucket delete/copy/overwrite restrictions. See `S3_UPLOAD_IMMUTABILITY.md` and `CREATIVE_REVIEW_WORKFLOW.md`. Approved media URLs must refer to immutable objects; editing an object in place invalidates the review contract. The local uploader uses exclusive immutable keys to remove the identified overwrite path.

## Pilot and production acceptance record

Record the source manifest, deployment version, environment, actual account IDs (never tokens), responsible operator and timestamps. Required evidence includes:

- One named host/property with available bookable inventory, consent/rights, agreed dates and a fixed maximum real spend per channel.
- Real payment success, signature replay, duplicate-click behavior, gateway reconciliation and a verified refund to the original payment.
- Google serving customer currency/time zone/permissions and actual Search total-budget creation; Meta account/page/pixel/Instagram identities, category/placement eligibility and actual paused hierarchy IDs.
- Exact approved revision published paused, independent readback, explicit activation, actual observed delivery, a pause test and final bill reconciliation. Provider rejection is recorded as rejection.
- A genuine booking through the canonical checkout, capture/fulfillment/refund correction, consent-dependent conversion upload and provider per-item acknowledgement.
- Representative concurrency/load evidence with latency percentiles, query counts, pool saturation, queue lag, retries, spend protection latency, alerts and a tested database restore. Local disposable-cluster tests are useful but cannot establish production service levels.
- Host economics using fulfilled stays and actual all-in costs, not clicks alone. No “maximum bookings” guarantee or production score is assigned before this evidence.

No live pilot ran during this implementation. The local environment lacks operator/cost configuration and several required serving-account, pixel, AI and gateway identities/secrets; the founder has not supplied a named pilot campaign and bounded spend. The existing guest M5/M6B legal/checkout acceptance is unchanged. These are unresolved inputs and acceptance dependencies, not a request to reapprove ordinary engineering work.

## Rollback

Disable new funding/publication/activation and stop taking new jobs. Inspect and pause known provider campaigns through verified provider controls; stopping a worker does not stop external spend. Drain bounded in-flight work and preserve unknown outcomes for reconciliation. Keep payment/refund reconciliation operational where possible. Preserve all journal, quote, capture, operation and audit evidence. Restore application code only from the scoped backup/source artifact after compatibility review; do not delete ledger history, reset fences, restore fake metrics or reopen legacy paid publication as rollback. Test restore on an isolated database before using an operational backup.

## Verified local build and configured database follow-up

The final marketing suite passed 591 tests in 24 files and the current client/server builds passed. Browser acceptance passed 29 checks. Latest local 30-concurrent workspace read p95 was 507 ms; no 200 ms SLA is accepted. The read-only configured database check found missing inventory_days/HARVO tables and a role that bypasses RLS. See the continuous verification and metadata artifact before selecting the intended staging/migration environment.

`POST /api/marketing/v2/campaigns/:id/cancel` can cancel only a never-submitted campaign under exact revision/key/reason. It rejects every known/failed/unknown provider claim, entity, spend authorization and activation history; an intact reservation can be journaled back to available and pending publish fences invalidated atomically. It does not void existing gateway checkout URLs. Already completed or in-flight gateway requests may still capture and must be reconciled/refunded through their original identity. A cancelled campaign cannot start a new checkout or republish; the gateway claim rechecks the current workflow under lock.

## Added integration configuration and operational evidence

Google canonical purchase delivery uses a refresh grant with the Data Manager scope, supplied as `HARVO_GOOGLE_DATA_MANAGER_REFRESH_TOKEN`, alongside the configured OAuth client/secret. The existing Ads refresh grant is not assumed to include this permission. Google destination ownership, action and manager configuration must match actual provider setup. Meta accepts the same canonical access token (or supported META_API_TOKEN alias) as its publisher. `/admin/readiness` reports actual missing consumer ports, and `/admin/operations` reads queues inside a trusted current-admin database scope. Readiness is not proof of a successful conversion, attribution or booking lift.

The default runtime intentionally has no accepted canonical booking/capture verifier or current-consent attribution resolver. Implementing these requires accepted guest checkout/settlement authority; do not connect historical booking-request or CONFIRMED-only Purchase code. See CONVERSION_COMPLETION.md for purchase/correction limits.

AI copy guidance is `POST /campaign-guidance`, owned/published listing only, five requests per host/hour shared in PostgreSQL. Provider targeting is under `/targeting/google`, with a shared bounded request budget. Hosts choose human-readable Google-supplied locations/languages and operator-enabled Meta countries. The server checks displayed targeting against provider IDs before a new draft or revision is saved.

Campaign history and property selection use keyset pages. Admin settlement document/proposal history also uses keysets and bounded literal searches. Document downloads are current-finance-admin-only, attachment responses, no-store and checksum verified. Do not expose master billing files in the host projection.

The deterministic image/S3 pipeline produces review-required derivatives with source/output hashes and immutable storage checks. The host/admin creative API and studios now expose the queue, exact image evidence, host confirmation and independent admin decision; a selected approved derivative is revision-bound before Meta publication. Existing approved originals and verified Meta video upload remain the active publishing path when a derivative is not selected. A configured S3/CDN environment and provider pilot are still required before this path is considered externally accepted.

The founder reports remote hosting/configuration completed. This run's configuration check read only the local `.env` presence (never secret values); it still lacked several required v2/AI/provider/payment fields. The remote environment needs its own version/schema/role/runtime checks using the actual deployed URL and operator access.
