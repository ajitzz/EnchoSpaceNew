import { describe, it, expect } from 'vitest';
import { classifyListingPhotos, buildGalleryCategories, GALLERY_CATEGORIES } from '../../components/SanctuaryGalleryModal';
import { Listing, SpatialPhoto } from '../../types';

describe('Sanctuary Spatial Gallery Architecture & Taxonomy Tests', () => {
  it('keeps room-only photo identity and order while excluding common media from the room', () => {
    const listing = {id:'room-photo-fixture', imageUrl:'/grounds.jpg', rooms:[{id:'r1',name:'Garden room',photos:[{id:'room-photo',url:'/room.jpg'}]}]} as unknown as Listing;
    const photos=classifyListingPhotos(listing);
    expect(photos.filter(photo=>photo.tier==='room-id:r1').map(photo=>photo.url)).toEqual(['/room.jpg']);
    expect(photos.find(photo=>photo.url==='/grounds.jpg')?.tier).toBe('common');
    expect(buildGalleryCategories(listing).map(category=>category.key)).toContain('room-id:r1');
  });
  it('builds canonical default gallery categories with all and common spaces only', () => {
    const defaultCategories = buildGalleryCategories({ rooms: [] } as any);
    const keys = defaultCategories.map(c => c.key);
    expect(keys).toEqual(['all', 'common']);
    expect(keys).not.toContain('suites');
    expect(keys).not.toContain('deluxe');
    expect(keys).not.toContain('executive');
  });

  it('dynamically builds categories derived strictly from host-defined listing.rooms', () => {
    const listingWithRooms: Listing = {
      id: 'stay-rooms-01',
      title: 'Monsoon Villa',
      price: 30000,
      currency: 'INR',
      type: 'Villa',
      imageUrl: 'https://encho.test/cdn/hero.jpg',
      imageCount: 1,
      isVerified: false,
      rooms: [
        { id: 'r1', name: 'Forest Villa', type: 'forest_villa', price: 30000, capacity: 2, icon: '🌿' },
        { id: 'r2', name: 'Cliff Cottage', type: 'cliff_cottage', price: 45000, capacity: 4, icon: '⛰️' }
      ]
    };

    const categories = buildGalleryCategories(listingWithRooms);
    const keys = categories.map(c => c.key);
    expect(keys).toEqual(['all', 'common', 'room-id:r1', 'room-id:r2']);
    expect(categories.find(c => c.key === 'room-id:r1')?.label).toBe('Forest Villa');
    expect(categories.find(c => c.key === 'room-id:r2')?.label).toBe('Cliff Cottage');
  });

  it('truthfully classifies listing photos into spatial photos without fabricated titles or room tiers', () => {
    const mockListing: Listing = {
      id: 'test-123',
      title: 'The Amber Pavilion Luxury Estate',
      price: 25000,
      currency: 'INR',
      type: 'Villa',
      imageUrl: 'https://encho.test/cdn/photo-1.jpg',
      imageUrls: [
        'https://encho.test/cdn/photo-1.jpg',
        'https://encho.test/cdn/photo-2.jpg'
      ],
      imageCount: 2,
      isVerified: false
    };

    const classified = classifyListingPhotos(mockListing);
    expect(classified.length).toBe(2);
    
    // Check that photos are classified with neutral property tier and no fabricated titles
    classified.forEach(photo => {
      expect(photo.tier).toBe('common');
      expect(photo.category).toBe('other');
      expect(photo.title).toBeUndefined();
      expect(photo.description).toBeUndefined();
    });

    expect(classified[0].isHero).toBe(true);
    expect(classified[1].isHero).toBe(false);
  });

  it('should preserve explicit host-curated spatial photos if present on listing', () => {
    const customPhotos: SpatialPhoto[] = [
      {
        id: 'p1',
        url: 'https://encho.test/cdn/pool.jpg',
        tier: 'common',
        category: 'pool',
        title: 'Infinity Pool',
        description: 'Heated infinity pool.',
        specs: '60ft'
      },
      {
        id: 'p2',
        url: 'https://encho.test/cdn/living.jpg',
        tier: 'forest_villa',
        category: 'living_room',
        title: 'Travertine Salon',
        description: 'Sunken fireside salon.',
        specs: '1,400 sqft'
      }
    ];

    const mockListing: Listing = {
      id: 'test-456',
      title: 'Cliffside Sanctuary',
      price: 35000,
      currency: 'INR',
      type: 'Villa',
      imageUrl: 'https://encho.test/cdn/pool.jpg',
      photos: customPhotos,
      imageCount: 2,
      isVerified: false
    };

    const classified = classifyListingPhotos(mockListing);
    expect(classified).toEqual(customPhotos);
    expect(classified[0].category).toBe('pool');
    expect(classified[1].category).toBe('living_room');
    expect(classified[1].tier).toBe('forest_villa');
  });
});
