// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckoutPage } from '../../components/CheckoutPage';

vi.mock('../../components/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, name: 'Test Guest', email: 'test@example.com' } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const listing = { id: '8', title: 'Garden Stay', currency: 'INR', rooms: [{ id: 'room-real', name: 'Garden room', price: 1000, inventory_count: 1, capacity: 2 }] } as any;
const initialData = { roomIds: ['room-real'], moveInDate: '2090-01-01', checkOutDate: '2090-01-04', configuration: 'Garden room', name: 'Test Guest', phone: '+919876543210', guests: 2 };
describe('Checkout presentation contract', () => {
  it('uses the selected room ID and displays only the server quote', async () => {
    localStorage.setItem('token', 'test-token');
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ quoteHash: 'test-hash', quote: { totalMinor: 399000, baseMinor: 300000, feeMinor: 30000, taxMinor: 54000, systemFeeMinor: 15000, nights: 3 } }) }));
    vi.stubGlobal('fetch', fetcher);
    render(<CheckoutPage listing={listing} initialData={initialData} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeEnabled());
    expect(JSON.parse((fetcher.mock.calls[0] as any)[1].body).roomId).toBe('room-real');
    expect(screen.getByText('₹3,990.00')).toBeInTheDocument();
    expect(screen.queryByText(/Presidential|Scan & Pay|100% Escrow|Instant WhatsApp/)).not.toBeInTheDocument();
  });
  it('shows an explicit availability error and prevents payment without a quote', async () => {
    localStorage.setItem('token', 'test-token');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'No rooms available for these dates.' }) })));
    render(<CheckoutPage listing={listing} initialData={initialData} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No rooms available');
    expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeDisabled();
  });
});
