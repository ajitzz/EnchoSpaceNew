-- Migration 044: Feeder Corridors & God-Mode Ads Manager Parity Targeting
-- Enforces:
-- 1. Standardized Feeder Corridors: FeederTargeting = Union(CityCenter, Radius) \ LocalDistrictBoundary
-- 2. God-Mode Meta & Google targeting configurations with strict HEC compliance, placements, bidding, and keywords
-- 3. AI Copilot metadata storage and versioned Admin audit trail

CREATE TABLE IF NOT EXISTS marketing_feeder_corridor_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_code VARCHAR(50) NOT NULL,
    corridor_name VARCHAR(150) NOT NULL,
    source_city VARCHAR(100) NOT NULL,
    center_lat DECIMAL(10, 7) NOT NULL,
    center_lng DECIMAL(10, 7) NOT NULL,
    radius_km DECIMAL(6, 2) NOT NULL DEFAULT 25.00 CHECK (radius_km > 0 AND radius_km <= 100),
    excluded_local_district VARCHAR(100) NOT NULL,
    tier_eligibility VARCHAR(50) NOT NULL DEFAULT 'ALL' CHECK (tier_eligibility IN ('LUXURY', 'PREMIUM', 'BUDGET', 'ALL')),
    expected_roas_benchmark DECIMAL(4, 2) DEFAULT 3.80 CHECK (expected_roas_benchmark > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feeder_corridors_region ON marketing_feeder_corridor_definitions(region_code, is_active);

-- Seed Canonical High-Converting Feeder Corridors
INSERT INTO marketing_feeder_corridor_definitions (region_code, corridor_name, source_city, center_lat, center_lng, radius_km, excluded_local_district, tier_eligibility, expected_roas_benchmark)
VALUES
    -- Wayanad Feeder Corridors
    ('WAYANAD', 'Bangalore Tech Corridor (Outer Ring / Whitefield / Koramangala)', 'Bangalore', 12.9352000, 77.6245000, 25.00, 'Wayanad', 'ALL', 4.20),
    ('WAYANAD', 'South Mumbai Affluent Corridor (Colaba to Bandra)', 'Mumbai', 18.9220000, 72.8347000, 15.00, 'Wayanad', 'LUXURY', 3.90),
    ('WAYANAD', 'Chennai Central Weekend Traveler Hub', 'Chennai', 13.0827000, 80.2707000, 20.00, 'Wayanad', 'ALL', 3.50),

    -- Goa Feeder Corridors
    ('GOA', 'Mumbai Metropolitan Financial Hub', 'Mumbai', 19.0760000, 72.8777000, 25.00, 'North Goa', 'ALL', 4.50),
    ('GOA', 'Pune IT & Automobile Corridor', 'Pune', 18.5204000, 73.8567000, 20.00, 'North Goa', 'ALL', 4.10),
    ('GOA', 'Delhi NCR Premium Holidaymakers', 'Delhi', 28.6139000, 77.2090000, 30.00, 'North Goa', 'LUXURY', 4.00),

    -- Coorg Feeder Corridors
    ('COORG', 'Bangalore West & Central Corridor', 'Bangalore', 12.9716000, 77.5946000, 25.00, 'Kodagu', 'ALL', 4.30),
    ('COORG', 'Mysore Heritage Gateway', 'Mysore', 12.2958000, 76.6394000, 15.00, 'Kodagu', 'ALL', 3.60),
    ('COORG', 'Mangalore Coastal Corridor', 'Mangalore', 12.9141000, 74.8560000, 18.00, 'Kodagu', 'ALL', 3.40)
ON CONFLICT DO NOTHING;

-- God-Mode Admin Targeting Configuration Table
CREATE TABLE IF NOT EXISTS campaign_godmode_targeting (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
    housing_special_category BOOLEAN NOT NULL DEFAULT true,
    meta_placements JSONB NOT NULL DEFAULT '["INSTAGRAM_REELS", "INSTAGRAM_STORIES", "FACEBOOK_FEED"]'::jsonb,
    selected_corridor_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    custom_geo_radii JSONB NOT NULL DEFAULT '[]'::jsonb,
    excluded_districts JSONB NOT NULL DEFAULT '[]'::jsonb,
    bidding_strategy VARCHAR(50) NOT NULL DEFAULT 'TARGET_ROAS' CHECK (bidding_strategy IN ('TARGET_ROAS', 'MAX_CONVERSIONS', 'TARGET_CPA', 'MAX_CLICKS')),
    target_roas_floor DECIMAL(4, 2) DEFAULT 3.00 CHECK (target_roas_floor >= 1.00),
    cpc_ceiling_cents INT DEFAULT 150 CHECK (cpc_ceiling_cents >= 0),
    target_cpa_cents INT DEFAULT 1200 CHECK (target_cpa_cents >= 0),
    google_search_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    google_negative_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    google_sitelinks JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_copilot_recommendation JSONB,
    configured_by_admin_id INT NOT NULL,
    version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_campaign_godmode_targeting UNIQUE (campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_godmode_targeting_campaign ON campaign_godmode_targeting(campaign_id);
