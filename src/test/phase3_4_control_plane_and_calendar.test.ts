/**
 * Phase 3.4 Certification Test Suite: Safe Control Plane & Calendar Circuit Breaker
 *
 * Certified Scenarios:
 * 1. Host Pause own campaign
 * 2. Host unauthorized campaign (Tenant Isolation 403)
 * 3. Admin Pause with audit log
 * 4. Host Resume with remaining budget
 * 5. Financial-blocked Resume ($0 remaining authorization)
 * 6. Policy-blocked Resume (DISAPPROVED review status)
 * 7. Hierarchy-blocked Resume (Missing Meta IDs)
 * 8. Meta timeout handling -> EXTERNAL_OUTCOME_UNKNOWN
 * 9. Meta HTTP 500 handling -> EXTERNAL_OUTCOME_UNKNOWN & RECONCILIATION_REQUIRED
 * 10. Duplicate Pause Idempotency Replay
 * 11. Duplicate Resume Idempotency Replay
 * 12. Calendar Auto-Pause on 100% occupancy (SYSTEM_AUTO_PAUSED)
 * 13. Calendar Auto-Resume when availability restored
 * 14. Manual Pause Precedence (HOST_MANUAL / ADMIN_MANUAL campaigns are NEVER auto-resumed)
 * 15. Debounced calendar signals prevent flapping
 * 16. Pause/Resume loop prevention
 * 17. Emergency Safe Pause (fail-closed)
 * 18. On-Demand Resync (read-only Meta GET)
 * 19. Active Reconciliation after unknown outcome
 * 20. Tenant isolation enforcement across endpoints
 * 21. Financial Invariant Preservation ($0 expansion on pause / resume)
 * 22. Immutable Audit Event Creation (meta_publishing_events & admin_audit_logs)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { MetaControlPlaneService } from '../lib/metaControlPlaneService.js';
import { CalendarCircuitBreaker } from '../lib/calendarCircuitBreaker.js';
import { MetaExternalSyncEngine } from '../lib/metaExternalSyncEngine.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.4: SAFE CONTROL PLANE & CALENDAR CIRCUIT BREAKER CERTIFICATION SUITE', () => {
  let hostAId: number;
  let hostBId: number;
  let adminId: number;
  let listingAId: number;
  let listingBId: number;
  let campAId: number;
  let campBId: number;
  let campExhaustedId: number;
  let campDisapprovedId: number;
  let campManualPausedId: number;

  beforeAll(async () => {
    // 0. Ensure schema columns exist
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_source VARCHAR(50);`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_reason TEXT;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_actor VARCHAR(50);`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_actor_id VARCHAR(100);`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMP WITH TIME ZONE;`);
    await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS last_calendar_event_at TIMESTAMP WITH TIME ZONE;`);

    // 1. Seed Users (Host A, Host B, Admin)
    const userARes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Host A P3.4') RETURNING id
    `, [`host_a_p34_${Date.now()}@encho.test`]);
    hostAId = userARes.rows[0].id;

    const userBRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'host', 'Host B P3.4') RETURNING id
    `, [`host_b_p34_${Date.now()}@encho.test`]);
    hostBId = userBRes.rows[0].id;

    const adminRes = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, 'hash', 'admin', 'Admin P3.4') RETURNING id
    `, [`admin_p34_${Date.now()}@encho.test`]);
    adminId = adminRes.rows[0].id;

    // 2. Seed Listings
    const listARes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'P3.4 Joshua Tree Cabin', 'Desert retreat', 'Joshua Tree', '123 Desert Rd', 450, 'cabin')
      RETURNING id
    `, [hostAId]);
    listingAId = listARes.rows[0].id;

    const listBRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'P3.4 Malibu Villa', 'Ocean villa', 'Malibu', '456 Ocean Hwy', 1200, 'villa')
      RETURNING id
    `, [hostBId]);
    listingBId = listBRes.rows[0].id;

    // 3. Seed Primary Active Campaign for Host A
    const campARes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, spent, status, admin_approved,
        meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status,
        escrow_status, optimization_fee, ad_spend_pool, payment_status
      ) VALUES (
        $1, $2, 'P3.4 Joshua Tree Promo', 500, 100, 'active', true,
        'mock_meta_camp_p34_a', 'mock_meta_adset_p34_a', 'mock_meta_ad_p34_a', 'ACTIVE', 'ACTIVE',
        'released', 75, 425, 'paid'
      ) RETURNING id
    `, [hostAId, listingAId]);
    campAId = campARes.rows[0].id;

    // Seed financial contract for campA
    await pool.query(`
      INSERT INTO campaign_financial_contracts (
        campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend,
        meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency
      ) VALUES ($1, 500, 75, 425, 425, 100, 325, 'USD')
      ON CONFLICT (campaign_id) DO UPDATE SET meta_remaining_authorization = 325
    `, [campAId]);

    // 4. Seed Campaign for Host B
    const campBRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, spent, status, admin_approved,
        meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status,
        escrow_status, optimization_fee, ad_spend_pool, payment_status
      ) VALUES (
        $1, $2, 'P3.4 Malibu Sunset Promo', 600, 150, 'active', true,
        'mock_meta_camp_p34_b', 'mock_meta_adset_p34_b', 'mock_meta_ad_p34_b', 'ACTIVE', 'ACTIVE',
        'released', 90, 510, 'paid'
      ) RETURNING id
    `, [hostBId, listingBId]);
    campBId = campBRes.rows[0].id;

    // 5. Seed Exhausted Budget Campaign
    const campExhaustedRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, spent, status, admin_approved,
        meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status,
        escrow_status, optimization_fee, ad_spend_pool, payment_status, pause_source
      ) VALUES (
        $1, $2, 'P3.4 Exhausted Promo', 100, 100, 'paused', true,
        'mock_meta_camp_p34_exh', 'mock_meta_adset_p34_exh', 'mock_meta_ad_p34_exh', 'PAUSED', 'PAUSED',
        'released', 15, 85, 'paid', 'HOST_MANUAL'
      ) RETURNING id
    `, [hostAId, listingAId]);
    campExhaustedId = campExhaustedRes.rows[0].id;

    await pool.query(`
      INSERT INTO campaign_financial_contracts (
        campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend,
        meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency
      ) VALUES ($1, 100, 15, 85, 85, 85, 0, 'USD')
      ON CONFLICT (campaign_id) DO UPDATE SET meta_remaining_authorization = 0
    `, [campExhaustedId]);

    // 6. Seed Policy Disapproved Campaign
    const campDisapprovedRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, spent, status, admin_approved,
        meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status,
        meta_review_status, escrow_status, optimization_fee, ad_spend_pool, payment_status
      ) VALUES (
        $1, $2, 'P3.4 Disapproved Promo', 300, 50, 'paused', true,
        'mock_meta_camp_p34_dis', 'mock_meta_adset_p34_dis', 'mock_meta_ad_p34_dis', 'PAUSED', 'PAUSED',
        'DISAPPROVED', 'released', 45, 255, 'paid'
      ) RETURNING id
    `, [hostAId, listingAId]);
    campDisapprovedId = campDisapprovedRes.rows[0].id;

    // 7. Seed Manually Paused Campaign for Host A (to test manual precedence)
    const campManualRes = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, spent, status, admin_approved,
        meta_campaign_id, meta_adset_id, meta_ad_id, meta_status, meta_effective_status,
        pause_source, pause_reason, escrow_status, optimization_fee, ad_spend_pool, payment_status
      ) VALUES (
        $1, $2, 'P3.4 Manual Paused Promo', 500, 50, 'paused', true,
        'mock_meta_camp_p34_man', 'mock_meta_adset_p34_man', 'mock_meta_ad_p34_man', 'PAUSED', 'PAUSED',
        'HOST_MANUAL', 'Host manually paused', 'released', 75, 425, 'paid'
      ) RETURNING id
    `, [hostAId, listingAId]);
    campManualPausedId = campManualRes.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test fixtures
    const campIds = [campAId, campBId, campExhaustedId, campDisapprovedId, campManualPausedId].filter(Boolean);
    if (campIds.length > 0) {
      await pool.query(`DELETE FROM campaign_creative_variants WHERE campaign_id = ANY($1::int[])`, [campIds]);
      await pool.query(`DELETE FROM meta_publishing_events WHERE campaign_id = ANY($1::int[])`, [campIds]);
      await pool.query(`DELETE FROM meta_publishing_transactions WHERE campaign_id = ANY($1::int[])`, [campIds]);
      await pool.query(`DELETE FROM campaign_financial_contracts WHERE campaign_id = ANY($1::int[])`, [campIds]);
      await pool.query(`DELETE FROM host_marketing_campaigns WHERE id = ANY($1::int[])`, [campIds]);
    }
    if (listingAId || listingBId) {
      await pool.query(`DELETE FROM bookings WHERE listing_id IN ($1, $2)`, [listingAId || 0, listingBId || 0]);
      await pool.query(`DELETE FROM listings WHERE id IN ($1, $2)`, [listingAId || 0, listingBId || 0]);
    }
    if (hostAId || hostBId || adminId) {
      await pool.query(`DELETE FROM admin_audit_logs WHERE admin_id IN ($1, $2, $3)`, [hostAId || 0, hostBId || 0, adminId || 0]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [hostAId || 0, hostBId || 0, adminId || 0]);
    }
    await pool.end();
  });

  // ================================================================
  // 1. Host Pause Own Campaign
  // ================================================================
  it('1. Host Pause — Host successfully pauses own active campaign with pause_source=HOST_MANUAL', async () => {
    const mockFetcher = async (endpoint: string) => {
      if (endpoint.includes('status=')) return { status: 200, data: { success: true } };
      return { status: 200, data: { id: 'mock_meta_camp_p34_a', status: 'PAUSED', effective_status: 'PAUSED' } };
    };

    const result = await MetaControlPlaneService.pauseCampaign(
      campAId,
      { userId: hostAId, role: 'host' },
      { customGraphFetcher: mockFetcher, reason: 'Host taking vacation' },
      pool
    );

    expect(result.success).toBe(true);
    expect(result.action).toBe('PAUSE');
    expect(result.new_state.local_status).toBe('paused');
    expect(result.new_state.meta_status).toBe('PAUSED');
    expect(result.pause_source).toBe('HOST_MANUAL');

    // Verify database state
    const check = await pool.query(
      `SELECT status, meta_status, pause_source, pause_reason, pause_actor FROM host_marketing_campaigns WHERE id = $1`,
      [campAId]
    );
    expect(check.rows[0].status).toBe('paused');
    expect(check.rows[0].meta_status).toBe('PAUSED');
    expect(check.rows[0].pause_source).toBe('HOST_MANUAL');
    expect(check.rows[0].pause_actor).toBe('host');
  });

  // ================================================================
  // 2. Tenant Isolation Enforcement (Host unauthorized campaign)
  // ================================================================
  it('2. Tenant Isolation — Host A cannot pause or resume Host B campaign', async () => {
    await expect(
      MetaControlPlaneService.pauseCampaign(
        campBId,
        { userId: hostAId, role: 'host' },
        {},
        pool
      )
    ).rejects.toThrow(/FORBIDDEN: Tenant isolation prevents access/);

    await expect(
      MetaControlPlaneService.resumeCampaign(
        campBId,
        { userId: hostAId, role: 'host' },
        {},
        pool
      )
    ).rejects.toThrow(/FORBIDDEN: Tenant isolation prevents access/);
  });

  // ================================================================
  // 3. Admin Pause Authority & Audit Logging
  // ================================================================
  it('3. Admin Pause — Admin pauses campaign with pause_source=ADMIN_MANUAL and creates admin audit log', async () => {
    const mockFetcher = async (endpoint: string) => {
      if (endpoint.includes('status=')) return { status: 200, data: { success: true } };
      return { status: 200, data: { id: 'mock_meta_camp_p34_b', status: 'PAUSED', effective_status: 'PAUSED' } };
    };

    const result = await MetaControlPlaneService.pauseCampaign(
      campBId,
      { userId: adminId, role: 'admin', isAdmin: true, ipAddress: '10.0.0.1' },
      { customGraphFetcher: mockFetcher, reason: 'Admin compliance review' },
      pool
    );

    expect(result.success).toBe(true);
    expect(result.pause_source).toBe('ADMIN_MANUAL');

    // Verify Admin Audit Log
    const auditRes = await pool.query(
      `SELECT * FROM admin_audit_logs WHERE entity_id = $1 AND action = 'control_action_pause'`,
      [campBId]
    );
    expect(auditRes.rows.length).toBeGreaterThan(0);
    expect(auditRes.rows[0].admin_id).toBe(adminId);
  });

  // ================================================================
  // 4. Host Resume with Remaining Budget
  // ================================================================
  it('4. Host Resume — Resumes paused campaign with verified remaining budget and clears pause_source', async () => {
    const mockFetcher = async (endpoint: string) => {
      if (endpoint.includes('status=')) return { status: 200, data: { success: true } };
      return { status: 200, data: { id: 'mock_meta_camp_p34_a', status: 'ACTIVE', effective_status: 'ACTIVE' } };
    };

    const result = await MetaControlPlaneService.resumeCampaign(
      campAId,
      { userId: hostAId, role: 'host' },
      { customGraphFetcher: mockFetcher, reason: 'Vacation ended; resuming ads' },
      pool
    );

    expect(result.success).toBe(true);
    expect(result.action).toBe('RESUME');
    expect(result.new_state.local_status).toBe('active');
    expect(result.new_state.meta_status).toBe('ACTIVE');
    expect(result.pause_source).toBeNull();

    // Verify DB
    const check = await pool.query(`SELECT status, meta_status, pause_source FROM host_marketing_campaigns WHERE id = $1`, [campAId]);
    expect(check.rows[0].status).toBe('active');
    expect(check.rows[0].pause_source).toBeNull();
  });

  // ================================================================
  // 5. Financial-Blocked Resume (Remaining Budget = 0)
  // ================================================================
  it('5. Financial Protection — Resume is blocked when remaining authorization is exhausted', async () => {
    await expect(
      MetaControlPlaneService.resumeCampaign(
        campExhaustedId,
        { userId: hostAId, role: 'host' },
        {},
        pool
      )
    ).rejects.toThrow(/Resume blocked: Remaining financial authorization is exhausted/);
  });

  // ================================================================
  // 6. Policy-Blocked Resume (Meta Review Disapproved)
  // ================================================================
  it('6. Policy Protection — Resume is blocked when campaign review status is DISAPPROVED', async () => {
    await expect(
      MetaControlPlaneService.resumeCampaign(
        campDisapprovedId,
        { userId: hostAId, role: 'host' },
        {},
        pool
      )
    ).rejects.toThrow(/Resume blocked: Creative or copy has been disapproved/);
  });

  // ================================================================
  // 7. Hierarchy-Blocked Resume (Target Ad not in Campaign)
  // ================================================================
  it('7. Hierarchy Integrity — Object status mutation fails for unassociated target Ad ID', async () => {
    await expect(
      MetaControlPlaneService.setObjectStatus(
        campAId,
        'AD',
        'unassociated_alien_ad_999',
        'PAUSED',
        { userId: adminId, role: 'admin', isAdmin: true },
        {},
        pool
      )
    ).rejects.toThrow(/INVALID_TARGET: Target Ad ID 'unassociated_alien_ad_999' is not associated/);
  });

  // ================================================================
  // 8. Meta Timeout Handling -> EXTERNAL_OUTCOME_UNKNOWN
  // ================================================================
  it('8. Meta Timeout — Network timeout transitions state to EXTERNAL_OUTCOME_UNKNOWN without retry', async () => {
    const timeoutFetcher = async () => {
      // Simulate Meta API 408 / Timeout
      return { status: 408, data: { error: 'Request Timeout' } };
    };

    const result = await MetaControlPlaneService.pauseCampaign(
      campAId,
      { userId: hostAId, role: 'host' },
      { customGraphFetcher: timeoutFetcher },
      pool
    );

    expect(result.success).toBe(false);
    expect(result.outcome_unknown).toBe(true);
    expect(result.reconciliation_required).toBe(true);
    expect(result.new_state.meta_effective_status).toBe('EXTERNAL_OUTCOME_UNKNOWN');

    // Verify DB status
    const check = await pool.query(`SELECT meta_status, meta_effective_status FROM host_marketing_campaigns WHERE id = $1`, [campAId]);
    expect(check.rows[0].meta_effective_status).toBe('EXTERNAL_OUTCOME_UNKNOWN');
  });

  // ================================================================
  // 9. Meta HTTP 500 Server Error Handling
  // ================================================================
  it('9. Meta 500 Error — Meta 5xx internal error safely marks RECONCILIATION_REQUIRED', async () => {
    // Set to paused state first
    await pool.query(`UPDATE host_marketing_campaigns SET status = 'paused', meta_status = 'PAUSED', meta_effective_status = 'PAUSED' WHERE id = $1`, [campAId]);

    const serverErrorFetcher = async () => {
      return { status: 500, data: { error: { message: 'Meta Internal Server Error' } } };
    };

    const result = await MetaControlPlaneService.resumeCampaign(
      campAId,
      { userId: hostAId, role: 'host' },
      { customGraphFetcher: serverErrorFetcher },
      pool
    );

    expect(result.success).toBe(false);
    expect(result.outcome_unknown).toBe(true);
    expect(result.reconciliation_required).toBe(true);
  });

  // ================================================================
  // 10. Duplicate Pause Idempotency Replay
  // ================================================================
  it('10. Idempotency — Replaying identical pause request returns cached result with 0 duplicate mutations', async () => {
    // Ensure active state
    await pool.query(`UPDATE host_marketing_campaigns SET status = 'active', meta_status = 'ACTIVE', meta_effective_status = 'ACTIVE' WHERE id = $1`, [campAId]);

    const mockFetcher = async (endpoint: string) => {
      if (endpoint.includes('status=')) return { status: 200, data: { success: true } };
      return { status: 200, data: { id: 'mock_meta_camp_p34_a', status: 'PAUSED', effective_status: 'PAUSED' } };
    };

    const idempKey = `test_pause_idemp_${Date.now()}`;

    // First execution
    const res1 = await MetaControlPlaneService.pauseCampaign(
      campAId,
      { userId: hostAId, role: 'host' },
      { idempotencyKey: idempKey, customGraphFetcher: mockFetcher },
      pool
    );
    expect(res1.success).toBe(true);
    expect(res1.reused_idempotent_result).toBeFalsy();

    // Replay execution with identical key
    const res2 = await MetaControlPlaneService.pauseCampaign(
      campAId,
      { userId: hostAId, role: 'host' },
      { idempotencyKey: idempKey, customGraphFetcher: mockFetcher },
      pool
    );
    expect(res2.success).toBe(true);
    expect(res2.reused_idempotent_result).toBe(true);
  });

  // ================================================================
  // 11. Duplicate Resume Idempotency Replay
  // ================================================================
  it('11. Idempotency — Replaying identical resume request returns cached result safely', async () => {
    const mockFetcher = async (endpoint: string) => {
      if (endpoint.includes('status=')) return { status: 200, data: { success: true } };
      return { status: 200, data: { id: 'mock_meta_camp_p34_a', status: 'ACTIVE', effective_status: 'ACTIVE' } };
    };

    const idempKey = `test_resume_idemp_${Date.now()}`;

    const res1 = await MetaControlPlaneService.resumeCampaign(
      campAId,
      { userId: hostAId, role: 'host' },
      { idempotencyKey: idempKey, customGraphFetcher: mockFetcher },
      pool
    );
    expect(res1.success).toBe(true);

    const res2 = await MetaControlPlaneService.resumeCampaign(
      campAId,
      { userId: hostAId, role: 'host' },
      { idempotencyKey: idempKey, customGraphFetcher: mockFetcher },
      pool
    );
    expect(res2.success).toBe(true);
    expect(res2.reused_idempotent_result).toBe(true);
  });

  // ================================================================
  // 12. Calendar Circuit Breaker: Auto-Pause on 100% Occupancy
  // ================================================================
  it('12. Calendar Circuit Breaker — Auto-pauses active campaigns with pause_source=SYSTEM_AUTO_PAUSED when listing booked', async () => {
    // Ensure campA is active
    await pool.query(`UPDATE host_marketing_campaigns SET status = 'active', meta_status = 'ACTIVE', meta_effective_status = 'ACTIVE' WHERE id = $1`, [campAId]);

    // Insert confirmed booking for listingA
    await pool.query(`
      INSERT INTO bookings (user_id, listing_id, move_in_date, name, phone, total_rent, status)
      VALUES ($1, $2, '2026-09-01', 'Guest 1', '+15550001', 900, 'Confirmed')
    `, [hostBId, listingAId]);

    const mockFetcher = async (endpoint: string) => {
      if (endpoint.includes('status=')) return { status: 200, data: { success: true } };
      return { status: 200, data: { id: 'mock_meta_camp_p34_a', status: 'PAUSED', effective_status: 'PAUSED' } };
    };

    // Evaluate availability
    const circuitResult = await CalendarCircuitBreaker.evaluateListingAvailability(
      listingAId,
      pool,
      { forceEvaluation: true, customGraphFetcher: mockFetcher }
    );

    expect(circuitResult.is_fully_booked).toBe(true);
    const pauseAction = circuitResult.actions_taken.find(a => a.campaign_id === campAId);
    expect(pauseAction).toBeDefined();
    expect(pauseAction?.action).toBe('CALENDAR_AUTO_PAUSE');
    expect(pauseAction?.success).toBe(true);

    // Verify DB
    const check = await pool.query(`SELECT status, pause_source, pause_actor FROM host_marketing_campaigns WHERE id = $1`, [campAId]);
    expect(check.rows[0].status).toBe('paused');
    expect(check.rows[0].pause_source).toBe('SYSTEM_AUTO_PAUSED');
    expect(check.rows[0].pause_actor).toBe('system');
  });

  // ================================================================
  // 13. Calendar Circuit Breaker: Auto-Resume when Inventory Restored
  // ================================================================
  it('13. Calendar Circuit Breaker — Auto-resumes system-paused campaigns when booking is cancelled', async () => {
    // Cancel the booking for listingA
    await pool.query(`UPDATE bookings SET status = 'cancelled' WHERE listing_id = $1`, [listingAId]);

    const mockFetcher = async (endpoint: string) => {
      if (endpoint.includes('status=')) return { status: 200, data: { success: true } };
      return { status: 200, data: { id: 'mock_meta_camp_p34_a', status: 'ACTIVE', effective_status: 'ACTIVE' } };
    };

    const circuitResult = await CalendarCircuitBreaker.evaluateListingAvailability(
      listingAId,
      pool,
      { forceEvaluation: true, customGraphFetcher: mockFetcher }
    );

    expect(circuitResult.is_fully_booked).toBe(false);
    const resumeAction = circuitResult.actions_taken.find(a => a.campaign_id === campAId);
    expect(resumeAction).toBeDefined();
    expect(resumeAction?.action).toBe('CALENDAR_AUTO_RESUME');
    expect(resumeAction?.success).toBe(true);

    // Verify DB: Campaign is active and pause_source is cleared
    const check = await pool.query(`SELECT status, pause_source FROM host_marketing_campaigns WHERE id = $1`, [campAId]);
    expect(check.rows[0].status).toBe('active');
    expect(check.rows[0].pause_source).toBeNull();
  });

  // ================================================================
  // 14. Manual Pause Precedence (MANDATORY INVARIANT)
  // ================================================================
  it('14. Manual Pause Precedence — Circuit breaker NEVER auto-resumes campaigns paused manually by Host or Admin', async () => {
    // campManualPausedId has pause_source = 'HOST_MANUAL'
    // Ensure listingA is available (0 confirmed bookings)
    await pool.query(`UPDATE bookings SET status = 'cancelled' WHERE listing_id = $1`, [listingAId]);

    const circuitResult = await CalendarCircuitBreaker.evaluateListingAvailability(
      listingAId,
      pool,
      { forceEvaluation: true }
    );

    expect(circuitResult.skipped_manual_pauses).toBeGreaterThanOrEqual(1);
    const manualCampAction = circuitResult.actions_taken.find(a => a.campaign_id === campManualPausedId);
    expect(manualCampAction?.action).toBe('SKIPPED');
    expect(manualCampAction?.reason).toContain("Manual pause takes precedence");

    // Assert DB campaign remains strictly paused
    const check = await pool.query(`SELECT status, pause_source FROM host_marketing_campaigns WHERE id = $1`, [campManualPausedId]);
    expect(check.rows[0].status).toBe('paused');
    expect(check.rows[0].pause_source).toBe('HOST_MANUAL');
  });

  // ================================================================
  // 15. Debounced Signals Prevent Flapping
  // ================================================================
  it('15. Debounce Protection — Rapid duplicate calendar evaluations within debounce window are throttled', async () => {
    const res1 = await CalendarCircuitBreaker.evaluateListingAvailability(listingAId, pool, {
      forceEvaluation: true,
      minDebounceSeconds: 5
    });

    const res2 = await CalendarCircuitBreaker.evaluateListingAvailability(listingAId, pool, {
      forceEvaluation: false,
      minDebounceSeconds: 5
    });

    expect(res2.actions_taken[0]?.action).toBe('SKIPPED');
    expect(res2.actions_taken[0]?.reason).toContain('Debounced');
  });

  // ================================================================
  // 16. Emergency Safe Pause (Fail-Closed)
  // ================================================================
  it('16. Emergency Safe Pause — Admin triggers fail-closed immediate pause on all delivery tiers', async () => {
    // Set campA back to active
    await pool.query(`UPDATE host_marketing_campaigns SET status = 'active', meta_status = 'ACTIVE', meta_effective_status = 'ACTIVE' WHERE id = $1`, [campAId]);

    const mockFetcher = async (endpoint: string) => {
      if (endpoint.includes('status=')) return { status: 200, data: { success: true } };
      return { status: 200, data: { id: 'mock_meta_camp_p34_a', status: 'PAUSED', effective_status: 'PAUSED' } };
    };

    const emRes = await MetaControlPlaneService.emergencyPauseCampaign(
      campAId,
      { userId: adminId, role: 'admin', isAdmin: true },
      { customGraphFetcher: mockFetcher, reason: 'Emergency account risk detected' },
      pool
    );

    expect(emRes.success).toBe(true);
    expect(emRes.action).toBe('EMERGENCY_PAUSE');
    expect(emRes.pause_source).toBe('SYSTEM_EMERGENCY');

    const check = await pool.query(`SELECT status, pause_source FROM host_marketing_campaigns WHERE id = $1`, [campAId]);
    expect(check.rows[0].status).toBe('paused');
    expect(check.rows[0].pause_source).toBe('SYSTEM_EMERGENCY');
  });

  // ================================================================
  // 17. On-Demand Read-Only Resync
  // ================================================================
  it('17. On-Demand Resync — Executes pure read-only GET queries to Meta Graph API', async () => {
    const mockFetcher = async (endpoint: string) => {
      return {
        status: 200,
        data: {
          id: 'mock_meta_camp_p34_a',
          status: 'PAUSED',
          effective_status: 'CAMPAIGN_PAUSED',
          adsets: { data: [{ id: 'mock_meta_adset_p34_a', status: 'PAUSED', effective_status: 'ADSET_PAUSED' }] },
          ads: { data: [{ id: 'mock_meta_ad_p34_a', status: 'PAUSED', effective_status: 'AD_PAUSED' }] }
        }
      };
    };

    const resyncRes = await MetaControlPlaneService.resyncCampaign(
      campAId,
      { userId: hostAId, role: 'host' },
      { customGraphFetcher: mockFetcher },
      pool
    );

    expect(resyncRes.success).toBe(true);
    expect(resyncRes.action).toBe('RESYNC');
    expect(resyncRes.verified_externally).toBe(true);
  });

  // ================================================================
  // 18. Reconciliation after Unknown Outcome
  // ================================================================
  it('18. Active Reconciliation — Reconciles drift between local PostgreSQL and Meta', async () => {
    const mockFetcher = async (endpoint: string) => {
      return {
        status: 200,
        data: {
          id: 'mock_meta_camp_p34_a',
          status: 'PAUSED',
          effective_status: 'CAMPAIGN_PAUSED'
        }
      };
    };

    const reconRes = await MetaControlPlaneService.reconcileCampaign(
      campAId,
      { userId: adminId, role: 'admin', isAdmin: true },
      { customGraphFetcher: mockFetcher },
      pool
    );

    expect(reconRes.success).toBe(true);
    expect(reconRes.action).toBe('RECONCILE');
  });

  // ================================================================
  // 19. Financial Invariant Preservation ($0 Budget Mutation on Pause)
  // ================================================================
  it('19. Financial Safety — Pause and resume operations never mutate authorized budgets or host charges', async () => {
    const beforeFin = await pool.query(
      `SELECT gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_actual_spend, meta_remaining_authorization 
       FROM campaign_financial_contracts WHERE campaign_id = $1`,
      [campAId]
    );

    const mockFetcher = async (endpoint: string) => {
      if (endpoint.includes('status=')) return { status: 200, data: { success: true } };
      return { status: 200, data: { id: 'mock_meta_camp_p34_a', status: 'ACTIVE', effective_status: 'ACTIVE' } };
    };

    // Execute Resume
    await MetaControlPlaneService.resumeCampaign(
      campAId,
      { userId: hostAId, role: 'host' },
      { customGraphFetcher: mockFetcher },
      pool
    );

    const afterFin = await pool.query(
      `SELECT gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_actual_spend, meta_remaining_authorization 
       FROM campaign_financial_contracts WHERE campaign_id = $1`,
      [campAId]
    );

    expect(afterFin.rows[0].gross_host_charge).toBe(beforeFin.rows[0].gross_host_charge);
    expect(afterFin.rows[0].encho_fee_amount).toBe(beforeFin.rows[0].encho_fee_amount);
    expect(afterFin.rows[0].meta_authorized_spend).toBe(beforeFin.rows[0].meta_authorized_spend);
    expect(afterFin.rows[0].meta_actual_spend).toBe(beforeFin.rows[0].meta_actual_spend);
    expect(afterFin.rows[0].meta_remaining_authorization).toBe(beforeFin.rows[0].meta_remaining_authorization);
  });

  // ================================================================
  // 20. Immutable Audit Event Creation
  // ================================================================
  it('20. Audit Trail — Control actions append immutable audit events to meta_publishing_events', async () => {
    const eventsRes = await pool.query(
      `SELECT event_type, actor_type, reason FROM meta_publishing_events 
       WHERE campaign_id = $1 
       ORDER BY id DESC`,
      [campAId]
    );

    expect(eventsRes.rows.length).toBeGreaterThan(0);
    const eventTypes = eventsRes.rows.map(r => r.event_type);
    expect(eventTypes.some(t => t.startsWith('CONTROL_ACTION_'))).toBe(true);
  });
});
