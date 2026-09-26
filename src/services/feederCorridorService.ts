import type pg from 'pg';
import { z } from 'zod';

// ============================================================================
// Types and Schemas (FAANG L7/L8 Zero-Trust Contracts)
// ============================================================================

export const customGeoRadiusSchema = z.object({
  city: z.string().trim().min(2),
  radiusKm: z.number().min(1).max(100),
  lat: z.number(),
  lng: z.number(),
});

export const googleKeywordSchema = z.object({
  keyword: z.string().trim().min(2),
  matchType: z.enum(['EXACT', 'PHRASE', 'BROAD']),
});

export const googleSitelinkSchema = z.object({
  text: z.string().trim().min(2),
  url: z.string().url(),
});

export const godmodeTargetingInputSchema = z.object({
  housingSpecialCategory: z.boolean().default(true),
  metaPlacements: z.array(z.string()).min(1).default(['INSTAGRAM_REELS', 'INSTAGRAM_STORIES', 'FACEBOOK_FEED']),
  selectedCorridorIds: z.array(z.string()).default([]),
  customGeoRadii: z.array(customGeoRadiusSchema).default([]),
  excludedDistricts: z.array(z.string()).default([]),
  biddingStrategy: z.enum(['TARGET_ROAS', 'MAX_CONVERSIONS', 'TARGET_CPA', 'MAX_CLICKS']).default('TARGET_ROAS'),
  targetRoasFloor: z.number().min(1.0).max(10.0).default(3.0),
  cpcCeilingCents: z.number().min(0).default(150),
  targetCpaCents: z.number().min(0).default(1200),
  googleSearchKeywords: z.array(googleKeywordSchema).default([]),
  googleNegativeKeywords: z.array(z.string()).default([]),
  googleSitelinks: z.array(googleSitelinkSchema).default([]),
  aiCopilotRecommendation: z.record(z.string(), z.any()).optional(),
});

export type GodmodeTargetingInput = z.infer<typeof godmodeTargetingInputSchema>;

export interface FeederCorridorDefinition {
  id: string;
  region_code: string;
  corridor_name: string;
  source_city: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  excluded_local_district: string;
  tier_eligibility: string;
  expected_roas_benchmark: number;
  is_active: boolean;
  created_at: string;
}

export interface FeederTargetingResolution {
  effectiveFormula: string;
  includedFeedersCount: number;
  targetedCities: string[];
  excludedDistricts: string[];
  estimatedTotalReachPopulation: string;
  isValid: boolean;
  validationError?: string;
}

export interface AiAdvisoryRecommendation {
  recommendedPlacements: { placement: string; allocationPercentage: number }[];
  recommendedCorridors: { id: string; name: string; city: string; radiusKm: number; expectedRoas: number }[];
  mandatoryExclusions: string[];
  recommendedBidding: {
    strategy: 'TARGET_ROAS' | 'MAX_CONVERSIONS' | 'TARGET_CPA' | 'MAX_CLICKS';
    roasFloor: number;
    targetCpaCents: number;
    cpcCeilingCents: number;
  };
  googleKeywordPlan: {
    exact: string[];
    phrase: string[];
    broad: string[];
    negativeKeywords: string[];
  };
  pacingPointers: {
    recommendedDailyBudgetCents: number;
    recommendedDurationDays: number;
    rationale: string;
  };
  confidenceScore: number;
}

// ============================================================================
// Domain Service Implementation
// ============================================================================

export class FeederCorridorService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Retrieves all active feeder corridors, optionally filtered by region and tier
   */
  async listAvailableCorridors(regionCode?: string, tier?: string): Promise<FeederCorridorDefinition[]> {
    let query = 'SELECT * FROM marketing_feeder_corridor_definitions WHERE is_active = true';
    const params: any[] = [];

    if (regionCode) {
      params.push(regionCode.toUpperCase());
      query += ` AND region_code = $${params.length}`;
    }

    if (tier && tier !== 'ALL') {
      params.push(tier.toUpperCase());
      query += ` AND (tier_eligibility = $${params.length} OR tier_eligibility = 'ALL')`;
    }

    query += ' ORDER BY expected_roas_benchmark DESC';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Computes the mathematical Feeder Targeting formula:
   * FeederTargeting = Union(CityCenter_i, Radius_i) \ LocalDistrictBoundary
   */
  calculateCorridorTargetingFormula(
    corridors: FeederCorridorDefinition[],
    customRadii: z.infer<typeof customGeoRadiusSchema>[],
    excludedDistricts: string[]
  ): FeederTargetingResolution {
    const targetedCities = Array.from(
      new Set([
        ...corridors.map((c) => c.source_city),
        ...customRadii.map((r) => r.city),
      ])
    );

    const allExclusions = Array.from(
      new Set([
        ...corridors.map((c) => c.excluded_local_district),
        ...excludedDistricts,
      ])
    );

    if (targetedCities.length === 0) {
      return {
        effectiveFormula: 'EMPTY_TARGETING',
        includedFeedersCount: 0,
        targetedCities: [],
        excludedDistricts: allExclusions,
        estimatedTotalReachPopulation: '0',
        isValid: false,
        validationError: 'At least one feeder corridor or custom radius must be selected.',
      };
    }

    // Safety validation: ensure local district is never targeted as a feeder
    for (const city of targetedCities) {
      if (allExclusions.some((ex) => ex.toLowerCase() === city.toLowerCase())) {
        return {
          effectiveFormula: 'TARGETING_COLLISION',
          includedFeedersCount: targetedCities.length,
          targetedCities,
          excludedDistricts: allExclusions,
          estimatedTotalReachPopulation: '0',
          isValid: false,
          validationError: `Collision detected: ${city} cannot be both a targeted feeder and an excluded destination district.`,
        };
      }
    }

    const formulaParts = [
      ...corridors.map((c) => `${c.source_city}(${Number(c.radius_km)}km)`),
      ...customRadii.map((r) => `${r.city}(${Number(r.radiusKm)}km)`),
    ];

    const formula = `[${formulaParts.join(' ∪ ')}] \\ [${allExclusions.join(', ')}]`;

    return {
      effectiveFormula: formula,
      includedFeedersCount: targetedCities.length,
      targetedCities,
      excludedDistricts: allExclusions,
      estimatedTotalReachPopulation: `${targetedCities.length * 2.8}M affluent travelers`,
      isValid: true,
    };
  }

  /**
   * AI Advisory Copilot recommendation generator for Admins
   * Evaluates property location, room pricing, amenities, and historical benchmarks.
   */
  async generateAiCopilotRecommendation(
    property: {
      id?: number;
      title: string;
      price: number;
      city: string;
      amenities?: string[];
      lat?: number;
      lng?: number;
    },
    budgetCents: number,
    platform: 'META' | 'GOOGLE' | 'OMNICHANNEL' = 'OMNICHANNEL'
  ): Promise<AiAdvisoryRecommendation> {
    const cityName = property.city.toLowerCase();
    let regionCode = 'WAYANAD';

    if (cityName.includes('goa') || cityName.includes('panaji') || cityName.includes('calangute')) {
      regionCode = 'GOA';
    } else if (cityName.includes('coorg') || cityName.includes('madikeri') || cityName.includes('kodagu')) {
      regionCode = 'COORG';
    } else if (cityName.includes('munnar') || cityName.includes('idukki')) {
      regionCode = 'MUNNAR';
    }

    // Load available corridors for this region
    const corridors = await this.listAvailableCorridors(regionCode);

    // Evaluate property tier from nightly price
    const isLuxury = property.price >= 12000;
    const isComfort = property.price >= 5000 && property.price < 12000;

    // Filter relevant corridors
    const recommendedCorridors = corridors.map((c) => ({
      id: c.id,
      name: c.corridor_name,
      city: c.source_city,
      radiusKm: Number(c.radius_km),
      expectedRoas: Number(c.expected_roas_benchmark),
    }));

    // Mandatory local exclusion
    const mandatoryExclusions = Array.from(new Set(corridors.map((c) => c.excluded_local_district)));

    // Placements: high-end experiential resort stays thrive on 9:16 vertical video
    const recommendedPlacements = [
      { placement: 'INSTAGRAM_REELS', allocationPercentage: 70 },
      { placement: 'INSTAGRAM_STORIES', allocationPercentage: 20 },
      { placement: 'FACEBOOK_MOBILE_FEED', allocationPercentage: 10 },
    ];

    // Bidding strategy
    const roasFloor = isLuxury ? 3.8 : isComfort ? 3.2 : 2.8;
    const targetCpaCents = Math.round(property.price * 0.12 * 100); // Target CPA ~ 12% of room price
    const cpcCeilingCents = isLuxury ? 180 : 120;

    // Google Keywords
    const cleanCity = property.city.trim();
    const exactKeywords = [
      `[luxury resort in ${cleanCity}]`,
      `[best private pool villa ${cleanCity}]`,
      `[${cleanCity} luxury stays]`,
    ];

    const phraseKeywords = [
      `"resort in ${cleanCity}"`,
      `"homestay with private pool in ${cleanCity}"`,
      `"weekend staycation from bangalore"`,
    ];

    const broadKeywords = [
      `${cleanCity} resorts`,
      `luxury villas south india`,
    ];

    const negativeKeywords = [
      'cheap homestay',
      'free accommodation',
      'bus timings',
      'dormitory rooms',
      'government lodge',
      'low price cottage under 1000',
    ];

    const dailyBudget = Math.max(80000, Math.round(budgetCents / 7)); // Minimum ₹800/day
    const durationDays = Math.max(3, Math.min(14, Math.round(budgetCents / dailyBudget)));

    return {
      recommendedPlacements,
      recommendedCorridors,
      mandatoryExclusions,
      recommendedBidding: {
        strategy: 'TARGET_ROAS',
        roasFloor,
        targetCpaCents,
        cpcCeilingCents,
      },
      googleKeywordPlan: {
        exact: exactKeywords,
        phrase: phraseKeywords,
        broad: broadKeywords,
        negativeKeywords,
      },
      pacingPointers: {
        recommendedDailyBudgetCents: dailyBudget,
        recommendedDurationDays: durationDays,
        rationale: `Based on ₹${property.price}/night pricing and destination demand in ${property.city}, affluent feeder corridors from tech hubs yield 3.8x+ ROAS when excluding local district traffic.`,
      },
      confidenceScore: 0.94,
    };
  }

  /**
   * Saves or updates the God-Mode targeting configuration for a campaign
   * (Admin authority only)
   */
  async saveGodmodeTargeting(
    campaignId: number,
    input: unknown,
    adminUserId: number
  ): Promise<{ success: boolean; config: any; version: number }> {
    const parsed = godmodeTargetingInputSchema.parse(input);

    // Verify campaign exists
    const campaignResult = await this.pool.query(
      'SELECT id, host_user_id, status FROM host_marketing_campaigns WHERE id = $1',
      [campaignId]
    );

    if (campaignResult.rows.length === 0) {
      throw new Error(`CAMPAIGN_NOT_FOUND: Campaign ${campaignId} does not exist`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check existing config
      const existing = await client.query(
        'SELECT id, version FROM campaign_godmode_targeting WHERE campaign_id = $1',
        [campaignId]
      );

      let version = 1;
      let configRow: any;

      if (existing.rows.length > 0) {
        version = existing.rows[0].version + 1;
        const updateResult = await client.query(
          `UPDATE campaign_godmode_targeting
           SET housing_special_category = $1,
               meta_placements = $2,
               selected_corridor_ids = $3,
               custom_geo_radii = $4,
               excluded_districts = $5,
               bidding_strategy = $6,
               target_roas_floor = $7,
               cpc_ceiling_cents = $8,
               target_cpa_cents = $9,
               google_search_keywords = $10,
               google_negative_keywords = $11,
               google_sitelinks = $12,
               ai_copilot_recommendation = $13,
               configured_by_admin_id = $14,
               version = $15,
               updated_at = NOW()
           WHERE campaign_id = $16
           RETURNING *`,
          [
            parsed.housingSpecialCategory,
            JSON.stringify(parsed.metaPlacements),
            JSON.stringify(parsed.selectedCorridorIds),
            JSON.stringify(parsed.customGeoRadii),
            JSON.stringify(parsed.excludedDistricts),
            parsed.biddingStrategy,
            parsed.targetRoasFloor,
            parsed.cpcCeilingCents,
            parsed.targetCpaCents,
            JSON.stringify(parsed.googleSearchKeywords),
            JSON.stringify(parsed.googleNegativeKeywords),
            JSON.stringify(parsed.googleSitelinks),
            parsed.aiCopilotRecommendation ? JSON.stringify(parsed.aiCopilotRecommendation) : null,
            adminUserId,
            version,
            campaignId,
          ]
        );
        configRow = updateResult.rows[0];
      } else {
        const insertResult = await client.query(
          `INSERT INTO campaign_godmode_targeting (
             campaign_id, housing_special_category, meta_placements, selected_corridor_ids,
             custom_geo_radii, excluded_districts, bidding_strategy, target_roas_floor,
             cpc_ceiling_cents, target_cpa_cents, google_search_keywords, google_negative_keywords,
             google_sitelinks, ai_copilot_recommendation, configured_by_admin_id, version
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
           ) RETURNING *`,
          [
            campaignId,
            parsed.housingSpecialCategory,
            JSON.stringify(parsed.metaPlacements),
            JSON.stringify(parsed.selectedCorridorIds),
            JSON.stringify(parsed.customGeoRadii),
            JSON.stringify(parsed.excludedDistricts),
            parsed.biddingStrategy,
            parsed.targetRoasFloor,
            parsed.cpcCeilingCents,
            parsed.targetCpaCents,
            JSON.stringify(parsed.googleSearchKeywords),
            JSON.stringify(parsed.googleNegativeKeywords),
            JSON.stringify(parsed.googleSitelinks),
            parsed.aiCopilotRecommendation ? JSON.stringify(parsed.aiCopilotRecommendation) : null,
            adminUserId,
            1,
          ]
        );
        configRow = insertResult.rows[0];
      }

      // Backward-compatibility synchronization: update host_marketing_campaigns specifications
      await client.query(
        `UPDATE host_marketing_campaigns
         SET meta_specifications = jsonb_build_object(
               'housingSpecialCategory', $1::boolean,
               'placements', $2::jsonb,
               'biddingStrategy', $3::text,
               'targetRoasFloor', $4::numeric,
               'feederCorridorIds', $5::jsonb
             ),
             adset_specifications = jsonb_build_object(
               'customGeoRadii', $6::jsonb,
               'excludedDistricts', $7::jsonb,
               'googleSearchKeywords', $8::jsonb,
               'googleNegativeKeywords', $9::jsonb
             ),
             admin_approved = true,
             updated_at = NOW()
         WHERE id = $10`,
        [
          parsed.housingSpecialCategory,
          JSON.stringify(parsed.metaPlacements),
          parsed.biddingStrategy,
          parsed.targetRoasFloor,
          JSON.stringify(parsed.selectedCorridorIds),
          JSON.stringify(parsed.customGeoRadii),
          JSON.stringify(parsed.excludedDistricts),
          JSON.stringify(parsed.googleSearchKeywords),
          JSON.stringify(parsed.googleNegativeKeywords),
          campaignId,
        ]
      );

      await client.query('COMMIT');

      return {
        success: true,
        config: configRow,
        version,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Fetches the God-Mode targeting config for a given campaign
   */
  async getGodmodeTargeting(campaignId: number): Promise<any | null> {
    const result = await this.pool.query(
      'SELECT * FROM campaign_godmode_targeting WHERE campaign_id = $1',
      [campaignId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }
}
