// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InventoryMappingStatus } from '../../components/InventoryMappingStatus';
const auth = vi.hoisted(() => ({ token: 'test-token' as string | null }));
vi.mock('../../components/AuthContext', () => ({ useAuth: () => auth }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); auth.token = 'test-token'; });
const rooms = [{ id: 'suite', name: 'Garden suite' }, { id: 'sea', name: 'Sea room' }];
const response = (state = 'unmapped') => ({ ok: true, status: 200, json: async () => ({ state, checkoutAuthorized: false, deliveryAuthorized: false }) });
function open() { fireEvent.click(screen.getByRole('button', { name: 'External inventory status' })); }
describe('shared inventory status panel', () => {
  it('fetches only when opened and sends authenticated read-only requests', async () => {
    const fetch = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetch);
    render(<InventoryMappingStatus listingId="10" rooms={rooms} />); expect(fetch).not.toHaveBeenCalled(); open();
    expect(await screen.findByText('No current provider mapping for this room.')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/inventory-mappings/10/rooms/suite', expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }));
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });
  it('does not describe a mapping as synchronization or booking permission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('mapped_not_synchronized')));
    render(<InventoryMappingStatus listingId="10" rooms={rooms} />); open();
    expect(await screen.findByText('Room mapped · synchronization not verified.')).toBeInTheDocument();
    expect(screen.getByText(/does not enable external checkout/)).toBeInTheDocument();
  });
  it('shows disabled rollout distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ code: 'INVENTORY_MAPPING_DISABLED' }) }));
    render(<InventoryMappingStatus listingId="10" rooms={rooms} />); open();
    expect(await screen.findByText('External inventory setup is not enabled yet.')).toBeInTheDocument();
  });
  it('retries failures and rejects unknown response states', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response('verified')).mockResolvedValue(response()); vi.stubGlobal('fetch', fetch);
    render(<InventoryMappingStatus listingId="10" rooms={rooms} />); open();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry mapping status' }));
    expect(await screen.findByText('No current provider mapping for this room.')).toBeInTheDocument();
  });
  it('aborts previous room requests and ignores late responses', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(response()); vi.stubGlobal('fetch', fetch);
    render(<InventoryMappingStatus listingId="10" rooms={rooms} />); open();
    fireEvent.change(screen.getByRole('combobox', { name: 'Room' }), { target: { value: 'sea' } });
    expect(await screen.findByText('No current provider mapping for this room.')).toBeInTheDocument();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    resolve(response('mapped_not_synchronized'));
    await waitFor(() => expect(screen.queryByText('Room mapped · synchronization not verified.')).not.toBeInTheDocument());
  });
  it('does not fetch without authentication or a unique room identity', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); auth.token = null;
    const view = render(<InventoryMappingStatus listingId="10" rooms={rooms} />); open();
    expect(screen.getByText('Sign in again to check mapping status.')).toBeInTheDocument();
    view.rerender(<InventoryMappingStatus listingId="10" rooms={[rooms[0], rooms[0]]} />);
    expect(screen.getByText(/No unique room identity/)).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
  });
});
