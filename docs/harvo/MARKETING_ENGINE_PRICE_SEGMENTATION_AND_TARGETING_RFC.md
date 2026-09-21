# RFC-P1: Adaptive Price-Tier Segmentation & Precision Geo-Targeting

**Document Reference:** `HARVO-RFC-P1`
**Date:** 21 September 2026
**Status:** PROPOSED — PENDING BOARDROOM APPROVAL
**Target Audience:** Core Platform Engineers, Growth Architects, Financial Operators

---

## 1. Executive Summary & Problem Statement

Encho's Marketing Engine currently enforces a unified, hardcoded Meta and Google advertising architecture:
* **Objective:** Strictly locked to `OUTCOME_SALES` (Conversions) with `promoted_object: { custom_event_type: 'PURCHASE' }`.
* **Schedule:** Locked to Wednesday 06:00 AM IST through Monday 23:59:59 PM IST (Asia/Kolkata).
* **Circuit Breaker:** Real-time calendar availability listener that pauses delivery upon sold-out inventory.

While this protects amateur hosts from burning budget on low-intent clicks ("Traffic" campaigns), an architectural reality check exposes two major challenges when scaling across heterogeneous hospitality inventory:
1. **Unit Economics Divergence Across Price Segments:** A luxury villa at ₹15,000–₹25,000/night has an allowable Customer Acquisition Cost (CAC) of ₹4,000–₹6,000 (contribution margin ~₹18,000 for a 2-night stay). A budget/mid-tier homestay at ₹3,500–₹5,000/night has an allowable CAC of only ₹800–₹1,200 (gross contribution ~₹4,200). If both tiers use identical pacing and national reach, budget properties face negative unit economics.
2. **Current Meta Geographic Targeting Gap:** While Google Search targeting resolves granular city-level `geoTargetConstants` (`src/lib/marketing/targeting.ts`), `MetaCampaignPlan.ts` (line 79) restricts Meta ad sets to country-level targeting: `geo_locations: { countries: config.countries }` (e.g., `['IN']`). Furthermore, negative geo-exclusions are absent. In regional destination markets like Wayanad, up to 25% of ad spend is lost to non-traveler locals or non-feeder distant states.

---

## 2. Performance Marketing Science: How Modern Meta Algorithms Handle Price Tiers

### 2.1 The "Creative IS the Targeting" Principle
In Meta's contemporary machine-learning auction architecture (Lattice AI / Advantage+), demographic interest dropdowns are secondary to computer vision, text tokenization, and conversion feedback loops:
* **Visual & Copy Tokens:** When an ad showcases a private temperature-controlled plunge pool and states *"₹18,000/night"*, Meta's OCR and semantic parsers cluster the ad toward affluent, high-LTV travel profiles.
* **Budget & Group Tokens:** When an ad showcases a plantation cottage, campfire, and states *"₹3,500/night · Sleeps 4 (just ₹875 per person)"*, Meta automatically clusters the ad toward college friends, young couples, and budget road-trippers.
* **Auction Objective Invariance:** The objective **MUST REMAIN `OUTCOME_SALES`** across all tiers. Switching a ₹3,500 homestay to "Traffic" or "Engagement" produces zero bookings, as Meta optimizes for accidental mobile clicks and bot traffic.

### 2.2 Mathematical CAC & Margin Model
The allowable advertising budget $B$ over a flight of $D$ days with nightly rate $P$, length of stay $N$ (default 2), host margin $M$ (default 60%), and target bookings $T$ is governed by:

$$\text{Gross Contribution} = P \times N \times M$$
$$\text{Max Allowable CAC} = \text{Gross Contribution} \times \alpha \quad (\alpha \in [0.25, 0.40])$$
$$\text{Budget Ceiling} = T \times \text{Max Allowable CAC}$$

* **Tier 1 (Luxury, $P = ₹15,000$):** Gross Contribution = ₹18,000. Allowable CAC = ₹4,500. A ₹10,000 ad budget requires only 2.2 bookings to break even.
* **Tier 2 (Budget/Mid, $P = ₹3,500$):** Gross Contribution = ₹4,200. Allowable CAC = ₹1,050. A ₹10,000 ad budget requires 9.5 bookings to break even (unrealistic for a 1-unit property over a single weekend). The maximum safe budget for Tier 2 is **₹2,000 – ₹3,000**.

---

## 3. The Current Architectural Constraints in Code

| Source Location | Current Implementation | Architectural Impact |
|---|---|---|
| `src/lib/providers/meta/MetaCampaignPlan.ts#L79` | `targeting = { geo_locations: { countries: config.countries } }` | National ad distribution across India; no city-level feeder concentration. |
| `src/lib/providers/meta/MetaCampaignPlan.ts#L70-L71` | Throws `Demographic/interest overrides are unsupported` | Blocks age bracketing (e.g., 25–54), allowing impressions to dilute to under-18 users. |
| `src/lib/providers/meta/MetaCampaignPlan.ts` | Lacks `excluded_geo_locations` | Locals residing in the destination district (e.g. Wayanad) click ads, wasting budget. |
| `src/lib/marketing/portfolio/preflight.ts#L21` | Evaluates `warning: budget > contribution * target ? 'ABOVE_BREAK_EVEN' : 'SCENARIO_ONLY'` | Proactively warns hosts in Step 3, but does not dynamically cap or recommend budgets based on price. |

---

## 4. Proposed Solution: The "Zero-Friction Adaptive Engine"

To preserve our "Rahul-Proof" directive (never forcing hosts to understand ad-tech dropdowns or coordinate matrices), the platform will adapt automatically based on the property's canonical rate and geographic location.

### 4.1 Automated Feeder-Market Matrix (Location-Aware Geo Routing)
Instead of asking hosts to select feeder cities, Encho automatically maps property locations to their high-intent feeder markets:

| Property Destination | Auto-Injected Target Cities (Meta `cities`) | Auto-Injected Negative Exclusion (Meta `regions` / `zips`) |
|---|---|---|
| **Wayanad, Kerala** | Bengaluru (25km radius), Kochi (20km), Kozhikode (15km), Mysuru (15km) | **Exclude:** Wayanad District |
| **Coorg, Karnataka** | Bengaluru (25km radius), Mysuru (15km), Mangaluru (15km) | **Exclude:** Kodagu / Coorg District |
| **Goa** | Mumbai (30km), Pune (25km), Bengaluru (25km), Delhi NCR (35km) | **Exclude:** North Goa & South Goa Districts |
| **Chikmagalur, Karnataka** | Bengaluru (25km radius), Mangaluru (15km), Hassan (10km) | **Exclude:** Chikkamagaluru District |

### 4.2 Code Implementation: Upgrading `MetaCampaignPlan.ts`

```typescript
export interface MetaGeoFeederConfig {
  targetCities: Array<{ key: string; radius: number; distance_unit: 'kilometer' }>;
  excludedRegions?: Array<{ key: string }>;
  locationTypes: ['home']; // "People living in this location"
}

// In buildMetaCampaignPlan:
const targeting = {
  geo_locations: {
    location_types: ['home'],
    cities: feederConfig.targetCities.length ? feederConfig.targetCities : undefined,
    countries: feederConfig.targetCities.length ? undefined : config.countries,
  },
  ...(feederConfig.excludedRegions?.length ? {
    excluded_geo_locations: {
      regions: feederConfig.excludedRegions,
    }
  } : {}),
  publisher_platforms: [...(fb.length ? ['facebook'] : []), ...(ig.length ? ['instagram'] : [])],
  ...(fb.length ? { facebook_positions: fb } : {}),
  ...(ig.length ? { instagram_positions: ig } : {}),
};
```

### 4.3 Adaptive Budget & Copy Preflight Engine
1. **Dynamic Budget Recommendations:** In `CampaignStudio.tsx` (Step 3), when a property rate is $\le ₹5,000$, the system pre-populates a safe default budget (e.g., ₹2,500 total / ₹500 daily) rather than a uniform ₹10,000.
2. **Dynamic AI Copy Directives (Gemini Gatekeeper):**
   * If Price $\le ₹5,000$: Prompt Gemini to inject value-oriented hooks: *"Split costs with 4 friends (just ₹875/person)"*, *"Campfire under the stars"*, *"Budget nature retreat"*.
   * If Price $> ₹12,000$: Prompt Gemini to inject luxury exclusivity hooks: *"100% Private 2-Acre Sanctuary"*, *"Heated Plunge Pool"*, *"Personal Estate Butler"*.

---

## 5. Security, Fraud & Compliance Impact Analysis

1. **Idempotency & Auditing:** Feeder city mapping is derived deterministically from the property's verified postal address and coordinates (`listings.lat`, `listings.lng`). No client-side tampering can alter the geographical bounds without triggering a new revision hash.
2. **DPDP & Privacy Act Compliance:** Targeting "People living in this location" using aggregate 20km+ metropolitan radiuses complies with the Digital Personal Data Protection (DPDP) Act. No individual PII or micro-tracking is utilized.
3. **Rollback Strategy:** If city-level targeting causes delivery under-pacing on Meta, the system gracefully falls back to country-level targeting (`countries: ['IN']`) with zero migration rollback required.

---

## 6. Recommended Next Steps

1. **Boardroom Alignment:** Approve the feeder market routing table and unit economics thresholds.
2. **Milestone SP8 / HARVO-036:** Implement Meta city-level targeting and negative exclusions in `src/lib/providers/meta/MetaCampaignPlan.ts`.
3. **Field Validation:** Test the ₹3,500 homestay campaign vs. ₹15,000 villa campaign in the upcoming Wayanad pilot flight.
