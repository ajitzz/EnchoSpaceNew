# Dynamic AdTech Strategy — execution plan and impact analysis

Date: 22 September 2026. Authority: founder's Executive Architecture Directive and Discussion 034.

**Status: source-reviewed implementation plan; no strategy-engine code, new migration, provider campaign or production configuration was changed in this planning pass.** The founder authorizes the upgrade. The implementation details below refine the approved direction; they are engineering decisions proposed for execution, not evidence of delivery or independently accepted commercial policy.

References: [master blueprint](../blueprints/MASTER_ADTECH_PRICE_TIERS_AND_GOD_MODE_BLUEPRINT.md), [price-segmentation RFC](../harvo/MARKETING_ENGINE_PRICE_SEGMENTATION_AND_TARGETING_RFC.md), [Discussion 034](../harvo/DECISIONS.md), [Constitution](../ENCHO_ENGINEERING_CONSTITUTION.md), [current verification](../harvo/SEARCH_PORTFOLIO_EXECUTION_VERIFICATION.md).

## 1. Outcome and implementation boundary

A host selects a published stay. Encho resolves an evidenced nightly price, selects the applicable strategy release, obtains validated feeder geography, and prepares a transparent campaign recommendation. A host may inspect or change permitted feeder locations and radii. An administrator can publish versioned strategy changes through `/admin/marketing/adtech`. The campaign retains the exact strategy, facts, creative and geography that were reviewed, even when a later strategy is released.

This supports many hosts through shared, governed strategy definitions and tenant-isolated campaign evidence. It does not grant any host access to another host's campaigns, budgets, leads or private property coordinates. Host screens expose useful targeting and campaign status, not provider account credentials or operational internals.

Move business strategy values into PostgreSQL. Keep executable validation, provider adapters, authorization, financial invariants, supported capability definitions and emergency spending controls in reviewed code. Database JSON must never become executable code or a way to bypass payment, media, consent or provider clearance.

Reuse the existing dedicated-campaign workflow, finance ledger, paused provider creation, activation authorization, scheduling, creative manifests, telemetry and recovery. Paid pooled campaigns remain independently blocked by `POOL_EXECUTION_UNAVAILABLE` until their existing settlement requirements are met.

## 2. Verified findings and disposition

These are selected critical-path findings, not a claim to have semantically audited every project line. Paths refer to the worktree reviewed on this date.

| Finding | Source evidence | Disposition |
|---|---|---|
| Meta currently compiles country targeting and lacks city/pin exclusions. | `src/lib/providers/meta/MetaCampaignPlan.ts:79` | Accept the geographic upgrade. Country-only behavior is real; `IN` itself is supplied by configuration rather than universally hardcoded. |
| Meta countries, placements and special-ad categories already have runtime configuration. | `src/lib/marketing/config.ts`; `MetaCampaignPlan.ts:15` | Migrate these strategy values to versioned releases. Do not describe every current value as hardcoded. |
| Objective, optimization, bid strategy and conversion event are constrained in the compiler. | `MetaCampaignPlan.ts:80–83` | Add typed strategy contracts and explicitly supported combinations, not arbitrary provider JSON. |
| A queued Meta publish request injects the worker's current runtime strategy settings. | `src/lib/marketing/engine.ts:27–32` | Close this determinism gap first: bind a strategy to a revision before review and read that binding at publication/retry. |
| Meta readback checks paused state, budget, pixel and creative identity; it does not yet verify the proposed geography/demographic/attribution settings. | `src/lib/providers/meta/MetaAdProvider.ts:99–114` | Expand both requested readback fields and semantic comparisons before enabling the new options. |
| Google already supports explicit resolved locations, EXACT/PHRASE and two positive-location modes; bidding is fixed to Maximize Conversions without a target CPA. | `src/lib/providers/google/GoogleSearchPlan.ts:201–277` | Preserve existing features; add validated optional target CPA, exclusions and strategy-driven defaults. |
| Google Search network isolation, carousel cards, sitelinks and image assets already exist. | `GoogleSearchPlan.ts:253–286`; `MetaCampaignPlan.ts:88`; portfolio story services | Reuse and extend these paths. Do not rebuild them or claim they are absent. |
| Long Weekend is an optional, explicitly versioned India-time preset. | `src/shared/marketingFlight.ts`; `components/marketing/CampaignStudio.tsx:182` | Reject the claim that every flight is locked to that schedule. Retain custom dates and valid provider duration constraints. |
| Marketing listing evidence currently includes `price`, currency and city, but not coordinates, district or a sellable-unit price basis. | `src/lib/marketing/workflow.ts:23–27` | Extend canonical evidence deliberately. `listings.lat/lng` exist elsewhere; their existence does not prove verified administrative geography. |
| Economics already uses supplied nights, margin and booking assumptions; it is not a measured performance forecast. | `src/lib/marketing/portfolio/preflight.ts:11–22` | Preserve explicit assumptions; replace fixed recommendation factors with versioned tier rules where justified. |
| AI pass threshold is currently 8. | `src/lib/marketing/ai.ts:8` | Bind a validated threshold to the strategy revision. Quality scores remain separate from mandatory rights, truthfulness, policy and human review. |
| Revisions and dedicated fact contracts already support immutable bindings. | `src/lib/marketing/workflow.ts:92–110`; `src/migrations/025_marketing_revision_products.sql` | Add a companion strategy binding to this pattern, not mutable fields as the sole campaign authority. |
| Existing `admin_audit_logs.entity_id` is an integer; the table is created in legacy bootstrap. | `server.ts:2255` | Use stable integer strategy entity IDs and an append-only strategy audit contract. A log insert alone is not proof of immutability. |
| Admin routing uses existing app path/state handling and dashboard subviews. | `App.tsx`; `components/AdminDashboard.tsx` | Implement the new deep link, refresh, navigation and authorization end to end. |

The production migration incident for 017–031 is separately closed: authenticated workspace HTTP 200 was observed on 21 September. That does not certify a least-privilege production runtime: the migration connection was privileged. Nor does it close accepted booking/current-consent composition, provider clearance or pilot gates. The last recorded full local regression is 1,860 passed across 144 files; it was not rerun for this documentation-only pass.

## 3. Corrections to the supplied blueprint and RFC

1. **Retain immutable versions.** A profile row with an incremented `version` overwrites history. A workflow's version number cannot reconstruct deleted settings. Store every published version and the exact resolved campaign snapshot.
2. **Resolve overlapping price boundaries.** Proposed deterministic convention: Budget `[₹1,000, ₹4,000)`, Comfort `[₹4,000, ₹7,000)`, Premium `[₹7,000, infinity)`. Thus exactly ₹4,000 is Comfort and exactly ₹7,000 is Premium. This is the explicit engineering interpretation of the overlapping ranges, not a previously stated founder boundary decision.
3. **No silent national fallback.** Failure to resolve a city, district, radius or AI proposal must not expand an approved campaign to all India. Return a specific unresolved state or retain its already-approved targeting.
4. **No invented property claims.** Price tier does not establish a butler, heated pool, helicopter access, Starlink, pet permission, complete privacy or an occupancy allowance. Creative uses canonical facts and approved media. Per-person prices require an evidenced occupancy, charge basis and clear total price.
5. **Treat numerical targets as hypotheses.** The supplied CAC ranges, demographic personas and travel-hour estimates are commercial starting hypotheses. They are not provider forecasts, measured performance, an inference about a guest's wealth or guaranteed profit. The RFC's 25% waste and zero-bookings claims lack supporting project evidence.
6. **Correct the economics.** Pre-ad contribution per booking is the relevant revenue less evidenced costs, under explicit assumptions. Break-even booking count is `ceil(total acquisition cost / contribution per booking)`. At ₹4,200 contribution and ₹10,000 media cost, media-only break-even is 3 bookings, not 9.5. A ₹1,050 target CAC implies a different performance target of about 10 bookings. Fees, taxes, refunds and actual margin assumptions can change the result; do not label either calculation a forecast.
7. **Do not assume Meta Ads Manager parity from a screenshot.** Native UI controls do not establish supported combinations for this app, account, API version, objective, creative or special-ad category. Validate and read back each supported combination.
8. **District exclusion is a delivery configuration, not a guarantee that no local person sees an ad.** Provider location inference and supported boundaries have practical limits. A radius is straight-line geography, not a verified driving-time corridor.
9. **Avoid unsupported compliance declarations.** Aggregate targeting radius alone does not establish privacy-law compliance. Retain the existing consent and specialist acceptance gates.
10. **Convenience does not authorize spending.** One-click preparation can populate a campaign; existing approval, quote acceptance, captured funding, risk and activation authority remain mandatory.

## 4. Strategy and canonical evidence contracts

### 4.1 Tier seed policy

Money is stored as decimal integer minor-unit strings/`BIGINT`, with explicit currency. Never classify through floating-point rupee arithmetic.

| Tier | Proposed nightly boundary | Founder CAC target hypothesis | Suggested media total | Daily pacing guidance | Requested age preset, capability-dependent |
|---|---|---|---|---|---|
| Budget | ₹1,000 ≤ price < ₹4,000 | ₹600–₹1,200 | ₹1,500–₹2,500 | ₹350–₹500 | 20–35 |
| Comfort | ₹4,000 ≤ price < ₹7,000 | ₹1,800–₹2,800 | ₹4,000–₹6,000 | ₹1,000–₹1,500 | 25–48 |
| Premium | price ≥ ₹7,000 | ₹4,000–₹8,000 | ₹10,000–₹15,000 | ₹2,000–₹3,000 | 28–58 |

The first registry release contains these requested presets and a default AI quality threshold of 8.0. A future validated release may set 7.5 as the directive permits; a lower quality threshold cannot override a policy failure, missing rights or mandatory review. All-gender targeting remains the neutral default; any narrower configuration requires account/category support and an explicit reason.

Below ₹1,000, missing/invalid prices, unsupported currency or ambiguous charge basis return `STRATEGY_UNCLASSIFIED` with an actionable explanation. They do not silently receive Premium or a fabricated minimum price. This outcome blocks automatic strategy preparation, not unrelated listing management or existing campaign pause controls.

`CanonicalMarketingPriceEvidence` must identify listing, currency, amount, price basis, source version/hash and observation time. Initially use the canonical listing base nightly price only when the property contract establishes that basis. A room-type campaign must name the actual room product and use its relational rate; do not use a villa's cheapest room to classify an entire-property offer. Seasonal/dated quotes are a separate basis and must not be confused with a base rate.

When nightly pricing, rooms or relevant facts change, the current evidence guard must require fresh review where applicable. Do not migrate an active campaign to a different tier automatically. A new strategy or targeting selection creates a new unquoted revision; funded/dispatched campaigns retain existing immutability and settlement boundaries.

### 4.2 Geography evidence

Use a discriminated union for `PROVIDER_CITY_RADIUS`, `COORDINATE_RADIUS` and `PROVIDER_REGION_EXCLUSION`. Keep provider IDs in separate Meta/Google fields; names are display labels, not interchangeable targeting identifiers.

Each resolved entry records country, coordinates where applicable, provider key/type, radius/unit, source, API version, verification time and capability evidence. The property district needs explicit administrative-boundary evidence. A city name match must not be accepted as a district match.

Validate finite latitude/longitude, bounds, supported radius increments/minimum/maximum, country scope, duplicate pins, inclusion/exclusion interactions and bounded list sizes. Use provider-supported limits rather than copying screenshot values into universal constraints. If the required district exclusion cannot be expressed accurately, return `EXCLUSION_UNRESOLVED` and prevent publication of that new strategy. Do not replace it with an unverified circle or exclude an entire state.

Include both Wayanad and Kodagu canonical naming/alias handling in fixtures. Treat travel time, airport access and road routes as source-backed metadata; geometric distance alone cannot claim a three-hour drive.

### 4.3 Campaign binding

`ResolvedCampaignStrategy` contains contract version, tier, immutable profile/release references, price/fact hash, corridor version, effective provider settings, exact inclusions/exclusions, accepted host overrides, recommendation assumptions, compiler/capability versions and a canonical snapshot hash.

Persist it with `(campaign_id, revision)` in the same transaction as the campaign revision and product/fact binding. AI evaluation, admin review, finance quote context, provider operation fingerprint and recovery must reference that same binding. Existing quote signatures/idempotency contracts require explicit versioning if their input changes; do not quietly change previously accepted signatures.

Resolve external geography before the transaction. Recheck listing ownership, current facts, release version and prepared evidence inside the transaction. A changed release produces a stale-preview response; it cannot silently change the host's submitted settings.

```mermaid
flowchart LR
    A[Canonical stay and price evidence] --> B[Published strategy release]
    B --> C[Verified corridor and permitted host overrides]
    C --> D[Immutable campaign revision binding]
    D --> E[AI and admin content review]
    E --> F[Accepted quote, funding and risk checks]
    F --> G[Compile and create paused provider hierarchy]
    G --> H[Verify actual provider settings]
    H --> I[Separately authorized activation and monitoring]
```

## 5. Database design and migration order

Proposed next numbers are 032–035, subject to checking the migration directory immediately before implementation. Do not rewrite applied migrations 017–031. Continue the existing runner's advisory lock `82749102` on one held database connection.

| Migration | Additions | Required properties |
|---|---|---|
| 032 — strategy registry | `marketing_adtech_tier_profiles` identities; immutable profile versions; strategy releases/release members; current-release pointer; strategy audit receipts | Stable integer entity IDs; unique tier codes and version numbers; atomic release validation for non-overlapping price ranges; compare-and-swap publication; strict config schema/hash; recorded actor/reason. |
| 033 — corridor registry | `marketing_destination_corridors` identities; corridor versions; provider geography evidence and destination resolution receipts | Versioned tier feeders and exclusion evidence; provenance; country/type checks; immutable approved snapshots; no fabricated provider IDs in seeds. |
| 034 — campaign binding | `marketing_campaign_strategy_bindings` linked to campaign/revision, host, fact snapshot and profile/corridor versions | Composite FK to the existing revision authority; exact canonical hash; append-only binding; no retcon of historical campaigns; tenant-scoped reads. |
| 035 — inference operations | Durable corridor inference requests/attempts/proposals, leases and review receipts | Bounded input; coalescing key; fencing token; attempt history; approved/rejected proposal evidence; quota accounting; no direct ad-spending authority. |

All new tables have explicit ownership, grants, RLS policies and `FORCE ROW LEVEL SECURITY`, tested using actual non-owner/non-superuser/non-BYPASSRLS PostgreSQL roles. Global strategy mutation is limited to the verified admin service path; hosts receive projected effective defaults, not unrestricted registry-table access. Tenant bindings remain owned reads. Worker/service roles have only their required operations; no runtime membership in a migration-owner role.

Use constraints plus service validation: unique versions, valid intervals, explicit nullable upper bounds, positive bounded monetary amounts, strict JSON contract versions and checks that cannot pass accidentally through SQL NULL/unknown. Immutability needs triggers/grants and adversarial tests, not just application convention.

Profile draft saves, version publication, retirement, corridor edits and release rollback write a before/after diff to `admin_audit_logs` and an immutable strategy audit receipt in the same transaction. Never put a tier string into its integer `entity_id`. The strategy identity provides that integer. Do not alter unrelated historical audit behavior as an incidental refactor.

Readiness checks must verify the new catalogs, policies, immutable trigger definitions, grants and packaged migration checksums. New feature readiness must be scoped: absent 032+ blocks strategy administration/new strategy-bound drafts with a precise message, rather than unnecessarily breaking existing journal reads, pause or recovery.

Migration verification starts on disposable PostgreSQL containing the current schema through 031, then an explicitly identified staging target. Before a future persistent rollout, require strict checksum failure on drift, correct direct endpoint identity and verified TLS; the legacy runner's warning-only drift behavior and `rejectUnauthorized: false` default need a scoped hardening change or a verified fail-closed apply wrapper. No secrets in logs. A previous narrowly authorized production apply is not a receipt for these new migrations.

## 6. Services and API contracts

Proposed modules live under `src/lib/marketing/adtech/`; shared presentation contracts under `src/shared/`; provider compilers remain in their existing provider directories.

| Service | Responsibility and limits |
|---|---|
| `AdtechStrategyRegistry` | Validate profiles, publish immutable releases, compare versions, provide historical versions and audit. No provider mutation. |
| `CanonicalMarketingStrategyEvidence` | Owned listing/room price basis, canonical geography references, fact hashes and truth-bound creative inputs. |
| `FeederCorridorResolver` | Resolve catalog aliases and approved corridor versions; return ready, missing, stale or unsupported explicitly. |
| `MetaGeoResolver` / Google adapter extension | Provider-specific lookup/validation, bounded caching and response normalization. No campaign creation during lookup. |
| `CampaignStrategyResolver` | Combine price, release, corridor and allowed overrides; generate preview receipt and immutable revision binding. |
| `TierBudgetGuidance` | Feasible flight/budget recommendations and labelled unit-economics scenarios; no wallet mutation or automatic top-up. |
| `CorridorInferenceWorker` | Grounded, bounded Gemini proposals with durable attempts, validation and provenance. Cannot activate a profile or ad directly. |
| Provider capability adapters | Compile supported settings, canonicalize provider readback and explain unsupported combinations. |

Proposed routes are extensions of the existing authenticated v2 router:

| Route | Contract |
|---|---|
| `GET /api/marketing/v2/admin/adtech/profiles` | Admin-only profiles, release versions, capability status and bounded history. |
| `POST /api/marketing/v2/admin/adtech/profiles` | Create a validated profile/draft; stable request key and reason required. |
| `PUT /api/marketing/v2/admin/adtech/profiles/:id` | Save a new version from the expected base version; never overwrite published history. |
| `POST /api/marketing/v2/admin/adtech/releases` | Atomically publish a validated set of versions with expected current release; audit and impact preview. |
| `POST /api/marketing/v2/admin/adtech/profiles/:id/retire` | Stop future selection while preserving history; reject retirement that invalidates an active release. |
| `GET/POST /api/marketing/v2/admin/adtech/corridors` | Read/create corridor records and evidence. |
| `PUT /api/marketing/v2/admin/adtech/corridors/:id` | Versioned edit with expected version and change reason. |
| `POST /api/marketing/v2/admin/adtech/corridors/:id/publish` | Publish only validated geometry, exclusions and capability evidence. |
| `GET /api/marketing/v2/listings/:id/targeting-defaults` | Owned-listing projection: tier, price basis, suggested budget, pins/exclusions, status, permitted overrides and version receipt. Pure read; no unbounded AI side effect. |
| `POST /api/marketing/v2/listings/:id/targeting-resolution` | Idempotently request missing-corridor resolution under per-host/global limits; return existing job or bounded pending state. |
| `POST /api/marketing/v2/listings/:id/targeting-preview` | Validate host overrides against effective policy; return revised evidence/receipt and budget guidance without spending. |

Sensitive routes recheck persisted admin/owner authority, not just a client role field. Follow existing authentication and request-origin protections; rate-limit lookups and mutations. Errors use stable codes such as `STRATEGY_VERSION_CONFLICT`, `PRICE_BASIS_REQUIRED`, `CORRIDOR_PENDING`, `EXCLUSION_UNRESOLVED`, `TARGETING_CAPABILITY_UNSUPPORTED`. Hosts receive actionable copy without provider secrets, peer details or raw diagnostics.

Use immutable version/hash caches. Publishing a new release updates a small pointer atomically. Web and worker must read the same revision binding. TTL alone is insufficient to prevent stale policy being applied during a mutation.

## 7. Provider compiler and capability work

### Meta

Introduce a new explicit contract version for compiled strategy input. Preserve the current legacy compiler for historical contracts. Add provider-resolved cities/radii and custom coordinates, mandatory negative district targeting, compatible age/gender settings, supported placements including Stories, attribution specs and validated bidding/optimization settings.

`OFFSITE_CONVERSIONS` and `LEAD_GENERATION` are not interchangeable labels on the current website/Purchase implementation. Keep the existing website booking path as the first supported product. Expose lead-generation configuration as unavailable with its missing prerequisites until its objective, destination, creative and owned-inbox ingestion contract are implemented and verified. ADT-3 must explicitly assess this second path: form/destination authority, consent evidence, lead webhook verification/replay, stable event identity, campaign-to-host ownership and masked inbox delivery. Enable only combinations verified for the configured account/API; record unavailable combinations rather than implying universal Ads Manager parity. Do not send Purchase merely to satisfy a lead campaign or silently convert a bookings campaign into a lead form.

Audience Network stays disabled. The current code requires video for Reels; add capability/media compatibility deliberately rather than allowing every static/carousel asset on every placement. A field such as `location_types` in an SDK is not proof that residents-only `['home']` works for configured v26.0. Preserve this unresolved capability until current account/version evidence establishes it.

Read back and compare effective geography, exclusions, placement configuration, objective, optimization, attribution, demographic controls, bid parameters and conversion destination in addition to existing budget/status/creative checks. Normalize documented provider ordering/defaults; do not ignore substantive drift. Unsupported or changed settings must block activation and preserve reconciliation evidence. Never clear dedupe locks or reset unknown provider outcomes.

### Google

Retain Search-only isolation, explicit constants, languages, EXACT/PHRASE, reviewed sitelinks/images and campaign-total funding safeguards. Move permissible defaults into profiles; add optional `target_cpa_micros` with exact currency conversion, supported negative geography and reviewed callout/structured-snippet compilers.

PRESENCE remains the initial domestic preset. The requested PRESENCE_OR_INTEREST option must be an explicit versioned admin choice with its wider delivery semantics shown, not an accidental fallback. Google location APIs support provider constants and proximity geometry, but unsupported combinations still require validation. Meta city keys must never be reused as Google resource names.

A target CPA is an optimization target, not a guaranteed per-booking price or a daily spend cap. Existing conversion-authority blockers continue to apply to Maximize Conversions. Extending bidding configuration cannot manufacture accepted purchase events.

Prepare keyword suggestions through the existing SP2 research boundary and verified property differentiators, constrained by the profile's allowed match types. Historical search-volume evidence remains labelled historical. Suggested words do not become approved claims automatically; retain human/host review and the existing sanitized portfolio warnings. Callouts and structured snippets require literal canonical fact provenance just like carousel captions.

### Evidence consulted on 22 September 2026

- [Google location targeting](https://developers.google.com/google-ads/api/docs/targeting/location-targeting): location constants, proximity coordinates/radius, negative locations and positive-location modes. Supports the shape of the Google extension, not account acceptance or performance forecasts.
- [Google v25 MaximizeConversions](https://developers.google.com/google-ads/api/reference/rpc/v25/MaximizeConversions): optional `target_cpa_micros`; its units and meaning must be respected.
- [Meta official SDK geography object](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/targetinggeolocation.py), [targeting object](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/targeting.py), [ad set object](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adset.py): evidence for available field shapes, not proof that all combinations work in v26.0. The SDK `main` branch is mutable and must be pinned or replaced by a versioned capability receipt during implementation.
- Meta's primary targeting documentation was inaccessible/rate-limited during this review. Residents-only behavior, district coverage, exact radius constraints and objective/placement combinations remain explicit verification tasks, not assumed facts.

## 8. Autonomous inference with bounded authority

Catalog lookup is the preferred path. A missing destination may enqueue one durable inference request keyed by canonical destination evidence, tier-policy release and inference contract version. Several hosts requesting the same destination can share public geographic research; their private campaign/price/contact data must not be shared through that cache.

The worker may use canonical coordinates and approved geographic/transport sources to produce structured candidate feeders. Record model, prompt version, input/source hashes, source timestamps, uncertainty and resulting proposal. Listing text and fetched content are untrusted data; they cannot supply system instructions, account IDs or credentials. Never send guest leads or payment data to corridor inference.

Then validate country/boundary membership, road/airport claims, provider IDs, radii, destination exclusions, duplicate/empty reach and capability compatibility. Persist rejected proposals with safe reason codes. AI output is never sufficient authority to publish a corridor.

Initial release: inference automatically discovers, validates and saves proposals; admin review promotes a valid version. Later unattended promotion may use an explicit, tested policy limited to mechanically verified evidence; this is a separately auditable mode, not a hidden default. This preserves the requested autonomous discovery while preventing invented targeting from spending host funds.

Bound concurrency, requests per host/destination, daily model cost, provider QPS, retry count and job age. Use leases/fences, cancellation, retry jitter and a dead-letter state. No network call runs while holding a campaign/database transaction lock. If inference fails, the user sees a clear pending/review state and retains their saved draft; no national fallback or fabricated coordinates are returned.

## 9. Host, admin and guest experience

### Host Campaign Studio

1. Select an owned published property; show the identified tier and the nightly price basis used.
2. Present a concise recommendation: feeder cities, excluded destination district, flight dates, total media budget and separately disclosed fees. Missing evidence gets a concrete next action.
3. Offer compatible budget presets. For the selected duration, reconcile total and daily guidance; if their ranges cannot both fit, explain that and request a different duration/amount. Never silently increase the payable total. Provider lifetime/total budgets and planning averages must be labelled accurately.
4. Keep `Adjust audience locations` collapsed by default. Expanding it shows resolved pins, circles, exclusions, city search and accessible numeric radius controls. Host overrides cannot change bid strategy, conversion event, demographics, protected exclusions or financial limits.
5. Preview and save a new revision. New overrides trigger the existing evidence/review lifecycle. The host never needs Meta Ads Manager or a Google account connection.
6. Explain active campaign status and observed spend using existing telemetry, with last-update and freshness information. Do not render a live beacon solely because the local state says ACTIVE.

Use the existing map stack if it meets licensing, privacy, mobile and accessibility requirements; otherwise select a maintained adapter with visible attribution and bounded geocoding cost. Map rendering must not send private listing coordinates to unnecessary third parties. The targeting editor is usable with keyboard/text controls and without map tiles.

### Admin strategy workspace

Create `/admin/marketing/adtech` inside the existing dashboard and app navigation. Verify direct URL, reload, back/forward and non-admin handling. Views: three tier profiles; destination corridors/map; inference review queue; version diff/preview; audit history and capability diagnostics.

Use typed form controls for supported micro-options, reasoned disabled states for unsupported ones and a before/after impact preview. Publishing changes future selections; show that existing campaigns remain on their pinned versions. Retire and roll back through new audited release events. Do not offer a delete-history control or an unconditional campaign reset.

Admin operations retain correlation IDs, raw-but-redacted provider diagnostics, actual observed settings and existing audited recovery. Strategy edits cannot impersonate a host, debit a wallet or activate an ad.

### Guest/public surfaces

Internal acquisition tier labels need not become public accommodation grades. Reuse canonical public prices and reviewed creative destinations. If this work adds or changes a listing field such as price basis or district authority, implement it consistently in guest detail, host create/edit and admin moderation as required by AGENTS.md. Preserve approximate public location/privacy rules; never expose exact private coordinates merely to explain targeting.

## 10. Impact and risk analysis

| Area | Planned impact | Principal risk and control |
|---|---|---|
| Database | Additive 032+ catalogs, evidence, bindings, worker records and readiness checks | RLS/grant drift, slow locks, mutable evidence; use real PostgreSQL hostile-role tests, bounded apply and strict catalog comparison. |
| Campaign contracts | `domain.ts`, `workflow.ts`, product/fact snapshot composition | Stale facts or strategy reinterpreted after approval; use explicit contract version and atomic immutable binding. |
| Provider publication | `engine.ts`, Meta/Google planners, provider readback and recovery | Mixed web/worker settings, partial remote creation; exact bound payload, fenced idempotency and unknown-outcome quarantine. |
| Finance | Existing quote/reservation authority plus strategy hash/context | Guidance mistaken for a spend authorization; maintain accepted amount, separate fee disclosures and no new wallet mutation. |
| AI | `ai.ts`, new corridor worker and quotas | Fabricated facts, instruction injection, cost abuse; strict evidence schemas, bounded jobs and no automatic ad authority. |
| API/runtime | v2 router, runtime composition, worker registration | Forged admin/tenant access or unavailable config breaking unrelated tools; persisted-role checks, owned projections and scoped readiness. |
| UI/navigation | CampaignStudio, admin workspace/dashboard, App routing, shared types/styles | Misleading defaults, inaccessible map, hidden disabled controls; explicit state/copy, keyboard controls, mobile browser checks. |
| Canonical property data | Price basis/geography adapter and relevant listing surfaces | Room/villa price confusion and private location leakage; source-specific price evidence and existing public projection boundaries. |
| Performance | Immutable cache, indexed destination/version lookups and bounded inference | Per-request AI, cache stampedes and web/worker disagreement; pure reads, durable coalescing, source-of-truth version checks. |
| Operations | Audit, capability receipts, metrics and release controls | “God mode” interpreted as bypass authority; privileged configuration only within invariant-preserving services. |

Recommended performance acceptance targets, to measure rather than claim: warm targeting-defaults API p95 ≤300ms under a documented representative load, no provider/AI call on a warm GET, bounded query count, and no duplicate inference/provider mutation under multi-worker races. Record workload, database size and provider latency separately. UI smoothness must not conceal stale evidence.

## 11. Incremental delivery milestones

Use a distinct ADT track; do not renumber completed SP work or imply the paid pool is complete. All implementation remains authorized; these are engineering exit criteria, not repeated founder approval stops.

| Milestone | Deliverables | Exit evidence |
|---|---|---|
| **ADT-0 — contracts and capability baseline** | Final schemas, price basis/boundaries, provider option matrix, exact affected-source inventory, synthetic fixtures and rollout flags. This report supplies the initial plan, not the provider receipts. | Boundary examples reproducible; unsupported Meta options explicit; threat/compatibility review recorded; no reliance on invented IDs. |
| **ADT-1 — registry and audited releases** | Migration 032; typed profiles, immutable versions, release CAS, audits, read APIs and readiness. | Overlap/gap/NULL checks, concurrent publish/replay, non-bypass RLS, forbidden evidence mutation and rollback rehearsal pass. |
| **ADT-2 — canonical geography and corridors** | Migration 033; price/geo evidence projection; Meta resolver, existing Google resolver extensions, required exclusions and bounded caches. | Provider-resolved city/district evidence; wrong-country, unsupported radius and inclusion/exclusion failures; tenant-safe projections. |
| **ADT-3 — deterministic campaign integration** | Migration 034; bind strategy on revision save; AI threshold; compiler/readback changes; booking/lead capability contracts; truthful Google extension/theme rules; explicit legacy path and revised request/quote context. | Admin changes between preview/review/publish cannot silently alter payloads; retries reproduce hashes; foreign/tampered evidence rejected; existing finance/recovery tests pass; lead options require their distinct verified ingestion/consent path. |
| **ADT-4 — admin strategy console** | Deep-linked forms, corridor editor, preview/diff, release/retirement/rollback and audit/capability views. | Desktop/mobile/keyboard tests; non-admin requests denied; stale edits return conflict; unsupported options explained; no active campaign edits. |
| **ADT-5 — adaptive host experience** | Dynamic presets, targeting-defaults/preview APIs, optional map/radius editor and honest economics; required canonical listing-surface updates. | Correct three-tier defaults and exact boundary behavior; quote totals unchanged without consent; overrides create new evidence/review; host cannot remove mandatory exclusions. |
| **ADT-6 — inferred corridor operations** | Migration 035; background jobs, grounding/validation, quotas, review queue, safe retry/DLQ and admin controls. | Duplicate requests coalesce across processes; stale workers cannot publish; malformed/ungrounded output fails; cost ceilings and redaction hold. |
| **ADT-7 — integrated release and bounded pilot** | Strict migration/app rollout, one final regression, build/readiness/browser verification, operational runbook and tier/corridor canary. | Local and identified staging receipts; least-privilege runtime evidence; actual provider settings verified; pilot/consent/checkout authority established before live spend. |

Dependency order: ADT-0 → ADT-1 → ADT-2 → ADT-3 → ADT-4 → ADT-5 → ADT-6 → ADT-7. UI prototypes can use fixtures after contracts stabilize, but no mocked result is labelled live. Fixed calendar estimates would be unreliable before resolving provider capabilities and canonical price-basis gaps; track completion through these observable exits.

## 12. Verification, rollout and rollback

During implementation run only relevant tests with a compact reporter. Add tests for actual failure modes rather than mirroring implementation. Run the full regression once after integration, plus TypeScript, lint, client/server builds, compiled runtime smoke and desktop/mobile browser scenarios.

Required targeted cases:

- Price: paise precision; ₹999.99/₹1,000/₹3,999.99/₹4,000/₹6,999.99/₹7,000; invalid/non-INR rates; room versus whole-property basis; revised rate after approval; inconsistent duration/total/pacing.
- Geography: invalid/non-finite coordinates; wrong country/type; duplicate pins; unsupported units/radii; stale provider entries; missing district; fully excluded reach; no silent country fallback.
- Security: forged admin/system claims; revoked admin; foreign listing/preview/binding; inaccessible peer data; SQL NULL constraints; forced RLS under non-bypass roles; immutable audit updates/deletes/truncation rejected.
- Concurrency: simultaneous release publish; stale edit; same-key replay; crash between proposal validation and publish; expired inference lease; price or strategy update between preview and save; no HTTP while a campaign transaction is held.
- Provider/finance: exact effective-settings readback; account/currency mismatch; unsupported demographic/category or media/placement combination; partial creation quarantine; stable dedupe key; existing funding/reservation guards; no lead event treated as a booking.
- UI: admin deep-link reload; host disclosure and stale-preview resolution; keyboard radius editing; mobile overflow; accessible errors; missing map tiles; no ungrounded ROI or always-live indicators.

Rollout sequence:

1. Deliver contract-aware code with new selection disabled; retain operational pause/recovery and old bound contracts.
2. Rehearse migrations/grants and strict checksums on disposable PostgreSQL; capture sanitized receipts.
3. Apply to an identified isolated staging database and test with the real restricted runtime role and separately owned migration role.
4. Load tier seeds as reviewed registry content; load only provider-validated corridor IDs. Catalog examples without evidence remain unpublished drafts.
5. Verify web and worker build/contract compatibility. Enable admin preview, then a small internal host cohort with paused provider creation and exact readback.
6. For paid pilot, require existing provider/category, checkout, consent, risk/funding, account billing and operational acceptance plus named campaigns/operators and explicit spend ceilings. Existing Wayanad/Coorg/Goa pilot intent is not an actual completed pilot receipt.
7. Observe tier selection, errors, delivery/targeting drift, spend reconciliation and outcome freshness. Compare business results only after sufficient measured conversion evidence; do not declare the seed CAC targets achieved from impressions alone.

Rollback disables new strategy selection/inference, retires a problematic release and republishes a previously validated release for future revisions. Preserve all bindings, audit, money and provider operation evidence. Existing strategy-bound campaigns require a compiler that understands their contract; rolling back to a worker that ignores it is unsafe. Do not drop tables, erase dedupe keys, edit historical configs or widen geography to restore delivery. Use existing pause/reconciliation controls if provider behavior is uncertain.

## 13. Completion and reporting

Planning deliverable: complete for this review. Dynamic-strategy implementation: **0 of 8 ADT milestones verified complete**; ADT-0 provider/evidence closure still requires implementation-stage checks. Historical marketing acceptance remains **5 of 10 locally accepted**, separate from this work and from production readiness.

No new production migration, ad spend, runtime profile, UI deployment or full-suite success is claimed in this report. The next execution batch is ADT-0/ADT-1: typed contracts, exact price authority, capability fixtures and an immutable registry with strict database tests. The founder's broader implementation authorization remains in effect; this report fulfils the requested architectural plan before those changes.


## Execution receipt — 22 September 2026

The subsequent founder directive authorized implementation. ADT-0–ADT-6 are now locally delivered; see [delivery and staging runbook](ADTECH_STRATEGY_DELIVERY.md) and [exact verification](../harvo/ADTECH_EXECUTION_VERIFICATION.md). The founder confirmed no staging environment exists, so ADT-7's external canary is unexecuted. This appendix supersedes plan-only implementation status without rewriting the plan's original findings or granting production acceptance.
