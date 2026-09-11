// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PropertyReviewQueue } from '../../components/PropertyReviewQueue';
vi.mock('../../components/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const row = { id: 10, host_id: 7, status: 'PENDING_REVIEW', version: 'reviewed-version', updated_at: '2026-09-10T00:00:00Z', draft_data: { title: 'Garden Villa', city: 'Munnar', rooms: [{ id: 'garden', inventory_count: 0 }] } };
const response = (body: any, ok = true) => ({ ok, json: async () => body });
describe('Connected property review workspace', () => {
  it('retains loaded rows on page failure, retries the cursor and refreshes from the start', async () => {
    const older = { ...row, id: 9, draft_data: { title: 'Older Villa' } };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ submissions: [row], nextCursor: '10' }))
      .mockResolvedValueOnce(response({ error: 'Page temporarily unavailable' }, false))
      .mockResolvedValueOnce(response({ submissions: [row, older], nextCursor: null }))
      .mockResolvedValueOnce(response({ submissions: [row], nextCursor: null }));
    vi.stubGlobal('fetch', fetcher); render(<PropertyReviewQueue admin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load older submissions' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Page temporarily unavailable');
    expect(screen.getByRole('heading', { name: 'Garden Villa' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load older submissions' }));
    await screen.findByRole('heading', { name: 'Older Villa' });
    expect(screen.getAllByRole('heading', { name: 'Garden Villa' })).toHaveLength(1);
    expect(fetcher.mock.calls[2][0]).toBe('/api/property-review?scope=admin&before=10');
    expect(screen.queryByRole('button', { name: 'Load older submissions' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Older Villa' })).not.toBeInTheDocument());
    expect(fetcher.mock.calls[3][0]).toBe('/api/property-review?scope=admin');
  });
  it('shows published and proposed values for an existing property', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ submissions: [{ ...row, published_listing: { title: 'Previous Villa', city: 'Munnar' } }] })));
    render(<PropertyReviewQueue admin />);
    await screen.findByRole('button', { name: 'Approve & publish' });
    expect(screen.getByText('Previous Villa')).toBeInTheDocument();
    expect(screen.getAllByText('Currently published').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Submitted version').length).toBeGreaterThan(0);
  });
  it('binds approval to the displayed version and refreshes persisted state', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ submissions: [row] })).mockResolvedValueOnce(response({ submission: { ...row, status: 'PUBLISHED' } })).mockResolvedValueOnce(response({ submissions: [] }));
    vi.stubGlobal('fetch', fetcher); render(<PropertyReviewQueue admin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve & publish' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ decision: 'approve', version: 'reviewed-version' });
    expect(await screen.findByText('No properties awaiting review')).toBeInTheDocument();
  });
  it('requires rejection notes before sending a decision', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ submissions: [row] }));
    vi.stubGlobal('fetch', fetcher); render(<PropertyReviewQueue admin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Request changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add a note'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('restores the saved draft identity and version without exposing admin controls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ submissions: [{ ...row, status: 'DRAFT' }] })));
    const resume = vi.fn(); render(<PropertyReviewQueue onResume={resume} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume draft' }));
    expect(resume).toHaveBeenCalledWith(expect.objectContaining({ id: '', _reviewDraftId: 10, _reviewVersion: 'reviewed-version', title: 'Garden Villa' }));
    expect(screen.queryByRole('button', { name: 'Approve & publish' })).not.toBeInTheDocument();
  });
  it('shows a failed load without claiming there are no submissions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Review temporarily unavailable' }, false)));
    render(<PropertyReviewQueue />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Review temporarily unavailable');
    expect(screen.queryByText('No submissions yet')).not.toBeInTheDocument();
  });
});
