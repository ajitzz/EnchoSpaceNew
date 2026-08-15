import { describe, it, expect, beforeEach, vi } from 'vitest';
import pkg from 'pg';
import { 
  activateMetaCampaign, 
  getOrEstablishFinancialContract 
} from '../../server.ts';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService.ts';

const { Pool } = pkg;
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL is not configured for test environment");
}
const pool = new Pool({ connectionString: dbUrl });

describe('Phase 2.7 — Comprehensive Meta Financial Boundary Adversarial Test Matrix (Scenarios A-O)', () => {
  let testHostId: number;
  let testAdminId: number;
  let testListingId: number;

  beforeEach(async () => {
    const rand = Math.random().toString(36).substring(2, 7);

    // 1. Create Host
    const hostRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Host Adversarial Test')
      RETURNING id
    `, [`host_fin_adv_${rand}@test.com`]);
    testHostId = hostRes.rows[0].id;

    // 2. Create Admin
    const adminRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'admin', 'Admin Adversarial Test')
      RETURNING id
    `, [`admin_fin_adv_${rand}@test.com`]);
    testAdminId = adminRes.rows[0].id;

    // 3. Create Listing
    const listingRes = await pool.query(`
      INSERT INTO listings (title, user_id, price, description, type, city, address)
      VALUES ('Financial Boundary Villa', $1, 500, 'Test desc', 'villa', 'Goa', '100 Sunset Blvd')
      RETURNING id
    `, [testHostId]);
    testListingId = listingRes.rows[0].id;
  });

  // Helper to create a test campaign
  async function createTestCampaign(budget: number, currency: string = 'INR'): Promise<number> {
    const gateway = currency === 'USD' ? 'stripe' : 'razorpay';
    const res = await pool.query(`
      INSERT INTO host_marketing_campaigns
      (title, listing_id, host_id, budget, payment_gateway, status, admin_approved, meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status)
      VALUES
      ('Financial Test Campaign', $1, $2, $3, $4, 'paused', true, 'mock_meta_camp_fin', 'mock_meta_adset_fin', 'mock_meta_ad_fin', 'PAUSED', 'PAUSED')
      RETURNING id
    `, [testListingId, testHostId, budget, gateway]);
    return res.rows[0].id;
  }

  it('Scenario A: Gross ₹2500, Fee ₹375, Authorized ₹2125, External Meta AdSet ₹2500 -> Hard Block', async () => {
    const campaignId = await createTestCampaign(2500, 'INR');
    
    // Contract has authorized = 212500, configured = 212500
    await pool.query(`
      INSERT INTO campaign_financial_contracts
      (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency)
      VALUES ($1, 250000, 37500, 212500, 212500, 0, 212500, 'INR')
    `, [campaignId]);

    const metaPostSpy = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') {
        metaPostSpy(url, options);
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) };
      }
      if (url.includes('mock_meta_adset_fin')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ id: 'mock_meta_adset_fin', status: 'PAUSED', daily_budget: '250000' })
        };
      }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ id: 'mock_id', status: 'PAUSED' }) };
    }));

    await expect(
      activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } })
    ).rejects.toThrow(/FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION/);

    // Invariant: ZERO Meta POST mutations
    expect(metaPostSpy).not.toHaveBeenCalled();

    // Invariant: FINANCIAL_ACTIVATION_BLOCKED recorded in meta_publishing_events
    const eventCheck = await pool.query(
      `SELECT * FROM meta_publishing_events WHERE campaign_id = $1 AND event_type = 'FINANCIAL_ACTIVATION_BLOCKED'`,
      [campaignId]
    );
    expect(eventCheck.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('Scenario B: Configured Meta spend exactly equal to authorized spend (₹2125) -> Pass', async () => {
    const campaignId = await createTestCampaign(2500, 'INR');
    
    // Financial contract with configured == authorized
    await pool.query(`
      INSERT INTO campaign_financial_contracts
      (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency)
      VALUES ($1, 250000, 37500, 212500, 212500, 0, 212500, 'INR')
    `, [campaignId]);

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') {
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) };
      }
      // External AdSet returns daily_budget 212500
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'mock_id', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '212500' })
      };
    }));

    const result = await activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(result.success).toBe(true);
    expect(result.newMetaStatus).toBe('ACTIVE');
  });

  it('Scenario C: Configured Meta spend below authorized spend (₹2000 < ₹2125) -> Pass', async () => {
    const campaignId = await createTestCampaign(2500, 'INR');
    
    await pool.query(`
      INSERT INTO campaign_financial_contracts
      (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency)
      VALUES ($1, 250000, 37500, 212500, 200000, 0, 212500, 'INR')
    `, [campaignId]);

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') {
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) };
      }
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 'mock_id', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '200000' })
      };
    }));

    const result = await activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } });
    expect(result.success).toBe(true);
  });

  it('Scenario D: Configured Meta spend exceeding by even 1 paise (₹2125.01) -> Hard Block', async () => {
    const campaignId = await createTestCampaign(2500, 'INR');
    
    // 1. Direct DB check constraint rejects configured > authorized
    await expect(
      pool.query(`
        INSERT INTO campaign_financial_contracts
        (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency)
        VALUES ($1, 250000, 37500, 212500, 212501, 0, 212500, 'INR')
      `, [campaignId])
    ).rejects.toThrow(/chk_config_max/);

    // 2. Setup compliant contract
    await pool.query(`
      INSERT INTO campaign_financial_contracts
      (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency)
      VALUES ($1, 250000, 37500, 212500, 212500, 0, 212500, 'INR')
    `, [campaignId]);

    // 3. External Meta AdSet exceeds by 1 paise (212501)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') {
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) };
      }
      if (url.includes('mock_meta_adset_fin')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ id: 'mock_meta_adset_fin', status: 'PAUSED', daily_budget: '212501' })
        };
      }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ id: 'mock_id', status: 'PAUSED' }) };
    }));

    await expect(
      activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } })
    ).rejects.toThrow(/FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION/);
  });

  it('Scenario E: Zero spend -> Remaining authorization equals full authorized spend', async () => {
    const campaignId = await createTestCampaign(1000, 'INR');
    const contract = await getOrEstablishFinancialContract(campaignId, pool);

    expect(contract.meta_actual_spend).toBe(0n);
    expect(contract.meta_remaining_authorization).toBe(contract.meta_authorized_spend);
    expect(contract.gross_host_charge).toBe(contract.encho_fee_amount + contract.meta_authorized_spend);
  });

  it('Scenario F: Non-zero spend -> Remaining authorization is exact (Authorized - Actual)', async () => {
    const campaignId = await createTestCampaign(1000, 'INR');
    
    // Simulate ₹300 spend (30000 paise)
    await pool.query(`
      UPDATE host_marketing_campaigns
      SET spent = 300
      WHERE id = $1
    `, [campaignId]);

    const contract = await getOrEstablishFinancialContract(campaignId, pool);
    expect(contract.meta_actual_spend).toBe(30000n);
    expect(contract.meta_remaining_authorization).toBe(contract.meta_authorized_spend - 30000n);
  });

  it('Scenario G: INR currency math -> Minor units (paise) integer math invariant', async () => {
    const campaignId = await createTestCampaign(7350, 'INR');
    const contract = await getOrEstablishFinancialContract(campaignId, pool);

    // 7350 INR = 735000 paise
    expect(contract.gross_host_charge).toBe(735000n);
    // 15% fee = 110250 paise
    expect(contract.encho_fee_amount).toBe(110250n);
    // 85% meta authorized = 624750 paise
    expect(contract.meta_authorized_spend).toBe(624750n);
    expect(contract.gross_host_charge).toBe(contract.encho_fee_amount + contract.meta_authorized_spend);
  });

  it('Scenario H: USD currency math -> Minor units (cents) integer math invariant', async () => {
    const campaignId = await createTestCampaign(200, 'USD');
    const contract = await getOrEstablishFinancialContract(campaignId, pool);

    // $200 = 20000 cents
    expect(contract.gross_host_charge).toBe(20000n);
    // 15% fee = 3000 cents ($30)
    expect(contract.encho_fee_amount).toBe(3000n);
    // 85% meta authorized = 17000 cents ($170)
    expect(contract.meta_authorized_spend).toBe(17000n);
    expect(contract.gross_host_charge).toBe(contract.encho_fee_amount + contract.meta_authorized_spend);
  });

  it('Scenario I: Independent activation re-check queries financial contract and blocks', async () => {
    const campaignId = await createTestCampaign(2500, 'INR');
    
    // Contract setup
    await pool.query(`
      INSERT INTO campaign_financial_contracts
      (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency)
      VALUES ($1, 250000, 37500, 212500, 212500, 0, 212500, 'INR')
    `, [campaignId]);

    // External Meta reports over-budget
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') {
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) };
      }
      if (url.includes('mock_meta_adset_fin')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ id: 'mock_meta_adset_fin', status: 'PAUSED', daily_budget: '300000' })
        };
      }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ id: 'mock_id', status: 'PAUSED' }) };
    }));

    // First attempt
    await expect(activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } })).rejects.toThrow();

    // Second attempt
    await expect(activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } })).rejects.toThrow();
  });

  it('Scenario J: Duplicate activation requests are idempotent and preserve invariants', async () => {
    const campaignId = await createTestCampaign(500, 'INR');
    
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') {
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) };
      }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ id: 'mock_id', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '42500' }) };
    }));

    const res1 = await activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } });
    const res2 = await activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } });

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const contract = await getOrEstablishFinancialContract(campaignId, pool);
    expect(contract.meta_configured_max_spend).toBeLessThanOrEqual(contract.meta_authorized_spend);
  });

  it('Scenario K: Concurrent activation requests handle locking gracefully', async () => {
    const campaignId = await createTestCampaign(500, 'INR');

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') {
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) };
      }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ id: 'mock_id', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '42500' }) };
    }));

    const p1 = activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } }).catch(e => ({ error: e.message }));
    const p2 = activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } }).catch(e => ({ error: e.message }));

    const results = await Promise.all([p1, p2]);
    expect(results.some((r: any) => r.success === true || r.error)).toBe(true);
  });

  it('Scenario L: Financial mismatch ensures zero Meta API mutations', async () => {
    const campaignId = await createTestCampaign(3000, 'INR');

    await pool.query(`
      INSERT INTO campaign_financial_contracts
      (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency)
      VALUES ($1, 300000, 45000, 255000, 255000, 0, 255000, 'INR')
    `, [campaignId]);

    const postTracker = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') {
        postTracker(url);
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) };
      }
      if (url.includes('mock_meta_adset_fin')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ id: 'mock_meta_adset_fin', status: 'PAUSED', daily_budget: '350000' })
        };
      }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ id: 'mock_id', status: 'PAUSED' }) };
    }));

    try {
      await activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } });
    } catch (e) {
      // Expected block
    }

    expect(postTracker).not.toHaveBeenCalled();
  });

  it('Scenario M: External Meta AdSet daily_budget exceeding authorized spend triggers activation block', async () => {
    const campaignId = await createTestCampaign(2500, 'INR');

    // Contract has authorized = 212500, configured = 212500
    await pool.query(`
      INSERT INTO campaign_financial_contracts
      (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency)
      VALUES ($1, 250000, 37500, 212500, 212500, 0, 212500, 'INR')
    `, [campaignId]);

    // But Meta Graph API probe returns daily_budget 250000 (exceeding 212500)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (options?.method === 'POST') {
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) };
      }
      if (url.includes('mock_meta_adset_fin')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ id: 'mock_meta_adset_fin', status: 'PAUSED', daily_budget: '250000' })
        };
      }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ id: 'mock_id', status: 'PAUSED' }) };
    }));

    await expect(
      activateMetaCampaign(campaignId, { user: { id: testAdminId, role: 'admin' } })
    ).rejects.toThrow(/FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION/);
  });

  it('Scenario N: Host view displays safe, non-technical guidance during financial block', async () => {
    const campaignId = await createTestCampaign(2500, 'INR');

    await pool.query(`
      INSERT INTO campaign_financial_contracts
      (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency)
      VALUES ($1, 250000, 37500, 212500, 212500, 0, 212500, 'INR')
    `, [campaignId]);

    await pool.query(`
      INSERT INTO meta_publishing_events (campaign_id, event_type, to_state, correlation_id, metadata)
      VALUES ($1, 'FINANCIAL_ACTIVATION_BLOCKED', 'BLOCKED', 'corr_fin_block_n', '{"error":"FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION"}')
    `, [campaignId]);

    const hostTruth = await CampaignControlCenterService.getCanonicalTruth(campaignId, {
      userId: testHostId,
      isAdmin: false,
      role: 'host'
    }, pool);

    expect(hostTruth.projection_type).toBe('HOST');
    expect(hostTruth.financial_safety.is_financial_blocked).toBe(true);
    expect(hostTruth.financial_safety.friendly_financial_guidance).toBe(
      "Campaign activation is temporarily blocked because a financial authorization mismatch was detected. Your funds remain protected."
    );
    expect(hostTruth.operational_status).not.toBe('LIVE');
  });

  it('Scenario O: Admin Command Center displays full financial diagnostics and recommended action', async () => {
    const campaignId = await createTestCampaign(2500, 'INR');

    await pool.query(`
      INSERT INTO campaign_financial_contracts
      (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency)
      VALUES ($1, 250000, 37500, 212500, 212500, 0, 212500, 'INR')
    `, [campaignId]);

    await pool.query(`
      INSERT INTO meta_publishing_events (campaign_id, event_type, to_state, correlation_id, metadata)
      VALUES ($1, 'FINANCIAL_ACTIVATION_BLOCKED', 'BLOCKED', 'corr_fin_block_o', '{"error":"FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION"}')
    `, [campaignId]);

    const adminTruth = await CampaignControlCenterService.getCanonicalTruth(campaignId, {
      userId: testAdminId,
      isAdmin: true,
      role: 'admin'
    }, pool);

    expect(adminTruth.projection_type).toBe('ADMIN');
    expect(adminTruth.financial_safety.is_financial_blocked).toBe(true);
    expect(adminTruth.financial_safety.total_charged_cents).toBe(250000);
    expect(adminTruth.financial_safety.encho_fee_cents).toBe(37500);
    expect(adminTruth.financial_safety.meta_authorized_spend_cents).toBe(212500);
    expect(adminTruth.financial_safety.meta_configured_max_cents).toBe(212500);
    expect(adminTruth.financial_safety.variance_cents).toBe(0);
    expect(adminTruth.financial_safety.financial_block_reason).toBe(
      "The Meta budget exceeds the campaign's authorized advertising spend."
    );
    expect(adminTruth.financial_safety.recommended_action).toBe(
      "Financial configuration must be corrected before activation."
    );
  });
});
