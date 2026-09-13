import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConversionConsumer } from '../../lib/marketing/conversions/consumer.js';
import { ConversionDeliveryStore } from '../../lib/marketing/conversions/store.js';
import { CanonicalConversionProviders } from '../../lib/marketing/conversions/providers.js';
import { MarketingMeasurementService } from '../../lib/marketing/measurement.js';
afterEach(() => vi.restoreAllMocks());
describe('bounded conversion maintenance', () => {
  it('starts independent diagnostic reads together and awaits durable writes before dispatch', async () => {
    const rows = [1, 2].map(id => ({ outbox_id: String(id), provider_receipt: `receipt-${id}`, destination: { accountId: '1234567890', actionId: '5001' } }));
    vi.spyOn(ConversionDeliveryStore.prototype, 'observationCandidates').mockResolvedValue(rows);
    const pending: Array<() => void> = [];
    const observed = vi.spyOn(CanonicalConversionProviders.prototype, 'observe').mockImplementation(() => new Promise(resolve => {
      pending.push(() => resolve({ status: 'PROCESSING' })); if (pending.length === 2) pending.forEach(done => done());
    }));
    const written: string[] = []; vi.spyOn(ConversionDeliveryStore.prototype, 'record').mockImplementation(async id => { written.push(id); return true; });
    vi.spyOn(ConversionDeliveryStore.prototype, 'synchronize').mockResolvedValue(0);
    vi.spyOn(MarketingMeasurementService.prototype, 'dispatch').mockImplementation(async () => { expect(written).toEqual(['1', '2']); return { accepted: 0, rejected: 0, unknown: 0, suppressed: 0, attempted: 0 } as any; });
    const consumer = createConversionConsumer({} as any, { actorContext: { id: 90, role: 'system' }, verifyBooking: vi.fn(), resolveAttribution: vi.fn(), google: { customerId: '1234567890', servingCustomerId: '1234567890', conversionActionId: '5001', accessToken: vi.fn() } });
    expect(await consumer.runOnce(2)).toMatchObject({ blocked: false, observed: 2 }); expect(observed).toHaveBeenCalledTimes(2);
  });
  it('awaits every diagnostic write before reporting any persistence failure', async () => {
    vi.spyOn(ConversionDeliveryStore.prototype, 'observationCandidates').mockResolvedValue([{ outbox_id: '1' }, { outbox_id: '2' }]);
    vi.spyOn(CanonicalConversionProviders.prototype, 'observe').mockResolvedValue({ status: 'PROCESSING' });
    const completed: string[] = [];
    vi.spyOn(ConversionDeliveryStore.prototype, 'record').mockImplementation(async id => { if (id === '1') throw new Error('private database detail'); await new Promise(resolve => setTimeout(resolve, 2)); completed.push(id); return true; });
    const dispatch = vi.spyOn(MarketingMeasurementService.prototype, 'dispatch');
    const consumer = createConversionConsumer({} as any, { actorContext: { id: 90, role: 'system' }, verifyBooking: vi.fn(), resolveAttribution: vi.fn(), meta: { pixelId: '6001', accessToken: 'fixture', allowedOrigins: ['https://stays.example'] } });
    await expect(consumer.runOnce(2)).rejects.toMatchObject({ code: 'CONVERSION_DIAGNOSTICS_PERSISTENCE_FAILED' });
    expect(completed).toEqual(['2']); expect(dispatch).not.toHaveBeenCalled();
  });
});
