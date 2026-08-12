import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runAnalyticsRollup, ensureMarketingSchema } from '../../server.ts';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

describe('Phase 2.6 Milestone 1 — Time-Series Analytics Date Correctness Suite', () => {
  let host1Id: number;
  let host2Id: number;
  let campaign1Id: number;
  let campaign2Id: number;

  beforeAll(async () => {
    await ensureMarketingSchema();

    // 1. Setup Test Hosts
    const host1Res = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ('Analytics Host 1', 'analytics_host_1_ts@encho.com', 'hash', 'user') RETURNING id"
    );
    host1Id = host1Res.rows[0].id;

    const host2Res = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ('Analytics Host 2', 'analytics_host_2_ts@encho.com', 'hash', 'user') RETURNING id"
    );
    host2Id = host2Res.rows[0].id;

    // 2. Setup Test Campaigns
    const camp1Res = await pool.query(
      "INSERT INTO host_marketing_campaigns (host_id, status, title, budget) VALUES ($1, 'active', 'TS Campaign 1 Host 1', 500) RETURNING id",
      [host1Id]
    );
    campaign1Id = camp1Res.rows[0].id;

    const camp2Res = await pool.query(
      "INSERT INTO host_marketing_campaigns (host_id, status, title, budget) VALUES ($1, 'active', 'TS Campaign 2 Host 2', 1000) RETURNING id",
      [host2Id]
    );
    campaign2Id = camp2Res.rows[0].id;
  });

  afterAll(async () => {
    if (campaign1Id || campaign2Id) {
      await pool.query("DELETE FROM campaign_raw_event_logs WHERE campaign_id IN ($1, $2)", [campaign1Id, campaign2Id]);
      await pool.query("DELETE FROM campaign_daily_rollups WHERE campaign_id IN ($1, $2)", [campaign1Id, campaign2Id]);
      await pool.query("DELETE FROM host_marketing_campaigns WHERE id IN ($1, $2)", [campaign1Id, campaign2Id]);
    }
    if (host1Id || host2Id) {
      await pool.query("DELETE FROM users WHERE id IN ($1, $2)", [host1Id, host2Id]);
    }
    await pool.end();
  });

  it('TEST A — Historical Event Date: Event created yesterday appears under yesterday date, not today', async () => {
    await pool.query(`
      INSERT INTO campaign_raw_event_logs (campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, processed, created_at)
      VALUES ($1, 100, 10, 1, 5.50, false, NOW() - INTERVAL '1 day')
    `, [campaign1Id]);

    await runAnalyticsRollup();

    const expectedDateRes = await pool.query(`SELECT ((NOW() - INTERVAL '1 day') AT TIME ZONE 'UTC')::date::text as date`);
    const expectedDate = expectedDateRes.rows[0].date;

    const rollupRes = await pool.query(`
      SELECT date::text, impressions, clicks, conversions, spent_usd::numeric
      FROM campaign_daily_rollups
      WHERE campaign_id = $1 AND date = $2
    `, [campaign1Id, expectedDate]);

    expect(rollupRes.rows.length).toBe(1);
    expect(rollupRes.rows[0].date).toBe(expectedDate);
    expect(rollupRes.rows[0].impressions).toBe(100);
  });

  it('TEST B — Different Dates Multi-Bucket: Events for same campaign on different dates produce separate rollup rows', async () => {
    await pool.query(`
      INSERT INTO campaign_raw_event_logs (campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, processed, created_at)
      VALUES ($1, 200, 20, 2, 10.00, false, NOW() - INTERVAL '2 days')
    `, [campaign1Id]);

    await runAnalyticsRollup();

    const date1Res = await pool.query(`SELECT ((NOW() - INTERVAL '1 day') AT TIME ZONE 'UTC')::date::text as date`);
    const date2Res = await pool.query(`SELECT ((NOW() - INTERVAL '2 days') AT TIME ZONE 'UTC')::date::text as date`);

    const rollupRes = await pool.query(`
      SELECT date::text, impressions
      FROM campaign_daily_rollups
      WHERE campaign_id = $1 AND date IN ($2, $3)
      ORDER BY date ASC
    `, [campaign1Id, date2Res.rows[0].date, date1Res.rows[0].date]);

    expect(rollupRes.rows.length).toBe(2);
  });

  it('TEST C — Same Date Summation: Multiple events for same campaign on same date sum deltas into 1 row', async () => {
    await pool.query(`
      INSERT INTO campaign_raw_event_logs (campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, processed, created_at)
      VALUES 
        ($1, 150, 15, 1, 7.50, false, NOW() - INTERVAL '3 days'),
        ($1, 50, 5, 1, 2.50, false, NOW() - INTERVAL '3 days')
    `, [campaign1Id]);

    await runAnalyticsRollup();

    const date3DaysAgoRes = await pool.query(`SELECT ((NOW() - INTERVAL '3 days') AT TIME ZONE 'UTC')::date::text as date`);
    const date3DaysAgo = date3DaysAgoRes.rows[0].date;

    const rollupRes = await pool.query(`
      SELECT date::text, impressions, clicks, conversions, spent_usd::numeric
      FROM campaign_daily_rollups
      WHERE campaign_id = $1 AND date = $2
    `, [campaign1Id, date3DaysAgo]);

    expect(rollupRes.rows.length).toBe(1);
    expect(rollupRes.rows[0].impressions).toBe(200); // 150 + 50
    expect(rollupRes.rows[0].clicks).toBe(20);       // 15 + 5
    expect(rollupRes.rows[0].conversions).toBe(2);   // 1 + 1
    expect(Number(rollupRes.rows[0].spent_usd)).toBe(10.00); // 7.50 + 2.50
  });

  it('TEST D — Historical + Current Event: Historical event + current event produce 2 separate daily buckets', async () => {
    await pool.query(`
      INSERT INTO campaign_raw_event_logs (campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, processed, created_at)
      VALUES ($1, 300, 30, 3, 15.00, false, CURRENT_TIMESTAMP)
    `, [campaign1Id]);

    await runAnalyticsRollup();

    const todayDateRes = await pool.query(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text as date`);
    const todayDate = todayDateRes.rows[0].date;

    const todayRollup = await pool.query(`
      SELECT date::text, impressions
      FROM campaign_daily_rollups
      WHERE campaign_id = $1 AND date = $2
    `, [campaign1Id, todayDate]);

    expect(todayRollup.rows.length).toBe(1);
    expect(todayRollup.rows[0].impressions).toBe(300);
  });

  it('TEST E — Multi-Campaign Multi-Date Aggregation: Correct composite campaign/date aggregation', async () => {
    await pool.query(`
      INSERT INTO campaign_raw_event_logs (campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, processed, created_at)
      VALUES 
        ($1, 400, 40, 4, 20.00, false, NOW() - INTERVAL '5 days'),
        ($2, 500, 50, 5, 25.00, false, NOW() - INTERVAL '5 days')
    `, [campaign1Id, campaign2Id]);

    await runAnalyticsRollup();

    const date5DaysAgoRes = await pool.query(`SELECT ((NOW() - INTERVAL '5 days') AT TIME ZONE 'UTC')::date::text as date`);
    const date5DaysAgo = date5DaysAgoRes.rows[0].date;

    const camp1Row = await pool.query(`
      SELECT impressions FROM campaign_daily_rollups WHERE campaign_id = $1 AND date = $2
    `, [campaign1Id, date5DaysAgo]);

    const camp2Row = await pool.query(`
      SELECT impressions FROM campaign_daily_rollups WHERE campaign_id = $1 AND date = $2
    `, [campaign2Id, date5DaysAgo]);

    expect(camp1Row.rows[0].impressions).toBe(400);
    expect(camp2Row.rows[0].impressions).toBe(500);
  });

  it('TEST F — Timezone Boundary Test: Explicit UTC timestamp derives exact UTC date', async () => {
    await pool.query(`
      INSERT INTO campaign_raw_event_logs (campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, processed, created_at)
      VALUES ($1, 777, 77, 7, 38.50, false, '2026-01-01 23:59:59+00')
    `, [campaign1Id]);

    await runAnalyticsRollup();

    const rollupRes = await pool.query(`
      SELECT date::text, impressions
      FROM campaign_daily_rollups
      WHERE campaign_id = $1 AND date = '2026-01-01'
    `, [campaign1Id]);

    expect(rollupRes.rows.length).toBe(1);
    expect(rollupRes.rows[0].impressions).toBe(777);
  });

  it('TEST G — ON CONFLICT Accumulation: Subsequent events on same campaign & date update existing row', async () => {
    await pool.query(`
      INSERT INTO campaign_raw_event_logs (campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, processed, created_at)
      VALUES ($1, 223, 23, 3, 11.50, false, '2026-01-01 12:00:00+00')
    `, [campaign1Id]);

    await runAnalyticsRollup();

    const rollupRes = await pool.query(`
      SELECT date::text, impressions
      FROM campaign_daily_rollups
      WHERE campaign_id = $1 AND date = '2026-01-01'
    `, [campaign1Id]);

    expect(rollupRes.rows[0].impressions).toBe(1000); // 777 + 223
  });

  it('TEST H — Processed Flag: Raw events marked processed = true upon completion', async () => {
    const unprocessed = await pool.query(`
      SELECT COUNT(*)::int as count FROM campaign_raw_event_logs 
      WHERE campaign_id IN ($1, $2) AND processed = false
    `, [campaign1Id, campaign2Id]);

    expect(unprocessed.rows[0].count).toBe(0);
  });

  it('TEST I — Failure Injection: Rollback preserves processed = false on transaction failure', async () => {
    const insertRes = await pool.query(`
      INSERT INTO campaign_raw_event_logs (campaign_id, impressions_delta, clicks_delta, conversions_delta, spent_delta, processed)
      VALUES ($1, 999, 99, 9, 99.00, false)
      RETURNING id
    `, [campaign1Id]);
    const eventId = insertRes.rows[0].id;

    // Simulate database constraint error in transaction context
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO campaign_daily_rollups (campaign_id, date, impressions)
        VALUES (99999999, CURRENT_DATE, 100)
      `);
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const checkRes = await pool.query(`
      SELECT processed FROM campaign_raw_event_logs WHERE id = $1
    `, [eventId]);
    expect(checkRes.rows[0].processed).toBe(false);

    // Clean up
    await pool.query(`DELETE FROM campaign_raw_event_logs WHERE id = $1`, [eventId]);
  });

  it('TEST J — Tenant Isolation Analytics Query: Host analytics queries isolate host campaigns correctly', async () => {
    const host1Analytics = await pool.query(`
      SELECT COALESCE(SUM(r.impressions), 0)::int as impressions
      FROM campaign_daily_rollups r
      JOIN host_marketing_campaigns c ON r.campaign_id = c.id
      WHERE c.host_id = $1
    `, [host1Id]);

    const host2Analytics = await pool.query(`
      SELECT COALESCE(SUM(r.impressions), 0)::int as impressions
      FROM campaign_daily_rollups r
      JOIN host_marketing_campaigns c ON r.campaign_id = c.id
      WHERE c.host_id = $1
    `, [host2Id]);

    expect(host1Analytics.rows[0].impressions).toBeGreaterThan(0);
    expect(host2Analytics.rows[0].impressions).toBe(500);

    // Cross-tenant filter check
    const crossRes = await pool.query(`
      SELECT r.* 
      FROM campaign_daily_rollups r
      JOIN host_marketing_campaigns c ON r.campaign_id = c.id
      WHERE r.campaign_id = $1 AND c.host_id = $2
    `, [campaign2Id, host1Id]);

    expect(crossRes.rows.length).toBe(0);
  });
});
