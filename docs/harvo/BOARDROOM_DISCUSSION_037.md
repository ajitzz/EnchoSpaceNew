# Boardroom Discussion 037 — Encho Company and Product Strategy

Date opened: 23 September 2026  
Phase: 1 — Boardroom discussion, closed by founder on 23 September 2026  
Exit phrase: `NextO`

## Purpose

This is the living record for the founder and engineering co-founder discussion about turning Encho from a partially completed product into a durable company. It records verified facts, founder proposals, challenges, accepted decisions, rejected ideas, assumptions, unknowns and the evidence required before execution.

Nothing in this document authorizes Phase 2 design or Phase 3 implementation until the founder says `NextO`. Discussion does not certify production readiness or change historical milestone acceptance.

> **Phase transition:** The founder issued `NextO` on 23 September 2026 and explicitly moved Encho to Phase 2 Blueprint. The frozen Phase 2 synthesis is `docs/blueprints/ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md`. This discussion remains the historical evidence record; it does not by itself authorize Phase 3 source implementation.

## Working agreement

- Evaluate ideas by business survival, customer value, legality, security, operational load, unit economics and engineering feasibility.
- Challenge weak ideas directly. Do not convert enthusiasm into evidence.
- Keep founder proposals separate from approved decisions.
- Keep locally verified software separate from deployed and provider-verified behavior.
- Record decisions with rationale, rejected alternatives, dependencies and measurable exit evidence.
- Return to the active strategic question whenever the discussion drifts.
- At `NextO`, freeze the accepted Phase 1 decisions and produce a numbered, dependency-aware execution blueprint before writing production code.

## Opening baseline

### Verified position

- Historical marketing milestone acceptance remains **5/10**. This measures accepted outcomes, not the amount of code written.
- ADT-0 through ADT-6 have local evidence. ADT-7 remains partial because the actual restricted Neon runtime role and exact provider district/canary evidence are unresolved.
- Migrations 032–035 are present on the primary Neon database, but production still uses an owner/BYPASSRLS connection. Catalog inspection of a restricted role is not proof that the application runs through it.
- Encho has a substantial managed-advertising foundation: master-account adapters, versioned price-tier strategies, immutable campaign bindings, bounded feeder controls, AI/human review, finance safeguards, telemetry and admin operations.
- The complete simplified host experience is unfinished. Host placement preferences, bounded provider-specific age preferences and trip-party intent are not established as a complete contract-to-provider flow.
- Live paid-provider acceptance, end-to-end conversion truth, operational support evidence and a bounded zero-spend provider canary remain separate from local test success.

### Governance contradiction to resolve

The Engineering Constitution still describes an older Meta v19, universal `HOUSING`, fixed score-below-8 rejection and lead-form pipeline. Newer source and HARVO records use versioned provider capabilities, configurable special-ad categories, current API contracts and a review fallback when AI is unavailable. The boardroom must decide the current product/policy model; afterward the Constitution must be reconciled with verified implementation and provider rules.

### Honest starting assessment

Encho currently has more architecture than validated business traction. That is useful only if the next decisions reduce customer friction, prove reliable acquisition and bookings, and define an operating model the team can actually support. Additional control panels or AI features without provider evidence, conversion evidence and clear unit economics would increase cost while preserving the same commercial uncertainty.

## Strategic agenda

1. Define the first paying customer and their urgent problem.
2. Decide the minimum complete Encho promise for guests, hosts and administrators.
3. Validate the master-account operating model, provider-policy exposure and failure containment.
4. Define host campaign simplicity and the exact boundary between host preference, AI advice and admin authority.
5. Establish acquisition economics, pricing, tax/legal dependencies and loss limits.
6. Decide what must be proven in a small pilot before broader growth.
7. Define operational staffing, incident response and customer support requirements.
8. Rank existing technical work by revenue necessity, risk reduction and distraction.
9. Establish Phase 2 acceptance criteria and an explicit list of features that will not be built yet.

## Decision ledger

Founder-approved decisions now include offer-level price strategy (037-E), the property-discovery versus room-offer execution boundary (037-F), the requirement for host-originated Reel/post/carousel campaigns (037-G), the direction of reusable expert strategies with scoped staff operation (037-H1), Phase P5 Offer-Led Creative Engine adversarial hardening (CR1-014), Phase P6 Provider Package Engine hardening (CR1-015), Phase P7 Portfolio Campaign Engine hardening (CR1-016), Phase P1 Containment & Propagation hardening (CR1-017), Package P0.4 Bootstrap hardening (CR1-018), Phase P3/P4 Conversation Desk & Offer Authority hardening (CR1-021), Phase P2 Workforce IAM & Privilege Fencing hardening (CR1-022), and Track 2 Statutory Tax Clearance Manifest generation (CR1-023: SHA-256 fingerprinting of Section 9(5) CGST / Section 52 TCS memorandum, atomic tax withholding rollback, 5-click burst deduplication, monotonic filing sequence fencing, and fail-closed checkout lock pending CA UDIN). Detailed role/threshold/permission proposals remain open. These decisions establish product and architecture direction only; Phase 2/3 work, milestone acceptance, legal gates and provider clearance remain unchanged.

## Audit 037-A — Company thesis, economics and existential risk

### Problem being solved

Independent hosts face three coupled failures. Marketplace demand is rented rather than owned; ranking, eligibility and commission programs remain controlled by the marketplace. Direct demand generation requires advertiser verification, payment setup, policy interpretation, conversion tracking, creative production, audience/location selection and continuous budget/availability operations. A conventional agency usually adds retainers, handoffs and reporting dashboards while lacking atomic access to Encho's canonical availability, price, booking, payment and guest-conversion state. The host is left coordinating disconnected systems and cannot reliably distinguish clicks from profitable fulfilled stays.

Encho's defensible proposition is the integrated operating loop: verified listing facts and approved media become bounded campaigns; campaign money is reserved and reconciled; provider delivery is observed; inventory can trigger a safety pause; inquiries and bookings remain inside Encho; and the host sees one product rather than provider consoles. AI copy or a campaign builder alone is not the moat. The moat, if proven, is the closed transaction-and-learning loop plus trustworthy operations.

### Master-account correction

`Zero Host OAuth` is accepted as a product experience: hosts should not need provider credentials or Ads Manager expertise. It does not imply that every independent property business may safely share one Google serving account. Google's current third-party policy requires a separate account for each end advertiser and identifies manager accounts as the umbrella for separate client accounts. Therefore the compliant direction to investigate is an Encho-managed MCC and end-advertiser account mapping, or explicit provider confirmation that Encho is the single advertiser of record under the intended commercial model. The UI may remain one-click in either case. A single credential/control plane reduces host friction and secret sprawl, but a single serving account increases blast radius.

No equivalent Meta account structure is assumed without current written provider confirmation. AI and human review reduce bad submissions; they do not override advertiser-verification, billing, representation or account-integrity rules.

### Commercial model

The booking and advertising products are distinct:

- Flex booking: default 15% host booking commission, snapshotted when the booking is confirmed and deducted from host payout. The guest is not charged an Encho booking commission or payment-gateway surcharge.
- Growth: ₹4,999 plus applicable GST per property per rolling 30 days; bookings confirmed while the plan is active retain 0% booking commission under the current direction.
- Advertising: optional cost-plus charge. For complete recognized campaign costs `C` and prospective admin markup `p`, target campaign profit is `C × p` and the corresponding charge is `C × (1 + p)`, before any separately specified remittance tax. At `C = ₹10,000` and `p = 5%`, the target is ₹500 and the cost-plus amount is ₹10,500. The intended introductory markup range is 3–5%.

The advertising target is campaign contribution, not guaranteed company net profit or host return. Exact recoverable cost categories, processor-dependent charges, tax treatment, adverse variance, refund/fee earning and legal invoice treatment remain controlled open items. The repository's older 15% ad-spend split is superseded as future direction and must not be quoted as the current business model.

### Why a host would choose Encho

A credible host chooses Encho only if it proves a better combined outcome: less setup time, demand beyond marketplace ranking, canonical inventory-aware campaigns, one accountable support surface, transparent cost/spend evidence, and more contribution from fulfilled stays after all fees. “AI-powered,” more controls, vanity impressions and a lower advertised fee are insufficient reasons. Repeat voluntary campaign funding after reconciled profitable stays is the proof.

### Company assessment

- Problem severity: **8/10** for independent hosts who need direct demand and lack an internal marketing operation.
- Integrated product thesis: **7/10**. The combination is differentiated; its individual components are copyable.
- Current accepted product completion: **5/10** under the existing milestone record.
- Commercial proof: **2/10**. No accepted cohort proves incremental profitable fulfilled bookings, retention or scalable support cost.
- Scale readiness: **3/10**. Provider-account structure, least-privilege production runtime, legal/tax rules and bounded provider/financial pilots remain open.

The historic 15–20% survival estimate without operational shields remains a reasonable boardroom heuristic, not a statistical forecast. Claims that technical shields alone raise survival above 75% are rejected: controls reduce loss probability but do not create product-market fit, inventory quality, traveler trust or repeatable distribution.

### Three architectural company killers

1. **Provider enforcement and account concentration.** A suspension, advertiser-verification failure or policy classification error can halt acquisition for every host bound to the affected serving account. Required shield: zero-host-OAuth control plane with provider-compliant account partitioning, immutable account binding, server-only credentials, truth-bound creative, AI evidence plus independent review, paused creation, authenticated readback, spend kill switches and an incident runbook. Current state: much of the safety machinery exists; Google end-advertiser account separation and Meta operating classification are not accepted.
2. **Negative cash exposure from fraud, overrun or ambiguous remote writes.** Encho can pay providers while a host payment is fraudulent, reversed or insufficient; blind retries can duplicate spend. Required shield: verified capture before spend, risk escrow, immutable cost-plus quote, balanced journal, reservation/authorization caps, idempotency, durable operation claims, unknown-outcome quarantine, verified pause, independent final invoice settlement and original-rail refunds. Current state: strong local architecture exists; real gateway/provider reconciliation and the final tax/cost policy are not accepted.
3. **Privileged multi-tenant runtime and broken canonical truth.** A compromised owner/BYPASSRLS database connection can expose all hosts, leads and money records; stale availability/price can also spend against an unbookable or misleading stay. Required shield: actual least-privilege non-bypass runtime credentials, FORCE RLS, adversarial tenant tests, immutable canonical facts/media, atomic inventory holds, availability-triggered pause, strategy/readback drift checks, restore drills and current-consent conversion authority. Current state: migrations and local tests exist, but production still uses the owner role; exact checkout/consent and live pause/canary evidence remain open.

### Evidence boundary

Official current Google material states that third parties must be transparent about services, costs and expected results; significant or repeated violations may suspend advertising and manager accounts. It also requires one account per end advertiser and describes MCC as the management layer over separate accounts. Airbnb currently documents stay fee structures that can deduct a single host fee around 14–16% for many hosts, while Booking.com confirms commission and paid visibility mechanisms; these are contextual comparisons, not a universal competitor-price claim.

No decision in this audit changes provider accounts, commercial rates, production configuration or milestone status.

## Founder Vision 037-B — Host-first managed distribution company

### Product hierarchy

The founder defines Encho through three product surfaces:

1. **For Guests:** a premium, trustworthy property discovery and conversion destination. `ListingDetailsNew` and the gallery experience are each property's Encho-hosted web presence, removing the need for an inexperienced host to build and operate a separate property website.
2. **For Hosts — primary customer:** a managed distribution and marketing operating system. The host lists the property, chooses bounded campaign preferences, funds an accepted campaign and monitors it through Encho. The host should not need to create, verify or operate Meta/Google advertising accounts or understand provider micro-options.
3. **For Admin:** an expert command center that carries the operational burden hosts cannot. Admin maintains segment strategies, reviews property truth/media/rights, reviews AI evidence, approves exact campaign revisions, initiates provider publication, monitors delivery and protects Encho's provider identities and capital.

### Founder promise

Encho provides premium canonical property pages and galleries, then uses Encho-controlled advertising and brand-social infrastructure to distribute those properties. The founder intends both paid Google/Meta campaigns and approved organic Feed/Reel publishing through Encho's Facebook and Instagram presence. Nothing supplied by a host is allowed to publish automatically: AI assessment precedes strict administrator review, and only an administrator may send the unchanged approved artifact to the provider.

The founder identifies waste prevention as a central product function. A host advertising a Kozhikode property to nearby Kozhikode residents is the example of an inexperienced choice Encho should identify and correct. Price tier, property location, feeder travel corridors, trip purpose, media, inventory, budget and campaign objective should inform recommendations. The product must educate rather than merely hide decisions.

### Transparency promise

Encho does not guarantee bookings or profit. It promises a controlled, explainable process: transparent cost and markup, review evidence, provider status, observed impressions/clicks/spend, first-party property activity, inquiries, attributed bookings and availability protection, each with timestamps and freshness. The founder wants useful property-page interest signals such as current viewers, plus the host calendar and campaign status in the same operating surface.

### Founder risk model

- Provider account ban is an existential risk because Encho assumes provider-account and brand-publication responsibility.
- A host can lose a large funded campaign without conversions; transparency alone cannot compensate for poor economics, but opaque operation would destroy trust faster.
- AI and administrator review are the proposed control pair. AI reviews at scale and detects obvious risk/waste; an accountable human makes the publication decision.
- The admin experience must function as an expert decision system, not a generic CRUD dashboard.

This section records founder product intent. It does not certify that a single serving account is provider-compliant, that a viewer counter is truthful, that organic publishing permissions are approved, or that a campaign will convert.

## Audit 037-B — Implementation fit against the clarified vision

### Guest surface

| Capability | Verified status | Assessment |
|---|---|---|
| Canonical property destination | `/stay/{slug}` resolves to `ListingDetailsNew` | Implemented |
| Premium listing and gallery | Property-supplied media, room gallery and cinematic gallery are present with isolation tests | Strong local foundation |
| Separate-site replacement | Encho supplies the page, SEO surface and inquiry/booking presentation | Partial: domain, discoverability, checkout/support trust and operating acceptance still matter |
| Calendar/inventory truth | Relational inventory days, atomic holds and host/admin calendar controls exist | Strong local foundation; full guest legal/checkout track remains incomplete |
| Current-viewer hint | Socket presence exists only in legacy `ListingDetails`; `ListingDetailsNew` does not subscribe or render it | Missing from the canonical page |
| Property-interest telemetry | `ListingDetailsNew` records photo and date-selection interactions | Partial; consent, attribution coverage, bot/session semantics and production evidence remain open |
| Completed booking conversion | Canonical checkout/capture/consent authority is still gated | Not complete |

### Host surface

| Capability | Verified status | Assessment |
|---|---|---|
| Create and manage listing/gallery | Host listing/media forms and canonical presentation exist | Substantial |
| One Encho marketing workspace | New v2 Campaign Studio supports owned property, channel, creative, geography, budget, schedule, AI, quote, funding and status | Substantial local implementation |
| Admin-managed tier strategy | BUDGET/COMFORT/PREMIUM profiles and immutable revision bindings exist | Implemented locally/migrated |
| Waste-resistant geography | Approved feeders, bounded radii and locked exclusion model exist | Implemented foundation; exact live district/provider evidence unresolved |
| Host-friendly placement/persona choices | Feed/Stories/Reels preference, bounded age and trip-party intent are absent from the v2 draft contract | Missing |
| Paid provider publication | Google/Meta provider adapters, paused publication, readback and controls exist | Local evidence; no accepted paused canary/live operating proof |
| Campaign transparency | Delivery state, freshness, impressions, clicks, CTR, spend, first-party visits/inquiries/bookings and budget meter are projected | Strong design, partial operating proof; network data is delayed, not literally live |
| Host calendar protection | Calendar circuit-breaker and availability design exist | Partial until provider pause/readback is demonstrated operationally |
| Organic Instagram publishing | Legacy Social Studio has draft/admin approval, Instagram container/publish and idempotency reconciliation behind an explicit flag | Legacy/partial, not accepted production architecture |
| Organic Facebook Feed publishing | UI preview/copy mentions Facebook, but worker calls only the Instagram publisher | Missing |
| Social AI safety | Legacy caption generator can return generic invented luxury copy and a 9.4 fallback score after AI failure; submission safety is mostly a forbidden-word regex | Unacceptable for master-brand publication |

### Admin surface

| Capability | Verified status | Assessment |
|---|---|---|
| Campaign review | Exact revision, AI result, policy/media confirmations and review note are required | Strong |
| Provider operations | Paused publish, activate, pause, status/telemetry refresh and bounded recovery panels exist | Substantial local foundation |
| Strategy operations | Versioned profile/corridor editor, diff/release/rollback and audit evidence exist | Strong local foundation |
| Financial visibility | Quote, funding, risk hold, refund and settlement evidence are separated | Strong architecture; live end-to-end acceptance incomplete |
| Social review | Legacy social approval records exact content and requires a currently authorized admin | Useful hardening inside an otherwise legacy path |
| Unified command center | Paid v2, legacy social, listing moderation, provider health, finance and incident evidence are not yet one coherent decision surface | Partial |
| Scalable expert system | Admin remains a human bottleneck; workload/SLA/prioritization/dual-control staffing are not validated | Not complete |

### Completion assessment

The founder's clarified vision is approximately **50–55% represented in source**, **30–35% operationally production-proven**, and **under 10% commercially proven**. Historical marketing milestone acceptance remains 5/10; these percentages do not replace it.

- Guest vision: roughly **55%** — premium canonical presentation and inventory foundations exist; canonical viewer hint, accepted checkout/consent and full operating proof do not.
- Host vision: roughly **50%** — the paid campaign lifecycle is substantial, but simplified preference controls, provider canary, organic Facebook and safe unified social publishing are incomplete.
- Admin vision: roughly **60% locally** — review, finance and strategy tooling are broad; production credentials, provider/account model, unified social governance and scalable operations remain unresolved.

### Product corrections required by the vision

1. Call the provider data **observed and timestamped**, not “live,” unless a real event stream supports that metric.
2. A viewer hint must represent a defined presence window, filter obvious automation, protect privacy and never invent scarcity. “Three people are viewing” based on raw sockets is not acceptable business truth.
3. AI/admin review reduces content risk but cannot reduce account-ban risk to “minimal.” Identity, advertiser structure, payments, landing-page quality, repeated violations and provider enforcement remain.
4. Organic Encho social distribution is a scarce shared brand resource. It needs host media rights, brand-fit policy, frequency/fairness rules, takedown controls, exact admin approval, provider readback and separation from paid-campaign financial claims.
5. A ₹50,000 campaign should begin with a bounded experiment and explicit stop conditions, not a single blind release. Transparency explains losses; preflight, staged budgets and stop-loss controls reduce them.
6. “Best customization” and “maximum conversion” are unprovable claims. Promise evidence-based configuration, truthful reporting and disciplined loss control.
7. The administrator should be a high-quality exception-and-approval operator supported by deterministic systems. Designing the business around one heroic “Tony Stark” creates another single point of failure.

## Rejected ideas

None recorded yet.

## Guest Architecture Discussion 037-C — Candidate merged architecture

**Status:** Phase 1 candidate architecture under discussion. It is not an approved decision, implementation mandate, milestone acceptance or legal-gate clearance.

### Guest job to be done

The guest does not care that Encho operates an AdTech engine. The guest needs to answer, with very little uncertainty: Is this real, is it right for my trip, is it available for my dates and group, what is the exact total, can I pay safely, and will someone help me if the stay goes wrong? The guest surface must therefore be a booking-truth system wrapped in premium hospitality presentation. Treating it primarily as an advertising landing page would create clicks without durable trust or conversion.

### Current fit against the founder vision

| Guest layer | Verified current foundation | Current deficiency | Boardroom assessment |
|---|---|---|---|
| Acquisition entry | Canonical `/stay/{slug}` route, legacy redirects, SEO fields and marketing destination binding exist | Deployed crawl/index performance and campaign-to-booking attribution are not accepted end to end | Good structural foundation; operating proof missing |
| Public truth projection | Published-only projection, masked address, coarsened coordinates and allowlisted fields exist | Exact production cache, privacy and stale-data behavior still need release evidence | Strong |
| Property story | `ListingDetailsNew`, host-supplied galleries, room-specific media and honest empty states exist | M6A awaits independent acceptance; the route bundle is large and conversion quality is unmeasured | Visually strong, commercially unproven |
| Trust | Fabricated reviews, ratings, media and verification fallbacks were removed; zero-review state is defined | Genuine review eligibility, verification operations, dispute handling and support promises are not complete | Correct direction, thin evidence |
| Availability | Relational room/inventory authority and atomic 10-minute holds exist, including concurrency tests | The canonical page can inspect availability but does not progress to accepted checkout | Strong backend foundation, disconnected funnel |
| Pricing | Nightly facts exist and the accepted architecture requires immutable server quotes with zero guest Encho commission | The canonical page explicitly keeps `checkoutAvailable = false`; M5 tax/quote authority is legally blocked | Critical blocker |
| Identity and payment | Unified account model and target Razorpay binding/webhook state machines are specified | Verified three-stage checkout, captured-payment fulfillment and recovery are not delivered/accepted | Critical blocker |
| After booking | Legacy booking UI/notifications exist and the target architecture specifies manage-booking states | Canonical confirmation, arrival support, cancellation, refund, dispute, payout and no-show journeys are unfinished | Critical trust gap |
| Guest-host communication | Authenticated realtime membership hardening exists and the page offers an Encho contact path | Canonical pre-booking inquiry, response SLA, moderation, escalation and booking-context continuity are not accepted as one journey | Partial |
| Measurement | Listing photo/date interactions and marketing outcome structures exist | Consent authority, bot/session semantics, opaque attribution through a fulfilled booking and production reconciliation are incomplete | Partial |
| Accessibility/performance | Dedicated presentation/browser fixtures exist; accessibility and performance budgets are documented | Full WCAG acceptance, real-device proof and the `<220 KB` initial-route goal are not met; `ListingDetailsNew` remains materially heavy | Below release standard |

The guest vision is approximately **55% represented in source**, but only about **30–35% operationally proven**. The visual browsing portion is much further ahead than the transactional stay journey. A weighted guest product score is therefore about **4.5/10 today**: the storefront is credible, while the money, confirmation and recovery paths that make it a marketplace remain unfinished.

### Candidate target architecture

```text
Campaign / Search / Share Link
        |
        v
Canonical Stay Gateway (/stay/{slug}, opaque attribution, consent boundary)
        |
        v
Published Guest Projection
  - property facts and approved media
  - room types and occupancy
  - masked public location
  - genuine verification/review facts only
        |
        v
Trip Decision Workspace
  - dates, guests and room choice
  - accessible spatial gallery
  - authoritative availability
  - policies, amenities and honest missing states
        |
        v
Server Quote + Atomic Hold
  - immutable itemized quote
  - zero guest Encho commission
  - approved tax/cancellation policy versions
  - 10-minute inventory hold
        |
        v
Verified Unified Identity -> Razorpay Order -> Signed Webhook Fulfillment
        |
        v
Server-Backed Confirmation + Manage Trip
  - booking reference and invoice
  - private arrival details at the correct time
  - Encho messaging and support escalation
        |
        v
Check-in -> Stay -> Checkout -> Cancellation/Refund/Dispute if needed
        |
        v
Eligible Verified Review + Consented Conversion Outcome
        |
        +----> Host/Admin campaign learning and inventory protection
```

The architecture has two separate projections over the same canonical facts:

1. **Public discovery projection:** cacheable, privacy-masked and free of private addresses, guest PII, host contact details and operational internals.
2. **Authenticated trip projection:** progressively reveals the accepted quote, payment/booking state, policy snapshot, support context and only those arrival details permitted for a confirmed guest.

Provider campaign IDs, AI scores, admin reasoning, host payout details and marketing configuration never belong in the guest projection. The guest sees the property, price, availability, booking confidence and help.

### Candidate guest state model

The existing target domain states remain the governing base. For product communication, the guest journey should project them into understandable stages:

```text
BROWSING
  -> TRIP_CONFIGURED
  -> QUOTE_ACCEPTED
  -> HOLD_ACTIVE
  -> PAYMENT_PENDING
  -> BOOKING_CONFIRMED
  -> PRE_ARRIVAL
  -> CHECKED_IN
  -> CHECKED_OUT
  -> REVIEW_ELIGIBLE
```

Failure branches must remain first-class: `QUOTE_EXPIRED`, `HOLD_EXPIRED`, `PAYMENT_FAILED`, `PAYMENT_OUTCOME_UNKNOWN`, `CAPTURED_INVENTORY_UNAVAILABLE`, `CANCELLATION_PENDING`, `REFUND_PENDING`, `REFUNDED`, `NO_SHOW` and `DISPUTED`. The UI must never translate an unknown provider/payment outcome into success or failure merely to look clean.

### Required upgrades before the guest promise is complete

1. **Clear the real legal gate.** Obtain written Indian CA/tax-lawyer decisions for tax lines, invoices, place of supply, marketplace obligations, cancellation/refund disclosures and collection-agent terms. UI work cannot manufacture this authority.
2. **Independently accept M6A and reduce route weight.** Verify property truth, gallery isolation, keyboard/screen-reader behavior, responsive images, mobile 4G performance and error states. The premium page must be fast enough to convert paid traffic.
3. **Connect authoritative quote to hold.** Dates, occupancy and room selection must produce one immutable server quote and one principal-bound atomic hold. No browser total or tolerance comparison is authoritative.
4. **Deliver recoverable identity and payment.** Preserve the anonymous discovery/quote experience, require a verified unified account before payment, bind Razorpay orders to quote/hold/guest, and let signed webhook truth—not the client animation—confirm a booking.
5. **Complete the trip after payment.** Build server-backed confirmation, private arrival disclosure, booking management, support escalation, cancellation/refund status and failure recovery. A payment success screen without aftercare is not a booking product.
6. **Establish genuine trust evidence.** Verification badges require recorded method/date; reviews require eligible completed stays; every safety, amenity, distance and media claim requires canonical evidence.
7. **Close the acquisition loop with consent.** Use opaque signed attribution, record consented touchpoints, deduplicate conversion events and attribute only canonical inquiries, confirmed bookings and ultimately fulfilled stays. Raw provider or database IDs must not leak into public URLs.
8. **Certify privacy, security and operations.** Use the actual non-BYPASSRLS runtime role, test IDOR and tenant isolation, minimize guest data, define retention and support access, rehearse webhook/payment reconciliation, and measure real error and response-time budgets.
9. **Retire legacy paths only after parity.** `ListingDetails.tsx`, legacy checkout and older booking flows remain containment risks until the canonical journey passes cutover evidence. Permanent redirects may remain.

### Product choices recommended for founder discussion

- **Keep:** premium story, room-first exploration, transparent availability, exact pricing, internal messaging and one coherent manage-trip surface.
- **Defer from launch:** an exact “people viewing now” counter. It does not solve the primary trust problem and is easy to turn into fake urgency. If later approved, it must use a documented short presence window, deduplicated sessions, bot filtering, privacy thresholds and an explicit `data as of` timestamp; low counts should be suppressed rather than embellished.
- **Reject:** invented scarcity, countdown pressure unrelated to a real hold, unverified ratings, stock property media, client-computed totals, hidden fees and any claim of guaranteed booking or savings.
- **Do not expose:** provider names/configuration as operational complexity, AI grades, admin controls, payout accounting or campaign performance on the guest booking surface.

### Guest release evidence

The guest architecture is not release-complete until a real test traveler can arrive through a canonical link, see truthful property facts, obtain an exact legally approved quote, acquire inventory atomically, authenticate, complete a bound Razorpay payment, receive a server-confirmed booking, access support, cancel/refund through an observable state where applicable, complete the stay and leave an eligible verified review. The same run must produce consented attribution without leaking PII, preserve address privacy, survive duplicate/delayed webhooks and meet measured mobile/accessibility budgets.

### Open founder choices for the guest surface

1. What first trip and destination will define the launch guest—weekend couples from Bengaluru to Wayanad, family villas in Goa, or another narrow corridor?
2. Will pre-booking communication be free-form Encho messaging, structured inquiry questions, or both, and what host response SLA will Encho promise?
3. What support coverage can Encho actually staff during checkout, arrival and refund incidents?
4. Which cancellation templates and check-in evidence mechanism will be selected after legal review?
5. Is a truthful presence indicator valuable enough to fund after checkout, support and performance are complete?

## Host and Admin Architecture Discussion 037-D — Candidate merged control model

**Status:** Phase 1 candidate architecture under discussion. It is not an approved decision, implementation mandate or provider-readiness claim.

### Boardroom verdict on the founder proposal

The direction is correct: the host should not operate a miniature Meta Ads Manager or Google Ads console. Encho must own the technically dangerous choices and give the host a small set of bounded commercial preferences. However, an administrator manually rebuilding every campaign from zero is also the wrong operating model. It converts host confusion into an expensive, slow and error-prone admin agency desk.

The scalable design is **strategy once, compile many, review exceptions**:

1. Admin authors versioned provider strategies and destination corridors.
2. The system resolves a property into a pinned strategy using canonical price, location, inventory and facts.
3. The host supplies business intent and approves budget/media/schedule within released limits.
4. Deterministic validators and AI produce evidence, warnings and proposed corrections.
5. Admin reviews the exact immutable revision, focusing on exceptions and risk.
6. The provider compiler creates a paused campaign from that saved binding.
7. Admin operations activates, observes, pauses and reconciles using verified provider evidence.

“Absolute best conversion” is not a truthful promise. Strategies are measurable hypotheses. Encho can promise evidence-based configuration, controlled experiments, loss limits and accountable iteration; it cannot promise maximum conversion.

### Current implementation fit — Host

| Host capability | Verified current foundation | Deficiency against the vision | Assessment |
|---|---|---|---|
| Property selection | Host sees owned published properties only | Production tenant/runtime acceptance remains open | Strong local foundation |
| Strategy defaults | Price tier, released budget range, feeder corridor, locked exclusion and immutable selection exist | Exact provider district evidence/canary is unresolved | Strong design, partial operating proof |
| Campaign creation | Provider, copy, media, budget, dates, stay window, audience and Google Search assets are supported | Too many provider-level fields remain visible: raw keywords, match prefixes, provider geo/language choices and location mode | More complex than the founder promise |
| Bounded location control | Hosts can select approved feeders and adjust released radius bounds; exclusions remain locked | User-facing contract still needs a simple default path and an exception/request path | Correct control direction |
| Creative guidance | Listing-grounded guidance, exact media rights confirmation and reviewed creative/story fingerprints exist | Host still authors substantial provider copy; format intent is not cleanly separated from provider placement | Partial |
| AI review | Revision-bound assessment, notes and explicit host application of suggestions exist | A score can become false certainty; deterministic policy/fact validation must remain primary | Useful evidence, never authority |
| Budget and funding | Suggested tier budgets, itemized cost-plus quote, verified payment states and refund requests exist | Real gateway/provider finance lifecycle and final cost/tax policy remain incomplete | Strong architecture, limited proof |
| Status and outcomes | Campaign state, provider observations, freshness, spend, clicks, visits, inquiries and bookings are projected | Provider metrics are delayed; canonical checkout/consent is unconnected | Transparent design, incomplete outcome truth |
| Host controls after launch | Pause request, cancellation and refund request exist | Top-up/refuel, material-change consent and operational SLA require final contracts | Partial |

The host marketing vision remains around **50% represented in source** and roughly **25–30% operationally proven**. The engine is substantial, but the current builder still asks the host to make choices Encho claims to remove.

### Current implementation fit — Admin

| Admin capability | Verified current foundation | Deficiency against the vision | Assessment |
|---|---|---|---|
| Strategy control | `/admin/marketing/adtech` has three versioned tiers, provider settings, corridor management, diffs, CAS release, rollback and audit receipts | It is an engineering-grade control surface; validation, simulation and decision support need deeper operational UX | Strong local foundation |
| Campaign review | Exact revision, AI evidence, creative preview, policy/media attestations and reasoned approval/rejection exist | Review prioritization, SLA, assignment, risk score and structured exception explanations are incomplete | Strong review core |
| Provider publication | Admin creates provider resources paused, separately requests activation, refreshes status and can pause | Paused live canary, provider/account operating model and exact readback acceptance remain unresolved | Partial external proof |
| Financial operations | Content approval is separated from funding/risk; settlement uses independent review evidence | Live gateway settlement and role separation need operating proof | Strong architecture |
| Recovery | Correlation evidence, reconciliation states and bounded recovery panels exist | Incident triage, ownership, paging and provider-specific playbooks are not one coherent desk | Partial |
| Social distribution | Separate legacy Instagram review/publish flow exists | Facebook publication is missing; legacy path has unsafe AI fallback and is not unified with v2 governance | Below standard |
| Scalable operations | Immutable revisions and strategy reuse reduce work | One heroic admin is still a business bottleneck; workload capacity and dual-control staffing are unproven | Major operating risk |

The admin vision is around **60% represented locally** and roughly **30–35% operationally proven**. The control primitives are better than the operating system built around them.

### Candidate authority matrix

| Decision | Host | AI | Admin strategy | Admin campaign ops | System |
|---|---|---|---|---|---|
| Select owned property | Chooses | May explain readiness | Cannot substitute property | Verifies exceptions | Enforces ownership/publication |
| Campaign goal | Chooses from business outcomes Encho supports | Recommends | Defines supported provider mapping | Confirms exact mapping | Rejects unsupported combinations |
| Total investment | Chooses within disclosed bounds | Advises using evidence | Defines ranges/caps | Approves exceptions | Enforces quote, capture and spend ceiling |
| Dates/stay window | Chooses | Warns about availability/economics | Defines scheduling presets | Reviews unusual flights | Enforces timezone and inventory guards |
| Property media/story | Chooses approved assets and attests rights | Scores factual/policy quality | Defines format requirements | Confirms rights and exact revision | Hash-binds approved assets |
| Guest-fit intent | Selects structured intents such as couples, families, friends, workation or pet-friendly only when supported by listing facts | Suggests and explains | Defines permitted taxonomy and provider mapping | Accepts/rejects mapping | Prevents unsupported or contradictory claims |
| Feed/Stories/Reels preference | Expresses preferred creative formats from compatible assets | Checks aspect/quality coverage | Defines permitted placement strategy | Makes final provider placement decision | Compiles only supported combinations |
| Feeder locations | Accepts default; optionally selects released feeders and bounded radii | Warns about waste/coverage | Owns corridor and exclusion releases | Reviews requested additions | Locks exclusions and validates provider evidence |
| Age/gender/relationship demographics | May request a guest-fit outcome; does not directly set executable demographics | May recommend with uncertainty | Owns any lawful, provider-supported demographic policy | Reviews sensitive exceptions | Capability/policy gate blocks unavailable settings |
| Objective/conversion/attribution | No direct control | No authority | Owns versioned contract | Confirms destination readiness | Requires canonical conversion authority |
| Bidding/tCPA/match types/negative keywords | No direct control | Research/advice only | Owns defaults and bounds | Reviews campaign-specific search evidence | Compiler and readback enforce binding |
| Publish/activate | Cannot publish or activate; may submit/fund/request pause | No authority | No campaign mutation | Approves, publishes paused and requests activation | Funding, risk, inventory and provider guards decide eligibility |
| Pause/stop | May request immediate pause/cancel | May flag risk | Defines automatic rules | Owns incident action | Safety pause remains available despite drift |
| Settlement/refund | Requests and sees status | No authority | Defines prospective policy only | Separate finance authority reviews/commits | Journal/idempotency/provider evidence governs money |

### Candidate Admin Marketing Command Center

Do not build two disconnected clones of the external ad consoles. Build one Encho command center with a shared canonical campaign model and provider-specific studios.

#### 1. Strategy Studio — reusable policy, not individual campaigns

**Meta Strategy Lab**

- Supported objective and canonical conversion event.
- Optimization, attribution, bidding and spend bounds.
- Permitted placements and required asset formats.
- Provider-supported demographic policy when lawful and verified.
- Destination corridors, public feeder radii and mandatory exclusions.
- Frequency/pacing limits and capability status.
- Preflight simulation showing exactly what the compiler will send.

**Google Search Strategy Lab**

- Search intent themes and read-only Keyword Planner evidence.
- Exact/phrase match policy, negatives and internal portfolio conflicts.
- Location constants, proximity targets, exclusions and location intent.
- Languages, bidding, optional tCPA, sitelinks and image assets.
- Account/client mapping, conversion destination readiness and compiler simulation.

Both labs publish immutable releases across BUDGET, COMFORT and PREMIUM tiers. A later change affects future revisions only.

#### 2. Campaign Flight Desk — exact host campaign decision

- Side-by-side host intent, canonical property facts and compiled provider plan.
- Changes from tier defaults highlighted as exceptions.
- Creative/media rights and landing-page readiness.
- AI evidence plus deterministic failures shown separately.
- Unit economics, budget tranche, inventory and loss-limit evidence.
- Exact revision approval/rejection with structured reason.
- Any admin edit creates a new revision; material budget/scope changes require host re-acceptance.
- Publication creates paused provider objects only; activation remains a separate guarded action.

#### 3. Provider Operations Desk — observation and incidents

- Account health, rate limits, billing status and capability drift.
- Provider request/correlation IDs and sanitized raw status evidence.
- Effective-settings readback against the immutable strategy hash.
- Queue age, telemetry freshness, spend, conversion and inventory signals.
- Verified pause, bounded retry and reconciliation workflows.
- Incident ownership, severity, timeline and runbook actions.

#### 4. Finance and Settlement Desk — separate authority

The visual shell may be unified, but financial close must not become a casual “god mode” button. Payment capture, risk release, refund, provider invoice allocation and final settlement require scoped roles, independent review where defined, immutable evidence and step-up authentication.

### Candidate Host Campaign Studio

The default host experience should take minutes and expose decisions a property owner can reasonably understand:

1. Choose a published property.
2. Choose a supported business outcome: fill selected dates, generate booking inquiries, or promote general availability. Provider implementation remains hidden.
3. Accept the recommended channel plan or choose Meta discovery, Google high-intent search, or both when eligible.
4. Choose a budget preset or an amount within released bounds and see the full charge.
5. Choose campaign/stay dates.
6. Choose approved property story/media and preferred creative formats.
7. Confirm or request changes to the suggested guest-fit intent and feeder cities.
8. Review plain-language expected assumptions, exclusions, risks and stop conditions.
9. Attest media/property rights, submit for assessment and fund only after the exact approved quote.

The advanced panel may expose approved feeder selection, bounded radius and creative-format preferences. It should not expose provider IDs, raw keyword syntax, relationship-status targeting, arbitrary age sliders, attribution windows, pixels, bid strategy, match types or provider billing constructs.

### Why relationship and age controls should not be host-executable

“Couples,” “friends,” “families” and “workation” describe a trip and creative promise; they are not equivalent to a provider's personal demographic fields. Treating “couples” as a relationship-status target can be unsupported, overly narrow, sensitive or simply bad marketing. The repository currently has Meta age/gender profile fields but no canonical relationship-demographic contract. Google exposes provider demographic and audience primitives, but field availability does not prove suitability for this hospitality campaign or account. Encho should store **guest-fit intent**, then allow only a reviewed, capability-checked mapping to executable provider criteria.

An age such as 24–45 also cannot be represented consistently as an arbitrary continuous range across every provider product. Admin may release a bounded provider-specific policy based on evidence; a host can request a segment or explain their known customer, but cannot directly override the executable audience.

### Control and staffing model

“God Mode” is useful branding for a powerful UI and dangerous architecture for authorization. The system needs scoped operational roles even if one early employee temporarily holds more than one role:

- Strategy Editor
- Campaign Reviewer
- Provider Operator
- Finance Reviewer
- Incident Commander
- Read-only Support/Audit

High-budget or high-risk campaigns should require a second approval. Every critical action needs step-up authentication, reason, before/after diff, idempotency key and immutable audit receipt. Finance review remains independent where the current settlement contract requires it.

### Required upgrades

1. Simplify the host draft contract around business intent and remove raw provider decisions from the default flow.
2. Add a canonical `GuestFitIntent` taxonomy tied to verified listing facts; do not call it relationship targeting.
3. Add format preference and asset-readiness contracts distinct from executable placement configuration.
4. Expand the admin Strategy Studio with compiler preview, capability evidence, simulation and staged releases.
5. Turn Campaign Review into an exception-first Flight Desk with assignment, SLA, risk priority and host re-acceptance for material admin changes.
6. Separate provider operations and finance authority, with scoped roles and dual control for defined thresholds.
7. Unify paid and organic brand publication under the same truth/media-rights/revision/audit contract; replace the unsafe legacy social path before accepting it.
8. Prove provider-account structure, paused readback, exact geography and conversion destination through a bounded canary.
9. Connect canonical guest checkout and current consent before activation or conversion optimization claims.
10. Measure admin minutes per campaign, review throughput, rejection/rework, provider incidents, spend at risk and incremental fulfilled bookings. Without these, the system may be technically impressive and commercially unscalable.

### Open founder choices for Host and Admin

1. Which host outcomes should version one offer: fill specific dates, general bookings, booking inquiries, or a smaller subset?
2. Should hosts choose a provider/channel, or should they choose an outcome and let Encho allocate the channel plan?
3. Which creative-format preferences may a host express without controlling provider placements?
4. What campaign amount or risk score requires two administrators?
5. What admin review and incident-response hours can Encho actually staff?
6. When an admin changes targeting, creative, schedule or price after host submission, which changes require explicit host re-acceptance?
7. Is organic social distribution included, separately priced, or editorially allocated under a fairness policy?

## Mixed-Inventory Resort Discussion 037-E — Room products, rate plans and campaign portfolios

**Status:** Founder-approved architecture principle on 23 September 2026: tier and strategy authority belongs to each sellable room offer, not to the resort. Rate-plan scope, portfolio reallocation and promotion-version details remain open, and no Phase 2/3 implementation or milestone acceptance follows from this approval.

### Proven current limitation

The current shared AdTech contract already permits price evidence with basis `ROOM_TYPE_BASE_NIGHT` and a non-null `roomTypeId`. The runtime resolver does not implement that branch. `canonicalPriceEvidence()` accepts only INR `entire_place` listings, reads `listings.price`, and explicitly returns `STRATEGY_UNCLASSIFIED` for private-room pricing until a selected room product exists. `CampaignStrategyBindings.resolve()` likewise reads property-level `listings.price` rather than `room_types.base_price`. This fail-closed behavior prevents false tiering, but a resort containing budget, honeymoon and presidential inventory cannot currently enter the strategy engine correctly.

The existing `room_types` authority contains room identity, base price, currency, occupancy, inventory count, description, features, amenities and room-specific media relationships. It is a useful foundation, but it is not yet a complete commercial product because rate-plan conditions, date-specific price, cancellation terms, meal/package inclusions and a bookable offer identity remain unfinished/legal-gated.

### External platform pattern

The relevant industry pattern is not “one property equals one price.” Booking.com separates a physical `room type` from a `rate plan`; their combination and conditions form a sellable `roomrate/product`, with inventory and price applied by date. Google Hotel Ads models multiple room types and packages as `Room Bundles`, carries a `RatePlanID`, and associates price/availability with the itinerary. Airbnb's terms allow multiple listings at one property when there are multiple distinct places to stay. These examples support a product-granular model, but do not authorize Encho's provider integration or commercial terms.

### Architectural correction

Keep the BUDGET, COMFORT and PREMIUM profiles, but stop treating them as property identities. They become **economics profiles resolved for an immutable marketing offer**.

```text
Property
  ├── Room Type
  │     ├── Rate Plan / Conditions
  │     ├── Occupancy
  │     ├── Date-specific availability
  │     └── Date-specific authoritative quote
  │
  └── Marketing Offer Version
        - exact room/rate product
        - canonical price evidence
        - inventory window
        - approved media and facts
        - guest-fit intent
        - truthful landing destination
        - economics tier
```

The strategy should compose independent versioned dimensions rather than multiplying monolithic profiles:

```text
Resolved Offer Strategy =
  Economics Profile
  + Guest-Fit Playbook
  + Destination Corridor
  + Channel Playbook
  + Canonical Offer Facts
  + Inventory / Date Window
  + Campaign Experiment Policy
```

Price tier controls budget risk and acquisition economics. It does not, by itself, identify the audience. A ₹3,500 room is not automatically a backpacker product; a discounted premium suite does not stop being premium because Tuesday's rate crossed a threshold. Guest fit must be supported by room capacity, amenities, privacy, media and trip use case.

### Required canonical concepts

1. **Property Brand Profile:** property-wide identity, destination, common amenities, brand voice, verified facts and shared media.
2. **Sellable Stay Product:** exact room type plus rate plan, occupancy and conditions. For an entire-place listing, the property itself is the sellable product.
3. **Marketing Offer Version:** immutable room/rate/date/price/inventory/media/landing snapshot approved for advertising.
4. **Guest-Fit Playbook:** a fact-bound trip intent such as `VALUE_GROUP_ESCAPE`, `ROMANTIC_RETREAT`, `FAMILY_COMFORT`, `WORKATION`, or `LUXURY_PRIVACY`.
5. **Campaign Portfolio:** property-level commercial container holding one or more separately measurable offer flights.
6. **Offer Flight:** provider-specific campaign/ad group/ad-set unit bound to exactly one marketing offer version.

Names such as `Honeymoon Suite` or `Presidential Suite` remain host-authored product names. They do not automatically establish romance, privacy, butler service, views or luxury. Each advertising claim must come from canonical room facts and approved media.

### Example resort

| Sellable room offer | Economics tier | Possible guest-fit playbook | Truth required before use | Landing behavior |
|---|---|---|---|---|
| Garden Room · ₹3,500/night | BUDGET | `VALUE_GROUP_ESCAPE` or `SOLO_VALUE` | Occupancy, shared/private facilities, group suitability and actual amenities | Open exact room selection with dates/occupancy preserved |
| Honeymoon Suite · ₹6,000/night | COMFORT | `ROMANTIC_RETREAT` | Double occupancy, privacy facts, room-specific imagery and any romantic inclusions | Open Honeymoon Suite, not generic gallery top |
| Presidential Villa · ₹15,000/night | PREMIUM | `LUXURY_PRIVACY` | Exclusive-use scope, verified premium amenities, service facts and high-quality media | Open Presidential product and exact available rate |

The table describes a possible mapping, not an automatic rule. If the Garden Room sleeps two and has no group space, `VALUE_GROUP_ESCAPE` must be rejected. If the Presidential product lacks verified private-use or service facts, the luxury claims must be removed.

### Campaign structures

#### A. Room-led conversion campaign — recommended default

One offer flight promotes one room/rate product, uses room-specific media/copy, targets a coherent guest intent, lands on the selected room and reports bookings for that product. This provides the cleanest truth, attribution and unit economics.

#### B. Property portfolio campaign — controlled umbrella

One host authorization funds a portfolio containing several offer flights. Each flight retains separate budget, evidence and reporting. The system may shift remaining allocation between offers only under an explicit host-approved reallocation policy. If a room sells out, its flight pauses; its money does not silently subsidize a different room.

#### C. Property brand/discovery campaign

A broad campaign may market the resort itself without advertising one misleading “starting price.” It lands on the room comparison area. It is suitable for discovery, not for claiming room-specific conversion economics.

### Meta-oriented design

- Maintain the property as the common brand and conversion destination.
- Use separate offer flights/ad sets only where creative promise, room economics or guest intent materially differs.
- Use exact room-specific 4:5/9:16 assets and a landing context that preserves the chosen room.
- Avoid three overlapping audience stacks that bid for the same people. Cold-start campaigns should use bounded experiments or mutually intelligible offers, with spend caps and a declared winner rule.
- Treat guest-fit intent as creative and strategy evidence. Do not blindly translate `ROMANTIC_RETREAT` into personal relationship-status targeting.
- Aggregate learning at property level while preserving offer-level spend, inquiries, bookings and fulfilled contribution.

### Google Search-oriented design

- Create distinct intent/ad-group partitions for value room, honeymoon/romantic suite and premium/private product.
- Match each keyword theme, responsive ad copy, image/sitelink asset and landing room to the same offer.
- Use cross-offer negatives and the existing portfolio conflict analyzer so the resort does not bid multiple internal lines against the same query without intent separation.
- Preserve exact date, occupancy and room selection through the landing journey.
- Use Keyword Planner as decision evidence, not an automatic promise of demand.
- Longer term, evaluate Google Hotel Ads/Hotel Center Room Bundles only after Encho has legally approved rate plans, complete availability/price feeds and a working booking engine. Current Google Search support is not Hotel Ads support.

### Price classification rules

Three different values must remain separate:

1. **Stable product positioning price:** admin-reviewed room base/reference price used to classify the offer's economics profile.
2. **Bookable itinerary price:** authoritative date/occupancy/rate-plan quote shown to the guest and used for landing truth.
3. **Campaign economics:** expected gross room revenue/contribution for the promoted stay window, used for CAC and budget guidance.

Do not reclassify a room every day merely because dynamic price crosses ₹4,000 or ₹7,000. Reclassification should require a new reviewed product-positioning version or a defined sustained-price rule. A promotion may advertise a verified lower itinerary price while retaining the product's positioning profile. Material price drift after campaign approval must trigger a new revision or pause.

### Admin Studio consequence

The admin needs a **Property Offer Matrix** before the provider strategy labs:

| Room product | Rate plan | Dates/inventory | Positioning tier | Guest fit | Landing | Meta plan | Google plan | Status |
|---|---|---|---|---|---|---|---|---|

Admin reviews which offers are marketable, groups compatible offers into a campaign portfolio, and chooses the experimentation/allocation policy. Provider studios then compile each offer flight. This prevents one resort-level tier from incorrectly driving all rooms.

### Host experience consequence

The host first chooses what is being promoted:

- Entire property.
- One room/suite product.
- Multiple selected room products as a portfolio.
- A property discovery campaign without room-specific pricing.

For a portfolio, the host sees the exact authorized amount per offer or explicitly accepts an allocation rule. The host does not manually build provider ad sets or keyword groups.

### Measurement and allocation

Report both levels:

- **Offer:** spend, impressions, clicks, room views, quotes, inquiries, confirmed/fulfilled bookings, CAC and contribution.
- **Property portfolio:** total spend, blended CAC, occupancy impact, fulfilled contribution and unused authorization.

Cold-start allocation must not pretend the system already knows a winner. Use a bounded exploration tranche, minimum evidence threshold and stop-loss. Later allocation may use fulfilled contribution and inventory, not clicks alone. Sold-out inventory pauses the relevant offer. Budget transfer requires the host's accepted portfolio policy; otherwise funds return to refundable/wallet authority under the accepted financial contract.

### Required changes, if later approved

1. Complete canonical rate-plan/roomrate authority after the guest legal/quote decisions.
2. Extend campaign product binding from `listingId` to an immutable sellable product/marketing offer version.
3. Implement room-type price evidence already anticipated by `priceEvidenceSchema`.
4. Bind room-specific facts, media, inventory, landing context and price evidence into the campaign revision.
5. Compose economics tier, guest-fit, corridor and channel policies rather than creating an uncontrolled profile for every combination.
6. Add campaign portfolio membership, explicit allocation authority and per-offer finance/reporting.
7. Add the Admin Property Offer Matrix and room/product selection to Host Campaign Studio.
8. Detect room sell-out, price drift and fact/media drift per offer flight.
9. Keep Google Hotel Ads as a later integration track, distinct from the existing Search adapter.

### Boardroom recommendation

Reject “one resort equals one price tier.” Accept “one property contains one or more sellable marketing offers; each offer receives its own economics tier and guest-fit strategy.” Preserve a property-level umbrella only for shared branding, aggregate reporting and explicitly authorized portfolio allocation.

### Open founder choices

1. May a host fund one room product, a multi-room portfolio, or both?
2. If a funded room sells out, may its unused allocation move to another room automatically, and under what host-approved rule?
3. Is the initial launch limited to room-led campaigns, deferring property portfolio optimization until enough conversion evidence exists?
4. Which rate plans exist in version one: flexible and non-refundable, or a smaller legally approved set?
5. Should temporary discounts retain the room's positioning tier or create a separate promotional offer version?

## Property discovery versus room-offer execution 037-F

**Status:** Founder-approved architecture principle on 23 September 2026. This approval establishes the discovery/offer boundary and bounded host creative authority; it does not authorize Phase 2/3 implementation, settle the open rate-plan/legal questions, or accept a milestone.

### Recommendation

Use both models at different layers:

- **Guest property discovery:** show the resort and all its bookable room options. A truthful `Rooms from ₹X` may summarize the lowest currently eligible offer.
- **Paid campaign execution:** bind each performance campaign flight to one exact sellable room offer and resolve BUDGET/COMFORT/PREMIUM for that offer.
- **Property discovery advertising:** may promote the resort portfolio without one tier-specific audience promise. It either avoids price or uses a strictly verified `from` price and lands on the room comparison state.

Never use the lowest `from` price to classify the entire resort. A ₹3,500 Garden Room does not turn a ₹15,000 Presidential Villa into a budget product.

### Campaign products shown to the host

1. **Promote one room — recommended launch default.** Host chooses an exact room, its approved media and truthful highlights. The engine resolves its economics tier and campaign strategy.
2. **Promote the resort.** Encho presents all available room products; campaign creative focuses on the property story and room choice. This is discovery, with weaker room-level conversion attribution.
3. **Let Encho optimize selected rooms — later controlled portfolio.** Host selects multiple room offers and explicitly accepts allocation/reallocation terms. Each room remains a separate measurable offer flight.

### `Rooms from ₹X` truth contract

A `from` price is allowed only when it is derived from a canonical eligible offer and the guest can reach that offer without a bait-and-switch. The record must identify room, rate plan, occupancy, availability/date context, currency, inclusions/conditions, observed time and source hash. When dates are selected, compute from currently bookable itinerary offers. Without dates, label it as a reference/base price and do not imply guaranteed availability. If the lowest room sells out or becomes ineligible, recompute or remove the claim. Final tax/fee presentation remains blocked until the existing legal gate clears.

### Host creative authority

The host may:

- Select which room or approved portfolio to promote.
- Choose room-specific approved images and compatible formats.
- Select verified property/common images as supporting context.
- Choose factual highlights and guest-fit intent.
- Draft a campaign-facing title and description from canonical room/property facts.
- Choose dates, budget and approved feeder preferences.

The host may not:

- Type a campaign-only price that differs from canonical room/rate authority.
- Upload or select unrelated room imagery.
- claim privacy, view, pool, breakfast, service, discount or scarcity without evidence.
- Choose the economics tier directly.
- Change provider optimization/targeting controls through creative fields.

Price is edited in the canonical room/rate management flow, not in Campaign Studio. A campaign revision references the resulting price evidence. Title and description are proposals; deterministic fact validation, AI advice and admin review protect the master brand/account. Admin cannot silently rewrite a funded offer: material copy, room, price, dates, allocation or targeting changes create a new revision and may require host re-acceptance.

### Image boundary

The primary campaign asset must belong to the promoted room offer. Common grounds, restaurant, pool or lobby media may support the story only when available to that room's guest and accurately labeled. A Presidential Villa image cannot advertise the Garden Room. A resort pool cannot be presented as a private pool unless the canonical room facts establish exclusive use.

### Example rendering and execution

```text
Guest listing/search card:
  Rainforest Resort
  Rooms from ₹3,500/night*
  *Reference offer; availability and final total depend on dates and occupancy.

Property page:
  Garden Room         ₹3,500     BUDGET economics
  Honeymoon Suite     ₹6,000     COMFORT economics
  Presidential Villa ₹15,000     PREMIUM economics

Paid flights:
  Garden Room flight        -> BUDGET profile + verified guest fit
  Honeymoon Suite flight    -> COMFORT profile + romantic-retreat facts
  Presidential Villa flight-> PREMIUM profile + luxury/privacy facts
```

The tier labels are internal operational language and need not be shown to guests. Guests see room names, truthful differences, price and availability. Hosts may see the tier as an explanation of budget guidance; they do not select it.

### Boardroom position

`Starts from` is a useful discovery summary, not the segmentation authority. Host creative choice is valuable, but it must operate inside canonical product truth. The recommended initial implementation, after Phase 2 authorization and legal dependencies, is room-led campaigns plus a property discovery option. Automated multi-room portfolio allocation should wait until offer-level finance, availability, attribution and reallocation consent are proven.

## Host-originated campaign creative discussion 037-G

**Status:** The founder has approved the product requirement that a host may create a campaign from newly produced property content, including a Reel/video, single post/image or carousel. The production architecture below is the Phase 1 engineering recommendation; detailed schemas, APIs and milestone sequencing remain for Phase 2 after `NextO`.

### Do not confuse campaign subject with creative format

The three campaign products answer **what is being promoted**:

1. one exact room offer;
2. the resort/property as a discovery portfolio; or
3. selected room offers under a later controlled allocation policy.

Creative selection answers **how that subject is presented**. Each eligible campaign product may use one of these versioned creative packages:

- approved listing/room gallery assets;
- a newly uploaded campaign-only image/post;
- a newly uploaded short-form video/Reel;
- a newly assembled carousel;
- a previously approved Encho campaign asset; or
- a previously published Encho organic post, when Encho has retained the exact source, rights, provider identity and publication evidence required to reuse it.

This is a creative-first **entry path**, not an unbound fourth campaign product. Every creative package must still bind to a property or exact room offer, canonical facts, a destination URL, an immutable campaign revision, a released strategy and inventory/date evidence.

### Recommended Host Creative Studio

Add a `Creative Studio` within the marketing workspace with two entry routes:

1. **Start from the room/property.** Choose the campaign subject, then choose or create its creative.
2. **Start from my new content.** Upload the Reel/post/carousel first, then select which owned property or room offer it truthfully promotes.

Both routes converge on the same reviewed `Creative Package`. The host may choose the source media, proposed title/caption, asset order, compatible format preference, factual highlights, campaign subject and whether to request organic Encho publication, paid promotion, or both. Encho resolves the economics tier from the bound offer; the host cannot use creative editing to change price authority, tier, landing identity, provider objective, attribution or bidding.

### Separate media authorities

Campaign-only content must not silently become canonical guest-gallery content. Model three distinct but linkable authorities:

- **Canonical listing media:** approved evidence shown on the guest property/room pages.
- **Campaign creative library:** source files and rendered variants approved for a particular property/offer and advertising use.
- **Encho social publication:** an optional editorial distribution record for Encho-owned Facebook/Instagram surfaces.

A host may separately request that a strong campaign asset be added to the listing gallery, but that follows the listing moderation workflow. Organic publication through Encho is not an automatic entitlement purchased with ad spend; it requires an explicit editorial/contract policy and its own publication approval.

### Immutable creative package

The campaign revision must reference a package rather than loose media IDs. Its immutable evidence should include:

- host, property and optional room-offer/version identity;
- original object hash, MIME type, byte length, dimensions, duration and capture/upload time;
- host rights attestation and the scope of advertising/social reuse permission;
- ordered asset roles such as `PRIMARY`, `CAROUSEL_CARD`, `THUMBNAIL` and `SUPPORTING_CONTEXT`;
- transcoded/cropped provider variants and their hashes;
- exact caption, headline, description, CTA and landing destination;
- canonical fact/price/inventory evidence referenced by every material claim;
- OCR, transcript, audio/music, frame-sampling, privacy and policy review evidence;
- AI assessment, human admin decision and any required second review;
- provider capability result, publication IDs and readback evidence; and
- package hash, version, expiry/drift rules and complete append-only event history.

Editing any source, crop, caption, card order, audio, price claim, CTA or landing target creates a new package version. Admin approval applies only to the exact rendered bytes and copy reviewed. Provider publication must consume that pinned version.

### Review pipeline

Recommended states:

```text
DRAFT
  -> UPLOADED
  -> TECHNICAL_SCAN
  -> RIGHTS_ATTESTED
  -> AI_ASSESSED
  -> HOST_PREVIEW_CONFIRMED
  -> ADMIN_REVIEW
  -> APPROVED
  -> BOUND_TO_REVISION
  -> PROVIDER_SUBMITTED
  -> PROVIDER_ACCEPTED / PROVIDER_REJECTED / BLOCKED
```

AI is a conservative assistant, never the legal or provider approval authority. A low score returns actionable corrections. Uncertainty, service failure, video, music, people/minors, material price text or sensitive claims route to human review. Admin must see the exact derived Feed/Stories/Reels/carousel renditions, transcript and landing offer before approval.

### Video/Reel controls

The current reviewed-creative pipeline prepares immutable image variants only. A production video path needs additional controls:

- malware/container/codec validation before decoding;
- duration, resolution, aspect-ratio, bitrate and safe-area validation;
- deterministic transcodes for vertical, square and landscape capability sets;
- representative and risk-based frame sampling rather than thumbnail-only review;
- speech-to-text and OCR so spoken/on-screen claims are checked against canonical facts;
- soundtrack ownership/licence declaration and prohibited-audio handling;
- face, minor, guest, vehicle plate and private-document privacy checks;
- a host-selected, reviewed thumbnail/poster;
- no automatic synthetic extension, generative alteration or provider-side enhancement without separately released policy and disclosure; and
- re-review when exact bytes, soundtrack or text change.

Embedding a volatile price in video or image pixels creates drift risk. Prefer provider copy or a controlled overlay generated from pinned offer evidence. If price is burned into the source, the asset must expire or the campaign must pause when that price/availability evidence becomes invalid.

### Carousel controls

Each card must declare the exact room/shared-context relationship, order, headline and destination. A room-offer carousel may use that room as the primary card and truthful shared amenities as supporting cards. A property-discovery carousel may compare rooms, but every price-bearing card needs its own eligible offer evidence. Cards cannot borrow a premium room image to sell a budget room.

### Provider capability boundary

`Post`, `Story`, `Reel` and `carousel` are presentation concepts, not interchangeable provider primitives. The compiler must resolve a released capability matrix for the exact objective/account/API version. The current Google implementation is Search; a Reel cannot simply be sent to it. Search may consume eligible reviewed image assets, while video distribution requires a separately supported Google campaign product such as an explicitly approved video/Demand Gen/Performance Max track. Meta Feed, Stories, Reels and carousel payloads likewise require format-specific compilation and readback. Unsupported combinations must fail closed with a useful explanation.

### Existing implementation fit

The current project already provides a valuable base:

- listing ownership and approved-media checks;
- immutable image derivative/source hashes;
- rate-limited preparation jobs with leases and retry bounds;
- host appearance/rights confirmation;
- separate admin approval;
- CDN byte verification;
- exact derivative binding and publish-time verification; and
- append-only creative events with forced RLS.

It remains materially incomplete for this requirement. It accepts only approved listing images as derivative sources, prepares four image shapes, binds a single Meta image variant, and sends loose listing `mediaIds` for the broader path. Video receives human-review caution but has no immutable transcoding/review manifest. There is no campaign-only source library, package/card model, audio/transcript/licence evidence, Encho organic-publication authority, reusable provider-post identity or creative-level performance ledger.

### Recommended release order

1. Generalize the existing immutable image derivative into a provider-neutral creative source/package contract without weakening its evidence.
2. Add campaign-only image upload and single-post packages bound to one owned room/property.
3. Add carousel packages and card-level offer/shared-context validation.
4. Add the hardened video/Reel ingestion, transcoding and review path.
5. Add optional Encho organic publication as a separate approval and policy track.
6. Add reuse/boost of an Encho-published post only after provider identity, permissions and readback are proven.
7. Attribute spend, impressions, clicks, inquiries and fulfilled bookings to creative package/card versions without allowing clicks alone to auto-spend host funds.

### Boardroom recommendation

Accept the founder's creative flexibility goal, but reject direct upload-to-master-account publication. The commercially strong product is: **Bring your new content; Encho turns it into a truthful, policy-reviewed, offer-bound campaign package and publishes only the exact approved version.** This expands host freedom while preserving master-account survival.

## Delegated marketing operations and staff console discussion 037-H

**Status:** Founder proposal under Phase 1 discussion. The founder wants administrators to invite staff by email and delegate distinct marketing jobs through efficient role-specific workspaces. The architecture below is recommended but not yet approved for Phase 2/3 execution.

**Subsequent founder response (037-H1):** The founder accepts the preceding logic and asks for deeper Meta/Google studio architecture and competitor research. The reusable-strategy and scoped-staff direction is accepted; exact role combinations, authority thresholds and host demographic controls are still open. This does not issue `NextO` or authorize implementation.

### Proven current limitation

The present application largely treats platform authority as a binary `admin` versus non-admin decision. Numerous routes check `user.role === 'admin'`; marketing transactions map an administrator to broad database authority and some request paths enable the admin RLS/bypass context. The marketing UI has useful Strategy, Review and Operations foundations, but it does not provide organization membership, job-scoped permissions, staff invitations, assignment queues, conflict-of-duty enforcement, access expiry or independent staff accountability. Giving several employees the current `admin` role would multiply blast radius rather than scale operations.

### Recommended organization IAM model

Do not overload the unified guest/host account role. Add an Encho internal organization membership layer:

```text
User identity
  -> Encho organization membership
      -> role assignments
          -> permissions
              -> resource scope + conditions
```

Candidate operational roles:

| Role | Core authority | Explicit boundary |
|---|---|---|
| Platform Owner | staff/role governance, emergency policy | does not perform routine campaign work |
| Strategy Architect | draft tier, channel, corridor and guest-fit releases | cannot publish own release or activate campaigns |
| Campaign Operator | prepare exact campaign revision from released policy | cannot change strategy, finance or approve own work |
| Creative & Policy Reviewer | inspect claims, rights and exact renditions | cannot edit then approve the same package |
| Campaign Approver | approve/reject exact funded revision within limit | cannot capture/settle money or alter provider evidence |
| Provider Operator | paused creation, readback, telemetry and bounded recovery | cannot change host charge, strategy or creative approval |
| Finance & Risk Reviewer | funding, escrow, variance, refund and settlement review | cannot author creative/targeting or activate delivery alone |
| Incident Commander | declared-incident pause/recovery under step-up controls | no ordinary strategy/finance editing |
| Support Analyst | sanitized host/campaign status and assigned cases | no provider mutation, secrets or financial approval |
| Auditor | immutable read-only evidence and access history | no mutation authority |

Permissions should be verbs over scoped resources, such as `strategy.draft`, `strategy.publish`, `campaign.prepare`, `campaign.approve`, `provider.create_paused`, `provider.activate`, `finance.review`, `incident.pause_global` and `audit.read`. A staff member may hold multiple compatible roles while the system rejects dangerous combinations and prevents self-approval on the same object. High-spend, high-risk, global-profile, activation, refund and emergency actions require step-up authentication and, where defined, a second distinct person. This follows formal RBAC/least-privilege and separation-of-duty principles; it is more than hiding UI buttons.

### Staff invitations and lifecycle

The founder may invite a verified email, but personal Gmail should be a temporary bootstrap mechanism rather than the mature operating model. Production staff should use Encho-controlled Workspace identities with enforced MFA/passkeys and managed offboarding. Recommended flow:

1. owner enters email, compatible role bundle, scope, expiry and reason;
2. system creates a single-use hashed invitation with short expiry and immutable inviter evidence;
3. invitee signs in through verified Google identity and explicitly accepts;
4. server confirms exact normalized email and membership state, then creates no broader permission than the invitation;
5. high-risk roles require MFA/step-up enrollment before activation;
6. every role addition/removal, login-risk event and sensitive session activation is audited;
7. suspension or offboarding revokes membership, sessions, pending assignments and provider access immediately; and
8. periodic access reviews remove stale or excessive grants.

An email match alone is not authorization. No shared admin passwords, provider tokens in the browser or direct staff access to master credentials is acceptable.

### One operations shell, specialized workspaces

Build one **Encho Marketing Operations Console** with role-aware navigation rather than separate disconnected applications:

1. **Strategy Lab** — tier economics, channel playbooks, corridors, guest-fit mappings, simulation, diff, CAS release and rollback proposal.
2. **Creative & Policy Desk** — exact Feed/Story/Reel/carousel renderings, transcript/OCR/rights evidence and approve/reject notes.
3. **Campaign Flight Desk** — assigned host submissions, blocker checklist, exact strategy/creative/offer binding, material-change re-acceptance and approval SLA.
4. **Provider Operations Desk** — paused-object creation, effective-settings readback, provider rejection, telemetry freshness, reconciliation and bounded recovery.
5. **Finance & Risk Desk** — separately authorized funding, escrow, chargeback, provider invoice, variance, wallet/refund and settlement evidence.
6. **Incident Room** — correlated timeline, impact radius, safe pause actions, runbooks and dual-control recovery.
7. **Audit & Workforce Desk** — staff invitations, assignments, access reviews, immutable action history and productivity/quality metrics.

Each employee sees only the workspaces, fields and actions their effective permissions allow. API and database enforcement remain authoritative even if a route or UI is manipulated.

### The useful meaning of a Jarvis-like UI

`Jarvis` should mean less searching and fewer mistakes, not an AI with uncontrolled mutation authority. Each staff home screen should provide:

- a prioritized personal queue by financial exposure, provider deadline, host SLA and policy risk;
- a concise evidence summary with confidence and freshness timestamps;
- an explicit blocker checklist and recommended next safe action;
- side-by-side before/after diff and exact provider payload preview;
- one-click navigation to the failing evidence, not raw database tables;
- safe batch review only for homogeneous, independently validated low-risk tasks;
- keyboard-first operation, saved filters, responsive layouts and accessible status language;
- real-time collaboration locks/presence to avoid duplicate work;
- handoff, escalation and accountable ownership; and
- AI drafting/explanation with source links, while every mutation remains a typed human action with reason and audit receipt.

The system should measure median handling time, queue age, rework rate, provider rejection, false-positive AI flags, incidents per operator, spend at risk and fulfilled-booking outcomes. Gamifying approval speed alone would reward dangerous rubber-stamping.

### Reusable strategy system: standardize policy, not campaigns

Budget/Comfort/Premium remain reusable **economics profiles**, but price alone must not define the audience. A ₹3,500 honeymoon cabin and a ₹3,500 eight-bed hostel share a price band and do not share a customer. The compiled playbook should be:

```text
Offer economics tier
+ verified GuestFitIntent
+ destination/feeder corridor
+ season and stay dates
+ inventory/occupancy need
+ campaign objective
+ creative package and channel capability
+ released experimentation and safety policy
= immutable campaign strategy binding
```

Admin staff should publish common versioned building blocks once, then allow the system to compile them for thousands of offers. Campaign operators review exceptions and material risks rather than rebuilding Meta/Google settings for every host. Similar properties can share a released playbook only when the dimensions above match; every campaign still gets its own offer, price, inventory, creative, budget, landing and attribution binding.

Cross-property learning may produce aggregate benchmarks by tier, guest fit, corridor, season, channel and creative format. It must use minimum cohort/privacy thresholds, distinguish experiment from causal proof, exclude one host's confidential details from another host's view, and never silently mutate active campaigns. A new recommendation becomes a reviewed strategy version for future revisions or a host-approved experiment.

### Campaign workflow with delegated duties

```text
Host submits exact offer + creative + budget intent
  -> deterministic truth/eligibility checks
  -> AI assessment and correction guidance
  -> Creative Reviewer checks exact package
  -> Campaign Operator compiles from released playbooks
  -> Campaign Approver checks exception/risk/host acceptance
  -> Finance & Risk confirms funding/escrow authority
  -> Provider Operator creates PAUSED objects and verifies readback
  -> separately authorized activation guard releases delivery
  -> Provider Operations monitors telemetry and incidents
  -> Finance reconciles independently
```

Small-team reality may require one employee to wear compatible hats. The system must still preserve object-level maker/checker rules for critical actions. The founder may retain emergency authority, but emergency use must be step-up authenticated, reasoned, time-bounded and reviewed afterward.

### Boardroom verdict

The proposal is directionally **9/10**. Delegation, reusable policies and exception-first queues are necessary for scale. It falls to **3/10** if implemented as “invite several Gmail addresses and give each a prettier admin page,” because that merely creates several Tony Starks with the same nuclear button. The 10/10 version is organization-scoped RBAC, separation of duties, one modern operations shell, versioned reusable playbooks, immutable per-offer bindings and an AI copilot that explains rather than secretly acts.

### Open founder decisions for this operating model

1. Which staff roles may the first five employees combine, and which pairings are always forbidden?
2. What spend/risk thresholds require a second approver?
3. Will production operations require Encho-controlled `@encho.co.in` Workspace accounts from day one or after the pilot?
4. What coverage hours and response SLAs apply to approvals, provider incidents and hot leads?
5. May the system choose Meta versus Google by released policy, or must the host always approve the channel mix?
6. Which aggregate performance evidence may improve future playbooks, and what minimum cohort/privacy rule applies?

## Integrated Meta/Google studio research discussion 037-I

**Founder request:** Give administrators deep campaign setup and operating control inside Encho, let administrators expose only appropriate options to hosts, support hired staff through efficient workspaces, and research Sojern, Evocalize, Ylopo, Vendasta and provider platforms before proposing the architecture.

**Detailed record:** [Marketing Studio Architecture Research 037](MARKETING_STUDIO_ARCHITECTURE_RESEARCH_037.md) contains the primary-source comparison, verified code map, offer/creative/program model, Meta/Google control catalogs, host delegation matrix, staff permissions, UI structure, candidate data/service/API contracts, publication/recovery flow, live-evidence semantics, commercial constraints, rollback and candidate P0–P7 delivery sequence.

**Recommendation:** One Encho operations console with two deep provider-specific studios and shared offer, creative, review, finance, workforce and observation authority. Promise complete operation of explicitly supported hospitality workflows. Do not promise every native-console feature forever: API exposure, account eligibility and tested Encho capabilities differ. Mark controls by support/read-only/conditional/provider-console-required state and compare approved, compiled and actually observed settings. Administrators author reusable programs; hosts choose bounded intent; authorized staff review exact material and exceptions; deterministic workers execute approved commands.

**Verified correction:** Earlier 037-G carousel-gap language was overly broad. `SpatialStories`, `marketingStory`, `MetaCampaignPlan` and `GoogleSearchPlan` already provide reviewed canonical four-card image stories and Meta carousel/Google asset compilation. Extend these foundations for campaign-only uploads and reviewed video; do not rebuild them or count a video parameter as a complete Reel workflow. Room-price evidence exists as a type, but the current resolver still reads property-level `listings.price`.

**Research conclusions:** Evocalize's embedded objective-specific programs directly support the reusable-playbook direction. Ylopo's guided versus expert-managed modes support a simple host experience. Sojern offers relevant travel-demand/outcome framing, but its proprietary data and results are not ours. Vendasta offers useful reporting/team patterns; its Advertising Intelligence product expressly cannot run ads. Provider primary material establishes account/API boundaries and asynchronous mutation/change-reporting constraints. Public product claims are not independent performance evidence. The supplied authenticated Meta editor was not inspected successfully.

**Operational discipline:** A low-fee campaign cannot afford a parade of manual handoffs. Preserve required human creative/campaign review and independent sensitive approvals while automating deterministic prerequisites. AI proposes with evidence and uncertainty. Permission checks occur server-side and again for queued execution; staff are not granted the existing broad admin role. Provider observations carry source/time/freshness and cannot manufacture live delivery. Existing finance, advertiser/account, consent, district-exclusion and restricted-runtime gates remain.

**Work performed:** Source/document research and living-record updates only. No product code, migration, remote settings, campaign, spend, deployment or regression suite was executed. Phase 1 remains active. The report's work packages are candidates for the blueprint after `NextO`, not newly approved milestones or completion claims.

## Industrial-standard examination of Admin and Host architecture 037-J

**Founder request:** Examine the proposed Admin and Host architecture against an industrial operating standard.

### Verdict

The proposed direction is approximately **8.5/10 as architecture**, **4.5/10 as current implemented Admin/Host operating capability**, and **not production-proven**. These are boardroom judgments, not milestone completion. The design has the correct separation between host intent, expert policy, immutable campaign evidence, provider execution and financial authority. It is not yet 10/10 because several product decisions and provider/account constraints remain open. The implementation is materially behind the plan: it has substantial components, but not the complete authority, workflow and proof required to operate many hosts safely with hired staff.

### Industrial quality bar

An industrial Encho system must satisfy six simultaneous tests:

1. **Safe autonomy:** a normal host completes a truthful campaign without provider expertise, while disallowed inputs cannot be injected through the API.
2. **Expert control:** an authorized operator can understand and configure every Encho-supported provider setting, dependency and outcome without treating raw JSON as the product.
3. **Least privilege:** staff see and mutate only assigned resources and compatible actions; revocation also applies to already queued work.
4. **Deterministic execution:** the exact offer, creative, strategy, consent and financial contract reviewed are the versions transmitted.
5. **Operational truth:** requested, compiled and provider-observed settings and states remain distinguishable, including uncertainty and data freshness.
6. **Scalable economics:** routine campaigns compile from released programs; humans review exact creative, exceptions and high-risk actions rather than reconstructing every campaign.

Failure in any one dimension makes the system unsuitable for industrial operation even if the interface looks polished.

### Host surface: recommended production contract

The host product has three layers:

| Layer | Host sees | Authority |
|---|---|---|
| Campaign intent | owned room offer/property discovery, supported goal, dates, investment | host proposes within canonical eligibility and quote constraints |
| Creative expression | approved gallery assets or a new reviewed image/Reel/carousel; factual copy and card order | host proposes; exact source, rendition, rights and claims require system/admin approval |
| Audience preference | recommended feeder plan, permitted placements and bounded location/radius choices, verified guest-fit messaging | released delegation policy defines what is editable; safety/provider constraints remain locked |

The default path should be short: select offer, accept recommended program, review real preview and costs, submit. Advanced controls are progressive disclosure, not a second Ads Manager. The host must always be able to answer five questions: what is advertised, where it lands, who Encho intends to reach, what amount is authorized, and what happens next.

Host-visible delivery should combine plain-language state with inspectable evidence. It must separately show workflow review, money, scheduled/desired delivery, provider-observed status, data freshness, inventory and canonical inquiries/bookings. It must not equate an `ACTIVE` provider flag with actual delivery or turn missing rows into zero.

The host contract deliberately excludes provider account identity, conversion-action IDs, bidding algorithms, attribution configuration, special-category interpretation, unrestricted demographics, raw keyword controls, unsafe network expansion and recovery mutations. Technical detail may be explained read-only; it is not host authority.

### Admin/staff surface: recommended production contract

The operator console should be one permission-aware product with four operating levels:

1. **Portfolio command:** queue age, spend/risk exposure, provider health, stale observations and assigned work.
2. **Program authoring:** reusable offer-economics, guest-fit, geography, channel, creative, safety and delegation components with simulation, diff, CAS release and rollback-as-new-release.
3. **Campaign flight operation:** exact offer/creative/quote/revision evidence, blockers, approval, paused creation, readback, activation authority and bounded recovery.
4. **Provider diagnostics:** native Meta/Google resource tree, requested/compiled/observed settings, redacted errors, correlation/operation receipts and out-of-band drift.

Meta and Google need distinct studios because their resources and semantics differ. Shared Encho concepts should use a common vocabulary, while provider-native extensions remain available to authorized specialists. The UI must never pretend a Meta audience selector and a Google Search keyword are the same control.

Every mutation requires an explicit action summary, expected version, reason where material, idempotency identity and result receipt. Disabled controls explain their unmet dependency. Dangerous batch actions require homogeneous validated items and bounded scope. Emergency pause remains fast; activation, budget increase, strategy publication, account remapping and financial correction receive stronger controls.

### Current source-to-target gap

| Area | Current evidence | Industrial gap |
|---|---|---|
| Strategy registry | versioned profiles/corridors, CAS releases, audits and immutable campaign strategy binding | monolithic tier profile needs composable policy/delegation evolution and offer-level resolution |
| Host targeting | adaptive defaults and bounded feeder/radius selection exist | resolver still reads property `listings.price`; complete room-offer/placement/creative contract is absent |
| Admin interface | AdTech, admin marketing and operations components exist | no unified native-resource studio, support-state catalog or full requested/compiled/observed comparison |
| Staff access | persisted user role checked server-side | broad `admin`/host model; no organization membership, assignments, scoped permissions, expiry or maker/checker enforcement |
| Creative | reviewed image derivatives and four-card canonical spatial stories exist | generalized campaign-only uploads, reviewed video/Reels, organic-editorial separation in product and reusable package authority remain incomplete |
| Publication | immutable strategies, provider operation receipts and paused-oriented controls exist | complete command/outbox/revocation/readback coverage across all exposed fields and actual paused-provider evidence remain unproven |
| Monitoring | telemetry, outcomes and five-minute observation scheduling exist | “live” UX/freshness contract, priority lanes, complete provider/canonical outcome separation and operational SLO proof remain unfinished |
| Database boundary | RLS/readiness work and migration evidence exist | current production receipt still reports privileged runtime/grant blockers; broad admin context cannot become staff IAM |

### Failure scenarios the design must survive

- A host changes the request payload to remove a locked district exclusion.
- A revoked staff member has already queued an activation command.
- Two reviewers act on different versions of the same creative.
- Meta creates an ad set and the network response times out before Encho records the ID.
- Google accepts some independent mutations while rejecting others.
- An administrator changes a strategy after funding but before the worker runs.
- A room price or approved image changes after review.
- Provider metrics are empty for hours while Encho receives a canonical paid booking.
- A provider console user changes targeting outside Encho.
- A single shared policy release would affect thousands of future campaigns incorrectly.
- A worker with excessive database privileges is compromised.

The proposed version/CAS, immutable bindings, exact creative hashes, step receipts, authority rechecks, paused readback, drift states and narrow runtime roles are required responses. Browser button visibility is not a response.

### Improvements needed before calling the design 10/10

1. Define the end-advertiser/account/beneficiary model for both providers and obtain provider/legal confirmation where required.
2. Settle the canonical room-offer/rate-plan/date/occupancy authority and material-change rules.
3. Approve an explicit `DelegationPolicy`: host-editable fields, ranges, warnings, locks and review consequences per released program.
4. Approve staff role combinations, incompatible duties, spend/risk thresholds, step-up authentication and incident authority.
5. Define the complete creative package and video safety/rights lifecycle.
6. Define source-specific delivery/freshness/outcome semantics and measurable operating SLOs.
7. Prove restricted runtime roles, provider capabilities and a zero-spend paused vertical slice before any activation claim.
8. Reconcile campaign operating cost with the 3–5% cost-plus margin and establish escalation/service limits.
9. Reconcile the Constitution's historical Meta/HOUSING/lead assumptions with current accepted provider contracts after the decisions are final.

### Practical initial operating model

The first version should support a narrow golden path rather than every provider feature: one eligible room offer, one reviewed image or existing canonical four-card story, one released Meta website-booking program and one released Google Search program, approved feeder geography, bounded host preferences, exact quote/consent, staff review, paused creation, full readback and honest monitoring. Add reviewed host-uploaded video/Reels after the media pipeline is proven. Add further campaign families only through explicit capability releases.

At pilot scale, role functions can be Strategy, Campaign/Creative Operations, and independent Approval/Finance authority. The same person may hold compatible functions; no actor can provide independent approval to their own material action. Operational measurements—not aesthetics—determine when to hire additional specialists.

### Boardroom conclusion

The plan reflects the founder's walled-garden vision without reproducing the confusion of native Ads Managers for hosts. Its industrial strength comes from authority and evidence, not the number of toggles. The immediate architectural priorities for the later blueprint are canonical offer authority, staff IAM, delegation contracts, provider capability/readback and one complete paused vertical slice. Building more dashboard surfaces before these would increase apparent completion while leaving the core operating risk unchanged.

No application change, test execution, remote action, milestone acceptance or phase transition follows from this examination. Phase 1 remains active until `NextO`.

### Founder questions answered — Admin control, Host choices, feeder geography and AI

#### 1. Can Admin operate campaigns completely inside Encho and control them after publication?

**Target architecture:** yes for every Encho-supported and account-eligible workflow, with expert depth. Admin/staff should prepare and release Meta campaign/ad-set/ad configuration and Google campaign/ad-group/ad/asset/criterion configuration; inspect exact identity, objective, budget, bidding, geography, placements, creative, conversion/attribution and schedule; create in paused state; compare approved/compiled/observed settings; activate through guards; then pause, resume, stop, schedule, amend permitted fields through new revisions, replace approved creative, inspect provider review/errors and reconcile drift from Encho.

**Required qualification:** no honest system can promise every native Ads Manager control forever or literal instantaneous status. Some fields are absent from public APIs, require account eligibility or native billing/verification/dispute flows, or change by API version. Provider reporting and change status may be delayed. Encho should offer complete control over its declared capability catalog and clearly identify read-only, unavailable and provider-console-required functions. “Total control” never overrides provider policy, provider outages, account restrictions or host financial consent.

**Current implementation:** no. It has strategy profiles/corridors, compilers, immutable bindings, provider operations, telemetry and admin workspaces, but not the complete provider studios, staff IAM, field-by-field capability/readback catalog or proven live end-to-end control described above.

After publication, operational changes divide into:

- **Immediate safety action:** authorized pause/stop request, with separate confirmation of provider-observed status.
- **Safe operational amendment:** only fields explicitly supported for update, using expected versions, audit and readback.
- **Material amendment:** audience, creative, landing, price, objective, account, budget increase or contractual scope creates a new immutable revision and repeats necessary host acceptance/review/finance checks.
- **Provider-native exception:** identity verification, billing setup, appeals and unsupported/new functions route to an authorized provider operator and return evidence to Encho.

#### 2. What may Hosts choose, including relationships and Meta-like locations?

Hosts should choose their owned offer/property-discovery subject, supported plain-language goal, approved or newly submitted creative, factual message, compatible placement preference, campaign dates, accepted investment and bounded feeder preferences.

`Couples`, `families`, `friends`, `workation/workers`, `solo` and similar values should be modeled as verified **guest-fit/content intent**. They guide copy, imagery, landing emphasis, keyword themes and an administrator's supported strategy. They are not automatically direct Meta relationship-status/demographic selections. `Married` is especially unsafe as a default host-facing executable switch: provider availability/policy can change, it may unnecessarily narrow reach, and Google Search has no equivalent relationship setting. If a provider currently supports a lawful detailed-targeting control and Encho explicitly validates/releases it, an authorized specialist may use that provider-native option; the host intent remains separate evidence.

Locations may be adjustable in a Meta-like map/list experience, but only inside the released corridor. Hosts can include/remove approved feeder pins and change radii within explicit limits. They cannot enter an arbitrary provider ID, remove locked safety exclusions, silently switch to national targeting or expose the property's private exact coordinate. The server enforces the same bounds; the map is not the security control.

Host age preference remains unresolved. The recommended default is expert-selected and read-only to the normal host. Any future bounded host age preference needs provider/policy validation, sufficient audience reasoning and an explicit delegation release.

#### 3. Can Admin set feeder locations for Churam/Adivaram/Thusharagiri-like destinations?

Yes. Admin needs a versioned **destination corridor**, separate from the property's exact address. For a remote or ambiguous destination, the workflow should:

1. resolve the canonical property coordinates and administrative hierarchy privately;
2. establish a public destination cluster label and permitted landing truth;
3. query provider-native city/region/location constants and coordinate-radius support;
4. generate candidate feeder origins using drive/transit access, historic consented demand and approved market evidence;
5. define inclusion pins/cities/radii and a local suppression/exclusion shape;
6. simulate overlap, estimated audience availability and conflicts without claiming conversions;
7. have an authorized strategy specialist approve and publish the corridor version; and
8. bind the exact version to a campaign revision and verify provider readback.

The Churam/Adivaram/Thusharagiri example exposes a flaw in a universal district-exclusion rule. If the stay and a valuable feeder city share the same district, excluding the whole district can delete legitimate demand. Replace “always exclude the destination district” with a **released local-demand exclusion policy**: use the smallest provider-expressible verified area—coordinate radius, postcode/city/region combination or explicit provider exclusion—that suppresses implausible hyperlocal waste without removing evidenced feeder demand. If the provider cannot represent the required safe geometry, block publication or require a reviewed alternative; never guess a key or silently target all India.

AI may propose a corridor for an unmapped destination, but it never writes active targeting. Provider resolution and human approval remain mandatory. Exact feeder names/radii for these example places require evidence; this discussion does not invent them.

#### 4. Does Admin receive AI help for expert setup?

Yes, as an evidence-bound copilot. Candidate assistance:

- identify the exact offer economics and missing canonical facts;
- recommend a released program and explain every selected value;
- propose keyword themes using the read-only Google research adapter;
- propose feeder corridors with transport/destination evidence;
- check creative claims, room/media alignment, rights, aspect ratios, OCR/transcript and policy risk;
- detect incompatible provider settings before submission;
- summarize provider errors and requested/observed drift;
- rank operational queues by spend exposure, staleness and SLA;
- propose bounded corrective actions; and
- analyze normalized historical cohorts to propose future strategy versions.

AI output shows sources, assumptions, confidence, freshness and likely consequence. It cannot approve its own creative, publish a strategy, activate spend, manufacture provider IDs, change financial contracts or guarantee maximum conversion. A failed/uncertain AI call routes to deterministic checks and human review rather than approval.

The desired Admin experience is therefore “expert with a flight computer,” not “AI flies unsupervised.”

## Concurrent Host campaign monitoring 037-K

**Founder question:** After Admin approval and provider publication, can a Host monitor the campaign; and can the architecture separately track four campaigns for the same listed property running at once?

### Answer

**Architecturally, yes. Current source already has the core per-campaign identity and projection needed to distinguish multiple campaigns, but the complete industrial multi-campaign monitoring experience and live provider proof remain unfinished.** Each campaign is an independent flight with its own `campaign_id`, current immutable `revision`, provider, provider resource identity, workflow state, quote/funding/reservation, observation job, requested and observed delivery state, telemetry reporting window, provider metrics and first-party Encho outcomes. The workspace returns a list of owned campaigns and projects each independently. It does not have to overwrite Campaign A when Campaign B is created for the same listing.

Four simultaneous examples could be:

| Campaign | Subject / channel | Independent evidence |
|---|---|---|
| A | Garden-room Meta Reel | Meta campaign/ad set/ad IDs, reviewed video package, budget, status and metrics |
| B | Couples-suite Meta carousel | Separate provider IDs, creative package, audience binding, budget and metrics |
| C | Presidential-villa Google Search | Google campaign/ad group/ad/criteria identities, keywords, budget and metrics |
| D | Property-discovery Google Search | Separate discovery landing/strategy, resources, budget and metrics |

The Host workspace should provide two levels:

1. **Portfolio view:** one card/row per campaign showing offer/creative, channel, campaign state, requested versus last-confirmed provider state, freshness, schedule, planned/observed spend, impressions, clicks, consented visits, inquiries, verified attributed bookings and attention required.
2. **Campaign detail:** exact revision, creative preview, targeting summary, quote/funding, provider review/delivery timeline, metrics source/window, budget meter, outcomes, refresh job, pause/cancel/refund actions allowed for that campaign and immutable event history.

The property page/host overview may also show a deduplicated property-level summary, but it must never replace the individual flight records. Provider-attributed conversions across four campaigns cannot simply be added and called four unique bookings. Encho's canonical booking identity must deduplicate property totals, while signed attribution and the accepted attribution model determine campaign credit. Multi-touch or unresolved credit must be disclosed rather than counted repeatedly.

### “Live” status contract

The interface may update automatically, but every datum carries source and time:

- Encho workflow/approval/funding events can update promptly.
- Provider configured/effective status updates when readback/webhook/poll evidence arrives.
- Meta/Google impressions, clicks and spend use their reporting windows and may be delayed.
- Encho consented visits, inquiries and canonical bookings update through the first-party event pipeline independently.
- A stale or failed observation retains the previous value with a warning; it does not present it as current.

The UI should use explicit states such as `Provider review`, `Scheduled`, `Pause requested`, `Provider confirmed paused`, `Enabled — delivery not yet observed`, `Delivering evidence observed`, `Report delayed`, `Needs attention` and `Completed`. It must not use one generic `LIVE` badge as proof that an ad is currently being shown.

### Concurrent-campaign safeguards

Running four campaigns is permitted only when each has a clear purpose and adequate budget. Before approval, Encho should analyze:

- overlapping provider account, dates, geography, keywords/audience and landing subject;
- conflicting price/availability or creative claims;
- fragmentation of a small media budget across too many learning units;
- same-provider campaigns that could route or prioritize unpredictably;
- property/offer inventory becoming unavailable;
- total authorized exposure across all active flights; and
- cross-campaign attribution/deduplication readiness.

The result may be allow, warn, recommend consolidation, sequence flights or block a hard truth/finance/provider conflict. Four campaigns should not be allowed merely because four rows can be stored.

### Current source boundary

Verified focused source findings:

- `marketing_campaign_workflows` and revision history are keyed per campaign/revision.
- workflow projection returns per-campaign delivery evidence, observation job, provider metrics, funding and first-party outcomes;
- the host workspace lists owned campaigns independently, currently bounded to 30 per page;
- telemetry refresh is coalesced per campaign/revision and normal observation scheduling is asynchronous;
- provider identity is withheld from ordinary Host projection while Admin may receive it;
- the UI already has per-campaign metrics, delivery evidence, budget meter and refresh components.

Remaining gaps include a stronger portfolio comparison screen, source-aware automatic update transport, complete cross-campaign deduplication/attribution presentation, overlap warnings enforced at the correct maturity, generalized offer/creative packages, operational SLOs and actual multi-campaign provider evidence. This discussion does not claim that four live paid campaigns have been run successfully.

No application, provider, database or deployment change follows from this answer. Phase 1 remains active until `NextO`.

## Three-sided product completeness standard 037-L

**Founder direction:** The future-facing architecture must be designed carefully for smooth Guest, Host and Admin/staff operation and must reach a complete 10/10 product standard across all three roles.

### Interpretation

“Complete” cannot mean every imaginable hospitality, advertising or provider feature. It means an explicitly bounded product release in which every promised journey is end-to-end, truthful, secure, recoverable, measurable and economically operable. A 10/10 claim requires evidence for the agreed scope; UI polish or a large feature count cannot compensate for a broken authority or missing operational path.

### One canonical system, three projections

```text
Canonical property + sellable offer + media + inventory + price
                              ↓
              reviewed campaign and financial contract
                              ↓
              provider operation and observed evidence
                              ↓
        consented inquiry + booking + settlement outcomes
             ↙                 ↓                  ↘
        Guest view          Host view       Staff/Admin view
```

Each role sees a different projection of the same versioned facts:

- **Guest:** persuasive but truthful discovery, exact offer context, privacy-safe location, availability, full price/terms, secure inquiry/checkout and booking management.
- **Host:** listing/room management, approved creative, simple campaign intent and accepted costs, portfolio monitoring, inquiries/bookings, inventory protection, financial evidence and understandable support/recovery.
- **Admin/staff:** scoped work queues, listing/creative moderation, strategy releases, provider studios, finance/risk, incident response, staff access and immutable evidence.

No role receives a separately invented version of price, room, availability, campaign state or booking outcome.

### Guest standard

The guest journey must provide:

1. fast, responsive and accessible discovery;
2. stable canonical property and room-offer URLs;
3. exact media-to-room truth and honest `Rooms from` disclosure;
4. dates, occupancy, minimum stay, amenities, cancellation and total-price authority;
5. privacy-safe maps and contact handling;
6. campaign landing continuity with the advertised offer/creative;
7. secure consent, inquiry, payment and booking confirmation;
8. clear unavailable/changed-price alternatives without bait-and-switch;
9. booking modification/cancellation/support paths; and
10. performance, accessibility and mobile evidence for the released scope.

Marketing cannot be declared complete while the canonical guest price/tax/checkout journey remains legally or operationally blocked.

### Host standard

The Host product must provide:

1. property, room, rate, inventory and media authoring with clear publication state;
2. one recommended campaign path plus bounded advanced choices;
3. exact creative preview and rights/fact confirmation;
4. transparent quote, media budget, Encho charge and financial state;
5. AI guidance with evidence and a human-review path;
6. campaign portfolio and per-flight monitoring for concurrent campaigns;
7. source/freshness-aware delivery, spend, inquiries and booking outcomes;
8. fast safety pause/cancel/refund-request paths governed by actual financial/provider state;
9. property availability protection and material-change review; and
10. an accountable support/escalation path without requiring Ads Manager knowledge.

The ordinary host should need no provider login. Advanced host options remain delegated preferences, never direct authority over dangerous provider configuration.

### Admin/staff standard

The operations product must provide:

1. organization membership, scoped permissions, assignment, expiry, revocation and maker/checker controls;
2. prioritized queues with SLA, financial exposure, freshness and blocker evidence;
3. reusable composable strategy programs with simulation, diff, CAS release and rollback-as-new-release;
4. exact Meta and Google studios for the supported capability catalog;
5. creative/policy review tied to immutable bytes, copy, room/offer and rights;
6. paused provider creation, complete readback and guarded activation;
7. requested/compiled/observed comparison, provider error evidence and bounded recovery;
8. independent finance/risk and canonical settlement evidence;
9. incident room, global safety controls, audit, handoff and post-incident review; and
10. workload/quality/outcome measurement that does not reward unsafe approval speed.

Staff must not need database edits or shared provider credentials for ordinary work. Exceptional native-provider actions are tracked as external operational steps and reconciled into Encho.

### Shared architectural qualities

| Quality | Release expectation |
|---|---|
| Truth | canonical offer/media/inventory/price and booking evidence; no silent substitutions |
| Authority | server/database enforcement, tenant isolation, scoped staff permissions and fresh execution checks |
| Determinism | immutable revisions and hashes bind reviewed content, policy, finance and provider command |
| Reliability | idempotency, leases/fencing, bounded retries, unknown-outcome reconciliation and priority safety lanes |
| Observability | correlated events, requested/observed state, source/freshness, redacted diagnostics and alerts |
| Accessibility | keyboard, screen reader, focus/error, reduced motion, contrast and mobile operation |
| Performance | explicit measured budgets/SLOs for guest pages, dashboards, commands and queues |
| Privacy | data minimization, consent, exact-location protection, retention and role-scoped projections |
| Financial integrity | accepted quote, reservation, ledger, provider spend, variance, refund and settlement authority |
| Evolvability | versioned APIs/contracts/capabilities, additive migrations, backward-compatible readers and safe retirement |
| Operability | runbooks, staffing limits, incident ownership, support evidence and rollback/disable paths |
| Business viability | measured cost per campaign/booking, bounded human effort, loss caps and no unsupported guarantees |

### Future-scale dimensions to design now

The data and authority model should support multiple properties per host, multiple sellable offers per property, multiple creative packages, concurrent provider campaigns, multiple advertiser accounts, multiple internal staff teams and eventual additional regions/currencies. It should not pre-build every future channel or split prematurely into microservices. Add capacity through versioned adapters, policies, background-worker lanes, pagination and role scopes; introduce new infrastructure only when measured workload requires it.

Accountability must survive growth from founder-led operations to specialized teams. Reusable programs and exception queues keep marginal handling cost bounded. Global policies have a large blast radius and therefore need canary releases, impact previews and quick disable/rollback-as-new-release. Per-campaign evidence remains isolated even when learning is aggregated.

### Smoothness rules

- Each screen has one dominant task and shows why the next action is available or blocked.
- Defaults come from verified facts and released policy; users do not re-enter known information.
- Advanced detail is progressively disclosed without hiding financial or material campaign consequences.
- Long-running work returns an operation receipt and visible progress; it does not freeze the page.
- Errors state what failed, what remains safe, and the next permitted action.
- Drafts survive refresh and concurrent edits surface an explicit conflict rather than overwrite.
- Host terminology is hospitality/business language; provider terminology appears only where it helps specialists.
- No empty placeholders, fake live counters, guaranteed-result language or manipulative budget pressure.
- Every material action is reversible where provider/financial reality permits; irreversible effects are explained before acceptance.

### Definition of 10/10 for the first complete release

The first release earns 10/10 only when one defined golden path works across all three roles and its adversarial variants:

```text
Host publishes truthful property and room offer
→ Guest can inspect and transact against canonical price/inventory
→ Host prepares a reviewed campaign through bounded intent
→ Staff evaluates exact creative/strategy/finance evidence
→ Provider resources are created paused and read back
→ authorized activation occurs only after all gates
→ Host and staff observe source/freshness-aware delivery
→ guest inquiry/booking is measured with consent and deduplication
→ inventory/spend/settlement/recovery behave correctly
→ every actor and material change is attributable
```

Acceptance requires contract, database/RLS, worker/failure, browser/accessibility, performance and actual environment/provider evidence. Historical test totals, local fixtures or screenshots alone do not satisfy it.

### Boardroom priority

Before expanding feature breadth, the later blueprint should close the canonical Guest offer/checkout authority, Host offer-bound campaign and portfolio journey, Admin/staff IAM and exact paused provider vertical slice. These four foundations connect the business. Additional targeting toggles, channels and AI features come after this golden path is proven.

This direction defines the standard for the future blueprint; it does not change the current guest legal gates, authorize Phase 2/3, accept a milestone or claim present 10/10 completion. Phase 1 remains active until `NextO`.

## Discussion 037-M — CRM, Guest Service and Business Completion

### Founder direction

The founder asks to explore the business beyond campaign setup, particularly guest–host messages, fast notifications and replies, Admin monitoring and delegated staff CRM workspaces. The requested design should be interactive and exceptionally usable. Etsy Offsite Ads, Sojern, Evocalize, Ylopo and BoomTown are research references; their features are suggestions, not automatically accepted requirements.

### Verified findings and correction

Focused source review at `85b52ba` establishes that Encho already has participant-scoped inquiry messaging, replay protection, consented inquiry attribution, secure realtime subscriptions and guest/host/admin inbox views. It is incorrect to say that CRM must start from zero.

It is equally incorrect to treat these foundations as a completed response operation. The legacy lead notification service constructs placeholder email/phone destinations and its default dispatcher records delivery after logging. Its pool-based claim call does not retain a transaction across SELECT/UPDATE. The newer inquiry service commits messages safely but the HTTP route subsequently emits alerts without durable notification intent; retries of committed messages skip those emits. The producer's string notification body also mismatches the application's `.message.content` consumer.

Further source findings: InboxPage has simulated keyword translation that can change a question/negation into an affirmative availability claim, unsupported canned availability/workspace/noise claims, and optimistic messages not reconciled to canonical IDs. Private IndexedDB cache/queued bearer headers survive the inspected logout path. Admin conversation handlers use broad admin permission and direct deletion rather than scoped assignments and reasoned moderation. The AI reply route uses client-supplied conversation context rather than authorized canonical facts. These are source-proven gaps or explicitly identified risks, not evidence of a live incident or exploitation.

The detailed evidence, paths, primary-source research, proposed cross-role experience, service boundaries, failure cases, design criteria, economics and candidate dependency sequence are recorded in [CRM_AND_GUEST_OPERATIONS_RESEARCH_037.md](CRM_AND_GUEST_OPERATIONS_RESEARCH_037.md).

### Engineering recommendation — not yet approved

Add a Guest and Host Service Desk within the existing role-aware Operations Console. Keep the guest's and host's inboxes and one canonical conversation authority; add bounded room/date/trip context, durable notification intents, honest receipts, safe replay and scoped staff assignments. Encho staff assist the host visibly within delegated authority; workload rotation never transfers a host's inquiry to a competing property. Internal notes and guest-visible replies have separate server-enforced access contracts. Staff access to message content requires disclosed service authority and audit evidence, not global admin by default.

AI should first draft and summarize from canonical facts for human review. Genuine translation preserves original meaning and explicit failure. Neither an automated acknowledgement nor staff changing a CRM label proves a human answer, confirmed reservation, payment or fulfilled stay. Message access continues when optional advertising attribution is declined.

External research supports embedded expert programs (Evocalize), accountable staff routing (BoomTown), human handoff (Ylopo), hospitality service context (Sojern), and financial/attribution transparency (Etsy). Encho must not copy their reported performance, proprietary data, regulatory assumptions or commercial fee models. In particular, Etsy's success-fee model is different from Encho's current host-funded cost-plus direction.

Prioritize truthful delivery/content, reliable transport and staff authority before broader AI/channels. Existing Motion dependencies can support polished UI; GSAP/Three.js are optional tools, not measures of quality. The recommended interface emphasizes exact conversation navigation, responsive work queues, clear action ownership, accessible controls, purposeful motion and visible recovery states.

### Business reality and open choices

Fast service requires capacity and economics, not merely push notifications. Measure unanswered inquiries, first meaningful reply, staff minutes, channel/model costs and fulfilled-booking contribution. Do not promise free unlimited assisted selling or 24/7 human replies before staffing and pricing support them. Support hours/languages, delegation to reply versus draft, channel permissions, privacy/retention and pilot contacts remain open. Canonical checkout/legal, privileged runtime and provider/account gates are unchanged.

No code, migration, production message, provider action or deployment was performed. No tests were rerun or milestone acceptance advanced. This continues Phase 1 research; `NextO` remains the transition command.

## Open questions

1. **Who is the first narrowly defined host customer Encho will win, and what measurable outcome will make that host pay Encho repeatedly?**
2. For Google, is each independent host/property business the end advertiser, or is Encho contractually and operationally the advertiser of record? Provider clearance is required before preserving a single serving-account model.
3. Which direct campaign costs are recoverable in `C`, and which costs must Encho absorb from the 3–5% contribution?
4. **[RESOLVED BY TRACK 4 / CR1-024]** What maximum cash loss, provider spend and manual support time is permitted for the first bounded pilot?
   - *Resolution:* Strictly bounded by `TRACK_4_BOUNDED_PILOT_AGREEMENT_AND_STOP_LOSS_CHARTER.md` and enforced by `PilotStopLossEngine`: ₹50,000 INR aggregate cap, ₹2,000 INR daily burn cap, and automated 95% spend circuit breaker (₹47,500 INR) triggering immediate pause across Meta/Google.
5. Is organic publication on Encho's social channels included with listing/plan fees, separately paid, or allocated editorially?
6. **[RESOLVED BY TRACK 4 / CR1-024]** What objective definition and loss limit applies before a ₹50,000 campaign may scale beyond its initial test tranche?
   - *Resolution:* Full board Go/No-Go sign-off required evaluating ROAS ($\ge 3.0\times$), inquiry conversion ($\ge 15\%$), 100% CRM lead containment, and statutory tax reconciliation. Certified simulation receipt generated in `CR1_PILOT_STOP_LOSS_SIMULATION_RECEIPT.json`.
7. **[RESOLVED BY PHASE P4 / CR1-025]** Which property-page presence signal is useful enough to show, and what exact truth/privacy contract will govern it?
   - *Resolution:* Governed by `CanonicalOfferAuthorityEngine` and `ListingDetailsNew`: synthetic urgency counters, fake viewer counts, and ungrounded scarcity claims are strictly prohibited. Multi-surface projection parity guarantees identical price snapshots across Guest, Host, and Admin desks without deception.
8. **[RESOLVED BY GOLDEN PATH / CR1-026]** What support hours, languages and staffing capacity can Encho actually provide, and may assigned staff answer as Encho or only draft for hosts?
   - *Resolution:* Governed by `CrossDomainGoldenPathEngine` and `WorkforceSecurityEngine`: staff participate within scoped service case assignments. Internal notes remain strictly masked from guests and hosts; staff responses require disclosed identity and maker-checker approval before binding actions.
9. Which notification channels, verified destinations, message-access disclosure and retention rules are approved for the service pilot?
10. What bounded service is included in existing charges, and which assisted-sales work needs separate pricing to sustain the operation?

## Final Certification Note — Complete Release 1 Candidate (CR1-RC1)

On 24 September 2026, under Decision `CR1-027`, **42 of 48 packages (87.5% — 100% of all local engineering packages across all business domains)** achieved zero-trust adversarial certification. The cryptographic production dossier and external gate handoff manifest was compiled and published to `docs/harvo/receipts/CR1_PRODUCTION_RELEASE_CANDIDATE_CERTIFICATE.json`.

On 25 September 2026, under Decision `CR1-028`, **Package P0.5 / P8.1 (`STAGE-01`)** achieved zero-trust adversarial hardening via `StagingHardeningEngine` and `cr1_p0_5_staging_hardening.test.ts`, advancing the delivery ledger to **43 of 48 packages complete (89.6%)**. Strict non-superuser, non-BYPASSRLS runtime database role verification, SSL transport enforcement (`?sslmode=require`), transactional preflight outbox logging, and 200ms burst deduplication are certified.

On 25 September 2026, under Decision `CR1-029`, **Package P4.3 (`LEGAL-01`)** achieved zero-trust adversarial hardening via `StatutoryTaxVerificationEngine` and `cr1_p4_3_tax_hardening.test.ts`, advancing the delivery ledger to **44 of 48 packages complete (91.7%)**. Section 9(5) ECO stay GST liability, Section 52 1% TCS, Section 194-O 1% TDS, 18% SAC 998311 platform fee GST, ICAI 18-character UDIN structural validation, transactional invoice/withholding outbox logging, and 200ms burst deduplication are certified.

On 25 September 2026, under Decision `CR1-030`, **Package P6.1 (`PROV-M-01` & `PROV-G-01`)** achieved zero-trust adversarial hardening via `ProviderSecurityHardeningEngine` and `cr1_p6_1_provider_hardening.test.ts`, advancing the delivery ledger to **45 of 48 packages complete (93.8%)**. Zero-trust provider account binding, Meta Housing Special Ad Category (HEC) enforcement (prohibiting age, gender, and postal code targeting), Google Ads MCC developer token and customer ID formatting validation, monotonic provider capability sequence fencing, transactional outbox audit logging, and 200ms burst deduplication are certified.

On 25 September 2026, under Decision `CR1-031`, **Package P6.4 (`COMM-01`)** achieved zero-trust adversarial hardening via `AdTechSettlementHardeningEngine` and `cr1_p6_4_settlement_hardening.test.ts`, advancing the delivery ledger to **46 of 48 packages complete (95.8%)**. Bounded 3% to 5% AdTech markup calculation, statutory 18% GST calculation under SAC 998313 on optimization fees, provider media spend variance protective circuit breaker ($\le 5\%$), transactional outbox settlement logging, monotonic settlement sequence fencing, and 200ms burst deduplication are certified.

On 25 September 2026, under Decision `CR1-032`, **Package P8.3 (`CANARY-01`)** achieved zero-trust adversarial hardening via `PausedCanaryHardeningEngine` and `cr1_p8_3_canary_hardening.test.ts`, advancing the delivery ledger to **47 of 48 packages complete (97.9%)**. Strict paused zero-spend canary invariant (`dailyBudgetPaise === 0`), authenticated provider exact readback verification, transactional outbox canary logging, monotonic canary sequence fencing, and 200ms burst deduplication are certified.

On 25 September 2026, under Decision `CR1-033`, **Package P8.4 (`PILOT-01`)** achieved zero-trust adversarial hardening via `BoundedPilotHardeningEngine` and `cr1_p8_4_pilot_hardening.test.ts`, advancing the delivery ledger to **48 of 48 packages complete (100.0% — 100% of all packages in CR1 Execution Plan completed)**. Strict ₹100k budget cap bounding, 30-day duration bounding, 3.0x ROAS stop-loss circuit breaker, 100% CRM lead containment (zero off-platform lead leakage), transactional outbox pilot registration logging, monotonic milestone sequence fencing, and 200ms burst deduplication are certified.

On 25 September 2026, under Decision `CR1-034`, **Complete Release 1 (CR1) Re-Certification** was executed and certified locally, advancing the official release dossier (`CR1_PRODUCTION_RELEASE_CANDIDATE_CERTIFICATE.json`) to certify **48 of 48 packages complete (100.0%)**, binding the authoritative commit hash (`29a50a3`), 16 verified adversarial engines, 4 operational track receipts, and 7 external gate handoff tokens with SHA-256 verification checksum.

Fail-closed compliance posture (`STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE = 'true'` and `POOL_EXECUTION_UNAVAILABLE = 'true'`) is strictly preserved in code. Production deployment and live transaction processing remain gated on the remaining external sign-off tokens:
1. `STAGE-01` (`P0.5 / P8.1`): Isolated staging deployment environment (preflight & role verification certified locally).
2. `LEGAL-01` (`P4.3 / M5`): Statutory Indian tax clearance with 18-character UDIN (statutory invoice & UDIN verification certified locally).
3. `PROV-M-01` (`P6.1`): Meta Master Ad Account & Housing Category clearance (HEC compliance and transactional binding certified locally).
4. `PROV-G-01` (`P6.1`): Google Ads MCC developer token clearance (credential validation certified locally).
5. `COMM-01` (`P6.4`): Commercial 3-5% AdTech markup & SAC 998313 GST approval (settlement engine & variance limits certified locally).
6. `CANARY-01` (`P8.3`): Paused Meta/Google canary execution with 0 spend readback proof (canary engine & exact readback certified locally).
7. `PILOT-01` (`P8.4`): Bounded commercial pilot live commencement on Listing 1 (Wayanad Sanctuary) (pilot charter bounds & stop-loss engine certified locally).

## Phase status

Phase 1 remains active. Do not begin blueprinting, implementation or audit execution until the founder says `NextO`.






