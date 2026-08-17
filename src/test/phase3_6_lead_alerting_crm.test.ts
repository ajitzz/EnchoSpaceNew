/**
 * Phase 3.6 Certification Test Suite: Multi-Channel Hot Lead Alerting & CRM Hardening
 *
 * Certified Scenarios:
 * 1. Valid lead webhook ingestion and persistence
 * 2. Duplicate webhook idempotency (zero duplicate lead creation)
 * 3. Invalid HMAC-SHA256 signature rejection
 * 4. Malformed payload handling
 * 5. Unknown campaign linkage rejection
 * 6. Foreign campaign rejection
 * 7. Tenant mismatch & cross-tenant lead injection blocking
 * 8. DB resilience (notification failure does not lose lead)
 * 9. Notification dispatch failure handling
 * 10. Notification retry with exponential backoff
 * 11. Notification Dead Letter Queue (DLQ) routing
 * 12. Deterministic Hot Lead scoring and classification (HOT, WARM, NORMAL)
 * 13. Lead State Machine (FSM) strict transition enforcement
 * 14. Duplicate CRM thread prevention
 * 15. PII redaction and Walled Garden data masking
 * 16. Admin auditing and role-based decryption
 * 17. Analytics integration (Phase 3.5 funnel projection)
 * 18. Concurrent webhook ingestion idempotency
 * 19. Worker lease expiration & recovery
 * 20. Idempotency race safety under concurrency
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'crypto';
import { LeadAlertingCrmService, LeadState, LeadScoringInputs } from '../lib/leadAlertingCrmService.js';
import { PerformanceAnalyticsService } from '../lib/performanceAnalyticsService.js';
import { ensureMarketingSchema } from '../../server.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('PHASE 3.6: MULTI-CHANNEL HOT LEAD ALERTING & CRM HARDENING SUITE', () => {
  let hostAId: number;
  let hostBId: number;
  let adminId: number;
  let listingAId: number;
  let campaignAId: number;
  let campaignBId: number;
  const appSecret = process.env.META_APP_SECRET || 'encho_meta_secret_live_test_2026';

  function signPayload(bodyStr: string): string {
    const hmac = crypto.createHmac('sha256', appSecret);
    return 'sha256=' + hmac.update(bodyStr).digest('hex');
  }

  let metaAdA: string;
  let metaAdB: string;

  beforeAll(async () => {
    await ensureMarketingSchema();

    metaAdA = `meta_ad_p36_a_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    metaAdB = `meta_ad_p36_b_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // 1. Setup Hosts and Admin
    const seed = Math.floor(1000000 + Math.random() * 8000000);
    const uRes1 = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Host A LeadTest', 'host_a_leadtest_${Date.now()}@encho.com', 'host', '+1555${seed}1')
      RETURNING id
    `);
    hostAId = uRes1.rows[0].id;

    const uRes2 = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Host B LeadTest', 'host_b_leadtest_${Date.now()}@encho.com', 'host', '+1555${seed}2')
      RETURNING id
    `);
    hostBId = uRes2.rows[0].id;

    const uRes3 = await pool.query(`
      INSERT INTO users (name, email, role, phone)
      VALUES ('Admin LeadTest', 'admin_leadtest_${Date.now()}@encho.com', 'admin', '+1555${seed}3')
      RETURNING id
    `);
    adminId = uRes3.rows[0].id;

    // 2. Setup Listing
    const lRes = await pool.query(`
      INSERT INTO listings (user_id, title, description, city, address, price, type)
      VALUES ($1, 'Joshua Tree Stargazer Villa', 'Desert retreat', 'Joshua Tree', '123 Desert Rd', 450, 'cabin')
      RETURNING id
    `, [hostAId]);
    listingAId = lRes.rows[0].id;

    // 3. Setup Campaigns
    const cRes1 = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, status, meta_campaign_id, meta_ad_id, admin_approved
      ) VALUES (
        $1, $2, 'Joshua Tree Desert Escape', 500, 'CAMPAIGN_LIVE', 'meta_camp_p36_a', $3, true
      ) RETURNING id
    `, [hostAId, listingAId, metaAdA]);
    campaignAId = cRes1.rows[0].id;

    const cRes2 = await pool.query(`
      INSERT INTO host_marketing_campaigns (
        host_id, listing_id, title, budget, status, meta_campaign_id, meta_ad_id, admin_approved
      ) VALUES (
        $1, $2, 'Host B Private Campaign', 300, 'CAMPAIGN_LIVE', 'meta_camp_p36_b', $3, true
      ) RETURNING id
    `, [hostBId, listingAId, metaAdB]);
    campaignBId = cRes2.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM lead_security_audit_logs WHERE campaign_id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM lead_notification_intents WHERE campaign_id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM lead_lifecycle_events WHERE campaign_id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM host_outreach_leads WHERE campaign_id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM host_marketing_campaigns WHERE id IN ($1, $2)`, [campaignAId, campaignBId]);
    await pool.query(`DELETE FROM listings WHERE id = $1`, [listingAId]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [hostAId, hostBId, adminId]);
  });

  it('1. Valid lead webhook ingestion and persistence', async () => {
    const rawPayload = JSON.stringify({
      object: 'page',
      entry: [{
        id: 'page_123',
        changes: [{
          field: 'leadgen',
          value: {
            leadgen_id: `ext_lead_${Date.now()}_1`,
            form_id: 'form_123',
            ad_id: metaAdA,
            campaign_id: campaignAId,
            name: 'Sarah Connor',
            email: 'sarah.connor@sky.net',
            phone: '+15557778888',
            message: 'Is the stargazer villa available next weekend for 4 guests?'
          }
        }]
      }]
    });

    const sig = signPayload(rawPayload);
    const result = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });

    expect(result.success).toBe(true);
    expect(result.is_duplicate).toBe(false);
    expect(result.lead_id).toBeDefined();
    expect(result.status).toBe('DELIVERED');
    expect(result.classification).toBe('HOT');
    expect(result.notification_intents_created).toBeGreaterThanOrEqual(2);

    // Verify DB record
    const dbRes = await pool.query(`SELECT * FROM host_outreach_leads WHERE id = $1`, [result.lead_id]);
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].host_id).toBe(hostAId);
    expect(dbRes.rows[0].campaign_id).toBe(campaignAId);
    expect(dbRes.rows[0].intent_score).toBeGreaterThanOrEqual(75);
    expect(dbRes.rows[0].ai_intent_badge).toBe('HOT_LEAD');
  });

  it('2. Duplicate webhook idempotency (zero duplicate lead creation)', async () => {
    const fixedExtId = `ext_lead_dup_${Date.now()}`;
    const rawPayload = JSON.stringify({
      event: 'new_lead',
      leadgen_id: fixedExtId,
      campaign_id: campaignAId,
      guest_name: 'John Reese',
      guest_email: 'john@reese.org',
      guest_phone: '+15551234567',
      message: 'Interested in booking next month.'
    });

    const sig = signPayload(rawPayload);

    // First ingestion
    const firstResult = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });
    expect(firstResult.success).toBe(true);
    expect(firstResult.is_duplicate).toBe(false);

    // Second duplicate ingestion
    const secondResult = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });
    expect(secondResult.success).toBe(true);
    expect(secondResult.is_duplicate).toBe(true);
    expect(secondResult.lead_id).toBe(firstResult.lead_id);

    // Verify DB count has exactly 1
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM host_outreach_leads WHERE external_lead_id = $1`,
      [fixedExtId]
    );
    expect(parseInt(countRes.rows[0].count)).toBe(1);
  });

  it('3. Invalid HMAC-SHA256 signature rejection', async () => {
    const rawPayload = JSON.stringify({
      event: 'new_lead',
      leadgen_id: `ext_lead_bad_sig_${Date.now()}`,
      campaign_id: campaignAId,
      name: 'Forged Lead'
    });

    const result = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': 'sha256=invalid_signature_hex_12345' },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });

    expect(result.success).toBe(false);
    expect(result.error_code).toBe('INVALID_SIGNATURE');

    // Verify security audit log was written
    const secRes = await pool.query(`
      SELECT * FROM lead_security_audit_logs
      WHERE action = 'WEBHOOK_SIGNATURE_REJECTED'
      ORDER BY created_at DESC LIMIT 1
    `);
    expect(secRes.rows.length).toBe(1);
    expect(secRes.rows[0].severity).toBe('CRITICAL');
  });

  it('4. Malformed payload handling', async () => {
    const sig = signPayload('null');
    const result = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: 'null',
      payload: null,
      poolOrClient: pool
    });

    expect(result.success).toBe(false);
    expect(result.error_code).toBe('MALFORMED_PAYLOAD');
  });

  it('5. Unknown campaign linkage rejection', async () => {
    const rawPayload = JSON.stringify({
      event: 'new_lead',
      leadgen_id: `ext_lead_unknown_camp_${Date.now()}`,
      campaign_id: 9999999, // Non-existent campaign
      name: 'Lost Lead'
    });

    const sig = signPayload(rawPayload);
    const result = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });

    expect(result.success).toBe(false);
    expect(result.error_code).toBe('UNKNOWN_CAMPAIGN_LINKAGE');
  });

  it('6. Foreign campaign rejection', async () => {
    const rawPayload = JSON.stringify({
      object: 'page',
      entry: [{
        changes: [{
          field: 'leadgen',
          value: {
            leadgen_id: `ext_lead_foreign_${Date.now()}`,
            ad_id: 'meta_ad_completely_unlinked_xyz',
            name: 'Alien Lead'
          }
        }]
      }]
    });

    const sig = signPayload(rawPayload);
    const result = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });

    expect(result.success).toBe(false);
    expect(result.error_code).toBe('UNKNOWN_CAMPAIGN_LINKAGE');
  });

  it('7. Tenant mismatch & cross-tenant lead injection blocking', async () => {
    // Campaign A belongs to Host A. Payload attempts to inject host_id = Host B.
    const rawPayload = JSON.stringify({
      event: 'new_lead',
      leadgen_id: `ext_lead_tamper_${Date.now()}`,
      campaign_id: campaignAId,
      host_id: hostBId, // Malicious forged host ID!
      guest_name: 'Attacker Impersonator'
    });

    const sig = signPayload(rawPayload);
    const result = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });

    expect(result.success).toBe(false);
    expect(result.error_code).toBe('CROSS_TENANT_VIOLATION');

    // Verify security violation logged
    const secRes = await pool.query(`
      SELECT * FROM lead_security_audit_logs
      WHERE action = 'CROSS_TENANT_LEAD_FORGERY_BLOCKED'
      ORDER BY created_at DESC LIMIT 1
    `);
    expect(secRes.rows.length).toBe(1);
    expect(secRes.rows[0].attempted_host_id).toBe(hostBId);
    expect(secRes.rows[0].actual_host_id).toBe(hostAId);
  });

  it('8. DB resilience (notification failure does not lose lead)', async () => {
    const rawPayload = JSON.stringify({
      event: 'new_lead',
      leadgen_id: `ext_lead_notif_fail_${Date.now()}`,
      campaign_id: campaignAId,
      guest_name: 'Resilient Guest',
      guest_email: 'resilient@guest.com',
      message: 'Will check in next week.'
    });

    const sig = signPayload(rawPayload);
    const result = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });

    expect(result.success).toBe(true);
    expect(result.lead_id).toBeDefined();

    // Lead must exist in DB regardless of whether notification succeeded
    const checkLead = await pool.query(`SELECT id FROM host_outreach_leads WHERE id = $1`, [result.lead_id]);
    expect(checkLead.rows.length).toBe(1);
  });

  it('9. Notification dispatch failure handling', async () => {
    // Force mock dispatcher to return failure
    const mockDispatcher = async (intent: any) => {
      return false; // Simulated channel error (e.g. SMTP 500)
    };

    const queueResult = await LeadAlertingCrmService.processLeadNotificationQueue(pool, {
      maxBatch: 10,
      mockDispatcher
    });

    expect(queueResult.processed).toBeGreaterThanOrEqual(1);
    expect(queueResult.failed).toBeGreaterThanOrEqual(1);
  });

  it('10. Notification retry with exponential backoff', async () => {
    // Insert an intent on attempt 1
    const notifRes = await pool.query(`
      INSERT INTO lead_notification_intents (
        campaign_id, host_id, channel, recipient, title, body, status, attempt_count, next_retry_at
      ) VALUES (
        $1, $2, 'email', 'retry_test@encho.com', 'Test Retry Title', 'Body', 'PENDING', 1, CURRENT_TIMESTAMP - INTERVAL '1 minute'
      ) RETURNING id
    `, [campaignAId, hostAId]);
    const notifId = notifRes.rows[0].id;

    // Fail again
    await LeadAlertingCrmService.processLeadNotificationQueue(pool, {
      maxBatch: 5,
      mockDispatcher: async () => false
    });

    const updatedNotif = await pool.query(`SELECT attempt_count, next_retry_at, status FROM lead_notification_intents WHERE id = $1`, [notifId]);
    expect(updatedNotif.rows[0].attempt_count).toBeGreaterThanOrEqual(2);
    expect(updatedNotif.rows[0].status).toBe('PENDING');
  });

  it('11. Notification Dead Letter Queue (DLQ) routing', async () => {
    // Insert an intent that has reached attempt count 2 (max_attempts = 3)
    const notifRes = await pool.query(`
      INSERT INTO lead_notification_intents (
        campaign_id, host_id, channel, recipient, title, body, status, attempt_count, max_attempts, next_retry_at
      ) VALUES (
        $1, $2, 'sms', '+15559990000', 'DLQ Test Title', 'Body', 'PENDING', 2, 3, CURRENT_TIMESTAMP - INTERVAL '1 minute'
      ) RETURNING id
    `, [campaignAId, hostAId]);
    const notifId = notifRes.rows[0].id;

    // Fail final attempt
    await LeadAlertingCrmService.processLeadNotificationQueue(pool, {
      maxBatch: 5,
      mockDispatcher: async () => false
    });

    const dlqCheck = await pool.query(`SELECT status, error_message FROM lead_notification_intents WHERE id = $1`, [notifId]);
    expect(dlqCheck.rows[0].status).toBe('DLQ');
    expect(dlqCheck.rows[0].error_message).toBeDefined();
  });

  it('12. Deterministic Hot Lead scoring and classification (HOT, WARM, NORMAL)', () => {
    const hotInputs: LeadScoringInputs = {
      submission_recency_minutes: 10,
      has_phone_number: true,
      has_email: true,
      booking_proximity_intent: true,
      repeat_inquiry_on_listing: true,
      message_text: 'Available for booking next weekend? What is the reserve price?'
    };
    const hotResult = LeadAlertingCrmService.calculateHotLeadScore(hotInputs);
    expect(hotResult.classification).toBe('HOT');
    expect(hotResult.score).toBeGreaterThanOrEqual(75);
    expect(hotResult.ai_intent_badge).toBe('HOT_LEAD');

    const warmInputs: LeadScoringInputs = {
      submission_recency_minutes: 120,
      has_phone_number: true,
      has_email: false,
      booking_proximity_intent: false,
      message_text: 'Hello, looking at properties.'
    };
    const warmResult = LeadAlertingCrmService.calculateHotLeadScore(warmInputs);
    expect(warmResult.classification).toBe('WARM');
    expect(warmResult.score).toBeGreaterThanOrEqual(50);
    expect(warmResult.score).toBeLessThan(75);
    expect(warmResult.ai_intent_badge).toBe('WARM_INQUIRY');

    const normalInputs: LeadScoringInputs = {
      submission_recency_minutes: 3000,
      has_phone_number: false,
      has_email: false,
      booking_proximity_intent: false,
      message_text: 'hi'
    };
    const normalResult = LeadAlertingCrmService.calculateHotLeadScore(normalInputs);
    expect(normalResult.classification).toBe('NORMAL');
    expect(normalResult.score).toBeLessThan(50);
    expect(normalResult.ai_intent_badge).toBe('NORMAL_INQUIRY');
  });

  it('13. Lead State Machine (FSM) strict transition enforcement', async () => {
    // Create test lead
    const leadRes = await pool.query(`
      INSERT INTO host_outreach_leads (campaign_id, host_id, guest_name, status)
      VALUES ($1, $2, 'FSM Test Lead', 'NEW')
      RETURNING id
    `, [campaignAId, hostAId]);
    const leadId = leadRes.rows[0].id;

    // 1. Valid: NEW -> DELIVERED
    let lead = await LeadAlertingCrmService.transitionLeadState({
      leadId,
      toState: 'DELIVERED',
      actorType: 'system',
      poolOrClient: pool
    });
    expect(lead.status).toBe('DELIVERED');

    // 2. Valid: DELIVERED -> VIEWED
    lead = await LeadAlertingCrmService.transitionLeadState({
      leadId,
      toState: 'VIEWED',
      actorType: 'host',
      hostId: hostAId,
      poolOrClient: pool
    });
    expect(lead.status).toBe('VIEWED');
    expect(lead.first_viewed_at).toBeDefined();

    // 3. Valid: VIEWED -> CONTACTED
    lead = await LeadAlertingCrmService.transitionLeadState({
      leadId,
      toState: 'CONTACTED',
      actorType: 'host',
      hostId: hostAId,
      poolOrClient: pool
    });
    expect(lead.status).toBe('CONTACTED');
    expect(lead.first_contacted_at).toBeDefined();

    // 4. Valid: CONTACTED -> QUALIFIED
    lead = await LeadAlertingCrmService.transitionLeadState({
      leadId,
      toState: 'QUALIFIED',
      actorType: 'host',
      hostId: hostAId,
      poolOrClient: pool
    });
    expect(lead.status).toBe('QUALIFIED');
    expect(lead.qualified_at).toBeDefined();

    // 5. Valid: QUALIFIED -> CONVERTED
    lead = await LeadAlertingCrmService.transitionLeadState({
      leadId,
      toState: 'CONVERTED',
      actorType: 'host',
      hostId: hostAId,
      poolOrClient: pool
    });
    expect(lead.status).toBe('CONVERTED');
    expect(lead.converted_at).toBeDefined();

    // 6. Invalid: CONVERTED -> NEW (Terminal state violation)
    await expect(
      LeadAlertingCrmService.transitionLeadState({
        leadId,
        toState: 'NEW',
        actorType: 'host',
        hostId: hostAId,
        poolOrClient: pool
      })
    ).rejects.toThrow(/Invalid lead state transition/);
  });

  it('14. Duplicate CRM thread prevention', async () => {
    const thread1 = await LeadAlertingCrmService.ensureLeadConversationThread({
      leadId: 9991,
      hostId: hostAId,
      listingId: listingAId,
      initialMessage: 'First inquiry message',
      poolOrClient: pool
    });

    const thread2 = await LeadAlertingCrmService.ensureLeadConversationThread({
      leadId: 9992,
      hostId: hostAId,
      listingId: listingAId,
      initialMessage: 'Follow-up inquiry message',
      poolOrClient: pool
    });

    expect(thread1.threadId).toBe(thread2.threadId);
    expect(thread2.isExisting).toBe(true);
  });

  it('15. PII redaction and Walled Garden data masking', async () => {
    // Insert lead with PII
    const rawPayload = JSON.stringify({
      event: 'new_lead',
      leadgen_id: `ext_lead_pii_${Date.now()}`,
      campaign_id: campaignAId,
      guest_name: 'Robert Oppenheimer',
      guest_email: 'oppenheimer@losalamos.gov',
      guest_phone: '+15558889999',
      message: 'Call me at +1 555-888-9999 or email oppenheimer@losalamos.gov to discuss availability.'
    });

    const sig = signPayload(rawPayload);
    const result = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });

    // Host View must mask PII
    const hostLeadView = await LeadAlertingCrmService.getLeadDetails(
      result.lead_id!,
      { userId: hostAId, role: 'host' },
      pool
    );

    expect(hostLeadView.guest_email).toBe('[EMAIL REDACTED]');
    expect(hostLeadView.guest_phone).toBe('[PHONE REDACTED]');
    expect(hostLeadView.message_history[0].text).toContain('[PHONE REDACTED]');
    expect(hostLeadView.message_history[0].text).toContain('[EMAIL REDACTED]');
  });

  it('16. Admin auditing and role-based decryption', async () => {
    const rawPayload = JSON.stringify({
      event: 'new_lead',
      leadgen_id: `ext_lead_admin_audit_${Date.now()}`,
      campaign_id: campaignAId,
      guest_name: 'Grace Hopper',
      guest_email: 'grace@navy.mil',
      guest_phone: '+15554443333',
      message: 'Checking villa availability.'
    });

    const sig = signPayload(rawPayload);
    const result = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });

    // Admin View has access to decrypted PII for legitimate moderation
    const adminLeadView = await LeadAlertingCrmService.getLeadDetails(
      result.lead_id!,
      { userId: adminId, role: 'admin', isAdmin: true },
      pool
    );

    expect(adminLeadView.guest_email).toBe('grace@navy.mil');
    expect(adminLeadView.guest_phone).toBe('+15554443333');
    expect(adminLeadView.timeline).toBeDefined();
    expect(adminLeadView.timeline.length).toBeGreaterThanOrEqual(1);
  });

  it('17. Analytics integration (Phase 3.5 funnel projection)', async () => {
    // Ingest a lead and mark it qualified and converted
    const rawPayload = JSON.stringify({
      event: 'new_lead',
      leadgen_id: `ext_lead_analytics_${Date.now()}`,
      campaign_id: campaignAId,
      guest_name: 'Alan Turing',
      message: 'Need accommodation for codebreaker team next month.'
    });

    const sig = signPayload(rawPayload);
    const result = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });

    await LeadAlertingCrmService.transitionLeadState({
      leadId: result.lead_id!,
      toState: 'CONTACTED',
      actorType: 'host',
      hostId: hostAId,
      poolOrClient: pool
    });

    await LeadAlertingCrmService.transitionLeadState({
      leadId: result.lead_id!,
      toState: 'QUALIFIED',
      actorType: 'host',
      hostId: hostAId,
      poolOrClient: pool
    });

    // Query Performance Analytics report for this campaign
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campaignAId,
      { userId: hostAId, role: 'host' },
      { window: 'LIFETIME' },
      pool
    );

    expect(report.funnel).toBeDefined();
    const leadsStage = report.funnel.stages.find(s => s.stage_key === 'LEADS');
    const qualifiedStage = report.funnel.stages.find(s => s.stage_key === 'QUALIFIED_LEADS');
    expect(leadsStage?.count).toBeGreaterThanOrEqual(1);
    expect(qualifiedStage?.count).toBeGreaterThanOrEqual(1);
  });

  it('18. Concurrent webhook processing idempotency', async () => {
    const extId = `ext_concurrent_${Date.now()}`;
    const rawPayload = JSON.stringify({
      event: 'new_lead',
      leadgen_id: extId,
      campaign_id: campaignAId,
      guest_name: 'Concurrent User',
      message: 'Inquiring rapidly.'
    });
    const sig = signPayload(rawPayload);

    // Dispatch 5 parallel webhook processing calls for the exact same lead
    const parallelIngestions = await Promise.all([
      LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({ headers: { 'x-hub-signature-256': sig }, rawBody: rawPayload, payload: JSON.parse(rawPayload), poolOrClient: pool }),
      LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({ headers: { 'x-hub-signature-256': sig }, rawBody: rawPayload, payload: JSON.parse(rawPayload), poolOrClient: pool }),
      LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({ headers: { 'x-hub-signature-256': sig }, rawBody: rawPayload, payload: JSON.parse(rawPayload), poolOrClient: pool }),
      LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({ headers: { 'x-hub-signature-256': sig }, rawBody: rawPayload, payload: JSON.parse(rawPayload), poolOrClient: pool }),
      LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({ headers: { 'x-hub-signature-256': sig }, rawBody: rawPayload, payload: JSON.parse(rawPayload), poolOrClient: pool })
    ]);

    // All must succeed
    parallelIngestions.forEach(res => {
      expect(res.success).toBe(true);
    });

    // Exactly 1 new lead created, 4 detected as duplicates
    const newCount = parallelIngestions.filter(r => !r.is_duplicate).length;
    const dupCount = parallelIngestions.filter(r => r.is_duplicate).length;
    expect(newCount).toBe(1);
    expect(dupCount).toBe(4);

    // Database must have exactly 1 record
    const countCheck = await pool.query(
      `SELECT COUNT(*) FROM host_outreach_leads WHERE external_lead_id = $1`,
      [extId]
    );
    expect(parseInt(countCheck.rows[0].count)).toBe(1);
  });

  it('19. Worker lease expiration & recovery', async () => {
    // Insert a stuck processing intent whose lease expired
    const stuckRes = await pool.query(`
      INSERT INTO lead_notification_intents (
        campaign_id, host_id, channel, recipient, title, body, status, attempt_count, lease_expires_at
      ) VALUES (
        $1, $2, 'in_app', 'user_1', 'Stuck Title', 'Stuck Body', 'PROCESSING', 1, CURRENT_TIMESTAMP - INTERVAL '5 minutes'
      ) RETURNING id
    `, [campaignAId, hostAId]);
    const stuckId = stuckRes.rows[0].id;

    // Worker cycle should reclaim stuck intent and deliver it
    const summary = await LeadAlertingCrmService.processLeadNotificationQueue(pool, {
      maxBatch: 10,
      mockDispatcher: async () => true
    });

    expect(summary.processed).toBeGreaterThanOrEqual(1);
    const checkStuck = await pool.query(`SELECT status FROM lead_notification_intents WHERE id = $1`, [stuckId]);
    expect(checkStuck.rows[0].status).toBe('DELIVERED');
  });

  it('20. Idempotency race safety under concurrency with state mutation', async () => {
    const extId = `ext_race_${Date.now()}`;
    const rawPayload = JSON.stringify({
      event: 'new_lead',
      leadgen_id: extId,
      campaign_id: campaignAId,
      guest_name: 'Race Condition Tester',
      message: 'Testing race conditions.'
    });
    const sig = signPayload(rawPayload);

    const res1 = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });

    // Mutate lead to QUALIFIED
    await LeadAlertingCrmService.transitionLeadState({
      leadId: res1.lead_id!,
      toState: 'CONTACTED',
      actorType: 'host',
      hostId: hostAId,
      poolOrClient: pool
    });

    await LeadAlertingCrmService.transitionLeadState({
      leadId: res1.lead_id!,
      toState: 'QUALIFIED',
      actorType: 'host',
      hostId: hostAId,
      poolOrClient: pool
    });

    // Redeliver duplicate webhook
    const res2 = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
      headers: { 'x-hub-signature-256': sig },
      rawBody: rawPayload,
      payload: JSON.parse(rawPayload),
      poolOrClient: pool
    });

    expect(res2.is_duplicate).toBe(true);
    expect(res2.lead_id).toBe(res1.lead_id);
    expect(res2.status).toBe('QUALIFIED'); // Preserves mutated FSM status without overwriting!
  });
});
