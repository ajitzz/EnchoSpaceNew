import React from 'react';
import {describe, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import ReservationsPage from '../../components/ReservationsPage.js';
import type {Listing} from '../../types.js';

vi.mock('../../components/SEO.js', () => ({SEO: () => null}));
vi.mock('../../components/CurrencyContext.js', () => ({useCurrency: () => ({formatPrice: (value: number) => `INR ${value}`})}));

const listing: Listing = {
  id: '3', title: 'Garden Stay', price: 1000, currency: 'INR', type: 'villa',
  imageUrl: 'https://example.com/image.jpg', imageCount: 1, isVerified: true,
};
const reservation = {
  id: '81', listing, moveInDate: '2026-10-01', configuration: 'Garden room', name: 'Guest',
  phone: '12345', totalRent: 2000, bookingDate: '2026-09-24T00:00:00Z', status: 'pending',
};

describe('CR1 reservation presentation containment', () => {
  it('presents a pending stay without a mobile confirmation badge or fabricated ticket', () => {
    const html = renderToStaticMarkup(<ReservationsPage reservations={[reservation]} onBack={() => {}} onListingClick={() => {}} />);
    expect(html).toContain('Your request is pending and does not confirm a stay.');
    expect(html).not.toContain('>Confirmed<');
    expect(html).not.toContain('Download Ticket');
  });

  it('does not issue a financial or entry document from a legacy confirmed state', () => {
    const html = renderToStaticMarkup(<ReservationsPage reservations={[{...reservation, status: 'confirmed'}]} onBack={() => {}} onListingClick={() => {}} />);
    expect(html).toContain('>Confirmed<');
    expect(html).not.toMatch(/Download Ticket|Total Paid|PIN|barcode/);
  });
});
