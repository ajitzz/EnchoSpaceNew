import { describe, it, expect } from 'vitest';
import { DynamicPricingSyncService } from '../lib/dynamicPricingSyncService';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService';

describe('Milestone 2: Dynamic Listing Pricing Real-Time Sync (Gap 16)', () => {
  describe('formatPrice', () => {
    it('formats INR prices with Indian numbering system and ₹ symbol', () => {
      expect(DynamicPricingSyncService.formatPrice(4500, 'INR')).toBe('₹4,500');
      expect(DynamicPricingSyncService.formatPrice(125000, 'INR')).toBe('₹1,25,000');
    });

    it('formats USD, EUR, and GBP prices correctly', () => {
      expect(DynamicPricingSyncService.formatPrice(250, 'USD')).toBe('$250');
      expect(DynamicPricingSyncService.formatPrice(180, 'EUR')).toBe('€180');
      expect(DynamicPricingSyncService.formatPrice(150, 'GBP')).toBe('£150');
    });
  });

  describe('generateUpdatedAdCopy', () => {
    it('generates updated Meta ad copy with new nightly rate', () => {
      const copy = DynamicPricingSyncService.generateUpdatedAdCopy(
        'Serene Wayanad Villa',
        'Wayanad, Kerala',
        4500,
        'INR',
        'META'
      );

      expect(copy.headline).toContain('₹4,500/night');
      expect(copy.primaryText).toContain('Serene Wayanad Villa');
      expect(copy.primaryText).toContain('₹4,500 per night');
      expect(copy.callToAction).toBe('Book Now');
    });

    it('generates updated Google Responsive Search Ad (RSA) copy with new nightly rate', () => {
      const copy = DynamicPricingSyncService.generateUpdatedAdCopy(
        'Malibu Oceanfront Retreat',
        'Malibu, California',
        850,
        'USD',
        'GOOGLE'
      );

      expect(copy.headline).toContain('Malibu Oceanfront Retreat from $850/night');
      expect(copy.primaryText).toContain('starting at $850 per night on Encho');
      expect(copy.callToAction).toBe('Book Online');
    });
  });

  describe('onListingPriceUpdated', () => {
    it('returns 0 synced campaigns when oldPrice equals newPrice', async () => {
      const result = await DynamicPricingSyncService.onListingPriceUpdated(101, 3500, 3500, 'INR');
      expect(result.synced_campaigns_count).toBe(0);
      expect(result.events).toHaveLength(0);
    });

    it('dispatches pricing update events across active campaigns with correct audit payload', async () => {
      // Mock db pool
      const mockCampaigns = [
        { id: 7107, title: 'Wayanad Nature Resort', target_locations: 'Bangalore, Kochi', platforms: 'meta,instagram', status: 'LIVE' },
        { id: 7108, title: 'Wayanad Nature Resort Search', target_locations: 'Bangalore, Mumbai', platforms: 'google,search', status: 'CANARY_ACTIVE' }
      ];

      const mockDb = {
        query: async (sql: string, params: any[]) => {
          if (sql.includes('CREATE TABLE')) return { rows: [] };
          if (sql.includes('SELECT id, title')) return { rows: mockCampaigns };
          if (sql.includes('INSERT INTO listing_pricing_sync_events')) return { rows: [] };
          return { rows: [] };
        }
      };

      const result = await DynamicPricingSyncService.onListingPriceUpdated(
        101,
        3500,
        4500,
        'INR',
        mockDb
      );

      expect(result.synced_campaigns_count).toBe(2);
      expect(result.events[0].campaign_id).toBe(7107);
      expect(result.events[0].provider).toBe('META');
      expect(result.events[0].new_price).toBe(4500);
      expect(result.events[0].synced_ad_copy).toContain('₹4,500');

      expect(result.events[1].campaign_id).toBe(7108);
      expect(result.events[1].provider).toBe('GOOGLE');
      expect(result.events[1].new_price).toBe(4500);
      expect(result.events[1].synced_ad_copy).toContain('₹4,500');
    });
  });

  describe('CampaignControlCenterService.buildPricingSyncStatus', () => {
    it('projects synchronized pricing state and formatted nightly rate', () => {
      const truth = {
        listing_price: 5200,
        currency: 'INR',
        created_at: new Date().toISOString()
      };

      const status = CampaignControlCenterService.buildPricingSyncStatus(truth);

      expect(status.listing_nightly_price).toBe(5200);
      expect(status.formatted_nightly_price).toBe('₹5,200');
      expect(status.sync_state).toBe('SYNCHRONIZED');
      expect(status.active_ad_copy_preview).toContain('₹5,200/night');
    });
  });

  describe('forceCampaignPriceSync & getPricingSyncHistory', () => {
    it('executes manual force sync and records audit event in database', async () => {
      const mockCampaign = {
        id: 7107,
        title: 'Munnar Tea Valley Villa',
        target_locations: 'Kochi, Trivandrum',
        platforms: 'meta,instagram',
        listing_id: 202,
        price: 6500,
        listing_title: 'Munnar Tea Valley Villa',
        city: 'Munnar'
      };

      const mockDb = {
        query: async (sql: string, params: any[]) => {
          if (sql.includes('SELECT c.id')) return { rows: [mockCampaign] };
          if (sql.includes('INSERT INTO listing_pricing_sync_events')) return { rows: [] };
          return { rows: [] };
        }
      };

      const result = await DynamicPricingSyncService.forceCampaignPriceSync(7107, mockDb);

      expect(result.success).toBe(true);
      expect(result.campaign_id).toBe(7107);
      expect(result.synced_price).toBe(6500);
      expect(result.formatted_price).toBe('₹6,500');
      expect(result.synced_ad_copy).toContain('₹6,500/night');
    });

    it('retrieves recent pricing sync history with limit', async () => {
      const mockHistoryRows = [
        { id: 1, listing_id: 202, campaign_id: 7107, old_price: 5000, new_price: 6500, currency: 'INR', provider: 'META', sync_status: 'SYNCED', synced_ad_copy: 'Headline', synced_at: '2026-08-18T14:00:00Z' }
      ];

      const mockDb = {
        query: async (sql: string, params: any[]) => {
          if (sql.includes('SELECT id, listing_id')) return { rows: mockHistoryRows };
          return { rows: [] };
        }
      };

      const history = await DynamicPricingSyncService.getPricingSyncHistory(7107, mockDb, 5);

      expect(history).toHaveLength(1);
      expect(history[0].campaign_id).toBe(7107);
      expect(history[0].old_price).toBe(5000);
      expect(history[0].new_price).toBe(6500);
      expect(history[0].provider).toBe('META');
    });
  });
});
