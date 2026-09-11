// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InventoryAuthorizationHistory } from '../../components/InventoryAuthorizationHistory';
const auth = vi.hoisted(() => ({ token: 'admin-token' as string | null }));
vi.mock('../../components/AuthContext', () => ({ useAuth: () => auth }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); auth.token = 'admin-token'; });
const grant = { id: 'one', provider: 'fixture', provider_property_id: 'property', approved_by: 3, approved_at: '2026-09-11T00:00:00Z', expires_at: '2026-10-01T00:00:00Z', status: 'authorized' };
const response = (grants = [grant], nextCursor: string | null = null) => ({ ok: true, json: async () => ({ grants, nextCursor, providerVerification: 'unverified', checkoutAuthorized: false }) });
describe('Admin authorization history UI', () => {
  it('loads only on expansion and distinguishes authorization from provider access', async () => {
    const fetch = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetch);
    render(<InventoryAuthorizationHistory listingId="10" />); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Connection authorizations' }));
    expect(await screen.findByText('Business authorization recorded')).toBeInTheDocument();
    expect(screen.getByText(/does not establish provider access/)).toBeInTheDocument();
  });
  it('retains loaded history on pagination failure and retries', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response([grant], 'cursor')).mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValue(response([{ ...grant, id: 'two', status: 'revoked' }])); vi.stubGlobal('fetch', fetch);
    render(<InventoryAuthorizationHistory listingId="10" />); fireEvent.click(screen.getByText('Connection authorizations'));
    fireEvent.click(await screen.findByText('Load older authorizations'));
    fireEvent.click(await screen.findByText('Retry authorization history'));
    expect(await screen.findByText('Revoked')).toBeInTheDocument(); expect(screen.getByText('Business authorization recorded')).toBeInTheDocument();
  });
  it('clears prior Admin data when authentication changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    const view = render(<InventoryAuthorizationHistory listingId="10" />); fireEvent.click(screen.getByText('Connection authorizations'));
    await screen.findByText('Business authorization recorded'); auth.token = null; view.rerender(<InventoryAuthorizationHistory listingId="10" />);
    expect(screen.queryByText('Business authorization recorded')).not.toBeInTheDocument(); expect(screen.getByText(/Sign in again/)).toBeInTheDocument();
  });
});
