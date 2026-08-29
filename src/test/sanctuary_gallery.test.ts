import { describe, it, expect } from 'vitest';
import { classifyListingPhotos, GALLERY_CATEGORIES } from '../../components/SanctuaryGalleryModal';
import { Listing, SpatialPhoto } from '../../types';

describe('Sanctuary Spatial Gallery Architecture & Taxonomy Tests', () => {
  it('should have all 8 award-winning architectural spatial categories plus all panorama', () => {
    const requiredKeys = ['all', 'living_room', 'dining', 'bedroom', 'bathroom', 'garden', 'exterior', 'pool', 'details'];
    const keys = GALLERY_CATEGORIES.map(c => c.key);
    requiredKeys.forEach(k => {
      expect(keys).toContain(k);
    });
  });

  it('should intelligently classify legacy listing with raw imageUrls into categorized spatial photos', () => {
    const mockListing: Listing = {
      id: 'test-123',
      title: 'The Amber Pavilion Luxury Estate',
      price: 25000,
      currency: 'INR',
      type: 'Villa',
      imageUrl: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf',
      imageUrls: [
        'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf',
        'https://images.unsplash.com/photo-1512917774080-9991f1c4c750',
        'https://images.unsplash.com/photo-1613977257363-707ba9348227',
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c'
      ],
      imageCount: 4,
      isVerified: true
    };

    const classified = classifyListingPhotos(mockListing);
    expect(classified.length).toBe(4);
    
    // Check that items have titles, descriptions, and architectural categories
    classified.forEach(photo => {
      expect(photo.title).toBeTruthy();
      expect(photo.description).toBeTruthy();
      expect(photo.category).toBeTruthy();
      expect(photo.specs).toBeDefined();
    });

    expect(classified[0].isHero).toBe(true);
  });

  it('should preserve explicit host-curated spatial photos if present on listing', () => {
    const customPhotos: SpatialPhoto[] = [
      {
        id: 'p1',
        url: 'https://images.unsplash.com/photo-1',
        tier: 'common', category: 'pool',
        title: 'Sunset Mineral Infinity Pool',
        description: 'Heated cliffside infinity pool with mountain panorama.',
        specs: '60ft · Heated · Teak Decking'
      },
      {
        id: 'p2',
        url: 'https://images.unsplash.com/photo-2',
        tier: 'suites', category: 'living_room',
        title: 'Travertine Atrium Salon',
        description: 'Double-height sunken fireside salon.',
        specs: '1,400 sqft · Sunken Pit'
      }
    ];

    const mockListing: Listing = {
      id: 'test-456',
      title: 'Cliffside Sanctuary',
      price: 35000,
      currency: 'INR',
      type: 'Villa',
      imageUrl: 'https://images.unsplash.com/photo-1',
      photos: customPhotos,
      imageCount: 2,
      isVerified: true
    };

    const classified = classifyListingPhotos(mockListing);
    expect(classified).toEqual(customPhotos);
    expect(classified[0].category).toBe('pool');
    expect(classified[1].category).toBe('living_room');
  });
});
