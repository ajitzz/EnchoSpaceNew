// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CurrencyProvider } from '../../components/CurrencyContext';
import ListingCard from '../../components/ListingCard';
import MapSidebar from '../../components/MapSidebar';
import { toPublicListingCardProjection } from '../lib/stayProjection';
import type { Listing } from '../../types';

function publicListing(id: number, price: number): Listing {
  const projection = toPublicListingCardProjection({
    id,
    title: `Verified price fixture ${id}`,
    type: 'Villa',
    price,
    currency: 'INR',
    city: 'Goa',
    rental_mode: 'entire_place',
    publication_status: 'published',
    image_url: '/fixture-villa.jpg',
    image_urls: ['/fixture-villa.jpg'],
    rooms: [],
    amenities: []
  });
  return {
    ...projection,
    rental_mode: 'entire_place',
    rooms: [],
    lat: projection.lat ?? undefined,
    lng: projection.lng ?? undefined
  };
}

describe('Public INR listing amount across API projection and guest surfaces', () => {
  it('renders the exact projected ₹11,500 nightly card amount, not 83.5 times the amount', () => {
    const listing = publicListing(101, 11500);
    expect(listing.currency).toBe('INR');
    const html = renderToStaticMarkup(<CurrencyProvider><ListingCard listing={listing} /></CurrencyProvider>);
    expect(html).toContain('₹11,500');
    expect(html).not.toContain('₹960,250');
  });

  it('renders a ₹18,500 map marker and price panel from the same listing currency', () => {
    const listing = publicListing(102, 18500);
    const html = renderToStaticMarkup(
      <CurrencyProvider>
        <MapSidebar listings={[listing]} highlightedId={null} city="Goa" />
      </CurrencyProvider>
    );
    expect(html).toContain('₹18,500');
    expect(html).not.toContain('₹1,544,750');
  });
});
