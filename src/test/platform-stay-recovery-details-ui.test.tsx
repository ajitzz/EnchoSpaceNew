// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StayRecoveryDetails } from '../../components/StayRecoveryDetails';
const auth = vi.hoisted(() => ({ token: 'admin-token' }));
vi.mock('../../components/AuthContext', () => ({ useAuth: () => auth }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); auth.token = 'admin-token'; });
const observation = (id: string) => ({ id, actor_id: 3, provider_order_id: 'order_saved', classification: 'no_capture_observed', observed_at: '2090-01-01T00:00:00Z', recorded_at: '2090-01-01T00:00:01Z', payments: [] });
const body = (extra = {}) => ({ order: { id: 'checkout', state: 'review', booking_id: null }, observations: [observation('observation-one')], events: [{ id: 'event-one', actor_id: 3, event_type: 'PROVIDER_PAYMENT_OBSERVED', created_at: '2090-01-01T00:00:01Z' }], readOnly: true, nextObservationCursor: null, nextEventCursor: null, ...extra });
const response = (extra = {}) => ({ ok: true, json: async () => body(extra) });
describe('persisted recovery details UI', () => {
  it('loads only when expanded and never offers financial actions', async () => {
    const fetch = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetch); render(<StayRecoveryDetails checkoutId="checkout" />);
    expect(fetch).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Inspect checkout history' }));
    expect(await screen.findByText('No capture observed · outcome still unresolved')).toBeInTheDocument();
    expect(screen.getByText(/Refresh reads saved records/)).toBeInTheDocument();
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer admin-token');
    expect(screen.queryByRole('button', { name: /refund|confirm|release|charge/i })).not.toBeInTheDocument();
  });
  it('preserves loaded observations on page failure and independently pages audit history', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ nextObservationCursor: 'cursor-one', nextEventCursor: 'event-cursor' }))
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(response({ observations: [observation('observation-two')], nextEventCursor: 'event-cursor' }))
      .mockResolvedValueOnce(response({ events: [{ id: 'event-two', actor_id: 3, event_type: 'READY', created_at: '2090-01-01T00:00:00Z' }] }));
    vi.stubGlobal('fetch', fetch); render(<StayRecoveryDetails checkoutId="checkout" />); fireEvent.click(screen.getByRole('button', { name: 'Inspect checkout history' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load older observations' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry checkout history' }));
    expect(await screen.findByText(/Observation observation-two/)).toBeInTheDocument(); expect(screen.getByText(/Observation observation-one/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load older audit events' }));
    expect(await screen.findByText(/Event event-two/)).toBeInTheDocument(); expect(screen.getByText(/Event event-one/)).toBeInTheDocument();
    expect(screen.getByText(/Observation observation-two/)).toBeInTheDocument();
    expect(fetch.mock.calls[2][0]).toContain('observationBefore=cursor-one'); expect(fetch.mock.calls[3][0]).toContain('eventBefore=event-cursor');
  });
  it('clears evidence on account changes and ignores late requests after collapse', async () => {
    let resolve!: (value: unknown) => void;
    const fetch = vi.fn().mockResolvedValueOnce(response()).mockImplementationOnce(() => new Promise(done => { resolve = done; })); vi.stubGlobal('fetch', fetch);
    const view = render(<StayRecoveryDetails checkoutId="checkout" />); fireEvent.click(screen.getByRole('button', { name: 'Inspect checkout history' }));
    await screen.findByText(/Observation observation-one/); auth.token = 'different-admin'; view.rerender(<StayRecoveryDetails checkoutId="checkout" />);
    expect(screen.queryByText(/Observation observation-one/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect checkout history' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2)); fireEvent.click(screen.getByRole('button', { name: 'Hide checkout history' }));
    resolve(response()); await waitFor(() => expect(screen.queryByRole('region', { name: 'Checkout evidence' })).not.toBeInTheDocument());
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
  });
  it('rejects a response for another checkout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ order: { id: 'other-checkout' } })));
    render(<StayRecoveryDetails checkoutId="checkout" />); fireEvent.click(screen.getByRole('button', { name: 'Inspect checkout history' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('response requires review'); expect(screen.queryByText(/Observation observation-one/)).not.toBeInTheDocument();
  });
});
