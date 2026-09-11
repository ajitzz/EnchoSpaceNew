import { describe, expect, it, vi } from 'vitest';
import { createChannexStagingBindingReader } from '../server/channexBindingReader';
import { ingestInventoryBinding } from '../server/inventoryBindingIngestion';
const propertyId = '283b9d4b-22d3-4ea7-9b04-03e0e32eb488', roomId = '273b9d4b-22d3-4ea7-9b04-03e0e32eb488';
const grantId = '263b9d4b-22d3-4ea7-9b04-03e0e32eb488', operationId = '253b9d4b-22d3-4ea7-9b04-03e0e32eb488';
const payload = { data: { id: roomId, type: 'room_type', relationships: { property: { data: { id: propertyId, type: 'property' } } } } };
describe('Channex staging identity read', () => {
  it('uses only a fixed staging GET with redirect rejection and exact identity', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    const result = await createChannexStagingBindingReader('fixture-key', request).read(propertyId, roomId, new AbortController().signal);
    expect(result.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(request).toHaveBeenCalledWith(`https://staging.channex.io/api/v1/room_types/${roomId}`, expect.objectContaining({ method: 'GET', redirect: 'error' }));
  });
  it('rejects wrong property identity and HTTP errors without echoing provider bodies', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...payload.data, relationships: {} } }))).mockResolvedValueOnce(new Response('secret-provider-detail', { status: 401 }));
    const reader = createChannexStagingBindingReader('fixture-key', request);
    await expect(reader.read(propertyId, roomId, new AbortController().signal)).rejects.toThrow('identity mismatch');
    await expect(reader.read(propertyId, roomId, new AbortController().signal)).rejects.toThrow('rejected (401)');
  });
  it('rejects oversized responses and invalid IDs', async () => {
    const request = vi.fn().mockResolvedValue(new Response('x'.repeat(512 * 1024 + 1)));
    const reader = createChannexStagingBindingReader('fixture-key', request);
    await expect(reader.read(propertyId, roomId, new AbortController().signal)).rejects.toThrow('size limit');
    request.mockClear(); await expect(reader.read('bad', roomId, new AbortController().signal)).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
  });
});
function fixture(revokeDuringRead = false) {
  let revoked = false, stored = false;
  const order: string[] = [];
  const query = vi.fn(async (sql: string) => {
    order.push(sql);
    if (sql.startsWith('SELECT id,user_id')) return { rows: [{ id: 10, user_id: 7 }] };
    if (sql.startsWith('SELECT g.*')) return { rows: revoked ? [] : [{ owner_id: 7, provider: 'channex_staging', connection_id: 'connection', provider_property_id: propertyId }] };
    if (sql.startsWith('INSERT INTO inventory_binding_attestations')) stored = true;
    if (sql.startsWith('SELECT grant_id')) return { rows: stored ? [{ grant_id: grantId, provider_room_id: roomId, evidence_hash: 'a'.repeat(64) }] : [] };
    return { rows: [] };
  });
  const read = vi.fn(async () => { order.push('NETWORK'); revoked = revokeDuringRead; return { propertyId, roomId, evidenceHash: 'a'.repeat(64) }; });
  const deps = { pool: { connect: async () => ({ query, release: vi.fn() }) } as any, resolveReader: () => ({ provider: 'channex_staging', read }) };
  const input = { listingId: 10, grantId, roomId, operationId, signal: new AbortController().signal };
  return { deps, input, query, read, order };
}
describe('server-only binding ingestion', () => {
  it('commits authorization check before network and revalidates before insertion', async () => {
    const f = fixture(); expect(await ingestInventoryBinding(f.deps, f.input)).toEqual({ id: operationId, replayed: false });
    expect(f.order.indexOf('COMMIT')).toBeLessThan(f.order.indexOf('NETWORK'));
    expect(f.order.filter(sql => sql.startsWith('SELECT g.*'))).toHaveLength(2);
    expect((await ingestInventoryBinding(f.deps, f.input)).replayed).toBe(true); expect(f.read).toHaveBeenCalledTimes(1);
  });
  it('does not persist provider evidence after concurrent authorization revocation', async () => {
    const f = fixture(true); await expect(ingestInventoryBinding(f.deps, f.input)).rejects.toThrow('no longer valid');
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('requires a configured provider and propagates provider failure without a write', async () => {
    const f = fixture(); await expect(ingestInventoryBinding({ ...f.deps, resolveReader: () => undefined }, f.input)).rejects.toThrow('unavailable');
    f.read.mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(ingestInventoryBinding(f.deps, f.input)).rejects.toThrow('Provider unavailable');
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
});
