# CR1 P4.2 — Canonical room offer evidence foundation

Status: bounded foundation locally verified. Read-only preparation evidence; not
accepted Guest V2 commerce or production campaign publication.

## Source evidence and decisions

| Existing authority | Verified source | Consequence |
|---|---|---|
| Room identity, base nightly price, occupancy, stock and minimum stay | Migrations 003/004; `room_types.base_price` is NUMERIC rupees | Read that exact room row as decimal text. Never use the property's `listings.price` or legacy room JSON as a substitute. |
| Per-night capacity | Migration 005; `inventory_days` | Read every night in `[checkIn, checkOut)`. Missing days are unknown, not available. Existing held/booked/blocked counters remain authoritative. |
| Legacy blocks | Migration 006; `inventoryHoldService.ts` | Unmapped/ambiguous/all-room overlaps fail closed; mapped blocks for this room prevent an available claim. No reader repairs rows or acquires a hold. |
| Price tier intervals | Migration 032; AdTech released profiles and `resolvePriceTier` | Reuse published interval authority, preserving profile/release hashes. No new thresholds in offers code. |
| Guest commerce | Guest Booking Decision Register decisions 24/25/28/32 and legal block list; Guest V2 quote/rate model | Base price is not a dated, occupancy-qualified, tax-complete quote. Rate plan, cancellation and tax semantics must not be invented. |
| Founder offer direction | DECISION-037-E/F; CR1 blueprint BR-05, P4/P5 | A mixed resort can have independent Budget/Comfort/Premium room evidence. Its cheapest room never classifies the resort. |

## Scope and impact

Add strict contracts under `src/shared/offers`, a read-only host-owned canonical
reader and released-tier adapter under `src/lib/offers`, plus real PostgreSQL
tests. No migration 039 is introduced: new legally meaningful rate plans,
sellable-offer acceptance and durable campaign bindings remain future authority.
No server, UI, checkout, finance, booking, media or existing price writer changes.

The fact version is a content hash of normalized canonical room fields and its
property/owner/landing binding. A separate observation snapshot binds that version
to requested dates, quantity, occupancy, exact nightly capacity observations and
the database observation time. It is immutable data with integrity verification,
not a persisted accepted contract or a server signature. Untrusted client hashes
never establish authority; the server must re-read before a later decision.

## Reader and permission boundary

- The host method accepts a verified ACCOUNT principal from server authentication;
  its account ID determines ownership. No posted host ID, legacy admin role or
  SYSTEM bypass is accepted. STAFF access requires future exact scoped IAM
  integration and is intentionally not inferred from an account's admin flag.
- One SQL statement reads an allowlist of property/room fields, selected inventory
  days and overlapping block facts at a coherent database snapshot. The enclosing
  transaction is read-only. Sensitive property coordinates, contacts, access
  instructions, other-room media and guest identities are never selected.
- Unknown or inaccessible room/property yields the same unavailable error. Missing
  room price, currency, canonical slug or invalid relational fields fail closed.
- Missing/blocked inventory is returned as explicit observation state, with no
  booking/quote/public-claim permission. A completed observation cannot guarantee
  future availability; the existing atomic hold service retains allocation power.
- Read-only release evidence uses current AdTech RLS grants without elevation.
  No active release or inaccessible catalog yields STRATEGY_RELEASE_UNAVAILABLE.
  Tier selection is server-only preparation evidence and includes release/version
  identities; caller-supplied profiles must never be routed directly from HTTP.

## Exact money and failure behavior

Convert NUMERIC text with decimal parsing and BigInt. Reject exponent notation,
negative/zero values, fractions finer than a paise, non-INR currency and overflow.
Normalize harmless trailing decimal zeros so equal NUMERIC values produce equal
fact versions. No floating point multiplication or nightly-total/tax calculation.

Validate real Gregorian dates, a bounded 1–90-night window, positive units and
guest count. Occupancy must fit the selected room quantity. Readiness for a
booking, paid campaign, or public “from” claim stays false even when inventory is
observed available. There is no free-text price override and no property-wide tier.

## Verification and release boundary

Targeted tests cover paise boundaries, mixed-room resorts, custom published tier
boundaries, malformed/absent authority, ownership denial, missing days, mapped and
ambiguous blocks, minimum stay/occupancy, immutable hashes and coherent read-only
observations. Use disposable local PostgreSQL with migrations 003–006 and 032;
no remote connection or real customer data.

Local verification receipt: 41 tests passed across `cr1_offer_authority.test.ts`
(15) and the existing `adtech_contracts.test.ts` (26). Scoped strict
TypeScript compilation and ESLint passed for the new shared contracts, reader,
evidence hashing, released-tier adapter and test. This is targeted verification;
it is not the CR1 P4 full regression exit or a production readiness receipt.

Integration contract: `CanonicalRoomOfferReader.forHost(verifiedPrincipal, request)`
returns immutable, privacy-bounded room evidence. Server code may read a released
catalog through `readCurrentOfferTierRelease(authorizedClient)` and classify with
`classifyRoomOffer(snapshot, release)`. These methods never acquire inventory,
accept a commercial offer, issue a quote or authorize campaign publication. All
three execution flags remain false. The parent owns authenticated routes and
honest preflight presentation; no client-supplied profile/release is trusted.

Follow-on P4/P5 work must persist accepted offer versions only after Guest V2 and
legal schema approval, bind rate/conditions/occupancy/date prices, approved media
bytes and landing semantics, and add worker-time drift checks and host reacceptance.
Parent integration owns Guest/Host/Staff surfaces. Until then this is an internal
preflight foundation, not a new booking or publication endpoint.
