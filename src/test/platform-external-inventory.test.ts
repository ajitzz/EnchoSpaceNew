import { describe, expect, it, vi } from 'vitest';
import { assessExternalInventory, readExternalInventory, type ExternalInventoryMapping } from '../server/externalInventory';

const mapping: ExternalInventoryMapping = { id: '45b68792-3125-4af7-af84-ecc18dce3b95', listingId: 12, roomId: 'suite', provider: 'test-provider', connectionId: 'test-connection', providerPropertyId: 'property-12', providerRoomId: 'suite-1' };
const now = Date.parse('2026-09-11T10:00:00Z');
const snapshot = () => ({ mapping: { ...mapping }, eventId: 'test-event', observedAt: '2026-09-11T09:59:00Z', days: [{ date: '2026-09-20', remaining: 3 }, { date: '2026-09-21', remaining: 2 }] });
const input = () => ({ mapping, listingId: 12, roomId: 'suite', checkIn: '2026-09-20', checkOut: '2026-09-22', now, evidence: { snapshot: snapshot(), receivedAt: '2026-09-11T09:59:30Z' } });

describe('server-owned external inventory evidence', () => {
  it('uses minimum nightly stock without authorizing checkout or advertising', () => {
    expect(assessExternalInventory(input())).toEqual({ state: 'available', remaining: 2, observedAt: '2026-09-11T09:59:00Z', checkoutAuthorized: false, deliveryAuthorized: false });
  });
  it('preserves zero and exclusive checkout', () => {
    const value = input(); value.evidence.snapshot.days[1].remaining = 0;
    expect(assessExternalInventory(value)).toMatchObject({ state: 'unavailable', remaining: 0 });
    expect(assessExternalInventory({ ...value, checkOut: '2026-09-21' })).toMatchObject({ state: 'available', remaining: 3 });
  });
  it('requires server mapping and evidence', () => {
    expect(assessExternalInventory({ ...input(), mapping: null })).toMatchObject({ reason: 'missing_mapping' });
    expect(assessExternalInventory({ ...input(), evidence: null })).toMatchObject({ reason: 'missing_evidence' });
  });
  it.each(['id', 'provider', 'connectionId', 'providerPropertyId', 'providerRoomId', 'roomId'] as const)('rejects mismatched %s', key => {
    const value = input(); value.evidence.snapshot.mapping[key] = key === 'id' ? '75b68792-3125-4af7-af84-ecc18dce3b95' : 'other';
    expect(assessExternalInventory(value).state).toBe('unknown');
  });
  it('rejects cross-listing and cross-room reads', () => {
    expect(assessExternalInventory({ ...input(), listingId: 13 })).toMatchObject({ reason: 'mapping_mismatch' });
    expect(assessExternalInventory({ ...input(), roomId: 'other' })).toMatchObject({ reason: 'mapping_mismatch' });
  });
  it.each(['2026-09-11T09:54:59Z', '2026-09-11T10:00:01Z', 'not-a-date'])('rejects stale/future/invalid observation %s', observedAt => {
    const value = input(); value.evidence.snapshot.observedAt = observedAt;
    expect(assessExternalInventory(value).state).toBe('unknown');
  });
  it('rejects future receipt and reversed timestamp order', () => {
    for (const receivedAt of ['2026-09-11T10:00:01Z', '2026-09-11T09:58:00Z']) {
      const value = input(); value.evidence.receivedAt = receivedAt;
      expect(assessExternalInventory(value)).toMatchObject({ reason: 'stale_evidence' });
    }
  });
  it('rejects missing and duplicate days, not treating a delta as a snapshot', () => {
    const value = input(); value.evidence.snapshot.days.pop();
    expect(assessExternalInventory(value)).toMatchObject({ reason: 'incomplete_coverage' });
    value.evidence.snapshot.days.push(value.evidence.snapshot.days[0]);
    expect(assessExternalInventory(value)).toMatchObject({ reason: 'invalid_evidence' });
  });
  it.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects malformed stock %s', remaining => {
    const value = input(); value.evidence.snapshot.days[0].remaining = remaining;
    expect(assessExternalInventory(value)).toMatchObject({ reason: 'invalid_evidence' });
  });
  it('rejects invalid dates, empty/reversed/oversized ranges and invalid clock', () => {
    for (const checkOut of ['2026-09-20', '2026-09-19', '2028-09-20', '2026-02-30']) expect(assessExternalInventory({ ...input(), checkOut }).state).toBe('unknown');
    expect(assessExternalInventory({ ...input(), now: NaN }).state).toBe('unknown');
  });
  it('validates adapter binding before network work', async () => {
    const readSnapshot = vi.fn();
    await expect(readExternalInventory({ provider: 'other', readSnapshot }, { ...input(), signal: new AbortController().signal })).rejects.toThrow('binding');
    expect(readSnapshot).not.toHaveBeenCalled();
  });
  it('uses server receipt time and validates provider results', async () => {
    const adapter = { provider: mapping.provider, readSnapshot: vi.fn().mockResolvedValue(snapshot()) };
    const request = { ...input(), signal: new AbortController().signal };
    expect((await readExternalInventory(adapter, request, () => now)).receivedAt).toBe('2026-09-11T10:00:00.000Z');
    adapter.readSnapshot.mockResolvedValue({ ...snapshot(), days: [] });
    await expect(readExternalInventory(adapter, request, () => now)).rejects.toThrow('invalid_evidence');
  });
  it('propagates provider failure and aborts without fabricating success', async () => {
    const adapter = { provider: mapping.provider, readSnapshot: vi.fn().mockRejectedValue(new Error('provider unavailable')) };
    const controller = new AbortController();
    await expect(readExternalInventory(adapter, { ...input(), signal: controller.signal })).rejects.toThrow('provider unavailable');
    controller.abort(); adapter.readSnapshot.mockClear();
    await expect(readExternalInventory(adapter, { ...input(), signal: controller.signal })).rejects.toThrow();
    expect(adapter.readSnapshot).not.toHaveBeenCalled();
  });
});
