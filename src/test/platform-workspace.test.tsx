// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HostOverview } from '../../components/HostOverview';
import { CampaignReadinessStrip } from '../../components/CampaignReadinessStrip';

afterEach(cleanup);
const reservations = [
  { id: 1, name: 'Pending guest', status: 'pending', listing: { title: 'River stay', currency: 'INR' }, totalRent: 2000, moveInDate: '2026-09-12' },
  { id: 2, name: 'Confirmed guest', status: 'Confirmed', listing: { title: 'Hill stay', currency: 'INR' }, totalRent: 3000, moveInDate: '2026-09-13' },
];
const props = { listings: [], reservations, loading: false, error: null, onRetry: vi.fn(), onMarketing: vi.fn(), onUpdate: vi.fn(async () => {}), pendingId: null, formatPrice: (amount: number, currency: string) => `${currency} ${amount}` };

describe('Host reservation workspace', () => {
  it('filters by selected status and guest/property search', () => {
    render(<HostOverview {...props} />);
    expect(screen.getByText('River stay')).toBeInTheDocument();
    expect(screen.queryByText('Hill stay')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Confirmed/ }));
    expect(screen.getByText('Hill stay')).toBeInTheDocument();
    expect(screen.queryByText('River stay')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'unknown guest' } });
    expect(screen.getByText('No matching reservations')).toBeInTheDocument();
  });
  it('blocks repeated actions while a reservation is saving', () => {
    render(<HostOverview {...props} pendingId={1} />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
  });
  it('makes failed loads recoverable and never claims a zero count', () => {
    render(<HostOverview {...props} error="Could not load reservations" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load reservations');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });
  it('displays independent approval and funding requirements', () => {
    render(<CampaignReadinessStrip campaign={{ status: 'approved', admin_approved: true, policy_cleared: true, payment_status: 'unpaid' }} />);
    expect(screen.getByText(/Payment recorded/)).toHaveTextContent('pending');
    expect(screen.getByText(/Admin approval/)).toHaveTextContent('complete');
    expect(screen.queryByText('Ready for publishing checks')).not.toBeInTheDocument();
  });
});
