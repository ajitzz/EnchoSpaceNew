import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { transitionCampaignState } from '../../server.ts';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('P0-4 Centralized FSM Bypass Remediation Certification', () => {
  let testCampaignId: number;
  let testUserId: number;

  beforeAll(async () => {
    // Seed user to satisfy host_id foreign key constraint
    const userRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'P04 Test Host')
      RETURNING id
    `, [`p04_host_${Date.now()}@test.com`]);
    testUserId = userRes.rows[0].id;

    // Insert a test campaign in draft state
    const res = await pool.query(
      "INSERT INTO host_marketing_campaigns (host_id, status, title, budget, admin_approved) VALUES ($1, 'draft', 'P0-4 Test Campaign', 200, false) RETURNING id",
      [testUserId]
    );
    testCampaignId = res.rows[0].id;
  });

  afterAll(async () => {
    if (testCampaignId) {
      await pool.query("DELETE FROM meta_publishing_events WHERE campaign_id = $1", [testCampaignId]);
      await pool.query("DELETE FROM host_marketing_campaigns WHERE id = $1", [testCampaignId]);
    }
    if (testUserId) {
      await pool.query("DELETE FROM users WHERE id = $1", [testUserId]);
    }
    await pool.end();
  });

  it('STATIC INVARIANT: Ensures exactly 1 production direct SQL update of status on host_marketing_campaigns inside transitionCampaignState', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const content = fs.readFileSync(serverPath, 'utf8');
    const lines = content.split('\n');

    let currentUpdate: { start: number; lines: string[] } | null = null;
    const matches: { line: number; snippet: string }[] = [];

    lines.forEach((line, i) => {
      if (line.includes('UPDATE host_marketing_campaigns')) {
        currentUpdate = { start: i + 1, lines: [line] };
      } else if (currentUpdate) {
        currentUpdate.lines.push(line);
        if (line.includes(';') || (line.includes('`') && currentUpdate.lines.length > 1) || line.includes('WHERE')) {
          const sql = currentUpdate.lines.join('\n');
          if (/\bstatus\s*=/i.test(sql)) {
            matches.push({
              line: currentUpdate.start,
              snippet: currentUpdate.lines.slice(0, 3).map(l => l.trim()).join(' ')
            });
          }
          currentUpdate = null;
        }
      }
    });

    expect(matches.length).toBe(1);
    // Line 94 is inside transitionCampaignState
    expect(matches[0].line).toBeLessThan(150);
  });

  it('FSM ENFORCEMENT: Rejects invalid state transition when routed through transitionCampaignState', async () => {
    await expect(
      transitionCampaignState({
        campaignId: testCampaignId,
        expectedCurrentState: 'draft',
        to: 'CAMPAIGN_LIVE',
        reason: 'Unauthorized jump attempt',
        actorType: 'host',
        actorId: 1
      })
    ).rejects.toThrow(/Illegal transition/i);

    // Verify status remained 'draft' in database
    const dbRes = await pool.query("SELECT status FROM host_marketing_campaigns WHERE id = $1", [testCampaignId]);
    expect(dbRes.rows[0].status).toBe('draft');
  });

  it('FSM ENFORCEMENT: Successfully executes valid state transition draft -> pending_approval via FSM', async () => {
    const newState = await transitionCampaignState({
      campaignId: testCampaignId,
      expectedCurrentState: 'draft',
      to: 'pending_approval',
      reason: 'Valid submission via FSM',
      actorType: 'host',
      actorId: 1
    });

    expect(newState).toBe('pending_approval');

    const dbRes = await pool.query("SELECT status FROM host_marketing_campaigns WHERE id = $1", [testCampaignId]);
    expect(dbRes.rows[0].status).toBe('pending_approval');
  });

  it('FSM ENFORCEMENT: Successfully transitions pending_approval -> approved via FSM in transactional context', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const newState = await transitionCampaignState({
        campaignId: testCampaignId,
        expectedCurrentState: 'pending_approval',
        to: 'approved',
        reason: 'Admin approval via FSM',
        actorType: 'admin',
        actorId: 1,
        client
      });
      await client.query('COMMIT');
      expect(newState).toBe('approved');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const dbRes = await pool.query("SELECT status FROM host_marketing_campaigns WHERE id = $1", [testCampaignId]);
    expect(dbRes.rows[0].status).toBe('approved');
  });
});
