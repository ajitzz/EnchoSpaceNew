import {createHmac, timingSafeEqual} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {canonicalTripSchema, tripReadProofSchema, type CanonicalTrip,
  type CanonicalTripPage, type TripAuthenticationPort, type TripReadProof} from './canonicalTripContract.js';

export class TripAuthorityError extends Error {
  constructor(readonly code: 'TRIP_INPUT_INVALID' | 'TRIP_AUTHENTICATION_REQUIRED' | 'TRIP_CURSOR_INVALID' |
    'TRIP_ROLE_NOT_RESTRICTED' | 'TRIP_SOURCE_INTEGRITY' | 'TRIP_AUTHORITY_UNAVAILABLE', cause?: unknown) {
    super(code, {cause});
    this.name = 'TripAuthorityError';
  }
}
const listInput = z.object({limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(1024).optional()}).strict();
const detailInput = z.object({reservationId: z.uuid()}).strict();
const cursorSchema = z.object({v: z.literal(1), account: z.number().int().positive(),
  at: z.iso.datetime({precision: 6}), id: z.uuid(), until: z.number().int().positive().safe()}).strict();
type Cursor = z.infer<typeof cursorSchema>;
const readSQL = `SELECT projection FROM public.canonical_own_account_trips(
  $1::text,$2::integer,$3::bigint,$4::uuid,$5::text,$6::integer,$7::uuid,$8::timestamptz,$9::uuid)`;

/** Run against the held connection, not an independently borrowed pool session.
 * PostgreSQL checks actual grants, role attributes, owners and definer setup. */
export async function assertTripReaderRole(client: pg.PoolClient): Promise<void> {
  const result = await client.query('SELECT public.canonical_trip_read_ready() AS ready');
  if (result.rows.length !== 1 || result.rows[0]?.ready !== true)
    throw new TripAuthorityError('TRIP_ROLE_NOT_RESTRICTED');
}

/** Internal only. The composition root must inject a trusted account boundary
 * and a dedicated reader pool. Neither method accepts an account/role override.
 * No production authentication adapter, HTTP handler or deployment is mounted.
 * Cursor key is separate from the authentication issuer key; use a shared secret
 * across instances when this internal service is eventually adopted. */
export class CanonicalTripService<Context> {
  private readonly cursorKey: Buffer;
  constructor(private readonly pool: pg.Pool, private readonly auth: TripAuthenticationPort<Context>,
    cursorKey: Uint8Array) {
    if (cursorKey.byteLength !== 32) throw new Error('TRIP_CURSOR_CONFIGURATION_INVALID');
    this.cursorKey = Buffer.from(cursorKey);
  }

  async list(context: Context, input: unknown = {}): Promise<CanonicalTripPage> {
    const parsed = listInput.safeParse(input);
    if (!parsed.success) throw new TripAuthorityError('TRIP_INPUT_INVALID');
    const proof = await this.authenticate(context);
    const after = parsed.data.cursor ? this.decodeCursor(parsed.data.cursor, proof.accountId) : null;
    const rows = await this.read(proof, parsed.data.limit, null, after);
    const trips = rows.slice(0, parsed.data.limit);
    const last = trips.at(-1);
    return {schemaVersion: 'ENCHO_TRIP_PAGE_V1', trips, nextCursor: rows.length > trips.length && last
      ? this.encodeCursor({v: 1, account: proof.accountId, at: last.reservedAt, id: last.reservationId,
        until: Math.floor(Date.now() / 1000) + 900}) : null};
  }

  async detail(context: Context, input: unknown): Promise<CanonicalTrip | null> {
    const parsed = detailInput.safeParse(input);
    if (!parsed.success) throw new TripAuthorityError('TRIP_INPUT_INVALID');
    const rows = await this.read(await this.authenticate(context), 1, parsed.data.reservationId, null);
    if (rows.length > 1) throw new TripAuthorityError('TRIP_SOURCE_INTEGRITY');
    return rows[0] ?? null; // Identical unauthorized/nonexistent result; no existence probe.
  }

  private async authenticate(context: Context): Promise<TripReadProof> {
    let raw: unknown;
    try { raw = await this.auth.authenticate(context); }
    catch (cause) { throw new TripAuthorityError('TRIP_AUTHENTICATION_REQUIRED', cause); }
    const parsed = tripReadProofSchema.safeParse(raw);
    if (!parsed.success || parsed.data.expiresAtSeconds <= Math.floor(Date.now() / 1000))
      throw new TripAuthorityError('TRIP_AUTHENTICATION_REQUIRED');
    return parsed.data;
  }

  private async read(proof: TripReadProof, limit: number, reservation: string | null,
    after: Cursor | null): Promise<CanonicalTrip[]> {
    let client: pg.PoolClient | undefined;
    let discard = false;
    let connectionFailure: Error | undefined;
    const onConnectionError = (error: Error) => { connectionFailure = error; discard = true; };
    try {
      client = await this.pool.connect();
      // pg emits a separate client error on backend/socket loss in addition to
      // rejecting a pending query. Observe it while leased and discard the
      // connection; an unhandled emitter error must not crash the worker.
      client.on('error', onConnectionError);
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout = '3000ms'");
      await client.query("SET LOCAL lock_timeout = '1000ms'");
      await assertTripReaderRole(client);
      const result = await client.query(readSQL, [proof.keyId, proof.accountId, proof.expiresAtSeconds,
        proof.nonce, proof.mac, limit, reservation, after?.at ?? null, after?.id ?? null]);
      if (result.rows.length > (reservation ? 1 : limit + 1)) throw new TripAuthorityError('TRIP_SOURCE_INTEGRITY');
      const trips = result.rows.map(row => {
        const parsed = canonicalTripSchema.safeParse(row.projection);
        if (!parsed.success) throw new TripAuthorityError('TRIP_SOURCE_INTEGRITY');
        return parsed.data;
      });
      await client.query('COMMIT');
      if (connectionFailure) throw connectionFailure;
      return trips;
    } catch (cause) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch { discard = true; }
      }
      if (cause instanceof TripAuthorityError) throw cause;
      const message = cause instanceof Error ? cause.message : '';
      const code = ['TRIP_AUTHENTICATION_REQUIRED', 'TRIP_ROLE_NOT_RESTRICTED', 'TRIP_SOURCE_INTEGRITY',
        'TRIP_INPUT_INVALID'].includes(message) ? message as TripAuthorityError['code'] : 'TRIP_AUTHORITY_UNAVAILABLE';
      throw new TripAuthorityError(code, cause); // Never convert transport/query uncertainty into [].
    } finally {
      client?.release(discard);
      client?.off('error', onConnectionError);
    }
  }

  private encodeCursor(cursor: Cursor): string {
    const data = Buffer.from(JSON.stringify(cursor)).toString('base64url');
    return `${data}.${createHmac('sha256', this.cursorKey).update(`q1-cursor-v1:${data}`).digest('base64url')}`;
  }

  private decodeCursor(value: string, account: number): Cursor {
    try {
      const parts = value.split('.');
      if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1]))
        throw new Error();
      const expected = createHmac('sha256', this.cursorKey).update(`q1-cursor-v1:${parts[0]}`).digest();
      const actual = Buffer.from(parts[1], 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
      const cursor = cursorSchema.parse(JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')));
      if (cursor.account !== account || cursor.until <= Math.floor(Date.now() / 1000)) throw new Error();
      return cursor;
    } catch { throw new TripAuthorityError('TRIP_CURSOR_INVALID'); }
  }
}
