import { Router, type RequestHandler } from 'express';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Pool, PoolClient } from 'pg';
import { assertRoomIdentity } from './roomIdentity.js';
import { validInventorySource } from '../../lib/inventorySource.js';

// Fixed mapping: request keys are never interpolated into SQL identifiers.
export const propertyListingFields: Record<string, string> = {
  title: 'title', description: 'description', price: 'price', type: 'type', address: 'address', city: 'city',
  imageUrl: 'image_url', imageUrls: 'image_urls', videoUrl: 'video_url', rentalMode: 'rental_mode',
  rooms: 'rooms', photos: 'photos', maxGuests: 'max_guests', bedrooms: 'bedrooms', beds: 'beds', bathrooms: 'bathrooms',
  amenities: 'amenities', lat: 'lat', lng: 'lng', dynamicPricing: 'dynamic_pricing',
  seo_title: 'seo_title', seo_description: 'seo_description', seo_keywords: 'seo_keywords', seo_image_url: 'seo_image_url',
  amenity_clusters: 'amenity_clusters', child_safety_specs: 'child_safety_specs', nearby: 'nearby',
  hero_video_url: 'hero_video_url', hero_fallback_url: 'hero_fallback_url', dominant_color_hex: 'dominant_color_hex',
  raw_rules: 'raw_rules', curated_guidelines: 'curated_guidelines', experience_tags: 'experience_tags',
  concierge_privileges: 'concierge_privileges', host_philosophy: 'host_philosophy',
};
const fields = propertyListingFields;
class ReviewError extends Error { constructor(public status: number, message: string) { super(message); } }
export const propertyReviewVersion = (row: any) => createHash('sha256').update(JSON.stringify([row.id, row.updated_at, row.draft_data])).digest('hex');
const present = (row: any) => ({ ...row, version: propertyReviewVersion(row) });
const validId = (id: unknown) => /^[1-9]\d*$/.test(String(id));
const publishedVersion = (listing: any) => createHash('sha256').update(JSON.stringify(Object.values(fields).map(column => [column, listing[column] ?? null]))).digest('hex');

export function createPropertyReviewRouter({ pool, authenticate, enabled, onPublished }: { pool: Pool; authenticate: RequestHandler; enabled: () => boolean; onPublished?: (listingId: number) => Promise<void> }) {
  const router = Router();
  router.use(authenticate);
  router.use((_req, res, next) => enabled() ? next() : res.status(503).json({ error: 'Property review is temporarily unavailable.' }));
  const guard = (run: (req: any, res: any) => Promise<any>): RequestHandler => async (req, res) => {
    try { await run(req, res); } catch (error) {
      console.error('[PROPERTY REVIEW]', error);
      res.status(error instanceof ReviewError ? error.status : 503).json({ error: error instanceof ReviewError ? error.message : 'Unable to complete property review. Please retry.' });
    }
  };
  async function tx<T>(run: (client: PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await run(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const admin = (req: any) => { if (req.user?.role !== 'admin') throw new ReviewError(403, 'Admin access required.'); };
  async function audit(client: PoolClient, req: any, id: number, action: string, before: any, after: any) {
    await client.query('INSERT INTO admin_audit_logs (admin_id,entity_type,entity_id,action,previous_state,new_state,ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.id, 'listing_draft', id, action, JSON.stringify(before), JSON.stringify(after), req.ip]);
  }
  router.get('/', guard(async (req, res) => {
    const isAdmin = req.query.scope === 'admin';
    if (isAdmin) admin(req);
    const before = req.query.before;
    if (before !== undefined && (typeof before !== 'string' || !validId(before) || before.length > 19 || BigInt(before) > 9223372036854775807n)) throw new ReviewError(400, 'Invalid pagination cursor.');
    const values: unknown[] = isAdmin ? [] : [req.user.id];
    let predicate = isAdmin ? "d.status='PENDING_REVIEW'" : 'd.host_id=$1';
    if (before !== undefined) { values.push(before); predicate += ` AND d.id<$${values.length}`; }
    const rows = await pool.query(`SELECT d.*, row_to_json(l) AS published_listing, (SELECT a.new_state->>'note' FROM admin_audit_logs a WHERE a.entity_type='listing_draft' AND a.entity_id=d.id AND a.action='PROPERTY_CHANGES_REQUESTED' ORDER BY a.id DESC LIMIT 1) AS review_note FROM listings_drafts d LEFT JOIN listings l ON l.id=d.published_listing_id AND l.user_id=d.host_id WHERE ${predicate} ORDER BY d.id DESC LIMIT 101`, values);
    const page = rows.rows.slice(0, 100);
    res.json({ submissions: page.map(present), limit: 100, nextCursor: rows.rows.length > 100 ? String(page[99].id) : null });
  }));
  router.post('/', guard(async (req, res) => {
    const input = req.body;
    if (!input || typeof input !== 'object') throw new ReviewError(400, 'Property details are required.');
    if (input.intent != null && !['draft', 'submit'].includes(input.intent)) throw new ReviewError(400, 'Invalid save action.');
    const state = input.intent === 'draft' ? 'DRAFT' : 'PENDING_REVIEW';
    if (state === 'PENDING_REVIEW') {
    for (const key of ['title', 'city', 'type', 'address']) if (typeof input[key] !== 'string' || !input[key].trim()) throw new ReviewError(400, `Enter the property ${key}.`);
    if (input.title.trim().length < 10 || !Number.isFinite(input.price) || input.price <= 0) throw new ReviewError(400, 'Enter a descriptive title and valid nightly price.');
    if (!Array.isArray(input.rooms) || !input.rooms.length || input.rooms.some((r: any) => !r || typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || !r.name.trim() || !Number.isFinite(r.price) || r.price <= 0 || !Number.isInteger(r.capacity) || r.capacity < 1 || !Number.isInteger(r.inventory_count) || r.inventory_count < 0)) throw new ReviewError(400, 'Every room needs a unique ID, name, price, capacity and inventory.');
    if (new Set(input.rooms.map((r: any) => r.id)).size !== input.rooms.length) throw new ReviewError(400, 'Room IDs must be unique.');
    if (input.rooms.some((room: any) => !validInventorySource(room.inventory_source))) throw new ReviewError(400, 'Select a supported inventory source for each room.');
    const durableMedia = (value: unknown) => typeof value === 'string' && /^(https?:\/\/|\/uploads\/)/.test(value);
    if (!Array.isArray(input.photos) || !input.photos.length || input.photos.some((photo: any) => !durableMedia(photo?.url)) || !durableMedia(input.imageUrl)) throw new ReviewError(400, 'Upload property photos and select a cover image before submitting.');
    if (input.photos.some((photo: any) => ['title', 'category', 'tier', 'description', 'specs'].some(key => photo[key] != null && typeof photo[key] !== 'string'))) throw new ReviewError(400, 'Photo labels and descriptions must be text.');
    }
    if (input.draftId != null && (!validId(input.draftId) || typeof input.version !== 'string')) throw new ReviewError(400, 'A draft reference and saved version are required.');
    if (input.published_listing_id != null && !validId(input.published_listing_id)) throw new ReviewError(400, 'Invalid property reference.');
    const data = Object.fromEntries(Object.keys(fields).filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
    const submission = await tx(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`property-owner:${req.user.id}`]);
      const target = input.published_listing_id ?? null;
      let baseVersion: string | null = null;
      if (target) {
        const listing = await client.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [target]);
        if (String(listing.rows[0]?.user_id) !== String(req.user.id)) throw new ReviewError(404, 'Property not found.');
        baseVersion = publishedVersion(listing.rows[0]);
      }
      // Stable request key is stored inside the immutable submitted JSON snapshot.
      const key = req.get('X-Idempotency-Key');
      if (!key || !/^[\w-]{16,100}$/.test(key)) throw new ReviewError(400, 'A submission attempt key is required.');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`property:${req.user.id}:${key}`]);
      const prior = await client.query("SELECT * FROM listings_drafts WHERE host_id=$1 AND draft_data->>'_submissionKey'=$2", [req.user.id, key]);
      const snapshot = { ...data, _submissionKey: key, _targetListingId: target, _intent: input.intent || 'submit', _publishedVersion: baseVersion };
      if (prior.rows[0]) {
        if (!isDeepStrictEqual({ ...prior.rows[0].draft_data, _publishedVersion: baseVersion }, snapshot)) throw new ReviewError(409, 'This attempt contains different property details.');
        return prior.rows[0];
      }
      if (target && state === 'PENDING_REVIEW') {
        const pending = await client.query("SELECT * FROM listings_drafts WHERE host_id=$1 AND published_listing_id=$2 AND status='PENDING_REVIEW'", [req.user.id, target]);
        if (pending.rows[0]) throw new ReviewError(409, 'This property already has a submission awaiting review.');
      }
      let result;
      let previousVersion: unknown = null;
      if (input.draftId) {
        const previous = (await client.query('SELECT * FROM listings_drafts WHERE id=$1 AND host_id=$2 FOR UPDATE', [input.draftId, req.user.id])).rows[0];
        if (!previous || previous.host_id !== req.user.id) throw new ReviewError(404, 'Draft not found.');
        if (!['DRAFT', 'CHANGES_REQUESTED'].includes(previous.status) || propertyReviewVersion(previous) !== input.version) throw new ReviewError(409, 'This draft changed or is already submitted. Refresh before editing.');
        if (String(previous.published_listing_id ?? '') !== String(target ?? '')) throw new ReviewError(409, 'The draft belongs to a different property.');
        previousVersion = { status: previous.status, version: propertyReviewVersion(previous), draft_data: previous.draft_data };
        result = await client.query('UPDATE listings_drafts SET draft_data=$1,status=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND host_id=$4 RETURNING *', [JSON.stringify(snapshot), state, input.draftId, req.user.id]);
      } else {
        result = await client.query('INSERT INTO listings_drafts (host_id,published_listing_id,status,draft_data) VALUES ($1,$2,$3,$4) RETURNING *', [req.user.id, target, state, JSON.stringify(snapshot)]);
      }
      await audit(client, req, result.rows[0].id, state === 'DRAFT' ? 'PROPERTY_DRAFT_SAVED' : 'PROPERTY_SUBMITTED', previousVersion, { status: state, version: propertyReviewVersion(result.rows[0]), draft_data: snapshot });
      return result.rows[0];
    });
    res.json({ submission: present(submission) });
  }));
  router.post('/:id/decision', guard(async (req, res) => {
    admin(req);
    if (!validId(req.params.id) || !['approve', 'reject'].includes(req.body.decision) || typeof req.body.version !== 'string') throw new ReviewError(400, 'A valid review decision and version are required.');
    const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
    if (req.body.decision === 'reject' && (!note || note.length > 2000)) throw new ReviewError(400, 'Explain the requested changes (maximum 2,000 characters).');
    const result = await tx(async client => {
      const owner = (await client.query('SELECT host_id FROM listings_drafts WHERE id=$1', [req.params.id])).rows[0];
      if (!owner) throw new ReviewError(404, 'Submission not found.');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`property-owner:${owner.host_id}`]);
      const draft = (await client.query('SELECT * FROM listings_drafts WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!draft) throw new ReviewError(404, 'Submission not found.');
      if (propertyReviewVersion(draft) !== req.body.version) throw new ReviewError(409, 'The submission changed. Refresh and review it again.');
      const finalState = req.body.decision === 'approve' ? 'PUBLISHED' : 'CHANGES_REQUESTED';
      if (draft.status === finalState) return draft;
      if (draft.status !== 'PENDING_REVIEW') throw new ReviewError(409, 'This submission is not awaiting review.');
      if (!draft.draft_data?._submissionKey) throw new ReviewError(409, 'This legacy submission must be resubmitted through the current review workflow.');
      let listingId = draft.published_listing_id;
      if (finalState === 'PUBLISHED') {
        const entries = Object.entries(fields).filter(([key]) => Object.hasOwn(draft.draft_data, key));
        const values = entries.map(([key]) => { const v = draft.draft_data[key]; return v != null && typeof v === 'object' ? JSON.stringify(v) : v; });
        if (listingId) {
          const current = (await client.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [listingId])).rows[0];
          if (!current || current.user_id !== draft.host_id || publishedVersion(current) !== draft.draft_data._publishedVersion) throw new ReviewError(409, 'The published property changed after submission. Request an updated submission before approving.');
          try { await assertRoomIdentity(client, current, draft.draft_data.rooms); }
          catch (error) { if (error instanceof Error && error.message.startsWith('Existing room IDs')) throw new ReviewError(409, error.message); throw error; }
          const updated = await client.query(`UPDATE listings SET ${entries.map(([, column], i) => `${column}=$${i + 1}`).join(',')} WHERE id=$${values.length + 1} AND user_id=$${values.length + 2} RETURNING id`, [...values, listingId, draft.host_id]);
          if (!updated.rows[0]) throw new ReviewError(409, 'Property ownership changed. Review cannot publish.');
        } else {
          const created = await client.query(`INSERT INTO listings (user_id,${entries.map(([, column]) => column).join(',')}) VALUES ($1,${values.map((_, i) => `$${i + 2}`).join(',')}) RETURNING id`, [draft.host_id, ...values]);
          listingId = created.rows[0].id;
        }
        // Listing JSON is canonical for guest/checkout consumers. Remove obsolete
        // media fallback projections when a reviewed version replaces its assets.
        await client.query("DELETE FROM media_assets WHERE entity_type='listing' AND entity_id=$1", [listingId]);
        for (const [index, photo] of (draft.draft_data.photos || []).entries()) {
          await client.query('INSERT INTO media_assets (entity_type,entity_id,url,tier,category,title,description,specs,is_hero,order_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', ['listing', listingId, photo.url, photo.tier || 'common', photo.category || 'other', photo.title || '', photo.description || '', photo.specs || '', Boolean(photo.isHero), index]);
        }
      }
      const saved = await client.query('UPDATE listings_drafts SET status=$1,published_listing_id=$2 WHERE id=$3 RETURNING *', [finalState, listingId, draft.id]);
      await audit(client, req, draft.id, `PROPERTY_${finalState}`, { status: draft.status, version: req.body.version }, { status: finalState, listingId, note });
      return saved.rows[0];
    });
    if (result.status === 'PUBLISHED' && result.published_listing_id && onPublished) {
      void onPublished(result.published_listing_id).catch(error => console.error('[PROPERTY REVIEW POST-COMMIT]', error));
    }
    res.json({ submission: present(result) });
  }));
  return router;
}
