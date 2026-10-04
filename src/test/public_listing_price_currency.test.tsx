// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CurrencyProvider } from '../../components/CurrencyContext';
import ListingCard from '../../components/ListingCard';
import MapSidebar from '../../components/MapSidebar';
import { toPublicListingCardProjection } from '../lib/stayProjection';
import type { Listing } from '../../types';
import { presentRooms } from '../shared/guest/roomPresentation';
import { HelmetProvider } from 'react-helmet-async';
import { SEO } from '../../components/SEO';
import {acceptedOfferCoversSelectedStay} from '../../components/ListingDetailsNew';
import {acceptedOfferIsCurrent} from '../shared/offers/publicPrice';
import { act, render, waitFor } from '@testing-library/react';

const acceptedOffer = {offerId:'00000000-0000-4000-8000-000000000101',revision:1,
  roomTypeId:'101',priceBasis:'PER_ROOM_NIGHT' as const,amountMinor:'550000',currency:'INR' as const,
  maxGuests:2,minNights:2,stayStart:'2027-01-01',stayEnd:'2027-02-01',
  effectiveFrom:'2026-10-01T00:00:00.000Z',effectiveUntil:'2027-02-01T00:00:00.000Z',
  availableStartDate:'2027-01-10',observedAt:'2026-10-04T00:00:00.000Z'};

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
  it('hides an expired offer on open card and map views without waiting for a route refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T12:00:00.000Z'));
    try {
      const soonExpired={...acceptedOffer,effectiveUntil:'2026-10-04T12:00:01.000Z'};
      const listing:Listing={...publicListing(106,999),price:5500,
        priceState:'VERIFIED_OFFER_AVAILABLE',offerState:'VERIFIED_OFFER_AVAILABLE',
        fromOffer:soonExpired,lat:11.8,lng:76.1,
        rooms:[{id:'101',name:'Royal Suite',type:'suite',price:5500,
          priceState:'VERIFIED_OFFER_AVAILABLE',offerState:'VERIFIED_OFFER_AVAILABLE',offer:soonExpired}]};
      const card=render(<CurrencyProvider><ListingCard listing={listing} /></CurrencyProvider>);
      const map=render(<CurrencyProvider><MapSidebar listings={[listing]} highlightedId={null} city="Goa" /></CurrencyProvider>);
      expect(card.container.textContent).toContain('₹5,500');
      expect(map.container.textContent).toContain('₹5,500');
      await act(async()=>{await vi.advanceTimersByTimeAsync(1100);});
      expect(card.container.textContent).toContain('Price unavailable');
      expect(card.container.textContent).not.toContain('₹5,500');
      expect(map.container.textContent).toContain('Price unavailable');
      expect(map.container.textContent).not.toContain('₹5,500');
      card.unmount();map.unmount();
    }finally{vi.useRealTimers();}
  });
  it('keeps accepted no-date card and map prices on the server-selected room offer', () => {
    const other = {...acceptedOffer,offerId:'00000000-0000-4000-8000-000000000102',
      roomTypeId:'102',amountMinor:'620000'};
    const listing:Listing={...publicListing(104,999),price:5500,
      priceState:'VERIFIED_OFFER_AVAILABLE',offerState:'VERIFIED_OFFER_AVAILABLE',
      fromOffer:acceptedOffer,hasOffers:true,lat:11.8,lng:76.1,
      rooms:[{id:'102',name:'Royal Suite',type:'suite',price:6200,
        priceState:'VERIFIED_OFFER_AVAILABLE',offerState:'VERIFIED_OFFER_AVAILABLE',offer:other},
        {id:'101',name:'Royal Suite',type:'suite',price:5500,
          priceState:'VERIFIED_OFFER_AVAILABLE',offerState:'VERIFIED_OFFER_AVAILABLE',offer:acceptedOffer}],
      photos:[]};
    const card=renderToStaticMarkup(<CurrencyProvider><ListingCard listing={listing} /></CurrencyProvider>);
    const map=renderToStaticMarkup(<CurrencyProvider><MapSidebar listings={[listing]} highlightedId={null} city="Goa" /></CurrencyProvider>);
    expect(card).toContain('Rooms from');
    expect(card).toContain('₹5,500');
    expect(card).toContain('2027-01-01');
    expect(card).not.toContain('₹999');
    expect(map).toContain('₹5,500');
    expect(map).not.toContain('₹999');
  });
  it('does not imply a bookable SEO price for an accepted informational room-night amount', async () => {
    render(<HelmetProvider><SEO title="Accepted stay" image="" /><ListingCard listing={{
      ...publicListing(105,999),price:5500,priceState:'VERIFIED_OFFER_AVAILABLE',
      offerState:'VERIFIED_OFFER_AVAILABLE',fromOffer:acceptedOffer,
      rooms:[{id:'101',name:'Royal Suite',type:'suite',price:5500,
        priceState:'VERIFIED_OFFER_AVAILABLE',offerState:'VERIFIED_OFFER_AVAILABLE',offer:acceptedOffer}],
    }} /></HelmetProvider>);
    await waitFor(()=>expect(document.title).toContain('Accepted stay'));
    expect(document.head.querySelector('meta[property="product:price:amount"]')).toBeNull();
    expect(document.head.querySelector('meta[property="og:price:amount"]')).toBeNull();
    expect(document.head.querySelector('meta[property="product:price:currency"]')).toBeNull();
  });
  it('does not use an accepted room-night amount for dates outside its stay and minimum-night scope', () => {
    const now=Date.parse('2026-10-04T12:00:00.000Z');
    expect(acceptedOfferIsCurrent(acceptedOffer,now)).toBe(true);
    expect(acceptedOfferCoversSelectedStay(acceptedOffer,'2027-01-10','2027-01-12',2,1,now)).toBe(true);
    expect(acceptedOfferCoversSelectedStay(acceptedOffer,'2027-01-09','2027-01-11',2,1,now)).toBe(false);
    expect(acceptedOfferCoversSelectedStay(acceptedOffer,'2027-01-31','2027-02-02',2,1,now)).toBe(false);
    expect(acceptedOfferCoversSelectedStay(acceptedOffer,'2027-01-10','2027-01-11',2,1,now)).toBe(false);
    expect(acceptedOfferCoversSelectedStay(acceptedOffer,'2027-01-10','2027-01-12',3,1,now)).toBe(false);
    expect(acceptedOfferCoversSelectedStay(acceptedOffer,'2027-01-10','2027-01-12',2,0,now)).toBe(false);
    expect(acceptedOfferIsCurrent(acceptedOffer,Date.parse('2027-02-01T00:00:00.000Z'))).toBe(false);
  });
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
    expect(card).toContain('Price unavailable');
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
    expect(html).toContain('Price unavailable');
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
