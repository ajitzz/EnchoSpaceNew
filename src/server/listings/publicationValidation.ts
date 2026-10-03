import type { Pool, PoolClient, QueryResultRow } from 'pg';

export interface RoomTypeRow extends QueryResultRow {
  id: number;
  name: string;
  type: string;
  base_price?: string | number;
}

export interface MediaCountRow extends QueryResultRow {
  total_count: string | number;
  sleeping_count: string | number;
}

export interface RoomPublicationSummary {
  roomId: number;
  roomName: string;
  roomType: string;
  approvedPhotosCount: number;
  sleepingAreaPhotosCount: number;
  isCompliant: boolean;
}

export interface PublicationValidationResult {
  valid: boolean;
  errors: string[];
  roomSummaries: RoomPublicationSummary[];
}

export interface QueryResultLike<R extends QueryResultRow = QueryResultRow> {
  rows: R[];
}

export interface QueryablePort {
  query<R extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: readonly unknown[] | unknown[]
  ): Promise<QueryResultLike<R>>;
}

export type Queryable = Pool | PoolClient | QueryablePort;

/**
 * Phase 3 Milestone 3 / Founder Gate PROPOSED-007 Validator:
 * A property cannot be published if any bookable room type has fewer than 3 approved,
 * room-specific photos. At least 1 approved photo per room must be explicitly classified
 * as showing the sleeping area (is_sleeping_area = true).
 * Every bookable room type must also have an authoritative positive nightly price (base_price > 0).
 * Unassigned property-wide media (room_type_id IS NULL) cannot count toward a room's minimum,
 * while a common-tier asset explicitly bound and approved/reapproved to a room (room_type_id = room.id) can.
 * Canonical room association is an explicitly reviewed room_type_id plus approved status;
 * tier is legacy/display metadata, not publication authority.
 *
 * Strict Room-Specific Predicate:
 * - Must belong to entity_type = 'listing' and matching entity_id
 * - Must be linked to the specific room_type_id
 * - Must have moderation_status = 'approved'
 * - Must have base_price > 0
 */
export async function validatePropertyPublication(
  listingId: number | string,
  clientOrPool: QueryablePort
): Promise<PublicationValidationResult> {
  const numId = parseInt(String(listingId), 10);
  if (isNaN(numId)) {
    return { valid: false, errors: ['Invalid listing ID'], roomSummaries: [] };
  }

  // 1. Fetch relational room types for the listing
  const roomsRes = await clientOrPool.query<RoomTypeRow>(
    'SELECT id, name, type, base_price FROM room_types WHERE listing_id = $1 ORDER BY id ASC',
    [numId]
  );

  if (roomsRes.rows.length === 0) {
    return {
      valid: false,
      errors: ['Property must have at least one room type defined before publication.'],
      roomSummaries: []
    };
  }

  const errors: string[] = [];
  const roomSummaries: RoomPublicationSummary[] = [];

  // 2. Validate each room type has >= 3 approved room-specific photos with >= 1 sleeping area photo,
  // and a positive sellable nightly price.
  // Unassigned media (room_type_id IS NULL) is strictly excluded. Common-tier media explicitly bound
  // to this room_type_id is fully valid.
  for (const rt of roomsRes.rows) {
    const basePrice = Number(rt.base_price);
    const hasPositivePrice = Number.isFinite(basePrice) && !isNaN(basePrice) && basePrice > 0;
    if (!hasPositivePrice) {
      errors.push(
        `Room type "${rt.name || rt.type}" has an invalid nightly price (₹${rt.base_price ?? 0}). A positive nightly price is required for publication.`
      );
    }

    const mediaRes = await clientOrPool.query<MediaCountRow>(
      `SELECT COUNT(*) as total_count,
              COUNT(CASE WHEN is_sleeping_area = true THEN 1 END) as sleeping_count
       FROM media_assets
       WHERE entity_type = 'listing'
         AND entity_id = $1
         AND room_type_id = $2
         AND moderation_status = 'approved'`,
      [numId, rt.id]
    );

    const totalCount = parseInt(String(mediaRes.rows[0]?.total_count ?? 0), 10);
    const sleepingCount = parseInt(String(mediaRes.rows[0]?.sleeping_count ?? 0), 10);

    roomSummaries.push({
      roomId: rt.id,
      roomName: rt.name,
      roomType: rt.type,
      approvedPhotosCount: totalCount,
      sleepingAreaPhotosCount: sleepingCount,
      isCompliant: totalCount >= 3 && sleepingCount >= 1 && hasPositivePrice
    });

    if (totalCount < 3) {
      errors.push(
        `Room type "${rt.name || rt.type}" has only ${totalCount} approved photo(s). Minimum 3 approved room-specific photos are required for publication.`
      );
    }
    if (sleepingCount < 1) {
      errors.push(
        `Room type "${rt.name || rt.type}" must have at least 1 approved photo showing the sleeping area.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    roomSummaries
  };
}
