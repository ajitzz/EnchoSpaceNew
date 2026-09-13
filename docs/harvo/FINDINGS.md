# HARVO — Evidence-backed findings

## M1 remediation status — execution discussion 010

The observations below retain their original source-snapshot context. M1 changes the Google adapter only; see [M1_VERIFICATION.md](M1_VERIFICATION.md) for 207 passing local tests, build/typecheck and review evidence. No live provider or whole-funnel acceptance is implied.

| Finding | Current status after M1 |
|---|---|
| H-048 | Original synthetic creation replaced with real v25 paused Search operations, exact property/customer binding and durable returned-ID/readback evidence. LOCALLY REMEDIATED; account/live acceptance remains pending. |
| H-049 | Implicit credential-driven simulation removed; missing configuration fails. LOCALLY REMEDIATED and negative-tested. |
| H-050 | Google transport/provider version unified at v25 with contract tests. LOCALLY REMEDIATED; actual project/account access and ongoing sunset monitoring remain pending. |
| H-051 | Legacy uploads disabled by default; explicit transport tests reject partial failures. CONTAINED, OPEN for canonical booking lineage, eligible ingestion, per-item retries and adjustments. |
| H-052 | Fabricated applied DCO actions removed; winner mutation reports unavailable without writes. CONTAINED, OPEN for real bounded optimization. |
| H-054 | Google adapter fixed reporting/control simulations as described below. LOCALLY REMEDIATED; end-to-end dashboard/worker consumption remains open. |

### H-053 · P1 · Generic Meta provider creation also constructs synthetic identifiers

**Source verified in M1 review:** `src/lib/providers/meta/MetaAdProvider.ts:99–153` writes COMMITTED/ACTIVE and constructs `meta_camp_*`, `meta_adset_*`, `meta_ad_*` and creative identifiers without a Meta create call. This is separate from the existing server Meta dispatch path. **OPEN:** do not introduce generic registry-based publishing until it delegates to verified provider execution and obeys financial/activation boundaries. M1 did not change this adapter or assert a live Meta incident.

### H-054 · P1 · Google adapter control, reporting and reconciliation simulated success

**Pre-M1 source verified:** GoogleAdsProvider's pause/resume/budget methods updated local state without network mutations; telemetry returned fixed 1250 impressions/45 clicks/3 conversions/USD spend; delivery/reconciliation could default to enabled/live/consistent. **M1 local remediation:** unimplemented controls return explicit failure, reporting performs real client queries, missing data remains unavailable, parent-only eligibility never becomes LIVE, and structural reconciliation checks child parentage/statuses and budget evidence. Covered by integrated HTTP/real-PostgreSQL tests. Remaining worker/dashboard integration and full delivery acceptance are M3/M4.

### H-055 · P1 · Google workers and shared transaction projection cannot consume real multi-provider evidence

**Source verified:** `worker.ts:535–564` only imports the Google provider before returning reconciled/synced success. `src/lib/campaignControlCenterService.ts:104–129` selects the newest publishing transaction without provider scope and later applies Meta-specific projection fields. **OPEN:** implement actual recovery/sync work and provider-scoped evidence consumption before wiring M1 into host/admin production flows. No worker correctness claim follows from the new adapter.

## Google acquisition research increment — discussion 008

At the discussion 008 snapshot all entries were OPEN; current M1 status is recorded above. No live provider or production database was exercised. Research context: [BOOKING_GROWTH_RESEARCH.md](BOOKING_GROWTH_RESEARCH.md).

### H-048 · P0 · Google hierarchy creation reports success without creating provider resources

**Source verified:** `src/lib/providers/google/GoogleAdsProvider.ts:106–234`. The method validates/reads local inputs, builds external resource names from campaign/local IDs, persists eligible/enabled entities and returns success. It does not issue a Google campaign hierarchy create mutation in that method. It uses manager-account/fallback identity without establishing the correct ad-serving customer. This is not confined by an explicit sandbox guard in the method.

**Required verification:** actual serving-customer mapping, paused provider creation using supported API contracts, authoritative returned resource IDs, unknown-outcome recovery and local success only after verified provider evidence. A version bump alone cannot repair this.

### H-049 · P0 · Missing Google credentials silently selects simulated successful behavior

**Source verified:** `src/lib/providers/google/GoogleAdsClient.ts:31–54`, `:125`. Missing GOOGLE_ADS_REFRESH_TOKEN enables sandbox mode even outside tests; sandbox validation reports valid and searches return mock campaign data. Mode selection ignores supplied constructor refresh-token credentials.

**Required verification:** explicit isolated simulation mode; production missing/invalid configuration fails unavailable; no simulated resource can enter production truth. Do not use this finding as evidence of a live configured account's behavior.

### H-050 · P1 · Google transport and declared API versions disagree and are obsolete

**Source verified:** GoogleAdsClient.ts:144/:202 use v17; :267 uses v18; GoogleAdsProvider.ts:32 declares v18. Earlier discussion shorthand mentioning only v16 is superseded for these inspected paths. Google's current release schedule lists v25 as released and future versions separately.

**Required verification:** versioned provider adapter, supported-release migration with payload/response tests, current account/API access checks, compatibility/sunset monitoring and provider-shaped negative cases. See current [Google version timetable](https://developers.google.com/google-ads/api/docs/sunset-dates); actual account access remains unknown.

### H-051 · P1 · Google offline upload treats batch HTTP success as every conversion's success

**Source verified:** `src/lib/providers/google/GoogleOfflineConversions.ts:24–86`; GoogleAdsClient.ts:252–292. Client enables partialFailure, but service marks all input bookings uploaded after any successful HTTP response without inspecting individual errors. Query selects legacy confirmed bookings with click IDs without campaign/client partition, uses total_rent/created_at, hardcodes INR and omits bookingId as an upload order identifier.

**Required verification:** canonical captured-payment/event authority, serving/conversion customer and campaign lineage, per-item acceptance/retry, stable order identity, correct currency/time/value and supported cancellation adjustments. Successful upload and provider attribution must remain distinct. No incorrect live upload was observed.

### H-052 · P1 · Google DCO reports external rotation and pinning from local updates

**Source verified:** `src/lib/providers/google/googleDcoStrategy.ts:22–88`. Winning/losing local IDs form synthetic external asset names; local provider_entities updates generate success/actionsTaken without a Google mutation in that method.

**Required verification:** provider-specific asset operations with returned identifiers, verified external changes, consistent recommendation/requested/applied states and real outcome evaluation. Does not imply every Google-related transport method is absent.

## Paid funnel audit increment — discussion 007

All findings below remain **OPEN**. Source observations concern the local snapshot; no production incident or money loss is asserted. Detailed context, proposed remedies and validation: [PAID_CAMPAIGN_AUDIT.md](PAID_CAMPAIGN_AUDIT.md).

### H-034 · P0 · Campaign reads simulate and persist spend and performance

**Source verified / offline reproduced:** `server.ts:4954`, `server.ts:5124`, `server.ts:5268`. The ordinary campaign GET invokes syncCampaignSpend. Eligible active/subscribed campaigns acquire elapsed-time spend, generated impressions, sine-derived CTR and estimated conversions; SQL persists those totals without provider data. No test-mode guard was found on this path. Other truth projections may prefer variant snapshots, but simulated legacy writes/fallback remain.

**Observed:** extracted-source diagnostic with ten elapsed minutes generated 72 spend, 900 impressions, 20 clicks and captured an UPDATE; no real database was used. [Evidence](PAID_FUNNEL_PROBE.json).

**Required verification:** production reads cannot fabricate/write performance or budget burn; genuine provider snapshots/corrections and all fallback consumers share an explicit source contract. This is not proof of an actual host debit.

### H-035 · P0 · Admin content approval manufactures paid and released state

**Source verified:** `server.ts:12761`, `server.ts:12815`, `server.ts:8253`, `components/AdminDashboard.tsx:662`. Despite role/row-lock/audit protections, approval writes paid/released/subscription-active state without captured-funding proof and invokes a dispatch path bypassing the normal escrow delay. Response/UI can claim live success despite swallowed dispatch failure.

**Required verification:** separate content, capture/reservation, risk release and provider activation authorities; no admin mutation may fabricate payment evidence; response describes actual durable outcome. Replay and unpaid-campaign negative tests needed.

### H-036 · P0 · Total media authorization is assigned as Meta daily budget

**Source verified:** `server.ts:9867`, `server.ts:9886`, `server.ts:9927`. Active campaign/ad-set creation uses total authorized media minor units as daily_budget, with no lifetime/end-time boundary in that payload. The daily<=total comparison cannot establish a multi-day total ceiling. This contradicts paused-creation/separate-activation intent. Actual overspend was not observed.

**Related mismatch:** awareness/reach publishing versus traffic preview and guest booking goal; legacy destination/default listing-ID fallback needs canonical destination validation.

**Required verification:** immutable media authorization distinct from daily pacing, provider-specific total exposure controls, paused creation and explicit activation, correct duration/currency/rounding and verified campaign destination/objective. Real provider-shaped contract tests and bounded staging evidence required.

### H-037 · P1 · Failed external verification can be stamped ACTIVE and fresh

**Source verified:** `server.ts:10121` onward defaults externalVerifiedStatus to ACTIVE, tolerates a failed verification fetch, then writes verified_at, success and active child records. Child effective state is not independently established by copying campaign state. Other external reconciliation machinery exists but does not make this write truthful.

**Required verification:** unknown/stale preserves uncertainty, success requires actual evidence, each hierarchy level has its own observation, and HTTP/UI statuses agree with durable state.

### H-038 · P0 · Host breakdowns and authenticity claims are fabricated

**Source verified / offline reproduced:** `src/lib/campaignControlCenterService.ts:927–1140`, `components/HostMetaProofBadge.tsx:29`. Geographic/placement/age/gender/device shares are fixed; affinity is index-based. Proof invents missing provider IDs, labels a constructed string SHA256 and always marks integrity verified. Pricing always reports synchronized with a default price. Host/admin projections render these values.

**Required verification:** remove unsupported customer-facing measurements/guarantees; persist real source evidence and return unavailable for missing data. A checksum alone does not authenticate provider provenance. Cross-reference H-015 pricing synchronization.

### H-039 · P1 · Metric meanings and units disagree across reporting layers

**Source verified:** `src/lib/campaignControlCenterService.ts:301`, `:730`, `:989`; `components/HostCampaignPerformanceCard.tsx:167`; `src/lib/metaTelemetrySyncEngine.ts:330`. CTR ratio is displayed as percentage without multiplication; generic clicks labelled link clicks; impressions can substitute for reach; lead/purchase conversions merge; funnel views equal clicks while bookings/revenue are hardcoded zero. No profile-visits lineage was found in inspected host/service/server searches.

**Required verification:** explicit provider fields, units, currency/window/time zone/attribution, CRM deduplication and canonical booking lineage; missing data distinct from zero. No implication that profile visits is universally unsupported by providers.

### H-040 · P1 · AI/media assurance is not bound to complete evaluated campaign evidence

**Source verified:** `server.ts:7168`, `server.ts:8410`, `server.ts:11955`; `components/HostCampaignAiAdvisorCard.tsx`. Separate grading paths, successful default scores, text/media-count-only prompt, absent queried listing image aliases, copy rewrite during funding and incomplete material-field hashing undermine one approved revision. Advisor includes deterministic/default claims without supporting observations. Extends H-013, not a claim that no real AI call exists.

**Required verification:** typed evaluation result and execution state, actual asset evidence, immutable input/output revision, complete provider payload binding, honest unavailable/human-review state, and advisory claims grounded in observed data. AI quality score must not be treated as provider approval.

### H-041 · P0 · Wallet/campaign checkout has broken references and ambiguous currency authority

**Source verified:** `server.ts:12081–12136` reads balance before its transaction, chooses a fixed 83.5 conversion by balance heuristic, then references undefined txRes inside the transaction. The handler's request-derived amount/15% split lacks the newly selected cost-plus contract. `components/HostMarketing.tsx:1469–1514` treats campaign order initialization without checkoutUrl as payment success despite Razorpay returning pending_webhook/orderId. A separate Razorpay wallet top-up UI exists.

**Required verification:** successful wallet funding under real transaction semantics, authoritative quote/currency and sufficient-funds guard, stable purchase-intent idempotency, actual campaign Razorpay checkout completion and captured-webhook reconciliation. Undefined-reference failure is not proof of committed double charging. Preserve historical fee contracts during later migration.

### H-042 · P1 · Failed variant insights fetch overwrites observations with fresh zeros

**Source verified:** `src/lib/metaTelemetrySyncEngine.ts:330–389`. Defaults zero, ignores request errors and calls syncVariantInsights regardless. Failure/empty response is therefore not distinguished from an actual observed zero snapshot.

**Required verification:** preserve last successful observation, record failed-at/error separately, do not advance successful freshness, and exercise partial variant failures/corrections. Current findings are source-based, not a provider outage reproduction.

### H-043 · P1 · Manual telemetry endpoint and service signature disagree

**Source verified:** `server.ts:12929`, `src/lib/metaTelemetrySyncEngine.ts:256`. Route calls (id, body, viewer, pool); method accepts (id, options, dbClient). Viewer object becomes database client and has no query method. `server.ts` is excluded from meaningful typechecking by ts-nocheck.

**Required verification:** route-level request test with real handler contract, server-derived viewerContext, actual DB argument and allowlisted options. Do not expose forcedInsights or caller-supplied authorization by merely rearranging arguments. No exploit claimed for the currently failing call.

### H-044 · P1 · Scheduled DCO success precedes verified external action

**Source verified:** `src/lib/dcoEngine.ts:540–586`, `:606`; `server.ts:11341`, `:19562`. Scheduled engine enqueues PENDING actions but locally marks PRUNED/WINNER_OPTIMIZED. Inspected reconciler selects REQUESTED/EXTERNAL_OUTCOME_UNKNOWN. Separate server mutation/evaluation implementations exist with different semantics. Exported 80/20 helper returns calculated weights and local status updates without a provider mutation in that function; fallback without variants selects the first URL.

**Required verification:** one authoritative decision/action lifecycle, durable requested/applied/verified states, queued action consumer contract, statistically adequate data and provider-confirmed optimization. Do not infer that no DCO-related provider mutation exists anywhere.

### H-045 · P2 · Polling performs per-campaign detailed query amplification

**Source verified:** `server.ts:5255`, `src/lib/campaignControlCenterService.ts:51–122`, `components/HostMarketing.tsx:910`, `components/HostCampaignControlCenter.tsx`. Up to 200 campaigns each trigger one primary plus up to14 subsidiary truth queries; some histories are unbounded. Five concurrent tasks limit parallelism, not total query volume; list polling every15seconds coexists with control-center20second polling and pacing writes.

**Required verification:** bounded paginated summary read model, on-demand history, visibility-aware refresh and measured load/latency. Approximately3,000 reads per full list is a source-derived upper estimate, not measured throughput or response time.

### H-046 · P1 · Passing transparency tests do not establish production behavior

**Test observed / source verified:** `src/test/phase2_7_m7_host_transparency.test.ts` has eight true-equals-true tests and one locally constructed object assertion. Selected five-suite run:22passed22skipped; three suites fail at setup from missing mock columns. See VALIDATION.md.

**Required verification:** assertions exercise production projections/routes and negative data/authorization cases, fixtures follow migrations, money/ownership guarantees tested in isolated real PostgreSQL. Do not count skipped assertions or local certification titles as passed behavior.

### H-047 · P1 · DCO worker contains a provider-token-shaped literal fallback

**Source verified:** `server.ts`, reconcileDCOExternalActionsWorker near11354 uses an embedded token-shaped value when environment configuration is absent. Validity/privileges are unknown. The value is intentionally omitted; it was not used.

**Required verification:** remove secret fallback behavior in a future authorized fix, establish approved secret storage, investigate whether it was valid/exposed and rotate affected credentials where warranted. No account compromise is asserted.

Snapshot: 13 September 2026. All findings are OPEN. No application changes or live exploit attempts were made. P0/P1/P2 indicate proposed engineering priority, not a claim of a production incident. A source finding may require runtime confirmation of deployment, schema and reachability before its production impact is known.

### H-032 · P1 · Property-category heuristics become guest quality measurements

**Source verified during discussion 003:** `components/ListingCard.tsx:getStayStructure` and taxonomy helpers assign fixed privacy percentages from category/title/rental mode; card JSX around line 630 displays a percentage. `App.tsx:334–358` maps these values into acoustic/crowding ratings for search filtering. These values are not measured or verified property-level evidence in these paths.

**Required acceptance:** distinguish descriptive shared/private space facts from quantitative measurements; no invented acoustic/crowding/privacy quality scores; filters use canonical supported fields with explicit missing-data behavior. Any added host-supplied field must cover host/admin/guest parity. Search-date propagation and actual availability matching need a separate full trace; the inspected handler does not submit dates.

### H-033 · P1 · Landing inspector fabricates successful Encho-domain checks

**Source verified during discussion 003:** `server.ts:5955–5975` builds a default legacy `/listing/:id` URL and checks `landingUrl.includes('encho.com')`. Matching strings receive `{status:200, ok:true, speed:'120ms', issues:[]}` without a fetch; other strings are fetched with a timeout. This is neither an actual health check nor parsed hostname validation. The result is supplied to the AI campaign analysis.

**Required acceptance:** use canonical listing identity and trusted URL construction; validate actual host/protocol and safe request destinations; verify published/bookable destination and measured response where appropriate; distinguish unavailable/not-checked from success. Include adversarial hostname and failed-destination cases. External-fetch SSRF exposure requires a separate full authorization/network-policy trace; no exploit was attempted.

### H-031 · P1 · Meta inbox replay identity and dispatch event types disagree

**Added during Boardroom discussion 001:** `server.ts:11763` receives Meta envelopes and creates an idempotency key including `Date.now()`, so a later replay can insert another row. It stores event type `meta_event`. `src/lib/webhookWorkerService.ts:processInboundWebhooks/dispatchWebhook` routes its dedicated lead handler only for `leadgen`/`new_lead`. An ordinary Meta envelope that does not have the custom top-level metrics event falls through to an unhandled-event warning; the outer worker can then mark it completed. The ad-network endpoint similarly includes current time in its deduplication key.

**Impact:** durable receipt is not proof of deduplicated business processing or delivered leads. The claim of an inevitable retry storm is unproven, but these source contract mismatches are concrete. No live delivery/loss was reproduced.

**Required acceptance:** replay an authentic-shaped signed batch in an isolated environment; expand and route every supported event; stable provider-event/business identity; duplicates cannot add spend/metrics/leads; unsupported events remain diagnosable and recoverable; interrupted processing is reclaimed without duplicate side effects. Preserve durable persistence before HTTP acknowledgement and measure its latency under load.

## Release and customer safety

### H-001 · P0 · Google identity is accepted from untrusted profile fields

**Source verified:** `server.ts:3230` (`POST /api/auth/google`) accepts `googleId`, `email`, and `name`, locates/creates a user, assigns role based on email, and signs an Encho JWT. The inspected handler does not validate a Google-signed identity token or obtain verified user identity server-side. Existing accounts are resolved by the submitted email. This can cross guest, host and admin boundaries wherever that handler is reachable with a working database.

**Required acceptance for a future fix:** reject forged/missing identity proof; verify intended provider/audience/issuer/expiry; bind account linking to verified identity; demonstrate ordinary users cannot acquire another user's session or admin role. Do not send exploit requests to production to establish this.

### H-002 · P0 · OTP verification contains an unconditional development bypass

**Source verified:** `server.ts:3077` accepts a fixed fallback OTP after the normal stored-code check fails; it is not restricted to a test runtime. OTP storage is process-local, and send returns success despite messaging failure. This undermines possession verification and scales inconsistently across instances.

**Required verification:** no production/test bypass; scoped rate limits, attempt bounds and expiry; durable/appropriate shared storage; real delivery/failure reporting; no plaintext OTP logging. Do not copy the bypass value into customer-facing material.

### H-003 · P0 · Privilege assignment and signing fail open

**Source verified:** `server.ts:690` uses a hardcoded JWT-secret fallback. `server.ts:3131` registration grants admin to matching email strings without establishing mailbox ownership in that flow. `server.ts:3176` returns an admin session for a special email when DB configuration is absent without checking a password in that branch. Later login/me paths also promote roles by email.

**Impact:** insecure provisioning and missing configuration can undermine all downstream role checks. Actual configured production secret and account state are unknown.

**Required verification:** explicit secure admin provisioning; fail-closed production configuration; sessions invalidated/reviewed as appropriate after remediation; no email-string privilege escalation.

### H-004 · P0 · Socket room membership is caller-controlled

**Source verified:** `server.ts:19240` sets up Socket.IO; connection handlers join `user_*`, `admin_room` and `thread_*` based on caller events without a token/membership check in this setup. `App.tsx:487` emits room joins client-side. Sensitive notification payloads are emitted to those rooms elsewhere.

**Impact qualification:** applies where this long-running socket server is actually deployed. A Vercel HTTP-only deployment may not expose it; deployment topology was not inspected.

**Required verification:** authenticated handshake; server-derived user/admin rooms; authorized thread membership; token expiry/logout/revocation behavior; rejection tests for cross-user subscription.

### H-005 · P0 · Public room calendar returns private guest and host information

**Source verified:** `server.ts:3466` (`GET /api/listings/:id/room-calendar`) has no authentication middleware or publication restriction in its handler. It returns guest names/emails/avatar, booking dates/status/price, host ID, external block guest names and notes. `ListingDetailsNew.tsx:777` calls it publicly.

**Required verification:** public availability contains only safe date/capacity facts and published-listing data; owner/admin operational calendar is separately authorized; no guest identity, operational notes or private reservation values escape through public endpoints/caches. Actual DB RLS could affect rows returned but does not establish a safe public contract.

### H-006 · P0 · Payment admin routes lack complete privilege enforcement

**Source verified:** `server.ts:18924` overview checks only for a Bearer-shaped header before querying financial rows. `server.ts:18978` force-escrow-release verifies a JWT but does not require an admin role or owner authorization before releasing an approved/paid campaign and attempting dispatch.

**Required verification:** authenticated current admin authority on both endpoints; per-action policy enforcement; immutable audit in the relevant transaction; ordinary host and invalid-token tests; no real escrow release during analysis.

### H-007 · P1 · Calendar pricing mutation lacks listing ownership enforcement

**Source verified:** `server.ts:3429` authenticates callers, then updates supplied listing dates/prices/status without performing the ownership check described by its comment. The inspected RLS block has no `calendar_prices` policy. A separate room-block handler does check ownership, so the stronger adjacent route does not protect this one.

**Required verification:** owner/admin authorization before writes and before triggering ad pause effects; tests using two hosts and distinct listings; consistent date/price validation.

### H-008 · P0 · Canonical guest page invents trust and accommodation facts

**Source + test observed:** `components/ListingDetailsNew.tsx:271` appends stock images; around 293–327 it supplies fallback room tiers; around 1380 it renders unconditional host quality/response claims; at 2507 onward it shows fabricated verified-stay counts/testimonials. Other fallback POIs and ratings exist. Seventeen of 24 M6A truth tests fail in this snapshot.

**Required verification:** guest/host/admin round-trip provenance; sparse/empty real records render honestly; no stock padding, invented room configurations, default ratings, unearned badges or fabricated urgency. The approved zero-fabrication decision already establishes desired behavior.

### H-009 · P0 · Unapproved guest fee and tax calculation in the canonical property page

**Source verified:** `components/ListingDetailsNew.tsx:864` calculates a 15% guest fee and a fixed tax rate, and the reserve handoff repeats it. The approved commercial model forbids guest booking commission; tax rules are legally blocked. Production checkout gating does not remove the misleading pre-checkout total.

**Required verification:** M6A safe price presentation; no unapproved total; M5/M6B server quote after existing sign-off. Do not substitute a guessed tax rate. A currently passing text assertion uses different strings and is not adequate validation.

### H-010 · P0 · Legacy booking path is outside canonical payment/inventory authority

**Discussion007 extension:** `server.ts:8058` CRM lead conversion verifies campaign ownership then inserts a legacy Confirmed booking from supplied details without canonical hold/captured-payment evidence in that handler. Host-assisted conversion must respect the same booking authority; no implementation authorized by this finding.

**Source verified:** `App.tsx:700` optimistically updates a reservation and shows BookingPage before the queued server result. `server.ts:16450` accepts client totals, conditionally uses a 2% legacy price tolerance, treats validation/query failures as non-blocking, checks capacity outside a single booking transaction and does not require a canonical quote/hold/captured-payment binding. It mutates legacy JSON inventory and emits purchase attribution after creation.

**Additional concrete defect:** the `INSERT` near `server.ts:16626` has 16 SQL parameter references but supplies 14 values. Therefore this review does not claim successful booking creation or successful exploitation; the path also appears broken independently of its unsafe design.

**Required verification:** all reachable stay booking writers and lead-conversion/status endpoints participate in the approved fulfillment boundary or are safely contained. Ensure failed/queued requests cannot become confirmed UI reservations. Preserve records during retirement.

### H-011 · P1 · Confirmation page invents reference and property access details

**Source verified:** `components/BookingPage.tsx:61` derives a booking reference from listing/name instead of server booking evidence and supplies fixed access/Wi-Fi values. These conflict with explicitly rejected V1 decisions. App still renders this component for its BOOKING view.

**Required verification:** only server-backed confirmation data; no static credentials; authorized private arrival access after valid booking; refresh/deep-link recovery. Do not expose example access values in guest deliverables.

## Financial and integration integrity

### H-012 · P1 · Ad fee semantics differ between approved model and contract code

**Source verified, updated discussion007:** `server.ts:8490` and `server.ts:11955` compute fee as15% of gross charge. Earlier approved intent was additive; HARVO-009 now selects profit markup on defined campaign costs, C × p, with charge C × (1 + p). Code still implements the old gross split. Exact cost/tax scope remains open; do not reopen the resolved percentage denominator.

**Required verification:** founder-confirmed semantics, contract versioning, top-ups/refunds and tax treatment; host preview and admin ledger agreement; historical contracts must not be silently rewritten.

### H-013 · P1 · AI outage can be represented as a successful policy evaluation

**Source verified:** `server.ts:7208` initializes score 8.6/passed=true and favorable subchecks; around 7307 an AI exception merely logs; around 7317 the default can become policy-cleared. Human approval is still another gate, so this is not proof of automatic external launch; it is a false compliance signal and invalid failure mode.

**Required verification:** evaluator unavailable means explicit pending human review without a fabricated AI pass; strict validation of returned assessment; rate and timeout tests; immutable evaluation evidence.

### H-014 · P1 · Notification “delivered” does not prove transport delivery

**Source verified:** `src/lib/leadAlertingCrmService.ts:632` constructs synthetic email/SMS recipients. At line 750 onward the default queue branch logs, leaves `isDelivered=true`, and records `DELIVERED`; only an injected test dispatcher changes that behavior. `server.ts:698` WhatsApp failure paths also log a sandbox success and return true.

**Required verification:** verified real host destination, intentional message, transport submission evidence and appropriate delivery status; no placeholder recipients; failed or missing integration stays failed/pending with retry ownership. Distinguish provider acceptance from final delivery. Do not send any test notifications to customers.

### H-015 · P1 · Dynamic pricing sync records success without a remote update

**Source verified:** `src/lib/dynamicPricingSyncService.ts:73` builds copy and inserts `SYNCED` audit events for `marketing_campaigns`; the inspected method does not call an external provider. `server.ts:429` additionally edits local `host_marketing_campaigns.feed_description` and logs successful Meta/Google sync. The helper can fail at the differently named campaign table before that fallback runs.

**Required verification:** durable intent → provider update → read-after-write confirmation; correct canonical campaign table; preserve failed/pending states; prove advertised price matches the actual destination price. Existing local helper tests do not prove remote synchronization.

### H-016 · P1 · Retargeting service declares dispatch from configuration alone

**Source verified:** `src/lib/retargetingPixelService.ts:57` stores an event then labels providers DISPATCHED based on credential presence; the method has no external dispatch. Other CAPI code exists in the server, so this finding is about this method's contract, not a claim that all attribution is simulated.

**Required verification:** truthful queued/accepted/failed statuses with provider receipts; consent/data-governance requirements established separately; genuine booking capture as purchase source; no inference that hashing alone provides consent or legal compliance.

### H-017 · P1 · Auto-pause does not evaluate campaign-date occupancy

**Source verified:** `src/lib/calendarCircuitBreaker.ts:111` counts all qualifying bookings for a listing and compares to aggregate room inventory. It selects only a move-in date and does not calculate overlaps across campaign target nights, hold allocations or manual blocks in the inspected availability computation.

**Required verification:** one booking for unrelated dates must not pause an otherwise available campaign; fully occupied target nights must pause; partial rooms/dates and manual pause ownership must be correct; use one canonical inventory authority.

### H-018 · P1 · Canonical hold integration and mapped-block accounting need real-DB proof

**Source verified / runtime impact unverified:** `inventoryHoldService.ts:470` reconciles mapped blocks with `GREATEST(blocked_units,1)` and performs these updates before the advertised ordered `FOR UPDATE` query. It does not demonstrate how multiple mapped physical-unit blocks add up. Hold creation loads room identity/inventory without a published-listing check in that service. Quantity zero/NaN defaults to one before validation. Public room projection strips relational IDs while the hold API requires them; current guest page does not call the hold API.

**Required verification:** real Postgres tests for multi-unit blocks, lock ordering, concurrent host edits/holds, unpublished rooms, input validation, minimum stay/capacity and frontend room-ID handoff. Existing M4 mock tests passing does not close these questions.

### H-019 · P1 · Conflict-ledger upsert and partial index need PostgreSQL validation

**Source verified / SQL behavior to reproduce:** `src/migrations/007_legacy_conflict_ledger_uniqueness.sql` creates a partial unique index with `WHERE dedupe_key IS NOT NULL`; `inventoryHoldService.ts:422` uses `ON CONFLICT (dedupe_key) DO NOTHING` without that predicate. Compare against the actually deployed indexes before concluding compatibility. The service correctly returns an audit failure when ledger recording fails, so an insertion error would fail closed rather than grant the hold.

**Required verification:** apply the exact migrations to a disposable PostgreSQL instance and exercise repeated ambiguous-block writes, preserving historical rows. Do not “fix” by deleting the ledger or ignoring failures.

### H-020 · P1 · Generic idempotency middleware is a response cache, not a financial lock

**Source verified:** `src/lib/idempotency.ts` allows absent keys, reads cache before work, writes asynchronously after response, falls back to per-process memory, and scopes keys without method/path/request fingerprint. Concurrent misses can both proceed; the same key can collide across operations.

**Qualification:** some financial routes have additional database guards. This finding does not say every route relies only on the middleware.

**Required verification:** inspect each monetary caller for durable principal/operation/payload binding, request conflict detection and atomic claim/unknown-outcome recovery; concurrency proof with independent workers.

### H-021 · P1 · Ledger helper does not itself guarantee atomic, currency-separated accounting

**Source verified:** `src/lib/doubleEntryLedgerService.ts` accepts either a Pool or transaction client and does not start a transaction itself. It validates a floating-point debit/credit sum across lines without currency separation, then inserts header, lines and balances sequentially. `getAuditedBalance` does not filter by currency.

**Qualification:** caller-provided transactions can supply atomicity; inspect callers before claiming partial writes occur on a particular path.

**Required verification:** transaction-bound contract/call sites, per-currency balance conservation, exact minor-unit arithmetic, concurrent account creation, idempotency payload consistency and crash recovery. Existing helper tests are not an accounting certification.

## Architecture, privacy and operations

### H-022 · P1 · Runtime DDL and migration records diverge

**Source verified:** `server.ts:1409` and many handlers/services create/alter tables during runtime; startup around 2950 uses a single column as a broad initialization shortcut. The approved stays register rejects runtime DDL. Versioned migrations cover only additions to an existing base; constraint validation and full fresh-schema reproducibility are unresolved.

**Required verification:** schema inventory from approved read-only database metadata, migration history/checksums, expand/validate migration plan, boot/request behavior without DDL and non-destructive recovery.

### H-023 · P1 · RLS implementation does not establish end-to-end tenant isolation

**Source verified:** `server.ts:2548` outreach policy includes `USING (true OR ...)`; main-pool context wrapping at 550 does not cover all direct clients/read pools/service pools; successful cleanup sets bypass true. The inspected policies use ENABLE RLS without demonstrated FORCE RLS. Tests mock `set_config` and procedural blocks.

**Required verification:** actual connection roles/ownership/bypass privileges, all policy definitions and transaction-local context, read-replica isolation, anonymous/host/admin/worker tests under real PostgreSQL. Do not infer a live breach or safety solely from source SQL.

### H-024 · P1 · Public relational-media fallback can restore unapproved legacy data

**Source verified:** `/api/v2/stays/:slug` near `server.ts:14334` queries only approved media; when zero approved rows return, legacy `photos` remain even if rejected/pending relational rows exist. Relational read exceptions are swallowed. `mapPublicMediaAsset` excludes a present non-approved status, but accepts absent status. `/api/listings/:id` public branch maps legacy listing fields, and the canonical component merges that response over the newer one.

**Required verification:** differentiate no relational records from zero approved records and DB read failure; rejected/taken-down media never reappear through legacy fields, image URLs, caches or refetch; projection parity across all public routes.

### H-025 · P1 · Key defaults and naming drift threaten session/data durability

**Source verified:** `src/lib/cryptoUtils.ts:5` creates a random process encryption key when unset and returns input ciphertext on decrypt failure. Hold service uses `GUEST_COOKIE_SECRET`; environment specification names `GUEST_SESSION_SECRET`. Different JWT fallbacks exist. These concerns are independent of whether a real deployment has correct configuration.

**Required verification:** fail-closed validated required keys, consistent names, persistent encryption key management/rotation and restart/multi-instance decryption tests; no untrusted fallback identity. Secret values must remain outside HARVO.

### H-026 · P1 · Campaign FSM bypass and audit failure semantics remain unsafe

**Source verified:** `server.ts:92` permits disallowed transitions for `actorType='admin'`. Event insertion catches errors around 113. With PostgreSQL, a caught query error inside a transaction may abort that transaction; it cannot be assumed to commit successfully or preserve a reliable state/event pair. Caller-supplied client behavior further affects the outcome.

**Required verification:** explicit authorized exceptional transitions with invariants; terminal-state and financial guards; atomic mandatory audit; real DB transaction failure tests. Do not infer correctness from log messages or the mocked FSM suite.

### H-027 · P1 · Worker ownership, claims and truthful health require further tracing

**Source verified:** `worker.ts` imports `server.ts`, which has its own background-start conditions/intervals. Worker container sets background workers enabled. The ordinary server gate does not require a dedicated-worker identity. Lead notification queue separates SELECT FOR UPDATE and UPDATE when given a Pool. `WebhookWorkerService` selects only pending rows and does not show lease-based reclaim of processing rows in that method; fatal errors return zero processed/failed. Distributed lock initialization marks initialized even after any creation error.

**Impact qualification:** overlapping execution and stranded work depend on active flags, caller transactions and other reconciliation jobs. They remain risks to reproduce, not claimed live losses.

**Required verification:** import-safe worker entrypoint, one scheduler owner per class, distributed claim/reclaim, crash/timeout tests and truthful degraded health. Follow existing shadow/cutover protocols.

### H-028 · P1 · Offline replay can preserve stale booking intent and credentials

**Source verified:** Vite Workbox queues API POSTs; `lib/syncService.ts` persists failed writes including 4xx responses and stored headers; App submits bookings optimistically. Auth logout removes token/user but does not demonstrate clearing all IndexedDB records/queued headers. Separate `src/lib/syncService.ts` adds another synchronization implementation.

**Required verification:** allowlisted replayable operations; no offline confirmation/financial authority; bound idempotent retries; explicit expiry and permanent-error handling; per-user cache partitioning/logout cleanup; two-account same-device tests.

### H-029 · P2 · Build success hides limited checks and large delivery costs

**Observed:** configured build and typecheck pass. Server `@ts-nocheck` suppresses checks; duplicate routes remain. Vite reports large chunks, a circular vendor dependency and roughly 4.93 MiB precache. Source maps are enabled and the legacy listing component remains bundled.

**Required verification:** real mobile performance measurements, meaningful error/concurrency tests, safe deployment asset boundaries and route retirement proof. Do not write an arbitrary performance SLA into marketing material from bundle size alone.

### H-030 · P2 · Documentation acceptance claims cannot be mapped to this source snapshot

**Source verified:** implementation-plan header says M2–M15 not started while later tables accept M2–M4; detailed sections and top-level guest blueprint still contain older statuses. Constitution contains old overall phase headings alongside newer active-track entries. No local Git metadata maps certificates to this copy.

**Required verification:** source version + environment + test matrix + evidence/date + named acceptance for each milestone. Preserve historical records, flag supersession, and synchronize current status only with explicit authority.

## Interpretation rules

- These findings are not the complete defect population. The line-by-line review remains incomplete.
- Preserve the strong mechanisms already present—canonical IDs, financial contracts, transaction boundaries, audits, idempotency and production checkout gates—while repairing affected flows.
- Remediation proposals require the user's phase/milestone authorization. Recording a finding does not authorize live configuration changes, DB mutations, messages, ad activation or deployment.
- For a live incident, follow the incident protocol: evidence, correlation IDs/log preservation, first failing operation, proven root cause, permanent fix, regression verification and documentation. Do not manufacture an incident from a local static finding.

## Continuous implementation closure record — HARVO-CONT-001

Corrected with source and local regression evidence: immutable cost-plus capture/reserve/refund/cancel authority; stale worker and read-state races; signed minimal payment/Meta ingress; interrupted AI review; legacy authentication/social privilege and synthetic success; immutable local/S3 upload contracts; unsafe offline POST replay; and checkout cancellation races. New accepted local scope is M1–M3/M7–M8. M4–M6/M9–M10 remain partial/open. Read-only configured-DB inspection found missing required tables and a role bypassing RLS. See continuous verification for exact counts, remaining integration/legal/account/deployment work and operational limits. No production incident or loss is asserted.
