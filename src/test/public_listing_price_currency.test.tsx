// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CurrencyProvider } from '../../components/CurrencyContext';
import ListingCard from '../../components/ListingCard';
import MapSidebar from '../../components/MapSidebar';
import { toPublicListingCardProjection } from '../lib/stayProjection';
import type { Listing } from '../../types';
import { presentRooms } from '../shared/guest/roomPresentation';
import { HelmetProvider } from 'react-helmet-async';
import { SEO } from '../../components/SEO';
import { render, waitFor } from '@testing-library/react';

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
    photos: [],
    lat: projection.lat ?? undefined,
    lng: projection.lng ?? undefined
  };
}

describe('Public price authority and INR display safety', () => {
  it('omits social image metadata when no approved image was supplied', async () => {
    render(<HelmetProvider><SEO title="A stay" image="" /></HelmetProvider>);
    await waitFor(() => expect(document.title).toContain('A stay'));
    expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
    expect(document.head.querySelector('meta[property="twitter:image"]')).toBeNull();
  });
  it('withholds legacy listing and room amounts when no accepted public offer exists', () => {
    const listing: Listing = {
      ...publicListing(103, 999), price: null, priceState: 'VERIFIED_OFFER_UNAVAILABLE',
      rooms: [{id: '101', name: 'Deluxe King', type: 'suite', price: null}],
      lat: 11.8, lng: 76.1,
    };
    const card = renderToStaticMarkup(<CurrencyProvider><ListingCard listing={listing} /></CurrencyProvider>);
    const map = renderToStaticMarkup(<CurrencyProvider><MapSidebar listings={[listing]} highlightedId={null} city="Wayanad" /></CurrencyProvider>);
    expect(card).toContain('Price available after dates are selected');
    expect(card).not.toContain('₹999');
    expect(card).not.toContain('₹0');
    expect(map).not.toContain('₹999');
    expect(map).not.toContain('₹0');
  });

  it('matches media to canonical room identity when room names and tiers repeat', () => {
    const presented = presentRooms({
      rooms: [
        {id: '101', name: 'Deluxe King', type: 'suite', price: null},
        {id: '102', name: 'Deluxe King', type: 'suite', price: null},
      ],
      photos: [
        {id: 'a', url: 'https://media.encho.test/a.jpg', tier: 'suite', category: 'bedroom', room_type_id: '101'},
        {id: 'b', url: 'https://media.encho.test/b.jpg', tier: 'suite', category: 'bedroom', room_type_id: '102'},
      ],
    });
    expect(presented.map(room => [room.canonicalId, room.photos.map(photo => photo.url)]))
      .toEqual([[101, ['https://media.encho.test/a.jpg']], [102, ['https://media.encho.test/b.jpg']]]);
  });
  it('does not turn a legacy ₹11,500 listing amount into a public offer', () => {
    const listing = publicListing(101, 11500);
    expect(listing.currency).toBe('INR');
    expect(listing.price).toBeNull();
    const html = renderToStaticMarkup(<CurrencyProvider><ListingCard listing={listing} /></CurrencyProvider>);
    expect(html).toContain('Price available after dates are selected');
    expect(html).not.toContain('₹11,500');
    expect(html).not.toContain('₹960,250');
  });

  it('does not publish a legacy ₹18,500 amount on map markers or cards', () => {
    const listing = publicListing(102, 18500);
    const html = renderToStaticMarkup(
      <CurrencyProvider>
        <MapSidebar listings={[listing]} highlightedId={null} city="Goa" />
      </CurrencyProvider>
    );
    expect(html).not.toContain('₹18,500');
    expect(html).not.toContain('₹0');
    expect(html).not.toContain('₹1,544,750');
  });
});
