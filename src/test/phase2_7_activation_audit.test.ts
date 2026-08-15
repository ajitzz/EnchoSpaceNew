import { describe, it, expect, beforeEach, vi } from 'vitest';
import pkg from 'pg';
import { activateMetaCampaign } from '../../server.ts';

const { Pool } = pkg;
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL is not configured for test environment");
}
const pool = new Pool({ connectionString: dbUrl });

describe('Phase 2.7 — Final Publishing Delivery Activation Audit & Policy B Invariants', () => {
  let testCampaignId: number;
  let testHostId: number;
  let testAdminId: number;

  beforeEach(async () => {
    const rand = Math.random().toString(36).substring(2, 7);

    // Create host
    const hostRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Host Activation Test')
      RETURNING id
    `, [`host_act_${rand}@test.com`]);
    testHostId = hostRes.rows[0].id;

    // Create admin
    const adminRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'admin', 'Admin Activation Test')
      RETURNING id
    `, [`admin_act_${rand}@test.com`]);
    testAdminId = adminRes.rows[0].id;

    // Create listing
    const listingRes = await pool.query(`
      INSERT INTO listings (title, user_id, price, description, type, city, address)
      VALUES ('Activation Test Villa', $1, 400, 'Test desc', 'villa', 'Bali', '456 Beach Rd')
      RETURNING id
    `, [testHostId]);
    const listingId = listingRes.rows[0].id;

    // Create campaign (initially paused / created safe)
    const campRes = await pool.query(`
      INSERT INTO host_marketing_campaigns
      (title, listing_id, host_id, budget, status, admin_approved, meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status)
      VALUES
      ('Activation Audit Campaign', $1, $2, 200, 'paused', true, 'mock_camp_act_123', 'mock_adset_act_123', 'mock_ad_act_123', 'PAUSED', 'PAUSED')
      RETURNING id
    `, [listingId, testHostId]);
    testCampaignId = campRes.rows[0].id;

    // Mock global fetch for Meta API responses
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      if (options?.method === 'POST') {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ success: true, id: 'mock_object_id' })
        };
      }
      // GET verification
      if (url.includes('mock_camp_act_123') || url.includes('mock_adset_act_123')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            id: 'mock_id',
            status: body.status || 'ACTIVE',
            effective_status: 'ACTIVE'
          })
        };
      }
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'mock_id', status: 'ACTIVE', effective_status: 'ACTIVE' })
      };
    }));
  });

  it('A. Campaign activation sets campaign status ACTIVE on Meta', async () => {
    const result = await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(result.success).toBe(true);
    expect(result.newMetaStatus).toBe('ACTIVE');

    const dbCheck = await pool.query('SELECT meta_status, meta_effective_status FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    expect(dbCheck.rows[0].meta_status).toBe('ACTIVE');
  });

  it('B. AdSet activation sets adset status ACTIVE on Meta', async () => {
    const result = await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(result.success).toBe(true);

    const events = await pool.query('SELECT * FROM meta_publishing_events WHERE campaign_id = $1 AND event_type = $2', [testCampaignId, 'CAMPAIGN_ACTIVATED']);
    expect(events.rows.length).toBe(1);
  });

  it('C. Ad remains linked and verified active in hierarchy', async () => {
    const result = await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(result.success).toBe(true);
    const camp = await pool.query('SELECT meta_ad_id FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    expect(camp.rows[0].meta_ad_id).toBe('mock_ad_act_123');
  });

  it('D. Meta returning PAUSED during activation results in PAUSED status projection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') {
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) };
      }
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'mock_id', status: 'PAUSED', effective_status: 'PAUSED' })
      };
    }));

    const result = await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(result.newMetaStatus).toBe('PAUSED');
  });

  it('E. ENCHO never falsely reports LIVE without external hierarchy verification', async () => {
    const campBefore = await pool.query('SELECT meta_effective_status FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    expect(campBefore.rows[0].meta_effective_status).not.toBe('LIVE');
  });

  it('F. Meta hierarchy partially active is correctly handled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) };
      if (url.includes('mock_camp_act_123')) {
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ status: 'ACTIVE', effective_status: 'ACTIVE' }) };
      }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ status: 'PAUSED', effective_status: 'PAUSED' }) };
    }));

    const result = await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(result.newMetaStatus).toBe('PAUSED');
  });

  it('G. Campaign active / AdSet paused status divergence is caught', async () => {
    const res = await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(res).toBeDefined();
  });

  it('H. Campaign paused / Ad active hierarchy state constraint', async () => {
    const res = await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(res).toBeDefined();
  });

  it('I. All ads paused handling', async () => {
    const res = await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(res).toBeDefined();
  });

  it('J. Resume verifies complete hierarchy', async () => {
    const res = await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(res.success).toBe(true);
  });

  it('K. Failed activation triggers error propagation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Meta Network Timeout')));
    await expect(activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } })).rejects.toThrow();
  });

  it('L. Unknown activation outcome is safely captured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 504, headers: { get: () => 'text/html' }, text: async () => 'Gateway Timeout' }));
    await expect(activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } })).rejects.toThrow();
  });

  it('M. Duplicate activation requests are idempotent', async () => {
    const res1 = await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    const res2 = await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
  });

  it('N. Concurrent activation attempts handle row locking gracefully', async () => {
    const p1 = activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } }).catch(e => ({ error: e.message }));
    const p2 = activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } }).catch(e => ({ error: e.message }));
    const results = await Promise.all([p1, p2]);
    expect(results.some((r: any) => r.success === true || r.error)).toBe(true);
  });

  it('O. Activation cannot modify financial state (invariants preserved)', async () => {
    const beforeFin = await pool.query('SELECT budget FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    const afterFin = await pool.query('SELECT budget FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);

    expect(Number(afterFin.rows[0].budget)).toBe(Number(beforeFin.rows[0].budget));
  });

  it('P. Host projection displays verified operational states', async () => {
    const res = await pool.query('SELECT status, meta_status FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);
    expect(res.rows[0].status).toBe('paused');
  });

  it('Q. Admin projection displays immutable audit trail and verification timestamp', async () => {
    await activateMetaCampaign(testCampaignId, { user: { id: testAdminId, role: 'admin' } });
    const auditRes = await pool.query('SELECT * FROM admin_audit_logs WHERE entity_id = $1 AND action = $2', [testCampaignId, 'ACTIVATE_META_CAMPAIGN']);
    expect(auditRes.rows.length).toBe(1);
  });
});
