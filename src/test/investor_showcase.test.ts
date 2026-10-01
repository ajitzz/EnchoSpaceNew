import { describe, expect, it } from 'vitest';
import { DEMO_PROPERTIES } from '../data/demoProperties';

describe('isolated investor concepts', () => {
  it('contains fifteen distinct visual samples without invented verification or reviews', () => {
    expect(DEMO_PROPERTIES).toHaveLength(15);
    expect(new Set(DEMO_PROPERTIES.map((listing) => listing.id)).size).toBe(15);
    for (const listing of DEMO_PROPERTIES) {
      expect(listing.id).toMatch(/^encho-prop-\d{2}$/);
      expect(listing.publication_status).toBe('draft');
      expect(listing.isVerified).toBe(false);
      expect(listing.is_verified).toBe(false);
      expect(listing.is_superhost).toBe(false);
      expect(listing.reviewCount).toBe(0);
      expect(listing.imageUrl).toMatch(/^https:\/\/images\.unsplash\.com\//);
      expect(listing.rooms?.length).toBeGreaterThan(0);
      expect(listing.experience_tags?.length).toBeGreaterThan(0);
    }
  });
});
