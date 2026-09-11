import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createExternalInventoryMappingsRouter } from '../server/externalInventoryMappings';
import { verifyRegisteredInventoryBinding } from '../server/inventoryConnectionRegistry';
import { createInventoryConnectionGrantsRouter } from '../server/inventoryConnectionGrants';
import { ingestInventoryBinding } from '../server/inventoryBindingIngestion';

// Never load dotenv or DATABASE_URL. This suite requires its own empty local cluster.
const socket = process.env.ENCHO_INVENTORY_TEST_SOCKET;
const safeSocket = socket && /^\/private\/tmp\/encho-inventory-test\.[a-zA-Z0-9]+$/.test(socket);
describe.skipIf(!safeSocket)('External inventory isolated PostgreSQL', () => {
  const pool = new pg.Pool({ host: socket, port: 55440, user: 'encho_inventory_test', database: 'inventory_fixture' });
  const mapping = 'd084b715-e21f-4136-8733-76545621dd91';
  const observation = 'd084b715-e21f-4136-8733-76545621dd92';
  beforeAll(async () => {
    const existing = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'");
    if (Number(existing.rows[0].count)) throw new Error('Refusing non-empty inventory fixture database');
    await pool.query(`CREATE TABLE users(id INTEGER PRIMARY KEY);
      CREATE TABLE listings(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), rooms JSONB);
      INSERT INTO users VALUES(1),(2),(3);
      INSERT INTO listings VALUES(10,1,'[{"id":"suite","inventory_source":"external_sync"},{"id":"second","inventory_source":"external_sync"}]'),(20,2,'[]');
      ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE listings FORCE ROW LEVEL SECURITY;
      CREATE POLICY listing_owner ON listings FOR SELECT USING(user_id::text=current_setting('app.current_user_id',true) OR current_setting('app.bypass_rls',true)='true');`);
    await pool.query(readFileSync(new URL('../../docs/migrations/20260911_external_inventory_evidence.sql', import.meta.url), 'utf8'));
    await pool.query(readFileSync(new URL('../../docs/migrations/20260911_external_inventory_lifecycle.sql', import.meta.url), 'utf8'));
    await pool.query(readFileSync(new URL('../../docs/migrations/20260911_inventory_connection_registry.sql', import.meta.url), 'utf8'));
    await pool.query(readFileSync(new URL('../../docs/migrations/20260911_inventory_grant_idempotency.sql', import.meta.url), 'utf8'));
    await pool.query(`CREATE ROLE inventory_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT SELECT ON listings TO inventory_app;
      GRANT SELECT,INSERT,UPDATE,DELETE ON external_inventory_mappings,external_inventory_observations,external_inventory_current,external_inventory_mapping_events TO inventory_app;
      GRANT USAGE ON SEQUENCE external_inventory_mapping_events_sequence_seq TO inventory_app;
      GRANT SELECT,INSERT,UPDATE,DELETE ON inventory_connection_grants,inventory_connection_revocations,inventory_binding_attestations TO inventory_app;`);
    await pool.query(`INSERT INTO external_inventory_mappings VALUES($1,10,'suite','fixture','connection','property','room',3,now());
    `, [mapping]);
    await pool.query(`INSERT INTO external_inventory_observations(id,mapping_id,event_id,observed_at,days)
      VALUES($1,$2,'first',now(),'[{"date":"2026-09-20","remaining":2}]')`, [observation, mapping]);
  });
  afterAll(async () => { await pool.end(); });
  async function asRole(userId: string, bypass: boolean, operation: (client: pg.PoolClient) => Promise<void>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE inventory_app');
      await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.bypass_rls',$2,true)", [userId, String(bypass)]);
      await operation(client);
    } finally { await client.query('ROLLBACK'); client.release(); }
  }
  it('isolates owner reads through both mapping and listing policies', async () => {
    for (const [user, count] of [['1', 1], ['2', 0], ['', 0]] as const) {
      await asRole(user, false, async client => {
        expect((await client.query('SELECT * FROM external_inventory_mappings')).rowCount).toBe(count);
        expect((await client.query('SELECT * FROM external_inventory_observations')).rowCount).toBe(count);
      });
    }
  });
  it('rejects owner-created verification even with INSERT table grants', async () => {
    await expect(asRole('1', false, client => client.query(`INSERT INTO external_inventory_mappings VALUES('d084b715-e21f-4136-8733-76545621dd93',10,'suite','fixture','connection','property','room',1,now())`).then(() => undefined))).rejects.toThrow('row-level security');
    await expect(asRole('1', false, client => client.query(`INSERT INTO external_inventory_observations(id,mapping_id,event_id,observed_at,days) VALUES('d084b715-e21f-4136-8733-76545621dd94',$1,'forged',now(),'[{}]')`, [mapping]).then(() => undefined))).rejects.toThrow('row-level security');
  });
  it('permits scoped server inserts and clears transaction-local bypass on rollback', async () => {
    await asRole('3', true, async client => {
      expect((await client.query('SELECT * FROM external_inventory_observations')).rowCount).toBe(1);
      await client.query(`INSERT INTO external_inventory_observations(id,mapping_id,event_id,observed_at,days) VALUES('d084b715-e21f-4136-8733-76545621dd95',$1,'server',now(),'[{"date":"2026-09-21","remaining":0}]')`, [mapping]);
    });
    await asRole('2', false, async client => { expect((await client.query('SELECT * FROM external_inventory_observations')).rowCount).toBe(0); });
  });
  it('preserves immutable rows even for a privileged writer', async () => {
    for (const table of ['external_inventory_mappings', 'external_inventory_observations']) {
      await expect(pool.query(`DELETE FROM ${table}`)).rejects.toThrow('append-only');
      await expect(pool.query(`UPDATE ${table} SET id=id`)).rejects.toThrow('append-only');
    }
  });
  it('rejects duplicate event delivery rather than overwriting its evidence', async () => {
    await expect(pool.query(`INSERT INTO external_inventory_observations(id,mapping_id,event_id,observed_at,days) VALUES('d084b715-e21f-4136-8733-76545621dd96',$1,'first',now(),'[{}]')`, [mapping])).rejects.toMatchObject({ code: '23505' });
  });
  it('enforces references, date ordering and bounded snapshot shape', async () => {
    const sql = `INSERT INTO external_inventory_observations(id,mapping_id,event_id,observed_at,received_at,days) VALUES('d084b715-e21f-4136-8733-76545621dd97',$1,'invalid',$2,$3,$4)`;
    for (const days of ['{}','[]',JSON.stringify(Array.from({ length: 366 }, () => ({})))]) {
      await expect(pool.query(sql, [mapping, '2026-09-11', '2026-09-11', days])).rejects.toThrow();
    }
    await expect(pool.query(sql, [mapping, '2026-09-12', '2026-09-11', '[{}]'])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(sql, ['d084b715-e21f-4136-8733-76545621dd99', '2026-09-11', '2026-09-11', '[{}]'])).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query('DELETE FROM listings WHERE id=10')).rejects.toMatchObject({ code: '23001' });
  });
  async function registryFixture(client: pg.PoolClient, options: { age?: string; expiry?: string; grantExpiry?: string; approved?: string } = {}) {
    const grant = randomUUID();
    const value = { provider: 'fixture', connectionId: grant, providerPropertyId: 'property', providerRoomId: 'room' };
    await client.query(`INSERT INTO inventory_connection_grants(id,connection_id,provider,listing_id,owner_id,provider_property_id,approved_by,authorization_reference,approved_at,expires_at)
      VALUES($1::uuid,$1::text,'fixture',10,1,'property',3,'fixture-authorization',now()+$2::interval,now()+$3::interval)`, [grant, options.approved ?? '-1 hour', options.grantExpiry ?? '1 hour']);
    await client.query(`INSERT INTO inventory_binding_attestations(id,grant_id,provider_property_id,provider_room_id,observed_at,received_at,expires_at,evidence_hash)
      VALUES($1,$2,'property','room',now()+$3::interval,now()+$3::interval,now()+$4::interval,$5)`, [randomUUID(), grant, options.age ?? '-1 minute', options.expiry ?? '1 minute', 'a'.repeat(64)]);
    return { grant, value };
  }
  it('requires exact binding and current listing owner for real registry SQL', async () => {
    await asRole('3', true, async client => {
      const { value } = await registryFixture(client);
      expect(await verifyRegisteredInventoryBinding(client, value, 1, 10)).toBe(true);
      expect(await verifyRegisteredInventoryBinding(client, value, 2, 10)).toBe(false);
      expect(await verifyRegisteredInventoryBinding(client, value, 1, 20)).toBe(false);
      for (const key of ['provider','connectionId','providerPropertyId','providerRoomId'] as const) {
        expect(await verifyRegisteredInventoryBinding(client, { ...value, [key]: 'wrong' }, 1, 10)).toBe(false);
      }
    });
  });
  it('rejects expired grants, expired attestations and future attestations or approvals', async () => {
    for (const options of [{ grantExpiry: '-1 minute' }, { age: '-6 minutes', expiry: '-2 minutes' }, { age: '1 minute', expiry: '2 minutes' }, { approved: '1 minute' }]) {
      await asRole('3', true, async client => {
        const { value } = await registryFixture(client, options);
        expect(await verifyRegisteredInventoryBinding(client, value, 1, 10)).toBe(false);
      });
    }
  });
  it('rejects revocation immediately and preserves immutable registry history', async () => {
    await asRole('3', true, async client => {
      const { grant, value } = await registryFixture(client);
      await client.query('INSERT INTO inventory_connection_revocations(grant_id,actor_id,reason) VALUES($1,3,$2)', [grant, 'Fixture revocation']);
      expect(await verifyRegisteredInventoryBinding(client, value, 1, 10)).toBe(false);
      // RLS suppresses DELETE targets for the application role before triggers run.
      expect((await client.query('DELETE FROM inventory_connection_grants')).rowCount).toBe(0);
      await client.query('SET LOCAL ROLE encho_inventory_test');
      for (const table of ['inventory_connection_grants','inventory_connection_revocations','inventory_binding_attestations']) {
        await client.query('SAVEPOINT mutation_check');
        await expect(client.query(`DELETE FROM ${table}`)).rejects.toThrow('append-only');
        await client.query('ROLLBACK TO SAVEPOINT mutation_check');
      }
    });
  });
  it('invalidates an old grant after property ownership transfers', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { value } = await registryFixture(client);
      await client.query('UPDATE listings SET user_id=2 WHERE id=10');
      expect(await verifyRegisteredInventoryBinding(client, value, 1, 10)).toBe(false);
      expect(await verifyRegisteredInventoryBinding(client, value, 2, 10)).toBe(false);
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
  it('hides registry evidence from hosts and rejects forged grants despite table grants', async () => {
    await asRole('3', true, async client => {
      await registryFixture(client);
      await client.query("SELECT set_config('app.bypass_rls','false',true),set_config('app.current_user_id','1',true)");
      for (const table of ['inventory_connection_grants','inventory_connection_revocations','inventory_binding_attestations']) expect((await client.query(`SELECT * FROM ${table}`)).rowCount).toBe(0);
      await expect(registryFixture(client)).rejects.toThrow('row-level security');
    });
  });
  it('rejects an attestation lifetime above five minutes at the database boundary', async () => {
    await expect(asRole('3', true, client => registryFixture(client, { expiry: '10 minutes' }).then(() => undefined))).rejects.toMatchObject({ code: '23514' });
  });
  async function authorize(listingId: number, body: unknown, grantId?: string) {
    const router = createInventoryConnectionGrantsRouter({ pool, authenticate: (_req, _res, next) => next(), enabled: () => true });
    const path = grantId ? '/:listingId/grants/:grantId/revoke' : '/:listingId/grants';
    const handler = (router.stack.find((item: any) => item.route?.path === path) as any).route.stack[0].handle;
    const res = { code: 200, body: null as any, status(code: number) { this.code = code; return this; }, json(value: any) { this.body = value; return this; } };
    await handler({ params: { listingId: String(listingId), grantId }, user: { id: 3, role: 'admin' }, body }, res); return res;
  }
  const authorization = () => ({ ownerId: 1, requestKey: randomUUID(), provider: 'fixture', connectionId: randomUUID(), providerPropertyId: 'property', authorizationReference: 'fixture-review', expiresAt: new Date(Date.now()+3600000).toISOString() });
  it('creates exactly one grant for concurrent identical requests and rejects body changes', async () => {
    const body = authorization();
    const results = await Promise.all([authorize(10, body), authorize(10, body)]);
    expect(results.map(result => result.code)).toEqual([200,200]);
    expect(results[0].body.grantId).toBe(results[1].body.grantId);
    expect((await pool.query('SELECT * FROM inventory_connection_grants WHERE request_key=$1', [body.requestKey])).rowCount).toBe(1);
    expect((await authorize(10, { ...body, authorizationReference: 'changed' })).code).toBe(409);
  });
  it('serializes claims for the same provider property across different listings', async () => {
    const body = authorization();
    const results = await Promise.all([authorize(10, body), authorize(20, { ...body, ownerId: 2, requestKey: randomUUID() })]);
    expect(results.map(result => result.code).sort()).toEqual([200,409]);
    expect((await pool.query('SELECT * FROM inventory_connection_grants WHERE connection_id=$1', [body.connectionId])).rowCount).toBe(1);
  });
  it('revocation blocks registry verification and retries preserve its audit record', async () => {
    const body = authorization(); const created = await authorize(10, body); expect(created.code).toBe(200);
    const grantId = created.body.grantId;
    await pool.query(`INSERT INTO inventory_binding_attestations(id,grant_id,provider_property_id,provider_room_id,observed_at,received_at,expires_at,evidence_hash)
      VALUES($1,$2,'property','room',now(),now(),now()+interval '1 minute',$3)`, [randomUUID(), grantId, 'a'.repeat(64)]);
    const value = { provider: body.provider, connectionId: body.connectionId, providerPropertyId: body.providerPropertyId, providerRoomId: 'room' };
    await asRole('3', true, async client => { expect(await verifyRegisteredInventoryBinding(client, value, 1, 10)).toBe(true); });
    const requests = await Promise.all([authorize(10, { reason: 'Withdrawn' }, grantId), authorize(10, { reason: 'Withdrawn' }, grantId)]);
    expect(requests.map(result => result.code)).toEqual([200,200]);
    await asRole('3', true, async client => { expect(await verifyRegisteredInventoryBinding(client, value, 1, 10)).toBe(false); });
    expect((await authorize(10, { reason: 'Changed' }, grantId)).code).toBe(409);
    expect((await pool.query('SELECT * FROM inventory_connection_revocations WHERE grant_id=$1', [grantId])).rowCount).toBe(1);
    expect((await pool.query('SELECT * FROM inventory_binding_attestations WHERE grant_id=$1', [grantId])).rowCount).toBe(1);
  });
  it('rejects stale ownership and expired or excessively long authorizations using database time', async () => {
    const body = authorization();
    expect((await authorize(10, { ...body, ownerId: 2 })).code).toBe(409);
    for (const expiresAt of ['2000-01-01T00:00:00Z','2999-01-01T00:00:00Z']) expect((await authorize(10, { ...body, expiresAt })).code).toBe(400);
    expect((await pool.query('SELECT * FROM inventory_connection_grants WHERE request_key=$1', [body.requestKey])).rowCount).toBe(0);
  });
  it('requires paired retry metadata and unique actor/retry keys at the database boundary', async () => {
    const sql = `INSERT INTO inventory_connection_grants(id,connection_id,provider,listing_id,owner_id,provider_property_id,approved_by,authorization_reference,expires_at,request_key,request_hash)
      VALUES($1,'fixture','fixture',10,1,'property',3,'fixture',now()+interval '1 hour',$2,$3)`;
    await expect(pool.query(sql, [randomUUID(), randomUUID(), null])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(sql, [randomUUID(), null, 'a'.repeat(64)])).rejects.toMatchObject({ code: '23514' });
    const key = randomUUID(); await pool.query(sql, [randomUUID(), key, 'a'.repeat(64)]);
    await expect(pool.query(sql, [randomUUID(), key, 'a'.repeat(64)])).rejects.toMatchObject({ code: '23505' });
  });
  it('ingests identity evidence only after valid authorization and replays without refetching', async () => {
    const body = authorization(); const grantId = (await authorize(10, body)).body.grantId;
    let reads = 0;
    const deps = { pool, resolveReader: () => ({ provider: 'fixture', read: async () => { reads++; return { propertyId: 'property', roomId: 'room', evidenceHash: 'b'.repeat(64) }; } }) };
    const input = { listingId: 10, grantId, roomId: 'room', operationId: randomUUID(), signal: new AbortController().signal };
    expect((await ingestInventoryBinding(deps, input)).replayed).toBe(false);
    expect((await ingestInventoryBinding(deps, input)).replayed).toBe(true); expect(reads).toBe(1);
    await asRole('3', true, async client => {
      expect(await verifyRegisteredInventoryBinding(client, { provider: 'fixture', connectionId: body.connectionId, providerPropertyId: 'property', providerRoomId: 'room' }, 1, 10)).toBe(true);
    });
  });
  it('does not ingest evidence if Admin revokes while the provider read is in flight', async () => {
    const grantId = (await authorize(10, authorization())).body.grantId;
    const operationId = randomUUID();
    const deps = { pool, resolveReader: () => ({ provider: 'fixture', read: async () => {
      expect((await authorize(10, { reason: 'Revoked during provider read' }, grantId)).code).toBe(200);
      return { propertyId: 'property', roomId: 'room', evidenceHash: 'b'.repeat(64) };
    } }) };
    await expect(ingestInventoryBinding(deps, { listingId: 10, grantId, roomId: 'room', operationId, signal: new AbortController().signal })).rejects.toThrow('no longer valid');
    expect((await pool.query('SELECT * FROM inventory_binding_attestations WHERE id=$1', [operationId])).rowCount).toBe(0);
  });
  it('returns Admin history with computed revocation state and rejects non-Admin readers', async () => {
    const body = authorization(); const grantId = (await authorize(10, body)).body.grantId;
    await authorize(10, { reason: 'History fixture' }, grantId);
    const router = createInventoryConnectionGrantsRouter({ pool, authenticate: (_req, _res, next) => next(), enabled: () => true });
    const handler = (router.stack.find((item: any) => item.route?.methods.get) as any).route.stack[0].handle;
    async function read(role: string) {
      const res = { code: 200, body: null as any, status(code: number) { this.code = code; return this; }, json(value: any) { this.body = value; return this; } };
      await handler({ params: { listingId: '10' }, query: {}, user: { id: 3, role } }, res); return res;
    }
    expect((await read('guest')).code).toBe(403);
    const result = await read('admin'); expect(result.code).toBe(200);
    expect(result.body.grants.find((g: any) => g.id === grantId).status).toBe('revoked'); expect(result.body.checkoutAuthorized).toBe(false);
  });
  async function lifecycle(method: string, roomId: string, body: unknown) {
    const router = createExternalInventoryMappingsRouter({ pool, authenticate: (_req, _res, next) => next(), enabled: () => true, verifyBinding: async () => true });
    const handler = (router.stack.find((item: any) => item.route?.methods[method]) as any).route.stack[0].handle;
    const res = { code: 200, body: null as any, status(code: number) { this.code = code; return this; }, json(value: any) { this.body = value; return this; } };
    await handler({ params: { listingId: '10', roomId }, user: { id: 3, role: 'admin' }, body }, res); return res;
  }
  const binding = { provider: 'fixture', connectionId: 'connection', providerPropertyId: 'property', providerRoomId: 'live-room' };
  it('serializes competing mapping revisions and replays the successful request', async () => {
    const requests = [0,1].map(() => ({ version: null, requestKey: randomUUID(), reason: 'Fixture verification', binding }));
    const results = await Promise.all(requests.map(body => lifecycle('put', 'suite', body)));
    expect(results.map(r => r.code).sort()).toEqual([200,409]);
    const winner = results.findIndex(r => r.code === 200);
    expect((await lifecycle('put', 'suite', requests[winner])).body.replayed).toBe(true);
    expect((await pool.query("SELECT * FROM external_inventory_current WHERE listing_id=10 AND room_id='suite'")).rowCount).toBe(1);
  });
  it('rejects reusing an active provider room and rolls back the new mapping', async () => {
    const before = (await pool.query('SELECT count(*) FROM external_inventory_mappings')).rows[0].count;
    expect((await lifecycle('put', 'second', { version: null, requestKey: randomUUID(), reason: 'Conflicting fixture', binding })).code).toBe(409);
    expect((await pool.query('SELECT count(*) FROM external_inventory_mappings')).rows[0].count).toBe(before);
  });
  it('revokes only the current pointer, preserves history and denies host lifecycle writes', async () => {
    const current = await lifecycle('get', 'suite', null);
    const result = await lifecycle('delete', 'suite', { version: current.body.version, requestKey: randomUUID(), reason: 'Fixture revocation' });
    expect(result.body.mappingId).toBeNull();
    expect((await pool.query('SELECT * FROM external_inventory_mappings WHERE id=$1', [current.body.mappingId])).rowCount).toBe(1);
    await expect(pool.query("UPDATE external_inventory_mapping_events SET reason='changed'")).rejects.toThrow('append-only');
    await asRole('2', false, async client => {
      expect((await client.query('SELECT * FROM external_inventory_mapping_events')).rowCount).toBe(0);
    });
    await expect(asRole('1', false, client => client.query(`INSERT INTO external_inventory_mapping_events(id,listing_id,room_id,actor_id,action,reason,request_key,request_hash) VALUES($1,10,'suite',1,'revoked','forged',$2,'forged')`, [randomUUID(), randomUUID()]).then(() => undefined))).rejects.toThrow('row-level security');
  });
});
