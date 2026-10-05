import type pg from 'pg';
import {z} from 'zod';

export class CompositionAuthorityError extends Error {
  constructor(readonly code: string, readonly cause?: unknown) {
    super(code);
    this.name = 'CompositionAuthorityError';
  }
}

const knownCodes = new Set([
  'COMPOSITION_INPUT_INVALID',
  'COMPOSITION_COMMAND_CONFLICT',
  'PAYMENT_ATTEMPT_NOT_FOUND',
  'PAYMENT_ALREADY_COMPOSED',
  'PAYMENT_STATE_NOT_CAPTURED',
  'PAYMENT_RECONCILIATION_UNRESOLVED',
  'PAYMENT_MATCHED_TIMESTAMP_MISSING',
  'PAYMENT_MONETARY_AUTHORITY_MISSING',
  'PAYMENT_CAPTURE_EVIDENCE_INVALID',
  'PAYMENT_QUOTE_NOT_FOUND',
  'PAYMENT_HOLD_NOT_FOUND',
  'PAYMENT_QUOTE_HOLD_MISMATCH',
  'PAYMENT_PRINCIPAL_MISMATCH',
  'COMPOSITION_ROLE_NOT_RESTRICTED',
  'COMPOSITION_AUTHORITY_UNAVAILABLE',
]);

export const composePaymentReservationSchema = z.object({
  commandId: z.string().uuid(),
  paymentAttemptId: z.string().uuid(),
}).strict();

export type ComposePaymentReservationCommand = z.infer<typeof composePaymentReservationSchema>;

export type CompositionResult = {
  reservationId: string | null;
  compositionState: 'COMMITTED' | 'RECONCILIATION_REQUIRED';
  reconciliationReason: string | null;
  replayed: boolean;
};

export type PaymentReservationRecord = {
  id: string;
  commandId: string;
  paymentAttemptId: string;
  quoteId: string;
  holdId: string;
  reservationId: string;
  commandFingerprint: string;
  status: string;
  createdAt: string;
  finalizedAt: string;
};

export async function assertCompositionWorkerRole(pool: pg.Pool): Promise<void> {
  const {rows} = await pool.query(`SELECT current_user AS role_name, r.rolcanlogin, r.rolsuper,
    r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
    has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
    has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
    has_table_privilege(current_user, 'public.canonical_reservations', 'SELECT,INSERT,UPDATE,DELETE') AS raw_reservations,
    has_table_privilege(current_user, 'public.canonical_reservation_nights', 'SELECT,INSERT,UPDATE,DELETE') AS raw_nights,
    has_table_privilege(current_user, 'public.canonical_reservation_commands', 'SELECT,INSERT,UPDATE,DELETE') AS raw_commands,
    has_table_privilege(current_user, 'public.booking_holds', 'INSERT,UPDATE,DELETE') AS raw_holds,
    has_table_privilege(current_user, 'public.inventory_days', 'INSERT,UPDATE,DELETE') AS raw_inventory,
    has_table_privilege(current_user, 'public.stays_quotes', 'INSERT,UPDATE,DELETE') AS raw_quotes,
    has_table_privilege(current_user, 'public.canonical_payment_attempts', 'INSERT,UPDATE,DELETE') AS raw_payment_attempts,
    has_table_privilege(current_user, 'public.canonical_provider_events', 'INSERT,UPDATE,DELETE') AS raw_provider_events,
    has_table_privilege(current_user, 'public.canonical_quarantined_events', 'INSERT,UPDATE,DELETE') AS raw_quarantined_events,
    has_table_privilege(current_user, 'public.canonical_payment_reconciliations', 'INSERT,UPDATE,DELETE') AS raw_reconciliations,
    has_table_privilege(current_user, 'public.canonical_payment_reservations', 'SELECT,INSERT,UPDATE,DELETE') AS raw_payment_reservations,
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('canonical_reservations',
        'canonical_reservation_nights', 'canonical_reservation_commands', 'booking_holds',
        'booking_hold_nights', 'inventory_days', 'stays_quotes', 'canonical_payment_attempts',
        'canonical_provider_events', 'canonical_quarantined_events', 'canonical_payment_reconciliations',
        'canonical_payment_reservations')
        AND pg_has_role(r.oid, c.relowner, 'MEMBER')) AS protected_owner_member,
    pg_has_role(r.oid, 'pg_read_all_data'::regrole, 'MEMBER') AS read_all_data,
    pg_has_role(r.oid, 'pg_write_all_data'::regrole, 'MEMBER') AS write_all_data,
    has_function_privilege(current_user, 'public.canonical_compose_payment_reservation(uuid,uuid)', 'EXECUTE') AS compose_privilege
    FROM pg_roles r WHERE r.rolname = current_user`);

  const r = rows[0];
  if (!r || r.role_name !== 'encho_composition_worker' || !r.rolcanlogin || r.rolsuper || r.rolbypassrls ||
    r.rolcreatedb || r.rolcreaterole || r.rolreplication || r.schema_create || r.database_create ||
    r.raw_reservations || r.raw_nights || r.raw_commands || r.raw_holds || r.raw_inventory ||
    r.raw_quotes || r.raw_payment_attempts || r.raw_provider_events || r.raw_quarantined_events ||
    r.raw_reconciliations || r.raw_payment_reservations || r.protected_owner_member ||
    r.read_all_data || r.write_all_data || !r.compose_privilege) {
    throw new CompositionAuthorityError('COMPOSITION_ROLE_NOT_RESTRICTED');
  }
}

export async function composePaymentReservation(
  pool: pg.Pool,
  rawCommand: unknown
): Promise<CompositionResult> {
  const parsed = composePaymentReservationSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new CompositionAuthorityError('COMPOSITION_INPUT_INVALID', parsed.error);
  }
  const cmd = parsed.data;
  await assertCompositionWorkerRole(pool);
  const client = await pool.connect();
  try {
    const {rows} = await client.query<{
      reservation_id: string | null;
      composition_state: string;
      reconciliation_reason: string | null;
      replayed: boolean;
    }>(
      `SELECT * FROM canonical_compose_payment_reservation($1::uuid, $2::uuid)`,
      [cmd.commandId, cmd.paymentAttemptId]
    );
    if (rows.length !== 1) {
      throw new CompositionAuthorityError('COMPOSITION_AUTHORITY_UNAVAILABLE');
    }
    const r = rows[0];
    return {
      reservationId: r.reservation_id,
      compositionState: r.composition_state as 'COMMITTED' | 'RECONCILIATION_REQUIRED',
      reconciliationReason: r.reconciliation_reason,
      replayed: r.replayed,
    };
  } catch (error) {
    if (error instanceof CompositionAuthorityError) throw error;
    const message = error instanceof Error ? error.message : '';
    throw new CompositionAuthorityError(
      knownCodes.has(message) ? message : 'COMPOSITION_AUTHORITY_UNAVAILABLE',
      error
    );
  } finally {
    client.release();
  }
}

export async function getPaymentReservation(
  pool: pg.Pool,
  paymentAttemptId: string
): Promise<PaymentReservationRecord | null> {
  const client = await pool.connect();
  try {
    const {rows} = await client.query<{
      id: string;
      command_id: string;
      payment_attempt_id: string;
      quote_id: string;
      hold_id: string;
      reservation_id: string;
      command_fingerprint: string;
      status: string;
      created_at: string;
      finalized_at: string;
    }>(
      `SELECT * FROM canonical_get_payment_reservation($1::uuid)`,
      [paymentAttemptId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      commandId: r.command_id,
      paymentAttemptId: r.payment_attempt_id,
      quoteId: r.quote_id,
      holdId: r.hold_id,
      reservationId: r.reservation_id,
      commandFingerprint: r.command_fingerprint,
      status: r.status,
      createdAt: r.created_at,
      finalizedAt: r.finalized_at,
    };
  } finally {
    client.release();
  }
}
