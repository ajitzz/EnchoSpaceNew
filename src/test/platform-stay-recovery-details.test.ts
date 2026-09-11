import { describe, expect, it, vi } from 'vitest';
import { stayRecoveryDetails } from '../server/stayRecoveryDetails';
const checkoutId = '11111111-1111-4111-8111-111111111111';
const observationId = '22222222-2222-4222-8222-222222222222';
function fixture(options: { enabled?: boolean; missing?: boolean; fail?: boolean; badPayment?: boolean } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT id,listing_id')) return { rows: options.missing ? [] : [{ id: checkoutId, state: 'review' }] };
    if (sql.startsWith('SELECT id FROM')) return { rows: [] };
    if (sql.includes('SELECT id,actor_id')) {
      if (options.fail) throw new Error('private database error');
      return { rows: Array.from({ length: 21 }, () => ({ id: observationId, payments: [{ id: 'pay_test', order_id: 'order_test', amount: options.badPayment ? -1 : 123, currency: 'INR', status: 'captured', amount_refunded: 0, email: 'private@example.test', card: 'private' }] })) };
    }
    if (sql.includes('SELECT id::text')) return { rows: Array.from({ length: 51 }, (_, i) => ({ id: String(100 - i), event_type: 'PROVIDER_PAYMENT_OBSERVED' })) };
    return { rows: [] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  const handler = stayRecoveryDetails({ pool: { connect } as any, enabled: () => options.enabled !== false });
  async function call(role: string | null = 'admin', params = { checkoutId }, queryParams = {}) {
    const res = { code: 200, body: null as any, setHeader: vi.fn(), status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
    await handler({ user: role ? { id: 3, role } : undefined, params, query: queryParams } as any, res as any, vi.fn()); return res;
  }
  return { call, query, connect, release };
}
describe('Admin persisted checkout details', () => {
  it('denies guests, hosts, unauthenticated and disabled requests before connection', async () => {
    const f = fixture();
    for (const role of ['guest', 'host']) expect((await f.call(role)).code).toBe(403);
    expect((await f.call(null)).code).toBe(401); expect(f.connect).not.toHaveBeenCalled();
    const disabled = fixture({ enabled: false }); expect((await disabled.call()).code).toBe(503); expect(disabled.connect).not.toHaveBeenCalled();
  });
  it('rejects malformed checkout/cursors and out-of-range bigint without SQL', async () => {
    const f = fixture(); expect((await f.call('admin', { checkoutId: 'bad' })).code).toBe(400);
    for (const query of [{ observationBefore: 'bad' }, { eventBefore: '9223372036854775808' }, { eventBefore: '-1' }, { eventBefore: ['1', '2'] }, { unknown: 'value' }]) expect((await f.call('admin', { checkoutId }, query)).code).toBe(400);
    expect(f.connect).not.toHaveBeenCalled();
  });
  it('returns bounded scoped evidence with redacted payment JSON and read-only snapshot', async () => {
    const f = fixture(), result = await f.call(); expect(result.code).toBe(200);
    expect(result.body.readOnly).toBe(true); expect(result.body.observations).toHaveLength(20); expect(result.body.events).toHaveLength(50);
    expect(result.body.nextObservationCursor).toBe(observationId); expect(result.body.nextEventCursor).toBe('51');
    expect(JSON.stringify(result.body)).not.toMatch(/private|email|card/);
    expect(result.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(f.query.mock.calls[0][0]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(f.query.mock.calls.some(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('COMMIT'); expect(f.release).toHaveBeenCalledOnce();
  });
  it('returns not-found and rejects a cursor from another checkout', async () => {
    expect((await fixture({ missing: true }).call()).code).toBe(404);
    expect((await fixture().call('admin', { checkoutId }, { observationBefore: observationId })).code).toBe(400);
    expect((await fixture().call('admin', { checkoutId }, { eventBefore: '1' })).code).toBe(400);
  });
  it('rolls back read errors and malformed historical evidence without disclosing internals', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const options of [{ fail: true }, { badPayment: true }]) {
        const f = fixture(options), result = await f.call(); expect(result.code).toBe(503); expect(JSON.stringify(result.body)).not.toContain('private');
        expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK'); expect(f.release).toHaveBeenCalledOnce();
      }
    } finally { log.mockRestore(); }
  });
});
