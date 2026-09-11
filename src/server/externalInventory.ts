import { z } from 'zod';
import { dateDay } from '../../lib/stayQuote.js';

const identity = z.string().trim().min(1).max(200);
const mappingSchema = z.object({
  id: z.string().uuid(), listingId: z.number().int().positive(),
  roomId: identity.refine(value => !value.includes(',')),
  provider: identity, connectionId: identity, providerPropertyId: identity, providerRoomId: identity,
}).strict();
const timestamp = z.string().datetime({ offset: true });
const day = z.string().refine(value => {
  try { dateDay(value); return true; } catch { return false; }
});
const snapshotSchema = z.object({
  mapping: mappingSchema, eventId: identity,
  observedAt: timestamp,
  days: z.array(z.object({ date: day, remaining: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict()).min(1).max(365),
}).strict();

export type ExternalInventoryMapping = z.infer<typeof mappingSchema>;
export type ExternalInventorySnapshot = z.infer<typeof snapshotSchema>;
export interface ExternalInventoryEvidence { snapshot: unknown; receivedAt: string }
export interface ExternalInventoryAdapter {
  readonly provider: string;
  /** Full dated snapshot, never a delta. Credentials stay inside the server adapter. */
  readSnapshot(mapping: Readonly<ExternalInventoryMapping>, range: { checkIn: string; checkOut: string }, signal: AbortSignal): Promise<unknown>;
}
export type ExternalInventoryAssessment = {
  state: 'unknown'; reason: 'invalid_request' | 'missing_mapping' | 'missing_evidence' | 'invalid_evidence' | 'mapping_mismatch' | 'stale_evidence' | 'incomplete_coverage';
  checkoutAuthorized: false; deliveryAuthorized: false;
} | {
  state: 'available' | 'unavailable'; remaining: number; observedAt: string;
  checkoutAuthorized: false; deliveryAuthorized: false;
};

const MAX_AGE_MS = 5 * 60 * 1000;
const noAuthorization = { checkoutAuthorized: false, deliveryAuthorized: false } as const;

/** Server-supplied current mapping only. Freshness alone cannot authorize inventory sale. */
export function assessExternalInventory(input: {
  mapping: unknown; evidence: ExternalInventoryEvidence | null;
  listingId: number; roomId: string; checkIn: string; checkOut: string; now: number;
}): ExternalInventoryAssessment {
  const unknown = (reason: Extract<ExternalInventoryAssessment, { state: 'unknown' }>['reason']): ExternalInventoryAssessment => ({ state: 'unknown', reason, ...noAuthorization });
  let start: number, end: number;
  try { start = dateDay(input.checkIn); end = dateDay(input.checkOut); }
  catch { return unknown('invalid_request'); }
  if (!Number.isFinite(input.now) || end <= start || end - start > 365) return unknown('invalid_request');
  const mapping = mappingSchema.safeParse(input.mapping);
  if (!mapping.success) return unknown('missing_mapping');
  if (mapping.data.listingId !== input.listingId || mapping.data.roomId !== input.roomId) return unknown('mapping_mismatch');
  if (!input.evidence) return unknown('missing_evidence');
  const parsed = snapshotSchema.safeParse(input.evidence.snapshot);
  if (!parsed.success || !timestamp.safeParse(input.evidence.receivedAt).success) return unknown('invalid_evidence');
  const snapshot = parsed.data;
  if ((Object.keys(mapping.data) as (keyof ExternalInventoryMapping)[]).some(key => snapshot.mapping[key] !== mapping.data[key])) return unknown('mapping_mismatch');
  const observed = Date.parse(snapshot.observedAt), received = Date.parse(input.evidence.receivedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(received) || observed > received || received > input.now || input.now - observed > MAX_AGE_MS || input.now - received > MAX_AGE_MS) return unknown('stale_evidence');
  const stock = new Map<number, number>();
  for (const item of snapshot.days) {
    const date = dateDay(item.date);
    if (stock.has(date)) return unknown('invalid_evidence');
    stock.set(date, item.remaining);
  }
  let remaining = Number.MAX_SAFE_INTEGER;
  for (let date = start; date < end; date++) {
    const value = stock.get(date);
    if (value === undefined) return unknown('incomplete_coverage');
    remaining = Math.min(remaining, value);
  }
  return { state: remaining > 0 ? 'available' : 'unavailable', remaining, observedAt: snapshot.observedAt, ...noAuthorization };
}

/** No implementation is registered by default. Provider failures propagate for audited retry. */
export async function readExternalInventory(adapter: ExternalInventoryAdapter, input: {
  mapping: ExternalInventoryMapping; checkIn: string; checkOut: string; signal: AbortSignal;
}, clock: () => number = Date.now): Promise<ExternalInventoryEvidence> {
  const mapping = mappingSchema.parse(input.mapping);
  const start = dateDay(input.checkIn), end = dateDay(input.checkOut);
  if (adapter.provider !== mapping.provider || end <= start || end - start > 365) throw new Error('Invalid inventory adapter binding or date range');
  input.signal.throwIfAborted();
  const snapshot = await adapter.readSnapshot(Object.freeze({ ...mapping }), { checkIn: input.checkIn, checkOut: input.checkOut }, input.signal);
  input.signal.throwIfAborted();
  const now = clock();
  const evidence = { snapshot, receivedAt: new Date(now).toISOString() };
  const result = assessExternalInventory({ ...input, mapping, listingId: mapping.listingId, roomId: mapping.roomId, evidence, now });
  if (result.state === 'unknown') throw new Error(`External inventory rejected: ${result.reason}`);
  return evidence;
}
