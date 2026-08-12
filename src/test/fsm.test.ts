import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { transitionCampaignState, CampaignState } from '../../server.ts';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('Phase 2.2 Central Campaign State Machine', () => {
  let testCampaignId: number;

  beforeAll(async () => {
    // Insert a dummy campaign for testing
    const res = await pool.query(
      "INSERT INTO host_marketing_campaigns (host_id, status, title, budget) VALUES (1, 'draft', 'Test FSM', 100) RETURNING id"
    );
    testCampaignId = res.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query("DELETE FROM meta_publishing_events WHERE campaign_id = $1", [testCampaignId]);
    await pool.query("DELETE FROM host_marketing_campaigns WHERE id = $1", [testCampaignId]);
    await pool.end();
  });

  it('allows valid transition from draft to pending_approval', async () => {
    const newState = await transitionCampaignState({
      campaignId: testCampaignId,
      to: 'pending_approval',
      reason: 'test valid transition',
      actorType: 'system'
    });
    expect(newState).toBe('pending_approval');
    
    const dbCheck = await pool.query("SELECT status FROM host_marketing_campaigns WHERE id = $1", [testCampaignId]);
    expect(dbCheck.rows[0].status).toBe('pending_approval');
  });

  it('rejects illegal transition from pending_approval to draft', async () => {
    await expect(transitionCampaignState({
      campaignId: testCampaignId,
      to: 'draft' as CampaignState,
      reason: 'illegal transition',
      actorType: 'system'
    })).rejects.toThrow(/Illegal transition/);
    
    // DB should remain pending_approval
    const dbCheck = await pool.query("SELECT status FROM host_marketing_campaigns WHERE id = $1", [testCampaignId]);
    expect(dbCheck.rows[0].status).toBe('pending_approval');
  });

  it('allows admin to override illegal transitions', async () => {
    const newState = await transitionCampaignState({
      campaignId: testCampaignId,
      to: 'draft' as CampaignState,
      reason: 'admin override',
      actorType: 'admin'
    });
    expect(newState).toBe('draft');
  });

  it('logs transition in event ledger', async () => {
    const events = await pool.query("SELECT * FROM meta_publishing_events WHERE campaign_id = $1", [testCampaignId]);
    expect(events.rows.length).toBeGreaterThan(0);
    // the last event should be pending_approval -> draft
    const lastEvent = events.rows[events.rows.length - 1];
    expect(lastEvent.from_state).toBe('pending_approval');
    expect(lastEvent.to_state).toBe('draft');
    expect(lastEvent.actor_type).toBe('admin');
  });
});
