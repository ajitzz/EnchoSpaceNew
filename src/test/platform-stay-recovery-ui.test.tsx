// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StayRecoveryQueue } from '../../components/StayRecoveryQueue';
vi.mock('../../components/AuthContext', () => ({ useAuth: () => ({ token: 'test-admin' }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('checkout recovery queue UI', () => {
  it('shows unresolved references and precise amount without payment actions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ readOnly: true, nextCursor: null, orders: [{ id: 'actual-checkout', listing_id: 10, room_id: 'suite', check_in: '2090-01-01', check_out: '2090-01-03', total_minor: '12345', currency: 'INR', state: 'review', reason: 'provider_outcome_unknown' }] }) }));
    render(<StayRecoveryQueue />); expect(await screen.findByText('Provider outcome unknown')).toBeInTheDocument(); expect(screen.getByText(/INR 123.45/)).toBeInTheDocument();
    expect(screen.getByText(/Do not charge again/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /refund|confirm|release/i })).not.toBeInTheDocument();
  });
  it('surfaces errors and retries without inventing successful recovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ ok: true, json: async () => ({ readOnly: true, nextCursor: null, orders: [] }) }));
    render(<StayRecoveryQueue />); fireEvent.click(await screen.findByRole('button', { name: 'Retry recovery queue' }));
    expect(await screen.findByText('No checkout attempts currently require triage.')).toBeInTheDocument();
  });
});
