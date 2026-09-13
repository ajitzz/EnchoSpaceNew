# HARVO — Booking growth research

## Investment conclusion

Encho can build a genuine managed acquisition service that turns verified property content into Google, Facebook and Instagram campaigns while hosts remain inside Encho. A large booking increase is a hypothesis to demonstrate, not a capability that can be guaranteed by an AI score or a modern interface. The strongest proposition is a host-controlled service that sells available stays profitably and explains its results accurately.

The prior hardening plan is necessary but insufficient. It makes money movement and provider operations safer. Conversion growth additionally requires competitive inventory, clear offers, appropriate acquisition channels, truthful landing pages, reliable checkout, useful creative, valid conversion signals and disciplined experiments. A perfectly reliable engine can still reliably purchase unprofitable traffic.

Recommended direction: **verified inventory → relevant offer → channel-specific creative and targeting → fast property booking journey → captured/fulfilled booking evidence → bounded optimization**. The customer outcome is an incremental, fulfilled booking with acceptable contribution. Clicks and attributed purchases remain diagnostic measurements rather than proof of that outcome.

## Commercial constraints

The approved future advertising formula remains: recognized campaign cost base C, admin-selected markup p, target campaign profit C × p, and charge C × (1 + p). The intended introductory range is 3–5%; the precise eligible expenses, taxes, variance treatment and live rate remain unresolved. Flex booking commission remains 15%; qualifying Growth bookings retain their existing exception. These decisions do not authorize automatic changes to historical contracts.

For a simplified planning model, let M be media spend, E other included campaign expenses, V average fulfilled booking value excluding amounts outside the defined revenue base, F fulfillment cost per booking, c booking commission and N incremental fulfilled bookings. Host contribution is N × [V × (1 − c) − F] − (M + E) × (1 + p). This is an analytical model, not an invoice, tax calculation or accounting recognition policy. Its assumptions must be visible; shared expenses, refunds, cannibalized organic demand and capacity can change the answer.

The corresponding break-even booking count is total campaign charge divided by contribution before acquisition per booking, provided that contribution is positive. If the property cannot cover fulfillment and commission before advertising, no bid strategy fixes it. If the host's margin data is unavailable, report revenue-based efficiency and explicitly leave profit unknown.

The platform must not optimize for maximizing its cost-plus markup. That would reward higher host spending. The product should recommend less spending, a different offer or no campaign when the evidence supports that recommendation.

## Account structure and advertiser identity

The durable requirement is **no host-managed ad setup**. It should not be confused with an unconditional requirement for one ad-serving account across every independent advertiser. Google's third-party policy requires a separate account for each end-advertiser managed by a third party. Whether Encho's specific arrangement is marketplace advertising by Encho or advertising on behalf of distinct hosts needs a provider-confirmed classification; the site domain and master brand alone do not settle it.[^1]

A practical fallback that preserves the experience is an Encho manager account with appropriately separated client accounts and server-managed access. Google's API can create client accounts under a manager, initially accessible through that manager. Hosts can still choose a property and approve a campaign in Encho. This API capability does not itself establish billing eligibility, advertiser verification, ownership or permission for Encho's contractual model.[^2]

For Meta, record the real business/ad-account, Page/Instagram identity, dataset and asset permissions used for each campaign. Separate the identity displayed in the ad from the ad account that pays. A host funding uploaded media for an Encho-branded ad is different from promoting an existing post on the host's own Instagram identity; the latter may require partnership/asset permissions. Neither an AI gatekeeper nor multiple accounts is immunity from enforcement. Do not create accounts to evade restrictions.

Shared accounts concentrate policy, billing and operational risk. Tenant-scoped reporting, financial reservations and permissions must remain explicit even if provider execution is shared. No host should see another host's leads, private performance or wallet. If a campaign spends host A's money but the guest ultimately books host B, record that cross-property outcome separately. Do not silently call it A's successful booking or charge B's acquisition cost to A. Any pooled marketplace acquisition model requires explicit commercial allocation rules.

## Google acquisition strategy

### Search intent and landing alignment

Begin with a focused Search test where there is demonstrable destination/property demand and a bookable offer. Create coherent themes such as destination plus accommodation type, verified amenity or stay purpose. Example themes are illustrative, not approved keywords or evidence of search volume: private-pool villa in a named destination, family resort with verified amenities, or a specific property's brand search.

Use the property's authoritative name, location, occupancy rules and amenities. Separate branded from nonbranded reporting so existing demand does not masquerade as new demand. Build initial negative-keyword proposals from irrelevant intents such as property jobs, buying real estate or unrelated long-term rentals, then review actual search terms. Exact/phrase focus is a proposed controlled baseline, not a universal claim that broad match is inferior. Test broader matching when signals, spend limits and query inspection support it.

Search advertisements should take guests to the advertised property's canonical page with preserved itinerary parameters where valid. Google hotel referrals must carry the correct dates/occupancy and bookable price. A beautiful general homepage is weaker for a guest who selected a specific property and stay.

Target the traveler as well as the destination. A person searching from Bengaluru for accommodation in Coorg should not be excluded because they are not already in Coorg. Test feeder-market presence and destination-interest approaches with reporting by actual geography; neither is a universal default. Google distinguishes presence from presence-or-interest, and Hotel campaigns have their own constraints, including presence-only targeting and no radius targeting.[^3]

### Bidding and conversion goals

Google's Smart Bidding already performs auction-time conversion or conversion-value optimization. Encho's advantage should be choosing valid objectives, supplying better property/booking evidence and governing the spend, not using a language model to improvise a bid every few seconds.[^4]

Use a genuine purchase/captured-booking signal for direct-booking campaigns when it is reliable. Preserve cancellation/fulfillment outcomes for reconciliation and subsequent optimization. Delaying every feedback event until a stay months later can weaken timely learning; a validated captured booking can be the timely event, with later correction where supported. An explicitly named expected contribution value may be explored after it is calibrated; do not relabel an estimate as actual revenue.

Keep views, gallery opens and checkout starts as diagnostic goals rather than equally valuable purchases. Google distinguishes primary and secondary conversion actions, with an important custom-goal exception: a secondary action included in a custom goal can influence bidding. Campaign goal configuration needs an explicit audit, not just a label in Encho.[^5]

For sparse data, avoid both extremes: blindly forcing aggressive ROAS targets and buying clicks indefinitely while calling it conversion optimization. Select a bounded learning strategy appropriate to the actual campaign/data eligibility, document its objective and allow time for conversion delay. Escalate to value-based bidding when values are trustworthy and sufficiently informative. There is no universal ₹300/day budget or 24-hour learning period valid for every property and account.

### Hotel Ads, free booking links and vacation rentals

Hotel distribution is an important opportunity beyond generic Search. Google Hotel campaigns depend on eligible properties, rates, availability and bookable landing pages supplied through Hotel Center or a connectivity partner.[^6] Free booking links can also send travelers to the booking site without a click fee; participation and ranking are not guaranteed.[^7]

The feed is a product integration: property matching, room/rate identities, occupancy, dates, taxes/mandatory charges, cancellation conditions, availability and landing URLs must agree with the actual booking journey. Google's price policy requires accurate bookable totals and itinerary consistency. The existing guest quote/inventory/privacy issues therefore block this acquisition opportunity until corrected.[^8]

Not all Encho properties belong in the same Google lodging feed. Google distinguishes hotel eligibility from vacation rentals; an independent furnished rental is not automatically a hotel. Route eligible supply through the correct lodging product and confirm partner eligibility before making host promises.[^9]

Current deadline: Google states that its third-party rates feature ends **September 30, 2026**. Affected campaigns lose Hotel Ads inventory; PMax travel campaigns can continue on other channels. Encho should plan an accurate direct feed or integration partner, not rely on that expiring shortcut.[^10]

### Performance Max, AI Max and expansion

PMax for travel goals supports property-specific assets across Google channels. It is a credible expansion candidate after measurement, property eligibility and costs are reliable; it is not proof that every host should start with every channel.[^11]

AI Max adds Search matching and creative/URL automation, with brand and location controls. Automatic final URL expansion is especially consequential in a multi-host marketplace: host-funded clicks must not wander to other properties, irrelevant pages or private account routes. Use a verified property URL boundary; keep expansion disabled where the required constraint cannot be demonstrated. Test AI Max against an established baseline, using the platform's experiment support where eligible.[^12]

Low budgets should not be fragmented across many campaigns, small audiences and creative variants without enough evidence to compare them. Nor should separate hosts' money be pooled into an opaque shared budget merely to increase learning volume. Choose campaign grouping only after defining allocation, ownership, available controls and reporting.

## Meta acquisition strategy

### Direct booking and assisted booking

For an online-bookable stay, propose a Sales/purchase-oriented campaign when the account, destination and event setup support it. For complex group stays or properties that genuinely require consultation, test a separate qualified-lead path with a response service level and downstream booking measurement. Do not optimize direct booking campaigns for awareness/reach and then promise purchase optimization. Meta's campaign schema exposes distinct objectives; current account/version eligibility must be verified during implementation.[^13]

Native lead forms can reduce initial friction but add follow-up work and may produce weaker intent. Requiring dates, party size and a meaningful booking question is a candidate experiment. Report lead-to-booking conversion and response time, not just low CPL. The existing Encho CRM can be the service layer only after lead ingestion, alerts and canonical booking handoff work.

### Reels, posts and creative evidence

Build from genuine host media: arrival, room walkthrough, bathrooms, distinguishing amenities, setting and practical guest questions. Reels should tell a short coherent story; still images and carousels should clarify the accommodation and make comparison easy. A proposed initial test is a verified room walkthrough versus a verified setting/experience story, holding offer and audience strategy comparable.

Meta recommends vertical 9:16 video, audio and safe-zone-aware content for Reels. Its published split-test evidence supports testing this creative treatment, but the studies span other sectors/markets and do not establish the same lift for Encho stays. Use captions for sound-off access and rights-cleared audio. Test placements by booking outcomes; do not exclude or expand all placements based only on aesthetic preference.[^14]

The media pipeline should detect resolution, duration, aspect ratio, blur, duplicate assets, text obstruction and claim/media mismatch; then propose crops, sequence, caption and copy alternatives. Keep original assets and record transformations. Cropping and adding captions are distinct from inventing scenery, pools, views or room space. Generative expansion of property imagery should default off where it could alter accommodation facts. All visible claims need property evidence and host/admin confirmation.

Do not assume that every uploaded Reel becomes an organic post, that every ad can reuse every post, or that host identity can be displayed without permission. Distinguish Encho Page posts, unpublished ad creatives and authorized partnership content in the eventual provider capability contract.

### Audience and remarketing

Use permitted geography, language, property appeal and observed booking behavior as hypotheses. Avoid unsupported personality labels such as identifying “wealthy high-intent guests” from scrolling. Broader automated delivery and narrow audience hypotheses should be compared using the same meaningful outcome and adequate budget, not defended as ideology.

Retargeting requires appropriate permission, adequate audience eligibility and useful timing. Suppress guests who already booked and dates no longer available. A large retargeting ROAS can reflect people who would have returned anyway; do not confuse attribution with incremental demand.

The current Constitution hardcodes Housing rules broadly. This research did not establish a universal Meta short-stay exemption or universal Housing requirement for every Encho listing/country. Relevant Meta Help pages were inaccessible publicly. Classify the actual offer and serving market with current provider policy evidence before changing those controls. Do not use sensitive targeting or evasion as an optimization technique.

## AI operating model

The recommended AI has five bounded responsibilities:

| Responsibility | Inputs | Useful output | Boundary |
|---|---|---|---|
| Listing readiness | Verified room/media, dates, price and policies | Missing facts and concrete fixes | No fabricated amenity, review or availability |
| Offer and audience planning | Stay purpose, geography, booking history, budget | Ranked hypotheses with evidence and uncertainty | No invented search volume or guaranteed bookings |
| Creative assistance | Real listing assets and approved facts | Copy alternatives, storyboard, crops/captions | Preserve factual property appearance and rights |
| Performance diagnosis | Provider snapshots, funnel errors, booking/cost ledger | Explain likely bottleneck and propose a test | Correlation is not claimed as causal proof |
| Bounded optimization | Approved experiment, budget/asset limits, valid telemetry | Allowed mutation request with audit trail | No self-authorized spending increase or unreviewed claim |

Use deterministic checks for exact constraints, APIs for current facts and language models for synthesis and suggestions. A prompt saying “be compliant” does not enforce compliance. Record which listing revision, assets, model/prompt version and evidence produced each recommendation; validate structured outputs and measure how often suggestions are wrong or rejected.

Automatic changes should require an explicit policy: allowed parameters, maximum change, review interval, minimum evidence, protected claims and rollback/reconciliation behavior. Funding, new creative claims, new destinations and higher total authorization require the appropriate prior approval. Safety pauses can be immediate; speculative budget expansion cannot.

The AI should be able to say “insufficient evidence” and “do not increase spend.” A recommendation to repair a failed checkout or shorten a slow page may be more valuable than a new creative. Frequent edits can also confound experiments; avoid treating visible AI activity as success.

## Measurement and financial truth

Create a canonical event lineage linking campaign/creative, permissible click identifiers, listing/room, itinerary, quote, booking, payment and later cancellation/fulfillment outcomes. A unique booking should not become multiple purchases because a page reloads, a webhook retries or both browser and server submit events. Browser/server matching identifiers and deduplication need provider-specific implementation tests; the Meta server event model supports event identifiers, but the full current deduplication guide was unavailable during this review.[^15]

Google offline uploads need per-result error handling, authoritative conversion/account ownership, conversion timestamps, currency, consent and a stable order reference where supported. Google supports conversion adjustments including retraction/restatement for eligible conversion types. Successful upload is not identical to attributed reporting.[^16]

Respect consent and purpose restrictions for collection, retargeting and uploads. Hashing personal data does not turn it into anonymous data or independently establish permission. Google Consent Mode controls tag behavior according to consent state; it is not itself a legal consent decision.[^17]

Maintain three distinct financial numbers: provisionally reported media spend, provider billed/adjusted cost, and host-authorized charge. Google notes that most campaigns may spend up to twice an average daily budget on a day and use a monthly limit based on 30.4 days, subject to campaign/budget conditions. This is why a simple daily-budget field cannot be treated as Encho's arbitrary lifetime host cap.[^18]

Reduce invalid traffic using platform diagnostics plus first-party anomalies, rate limits and bot protections that preserve legitimate travelers. Google filters detected invalid activity and can make billing adjustments; Encho cannot honestly guarantee every paid click is genuine. Reconcile credits instead of treating invalid-click counts as an extra host charge.[^19]

The host statement should show: media/other cost components, markup, remaining authorized budget, metric definitions and age, inquiries, captured bookings, fulfilled bookings, cancellations, attributed revenue and any estimated contribution. Show the gap between estimated, observed and settled amounts. Do not add Meta-attributed bookings to Google-attributed bookings as if each were unique.

## Experiment design and proof of lift

Optimize toward incremental fulfilled booking contribution where measurable. Use attributed captured bookings as a timely operating signal, with disclosed limitations. Experiments can distinguish causal lift from demand that would have existed anyway. Research using 663 Facebook experiments found that even rich observational models did not reliably recover experimental effects; AI-generated attribution explanations are not a substitute for a control group.[^20]

Google offers conversion-lift studies using treatment/control comparisons, subject to eligibility. Smaller Encho pilots may need carefully designed property, audience or geography experiments; these can be underpowered or contaminated by shared inventory, seasonality and returning travelers. Record those limitations rather than presenting a noisy result as a winning strategy.[^21]

Each experiment needs a written hypothesis, eligible population, primary outcome, guardrails, randomization/comparison method, spend/loss cap, conversion-delay window, minimum detectable effect, sample calculation and stopping rule. Outcomes should include cancellation, guest complaints, price mismatch and contribution, not only ad metrics. Adaptive allocation requires an analysis method that accounts for adaptation; constant unplanned peeking inflates false discoveries.

| Proposed experiment | Question | Primary interpretation |
|---|---|---|
| Focused Search vs controlled expansion | Does broader matching add useful demand? | Additional valid bookings and contribution, with search-term quality |
| Vertical walkthrough vs setting-led Reel | Which evidence helps guests choose? | Captured/fulfilled bookings after comparable opportunity |
| Direct booking vs qualified inquiry | Is consultation helpful for this segment? | Fulfilled contribution after response/support costs |
| Property landing improvements | Does price/date/room clarity reduce abandonment? | Checkout completion and guest error/complaint rates |
| Retargeting holdout | Does remarketing create additional bookings? | Incremental lift rather than attributed ROAS alone |
| AI suggestions vs existing approved process | Does the copilot improve actual outcomes? | Approval correction rate, host effort and booking economics |

No standard 24-hour winner rule is scientifically defensible for all properties. As an illustrative calculation, a fixed two-arm comparison of 2% versus 3% booking conversion, 5% two-sided significance and 80% power needs roughly 3,826 independent observations per arm before additional allowances for clustering, loss or delayed outcomes. This is a conventional normal-approximation planning calculation, not an Encho baseline, required universal sample or completed experiment.

## Host and admin experience

The target is a polished campaign studio where motion explains progress and decisions. The interface should feel calm, responsive and expensive because it makes complex work understandable. It should not use invented counters, countdown pressure or a science-fiction control panel to make spending feel inevitable.

**Host flow:** choose a listed property and available stay dates; review readiness issues; explore an AI recommendation; compare real creative variants in placement previews; inspect the full charge and conservative scenario range; approve the exact draft; track review/funding/provider stages; review observed outcomes and the next justified action. Keep optional detail behind progressive disclosure. Autosave and explicit validation should preserve work on unreliable mobile connections.

**Admin flow:** prioritize exceptions and funds at risk; inspect the same creative/price/destination revision the host approved; review AI evidence and policy issues; examine funding/reservation separately; compare changes since previous approval; approve content or request concrete revisions; separately authorize eligible activation; investigate uncertain external outcomes through a concise timeline. Do not build a single button that invents every successful state.

Micro-interactions should have a purpose: a crop transition shows what changes between placements; a before/after copy comparison shows an edit; a budget transition shows recomputed cost; a status movement follows a real durable event. Honor reduced motion, keyboard interaction, focus visibility and screen-reader announcements. Pause secondary media and animation when hidden. Status/error information must never rely only on color or movement.

The project already includes Motion/Framer Motion. Prefer existing capability for ordinary transitions; introduce GSAP only if complex sequencing proves useful and passes bundle/performance review. Three.js belongs only in an optional experience with a measurable purpose, such as a genuine spatial preview, and never on the payment/approval critical path by default. No claim of an award can be made before a product is actually built and judged.

Use field performance targets consistent with Core Web Vitals: p75 LCP ≤2.5s, INP ≤200ms and CLS ≤0.1, segmented by mobile/desktop. These are quality targets, not proof of conversion lift, and a lab score is not field evidence.[^22] Test the host and admin journeys on ordinary Android hardware and constrained networks, not only a designer's laptop.

The accompanying interactive concept is an illustrative Boardroom exploration of cost assumptions and separated review gates. It is not the production dashboard, a connected account, an actual campaign forecast or a live approval action.

## Current source implications

The prior [paid funnel audit](PAID_CAMPAIGN_AUDIT.md) remains valid. Additional Google review found:

- `GoogleAdsProvider.createCampaignHierarchy` constructs resource names from local IDs, writes local eligible entities and returns success without a campaign-create mutation in that method. This needs an actual provider implementation, not a version-string edit.
- `GoogleAdsClient` automatically uses simulated mode if a refresh-token environment variable is missing, including outside tests; supplied constructor credentials do not govern that decision.
- Inspected Google transport URLs use v17 for search/mutate and v18 for conversion upload; provider metadata says v18. Earlier shorthand describing only v16 was incomplete. Google's current release table lists v25 released and later versions separately; choose an actually supported version and revalidate contracts at implementation time.[^23]
- Google's current migration notice says developer-token access moved to Cloud projects on September 9, 2026, while some other official pages/summaries still show older instructions. Follow the specific migration guidance and verify actual project access rather than treating a token string as production entitlement.[^24]
- Offline upload sets partialFailure true but marks all submitted bookings uploaded after a successful HTTP response; it does not inspect per-conversion failures. Its selection is not scoped to campaign/client account and relies on legacy booking status/value/timestamp fields. That cannot be the trusted learning loop.
- Google DCO reports asset rotation/pinning from local updates without issuing a provider mutation in that method.

These are local source observations, not live Google account tests. They extend the open findings register. Existing application/migration hashes remain the reference for this documentation-only research.

## Decision and evidence gates

The recommended progression is a bounded pilot after existing correctness defects are repaired and independently verified. The pilot should include verified inventory, working canonical checkout, provider/account eligibility, clear cost terms, measured host support capacity, authentic creative and trustworthy conversion events. Select the initial destination/property cohort using actual supply, demand and operating capacity; those inputs have not yet been established here.

Judge continuation by fulfilled contribution, booking/price accuracy, valid event delivery, account health, host comprehension and willing repeat purchase after an honest outcome statement. Stop or revise when the economics fail. Host-funded experiments need explicit maximum downside, not an assumption that future bookings will repay every loss.

The research and interface direction are authorized; specific channel allocation, account topology, automation bounds and production implementation remain proposals in the current Boardroom phase. The existing legal/provider and booking-track gates have not been cleared. No live campaign, account creation, ad spend, payment or deployment was performed.

## Sources and evidence notes

Research checked September 13, 2026. Provider help pages are living documentation unless a publication/update date is specified. Recommendations are Encho-specific analytical proposals; provider marketing studies are not forecasts for Indian accommodation inventory. Public Meta Help/CAPI retrieval was limited by authentication/throttling, so unresolved account-specific policy/API details are explicitly retained. Source-code observations refer to the local workspace, not a deployed version.

[^1]: Google, [About Google third-party policies](https://support.google.com/adspolicy/answer/6086450?hl=en), living policy. Account separation and transparency; Encho classification unresolved.
[^2]: Google Developers, [Create customer](https://developers.google.com/google-ads/api/samples/create-customer), current API sample. Manager-created client accounts; not billing approval.
[^3]: Google, [About advanced location options](https://support.google.com/google-ads/answer/1722038?hl=en-GB) and [Target ads to geographic locations](https://support.google.com/google-ads/answer/1722043?hl=en-GB), living guides. Search/location and Hotel targeting distinctions.
[^4]: Google, [About Smart Bidding](https://support.google.com/google-ads/answer/7065882?hl=en) and [Value-based bidding for Search and Shopping](https://support.google.com/google-ads/answer/15099424?hl=en), living guides. Auction-time optimization and goal/value choices.
[^5]: Google, [About primary and secondary conversion actions](https://support.google.com/google-ads/answer/11461796?hl=en), living guide. Includes custom-goal exception.
[^6]: Google Hotel Center, [How to get started with hotel campaigns](https://support.google.com/hotelprices/answer/9238463?hl=en), living guide. Feed, property and landing requirements.
[^7]: Google Hotel Center, [About hotel free booking links](https://support.google.com/hotelprices/answer/10472393?hl=en), living guide. No click fee; eligibility/ranking conditions.
[^8]: Google Hotel Center, [Price Accuracy Policy](https://support.google.com/hotelprices/answer/6064419?hl=en), living policy. Bookable price and itinerary consistency.
[^9]: Google Hotel Center, [How to set up your hotel inventory](https://support.google.com/hotelprices/answer/9218458?hl=en) and [Categories for lodging businesses](https://support.google.com/hotelprices/answer/9970971?hl=en), living guides. Hotel/vacation-rental distinction.
[^10]: Google Hotel Center, [About Google third-party rates for hotel ads](https://support.google.com/hotelprices/answer/14310302?hl=en), current notice. September 30, 2026 feature ending and affected channels.
[^11]: Google Developers, [Performance Max for travel goals](https://developers.google.com/google-ads/api/performance-max/travel-goals), living API guide. Property assets and multi-channel capability; read with source 10 for rate-feed change.
[^12]: Google, [How AI Max for Search campaigns works](https://support.google.com/google-ads/answer/15910187?hl=en), [PMax final URL expansion](https://support.google.com/google-ads/answer/14670793?hl=en), and [AI Max experiments](https://support.google.com/google-ads/answer/16450159?hl=en), living guides. Controls and experiments; availability needs account validation.
[^13]: Meta, [Campaign model in official Python Business SDK](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/campaign.py), current source. Objective fields/enums; not proof of Encho account eligibility.
[^14]: Meta for Business, [Instagram and Facebook Reels ads](https://www.facebook.com/business/ads/facebook-instagram-reels-ads), living product guide with provider-sponsored multi-sector studies. Creative/placement recommendations; no Encho effect estimate.
[^15]: Meta, [Server Event model in official Python Business SDK](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/serverside/event.py), current source. Event structure; complete deduplication contract still needs current provider-guide validation.
[^16]: Google Developers, [Manage offline conversions](https://developers.google.com/google-ads/api/docs/conversions/upload-offline), updated September 10, 2026, and [Import conversion adjustments](https://developers.google.com/google-ads/api/docs/conversions/upload-adjustments). Partial failures, order IDs, attribution limits and eligible adjustments.
[^17]: Google Developers, [Consent mode overview](https://developers.google.com/tag-platform/security/concepts/consent-mode), living technical guide. Does not determine jurisdictional legal obligations.
[^18]: Google, [About spending limits](https://support.google.com/google-ads/answer/10486637?hl=en), living guide. Typical campaign daily/monthly limits and billed/served distinction; exceptions apply.
[^19]: Google, [About invalid traffic](https://support.google.com/google-ads/answer/11182074?hl=en), living guide. Detection, reporting, billing adjustment and investigation.
[^20]: Brett R. Gordon, Robert Moakler and Florian Zettelmeyer, [Close Enough? A Large-Scale Exploration of Non-Experimental Approaches to Advertising Measurement](https://arxiv.org/abs/2201.07055), revised October 4, 2022. Abstract/summary evidence; 663 experiments, not Encho accommodation results.
[^21]: Google, [About lift studies](https://support.google.com/google-ads/answer/16104408?hl=en) and [Conversion Lift based on users setup](https://support.google.com/google-ads/answer/12005564?hl=en), living guides. Controlled measurement and eligibility.
[^22]: Philip Walton, Google web.dev, [Web Vitals](https://web.dev/articles/vitals), updated October 31, 2024. Field thresholds and laboratory limitations.
[^23]: Google Developers, [Deprecation and sunset](https://developers.google.com/google-ads/api/docs/sunset-dates), current version timetable. Released versus projected versions must be distinguished.
[^24]: Google Developers, [Developer token migration](https://developers.google.com/google-ads/api/docs/api-policy/developer-token), current September 2026 migration notice. Some official summaries/older auth pages still conflict; actual project access remains unverified.
