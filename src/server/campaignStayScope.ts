import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { dateDay } from '../../lib/stayQuote.js';
import { projectCampaignAvailability } from './campaignAvailability.js';

export const scopeVersion = (scope: unknown) => createHash('sha256').update(JSON.stringify(scope ?? null)).digest('hex');
export const canEditStayScope = (campaign: any) => ['draft', 'draft_saved', 'rejected'].includes(campaign.status) && !campaign.admin_approved && !campaign.meta_campaign_id && !campaign.google_campaign_id && !campaign.meta_adset_id && !campaign.meta_ad_id && !['ACTIVE', 'PAUSED'].includes(campaign.meta_effective_status);
export function validateStayScope(value: any, rooms: any[]) {
  const start = dateDay(value?.checkIn), end = dateDay(value?.checkOut);
  if (end <= start || end - start > 365 || !Array.isArray(value.roomIds) || !value.roomIds.length || value.roomIds.length > 100) throw new Error('Select a stay of 1–365 nights and at least one room.');
  const ids = value.roomIds;
  if (ids.some((id: unknown) => typeof id !== 'string' || !id.trim() || id.includes(',') || !rooms.some(room => String(room.id) === id)) || new Set(ids).size !== ids.length) throw new Error('Select unique rooms belonging to this property.');
  return { checkIn: value.checkIn, checkOut: value.checkOut, roomIds: [...ids].sort() };
}
export function createCampaignStayScopeRouter(deps: { pool: Pool; authenticate: RequestHandler; enabled: () => boolean }) {
  const router = Router(); router.use(deps.authenticate);
  router.use((_req, res, next) => deps.enabled() ? next() : res.status(503).json({ error: 'Campaign stay-date setup awaits its verified schema rollout.' }));
  const handle = (write: boolean): RequestHandler => async (req: any, res) => {
    let client;
    try {
      if (!/^[1-9]\d{0,9}$/.test(req.params.id)) return void res.status(400).json({ error: 'Invalid campaign reference.' });
      client = await deps.pool.connect(); await client.query('BEGIN');
      const campaign = (await client.query('SELECT * FROM host_marketing_campaigns WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!campaign || String(campaign.host_id) !== String(req.user.id) && req.user.role !== 'admin') { await client.query('ROLLBACK'); return void res.status(404).json({ error: 'Campaign not found.' }); }
      const listing = (await client.query('SELECT id, user_id, rooms FROM listings WHERE id=$1 FOR UPDATE', [campaign.listing_id])).rows[0];
      if (!listing || String(listing.user_id) !== String(campaign.host_id)) throw new Error('Property ownership requires review.');
      const rooms: any[] = Array.isArray(listing.rooms) ? listing.rooms : [];
      let scope = campaign.stay_scope ?? null;
      if (write) {
        if (!canEditStayScope(campaign)) { await client.query('ROLLBACK'); return void res.status(409).json({ error: 'Only unapproved drafts without provider objects can change stay dates. Submit a new reviewed proposal for other campaigns.' }); }
        if (req.body.version !== scopeVersion(scope)) { await client.query('ROLLBACK'); return void res.status(409).json({ error: 'Stay scope changed. Refresh before saving.' }); }
        try { scope = validateStayScope(req.body.scope, rooms); }
        catch (error) { await client.query('ROLLBACK'); return void res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid stay scope.' }); }
        await client.query('UPDATE host_marketing_campaigns SET stay_scope=$1, policy_cleared=false, policy_cleared_at=NULL, approval_hash=NULL, approval_snapshot=NULL WHERE id=$2', [JSON.stringify(scope), campaign.id]);
        await client.query('INSERT INTO admin_audit_logs (admin_id,entity_type,entity_id,action,previous_state,new_state,ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7)', [req.user.id, 'marketing_campaign', campaign.id, 'CAMPAIGN_STAY_SCOPE_SAVED', JSON.stringify(campaign.stay_scope ?? null), JSON.stringify(scope), req.ip]);
      }
      const availability = await projectCampaignAvailability(client, listing, scope);
      await client.query('COMMIT');
      res.json({ scope, version: scopeVersion(scope), rooms: rooms.map(room => ({ id: String(room.id), name: room.name })), editable: canEditStayScope(campaign), externalAvailability: 'unknown', availability });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(e => console.error('[STAY SCOPE ROLLBACK]', e));
      console.error('[CAMPAIGN STAY SCOPE]', error); res.status(503).json({ error: 'Campaign stay scope could not be processed.' });
    } finally { client?.release(); }
  };
  router.get('/:id', handle(false)); router.put('/:id', handle(true)); return router;
}
