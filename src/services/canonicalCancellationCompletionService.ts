import type pg from 'pg';
import {z} from 'zod';

export class CancellationCompletionError extends Error {
  constructor(readonly code: string, readonly cause?: unknown) {
    super(code);
    this.name = 'CancellationCompletionError';
  }
}

const knownCodes = new Set([
  'CANCELLATION_INPUT_INVALID',
  'CANCELLATION_RESERVATION_NOT_FOUND',
  'CANCELLATION_ORIGIN_NOT_SUPPORTED',
  'CANCELLATION_REQUEST_EVENT_NOT_FOUND',
  'CANCELLATION_EVENT_RESERVATION_MISMATCH',
  'CANCELLATION_EVENT_TYPE_INVALID',
  'CANCELLATION_LIFECYCLE_STATE_CONFLICT',
  'CANCELLATION_COMMAND_CONFLICT',
  'CANCELLATION_AUTHORIZATION_NOT_FOUND',
  'CANCELLATION_AUTHORIZATION_RESERVATION_MISMATCH',
  'CANCELLATION_AUTHORIZATION_EXPIRED',
  'CANCELLATION_AUTHORIZATION_ALREADY_CONSUMED',
  'CANCELLATION_AUTHORIZATION_STATE_MISMATCH',
  'CANCELLATION_INVENTORY_ALREADY_RELEASED',
  'LIFECYCLE_STATE_CONFLICT',
  'LIFECYCLE_COMMAND_CONFLICT',
  'CANCELLATION_ALLOCATION_INCOMPLETE',
  'INVENTORY_DAY_MISSING',
  'INVENTORY_RELEASE_UNDERFLOW',
  'CANCELLATION_ISSUER_ROLE_NOT_READY',
  'CANCELLATION_EXECUTOR_ROLE_NOT_READY',
  'CANONICAL_CANCELLATION_AUTHORIZATION_IMMUTABLE',
  'CANONICAL_CANCELLATION_RELEASE_IMMUTABLE',
  'CANONICAL_RELEASE_NIGHT_IMMUTABLE',
]);

/**
 * Schema for issuing a cancellation completion decision authorization.
 *
 * NOTE: This is an internal decision authority primitive, NOT a public route or policy engine.
 */
export const issueCancellationDecisionSchema = z.object({
  reservationId: z.string().uuid(),
  requestEventId: z.string().uuid(),
  commandId: z.string().uuid(),
  reasonCode: z.string().regex(/^[A-Z0-9_]{1,64}$/),
  reasonText: z.string().max(500).nullable().optional(),
}).strict();

export type IssueCancellationDecisionCommand = z.infer<typeof issueCancellationDecisionSchema>;

export type CancellationDecisionAuthorizationResult = {
  authorizationId: string;
  reservationId: string;
  requestEventId: string;
  commandId: string;
  issuedAt: string;
  expiresAt: string;
  decisionFingerprint: string;
};

export const completeCancellationSchema = z.object({
  authorizationId: z.string().uuid(),
  commandId: z.string().uuid(),
  reservationId: z.string().uuid(),
  reasonCode: z.string().regex(/^[A-Z0-9_]{1,64}$/),
  reasonText: z.string().max(500).nullable().optional(),
}).strict();

export type CompleteCancellationCommand = z.infer<typeof completeCancellationSchema>;

export type CompleteCancellationResult = {
  eventId: string;
  reservationId: string;
  lifecycleState: string;
  sequenceNumber: number;
  releaseId: string;
  replayed: boolean;
};

export type CancellationReleaseRecord = {
  releaseId: string;
  reservationId: string;
  eventId: string;
  commandId: string;
  authorizationId: string;
  releasedAt: string;
  releaseFingerprint: string;
  totalNightsReleased: number;
  totalUnitsReleased: number;
};

function normalizeError(error: unknown): CancellationCompletionError {
  if (error instanceof CancellationCompletionError) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as {message: string}).message);
    for (const code of knownCodes) {
      if (msg.includes(code)) return new CancellationCompletionError(code, error);
    }
  }
  return new CancellationCompletionError('CANCELLATION_EXECUTION_UNAVAILABLE', error);
}

/**
 * Asserts that the pool connects as the restricted encho_cancellation_issuer role.
 */
export async function assertCancellationIssuerRole(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    const {rows} = await client.query<{user: string}>(`SELECT current_user AS "user"`);
    if (rows[0]?.user !== 'encho_cancellation_issuer') {
      throw new CancellationCompletionError('CANCELLATION_ISSUER_ROLE_NOT_READY');
    }
  } finally {
    client.release();
  }
}

/**
 * Asserts that the pool connects as the restricted encho_cancellation_executor role.
 */
export async function assertCancellationExecutorRole(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    const {rows} = await client.query<{user: string}>(`SELECT current_user AS "user"`);
    if (rows[0]?.user !== 'encho_cancellation_executor') {
      throw new CancellationCompletionError('CANCELLATION_EXECUTOR_ROLE_NOT_READY');
    }
  } finally {
    client.release();
  }
}

/**
 * Issues an unforgeable, command-bound cancellation decision authorization.
 * Executed strictly by the restricted decision issuer role.
 */
export async function issueCancellationDecisionAuthorization(
  pool: pg.Pool,
  rawCommand: IssueCancellationDecisionCommand
): Promise<CancellationDecisionAuthorizationResult> {
  const parsed = issueCancellationDecisionSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new CancellationCompletionError('CANCELLATION_INPUT_INVALID', parsed.error);
  }
  const cmd = parsed.data;

  const client = await pool.connect();
  try {
    const {rows} = await client.query<{
      authorization_id: string;
      reservation_id: string;
      request_event_id: string;
      command_id: string;
      issued_at: string;
      expires_at: string;
      decision_fingerprint: string;
    }>(
      `SELECT * FROM canonical_issue_cancellation_decision_authorization($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text)`,
      [cmd.reservationId, cmd.requestEventId, cmd.commandId, cmd.reasonCode, cmd.reasonText ?? null]
    );

    if (rows.length === 0) {
      throw new CancellationCompletionError('CANCELLATION_AUTHORIZATION_NOT_FOUND');
    }

    const row = rows[0];
    return {
      authorizationId: row.authorization_id,
      reservationId: row.reservation_id,
      requestEventId: row.request_event_id,
      commandId: row.command_id,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      decisionFingerprint: row.decision_fingerprint,
    };
  } catch (error) {
    throw normalizeError(error);
  } finally {
    client.release();
  }
}

/**
 * Atomically executes cancellation completion and inventory release.
 * Executed strictly by the restricted cancellation executor role.
 */
export async function completeReservationCancellation(
  pool: pg.Pool,
  rawCommand: CompleteCancellationCommand
): Promise<CompleteCancellationResult> {
  const parsed = completeCancellationSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new CancellationCompletionError('CANCELLATION_INPUT_INVALID', parsed.error);
  }
  const cmd = parsed.data;

  const client = await pool.connect();
  try {
    const {rows} = await client.query<{
      event_id: string;
      reservation_id: string;
      lifecycle_state: string;
      sequence_number: number;
      release_id: string;
      replayed: boolean;
    }>(
      `SELECT * FROM canonical_complete_reservation_cancellation($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text)`,
      [cmd.authorizationId, cmd.commandId, cmd.reservationId, cmd.reasonCode, cmd.reasonText ?? null]
    );

    if (rows.length === 0) {
      throw new CancellationCompletionError('CANCELLATION_EXECUTION_FAILED');
    }

    const row = rows[0];
    return {
      eventId: row.event_id,
      reservationId: row.reservation_id,
      lifecycleState: row.lifecycle_state,
      sequenceNumber: row.sequence_number,
      releaseId: row.release_id,
      replayed: row.replayed,
    };
  } catch (error) {
    throw normalizeError(error);
  } finally {
    client.release();
  }
}

/**
 * Retrieves the cancellation release record and night count for a reservation.
 */
export async function getCancellationRelease(
  pool: pg.Pool,
  reservationId: string
): Promise<CancellationReleaseRecord | null> {
  if (!reservationId || !z.string().uuid().safeParse(reservationId).success) {
    throw new CancellationCompletionError('CANCELLATION_INPUT_INVALID');
  }

  const client = await pool.connect();
  try {
    const {rows} = await client.query<{
      release_id: string;
      reservation_id: string;
      event_id: string;
      command_id: string;
      authorization_id: string;
      released_at: string;
      release_fingerprint: string;
      total_nights_released: number;
      total_units_released: number;
    }>(
      `SELECT * FROM canonical_get_cancellation_release($1::uuid)`,
      [reservationId]
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      releaseId: row.release_id,
      reservationId: row.reservation_id,
      eventId: row.event_id,
      commandId: row.command_id,
      authorizationId: row.authorization_id,
      releasedAt: row.released_at,
      releaseFingerprint: row.release_fingerprint,
      totalNightsReleased: Number(row.total_nights_released),
      totalUnitsReleased: Number(row.total_units_released),
    };
  } catch (error) {
    throw normalizeError(error);
  } finally {
    client.release();
  }
}
