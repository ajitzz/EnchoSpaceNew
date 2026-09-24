import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import {diagnosticIdSchema} from '../../shared/platform/apiError.js';

/**
 * A shared contract for future durable command and notification outboxes.
 *
 * This module deliberately does not replace the established marketing job,
 * conversion-delivery, creative, or inference queues. Domain migrations may
 * adopt this column contract when they are introduced, while existing queues
 * can be adapted incrementally after their own invariants are preserved.
 */

export const durableOutboxStateSchema = z.enum([
  'PENDING',
  'RUNNING',
  'RETRY',
  'SUCCEEDED',
  'DEAD',
  'RECONCILIATION_REQUIRED',
]);

export const durableExecutionClassSchema = z.enum([
  'LOCAL_EFFECT',
  'IDEMPOTENT_EXTERNAL',
  'AMBIGUOUS_EXTERNAL',
]);

export const durableFailureClassSchema = z.enum([
  'TRANSIENT',
  'PERMANENT',
  'OUTCOME_UNKNOWN',
]);

const safeIdentifier = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const topic = z.string().trim().regex(/^[A-Z][A-Z0-9_.-]{1,99}$/);
const boundedKey = z.string().trim().min(1).max(240);
const traceId = diagnosticIdSchema;
const errorCode = z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/);
const principal = z.string().trim().min(1).max(160);

export const durableOutboxEnqueueSchema = z.object({
  topic,
  partitionKey: boundedKey,
  dedupeKey: boundedKey,
  payload: z.unknown(),
  executionClass: durableExecutionClassSchema,
  correlationId: traceId,
  causationId: traceId.optional(),
  principalId: principal.optional(),
  organizationId: principal.optional(),
  priority: z.number().int().min(0).max(100).default(50),
  maxAttempts: z.number().int().min(1).max(100).default(8),
  availableAt: z.string().datetime({ offset: true }).optional(),
}).strict();

export type DurableOutboxEnqueue = z.input<typeof durableOutboxEnqueueSchema>;
export type DurableOutboxState = z.infer<typeof durableOutboxStateSchema>;
export type DurableExecutionClass = z.infer<typeof durableExecutionClassSchema>;
export type DurableFailureClass = z.infer<typeof durableFailureClassSchema>;

export interface DurableOutboxItem<TPayload> {
  id: string;
  topic: string;
  partitionKey: string;
  dedupeKey: string;
  requestFingerprint: string;
  payload: TPayload;
  executionClass: DurableExecutionClass;
  state: DurableOutboxState;
  priority: number;
  fence: string;
  attempts: number;
  maxAttempts: number;
  leaseUntil: string | null;
  availableAt: string;
  claimedBy: string | null;
  correlationId: string;
  causationId: string | null;
  principalId: string | null;
  organizationId: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DurableOutboxTables {
  outbox: string;
  events: string;
}

export interface DurableOutboxOptions<TPayload> {
  tables: DurableOutboxTables;
  payloadSchema: z.ZodType<TPayload>;
  baseBackoffSeconds?: number;
  maximumBackoffSeconds?: number;
  jitterRatio?: number;
  maximumPayloadBytes?: number;
}

export interface ClaimBatchInput {
  workerId: string;
  limit?: number;
  leaseSeconds?: number;
  topics?: string[];
  partitionKey?: string;
}

export interface ClaimedOutboxItem<TPayload> extends DurableOutboxItem<TPayload> {
  state: 'RUNNING';
  claimedBy: string;
  leaseUntil: string;
}

export interface ClaimedIdentity {
  id: string;
  fence: string;
}

export interface FailClaimInput extends ClaimedIdentity {
  classification: DurableFailureClass;
  errorCode: string;
}

export interface ReplayInput extends ClaimedIdentity {
  actorId: string;
  reason: string;
}

export interface ResolveReconciliationInput extends ClaimedIdentity {
  actorId: string;
  reason: string;
  outcome: 'SUCCEEDED' | 'DEAD';
}

export class DurableOutboxError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DurableOutboxError';
  }
}

function canonicalJson(value: unknown, ancestors = new Set<object>(), depth = 0): string {
  const invalid = () => { throw new DurableOutboxError('OUTBOX_PAYLOAD_NOT_JSON', 'Durable commands require bounded JSON values.'); };
  if (depth > 64) return invalid();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : invalid();
  if (!value || typeof value !== 'object' || ancestors.has(value)) return invalid();
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return `[${Array.from(value, item => canonicalJson(item, ancestors, depth + 1)).join(',')}]`;
    const record = value as Record<string, unknown>;
    // Optional undefined object fields have no persisted JSON meaning. Omit
    // them consistently in both fingerprint and payload; never hash a false null.
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors, depth + 1)}`).join(',')}}`;
  } finally { ancestors.delete(value); }
}

export function durableRequestFingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function qualifiedTableName(value: string): string {
  const parts = value.split('.');
  if (parts.length < 1 || parts.length > 2) throw new DurableOutboxError('OUTBOX_TABLE_INVALID', 'Outbox table name is invalid.');
  return parts.map(part => `"${safeIdentifier.parse(part)}"`).join('.');
}

function timestamp(value: unknown, field: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new DurableOutboxError('OUTBOX_ROW_INVALID', `Outbox ${field} is invalid.`);
  return date.toISOString();
}

function nullableTimestamp(value: unknown, field: string): string | null {
  return value == null ? null : timestamp(value, field);
}

const storedRowSchema = z.object({
  id: z.string().uuid(),
  topic,
  partition_key: boundedKey,
  dedupe_key: boundedKey,
  request_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.unknown(),
  execution_class: durableExecutionClassSchema,
  state: durableOutboxStateSchema,
  priority: z.coerce.number().int().min(0).max(100),
  fence: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform(String),
  attempts: z.coerce.number().int().nonnegative(),
  max_attempts: z.coerce.number().int().positive(),
  lease_until: z.unknown().nullable(),
  available_at: z.unknown(),
  claimed_by: z.string().nullable(),
  correlation_id: traceId,
  causation_id: traceId.nullable(),
  principal_id: z.string().nullable(),
  organization_id: z.string().nullable(),
  last_error_code: errorCode.nullable(),
  created_at: z.unknown(),
  updated_at: z.unknown(),
  completed_at: z.unknown().nullable(),
}).passthrough();

function parseStoredItem<TPayload>(row: unknown, payloadSchema: z.ZodType<TPayload>): DurableOutboxItem<TPayload> {
  const value = storedRowSchema.parse(row);
  return {
    id: value.id,
    topic: value.topic,
    partitionKey: value.partition_key,
    dedupeKey: value.dedupe_key,
    requestFingerprint: value.request_fingerprint,
    payload: payloadSchema.parse(value.payload),
    executionClass: value.execution_class,
    state: value.state,
    priority: value.priority,
    fence: value.fence,
    attempts: value.attempts,
    maxAttempts: value.max_attempts,
    leaseUntil: nullableTimestamp(value.lease_until, 'lease_until'),
    availableAt: timestamp(value.available_at, 'available_at'),
    claimedBy: value.claimed_by,
    correlationId: value.correlation_id,
    causationId: value.causation_id,
    principalId: value.principal_id,
    organizationId: value.organization_id,
    lastErrorCode: value.last_error_code,
    createdAt: timestamp(value.created_at, 'created_at'),
    updatedAt: timestamp(value.updated_at, 'updated_at'),
    completedAt: nullableTimestamp(value.completed_at, 'completed_at'),
  };
}

function assertPayloadSize(value: unknown, maximumBytes: number): void {
  const bytes = Buffer.byteLength(canonicalJson(value), 'utf8');
  if (bytes > maximumBytes) throw new DurableOutboxError('OUTBOX_PAYLOAD_TOO_LARGE', `Outbox payload exceeds ${maximumBytes} bytes.`);
}

function validateFailureCode(value: string): string {
  const parsed = errorCode.safeParse(value);
  return parsed.success ? parsed.data : 'OUTBOX_OPERATION_FAILED';
}

function deterministicDelaySeconds(
  item: Pick<DurableOutboxItem<unknown>, 'id' | 'fence' | 'attempts'>,
  base: number,
  maximum: number,
  jitterRatio: number,
): number {
  const exponential = Math.min(maximum, base * (2 ** Math.min(Math.max(item.attempts - 1, 0), 16)));
  const jitterWindow = Math.floor(exponential * jitterRatio);
  if (jitterWindow === 0) return exponential;
  const digest = createHash('sha256').update(`${item.id}:${item.fence}:${item.attempts}`).digest();
  return Math.min(maximum, exponential + (digest.readUInt32BE(0) % (jitterWindow + 1)));
}

/**
 * PostgreSQL-backed outbox semantics for tables that implement the documented
 * standard column contract. Enqueue requires the caller's PoolClient so domain
 * state and the delivery intent can commit or roll back together.
 */
export class DurableOutbox<TPayload> {
  private readonly outboxTable: string;
  private readonly eventsTable: string;
  private readonly payloadSchema: z.ZodType<TPayload>;
  private readonly baseBackoffSeconds: number;
  private readonly maximumBackoffSeconds: number;
  private readonly jitterRatio: number;
  private readonly maximumPayloadBytes: number;

  constructor(private readonly pool: pg.Pool, options: DurableOutboxOptions<TPayload>) {
    this.outboxTable = qualifiedTableName(options.tables.outbox);
    this.eventsTable = qualifiedTableName(options.tables.events);
    this.payloadSchema = options.payloadSchema;
    this.baseBackoffSeconds = z.number().int().min(1).max(3600).parse(options.baseBackoffSeconds ?? 5);
    this.maximumBackoffSeconds = z.number().int().min(this.baseBackoffSeconds).max(86400).parse(options.maximumBackoffSeconds ?? 3600);
    this.jitterRatio = z.number().min(0).max(1).parse(options.jitterRatio ?? 0.25);
    this.maximumPayloadBytes = z.number().int().min(1024).max(1_048_576).parse(options.maximumPayloadBytes ?? 262_144);
  }

  async enqueueInTransaction(client: pg.PoolClient, input: DurableOutboxEnqueue): Promise<DurableOutboxItem<TPayload>> {
    const parsed = durableOutboxEnqueueSchema.parse(input);
    const payload = this.payloadSchema.parse(parsed.payload);
    assertPayloadSize(payload, this.maximumPayloadBytes);
    const requestFingerprint = durableRequestFingerprint({
      topic: parsed.topic,
      partitionKey: parsed.partitionKey,
      payload,
      executionClass: parsed.executionClass,
      principalId: parsed.principalId ?? null,
      organizationId: parsed.organizationId ?? null,
    });
    const id = randomUUID();
    const inserted = await client.query(
      `INSERT INTO ${this.outboxTable} (
        id,topic,partition_key,dedupe_key,request_fingerprint,payload,execution_class,
        priority,max_attempts,available_at,correlation_id,causation_id,principal_id,organization_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz,clock_timestamp()),$11,$12,$13,$14)
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING *`,
      [
        id, parsed.topic, parsed.partitionKey, parsed.dedupeKey, requestFingerprint, canonicalJson(payload),
        parsed.executionClass, parsed.priority, parsed.maxAttempts, parsed.availableAt ?? null,
        parsed.correlationId, parsed.causationId ?? null, parsed.principalId ?? null, parsed.organizationId ?? null,
      ],
    );
    const row = inserted.rows[0] ?? (await client.query(`SELECT * FROM ${this.outboxTable} WHERE dedupe_key=$1 FOR UPDATE`, [parsed.dedupeKey])).rows[0];
    if (!row) throw new DurableOutboxError('OUTBOX_ENQUEUE_FAILED', 'Outbox intent could not be stored.');
    const stored = parseStoredItem(row, this.payloadSchema);
    if (stored.requestFingerprint !== requestFingerprint) {
      throw new DurableOutboxError('OUTBOX_IDEMPOTENCY_CONFLICT', 'This outbox dedupe key identifies a different request.');
    }
    if (inserted.rows[0]) await this.recordEvent(client, stored.id, 'ENQUEUED', null, null, { requestFingerprint });
    return stored;
  }

  async claimBatch(input: ClaimBatchInput): Promise<Array<ClaimedOutboxItem<TPayload>>> {
    const workerId = principal.parse(input.workerId);
    const limit = z.number().int().min(1).max(100).parse(input.limit ?? 20);
    const leaseSeconds = z.number().int().min(10).max(3600).parse(input.leaseSeconds ?? 120);
    const topics = input.topics?.map(value => topic.parse(value));
    const partitionKey = input.partitionKey == null ? null : boundedKey.parse(input.partitionKey);
    return this.inTransaction(async client => {
      const expired = await client.query(
        `WITH expired_candidates AS (
           SELECT id FROM ${this.outboxTable}
           WHERE state='RUNNING' AND lease_until<=clock_timestamp()
           ORDER BY lease_until,id
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE ${this.outboxTable} o
         SET state=CASE
           WHEN execution_class='AMBIGUOUS_EXTERNAL' THEN 'RECONCILIATION_REQUIRED'
           WHEN attempts>=max_attempts THEN 'DEAD'
           ELSE 'RETRY'
         END,
         fence=fence+1, lease_until=NULL, claimed_by=NULL,
         available_at=CASE WHEN execution_class='AMBIGUOUS_EXTERNAL' OR attempts>=max_attempts THEN available_at ELSE clock_timestamp() END,
         last_error_code='OUTBOX_LEASE_EXPIRED', updated_at=clock_timestamp()
         FROM expired_candidates e WHERE o.id=e.id
         RETURNING o.*`,
        [Math.max(limit * 2, 20)],
      );
      for (const row of expired.rows) {
        await this.recordEvent(client, row.id, row.state === 'RECONCILIATION_REQUIRED' ? 'OUTCOME_UNKNOWN' : row.state === 'DEAD' ? 'ATTEMPTS_EXHAUSTED' : 'LEASE_EXPIRED', null, null, { fence: String(row.fence) });
      }
      const claimed = await client.query(
        `WITH picked AS (
           SELECT id FROM ${this.outboxTable}
           WHERE state IN ('PENDING','RETRY')
             AND available_at<=clock_timestamp()
             AND ($1::text[] IS NULL OR topic=ANY($1::text[]))
             AND ($2::text IS NULL OR partition_key=$2)
           ORDER BY priority DESC,available_at,id
           FOR UPDATE SKIP LOCKED LIMIT $3
         )
         UPDATE ${this.outboxTable} o
         SET state='RUNNING', fence=o.fence+1, attempts=o.attempts+1,
             lease_until=clock_timestamp()+make_interval(secs=>$4), claimed_by=$5,
             last_error_code=NULL, updated_at=clock_timestamp()
         FROM picked WHERE o.id=picked.id RETURNING o.*`,
        [topics?.length ? topics : null, partitionKey, limit, leaseSeconds, workerId],
      );
      const rows = claimed.rows.map(row => parseStoredItem(row, this.payloadSchema));
      for (const row of rows) await this.recordEvent(client, row.id, 'CLAIMED', workerId, null, { fence: row.fence, attempt: row.attempts });
      return rows.map(row => {
        if (row.state !== 'RUNNING' || row.claimedBy !== workerId || row.leaseUntil == null) {
          throw new DurableOutboxError('OUTBOX_ROW_INVALID', 'Claimed outbox row is internally inconsistent.');
        }
        return row as ClaimedOutboxItem<TPayload>;
      });
    });
  }

  async heartbeat(claim: ClaimedIdentity, workerId: string, leaseSeconds = 120): Promise<void> {
    const worker = principal.parse(workerId);
    const seconds = z.number().int().min(10).max(3600).parse(leaseSeconds);
    await this.inTransaction(async client => {
      const result = await client.query(
        `UPDATE ${this.outboxTable} SET lease_until=clock_timestamp()+make_interval(secs=>$4),updated_at=clock_timestamp()
         WHERE id=$1 AND fence=$2::bigint AND state='RUNNING' AND claimed_by=$3 AND lease_until>clock_timestamp() RETURNING id`,
        [z.string().uuid().parse(claim.id), z.string().regex(/^\d+$/).parse(claim.fence), worker, seconds],
      );
      if (!result.rowCount) throw new DurableOutboxError('OUTBOX_CLAIM_LOST', 'Worker lease no longer belongs to this attempt.');
    });
  }

  async succeed(claim: ClaimedIdentity, workerId: string, evidence: Record<string, unknown> = {}): Promise<void> {
    const worker = principal.parse(workerId);
    await this.inTransaction(async client => {
      const row = await this.lockClaim(client, claim, worker);
      await client.query(
        `UPDATE ${this.outboxTable} SET state='SUCCEEDED',lease_until=NULL,claimed_by=NULL,last_error_code=NULL,
         completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1 AND fence=$2::bigint`,
        [row.id, row.fence],
      );
      await this.recordEvent(client, row.id, 'SUCCEEDED', worker, null, evidence);
    });
  }

  async fail(claim: FailClaimInput, workerId: string): Promise<DurableOutboxState> {
    const worker = principal.parse(workerId);
    const classification = durableFailureClassSchema.parse(claim.classification);
    const code = validateFailureCode(claim.errorCode);
    return this.inTransaction(async client => {
      const item = await this.lockClaim(client, claim, worker);
      const state: DurableOutboxState = classification === 'OUTCOME_UNKNOWN' || item.executionClass === 'AMBIGUOUS_EXTERNAL'
        ? 'RECONCILIATION_REQUIRED'
        : classification === 'PERMANENT' || item.attempts >= item.maxAttempts ? 'DEAD' : 'RETRY';
      const delay = state === 'RETRY'
        ? deterministicDelaySeconds(item, this.baseBackoffSeconds, this.maximumBackoffSeconds, this.jitterRatio)
        : 0;
      await client.query(
        `UPDATE ${this.outboxTable} SET state=$3,lease_until=NULL,claimed_by=NULL,last_error_code=$4,
         available_at=CASE WHEN $3='RETRY' THEN clock_timestamp()+make_interval(secs=>$5) ELSE available_at END,
         updated_at=clock_timestamp() WHERE id=$1 AND fence=$2::bigint`,
        [item.id, item.fence, state, code, delay],
      );
      await this.recordEvent(client, item.id, state === 'RETRY' ? 'RETRY_SCHEDULED' : state === 'DEAD' ? 'DEAD_LETTERED' : 'OUTCOME_UNKNOWN', worker, null, { classification, errorCode: code, delaySeconds: delay });
      return state;
    });
  }

  async replayDeadInTransaction(client: pg.PoolClient, input: ReplayInput): Promise<DurableOutboxItem<TPayload>> {
    const id = z.string().uuid().parse(input.id);
    const fence = z.string().regex(/^\d+$/).parse(input.fence);
    const actorId = principal.parse(input.actorId);
    const reason = z.string().trim().min(10).max(2000).parse(input.reason);
    const result = await client.query(
      `UPDATE ${this.outboxTable} SET state='RETRY',attempts=0,fence=fence+1,lease_until=NULL,claimed_by=NULL,
       available_at=clock_timestamp(),last_error_code=NULL,completed_at=NULL,updated_at=clock_timestamp()
       WHERE id=$1 AND fence=$2::bigint AND state='DEAD' RETURNING *`,
      [id, fence],
    );
    if (!result.rows[0]) throw new DurableOutboxError('OUTBOX_REPLAY_CONFLICT', 'Only the exact dead-letter version can be replayed.');
    const row = parseStoredItem(result.rows[0], this.payloadSchema);
    await this.recordEvent(client, row.id, 'MANUAL_REPLAY', actorId, reason, { previousFence: fence, fence: row.fence });
    return row;
  }

  async resolveReconciliationInTransaction(client: pg.PoolClient, input: ResolveReconciliationInput): Promise<DurableOutboxItem<TPayload>> {
    const id = z.string().uuid().parse(input.id);
    const fence = z.string().regex(/^\d+$/).parse(input.fence);
    const actorId = principal.parse(input.actorId);
    const reason = z.string().trim().min(10).max(2000).parse(input.reason);
    const outcome = z.enum(['SUCCEEDED', 'DEAD']).parse(input.outcome);
    const result = await client.query(
      `UPDATE ${this.outboxTable} SET state=$3,fence=fence+1,lease_until=NULL,claimed_by=NULL,
       completed_at=CASE WHEN $3='SUCCEEDED' THEN clock_timestamp() ELSE completed_at END,updated_at=clock_timestamp()
       WHERE id=$1 AND fence=$2::bigint AND state='RECONCILIATION_REQUIRED' RETURNING *`,
      [id, fence, outcome],
    );
    if (!result.rows[0]) throw new DurableOutboxError('OUTBOX_RECONCILIATION_CONFLICT', 'Only the exact unresolved outcome can be reconciled.');
    const row = parseStoredItem(result.rows[0], this.payloadSchema);
    await this.recordEvent(client, row.id, 'RECONCILED', actorId, reason, { previousFence: fence, fence: row.fence, outcome });
    return row;
  }

  private async lockClaim(client: pg.PoolClient, claim: ClaimedIdentity, workerId: string): Promise<DurableOutboxItem<TPayload>> {
    const id = z.string().uuid().parse(claim.id);
    const fence = z.string().regex(/^\d+$/).parse(claim.fence);
    const row = (await client.query(
      `SELECT * FROM ${this.outboxTable}
       WHERE id=$1 AND fence=$2::bigint AND state='RUNNING' AND claimed_by=$3 AND lease_until>clock_timestamp() FOR UPDATE`,
      [id, fence, workerId],
    )).rows[0];
    if (!row) throw new DurableOutboxError('OUTBOX_CLAIM_LOST', 'Worker lease no longer belongs to this attempt.');
    return parseStoredItem(row, this.payloadSchema);
  }

  private async recordEvent(
    client: pg.PoolClient,
    outboxId: string,
    eventType: string,
    actorId: string | null,
    reason: string | null,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO ${this.eventsTable}(outbox_id,event_type,actor_id,reason,evidence) VALUES($1,$2,$3,$4,$5)`,
      [outboxId, eventType, actorId, reason, JSON.stringify(evidence)],
    );
  }

  private async inTransaction<TResult>(fn: (client: pg.PoolClient) => Promise<TResult>): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
