/**
 * src/services/inventoryHoldService.ts
 *
 * Authoritative Milestone 4 Service for Inventory Days and Atomic Checkout Holds.
 *
 * NON-NEGOTIABLE INVARIANTS:
 * 1. Inventory authority is strictly room_types.id (never a mutable string name or tier).
 * 2. Night semantics are strictly [check_in, check_out): check_in is included; checkout is excluded.
 *    Same-day (check_in == check_out) or reversed (check_in > check_out) ranges are rejected.
 * 3. Lock ordering: inventory_days rows are locked FOR UPDATE strictly sorted by calendar_date ASC.
 * 4. Atomic all-or-nothing: either all requested nights have available capacity (held + booked + blocked + qty <= total)
 *    and are incremented, or none are incremented (HTTP 409 Conflict with zero partial state).
 * 5. Principal-Bound Idempotency & Request Fingerprinting:
 *    - Uniqueness is bound to (holder_principal, idempotency_key).
 *    - Request fingerprint is computed over (room_type_id, check_in, check_out, quantity).
 *    - Same principal + same key + same fingerprint returns original hold (HTTP 200).
 *    - Same principal + same key + different payload returns HTTP 409 Conflict.
 *    - Different principal with same key gets a separate, isolated hold and cannot access another caller's hold.
 *    - Anonymous holds require a server-issued, signed session token; untrusted caller headers are rejected.
 * 6. Legacy Calendar Block Safety & Fail-Closed Protection:
 *    - Before hold acquisition, room_calendar_blocks for the property are checked across the date range.
 *    - If an overlapping block exists for the room_type_id, it counts towards blocked_units.
 *    - If an overlapping block is unmapped or ambiguous (e.g. tier/name doesn't match a single room_type_id or targets 'all'),
 *      the system fails closed: record created in legacy_block_conflict_ledger and hold acquisition is rejected (HTTP 409).
 * 7. Host Block/Unblock Integration:
 *    - Host calendar block/unblock uses the identical transactional inventory authority and lock ordering on inventory_days.
 * 8. Guarded, Locked Decrements & Sweeper Integrity:
 *    - No clamping (`GREATEST(0, held_units - units)`).
 *    - Lock hold nights and inventory_days in ascending stay_date order using FOR UPDATE.
 *    - Decrement held_units: if held_units < units to decrement, roll back and open an audit/reconciliation signal.
 * 9. Explicit Server-Authorized Admin Override:
 *    - Actor role must be verified by the server ('admin'), not an arbitrary release_reason string.
 * 10. Observability: Structured logging without guest PII.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pkg from 'pg';

const { Pool } = pkg;
const JWT_SECRET = process.env.JWT_SECRET || 'encho_super_secure_jwt_secret_change_in_prod';
const GUEST_COOKIE_SECRET = process.env.GUEST_COOKIE_SECRET || JWT_SECRET;

export interface AcquireHoldParams {
  roomTypeId: number;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  quantity: number;
  idempotencyKey: string;
  holderPrincipal: string; // e.g. 'user:123' or 'session:signed_session_uuid'
  userId?: number | null;
  guestSessionId?: string | null;
}

export interface HoldResult {
  success: boolean;
  statusCode: number;
  hold?: {
    id: string;
    roomTypeId: number;
    checkIn: string;
    checkOut: string;
    quantity: number;
    status: string;
    expiresAt: string;
    createdAt: string;
  };
  error?: string;
  code?: string;
  conflictDetails?: {
    date: string;
    availableUnits?: number;
    requestedUnits?: number;
    reason?: string;
  };
}

export interface ReleaseHoldParams {
  holdId: string;
  holderPrincipal: string;
  isServerAdmin: boolean;
  reason?: string;
}

export interface ReleaseResult {
  success: boolean;
  statusCode: number;
  error?: string;
  code?: string;
  releasedUnits?: number;
}

export interface SweeperResult {
  expiredHoldCount: number;
  releasedNightsCount: number;
  errors: string[];
}

export interface HostBlockParams {
  listingId: number;
  roomTypeId: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  blockSource?: string;
  guestName?: string | null;
  note?: string | null;
}

export interface HostBlockResult {
  success: boolean;
  statusCode: number;
  block?: any;
  error?: string;
  code?: string;
  conflictDetails?: any;
}

/**
 * Validates and parses ISO YYYY-MM-DD strings.
 */
export function parseDateOnly(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d;
}

/**
 * Formats a Date object to YYYY-MM-DD UTC string.
 */
export function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns array of calendar dates [check_in, check_out) strictly in ascending order.
 */
export function getStayDatesRange(checkInStr: string, checkOutStr: string): { valid: boolean; dates: string[]; error?: string } {
  const checkIn = parseDateOnly(checkInStr);
  const checkOut = parseDateOnly(checkOutStr);

  if (!checkIn || !checkOut) {
    return { valid: false, dates: [], error: 'Invalid date format. Expected YYYY-MM-DD.' };
  }

  const checkInMs = checkIn.getTime();
  const checkOutMs = checkOut.getTime();

  if (checkInMs >= checkOutMs) {
    return {
      valid: false,
      dates: [],
      error: 'Invalid night range: checkout must be at least one day after check-in. Same-day or inverted stays are rejected.'
    };
  }

  const msPerDay = 86400000;
  const nights = Math.round((checkOutMs - checkInMs) / msPerDay);

  if (nights > 90) {
    return { valid: false, dates: [], error: 'Stays exceeding 90 consecutive nights are not supported.' };
  }

  const dates: string[] = [];
  let curr = new Date(checkInMs);
  for (let i = 0; i < nights; i++) {
    dates.push(formatDateOnly(curr));
    curr = new Date(curr.getTime() + msPerDay);
  }

  return { valid: true, dates };
}

/**
 * Computes deterministic request fingerprint for idempotency validation.
 */
export function computeRequestFingerprint(roomTypeId: number, checkIn: string, checkOut: string, quantity: number): string {
  const raw = `${roomTypeId}|${checkIn}|${checkOut}|${quantity}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Signs a guest session ID for safe, tamper-proof cookie transmission.
 */
export function signGuestSession(sessionId: string): string {
  return jwt.sign({ sub: sessionId, type: 'guest_session' }, GUEST_COOKIE_SECRET, { expiresIn: '7d' });
}

/**
 * Verifies a server-signed guest session cookie. Returns null if invalid or tampered.
 */
export function verifyGuestSession(signedCookie?: string | null): string | null {
  if (!signedCookie || typeof signedCookie !== 'string') return null;
  try {
    const decoded = jwt.verify(signedCookie, GUEST_COOKIE_SECRET) as any;
    if (decoded && decoded.type === 'guest_session' && typeof decoded.sub === 'string') {
      return decoded.sub;
    }
  } catch (_e) {
    // Tampered or expired cookie
  }
  return null;
}

/**
 * Computes deterministic SHA-256 fingerprint for ambiguous calendar block conflicts.
 */
export function computeConflictFingerprint(blockId: number | string, conflictReason: string): string {
  const raw = `${blockId}|${conflictReason}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Hashes holder principal or guest-session UUID into a stable 12-char SHA-256 prefix for privacy-safe logging.
 */
export function hashPrincipal(principal?: string | null): string {
  if (!principal || typeof principal !== 'string') return 'anon:none';
  const digest = crypto.createHash('sha256').update(principal).digest('hex').substring(0, 12);
  const prefix = principal.startsWith('user:') ? 'user' : principal.startsWith('session:') ? 'session' : 'anon';
  return `${prefix}:[${digest}]`;
}

/**
 * Resolves Hold TTL in seconds: reads HOLD_TTL_SECONDS env var, defaults to 600 (10 mins).
 */
export function getHoldTtlSeconds(): number {
  const envVal = process.env.HOLD_TTL_SECONDS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed >= 60 && parsed <= 3600) {
      return parsed;
    }
  }
  return 600; // 10 minutes default (Decision #36)
}

/**
 * Acquires an atomic hold with principal-bound idempotency and legacy block fail-closed verification.
 */
export async function acquireHold(pool: any, params: AcquireHoldParams): Promise<HoldResult> {
  const startTime = Date.now();
  const principal = params.holderPrincipal;

  if (!principal || typeof principal !== 'string') {
    return {
      success: false,
      statusCode: 401,
      error: 'Unauthorized: Valid holder principal is required to establish inventory holds.',
      code: 'MISSING_HOLDER_PRINCIPAL'
    };
  }

  // 1. Maintenance mode check
  if (process.env.MAINTENANCE_MODE_HOLDS === 'true') {
    return {
      success: false,
      statusCode: 503,
      error: 'Hold service is currently undergoing scheduled maintenance. Please try again shortly.',
      code: 'MAINTENANCE_MODE_ACTIVE'
    };
  }

  // 2. Parameter validation
  const roomTypeId = Number(params.roomTypeId);
  if (!roomTypeId || isNaN(roomTypeId) || roomTypeId <= 0) {
    return {
      success: false,
      statusCode: 400,
      error: 'Valid numeric room_type_id is required as inventory authority.',
      code: 'INVALID_ROOM_TYPE_ID'
    };
  }

  const quantity = Number(params.quantity) || 1;
  if (quantity < 1 || !Number.isInteger(quantity) || quantity > 10) {
    return {
      success: false,
      statusCode: 400,
      error: 'Quantity must be an integer between 1 and 10.',
      code: 'INVALID_QUANTITY'
    };
  }

  if (!params.idempotencyKey || typeof params.idempotencyKey !== 'string' || params.idempotencyKey.trim().length < 8) {
    return {
      success: false,
      statusCode: 400,
      error: 'A robust idempotency_key (minimum 8 characters) is required.',
      code: 'INVALID_IDEMPOTENCY_KEY'
    };
  }

  const rangeCheck = getStayDatesRange(params.checkIn, params.checkOut);
  if (!rangeCheck.valid) {
    return {
      success: false,
      statusCode: 400,
      error: rangeCheck.error,
      code: 'INVALID_DATE_RANGE'
    };
  }

  const stayDates = rangeCheck.dates;
  const currentFingerprint = computeRequestFingerprint(roomTypeId, params.checkIn, params.checkOut, quantity);
  const client = await pool.connect();

  try {
    // 3. Principal-bound idempotency check
    const existingRes = await client.query(
      `SELECT id, room_type_id, holder_principal, check_in_date, check_out_date, units_held, status, request_fingerprint, expires_at, created_at
       FROM booking_holds
       WHERE holder_principal = $1 AND idempotency_key = $2`,
      [principal, params.idempotencyKey]
    );

    if (existingRes.rows.length > 0) {
      const row = existingRes.rows[0];
      // If same principal + same key + DIFFERENT fingerprint -> 409 Conflict
      if (row.request_fingerprint && row.request_fingerprint !== currentFingerprint) {
        return {
          success: false,
          statusCode: 409,
          error: 'Idempotency conflict: A hold already exists with this idempotency key for different parameters.',
          code: 'IDEMPOTENCY_MISMATCH'
        };
      }

      const checkInStr = typeof row.check_in_date === 'string' ? row.check_in_date.substring(0, 10) : formatDateOnly(new Date(row.check_in_date));
      const checkOutStr = typeof row.check_out_date === 'string' ? row.check_out_date.substring(0, 10) : formatDateOnly(new Date(row.check_out_date));
      return {
        success: true,
        statusCode: 200,
        hold: {
          id: String(row.id),
          roomTypeId: Number(row.room_type_id),
          checkIn: checkInStr,
          checkOut: checkOutStr,
          quantity: Number(row.units_held),
          status: row.status,
          expiresAt: new Date(row.expires_at).toISOString(),
          createdAt: new Date(row.created_at).toISOString()
        }
      };
    }

    // 4. Begin transactional hold acquisition
    await client.query('BEGIN');

    // 4a. Verify room_type exists and retrieve parent listing_id & inventory_count
    const roomRes = await client.query(
      'SELECT id, listing_id, inventory_count FROM room_types WHERE id = $1',
      [roomTypeId]
    );

    if (roomRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 404,
        error: `Room type ${roomTypeId} does not exist.`,
        code: 'ROOM_TYPE_NOT_FOUND'
      };
    }

    const listingId = roomRes.rows[0].listing_id;
    const defaultTotalUnits = roomRes.rows[0].inventory_count || 1;

    // 4b. Legacy calendar block safety check & fail-closed protection
    // Check if any legacy block exists on this property overlapping the stay dates
    const legacyBlocksRes = await client.query(
      `SELECT id, room_type_id, room_tier_key, room_name, start_date, end_date, mapping_status
       FROM room_calendar_blocks
       WHERE listing_id = $1
         AND start_date <= $2::date
         AND end_date >= $3::date`,
      [listingId, stayDates[stayDates.length - 1], stayDates[0]]
    );

    let ambiguousBlockToRecord: any = null;
    const mappedConflictingBlocks: any[] = [];

    for (const block of legacyBlocksRes.rows) {
      // If block explicitly references another room_type_id, it does not conflict with this room
      if (block.room_type_id && Number(block.room_type_id) !== roomTypeId) {
        continue;
      }

      // If block has no room_type_id and is ambiguous ('all', or unmapped tier that cannot be proven distinct)
      const isAmbiguous = !block.room_type_id || block.mapping_status === 'ambiguous' || block.room_tier_key === 'all';

      if (isAmbiguous) {
        ambiguousBlockToRecord = block;
        break;
      }

      // If block is mapped to this room_type_id
      if (block.room_type_id && Number(block.room_type_id) === roomTypeId) {
        mappedConflictingBlocks.push(block);
      }
    }

    if (ambiguousBlockToRecord) {
      // Step A: Rollback the hold transaction with ZERO inventory mutation
      await client.query('ROLLBACK');

      // Step B: Write the conflict record in a separate committed transaction with non-destructive dedupe_key
      const conflictReason = 'Ambiguous legacy calendar block cannot be mapped safely to room_types.id; hold failed closed.';
      const dedupeKey = computeConflictFingerprint(ambiguousBlockToRecord.id, conflictReason);

      try {
        await pool.query(
          `INSERT INTO legacy_block_conflict_ledger (listing_id, block_id, room_tier_key, room_name, start_date, end_date, conflict_reason, dedupe_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [
            listingId,
            ambiguousBlockToRecord.id,
            ambiguousBlockToRecord.room_tier_key,
            ambiguousBlockToRecord.room_name,
            ambiguousBlockToRecord.start_date,
            ambiguousBlockToRecord.end_date,
            conflictReason,
            dedupeKey
          ]
        );
      } catch (ledgerErr: any) {
        // Operational failure: Never swallow ledger-write failures or falsely imply conflict was durably recorded
        console.error(`[AUDIT_ALERT] Critical failure recording conflict ledger row for blockId=${ambiguousBlockToRecord.id}: ${ledgerErr.message}`);
        return {
          success: false,
          statusCode: 500,
          error: 'System error: Unable to record conflict ledger audit entry. Hold request failed closed.',
          code: 'CONFLICT_LEDGER_WRITE_FAILED'
        };
      }

      console.warn(`[LEGACY_BLOCK_AMBIGUOUS_CONFLICT] listingId=${listingId} blockId=${ambiguousBlockToRecord.id} roomTypeId=${roomTypeId}`);
      return {
        success: false,
        statusCode: 409,
        error: 'Dates unavailable due to an active property calendar block. Please select alternative dates.',
        code: 'CALENDAR_BLOCK_CONFLICT',
        conflictDetails: {
          date: typeof ambiguousBlockToRecord.start_date === 'string'
            ? ambiguousBlockToRecord.start_date.substring(0, 10)
            : formatDateOnly(new Date(ambiguousBlockToRecord.start_date)),
          reason: 'AMBIGUOUS_PROPERTY_BLOCK'
        }
      };
    }

    // 4c. Ensure inventory_days rows exist for all requested dates
    for (const date of stayDates) {
      await client.query(
        `INSERT INTO inventory_days (listing_id, room_type_id, calendar_date, total_units, held_units, booked_units, blocked_units)
         VALUES ($1, $2, $3, $4, 0, 0, 0)
         ON CONFLICT (room_type_id, calendar_date) DO NOTHING`,
        [listingId, roomTypeId, date, defaultTotalUnits]
      );
    }

    // 4d. Reconcile pre-existing mapped calendar blocks into inventory_days.blocked_units atomically
    if (mappedConflictingBlocks.length > 0) {
      for (const mBlock of mappedConflictingBlocks) {
        const bRange = getStayDatesRange(
          typeof mBlock.start_date === 'string' ? mBlock.start_date.substring(0, 10) : formatDateOnly(new Date(mBlock.start_date)),
          typeof mBlock.end_date === 'string' ? mBlock.end_date.substring(0, 10) : formatDateOnly(new Date(mBlock.end_date))
        );
        const blockDates = bRange.valid ? bRange.dates : [];
        for (const bDate of blockDates) {
          if (stayDates.includes(bDate)) {
            // Reconcile: ensure blocked_units is at least 1 for this date
            await client.query(
              `UPDATE inventory_days
               SET blocked_units = GREATEST(blocked_units, 1), updated_at = NOW()
               WHERE room_type_id = $1 AND calendar_date = $2::date`,
              [roomTypeId, bDate]
            );
          }
        }
      }
    }

    // 4e. SELECT ... FOR UPDATE locked strictly in calendar_date ASC order
    const lockStartTime = Date.now();
    const lockedDaysRes = await client.query(
      `SELECT id, calendar_date, total_units, held_units, booked_units, blocked_units
       FROM inventory_days
       WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
       ORDER BY calendar_date ASC
       FOR UPDATE`,
      [roomTypeId, stayDates]
    );
    const lockLatencyMs = Date.now() - lockStartTime;

    // 4e. Capacity verification across EVERY date
    let conflictFound = false;
    let conflictDate = '';
    let availableUnits = 0;

    for (const row of lockedDaysRes.rows) {
      const dateStr = typeof row.calendar_date === 'string' ? row.calendar_date.substring(0, 10) : formatDateOnly(new Date(row.calendar_date));
      const avail = row.total_units - (row.held_units + row.booked_units + row.blocked_units);
      if (avail < quantity) {
        conflictFound = true;
        conflictDate = dateStr;
        availableUnits = Math.max(0, avail);
        break;
      }
    }

    if (conflictFound) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 409,
        error: `Insufficient inventory on ${conflictDate}. Requested: ${quantity}, Available: ${availableUnits}.`,
        code: 'INSUFFICIENT_INVENTORY',
        conflictDetails: {
          date: conflictDate,
          availableUnits,
          requestedUnits: quantity
        }
      };
    }

    // 4f. Atomically increment held_units on all nights
    for (const row of lockedDaysRes.rows) {
      await client.query(
        `UPDATE inventory_days
         SET held_units = held_units + $1, updated_at = NOW()
         WHERE id = $2`,
        [quantity, row.id]
      );
    }

    // 4g. Create booking_holds record bound to holder_principal
    const ttlSeconds = getHoldTtlSeconds();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const holdUuid = crypto.randomUUID();

    const insertHoldRes = await client.query(
      `INSERT INTO booking_holds (
         id, room_type_id, user_id, guest_session_id, holder_principal, idempotency_key,
         request_fingerprint, check_in_date, check_out_date, units_held, status, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', $11)
       RETURNING id, room_type_id, check_in_date, check_out_date, units_held, status, expires_at, created_at`,
      [
        holdUuid,
        roomTypeId,
        params.userId || null,
        params.guestSessionId || null,
        principal,
        params.idempotencyKey,
        currentFingerprint,
        params.checkIn,
        params.checkOut,
        quantity,
        expiresAt
      ]
    );

    const createdHold = insertHoldRes.rows[0];

    // 4h. Link booking_hold_nights allocations
    for (const row of lockedDaysRes.rows) {
      const stayDate = typeof row.calendar_date === 'string' ? row.calendar_date.substring(0, 10) : formatDateOnly(new Date(row.calendar_date));
      await client.query(
        `INSERT INTO booking_hold_nights (hold_id, inventory_day_id, stay_date, units)
         VALUES ($1, $2, $3, $4)`,
        [holdUuid, row.id, stayDate, quantity]
      );
    }

    await client.query('COMMIT');
    const totalDurationMs = Date.now() - startTime;
    console.info(`[HOLD_ACQUIRED] holdId=${holdUuid} principal=${hashPrincipal(principal)} roomTypeId=${roomTypeId} qty=${quantity} lockLatencyMs=${lockLatencyMs} totalMs=${totalDurationMs}`);

    return {
      success: true,
      statusCode: 201,
      hold: {
        id: String(createdHold.id),
        roomTypeId: Number(createdHold.room_type_id),
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        quantity,
        status: createdHold.status,
        expiresAt: expiresAt.toISOString(),
        createdAt: new Date(createdHold.created_at).toISOString()
      }
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    // If composite unique collision occurs during race
    if (err.code === '23505' || (err.message && err.message.includes('duplicate key'))) {
      const fallbackRes = await pool.query(
        `SELECT id, room_type_id, check_in_date, check_out_date, units_held, status, request_fingerprint, expires_at, created_at
         FROM booking_holds WHERE holder_principal = $1 AND idempotency_key = $2`,
        [principal, params.idempotencyKey]
      );
      if (fallbackRes.rows.length > 0) {
        const row = fallbackRes.rows[0];
        if (row.request_fingerprint && row.request_fingerprint !== currentFingerprint) {
          return {
            success: false,
            statusCode: 409,
            error: 'Idempotency conflict: A hold already exists with this idempotency key for different parameters.',
            code: 'IDEMPOTENCY_MISMATCH'
          };
        }
        return {
          success: true,
          statusCode: 200,
          hold: {
            id: String(row.id),
            roomTypeId: Number(row.room_type_id),
            checkIn: params.checkIn,
            checkOut: params.checkOut,
            quantity: Number(row.units_held),
            status: row.status,
            expiresAt: new Date(row.expires_at).toISOString(),
            createdAt: new Date(row.created_at).toISOString()
          }
        };
      }
    }

    console.error(`[HOLD_ACQUISITION_ERROR] principal=${hashPrincipal(principal)} roomTypeId=${roomTypeId} error=${err.message}`);
    return {
      success: false,
      statusCode: 500,
      error: 'Failed to acquire atomic inventory hold.',
      code: 'HOLD_ACQUISITION_FAILED'
    };
  } finally {
    client.release();
  }
}

/**
 * Host calendar block creation: Uses IDENTICAL transactional authority and lock ordering as holds.
 */
export async function createHostCalendarBlock(pool: any, params: HostBlockParams): Promise<HostBlockResult> {
  const rangeCheck = getStayDatesRange(params.startDate, params.endDate);
  if (!rangeCheck.valid) {
    return { success: false, statusCode: 400, error: rangeCheck.error, code: 'INVALID_DATE_RANGE' };
  }

  const stayDates = rangeCheck.dates;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Verify room type belongs to listing
    const roomRes = await client.query(
      'SELECT id, listing_id, inventory_count FROM room_types WHERE id = $1 AND listing_id = $2',
      [params.roomTypeId, params.listingId]
    );

    if (roomRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, statusCode: 404, error: 'Room type not found on listing.', code: 'ROOM_TYPE_NOT_FOUND' };
    }

    const defaultTotalUnits = roomRes.rows[0].inventory_count || 1;

    // 2. Ensure inventory_days exist
    for (const date of stayDates) {
      await client.query(
        `INSERT INTO inventory_days (listing_id, room_type_id, calendar_date, total_units, held_units, booked_units, blocked_units)
         VALUES ($1, $2, $3, $4, 0, 0, 0)
         ON CONFLICT (room_type_id, calendar_date) DO NOTHING`,
        [params.listingId, params.roomTypeId, date, defaultTotalUnits]
      );
    }

    // 3. SELECT ... FOR UPDATE locked in calendar_date ASC order
    const lockedDaysRes = await client.query(
      `SELECT id, calendar_date, total_units, held_units, booked_units, blocked_units
       FROM inventory_days
       WHERE room_type_id = $1 AND calendar_date = ANY($2::date[])
       ORDER BY calendar_date ASC
       FOR UPDATE`,
      [params.roomTypeId, stayDates]
    );

    // 4. Verify that blocking does not exceed capacity (i.e. cannot block units already held/booked)
    for (const row of lockedDaysRes.rows) {
      const dateStr = typeof row.calendar_date === 'string' ? row.calendar_date.substring(0, 10) : formatDateOnly(new Date(row.calendar_date));
      const avail = row.total_units - (row.held_units + row.booked_units + row.blocked_units);
      if (avail < 1) {
        await client.query('ROLLBACK');
        return {
          success: false,
          statusCode: 409,
          error: `Cannot block dates: active hold or booking exists on ${dateStr}.`,
          code: 'BLOCK_CONFLICT_EXISTS',
          conflictDetails: { date: dateStr }
        };
      }
    }

    // 5. Increment blocked_units in inventory_days
    for (const row of lockedDaysRes.rows) {
      await client.query(
        `UPDATE inventory_days
         SET blocked_units = blocked_units + 1, updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
    }

    // 6. Insert into room_calendar_blocks with relational room_type_id and mapping_status = 'mapped'
    const blockRes = await client.query(
      `INSERT INTO room_calendar_blocks (
         listing_id, room_type_id, start_date, end_date, block_source, guest_name, note, mapping_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'mapped')
       RETURNING *`,
      [
        params.listingId,
        params.roomTypeId,
        params.startDate,
        params.endDate,
        params.blockSource || 'manual',
        params.guestName || null,
        params.note || null
      ]
    );

    await client.query('COMMIT');
    return {
      success: true,
      statusCode: 201,
      block: blockRes.rows[0]
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    return { success: false, statusCode: 500, error: err.message, code: 'BLOCK_CREATION_FAILED' };
  } finally {
    client.release();
  }
}

/**
 * Guarded, locked release with explicit server authorization and zero-clamping integrity.
 */
export async function releaseHold(pool: any, params: ReleaseHoldParams): Promise<ReleaseResult> {
  if (!params.holdId || typeof params.holdId !== 'string') {
    return { success: false, statusCode: 400, error: 'Valid holdId is required.', code: 'INVALID_HOLD_ID' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock hold record FOR UPDATE
    const holdRes = await client.query(
      `SELECT id, room_type_id, holder_principal, units_held, status
       FROM booking_holds
       WHERE id = $1
       FOR UPDATE`,
      [params.holdId]
    );

    if (holdRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, statusCode: 404, error: 'Hold not found.', code: 'HOLD_NOT_FOUND' };
    }

    const hold = holdRes.rows[0];

    // 2. Authorization check: must be holder or explicit server-authorized admin
    const isHolder = hold.holder_principal === params.holderPrincipal;
    if (!isHolder && !params.isServerAdmin) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 403,
        error: 'Forbidden: You do not possess authorization to release this hold.',
        code: 'HOLD_RELEASE_FORBIDDEN'
      };
    }

    if (hold.status !== 'ACTIVE') {
      await client.query('COMMIT');
      return { success: true, statusCode: 200, releasedUnits: 0 };
    }

    // 3. Find hold nights and lock inventory_days ordered by stay_date ASC
    const nightsRes = await client.query(
      `SELECT bhn.inventory_day_id, bhn.units, iday.held_units, iday.calendar_date
       FROM booking_hold_nights bhn
       JOIN inventory_days iday ON iday.id = bhn.inventory_day_id
       WHERE bhn.hold_id = $1
       ORDER BY bhn.stay_date ASC
       FOR UPDATE`,
      [params.holdId]
    );

    // 4. Guarded decrement: ensure held_units >= units. NEVER clamp silently.
    for (const night of nightsRes.rows) {
      if (Number(night.held_units) < Number(night.units)) {
        await client.query('ROLLBACK');
        console.error(`[HOLD_RELEASE_INVARIANT_VIOLATION] holdId=${params.holdId} inventoryDayId=${night.inventory_day_id} held=${night.held_units} decrement=${night.units}`);
        return {
          success: false,
          statusCode: 500,
          error: 'Integrity invariant violation: insufficient held capacity to decrement.',
          code: 'INVARIANT_VIOLATION'
        };
      }

      await client.query(
        `UPDATE inventory_days
         SET held_units = held_units - $1, updated_at = NOW()
         WHERE id = $2`,
        [night.units, night.inventory_day_id]
      );
    }

    // 5. Update hold status
    const releaseReason = params.isServerAdmin && !isHolder ? 'ADMIN_OVERRIDE' : (params.reason || 'GUEST_EXPLICIT_RELEASE');
    await client.query(
      `UPDATE booking_holds
       SET status = 'RELEASED', released_at = NOW(), release_reason = $1
       WHERE id = $2`,
      [releaseReason, params.holdId]
    );

    await client.query('COMMIT');
    return {
      success: true,
      statusCode: 200,
      releasedUnits: Number(hold.units_held)
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    return { success: false, statusCode: 500, error: 'Failed to release hold.', code: 'RELEASE_FAILED' };
  } finally {
    client.release();
  }
}

/**
 * Idempotent hold sweeper with guarded, locked decrements in stay_date ASC order.
 */
export async function sweepExpiredHolds(pool: any): Promise<SweeperResult> {
  const result: SweeperResult = {
    expiredHoldCount: 0,
    releasedNightsCount: 0,
    errors: []
  };

  const client = await pool.connect();
  try {
    const expiredRes = await client.query(
      `SELECT id, room_type_id, units_held
       FROM booking_holds
       WHERE status = 'ACTIVE' AND expires_at <= NOW()
       ORDER BY expires_at ASC
       LIMIT 50`
    );

    for (const hold of expiredRes.rows) {
      try {
        await client.query('BEGIN');

        const lockRes = await client.query(
          `SELECT id, status FROM booking_holds WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE`,
          [hold.id]
        );

        if (lockRes.rows.length === 0) {
          await client.query('COMMIT');
          continue;
        }

        // Lock inventory_days in stay_date ASC order
        const nightsRes = await client.query(
          `SELECT bhn.inventory_day_id, bhn.units, iday.held_units, iday.calendar_date
           FROM booking_hold_nights bhn
           JOIN inventory_days iday ON iday.id = bhn.inventory_day_id
           WHERE bhn.hold_id = $1
           ORDER BY bhn.stay_date ASC
           FOR UPDATE`,
          [hold.id]
        );

        for (const night of nightsRes.rows) {
          if (Number(night.held_units) < Number(night.units)) {
            throw new Error(`Integrity error: held_units (${night.held_units}) < units (${night.units}) on inventory_day ${night.inventory_day_id}`);
          }

          await client.query(
            `UPDATE inventory_days
             SET held_units = held_units - $1, updated_at = NOW()
             WHERE id = $2`,
            [night.units, night.inventory_day_id]
          );
          result.releasedNightsCount++;
        }

        await client.query(
          `UPDATE booking_holds
           SET status = 'EXPIRED', released_at = NOW(), release_reason = 'TTL_EXPIRED'
           WHERE id = $1`,
          [hold.id]
        );

        await client.query('COMMIT');
        result.expiredHoldCount++;
      } catch (innerErr: any) {
        await client.query('ROLLBACK');
        result.errors.push(`Failed to expire hold ${hold.id}: ${innerErr.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(`Sweeper execution error: ${err.message}`);
  } finally {
    client.release();
  }

  return result;
}
