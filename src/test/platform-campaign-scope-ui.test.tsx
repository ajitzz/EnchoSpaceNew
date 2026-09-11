// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CampaignStayScope } from '../../components/CampaignStayScope';
vi.mock('../../components/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('labels internal availability without claiming external delivery readiness', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ scope: null, rooms: [], editable: false, availability: { state: 'unknown', checkedAt: '2090-04-01T00:00:00Z', reason: 'Hold tracking unavailable', rooms: [] } }) })));
  render(<CampaignStayScope campaignId={5} readOnly />);
  fireEvent.click(screen.getByText('Advertised stay dates and rooms'));
  expect(await screen.findByText('Internal availability: unknown')).toBeInTheDocument();
  expect(screen.getByText('Hold tracking unavailable')).toBeInTheDocument();
  expect(screen.getByText('External channels are unverified. This is not permission to launch or resume ads.')).toBeInTheDocument();
});
it('acknowledges only the displayed version and revokes acknowledgement on uncheck', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ scope: { checkIn: '2090-04-01', checkOut: '2090-04-04', roomIds: ['garden'] }, version: 'displayed-version', rooms: [{ id: 'garden', name: 'Garden' }], editable: false }) })));
  const reviewed = vi.fn(); render(<CampaignStayScope campaignId={5} readOnly onReviewed={reviewed} />);
  fireEvent.click(screen.getByText('Advertised stay dates and rooms'));
  const checkbox = await screen.findByRole('checkbox', { name: 'I reviewed these stay dates and selected rooms.' });
  expect(reviewed).not.toHaveBeenCalled();
  fireEvent.click(checkbox); expect(reviewed).toHaveBeenLastCalledWith('displayed-version');
  fireEvent.click(checkbox); expect(reviewed).toHaveBeenLastCalledWith(null);
  expect(screen.getByLabelText('Advertised check-in')).toBeDisabled();
});
