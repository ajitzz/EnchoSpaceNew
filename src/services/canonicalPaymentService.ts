import type pg from 'pg';
import {z} from 'zod';

export class PaymentAuthorityError extends Error {
  constructor(readonly code: string, readonly cause?: unknown) {
    super(code);
    this.name = 'PaymentAuthorityError';
  }
}

const knownCodes = new Set([
  'PAYMENT_INPUT_INVALID',
  'PAYMENT_COMMAND_CONFLICT',
  'PAYMENT_QUOTE_NOT_FOUND',
  'PAYMENT_HOLD_NOT_FOUND',
  'PAYMENT_QUOTE_HOLD_MISMATCH',
  'PAYMENT_PRINCIPAL_MISMATCH',
  'PAYMENT_ITINERARY_MISMATCH',
  'PAYMENT_HOLD_NOT_ACTIVE',
  'PAYMENT_QUOTE_KIND_INVALID',
  'PAYMENT_ATTEMPT_NOT_FOUND',
  'PROVIDER_EVENT_INPUT_INVALID',
  'PAYMENT_ROLE_NOT_RESTRICTED',
  'PAYMENT_AUTHORITY_UNAVAILABLE',
]);

export const createPaymentAttemptSchema = z.object({
  commandId: z.string().uuid(),
  holderPrincipal: z.string().regex(/^(user:\d+|session:[0-9a-f-]{36})$/),
  originKind: z.enum(['RAZORPAY', 'STRIPE']),
  quoteId: z.string().uuid(),
  holdId: z.string().uuid(),
  providerOrderRef: z.string().min(1),
}).strict();

export type CreatePaymentAttemptCommand = z.infer<typeof createPaymentAttemptSchema>;

export const ingestProviderEventSchema = z.object({
  attemptId: z.string().uuid(),
  originKind: z.enum(['RAZORPAY', 'STRIPE']),
  providerEventId: z.string().min(1),
  normalizedEventType: z.enum(['PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED', 'PAYMENT_UNKNOWN']),
  reportedAmountPaise: z.number().int().nonnegative(),
  reportedCurrency: z.string().default('INR'),
  providerPaymentRef: z.string().optional().nullable(),
  providerOrderRef: z.string().optional().nullable(),
  evidencePayload: z.record(z.string(), z.unknown()),
  providerEventAt: z.union([z.string().datetime(), z.date()]).optional().nullable(),
}).strict();

export type IngestProviderEventCommand = z.infer<typeof ingestProviderEventSchema>;

export const recordPaymentUnknownSchema = z.object({
  attemptId: z.string().uuid(),
  reasonDetails: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type RecordPaymentUnknownCommand = z.infer<typeof recordPaymentUnknownSchema>;

export async function assertPaymentWorkerRole(pool: pg.Pool): Promise<void> {
  const {rows} = await pool.query(`SELECT current_user AS role_name, r.rolcanlogin, r.rolsuper,
    r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
    has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
    has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
    has_table_privilege(current_user, 'public.canonical_payment_attempts', 'SELECT,INSERT,UPDATE,DELETE') AS raw_payment_attempts,
    has_table_privilege(current_user, 'public.canonical_provider_events', 'SELECT,INSERT,UPDATE,DELETE') AS raw_provider_events,
    has_table_privilege(current_user, 'public.canonical_quarantined_events', 'SELECT,INSERT,UPDATE,DELETE') AS raw_quarantined_events,
    has_table_privilege(current_user, 'public.canonical_payment_reconciliations', 'SELECT,INSERT,UPDATE,DELETE') AS raw_reconciliations,
    has_table_privilege(current_user, 'public.canonical_reservations', 'SELECT,INSERT,UPDATE,DELETE') AS raw_reservations,
    has_table_privilege(current_user, 'public.booking_holds', 'INSERT,UPDATE,DELETE') AS raw_holds,
    has_table_privilege(current_user, 'public.stays_quotes', 'INSERT,UPDATE,DELETE') AS raw_quotes,
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('canonical_payment_attempts',
        'canonical_provider_events', 'canonical_quarantined_events', 'canonical_payment_reconciliations',
        'canonical_reservations', 'booking_holds', 'stays_quotes')
        AND pg_has_role(r.oid, c.relowner, 'MEMBER')) AS protected_owner_member,
    pg_has_role(r.oid, 'pg_read_all_data'::regrole, 'MEMBER') AS read_all_data,
    pg_has_role(r.oid, 'pg_write_all_data'::regrole, 'MEMBER') AS write_all_data,
    has_function_privilege(current_user, 'public.canonical_create_payment_attempt(uuid,text,text,uuid,uuid,text)', 'EXECUTE') AS create_attempt_privilege,
    has_function_privilege(current_user, 'public.canonical_ingest_provider_event(uuid,text,text,text,bigint,text,text,text,jsonb,timestamptz)', 'EXECUTE') AS ingest_privilege,
    has_function_privilege(current_user, 'public.canonical_record_payment_unknown(uuid,jsonb)', 'EXECUTE') AS unknown_privilege
    FROM pg_roles r WHERE r.rolname = current_user`);

  const r = rows[0];
  if (!r || r.role_name !== 'encho_payment_worker' || !r.rolcanlogin || r.rolsuper || r.rolbypassrls ||
    r.rolcreatedb || r.rolcreaterole || r.rolreplication || r.schema_create || r.database_create ||
    r.raw_payment_attempts || r.raw_provider_events || r.raw_quarantined_events || r.raw_reconciliations ||
    r.raw_reservations || r.raw_holds || r.raw_quotes || r.protected_owner_member ||
    r.read_all_data || r.write_all_data || !r.create_attempt_privilege || !r.ingest_privilege || !r.unknown_privilege) {
    throw new PaymentAuthorityError('PAYMENT_ROLE_NOT_RESTRICTED');
  }
}

export async function createPaymentAttempt(
  pool: pg.Pool,
  rawCommand: unknown
): Promise<{ attemptId: string; paymentState: string; replayed: boolean }> {
  const parsed = createPaymentAttemptSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new PaymentAuthorityError('PAYMENT_INPUT_INVALID', parsed.error);
  }
  const cmd = parsed.data;
  const client = await pool.connect();
  try {
    const {rows} = await client.query<{ attempt_id: string; payment_state: string; replayed: boolean }>(
      `SELECT * FROM canonical_create_payment_attempt(
        $1::uuid, $2::text, $3::text, $4::uuid, $5::uuid, $6::text
      )`,
      [
        cmd.commandId,
        cmd.holderPrincipal,
        cmd.originKind,
        cmd.quoteId,
        cmd.holdId,
        cmd.providerOrderRef,
      ]
    );
    if (rows.length !== 1) {
      throw new PaymentAuthorityError('PAYMENT_AUTHORITY_UNAVAILABLE');
    }
    return {
      attemptId: rows[0].attempt_id,
      paymentState: rows[0].payment_state,
      replayed: rows[0].replayed,
    };
  } catch (error) {
    if (error instanceof PaymentAuthorityError) throw error;
    const msg = error instanceof Error ? error.message : '';
    throw new PaymentAuthorityError(knownCodes.has(msg) ? msg : 'PAYMENT_AUTHORITY_UNAVAILABLE', error);
  } finally {
    client.release();
  }
}

export async function ingestProviderEvent(
  pool: pg.Pool,
  rawCommand: unknown
): Promise<{
  eventRecordId: string | null;
  attemptId: string;
  ingestStatus: 'PROCESSED' | 'DUPLICATE_IGNORED' | 'QUARANTINED';
  paymentState: string;
  reconciliationReason: string | null;
  replayed: boolean;
}> {
  const parsed = ingestProviderEventSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new PaymentAuthorityError('PROVIDER_EVENT_INPUT_INVALID', parsed.error);
  }
  const cmd = parsed.data;
  const client = await pool.connect();
  try {
    const {rows} = await client.query<{
      event_record_id: string | null;
      attempt_id: string;
      ingest_status: 'PROCESSED' | 'DUPLICATE_IGNORED' | 'QUARANTINED';
      payment_state: string;
      reconciliation_reason: string | null;
      replayed: boolean;
    }>(
      `SELECT * FROM canonical_ingest_provider_event(
        $1::uuid, $2::text, $3::text, $4::text, $5::bigint,
        $6::text, $7::text, $8::text, $9::jsonb, $10::timestamptz
      )`,
      [
        cmd.attemptId,
        cmd.originKind,
        cmd.providerEventId,
        cmd.normalizedEventType,
        cmd.reportedAmountPaise,
        cmd.reportedCurrency,
        cmd.providerPaymentRef ?? null,
        cmd.providerOrderRef ?? null,
        JSON.stringify(cmd.evidencePayload),
        cmd.providerEventAt ? (cmd.providerEventAt instanceof Date ? cmd.providerEventAt.toISOString() : cmd.providerEventAt) : null,
      ]
    );
    if (rows.length !== 1) {
      throw new PaymentAuthorityError('PAYMENT_AUTHORITY_UNAVAILABLE');
    }
    return {
      eventRecordId: rows[0].event_record_id,
      attemptId: rows[0].attempt_id,
      ingestStatus: rows[0].ingest_status,
      paymentState: rows[0].payment_state,
      reconciliationReason: rows[0].reconciliation_reason,
      replayed: rows[0].replayed,
    };
  } catch (error) {
    if (error instanceof PaymentAuthorityError) throw error;
    const msg = error instanceof Error ? error.message : '';
    throw new PaymentAuthorityError(knownCodes.has(msg) ? msg : 'PAYMENT_AUTHORITY_UNAVAILABLE', error);
  } finally {
    client.release();
  }
}

export async function recordPaymentUnknown(
  pool: pg.Pool,
  rawCommand: unknown
): Promise<{ attemptId: string; paymentState: string; reconciliationReason: string }> {
  const parsed = recordPaymentUnknownSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new PaymentAuthorityError('PAYMENT_INPUT_INVALID', parsed.error);
  }
  const cmd = parsed.data;
  const client = await pool.connect();
  try {
    const {rows} = await client.query<{ attempt_id: string; payment_state: string; reconciliation_reason: string }>(
      'SELECT * FROM canonical_record_payment_unknown($1::uuid, $2::jsonb)',
      [cmd.attemptId, JSON.stringify(cmd.reasonDetails)]
    );
    if (rows.length !== 1) {
      throw new PaymentAuthorityError('PAYMENT_AUTHORITY_UNAVAILABLE');
    }
    return {
      attemptId: rows[0].attempt_id,
      paymentState: rows[0].payment_state,
      reconciliationReason: rows[0].reconciliation_reason,
    };
  } catch (error) {
    if (error instanceof PaymentAuthorityError) throw error;
    const msg = error instanceof Error ? error.message : '';
    throw new PaymentAuthorityError(knownCodes.has(msg) ? msg : 'PAYMENT_AUTHORITY_UNAVAILABLE', error);
  } finally {
    client.release();
  }
}

export async function getPaymentAttempt(
  pool: pg.Pool,
  attemptId: string
): Promise<{
  id: string;
  commandId: string;
  commandFingerprint: string;
  holderPrincipal: string;
  quoteId: string;
  holdId: string;
  originKind: string;
  providerOrderRef: string;
  expectedCurrency: string;
  expectedAmountPaise: string | null;
  expectedAuthorityKind: string;
  expectedAuthorityRef: string;
  expectedAuthorityHash: string | null;
  paymentState: string;
  reconciliationReason: string | null;
  matchedAt: string | null;
  createdAt: string;
  updatedAt: string;
} | null> {
  const client = await pool.connect();
  try {
    const {rows} = await client.query<{
      id: string;
      command_id: string;
      command_fingerprint: string;
      holder_principal: string;
      quote_id: string;
      hold_id: string;
      origin_kind: string;
      provider_order_ref: string;
      expected_currency: string;
      expected_amount_paise: string | null;
      expected_authority_kind: string;
      expected_authority_ref: string;
      expected_authority_hash: string | null;
      payment_state: string;
      reconciliation_reason: string | null;
      matched_at: string | null;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM canonical_get_payment_attempt($1::uuid)', [attemptId]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      commandId: r.command_id,
      commandFingerprint: r.command_fingerprint,
      holderPrincipal: r.holder_principal,
      quoteId: r.quote_id,
      holdId: r.hold_id,
      originKind: r.origin_kind,
      providerOrderRef: r.provider_order_ref,
      expectedCurrency: r.expected_currency,
      expectedAmountPaise: r.expected_amount_paise,
      expectedAuthorityKind: r.expected_authority_kind,
      expectedAuthorityRef: r.expected_authority_ref,
      expectedAuthorityHash: r.expected_authority_hash,
      paymentState: r.payment_state,
      reconciliationReason: r.reconciliation_reason,
      matchedAt: r.matched_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  } finally {
    client.release();
  }
}

export async function getPaymentReconciliations(
  pool: pg.Pool,
  attemptId: string
): Promise<Array<{
  id: string;
  paymentAttemptId: string;
  providerEventId: string | null;
  reason: string;
  details: Record<string, unknown>;
  resolved: boolean;
  createdAt: string;
}>> {
  const client = await pool.connect();
  try {
    const {rows} = await client.query<{
      id: string;
      payment_attempt_id: string;
      provider_event_id: string | null;
      reason: string;
      details: Record<string, unknown>;
      resolved: boolean;
      created_at: string;
    }>('SELECT * FROM canonical_get_payment_reconciliations($1::uuid)', [attemptId]);
    return rows.map(r => ({
      id: r.id,
      paymentAttemptId: r.payment_attempt_id,
      providerEventId: r.provider_event_id,
      reason: r.reason,
      details: r.details,
      resolved: r.resolved,
      createdAt: r.created_at,
    }));
  } finally {
    client.release();
  }
}
