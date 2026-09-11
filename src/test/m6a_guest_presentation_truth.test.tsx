import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToastProvider } from '../../components/ToastContext';
import { AuthProvider } from '../../components/AuthContext';
import { ListingDetailsNew } from '../../components/ListingDetailsNew';
import { Listing } from '../../types';

function renderListing(listing: Listing) {
  return renderToStaticMarkup(
    <AuthProvider>
      <ToastProvider>
        <ListingDetailsNew listing={listing} onBack={() => {}} />
      </ToastProvider>
    </AuthProvider>
  );
}

describe('Milestone 6A: Guest Presentation Truth & Luxury UX Foundation', () => {
  const baseListing: Listing = {
    id: 'stay-truth-001',
    title: 'The Mirrored Mountain Pavilion',
    price: 24000,
    currency: 'INR',
    type: 'Luxury Villa',
    rental_mode: 'entire_place',
    city: 'Wayanad',
    imageCount: 3,
    imageUrl: 'https://encho.test/cdn/hero-authoritative.jpg',
    imageUrls: [
      'https://encho.test/cdn/hero-authoritative.jpg',
      'https://encho.test/cdn/bedroom-authoritative.jpg',
      'https://encho.test/cdn/pool-authoritative.jpg'
    ],
    isVerified: false,
    description: 'An architectural sanctuary grounded in stillness and privacy.'
  };

  it('1. Absence of fabricated room authority: zero legacy fallback room tiers when rooms is empty', () => {
    const markup = renderListing(baseListing);

    expect(markup).not.toContain('Presidential Panorama Suite');
    expect(markup).not.toContain('Deluxe Garden Double Room');
    expect(markup).not.toContain('Executive Studio Sanctuary');
  });

  it('2. Honest room empty state: displays "Room details are being prepared." when rooms array is empty', () => {
    const markup = renderListing(baseListing);

    expect(markup).toContain('Room details are being prepared.');
  });

  it('3. Authoritative sidebar pricing: displays "From ₹X per night" and tax disclosure', () => {
    const markup = renderListing(baseListing);

    expect(markup).toContain('From ₹24,000');
    expect(markup).toContain('/ night');
    expect(markup).toContain('Taxes and final price will be shown before payment.');
  });

  it('4. Containment of unauthorized pricing: no 15% concierge fee, no 18% GST, and no grand total', () => {
    const markup = renderListing(baseListing);

    // Must NOT contain unverified concierge fee or GST breakdown in sidebar
    expect(markup).not.toContain('Encho Concierge &amp; Escrow (15%)');
    expect(markup).not.toContain('Encho Concierge & Escrow (15%)');
    expect(markup).not.toContain('Statutory Goods &amp; Services Tax (18% GST)');
    expect(markup).not.toContain('Statutory Goods & Services Tax (18% GST)');
    expect(markup).not.toContain('Est. Total (Incl. Taxes &amp; Escrow)');
    expect(markup).not.toContain('Est. Total (Incl. Taxes & Escrow)');
  });

  it('5. Dynamic host-defined room types: renders host room configurations when present', () => {
    const listingWithRooms: Listing = {
      ...baseListing,
      rooms: [
        { id: 'r1', name: 'Forest Pavilion', type: 'forest_pavilion', price: 28000, capacity: 2, icon: '🌿', tag: 'Flagship' },
        { id: 'r2', name: 'Cliff Nest', type: 'cliff_nest', price: 42000, capacity: 4, icon: '🦅', tag: 'Panoramic' }
      ],
      photos: [
        { id: 'p1', url: 'https://encho.test/cdn/hero-authoritative.jpg', tier: 'forest_pavilion', category: 'bedroom', isHero: true }
      ]
    };

    const markup = renderListing(listingWithRooms);

    expect(markup).toContain('Forest Pavilion');
    expect(markup).toContain('Cliff Nest');
    expect(markup).toContain('From ₹28,000');
  });

  it('6. Protected Luxury Invariant: Neighborhood Radar retains grayscale 50% opacity and 1000ms hover transition', () => {
    const prevKey = (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY;
    (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY = 'test_maps_key_configured';

    const listingWithCoords: Listing = {
      ...baseListing,
      lat: 11.6854,
      lng: 76.1320
    };

    const markup = renderListing(listingWithCoords);

    expect(markup).toContain('Neighborhood Radar');
    expect(markup).toContain('opacity-50');
    expect(markup).toContain('grayscale');
    expect(markup).toContain('group-hover:grayscale-0');
    expect(markup).toContain('duration-1000');
    expect(markup).toContain('ease-out');

    (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY = prevKey;
  });

  it('7. Map availability fallback: renders "Approximate location map is being prepared." when map is unconfigured', () => {
    const markup = renderListing(baseListing);

    expect(markup).toContain('Approximate location map is being prepared.');
  });

  it('8. POI empty fallback: renders "Nearby details are being prepared." when nearby array is empty', () => {
    const markup = renderListing(baseListing);

    expect(markup).toContain('Nearby details are being prepared.');
  });

  it('9. Host-provided POIs: renders nearby points of interest when supplied by host', () => {
    const listingWithPOIs: Listing = {
      ...baseListing,
      nearby: [
        { id: 'poi-1', name: 'Kabini River Safari', distance: '3.2 km', type: 'attraction', description: 'Wildlife safari along the Kabini river.' }
      ]
    };

    const markup = renderListing(listingWithPOIs);

    expect(markup).toContain('Kabini River Safari');
    expect(markup).toContain('3.2 km');
    expect(markup).not.toContain('Nearby details are being prepared.');
  });

  it('10. Review truth: shows "New on Encho Stays" when listing has zero verified reviews', () => {
    const listingWithZeroReviews: Listing = {
      ...baseListing,
      rating: undefined,
      reviewCount: 0,
      reviews: []
    };

    const markup = renderListing(listingWithZeroReviews);

    expect(markup).toContain('New on Encho Stays');
    expect(markup).toContain('This sanctuary has not yet accumulated verified guest reviews');
    expect(markup).not.toContain('4.95');
    expect(markup).not.toContain('124 Verified Stays');
    expect(markup).not.toContain('Michael R.');
    expect(markup).not.toContain('Sarah K.');
    expect(markup).not.toContain('Aarav M.');
  });

  it('11. Verification truth: omits verification badges when verification method or date is missing', () => {
    const unverifiedListing: Listing = {
      ...baseListing,
      isVerified: true,
      verification_method: undefined,
      verified_at: undefined
    };

    const markup = renderListing(unverifiedListing);

    expect(markup).not.toContain('Verified Sanctuary');
    expect(markup).not.toContain('100% In-Person Verified');
  });

  it('12. Dark pattern elimination: zero synthetic viewer counter or Math.random badges render', () => {
    const markup = renderListing(baseListing);

    expect(markup).not.toContain('Viewing');
    expect(markup).not.toContain('liveViewers');
  });

  it('13. Media truth: zero Unsplash stock fallback URLs exist in the rendered output', () => {
    const markup = renderListing(baseListing);

    expect(markup).not.toContain('images.unsplash.com');
  });

  it('14. Address privacy: does not leak exact street address or pin code', () => {
    const listingWithAddress: Listing = {
      ...baseListing,
      address: 'Door 4B, Chembra Peak Road, Meppadi P.O. 673577'
    };

    const markup = renderListing(listingWithAddress);

    expect(markup).not.toContain('Door 4B');
    expect(markup).not.toContain('673577');
  });

  it('15. Hero Video Fallback: renders video player when video exists and falls back to photo grid when absent', () => {
    const listingWithVideo: Listing = {
      ...baseListing,
      hero_video_url: 'https://encho.test/cdn/video-hero.mp4'
    };

    const videoMarkup = renderListing(listingWithVideo);
    expect(videoMarkup).toContain('data-testid="hero-cinematic-video"');

    const photoMarkup = renderListing(baseListing);
    expect(photoMarkup).toContain('The Mirrored Mountain Pavilion Main View');
  });

  // T16: Room with ONLY common photos → no slide created; honest room-info card renders
  it('T16. Room with only common-tier photos: no slide created, room-info empty card renders', () => {
    const listingWithCommonOnly: Listing = {
      ...baseListing,
      rooms: [
        { id: 'r1', name: 'Forest Pavilion', type: 'forest_pavilion', price: 28000, capacity: 2, icon: '🌿', tag: 'Flagship' }
      ],
      photos: [
        // Only common photos — none tagged to forest_pavilion tier
        { id: 'p1', url: 'https://encho.test/cdn/common-hero.jpg', tier: 'common', category: 'exterior' }
      ]
    };

    const markup = renderListing(listingWithCommonOnly);

    // Common photo must NOT appear in a room slide context
    expect(markup).not.toContain('Bedrooms');
    // The room name must still appear (in room selector or info card)
    expect(markup).toContain('Forest Pavilion');
    // No slide references the common photo URL inside a room slot
    expect(markup).not.toContain('common-hero.jpg');
  });

  // T17: Room with 1 associated photo → only 1 slot rendered, no space02/03/04 fabrication
  it('T17. Room with 1 photo: only 1 slot — space02/03/04 absent', () => {
    const listing1Photo: Listing = {
      ...baseListing,
      rooms: [
        { id: 'r1', name: 'Cliff Nest', type: 'cliff_nest', price: 30000, capacity: 2, icon: '🦅', tag: 'Panoramic' }
      ],
      photos: [
        { id: 'p1', url: 'https://encho.test/cdn/cliff-photo-1.jpg', tier: 'cliff_nest', category: 'bedroom' }
      ]
    };

    const markup = renderListing(listing1Photo);

    expect(markup).toContain('cliff-photo-1.jpg');
    // space02/03/04 should render the honest "Room photography is being prepared." placeholder
    expect(markup).toContain('Room photography is being prepared.');
  });

  // T18: Room with 3 photos → 3 real slots; no repeated padding
  it('T18. Room with 3 photos: 3 real slots, no padding', () => {
    const listing3Photos: Listing = {
      ...baseListing,
      rooms: [
        { id: 'r1', name: 'Horizon Suite', type: 'horizon_suite', price: 35000, capacity: 2, icon: '🌅', tag: 'Luxury' }
      ],
      photos: [
        { id: 'p1', url: 'https://encho.test/cdn/h1.jpg', tier: 'horizon_suite', category: 'bedroom' },
        { id: 'p2', url: 'https://encho.test/cdn/h2.jpg', tier: 'horizon_suite', category: 'bathroom' },
        { id: 'p3', url: 'https://encho.test/cdn/h3.jpg', tier: 'horizon_suite', category: 'balcony' }
      ]
    };

    const markup = renderListing(listing3Photos);

    expect(markup).toContain('h1.jpg');
    expect(markup).toContain('h2.jpg');
    expect(markup).toContain('h3.jpg');
    // space04 should render honest empty state (only 3 photos → space04 is null)
    expect(markup).toContain('Room photography is being prepared.');
  });

  // T19: Room with 4 photos → all 4 slots populated; no empty-state placeholder
  it('T19. Room with 4 photos: all 4 slots populated, no empty-state placeholder', () => {
    const listing4Photos: Listing = {
      ...baseListing,
      rooms: [
        { id: 'r1', name: 'Summit Retreat', type: 'summit_retreat', price: 45000, capacity: 4, icon: '⛰️', tag: 'Panoramic' }
      ],
      photos: [
        { id: 'p1', url: 'https://encho.test/cdn/s1.jpg', tier: 'summit_retreat', category: 'bedroom' },
        { id: 'p2', url: 'https://encho.test/cdn/s2.jpg', tier: 'summit_retreat', category: 'bathroom' },
        { id: 'p3', url: 'https://encho.test/cdn/s3.jpg', tier: 'summit_retreat', category: 'balcony' },
        { id: 'p4', url: 'https://encho.test/cdn/s4.jpg', tier: 'summit_retreat', category: 'pool' }
      ]
    };

    const markup = renderListing(listing4Photos);

    expect(markup).toContain('s1.jpg');
    expect(markup).toContain('s2.jpg');
    expect(markup).toContain('s3.jpg');
    expect(markup).toContain('s4.jpg');
    // With 4 real photos, the empty-state placeholder must NOT appear
    expect(markup).not.toContain('Room photography is being prepared.');
  });

  // T20: Unverified reviews[] present → component ignores them and shows 'New on Encho Stays'
  it('T20. Unverified reviews are suppressed: component ignores arbitrary review arrays and shows New on Encho Stays', () => {
    const listingWithReviews: Listing = {
      ...baseListing,
      reviews: [
        { id: 'rev-1', author: 'Actual Guest', text: 'Genuinely wonderful stay.', rating: 4.8 }
      ],
      reviewCount: 1
    };

    const markup = renderListing(listingWithReviews);

    // Injected fictional reviewers from prior code must not appear
    expect(markup).not.toContain('Michael R.');
    expect(markup).not.toContain('Sarah K.');
    expect(markup).not.toContain('Aarav M.');
    // And even the arbitrary review must not enable testimonials
    expect(markup).not.toContain('Genuinely wonderful stay.');
    expect(markup).toContain('New on Encho Stays');
  });

  // T21: Injecting all three client verification fields STILL does NOT render a badge
  it('T21. Client verification fields ignored: badge must not render even with all client fields present', () => {
    const fakeVerificationListing: Listing = {
      ...baseListing,
      isVerified: true,
      verified_at: '2025-01-15T10:00:00Z',
      verification_method: 'government_id'
    };

    const markup = renderListing(fakeVerificationListing);

    expect(markup).not.toContain('Verified Sanctuary');
    expect(markup).not.toContain('100% In-Person Verified');
  });

  // T22: Similar listing with no rating → renders '—' not '4.9'
  it('T22. Similar listing with absent rating: renders dash, not fabricated 4.9', () => {
    const listingWithNullRatedSimilar = {
      ...baseListing,
      similarListings: [
        {
          id: 'sim-1',
          title: 'Malabar Mist House',
          type: 'Boutique Villa',
          city: 'Wayanad',
          price: 18000,
          currency: 'INR',
          rating: undefined,  // No verified rating
          imageUrl: 'https://encho.test/cdn/mist.jpg',
          imageUrls: ['https://encho.test/cdn/mist.jpg']
        }
      ]
    };

    const markup = renderListing(listingWithNullRatedSimilar as any);

    // The fabricated fallback '4.9' must not appear for unrated similar listings
    expect(markup).not.toContain('>4.9<');
    // The Star component must not be rendered for the unrated listing
    // (conditional rendering: badge shown only when sim.rating != null && sim.rating > 0)
  });

  // T23: Nearby entries without canonical coordinates → list only, no map pin markup
  it('T23. Nearby POIs without coordinates: rendered as list items only, no fabricated pin positions', () => {
    const listingWithPOIsNoCoords: Listing = {
      ...baseListing,
      nearby: [
        { id: 'poi-1', name: 'Meenmutty Falls', distance: '7 km', type: 'attraction' }
      ]
    };

    const markup = renderListing(listingWithPOIsNoCoords);

    expect(markup).toContain('Meenmutty Falls');
    // Fabricated pin percentage strings from the old angle arithmetic must not appear
    expect(markup).not.toContain('75%');
    expect(markup).not.toContain('pinTop');
    // Fabricated fallback descriptions must not appear
    expect(markup).not.toContain('A highly recommended destination.');
    expect(markup).not.toContain('Curated culinary destination.');
  });

  // T24: listing.location.locality used in location label
  it('T24. Canonical location label: uses location.locality when available', () => {
    const listingWithLocality: Listing = {
      ...baseListing,
      city: 'Wayanad',
      location: {
        locality: 'Meppadi',
        city: 'Wayanad',
        approximateLatitude: 11.68,
        approximateLongitude: 76.13
      }
    };

    const markup = renderListing(listingWithLocality);

    // Neighborhood Radar location label should use locality, city
    expect(markup).toContain('Meppadi');
    expect(markup).toContain('Wayanad');
  });
});
