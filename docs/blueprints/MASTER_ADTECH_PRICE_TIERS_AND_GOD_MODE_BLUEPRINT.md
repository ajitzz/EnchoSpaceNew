# MASTER ADTECH BLUEPRINT: DYNAMIC PRICE-TIER ENGINE, AUTONOMOUS FEEDER CORRIDORS & ADMIN GOD-MODE CONSOLE

**Document Reference:** `HARVO-BLUEPRINT-ADTECH-V1`
**Authority:** Encho Boardroom Consensus (Founder & Lead Architect)
**Date:** 22 September 2026
**Target Audience:** Core Platform Engineers, Growth Architects, Database Administrators, Security & Financial Operators
**Status:** APPROVED ARCHITECTURAL SPECIFICATION — PENDING IMPLEMENTATION SPRINT

---

## 1. Executive Context & Architectural Paradigm Shift

### 1.1 The Legacy Limitation
Previously, Encho’s Marketing Engine hardcoded its advertising logic in static TypeScript modules (`src/lib/providers/meta/MetaCampaignPlan.ts`). Meta targeting was locked to national country boundaries (`countries: ['IN']`), demographic/interest overrides were blocked at runtime, and campaign parameters were identical whether advertising a ₹2,500/night rustic cottage or a ₹25,000/night luxury estate.

### 1.2 The New Mandate (The "Dynamic Strategy Engine")
In accordance with Boardroom directives:
1. **Zero Hardcoded AdTech Science in Code:** The "World's Best Marketing Scientist" logic must **never** be hardcoded in static `.ts` files. It must be dynamically loaded from a database-backed strategy registry (`marketing_adtech_tier_profiles`).
2. **Three Native Price-Tier Profiles:** The platform recognizes three distinct domestic hospitality segments:
   * **Tier 1: Budget-Friendly** (`₹1,000 – ₹4,000 / night`)
   * **Tier 2: Mid-Range Comfort** (`₹4,000 – ₹7,000 / night`)
   * **Tier 3: Premium & Luxury** (`₹7,000+ / night`)
3. **Autonomous Feeder-Market Corridors:** Incorporates Meta’s native coordinate-and-radius targeting engine (e.g. `(lat, lng) + radius in km`, city name `+ radius`) and mandatory negative geo-exclusions to eliminate local tire-kickers.
4. **AI-Powered Unknown Corridor Discovery:** If an unmapped destination is listed, Gemini AI analyzes regional transit hubs and road corridors to infer, recommend, and persist optimal feeder cities.
5. **The Admin "God-Mode" Control Center:** A dedicated operations console (`/admin/marketing/adtech`) granting administrators granular control over every micro-option in Meta Ads Manager and Google Ads Console per tier, without requiring code changes or redeployments.
6. **The 90/10 Host Rule:** 90% of hosts experience a zero-friction, 1-click launch; the top 10% of power hosts receive an expandable targeting interface to customize feeder radiuses without breaking the underlying bid/conversion mechanics.

---

## 2. The 3-Tier Price Segmentation Matrix

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 1: BUDGET-FRIENDLY (₹1,000 – ₹4,000 / night)                                               │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Primary Audience: College friends, backpackers, solo nomads, budget road-trippers (Age 20–35)│
│ • Geographic Radius: Hyper-local & driving corridors (within 3–5 hours / 150–250 km).           │
│ • Financial Modeling:                                                                           │
│   - Gross 2-Night Stay Revenue: ₹2,000 – ₹8,000                                                 │
│   - Max Allowable CAC Ceiling: ₹600 – ₹1,200                                                    │
│   - Default Media Budget: ₹1,500 – ₹2,500 total (Daily pacing: ₹350 – ₹500/day)                 │
│ • Meta Micro-Options:                                                                           │
│   - Objective: OUTCOME_SALES (Never Traffic)                                                    │
│   - Optimization Goal: OFFSITE_CONVERSIONS (Purchase)                                           │
│   - Attribution Setting: 1-day click or 1-day view (Impulse / short-cycle decision)             │
│   - Placements: Instagram Feed, Instagram Reels, Facebook Feed                                  │
│   - Negative Geo-Exclusion: MANDATORY (Exclude property's home district)                        │
│ • Google Search Strategy: Long-tail value queries ("budget homestay in wayanad under 2000").    │
│ • AI Copywriting Hook: Affordability & group split ("₹750/person with campfire & stream trek"). │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 2: MID-RANGE COMFORT (₹4,000 – ₹7,000 / night)                                             │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Primary Audience: Young tech couples, nuclear families, pet parents, workationers (Age 25–48)│
│ • Geographic Radius: Primary metro feeder corridors (within 5–8 hours drive or short transit).  │
│ • Financial Modeling:                                                                           │
│   - Gross 2-Night Stay Revenue: ₹8,000 – ₹14,000                                                │
│   - Max Allowable CAC Ceiling: ₹1,800 – ₹2,800                                                  │
│   - Default Media Budget: ₹4,000 – ₹6,000 total (Daily pacing: ₹1,000 – ₹1,500/day)             │
│ • Meta Micro-Options:                                                                           │
│   - Objective: OUTCOME_SALES                                                                    │
│   - Optimization Goal: OFFSITE_CONVERSIONS (Purchase)                                           │
│   - Attribution Setting: 7-day click or 1-day view (Considered weekend planning window)        │
│   - Placements: Instagram Feed, Instagram Stories, Instagram Reels, Facebook Feed               │
│   - Negative Geo-Exclusion: MANDATORY (Exclude property's home district)                        │
│ • Google Search Strategy: Amenity & comfort queries ("wayanad plantation resort with pool").     │
│ • AI Copywriting Hook: Comfort, scenic valley balconies, Malabar dining, pet-friendly estates.  │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 3: PREMIUM & LUXURY (₹7,000+ / night)                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Primary Audience: HNIs, C-suite executives, luxury couple retreats, private VIPs (Age 28–58)  │
│ • Geographic Radius: Tier-1 Metro Affluent Pockets + Flight Corridors (Bangalore, Mumbai, Delhi)│
│ • Financial Modeling:                                                                           │
│   - Gross 2-Night Stay Revenue: ₹14,000 – ₹50,000+                                              │
│   - Max Allowable CAC Ceiling: ₹4,000 – ₹8,000                                                  │
│   - Default Media Budget: ₹10,000 – ₹15,000 total (Daily pacing: ₹2,000 – ₹3,000/day)           │
│ • Meta Micro-Options:                                                                           │
│   - Objective: OUTCOME_SALES                                                                    │
│   - Optimization Goal: OFFSITE_CONVERSIONS (Purchase)                                           │
│   - Attribution Setting: 7-day click or 1-day view                                             │
│   - Placements: Manual Placements (High-resolution Instagram Feed & Reels, Facebook Feed)       │
│   - Negative Geo-Exclusion: MANDATORY (Exclude property's home district)                        │
│ • Google Search Strategy: High-CPC commercial intent ("best luxury private pool villa wayanad").│
│ • AI Copywriting Hook: 100% privacy, heated plunge pools, dedicated butler, helicopter transit. │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Autonomous Feeder Engine & Coordinate Targeting

### 3.1 The Coordinate + Radius Mechanism (Meta Ads Manager Parity)
The platform maps leisure feeder hubs to precise coordinates and radius spans:
```json
[
  { "name": "Kochi Metro", "latitude": 9.9312, "longitude": 76.2673, "radius_km": 34 },
  { "name": "Bengaluru Urban", "latitude": 12.9716, "longitude": 77.5946, "radius_km": 30 },
  { "name": "Palakkad Corridor", "latitude": 10.7867, "longitude": 76.6548, "radius_km": 17 },
  { "name": "Kozhikode Coastal", "latitude": 11.2588, "longitude": 75.7804, "radius_km": 25 },
  { "name": "Mysuru Hub", "latitude": 12.2958, "longitude": 76.6394, "radius_km": 20 }
]
```

### 3.2 3-Level Feeder Resolution Hierarchy
1. **Level 1 (Direct Catalog Match):** Matches property `city` or `lat/lng` against `marketing_destination_corridors`.
2. **Level 2 (Gemini AI Autonomous Inference):** If destination is unknown, Gemini scans property coordinates, evaluates regional highways, airports, and affluent population centers, and generates a structured feeder JSON payload. This is automatically saved to the database.
3. **Level 3 (Power-Host Radius Overrides):** In Step 1 of Campaign Studio, power hosts can toggle an expandable map to inspect the pre-selected feeder pins, adjust radius sliders (e.g. 25km $\rightarrow$ 40km), or add/remove feeder cities.

---

## 4. Database Schema Specifications (Postgres / Neon DDL)

```sql
-- 1. ADTECH TIER PROFILES (The Dynamic Strategy Template Registry)
CREATE TABLE marketing_adtech_tier_profiles (
  tier_id VARCHAR(32) PRIMARY KEY, -- 'BUDGET', 'MID_RANGE', 'PREMIUM'
  min_price_minor BIGINT NOT NULL,  -- e.g. 100000 (₹1,000)
  max_price_minor BIGINT,           -- e.g. 400000 (₹4,000), NULL for Premium
  meta_config JSONB NOT NULL,
  google_config JSONB NOT NULL,
  budget_rules JSONB NOT NULL,
  ai_rules JSONB NOT NULL,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  version INT DEFAULT 1
);

-- 2. DESTINATION FEEDER CORRIDORS (Coordinate & Radius Geometry)
CREATE TABLE marketing_destination_corridors (
  id SERIAL PRIMARY KEY,
  destination_slug VARCHAR(120) UNIQUE NOT NULL, -- e.g. 'wayanad', 'coorg', 'goa'
  destination_name VARCHAR(255) NOT NULL,
  center_lat NUMERIC(10, 7) NOT NULL,
  center_lng NUMERIC(10, 7) NOT NULL,
  excluded_regions JSONB NOT NULL DEFAULT '[]'::jsonb, -- e.g. [{"key": "wayanad_district"}]
  tier_feeders JSONB NOT NULL, -- Feeder pins mapped per tier
  discovered_by VARCHAR(32) NOT NULL DEFAULT 'ADMIN', -- 'ADMIN' | 'GEMINI_AI'
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. CAMPAIGN PROFILE BINDING (Audit & Financial Determinism)
ALTER TABLE marketing_campaign_workflows
  ADD COLUMN IF NOT EXISTS tier_id VARCHAR(32) REFERENCES marketing_adtech_tier_profiles(tier_id),
  ADD COLUMN IF NOT EXISTS tier_profile_version INT,
  ADD COLUMN IF NOT EXISTS applied_feeder_snapshot JSONB;
```

---

## 5. API Contracts & Endpoint Specifications

### 5.1 Admin God-Mode Management Endpoints
* `GET /api/marketing/v2/admin/adtech/profiles`
  * *Access:* Admin only (`role === 'admin'`).
  * *Response:* Array of the 3 tier profiles with current JSONB micro-options and versions.
* `PUT /api/marketing/v2/admin/adtech/profiles/:tierId`
  * *Payload:* Complete updated `meta_config`, `google_config`, `budget_rules`, `ai_rules`.
  * *Audit:* Inserts record into `admin_audit_logs` and increments `version`.
* `GET /api/marketing/v2/admin/adtech/corridors`
  * *Response:* List of all active destination feeder corridors and coordinate pins.
* `POST /api/marketing/v2/admin/adtech/corridors`
  * *Payload:* Create or update coordinate pins and exclusion radiuses for a destination.

### 5.2 Host Runtime Discovery Endpoint
* `GET /api/marketing/v2/listings/:id/targeting-defaults`
  * *Parameters:* `listingId`.
  * *Resolution:* Reads `listing.price`, determines `tier_id`, pulls matching `destination_corridor` (or triggers Level 2 Gemini inference if absent).
  * *Response:*
    ```json
    {
      "tierId": "MID_RANGE",
      "tierLabel": "Mid-Range Comfort (₹4,000 – ₹7,000)",
      "suggestedBudget": { "total": 500000, "daily": 100000, "currency": "INR" },
      "feederCorridor": {
        "destination": "Wayanad",
        "pins": [
          { "name": "Bengaluru Urban", "lat": 12.9716, "lng": 77.5946, "radiusKm": 30 },
          { "name": "Kochi Metro", "lat": 9.9312, "lng": 76.2673, "radiusKm": 34 }
        ],
        "excludedRegions": ["Wayanad District"]
      },
      "customizationAllowed": {
        "radiuses": true,
        "addFeederCity": true,
        "biddingStrategy": false,
        "objective": false
      }
    }
    ```

---

## 6. Implementation Roadmap & Technical Milestones

```
M1: Database Migration (032)
    └── Create marketing_adtech_tier_profiles & marketing_destination_corridors.
    └── Seed default Budget, Mid-Range, and Premium profiles.

M2: Admin God-Mode Console UI
    └── Mount /admin/marketing/adtech in AdminMarketingWorkspace.tsx.
    └── Interactive forms for Meta/Google micro-options, radiuses, and budget caps.

M3: Autonomous Feeder Service & Gemini Inferrer
    └── Build FeederCorridorService resolving coordinates, exclusions, and AI inference.

M4: Runtime Compiler Integration
    └── Refactor buildMetaCampaignPlan to dynamically ingest tier profiles & coordinate radiuses.
    └── Bind tier_id and profile version snapshot to marketing_campaign_workflows.

M5: Host Studio Adaptive UI
    └── Update CampaignStudio.tsx with dynamic budget presets and expandable feeder map.
```

---

## 7. Security, Financial Invariants & Compliance

1. **Immutable Snapshotting:** Once a campaign is funded or approved, its `tier_profile_version` and `applied_feeder_snapshot` are locked. Changing an Admin tier profile never mutates an active, running ad.
2. **Restricted Host Surface:** Host overrides are strictly white-listed to geographic radiuses and city additions. Hosts cannot alter `optimization_goal`, `bid_strategy`, or `attribution_spec`.
3. **Audit Compliance:** Every mutation to tier profiles or feeder radiuses requires an administrative session and writes to `admin_audit_logs` with before/after state diffs.
