import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

class DeletionError extends Error { constructor(public status: number, message: string) { super(message); } }
// Fixed schema-owned identifiers only; never interpolate user-supplied table names.
const references = ['bookings', 'threads', 'messages', 'reviews', 'wishlists', 'calendar_prices', 'host_marketing_campaigns', 'soft_exit_leads', 'host_social_posts'];

export function createPropertyDeletionHandler({ pool, enabled, afterDelete }: {
  pool: Pool; enabled: () => boolean; afterDelete?: (req: any, listing: any) => void;
}): RequestHandler {
  return async (req: any, res) => {
    let client;
    let listing;
    try {
      if (!enabled()) throw new DeletionError(503, 'Property removal is temporarily unavailable.');
      if (!/^[1-9]\d{0,9}$/.test(String(req.params.id)) || Number(req.params.id) > 2147483647) throw new DeletionError(400, 'Invalid property reference.');
      client = await pool.connect();
      await client.query('BEGIN');
      listing = (await client.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!listing) throw new DeletionError(404, 'Property not found.');
      if (!req.user?.id || String(listing.user_id) !== String(req.user.id) && req.user.role !== 'admin') throw new DeletionError(403, 'You do not have permission to remove this property.');
      const history = await client.query(`SELECT EXISTS (${references.map(table => `SELECT 1 FROM ${table} WHERE listing_id=$1`).join(' UNION ALL ')} UNION ALL SELECT 1 FROM listings_drafts WHERE published_listing_id=$1) AS present`, [req.params.id]);
      if (history.rows[0]?.present !== false) throw new DeletionError(409, 'This property has linked history and cannot be permanently deleted. Its bookings, reviews, messages and marketing records must be retained.');
      // Checkout migration is deliberately not applied by server boot.
      const checkout = await client.query("SELECT to_regclass('public.stay_checkout_orders') AS relation");
      if (checkout.rows[0]?.relation) {
        const orders = await client.query('SELECT 1 FROM stay_checkout_orders WHERE listing_id=$1 LIMIT 1', [req.params.id]);
        if (orders.rows.length) throw new DeletionError(409, 'This property has checkout history and cannot be permanently deleted.');
      }
      const rooms = await client.query('SELECT * FROM room_types WHERE listing_id=$1', [req.params.id]);
      const media = await client.query("SELECT * FROM media_assets WHERE entity_type='listing' AND entity_id=$1", [req.params.id]);
      await client.query('INSERT INTO admin_audit_logs (admin_id,entity_type,entity_id,action,previous_state,new_state,ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7)', [req.user.id, 'listing', req.params.id, 'PROPERTY_DELETED', JSON.stringify({ listing, rooms: rooms.rows, media: media.rows }), JSON.stringify({ deleted: true }), req.ip]);
      await client.query("DELETE FROM media_assets WHERE entity_type='listing' AND entity_id=$1", [req.params.id]);
      await client.query('DELETE FROM listings WHERE id=$1', [req.params.id]);
      await client.query('COMMIT');
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(rollbackError => console.error('[PROPERTY DELETE ROLLBACK]', rollbackError));
      console.error('[PROPERTY DELETE]', error);
      res.status(error instanceof DeletionError ? error.status : 503).json({ error: error instanceof DeletionError ? error.message : 'Property removal could not be completed. Please retry.' });
      return;
    } finally { client?.release(); }
    try { afterDelete?.(req, listing); } catch (error) { console.error('[PROPERTY DELETE POST-COMMIT]', error); }
    res.json({ message: 'Unused property deleted; audit snapshot retained.', deletedListing: listing });
  };
}
