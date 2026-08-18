import { describe, it, expect } from 'vitest';
import { RetargetingPixelService } from '../lib/retargetingPixelService';

describe('Milestone 3: Cross-Platform Retargeting & First-Party Pixel Engine (Gap 15)', () => {
  describe('hashUserData', () => {
    it('hashes emails to lowercase trimmed SHA-256 for Meta CAPI compliance', () => {
      const email = ' Traveler.John@Example.COM ';
      const hashed = RetargetingPixelService.hashUserData(email);
      
      expect(hashed).toBeDefined();
      expect(hashed).toHaveLength(64); // SHA-256 hex length
      // Same email with different casing should produce exact same hash
      expect(RetargetingPixelService.hashUserData('traveler.john@example.com')).toBe(hashed);
    });

    it('returns undefined when data is missing or empty', () => {
      expect(RetargetingPixelService.hashUserData(undefined)).toBeUndefined();
      expect(RetargetingPixelService.hashUserData('')).toBeUndefined();
    });
  });

  describe('generateRetargetingAdCreative', () => {
    it('generates dynamic retargeting copy with INR currency', () => {
      const creative = RetargetingPixelService.generateRetargetingAdCreative(
        'Cloud Peak Villa',
        'Coorg, Karnataka',
        6500,
        'INR'
      );

      expect(creative.headline).toBe('Still thinking about your stay at Cloud Peak Villa?');
      expect(creative.primaryText).toContain('Coorg, Karnataka');
      expect(creative.primaryText).toContain('₹6,500/night');
      expect(creative.callToAction).toBe('Complete Booking');
      expect(creative.displayBannerText).toContain('From ₹6,500/night');
    });

    it('generates dynamic retargeting copy with USD currency', () => {
      const creative = RetargetingPixelService.generateRetargetingAdCreative(
        'Aspen Snow Chalet',
        'Aspen, Colorado',
        1200,
        'USD'
      );

      expect(creative.primaryText).toContain('$1,200/night');
      expect(creative.displayBannerText).toContain('$1,200/night');
    });
  });

  describe('trackServerEvent', () => {
    it('records server-side pixel event and returns deterministic event_id', async () => {
      const mockDb = {
        query: async (sql: string, params: any[]) => {
          return { rows: [] };
        }
      };

      const result = await RetargetingPixelService.trackServerEvent(
        {
          event_name: 'ViewContent',
          user_data: {
            email: 'guest@encho.space',
            fbp: 'fb.1.1691234567.987654321'
          },
          custom_data: {
            listing_id: 101,
            listing_title: 'Wayanad Nature Villa',
            value: 4500,
            currency: 'INR'
          },
          event_source_url: 'https://encho.space/listings/101'
        },
        mockDb
      );

      expect(result.event_id).toMatch(/^evt_\d+_[a-f0-9]{8}$/);
      expect(result.meta_capi_status).toBeDefined();
      expect(result.google_protocol_status).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('getRetargetingAudienceCount', () => {
    it('evaluates COLLECTING_AUDIENCE status when audience is below threshold', async () => {
      const mockDb = {
        query: async () => ({ rows: [{ count: '45' }] })
      };

      const result = await RetargetingPixelService.getRetargetingAudienceCount(101, mockDb);

      expect(result.listing_id).toBe(101);
      expect(result.bounced_visitor_count).toBe(45);
      expect(result.retargeting_readiness).toBe('COLLECTING_AUDIENCE');
    });

    it('evaluates READY_FOR_DEPLOYMENT when audience reaches 100+ visitors', async () => {
      const mockDb = {
        query: async () => ({ rows: [{ count: '250' }] })
      };

      const result = await RetargetingPixelService.getRetargetingAudienceCount(101, mockDb);

      expect(result.bounced_visitor_count).toBe(250);
      expect(result.retargeting_readiness).toBe('READY_FOR_DEPLOYMENT');
    });
  });
});
