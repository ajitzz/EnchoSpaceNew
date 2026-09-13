import type pg from 'pg';
import { fingerprint, MarketingError, type Actor } from '../domain.js';
import { inTransaction } from '../database.js';
import type { ConversionUpload, ConversionUploadResult } from '../measurement.js';
import { safeCode, safeReceipt, type DeliveryOutcome, type PreparedConversion } from './contracts.js';

const publicOutcome = (row: any): DeliveryOutcome => ({ status: ['ACCEPTED', 'REJECTED', 'PROCESSING'].includes(row.status) ? row.status : 'UNKNOWN', ...(row.provider_receipt ? { receipt: row.provider_receipt } : {}), ...(row.error_code ? { code: row.error_code } : {}) });
export const measurementResult = (id: string, outcome: DeliveryOutcome): ConversionUploadResult => ({ id, status: outcome.status === 'PROCESSING' ? 'UNKNOWN' : outcome.status, ...(outcome.receipt ? { receipt: outcome.receipt } : {}), ...(outcome.code ? { code: outcome.code } : {}) });
export class ConversionDeliveryStore {
  constructor(private readonly pool: pg.Pool, private readonly actor: Actor) {
    if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0 || !['admin', 'system'].includes(actor.role)) throw new MarketingError('SERVICE_ACTOR_REQUIRED', 'An audited conversion service actor is required', 503);
  }
  async claim(item: ConversionUpload, prepared: PreparedConversion): Promise<{ claimed: true } | { claimed: false; outcome: DeliveryOutcome }> {
    return inTransaction(this.pool, this.actor, async c => {
      const row = (await c.query('SELECT * FROM marketing_conversion_outbox WHERE id=$1 FOR UPDATE', [item.id])).rows[0];
      const { id: _, idempotencyKey, ...payload } = item;
      if (!row || Number(row.host_id) !== item.hostId || row.provider !== item.provider || idempotencyKey !== `harvo:${item.provider}:${item.id}` || fingerprint(row.payload) !== fingerprint(payload)) throw new MarketingError('CONVERSION_OUTBOX_BINDING_MISMATCH', 'A durable canonical conversion intent is required');
      const hash = fingerprint({ payload, transport: prepared.transport, destination: prepared.destination, body: prepared.body });
      const old = (await c.query('SELECT * FROM marketing_conversion_deliveries WHERE outbox_id=$1', [item.id])).rows[0];
      if (old) {
        if (old.request_fingerprint !== hash) throw new MarketingError('CONVERSION_IDEMPOTENCY_CONFLICT', 'Conversion intent or destination changed');
        return { claimed: false as const, outcome: publicOutcome(old) };
      }
      if (row.status !== 'DISPATCHING') throw new MarketingError('CONVERSION_NOT_DISPATCHING', 'Only a committed dispatch intent may reach a provider');
      if (item.kind !== 'PURCHASE') {
        const prior = (await c.query('SELECT o.payload,d.status,d.destination FROM marketing_conversion_outbox o JOIN marketing_conversion_deliveries d ON d.outbox_id=o.id WHERE o.id=$1 AND o.status=\'ACCEPTED\'', [row.depends_on])).rows[0];
        if (!prior || prior.status !== 'ACCEPTED' || fingerprint(prior.destination) !== fingerprint(prepared.destination)) throw new MarketingError('CONVERSION_CORRECTION_SOURCE_REQUIRED', 'A provider-accepted conversion at the unchanged destination is required');
        if (Math.floor(Date.parse(item.occurredAt) / 1000) <= Math.floor(Date.parse(prior.payload.kind === 'PURCHASE' ? prior.payload.capturedAt : prior.payload.occurredAt) / 1000)) throw new MarketingError('CONVERSION_CORRECTION_TIME_CONFLICT', 'Corrections need a strictly later provider timestamp; no timestamp is invented');
      }
      await c.query("INSERT INTO marketing_conversion_deliveries(outbox_id,host_id,provider,transport,request_fingerprint,destination,status) VALUES($1,$2,$3,$4,$5,$6,'CLAIMED')", [item.id, item.hostId, item.provider, prepared.transport, hash, JSON.stringify(prepared.destination)]);
      await this.event(c, item.id, item.hostId, 'PROVIDER_DISPATCH_CLAIMED', { transport: prepared.transport, fingerprint: hash });
      return { claimed: true as const };
    });
  }
  private event(c: pg.PoolClient, id: string, hostId: number, type: string, evidence: unknown) {
    return c.query('INSERT INTO marketing_conversion_delivery_events(outbox_id,host_id,actor_id,event_type,evidence) VALUES($1,$2,$3,$4,$5)', [id, hostId, this.actor.id, type, JSON.stringify(evidence)]);
  }
  async record(id: string, outcome: DeliveryOutcome, diagnostic = false) {
    return inTransaction(this.pool, this.actor, async c => {
      // Outbox lock precedes delivery lock, matching claims and measurement completion.
      const outbox = (await c.query('SELECT * FROM marketing_conversion_outbox WHERE id=$1 FOR UPDATE', [id])).rows[0];
      const row = (await c.query('SELECT * FROM marketing_conversion_deliveries WHERE outbox_id=$1 FOR UPDATE', [id])).rows[0];
      if (!row || !outbox || (diagnostic ? row.status !== 'PROCESSING' : row.status !== 'CLAIMED')) return false;
      const receipt = safeReceipt(outcome.receipt) ? outcome.receipt : row.provider_receipt;
      if (row.provider_receipt && outcome.receipt && outcome.receipt !== row.provider_receipt) throw new MarketingError('CONVERSION_RECEIPT_CONFLICT', 'Provider receipt identity changed');
      const status = ['ACCEPTED', 'PROCESSING'].includes(outcome.status) && !receipt ? 'UNKNOWN' : outcome.status;
      const code = status === 'ACCEPTED' ? null : safeCode(outcome.code, status === 'PROCESSING' ? 'GOOGLE_PROCESSING' : 'PROVIDER_UNKNOWN_OUTCOME');
      // A temporarily unavailable read leaves a known processing request available for later reads.
      const storedStatus = diagnostic && status === 'UNKNOWN' && ['GOOGLE_DIAGNOSTIC_UNAVAILABLE'].includes(code!) ? 'PROCESSING' : status;
      await c.query('UPDATE marketing_conversion_deliveries SET status=$2,provider_receipt=$3,error_code=$4,updated_at=now(),next_observation_at=now()+interval \'60 seconds\' WHERE outbox_id=$1', [id, storedStatus, receipt, code]);
      await this.event(c, id, row.host_id, diagnostic ? 'PROVIDER_DIAGNOSTIC_OBSERVED' : 'PROVIDER_DISPATCH_RESULT', { status, receipt: receipt ?? null, code, ...(outcome.evidence ?? {}) });
      return true;
    });
  }
  async observationCandidates(limit: number) {
    return inTransaction(this.pool, this.actor, async c => {
      const rows = (await c.query("SELECT * FROM marketing_conversion_deliveries WHERE transport='GOOGLE_DATA_MANAGER_V1' AND status='PROCESSING' AND next_observation_at<=now() ORDER BY next_observation_at,outbox_id LIMIT $1 FOR UPDATE SKIP LOCKED", [limit])).rows;
      for (const row of rows) await c.query("UPDATE marketing_conversion_deliveries SET next_observation_at=now()+interval '60 seconds' WHERE outbox_id=$1", [row.outbox_id]);
      return rows;
    });
  }
  /** Recover a lost local completion using already persisted provider evidence; never replay a write. */
  async synchronize(limit: number) {
    return inTransaction(this.pool, this.actor, async c => {
      const rows = (await c.query("SELECT o.id,d.status,d.provider_receipt,d.error_code FROM marketing_conversion_outbox o JOIN marketing_conversion_deliveries d ON d.outbox_id=o.id WHERE (o.status='UNKNOWN' OR (o.status='DISPATCHING' AND o.dispatched_at < now()-interval '2 minutes')) AND d.status IN ('ACCEPTED','REJECTED') ORDER BY o.created_at LIMIT $1 FOR UPDATE OF o SKIP LOCKED", [limit])).rows;
      for (const row of rows) await c.query("UPDATE marketing_conversion_outbox SET status=$2,provider_receipt=$3,error_code=$4,resolved_at=now() WHERE id=$1 AND (status='UNKNOWN' OR (status='DISPATCHING' AND dispatched_at < now()-interval '2 minutes'))", [row.id, row.status, row.provider_receipt, row.error_code]);
      return rows.length;
    });
  }
}
