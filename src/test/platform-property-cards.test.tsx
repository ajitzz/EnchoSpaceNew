// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HostPropertyCards } from '../../components/HostPropertyCards';
vi.mock('../../components/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const listing = { id: '42', title: 'Garden Villa', city: 'Munnar', price: 1500, currency: 'INR' } as any;
describe('Host published properties', () => {
  it('uses the property currency and honest missing-photo state', () => {
    render(<HostPropertyCards listings={[listing]} onDeleted={vi.fn()} />);
    expect(screen.getByText('₹1,500.00')).toBeInTheDocument();
    expect(screen.getByText('Property photo unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('filters properties by destination and name', () => {
    render(<HostPropertyCards listings={[listing]} onDeleted={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Goa' } });
    expect(screen.getByText('No matching properties')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'garden' } });
    expect(screen.getByRole('heading', { name: 'Garden Villa' })).toBeInTheDocument();
  });
  it('keeps the property after a failed delete and shows the server error', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Property has reservations' }) }));
    const deleted = vi.fn(); render(<HostPropertyCards listings={[listing]} onDeleted={deleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Garden Villa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Property has reservations');
    expect(deleted).not.toHaveBeenCalled(); expect(screen.getByRole('heading', { name: 'Garden Villa' })).toBeInTheDocument();
  });
  it('removes a property only after server confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const deleted = vi.fn(); render(<HostPropertyCards listings={[listing]} onDeleted={deleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Garden Villa' }));
    await waitFor(() => expect(deleted).toHaveBeenCalledWith('42'));
  });
});
