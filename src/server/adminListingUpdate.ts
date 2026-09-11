import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { propertyListingFields } from './propertyReview.js';
import { assertRoomIdentity } from './roomIdentity.js';
import { validInventorySource } from '../../lib/inventorySource.js';

class UpdateError extends Error { constructor(public status: number, message: string) { super(message); } }
const jsonFields = new Set(['rooms', 'photos', 'amenities', 'imageUrls', 'dynamicPricing', 'amenity_clusters', 'child_safety_specs', 'nearby', 'experience_tags']);
const arrayFields = new Set(['rooms', 'photos', 'amenities', 'imageUrls', 'child_safety_specs', 'nearby', 'experience_tags']);
const numberFields = new Set(['price', 'maxGuests', 'bedrooms', 'beds', 'bathrooms', 'lat', 'lng']);

export function createAdminListingUpdateHandler(deps: {
  pool: Pool; enabled: () => boolean;
  afterUpdate?: (previous: any, updated: any) => Promise<void>;
}): RequestHandler {
  return async (req: any, res) => {
    let client;
    let previous: any;
    let updated: any;
    try {
      if (req.user?.role !== 'admin') throw new UpdateError(403, 'Admin access required. Submit property changes through the review workflow.');
      if (!deps.enabled()) throw new UpdateError(503, 'Property editing is temporarily unavailable.');
      if (!/^[1-9]\d*$/.test(String(req.params.id))) throw new UpdateError(400, 'Invalid property reference.');
      const entries = Object.entries(propertyListingFields).filter(([key]) => Object.hasOwn(req.body || {}, key)).map(([key, column]) => {
        let value = req.body[key];
        if (jsonFields.has(key) && typeof value === 'string') {
          try { value = JSON.parse(value); } catch { throw new UpdateError(400, `Invalid ${key} data.`); }
        }
        if (arrayFields.has(key) && !Array.isArray(value)) throw new UpdateError(400, `${key} must be a list.`);
        if (numberFields.has(key) && value != null) {
          if (!['string', 'number'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) throw new UpdateError(400, `Enter a valid ${key}.`);
          value = Number(value);
          if (key === 'price' && value <= 0 || ['maxGuests', 'bedrooms', 'beds', 'bathrooms'].includes(key) && value < 0 || key === 'lat' && Math.abs(value) > 90 || key === 'lng' && Math.abs(value) > 180) throw new UpdateError(400, `Enter a valid ${key}.`);
        }
        if (['title', 'type', 'address', 'city'].includes(key) && (typeof value !== 'string' || !value.trim())) throw new UpdateError(400, `Enter the property ${key}.`);
        if (key === 'price' && value == null) throw new UpdateError(400, 'A nightly price is required.');
        if (key === 'rooms') {
          if (!value.length || value.some((room: any) => !room || room.id == null || typeof room.name !== 'string' || !room.name.trim() || !Number.isFinite(Number(room.price)) || Number(room.price) <= 0 || !Number.isInteger(Number(room.capacity)) || Number(room.capacity) < 1 || room.inventory_count == null || !Number.isInteger(Number(room.inventory_count)) || Number(room.inventory_count) < 0)) throw new UpdateError(400, 'Each room needs its ID, name, price, capacity and inventory.');
          if (new Set(value.map((room: any) => String(room.id))).size !== value.length) throw new UpdateError(400, 'Room IDs must be unique.');
          if (value.some((room: any) => !validInventorySource(room.inventory_source))) throw new UpdateError(400, 'Select a supported inventory source for each room.');
        }
        return { key, column, value };
      });
      if (!entries.length) throw new UpdateError(400, 'No supported property changes were supplied.');
      client = await deps.pool.connect();
      await client.query('BEGIN');
      previous = (await client.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!previous) throw new UpdateError(404, 'Property not found.');
      const suppliedRooms = entries.find(entry => entry.key === 'rooms')?.value;
      if (suppliedRooms) {
        try { await assertRoomIdentity(client, previous, suppliedRooms); }
        catch (error) { if (error instanceof Error && error.message.startsWith('Existing room IDs')) throw new UpdateError(409, error.message); throw error; }
      }
      const values = entries.map(({ value }) => value != null && typeof value === 'object' ? JSON.stringify(value) : value);
      updated = (await client.query(`UPDATE listings SET ${entries.map(({ column }, i) => `${column}=$${i + 1}`).join(',')} WHERE id=$${values.length + 1} RETURNING *`, [...values, req.params.id])).rows[0];
      if (!updated) throw new UpdateError(409, 'The property changed. Refresh before editing.');
      // Canonical JSON preserves room IDs; retain legacy rows and their media links.
      const photos = entries.find(entry => entry.key === 'photos')?.value;
      if (photos) {
        await client.query("DELETE FROM media_assets WHERE entity_type='listing' AND entity_id=$1", [req.params.id]);
        for (const [index, photo] of photos.entries()) {
          const url = photo?.url || photo?.previewUrl;
          if (typeof url !== 'string' || !/^(https?:\/\/|\/uploads\/)/.test(url)) throw new UpdateError(400, 'Upload photos before saving the property.');
          await client.query('INSERT INTO media_assets (entity_type,entity_id,url,tier,category,title,description,specs,is_hero,order_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', ['listing', req.params.id, url, photo.tier || 'common', photo.category || 'other', photo.title || '', photo.description || '', photo.specs || '', Boolean(photo.isHero), index]);
        }
      }
      await client.query('INSERT INTO admin_audit_logs (admin_id,entity_type,entity_id,action,previous_state,new_state,ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7)', [req.user.id, 'listing', req.params.id, 'ADMIN_PROPERTY_UPDATED', JSON.stringify(previous), JSON.stringify(updated), req.ip]);
      await client.query('COMMIT');
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch((rollbackError: unknown) => console.error('[ADMIN LISTING ROLLBACK]', rollbackError));
      console.error('[ADMIN LISTING UPDATE]', error);
      res.status(error instanceof UpdateError ? error.status : 503).json({ error: error instanceof UpdateError ? error.message : 'Property changes could not be saved. Please retry.' });
      return;
    } finally { client?.release(); }
    if (deps.afterUpdate) void deps.afterUpdate(previous, updated).catch(error => console.error('[ADMIN LISTING POST-COMMIT]', updated.id, error));
    res.json({ message: 'Listing updated successfully', providerSync: 'unverified' });
  };
}
