import type { Pool, PoolClient } from 'pg';
import { isSafeAdminImageUrl } from '../../lib/mediaUrlSafety.js';
import { validatePropertyPublication } from '../listings/publicationValidation.js';

export interface ModerateMediaAssetCommand {
  assetId: number;
  adminId: number;
  moderation_status?: 'pending_review' | 'approved' | 'rejected';
  is_sleeping_area?: boolean;
  room_type_id?: number | null;
  ipAddress?: string | null;
}

export type ModerateMediaAssetResult =
  | { success: true; assetId: number }
  | { success: false; status: 400 | 403 | 404 | 409 | 422; error: string };

const ALLOWED_STATUSES = ['pending_review', 'approved', 'rejected'] as const;

/**
 * Executes media asset moderation and audit log insertion in a single atomic database transaction.
 * Guarantees that if either the asset update or the audit log write fails, the entire transaction
 * rolls back and leaves media_assets unmodified.
 *
 * Invariants & Concurrency Protocol:
 * 1. assetId must be a positive safe integer (1 to 2147483647).
 * 2. adminId must be a positive safe integer (1 to 2147483647), never null or audited as null.
 * 3. is_sleeping_area, if provided, must be strictly a boolean (no type coercion).
 * 4. room_type_id, if provided, must be a positive safe integer (1 to 2147483647) or null (no type coercion).
 * 5. Parent-First Lock Hierarchy: preliminary unlocked asset identity read, then lock parent `listings`
 *    row FOR UPDATE before acquiring child locks on `media_assets` and `room_types`.
 * 6. Concurrency Check: re-read locked `media_assets` and verify entity_type and entity_id did not mutate.
 * 7. Entity Boundary: non-listing media assets cannot be associated with rooms, marked as sleeping areas,
 *    or approved as listing-room media.
 * 8. Listing media assets can only be associated with room types belonging to the same listing.
 * 9. When room binding or sleeping area claim changes on an approved photo, status automatically resets
 *    to pending_review unless atomic reapproval is explicitly requested.
 * 10. INTERIM Publication Containment Policy: If the listing is currently 'published', the moderation mutation
 *     may commit ONLY IF same-transaction validatePropertyPublication remains valid. Otherwise rollback and
 *     return actionable HTTP 422 instructing staff to unpublish the listing first.
 * 11. All operations execute on a single held connection and commit or rollback atomically.
 */
export async function moderateMediaAsset(
  poolOrClient: Pool | PoolClient,
  cmd: ModerateMediaAssetCommand
): Promise<ModerateMediaAssetResult> {
  const { assetId, adminId, moderation_status, is_sleeping_area, room_type_id, ipAddress } = cmd;

  // 1. Independent parameter validation
  if (typeof assetId !== 'number' || !Number.isSafeInteger(assetId) || assetId <= 0 || assetId > 2147483647) {
    return { success: false, status: 400, error: 'Invalid asset ID: must be a positive integer' };
  }

  if (typeof adminId !== 'number' || !Number.isSafeInteger(adminId) || adminId <= 0 || adminId > 2147483647) {
    return { success: false, status: 400, error: 'Invalid admin ID: must be a positive integer' };
  }

  if (moderation_status !== undefined && !ALLOWED_STATUSES.includes(moderation_status)) {
    return {
      success: false,
      status: 400,
      error: `Invalid moderation_status: '${moderation_status}'. Allowed values are: ${ALLOWED_STATUSES.join(', ')}`
    };
  }

  if (is_sleeping_area !== undefined && typeof is_sleeping_area !== 'boolean') {
    return {
      success: false,
      status: 400,
      error: 'Invalid is_sleeping_area: must be a boolean'
    };
  }

  if (room_type_id !== undefined && room_type_id !== null) {
    if (typeof room_type_id !== 'number' || !Number.isSafeInteger(room_type_id) || room_type_id <= 0 || room_type_id > 2147483647) {
      return { success: false, status: 400, error: 'Invalid room_type_id: must be a positive integer or null' };
    }
  }

  if (moderation_status === undefined && is_sleeping_area === undefined && room_type_id === undefined) {
    return { success: false, status: 400, error: 'No fields to update' };
  }

  const isPool = 'connect' in poolOrClient && typeof (poolOrClient as Pool).connect === 'function';
  const client: PoolClient = isPool ? await (poolOrClient as Pool).connect() : (poolOrClient as PoolClient);

  try {
    await client.query('BEGIN');

    // 2. Preliminary unlocked asset identity read
    const prelimRes = await client.query(
      'SELECT id, entity_type, entity_id FROM media_assets WHERE id = $1',
      [assetId]
    );
    if (prelimRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, status: 404, error: 'Media asset not found' };
    }
    const prelimAsset = prelimRes.rows[0];
    const prelimEntityType = String(prelimAsset.entity_type);
    const prelimEntityId = Number(prelimAsset.entity_id);

    // 3. Parent-first lock acquisition: If entity_type === 'listing', lock parent listing FOR UPDATE FIRST
    let parentListing: { id: number; publication_status: string } | null = null;
    if (prelimEntityType === 'listing') {
      const listingRes = await client.query(
        'SELECT id, publication_status FROM listings WHERE id = $1 FOR UPDATE',
        [prelimEntityId]
      );
      if (listingRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, status: 404, error: 'Referenced listing not found' };
      }
      parentListing = {
        id: Number(listingRes.rows[0].id),
        publication_status: String(listingRes.rows[0].publication_status)
      };
    }

    // Keep the actor's persisted role and active status stable until this moderation commits.
    // The middleware's earlier session read alone cannot fence a concurrent revocation.
    const adminRes = await client.query(
      'SELECT id, role, is_active FROM users WHERE id = $1 FOR SHARE',
      [adminId]
    );
    if (adminRes.rows[0]?.role !== 'admin' || adminRes.rows[0]?.is_active !== true) {
      await client.query('ROLLBACK');
      return { success: false, status: 403, error: 'Admin privileges required' };
    }

    // 4. Re-read and lock media_assets row with SELECT ... FOR UPDATE
    const assetRes = await client.query(
      'SELECT id, entity_type, entity_id, url, room_type_id, moderation_status, is_sleeping_area FROM media_assets WHERE id = $1 FOR UPDATE',
      [assetId]
    );
    if (assetRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, status: 404, error: 'Media asset not found' };
    }
    const asset = assetRes.rows[0];

    // Concurrency verification: verify entity identity and binding did not mutate during lock acquisition
    if (String(asset.entity_type) !== prelimEntityType || Number(asset.entity_id) !== prelimEntityId) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 409,
        error: 'Concurrent modification: media asset entity binding changed during lock acquisition'
      };
    }

    const isNonListingAsset = asset.entity_type !== 'listing';

    // 5. Entity boundary: non-listing media assets cannot have room binding or sleeping area designation
    if (isNonListingAsset) {
      if (room_type_id !== undefined && room_type_id !== null) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 422,
          error: 'Cannot assign room to non-listing media asset: only listing media can be associated with room types'
        };
      }
      if (is_sleeping_area === true) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 422,
          error: 'Cannot mark non-listing media asset as sleeping area: only listing media can be a sleeping area'
        };
      }
    }

    const previousState = {
      moderation_status: asset.moderation_status,
      is_sleeping_area: Boolean(asset.is_sleeping_area),
      room_type_id: asset.room_type_id !== null ? Number(asset.room_type_id) : null
    };

    // 6. If room_type_id is provided, lock room_types row with SELECT ... FOR UPDATE and validate same-property ownership
    if (room_type_id !== undefined && room_type_id !== null) {
      const roomRes = await client.query(
        'SELECT id, listing_id FROM room_types WHERE id = $1 FOR UPDATE',
        [room_type_id]
      );
      if (roomRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, status: 422, error: 'Referenced room type does not exist' };
      }
      if (asset.entity_type !== 'listing' || Number(asset.entity_id) !== Number(roomRes.rows[0].listing_id)) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 422,
          error: 'Cross-property room assignment rejected: media asset and room type belong to different listings'
        };
      }
    }

    // 7. Critical boundary: changing room_type_id or is_sleeping_area on an approved photo
    // cannot silently retain approval for a different room/claim.
    // Reset to pending_review or require atomic reapproval of exact binding.
    const targetRoomTypeId =
      room_type_id !== undefined ? room_type_id : previousState.room_type_id;
    const roomTypeChanged = targetRoomTypeId !== previousState.room_type_id;

    const targetIsSleepingArea =
      is_sleeping_area !== undefined ? is_sleeping_area : previousState.is_sleeping_area;
    const sleepingAreaChanged = targetIsSleepingArea !== previousState.is_sleeping_area;

    let targetModerationStatus = moderation_status;
    if (asset.moderation_status === 'approved' && (roomTypeChanged || sleepingAreaChanged)) {
      if (targetModerationStatus === undefined) {
        targetModerationStatus = 'pending_review';
      }
    }

    const finalModerationStatus = targetModerationStatus !== undefined ? targetModerationStatus : asset.moderation_status;

    // Check the locked, persisted URL on every path that leaves an asset approved.
    // The Admin UI's thumbnail guard is not an approval boundary: the API can be called directly.
    if (finalModerationStatus === 'approved' &&
        (typeof asset.url !== 'string' || asset.url.length > 2048 || !isSafeAdminImageUrl(asset.url))) {
      await client.query('ROLLBACK');
      return { success: false, status: 422, error: 'Stored media URL is not eligible for approval' };
    }

    // 8. Invariant: Never approve a non-listing media asset as listing-room media
    if (isNonListingAsset && finalModerationStatus === 'approved') {
      if (targetRoomTypeId !== null || targetIsSleepingArea) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 422,
          error: 'Cannot approve non-listing media asset as listing-room media'
        };
      }
    }

    // 9. Build updates dynamically inside the transaction
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];

    if (targetModerationStatus !== undefined) {
      values.push(targetModerationStatus);
      updates.push(`moderation_status = $${values.length}`);
    }
    if (is_sleeping_area !== undefined) {
      values.push(is_sleeping_area);
      updates.push(`is_sleeping_area = $${values.length}`);
    }
    if (room_type_id !== undefined) {
      values.push(room_type_id);
      updates.push(`room_type_id = $${values.length}`);
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, status: 400, error: 'No fields to update' };
    }

    values.push(assetId);
    await client.query(`UPDATE media_assets SET ${updates.join(', ')} WHERE id = $${values.length}`, values);

    // 10. INTERIM Policy Enforcement:
    // If the media belongs to a listing that is currently 'published', the mutation may commit
    // ONLY IF validatePropertyPublication remains valid in this same transaction.
    // Otherwise ROLLBACK and return actionable HTTP 422 instructing staff to unpublish the listing first.
    if (asset.entity_type === 'listing' && parentListing?.publication_status === 'published') {
      const validation = await validatePropertyPublication(asset.entity_id, client);
      if (!validation.valid) {
        await client.query('ROLLBACK');
        const reason = validation.errors && validation.errors.length > 0
          ? validation.errors.join('; ')
          : 'Room photo criteria violated.';
        return {
          success: false,
          status: 422,
          error: `Cannot modify media on published listing: modification would violate room photo requirements (${reason}). Unpublish listing first.`
        };
      }
    }

    const newState = {
      moderation_status: finalModerationStatus,
      is_sleeping_area: targetIsSleepingArea,
      room_type_id: targetRoomTypeId
    };

    // 11. Immutable Admin Audit Log in the SAME transaction (adminId is guaranteed non-null positive integer)
    await client.query(
      `INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adminId,
        'media_asset',
        assetId,
        'moderate_media_asset',
        JSON.stringify(previousState),
        JSON.stringify(newState),
        ipAddress || null
      ]
    );

    await client.query('COMMIT');
    return { success: true, assetId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (isPool) {
      client.release();
    }
  }
}
