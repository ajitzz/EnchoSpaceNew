import type pg from 'pg';
import {z} from 'zod';

export class LifecycleAuthorityError extends Error {
  constructor(readonly code: string, readonly cause?: unknown) {
    super(code);
    this.name = 'LifecycleAuthorityError';
  }
}

const knownCodes = new Set([
  'LIFECYCLE_INPUT_INVALID',
  'LIFECYCLE_AUTHORIZATION_REQUIRED',
  'LIFECYCLE_AUTHORIZATION_NOT_FOUND',
  'LIFECYCLE_AUTHORIZATION_EXPIRED',
  'LIFECYCLE_AUTHORIZATION_ALREADY_CONSUMED',
  'LIFECYCLE_FORBIDDEN',
  'LIFECYCLE_ORIGIN_NOT_SUPPORTED',
  'LIFECYCLE_ACTOR_NOT_SUPPORTED',
  'LIFECYCLE_COMMAND_CONFLICT',
  'LIFECYCLE_RESERVATION_NOT_FOUND',
  'LIFECYCLE_STATE_CONFLICT',
  'LIFECYCLE_ROLE_NOT_RESTRICTED',
  'LIFECYCLE_AUTHORITY_UNAVAILABLE',
  'CANONICAL_LIFECYCLE_AUTHORIZATION_IMMUTABLE',
  'CANONICAL_RESERVATION_EVENT_IMMUTABLE',
  'CANONICAL_LIFECYCLE_COMMAND_IMMUTABLE',
]);

export const issueCancellationAuthorizationSchema = z.object({
  reservationId: z.string().uuid(),
  commandId: z.string().uuid(),
  reasonCode: z.string().regex(/^[A-Z0-9_]{1,64}$/),
  reasonText: z.string().max(500).nullable().optional(),
  authenticatedPrincipal: z.string().regex(/^(user:[0-9]+|session:[0-9a-f-]{36})$/),
}).strict();

export type IssueCancellationAuthorizationCommand = z.infer<typeof issueCancellationAuthorizationSchema>;

export type LifecycleAuthorizationResult = {
  authorizationId: string;
  reservationId: string;
  commandId: string;
  guestPrincipal: string;
  issuedAt: string;
  expiresAt: string;
  fingerprint: string;
};

export const requestCancellationSchema = z.object({
  authorizationId: z.string().uuid(),
  commandId: z.string().uuid(),
  reservationId: z.string().uuid(),
  reasonCode: z.string().regex(/^[A-Z0-9_]{1,64}$/),
  reasonText: z.string().max(500).nullable().optional(),
  actorPrincipal: z.string().optional(),
  actorKind: z.string().optional(),
  originKind: z.string().optional(),
}).strict().superRefine((data, ctx) => {
  if (data.originKind && data.originKind !== 'ENCHO_DIRECT') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'LIFECYCLE_ORIGIN_NOT_SUPPORTED',
      path: ['originKind'],
    });
  }
  if (data.actorKind && data.actorKind !== 'GUEST') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'LIFECYCLE_ACTOR_NOT_SUPPORTED',
      path: ['actorKind'],
    });
  }
});

export type RequestCancellationCommand = z.infer<typeof requestCancellationSchema>;

export type LifecycleEventResult = {
  eventId: string;
  reservationId: string;
  lifecycleState: string;
  sequenceNumber: number;
  replayed: boolean;
};

export type LifecycleProjectionRecord = {
  reservationId: string;
  originKind: string;
  holderPrincipal: string | null;
  lifecycleState: string;
  currentSequence: number;
  latestEventId: string | null;
  stateEnteredAt: string | null;
  latestActorKind: string | null;
  latestActorPrincipal: string | null;
  latestReasonCode: string | null;
  latestReasonText: string | null;
};

export async function assertLifecycleIssuerRole(pool: pg.Pool): Promise<void> {
  const {rows} = await pool.query(`SELECT current_user AS role_name, r.rolcanlogin, r.rolsuper,
    r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
    has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
    has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
    has_table_privilege(current_user, 'public.canonical_reservations', 'INSERT,UPDATE,DELETE') AS raw_reservations,
    has_table_privilege(current_user, 'public.canonical_reservation_nights', 'SELECT,INSERT,UPDATE,DELETE') AS raw_nights,
    has_table_privilege(current_user, 'public.canonical_reservation_commands', 'SELECT,INSERT,UPDATE,DELETE') AS raw_commands,
    has_table_privilege(current_user, 'public.canonical_reservation_events', 'SELECT,INSERT,UPDATE,DELETE') AS raw_events,
    has_table_privilege(current_user, 'public.canonical_reservation_lifecycle_commands', 'SELECT,INSERT,UPDATE,DELETE') AS raw_lifecycle_commands,
    has_table_privilege(current_user, 'public.canonical_reservation_lifecycle_authorizations', 'INSERT,UPDATE,DELETE') AS raw_authorizations,
    has_function_privilege(current_user, 'public.canonical_issue_cancellation_authorization(uuid,uuid,text,text,text)', 'EXECUTE') AS issue_privilege,
    has_function_privilege(current_user, 'public.canonical_request_reservation_cancellation(uuid,uuid,uuid,text,text)', 'EXECUTE') AS request_privilege,
    has_function_privilege(current_user, 'public.canonical_get_reservation_lifecycle(uuid)', 'EXECUTE') AS get_privilege
    FROM pg_roles r WHERE r.rolname = current_user`);

  const r = rows[0];
  if (!r || r.role_name !== 'encho_lifecycle_issuer' || !r.rolcanlogin || r.rolsuper || r.rolbypassrls ||
    r.rolcreatedb || r.rolcreaterole || r.rolreplication || r.schema_create || r.database_create ||
    r.raw_reservations || r.raw_nights || r.raw_commands || r.raw_events ||
    r.raw_lifecycle_commands || r.raw_authorizations ||
    !r.issue_privilege || r.request_privilege || r.get_privilege) {
    throw new LifecycleAuthorityError('LIFECYCLE_ROLE_NOT_RESTRICTED');
  }
}

export async function assertLifecycleWorkerRole(pool: pg.Pool): Promise<void> {
  const {rows} = await pool.query(`SELECT current_user AS role_name, r.rolcanlogin, r.rolsuper,
    r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
    has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
    has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
    has_table_privilege(current_user, 'public.canonical_reservations', 'INSERT,UPDATE,DELETE') AS raw_reservations,
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
    has_table_privilege(current_user, 'public.canonical_payable_authorities', 'SELECT,INSERT,UPDATE,DELETE') AS raw_payable_authorities,
    has_table_privilege(current_user, 'public.canonical_reservation_events', 'SELECT,INSERT,UPDATE,DELETE') AS raw_events,
    has_table_privilege(current_user, 'public.canonical_reservation_lifecycle_commands', 'SELECT,INSERT,UPDATE,DELETE') AS raw_lifecycle_commands,
    has_table_privilege(current_user, 'public.canonical_reservation_lifecycle_authorizations', 'SELECT,INSERT,UPDATE,DELETE') AS raw_authorizations,
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('canonical_reservations',
        'canonical_reservation_nights', 'canonical_reservation_commands', 'booking_holds',
        'booking_hold_nights', 'inventory_days', 'stays_quotes', 'canonical_payment_attempts',
        'canonical_provider_events', 'canonical_quarantined_events', 'canonical_payment_reconciliations',
        'canonical_payment_reservations', 'canonical_payable_authorities',
        'canonical_reservation_events', 'canonical_reservation_lifecycle_commands',
        'canonical_reservation_lifecycle_authorizations')
        AND pg_has_role(r.oid, c.relowner, 'MEMBER')) AS protected_owner_member,
    pg_has_role(r.oid, 'pg_read_all_data'::regrole, 'MEMBER') AS read_all_data,
    pg_has_role(r.oid, 'pg_write_all_data'::regrole, 'MEMBER') AS write_all_data,
    has_function_privilege(current_user, 'public.canonical_request_reservation_cancellation(uuid,uuid,uuid,text,text)', 'EXECUTE') AS request_privilege,
    has_function_privilege(current_user, 'public.canonical_get_reservation_lifecycle(uuid)', 'EXECUTE') AS get_privilege,
    has_function_privilege(current_user, 'public.canonical_issue_cancellation_authorization(uuid,uuid,text,text,text)', 'EXECUTE') AS issue_privilege,
    has_function_privilege(current_user, 'public.canonical_finalize_direct_hold(uuid,uuid,uuid)', 'EXECUTE') AS direct_finalize_privilege,
    has_function_privilege(current_user, 'public.canonical_compose_payment_reservation(uuid,uuid)', 'EXECUTE') AS compose_privilege
    FROM pg_roles r WHERE r.rolname = current_user`);

  const r = rows[0];
  if (!r || r.role_name !== 'encho_lifecycle_worker' || !r.rolcanlogin || r.rolsuper || r.rolbypassrls ||
    r.rolcreatedb || r.rolcreaterole || r.rolreplication || r.schema_create || r.database_create ||
    r.raw_reservations || r.raw_nights || r.raw_commands || r.raw_holds || r.raw_inventory ||
    r.raw_quotes || r.raw_payment_attempts || r.raw_provider_events || r.raw_quarantined_events ||
    r.raw_reconciliations || r.raw_payment_reservations || r.raw_payable_authorities ||
    r.raw_events || r.raw_lifecycle_commands || r.raw_authorizations || r.protected_owner_member ||
    r.read_all_data || r.write_all_data || !r.request_privilege || !r.get_privilege ||
    r.issue_privilege || r.direct_finalize_privilege || r.compose_privilege) {
    throw new LifecycleAuthorityError('LIFECYCLE_ROLE_NOT_RESTRICTED');
  }
}

export async function issueCancellationAuthorization(
  pool: pg.Pool,
  input: unknown
): Promise<LifecycleAuthorizationResult> {
  const parsed = issueCancellationAuthorizationSchema.safeParse(input);
  if (!parsed.success) {
    throw new LifecycleAuthorityError('LIFECYCLE_INPUT_INVALID', parsed.error);
  }
  const {reservationId, commandId, reasonCode, reasonText, authenticatedPrincipal} = parsed.data;

  const client = await pool.connect();
  try {
    const {rows} = await client.query<{
      authorization_id: string;
      reservation_id: string;
      command_id: string;
      guest_principal: string;
      issued_at: string;
      expires_at: string;
      fingerprint: string;
    }>(
      `SELECT * FROM canonical_issue_cancellation_authorization(
        $1::uuid, $2::uuid, $3::text, $4::text, $5::text
      )`,
      [
        reservationId,
        commandId,
        reasonCode,
        reasonText ?? null,
        authenticatedPrincipal,
      ]
    );

    if (rows.length === 0) {
      throw new LifecycleAuthorityError('LIFECYCLE_AUTHORITY_UNAVAILABLE');
    }

    const r = rows[0];
    return {
      authorizationId: r.authorization_id,
      reservationId: r.reservation_id,
      commandId: r.command_id,
      guestPrincipal: r.guest_principal,
      issuedAt: r.issued_at,
      expiresAt: r.expires_at,
      fingerprint: r.fingerprint,
    };
  } catch (error) {
    if (error instanceof LifecycleAuthorityError) throw error;
    const message = error instanceof Error ? error.message : '';
    throw new LifecycleAuthorityError(
      knownCodes.has(message) ? message : 'LIFECYCLE_AUTHORITY_UNAVAILABLE',
      error
    );
  } finally {
    client.release();
  }
}

export async function requestReservationCancellation(
  pool: pg.Pool,
  input: unknown
): Promise<LifecycleEventResult> {
  const parsed = requestCancellationSchema.safeParse(input);
  if (!parsed.success) {
    const customIssue = parsed.error.issues.find(i =>
      i.message === 'LIFECYCLE_ORIGIN_NOT_SUPPORTED' || i.message === 'LIFECYCLE_ACTOR_NOT_SUPPORTED'
    );
    if (customIssue) {
      throw new LifecycleAuthorityError(customIssue.message);
    }
    throw new LifecycleAuthorityError('LIFECYCLE_INPUT_INVALID', parsed.error);
  }
  const {authorizationId, commandId, reservationId, reasonCode, reasonText} = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows} = await client.query<{
      event_id: string;
      reservation_id: string;
      lifecycle_state: string;
      sequence_number: number;
      replayed: boolean;
    }>(
      `SELECT * FROM canonical_request_reservation_cancellation(
        $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text
      )`,
      [
        authorizationId,
        commandId,
        reservationId,
        reasonCode,
        reasonText ?? null,
      ]
    );
    await client.query('COMMIT');

    if (rows.length === 0) {
      throw new LifecycleAuthorityError('LIFECYCLE_AUTHORITY_UNAVAILABLE');
    }

    const r = rows[0];
    return {
      eventId: r.event_id,
      reservationId: r.reservation_id,
      lifecycleState: r.lifecycle_state,
      sequenceNumber: r.sequence_number,
      replayed: r.replayed,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    if (error instanceof LifecycleAuthorityError) throw error;
    const message = error instanceof Error ? error.message : '';
    throw new LifecycleAuthorityError(
      knownCodes.has(message) ? message : 'LIFECYCLE_AUTHORITY_UNAVAILABLE',
      error
    );
  } finally {
    client.release();
  }
}

export async function getReservationLifecycle(
  pool: pg.Pool,
  reservationId: string
): Promise<LifecycleProjectionRecord | null> {
  const parsedId = z.string().uuid().safeParse(reservationId);
  if (!parsedId.success) {
    throw new LifecycleAuthorityError('LIFECYCLE_INPUT_INVALID');
  }
  const client = await pool.connect();
  try {
    const {rows} = await client.query<{
      reservation_id: string;
      origin_kind: string;
      holder_principal: string | null;
      lifecycle_state: string;
      current_sequence: number;
      latest_event_id: string | null;
      state_entered_at: string | null;
      latest_actor_kind: string | null;
      latest_actor_principal: string | null;
      latest_reason_code: string | null;
      latest_reason_text: string | null;
    }>(
      `SELECT * FROM canonical_get_reservation_lifecycle($1::uuid)`,
      [parsedId.data]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      reservationId: r.reservation_id,
      originKind: r.origin_kind,
      holderPrincipal: r.holder_principal,
      lifecycleState: r.lifecycle_state,
      currentSequence: r.current_sequence,
      latestEventId: r.latest_event_id,
      stateEnteredAt: r.state_entered_at,
      latestActorKind: r.latest_actor_kind,
      latestActorPrincipal: r.latest_actor_principal,
      latestReasonCode: r.latest_reason_code,
      latestReasonText: r.latest_reason_text,
    };
  } catch (error) {
    if (error instanceof LifecycleAuthorityError) throw error;
    const message = error instanceof Error ? error.message : '';
    throw new LifecycleAuthorityError(
      knownCodes.has(message) ? message : 'LIFECYCLE_AUTHORITY_UNAVAILABLE',
      error
    );
  } finally {
    client.release();
  }
}
