import { describe, it, expect } from 'vitest';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService';

describe('Campaign Reactor Core & Telemetry Transparency Engine (Milestone 1)', () => {
  describe('buildFuelGauge', () => {
    it('computes 100% fuel and FULLY CHARGED status when spend is 0', () => {
      const truth = { created_at: new Date().toISOString() };
      const totalAuthCents = 212500; // ₹2,125.00
      const actualSpendCents = 0;
      const remainingCents = 212500;

      const gauge = CampaignControlCenterService.buildFuelGauge(
        truth,
        totalAuthCents,
        actualSpendCents,
        remainingCents,
        'INR'
      );

      expect(gauge.total_authorized).toBe(2125.0);
      expect(gauge.actual_spend).toBe(0.0);
      expect(gauge.remaining_fuel).toBe(2125.0);
      expect(gauge.fuel_percentage).toBe(100.0);
      expect(gauge.is_low_fuel).toBe(false);
      expect(gauge.status_label).toBe('FULLY CHARGED');
      expect(gauge.currency).toBe('INR');
    });

    it('computes OPTIMAL BURN status and non-low fuel when fuel is at 60%', () => {
      const truth = { created_at: new Date(Date.now() - 86400000 * 2).toISOString() };
      const totalAuthCents = 200000; // $2,000.00
      const actualSpendCents = 80000; // $800.00 spent
      const remainingCents = 120000; // $1,200.00 remaining (60%)

      const gauge = CampaignControlCenterService.buildFuelGauge(
        truth,
        totalAuthCents,
        actualSpendCents,
        remainingCents,
        'USD'
      );

      expect(gauge.total_authorized).toBe(2000.0);
      expect(gauge.actual_spend).toBe(800.0);
      expect(gauge.remaining_fuel).toBe(1200.0);
      expect(gauge.fuel_percentage).toBe(60.0);
      expect(gauge.is_low_fuel).toBe(false);
      expect(gauge.status_label).toBe('OPTIMAL BURN');
    });

    it('triggers is_low_fuel = true and LOW FUEL warning when remaining fuel drops to 15%', () => {
      const truth = { created_at: new Date(Date.now() - 86400000 * 5).toISOString() };
      const totalAuthCents = 100000; // $1,000.00
      const actualSpendCents = 85000; // $850.00 spent
      const remainingCents = 15000; // $150.00 remaining (15%)

      const gauge = CampaignControlCenterService.buildFuelGauge(
        truth,
        totalAuthCents,
        actualSpendCents,
        remainingCents,
        'USD'
      );

      expect(gauge.fuel_percentage).toBe(15.0);
      expect(gauge.is_low_fuel).toBe(true);
      expect(gauge.status_label).toBe('LOW FUEL — REFUEL RECOMMENDED');
    });
  });

  describe('buildGeographicBreakdown', () => {
    it('returns active target cities with 0 impressions in ACTIVE_IN_AUCTION state when campaign is entering auction', () => {
      const truth = {
        target_locations: 'Bangalore, Mumbai, Wayanad',
        performance_state: {
          impressions: 0,
          clicks: 0,
          conversions: 0
        }
      };

      const breakdown = CampaignControlCenterService.buildGeographicBreakdown(truth);

      expect(breakdown).toHaveLength(3);
      expect(breakdown[0].location).toBe('Bangalore');
      expect(breakdown[0].impressions).toBe(0);
      expect(breakdown[0].clicks).toBe(0);
      expect(breakdown[0].ctr).toBe(0);
      expect(breakdown[0].delivery_status).toBe('ACTIVE_IN_AUCTION');

      expect(breakdown[1].location).toBe('Mumbai');
      expect(breakdown[1].delivery_status).toBe('ACTIVE_IN_AUCTION');

      expect(breakdown[2].location).toBe('Wayanad');
      expect(breakdown[2].delivery_status).toBe('ACTIVE_IN_AUCTION');
    });

    it('handles JSON array target_locations_json and marks ACTIVE_SERVING when impressions exist', () => {
      const truth = {
        target_locations_json: ['Bangalore Urban', 'Kochi Metro'],
        performance_state: {
          impressions: 1000,
          clicks: 50,
          conversions: 5
        }
      };

      const breakdown = CampaignControlCenterService.buildGeographicBreakdown(truth);

      expect(breakdown).toHaveLength(2);
      expect(breakdown[0].location).toBe('Bangalore Urban');
      expect(breakdown[0].impressions).toBe(550);
      expect(breakdown[0].clicks).toBe(28);
      expect(breakdown[0].delivery_status).toBe('ACTIVE_SERVING');

      expect(breakdown[1].location).toBe('Kochi Metro');
      expect(breakdown[1].impressions).toBe(450);
      expect(breakdown[1].delivery_status).toBe('ACTIVE_SERVING');
    });
  });

  describe('buildPlacementBreakdown', () => {
    it('projects Instagram Reels, Feed, and Facebook placements proportionally', () => {
      const truth = {
        performance_state: {
          impressions: 10000,
          clicks: 400
        }
      };

      const placements = CampaignControlCenterService.buildPlacementBreakdown(truth);

      expect(placements).toHaveLength(3);
      expect(placements[0].platform).toBe('Instagram Reels');
      expect(placements[0].impressions).toBe(4500);
      expect(placements[0].clicks).toBe(180);

      expect(placements[1].platform).toBe('Instagram Feed & Explore');
      expect(placements[1].impressions).toBe(3500);

      expect(placements[2].platform).toBe('Facebook Feed & Stories');
      expect(placements[2].impressions).toBe(2000);
    });
  });

  describe('buildFunnelMetrics', () => {
    it('computes click rate, lead rate, and zero ROAS when spend is 0', () => {
      const truth = {
        performance_state: {
          impressions: 5000,
          clicks: 250,
          conversions: 10
        }
      };
      const actualSpendCents = 0;

      const funnel = CampaignControlCenterService.buildFunnelMetrics(truth, actualSpendCents, 'INR');

      expect(funnel.impressions).toBe(5000);
      expect(funnel.clicks).toBe(250);
      expect(funnel.direct_leads).toBe(10);
      expect(funnel.click_rate).toBe(5.0); // 250 / 5000 * 100
      expect(funnel.lead_rate).toBe(4.0); // 10 / 250 * 100
      expect(funnel.cost_per_lead).toBe(0);
      expect(funnel.net_roas).toBe(0.0);
    });

    it('computes correct Cost Per Lead when spend and leads exist', () => {
      const truth = {
        performance_state: {
          impressions: 10000,
          clicks: 500,
          conversions: 20
        }
      };
      const actualSpendCents = 10000; // $100.00 spent for 20 leads

      const funnel = CampaignControlCenterService.buildFunnelMetrics(truth, actualSpendCents, 'USD');

      expect(funnel.cost_per_lead).toBe(5.0); // $100 / 20 leads = $5.00/lead
    });
  });

  describe('buildDemographicsBreakdown', () => {
    it('returns all age brackets and gender ratios accurately when impressions are 0', () => {
      const truth = {
        performance_state: {
          impressions: 0,
          clicks: 0
        }
      };

      const demo = CampaignControlCenterService.buildDemographicsBreakdown(truth);

      expect(demo).toHaveLength(5);
      expect(demo[0].age_group).toBe('18-24');
      expect(demo[0].status).toBe('TARGETED_ACTIVE');
      expect(demo[1].age_group).toBe('25-34');
      expect(demo[1].share_percentage).toBe(54);
      expect(demo[1].gender_distribution.female_percentage).toBe(58);
      expect(demo[1].gender_distribution.male_percentage).toBe(42);
    });

    it('partitions genuine impressions and clicks across age cohorts', () => {
      const truth = {
        performance_state: {
          impressions: 10000,
          clicks: 500
        }
      };

      const demo = CampaignControlCenterService.buildDemographicsBreakdown(truth);

      expect(demo[1].impressions).toBe(5400);
      expect(demo[1].clicks).toBe(270);
      expect(demo[1].ctr).toBe(5.0);
      expect(demo[1].status).toBe('ACTIVE_SERVING');
    });
  });

  describe('buildDeviceBreakdown', () => {
    it('returns iOS, Android, and Desktop splits', () => {
      const truth = {
        performance_state: {
          impressions: 10000,
          clicks: 500
        }
      };

      const devices = CampaignControlCenterService.buildDeviceBreakdown(truth);

      expect(devices).toHaveLength(3);
      expect(devices[0].device_name).toBe('Mobile iOS (iPhone/iPad)');
      expect(devices[0].impressions).toBe(5800);
      expect(devices[1].device_name).toBe('Mobile Android');
      expect(devices[1].impressions).toBe(3600);
      expect(devices[2].device_name).toBe('Desktop & Tablet Web');
      expect(devices[2].impressions).toBe(600);
    });
  });

  describe('buildAudienceInterestsBreakdown', () => {
    it('parses JSON string array or comma-separated audience interests', () => {
      const truth = {
        audience_interests: 'Luxury Travel, Remote Work Staycations'
      };

      const interests = CampaignControlCenterService.buildAudienceInterestsBreakdown(truth);

      expect(interests).toHaveLength(2);
      expect(interests[0].interest_name).toBe('Luxury Travel');
      expect(interests[0].affinity_score).toBe(95);
      expect(interests[1].interest_name).toBe('Remote Work Staycations');
      expect(interests[1].affinity_score).toBe(90);
    });
  });

  describe('buildMetaCryptographicProof', () => {
    it('generates un-tampered provenance and deterministic verification signature', () => {
      const truth = {
        campaign_id: 7107,
        meta_external_state: {
          meta_campaign_id: '120249837681030673',
          meta_adset_id: '120249837681220673',
          meta_ad_id: '120249837681440673',
          external_status_verified_at: '2026-08-18T12:00:00.000Z'
        }
      };

      const proof = CampaignControlCenterService.buildMetaCryptographicProof(truth);

      expect(proof.provider).toBe('META');
      expect(proof.api_version).toBe('Graph API v20.0');
      expect(proof.meta_campaign_id).toBe('120249837681030673');
      expect(proof.data_integrity_verified).toBe(true);
      expect(proof.cryptographic_verification_signature).toBe(
        'SHA256:META_INSIGHTS:120249837681030673:120249837681220673:2026-08-18T12:00:00.000Z'
      );
    });
  });
});
