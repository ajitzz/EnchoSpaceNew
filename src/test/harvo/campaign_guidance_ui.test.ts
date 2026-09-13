// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CampaignGuidance } from '../../../components/marketing/CampaignGuidance.js';
import { marketingRequest } from '../../../components/marketing/api.js';
import type { GuidanceResponse } from '../../lib/marketing/guidanceContract.js';
vi.mock('../../../components/marketing/api.js', () => ({ marketingRequest: vi.fn(), observedTime: (value: string) => value }));
const evidence = [{ field: 'title' as const, quote: 'Lake House' }];
const response = (): GuidanceResponse => ({ status: 'AVAILABLE', listingId: 20, provider: 'GOOGLE', generatedAt: '2026-09-13T12:00:00.000Z', listingEvidenceHash: 'a'.repeat(64), model: 'fixture', requiresHumanReview: true,
  suggestions: { headlines: [{ text: 'Lake House', evidence }, { text: 'Book Lake House', evidence }, { text: 'Explore Lake House', evidence }], descriptions: [{ text: 'Lake House. Check availability.', evidence }, { text: 'Plan your stay at Lake House.', evidence }], keywords: [{ text: 'lake house booking', matchType: 'EXACT', evidence }], notes: ['Review property claims.'] } });
const setup = () => { const onApply = vi.fn(); const view = render(React.createElement(CampaignGuidance, { listingId: '20', provider: 'GOOGLE', onApply })); return { onApply, ...view }; };
beforeEach(() => { vi.mocked(marketingRequest).mockReset(); vi.mocked(marketingRequest).mockResolvedValue(response()); });
afterEach(cleanup);
describe('host review before applying AI guidance', () => {
  it('requests only selected property/channel and never submits the surrounding form', async () => {
    const { onApply } = setup(); const requestButton = screen.getByRole('button', { name: 'Suggest campaign copy' });
    expect(requestButton.getAttribute('type')).toBe('button'); fireEvent.click(requestButton);
    await screen.findByRole('button', { name: 'Apply reviewed copy' });
    expect(marketingRequest).toHaveBeenCalledWith('/campaign-guidance', expect.objectContaining({ method: 'POST', body: JSON.stringify({ listingId: '20', provider: 'GOOGLE' }) }));
    expect(onApply).not.toHaveBeenCalled();
  });
  it('requires explicit unchecked accuracy review and applies only copy and keywords once', async () => {
    const { onApply } = setup(); fireEvent.click(screen.getByRole('button', { name: 'Suggest campaign copy' }));
    const button = await screen.findByRole('button', { name: 'Apply reviewed copy' }) as HTMLButtonElement;
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false); expect(button.disabled).toBe(true); fireEvent.click(button); expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(checkbox); fireEvent.click(button);
    expect(onApply).toHaveBeenCalledTimes(1); expect(onApply.mock.calls[0][0]).toEqual({ headline: 'Lake House', description: 'Lake House. Check availability.', googleSearch: { headlines: ['Lake House', 'Book Lake House', 'Explore Lake House'], descriptions: ['Lake House. Check availability.', 'Plan your stay at Lake House.'], keywords: [{ text: 'lake house booking', matchType: 'EXACT' }] } });
    expect((screen.getByRole('button', { name: 'Applied to your editable draft' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Copy added to the editor. Review your full draft, then save and run its campaign assessment.')).toBeTruthy();
  });
  it('presents each listing citation in native keyboard-accessible disclosure', async () => {
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Suggest campaign copy' })); await screen.findByRole('button', { name: 'Apply reviewed copy' });
    const disclosures = screen.getAllByText('View listing evidence'); expect(disclosures[0].tagName).toBe('SUMMARY'); expect(disclosures[0].parentElement?.tagName).toBe('DETAILS'); expect(screen.getAllByText('title: “Lake House”').length).toBeGreaterThan(0);
  });
  it('unavailable output never offers apply', async () => {
    vi.mocked(marketingRequest).mockResolvedValue({ ...response(), status: 'UNAVAILABLE', code: 'GUIDANCE_NOT_CONFIGURED', suggestions: null });
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Suggest campaign copy' })); await screen.findByText(/AI drafting is unavailable/); expect(screen.queryByRole('button', { name: 'Apply reviewed copy' })).toBeNull();
  });
  it.each([{ listingId: 21 }, { provider: 'META', suggestions: { ...response().suggestions!, keywords: [] } }])('rejects a response bound to a different selection', async changed => {
    vi.mocked(marketingRequest).mockResolvedValue({ ...response(), ...changed }); const { onApply } = setup(); fireEvent.click(screen.getByRole('button', { name: 'Suggest campaign copy' }));
    await screen.findByText(/different property or channel/); expect(onApply).not.toHaveBeenCalled(); expect(screen.queryByRole('checkbox')).toBeNull();
  });
  it('aborts and discards stale asynchronous results after property changes', async () => {
    let resolve!: (value: GuidanceResponse) => void; vi.mocked(marketingRequest).mockImplementation(() => new Promise(value => { resolve = value; }));
    const { rerender, onApply } = setup(); fireEvent.click(screen.getByRole('button', { name: 'Suggest campaign copy' }));
    const signal = vi.mocked(marketingRequest).mock.calls[0][1]?.signal;
    rerender(React.createElement(CampaignGuidance, { listingId: '21', provider: 'GOOGLE', onApply }));
    expect(signal?.aborted).toBe(true); await act(async () => resolve(response()));
    expect(screen.queryByRole('checkbox')).toBeNull(); expect(onApply).not.toHaveBeenCalled();
  });
  it('a new request clears the previous confirmation and applied state', async () => {
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Suggest campaign copy' })); await screen.findByRole('checkbox'); fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Request fresh suggestions' })); await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false));
    expect((screen.getByRole('button', { name: 'Apply reviewed copy' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('missing property or disabled editing prevents model requests', () => {
    const onApply = vi.fn(); render(React.createElement(CampaignGuidance, { listingId: '', provider: 'META', disabled: true, onApply }));
    const button = screen.getByRole('button', { name: 'Suggest campaign copy' }) as HTMLButtonElement; expect(button.disabled).toBe(true); fireEvent.click(button); expect(marketingRequest).not.toHaveBeenCalled();
  });
});
