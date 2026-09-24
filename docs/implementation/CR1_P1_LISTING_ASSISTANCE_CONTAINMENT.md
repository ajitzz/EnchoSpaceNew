# CR1 P1 — Listing assistance truth containment

**Status:** Additive boundary implemented locally; the composition root must mount it after `authenticateToken` on each route below. This document does not certify production deployment or a replacement AI capability.

## Verified defect and caller trace

Source inspected 24 September 2026. Function/route anchors are authoritative if line numbers move during other CR1 work.

| Legacy route | Source evidence | Current callers | Containment reason |
|---|---|---|---|
| `POST /api/ai/curate-rules` | `server.ts:14671`: provider output is returned without a semantic validator; fallback changes “no smoking” into perimeter smoking permission and “no pets” into prior-approval permission. Check-out and party constraints also lose concrete meaning. | `HostForm.tsx:516` `handleCurateRules`; `AdminDashboard.tsx:1087` `handleAdminCurateRules` | `RULE_MEANING_NOT_VERIFIED` |
| `POST /api/ai/radar-scan` | `server.ts:14719`: static fabricated landmarks/restaurants, ratings 4.6–4.9, travel times and coordinate offsets become successful suggestions when Gemini is absent/fails. Model success is checked only for array shape, without a place authority or verified source. | `HostForm.tsx:585` `suggestNearbyPOIs`, which puts returned suggestions into the editable `nearby` form | `NEARBY_FACTS_NOT_VERIFIED` |
| `POST /api/ai/suggest-sensory-tags` | `server.ts:14889`: “pool” yields Heated Infinity Pool; “wifi/work/remote” yields 1 Gbps Fiber WiFi; “luxury” yields 24/7 Butler Service. Model label allowlisting proves taxonomy membership, not possession of an amenity. | `SensoryTagPicker.tsx:252` `handleAiSuggest`, which merges output into selected tags | `AMENITY_CLAIMS_NOT_VERIFIED` |

Additional contract drift: rule callers send `raw_rules`, while the route reads `rawRules`; callers expect `curated_guidelines` or `guidelines`, while the route returns `curatedGuidelines`. Fixing these names alone would expose the semantic defect more reliably. No safe canonical reviewed-fact replacement was found in the inspected listing-assistance service paths. Public stay projection maps saved facts; it does not validate newly generated claims. Marketing-v2 canonical facts and gatekeeping are separate contracts and are not rerouted here.

## Delivered boundary

`src/server/assistance/legacyListingAiBoundary.ts` exports `createLegacyListingAssistanceBoundary(feature)` for `CURATE_RULES`, `NEARBY_RADAR`, and `SENSORY_TAGS`.

- Mount immediately after the existing persisted-session authentication middleware and before the old async handler. A defensive account-ID check returns 401 if the boundary is mounted without identity.
- Authenticated requests receive HTTP 503 `GROUNDED_LISTING_ASSISTANCE_UNAVAILABLE`, a fixed per-feature explanation/reason, and `DO_NOT_RETRY`.
- It does not read the request body, call a provider, invoke `next`, write the database, supply generated/default listing content, or expose coordinates, address, personal data, credentials or raw model output.
- Server execution-context identifiers remain available for support correlation; `Cache-Control: no-store` applies.
- Existing saved listing data stays intact. Hosts/admins can continue manual editing; current callers must present availability feedback without replacing existing values. The boundary does not certify manually entered claims.

Example composition (existing authentication is mandatory):

```ts
app.post('/api/ai/curate-rules', authenticateToken,
  createLegacyListingAssistanceBoundary('CURATE_RULES'), oldHandler);
```

## Impact, validation and rollback

Only three unsafe legacy enrichments are retired. Canonical campaign evaluation, AdTech corridor inference, listing reads/saves and existing public content are unaffected. No schema migration or provider request is needed. Tests exercise authenticated per-route reasons, malformed/missing identities, termination before the old handler, safe trace metadata and absence of request payload leakage.

Local validation: `cr1_listing_assistance_containment.test.ts` passed 8/8 under Node 24. Focused ESLint and strict isolated TypeScript checking passed. `git diff --check` passed for this slice.

Release acceptance requires a composition-root test proving all three real routes mount this boundary; isolated middleware tests alone are insufficient. Rollback must not re-enable the fabricated fallback. A future replacement should use new versioned contracts, canonical reviewed fact references, explicit proposed-vs-approved state, rights/accuracy review, semantic rule preservation, rate limits, model/schema provenance and adverse input evaluation. P4/P5 own that restoration; it is not silently implemented by this containment patch.
