/**
 * scripts/preflight_m3_constraints.ts
 *
 * DATABASE-ENFORCED READ-ONLY Preflight Verification Script for Milestone 3 Canonical Constraints.
 *
 * SAFETY INVARIANTS:
 * - Database-enforced read-only transaction: Executes `BEGIN READ ONLY`.
 * - Closes with `ROLLBACK` to guarantee zero state modification.
 * - Missing tables cause fail-closed behavior: `cleared = false` and process exit non-zero.
 * - Inspects existing table data for:
 *    1. media_assets.moderation_status invalid values (values outside NULL, 'pending_review', 'approved', 'rejected').
 *       Note: NULL is explicitly allowed by migration 004 for legacy compatibility, but will never satisfy publication.
 *       The preflight reports legacy NULL counts as informational metrics without flagging them as constraint violations.
 *    2. room_types.base_price < 0
 *    3. room_types.max_occupancy < 1
 *    4. room_types.inventory_count < 1
 *    5. room_types.min_stay_nights < 1
 * - Reports violation counts and sample IDs (up to 10) for human audit.
 */

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

export interface InvariantReport {
  name: string;
  table: string;
  column: string;
  condition: string;
  count: number;
  sampleIds: (number | string)[];
  isViolation: boolean;
  notes?: string;
  status: 'CLEARED' | 'VIOLATIONS_FOUND' | 'TABLE_NOT_FOUND' | 'INFORMATIONAL';
}

export interface PreflightResult {
  timestamp: string;
  totalViolations: number;
  legacyNullCount: number;
  missingTables: string[];
  cleared: boolean;
  reports: InvariantReport[];
}

export async function runReadOnlyPreflight(customPool?: any): Promise<PreflightResult> {
  const isLocal = process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1');
  const pool = customPool || new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  const reports: InvariantReport[] = [];
  const missingTables: string[] = [];
  let totalViolations = 0;
  let legacyNullCount = 0;

  try {
    // ENFORCE DATABASE-LEVEL READ-ONLY TRANSACTION
    await client.query('BEGIN READ ONLY');

    // Helper to verify table existence safely inside transaction
    const tableExists = async (tableName: string): Promise<boolean> => {
      const res = await client.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
        [tableName]
      );
      return res.rows.length > 0;
    };

    const hasMediaAssets = await tableExists('media_assets');
    const hasRoomTypes = await tableExists('room_types');

    if (!hasMediaAssets) {
      missingTables.push('media_assets');
    }
    if (!hasRoomTypes) {
      missingTables.push('room_types');
    }

    // 1. media_assets checks
    if (!hasMediaAssets) {
      reports.push({
        name: 'Media moderation status invalid values',
        table: 'media_assets',
        column: 'moderation_status',
        condition: "moderation_status IS NOT NULL AND moderation_status NOT IN ('pending_review', 'approved', 'rejected')",
        count: 0,
        sampleIds: [],
        isViolation: true,
        notes: 'Required table media_assets is missing from public schema.',
        status: 'TABLE_NOT_FOUND'
      });
    } else {
      // 1a. Invalid moderation_status (actual constraint violation)
      const invalidCountRes = await client.query(`
        SELECT COUNT(*)::int AS total
        FROM media_assets
        WHERE moderation_status IS NOT NULL
          AND moderation_status NOT IN ('pending_review', 'approved', 'rejected');
      `);
      const invalidSampleRes = await client.query(`
        SELECT COALESCE(ARRAY_AGG(id ORDER BY id), ARRAY[]::int[]) AS sample_ids
        FROM (
          SELECT id FROM media_assets
          WHERE moderation_status IS NOT NULL
            AND moderation_status NOT IN ('pending_review', 'approved', 'rejected')
          LIMIT 10
        ) sub;
      `);

      const invCount = invalidCountRes.rows[0]?.total || 0;
      const invSamples = invalidSampleRes.rows[0]?.sample_ids || [];
      totalViolations += invCount;

      reports.push({
        name: 'Media moderation status invalid values',
        table: 'media_assets',
        column: 'moderation_status',
        condition: "moderation_status IS NOT NULL AND moderation_status NOT IN ('pending_review', 'approved', 'rejected')",
        count: invCount,
        sampleIds: invSamples,
        isViolation: true,
        notes: 'Values outside allowed set violate chk_media_assets_moderation_status.',
        status: invCount === 0 ? 'CLEARED' : 'VIOLATIONS_FOUND'
      });

      // 1b. Legacy NULL moderation_status (allowed by constraint, but not publication-eligible)
      const nullCountRes = await client.query(`
        SELECT COUNT(*)::int AS total
        FROM media_assets
        WHERE moderation_status IS NULL;
      `);
      const nullSampleRes = await client.query(`
        SELECT COALESCE(ARRAY_AGG(id ORDER BY id), ARRAY[]::int[]) AS sample_ids
        FROM (
          SELECT id FROM media_assets
          WHERE moderation_status IS NULL
          LIMIT 10
        ) sub;
      `);
      legacyNullCount = nullCountRes.rows[0]?.total || 0;
      const nullSamples = nullSampleRes.rows[0]?.sample_ids || [];

      reports.push({
        name: 'Media moderation status NULL (legacy compatibility)',
        table: 'media_assets',
        column: 'moderation_status',
        condition: 'moderation_status IS NULL',
        count: legacyNullCount,
        sampleIds: nullSamples,
        isViolation: false,
        notes: 'Explicitly allowed by migration 004 for legacy compatibility; not a check constraint violation, but cannot satisfy publication.',
        status: 'INFORMATIONAL'
      });
    }

    // 2. room_types checks
    const roomChecks = [
      {
        name: 'Room base_price must be >= 0',
        column: 'base_price',
        condition: 'base_price < 0'
      },
      {
        name: 'Room max_occupancy must be >= 1',
        column: 'max_occupancy',
        condition: 'max_occupancy < 1'
      },
      {
        name: 'Room inventory_count must be >= 1',
        column: 'inventory_count',
        condition: 'inventory_count < 1'
      },
      {
        name: 'Room min_stay_nights must be >= 1',
        column: 'min_stay_nights',
        condition: 'min_stay_nights < 1'
      }
    ];

    if (!hasRoomTypes) {
      for (const check of roomChecks) {
        reports.push({
          name: check.name,
          table: 'room_types',
          column: check.column,
          condition: check.condition,
          count: 0,
          sampleIds: [],
          isViolation: true,
          notes: 'Required table room_types is missing from public schema.',
          status: 'TABLE_NOT_FOUND'
        });
      }
    } else {
      for (const check of roomChecks) {
        const countRes = await client.query(`
          SELECT COUNT(*)::int AS total
          FROM room_types
          WHERE ${check.condition};
        `);
        const sampleRes = await client.query(`
          SELECT COALESCE(ARRAY_AGG(id ORDER BY id), ARRAY[]::int[]) AS sample_ids
          FROM (
            SELECT id FROM room_types
            WHERE ${check.condition}
            LIMIT 10
          ) sub;
        `);
        const count = countRes.rows[0]?.total || 0;
        const samples = sampleRes.rows[0]?.sample_ids || [];
        totalViolations += count;

        reports.push({
          name: check.name,
          table: 'room_types',
          column: check.column,
          condition: check.condition,
          count,
          sampleIds: samples,
          isViolation: true,
          notes: `Must satisfy ${check.condition} constraint.`,
          status: count === 0 ? 'CLEARED' : 'VIOLATIONS_FOUND'
        });
      }
    }
  } finally {
    // Guaranteed ROLLBACK to leave zero state changes
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackErr) {
      // client release handles cleanup
    }
    client.release();
    if (!customPool) {
      await pool.end();
    }
  }

  const cleared = totalViolations === 0 && missingTables.length === 0;

  return {
    timestamp: new Date().toISOString(),
    totalViolations,
    legacyNullCount,
    missingTables,
    cleared,
    reports
  };
}

// CLI Execution
if (process.argv[1] && (process.argv[1].endsWith('preflight_m3_constraints.ts') || process.argv[1].endsWith('preflight_m3_constraints.js'))) {
  console.log('--- READ-ONLY PREFLIGHT AUDIT: CANONICAL ROOM & MEDIA CONSTRAINTS ---');
  console.log('Connecting to database in READ-ONLY mode (BEGIN READ ONLY)...');

  runReadOnlyPreflight()
    .then(result => {
      console.log(`\nAudit Timestamp: ${result.timestamp}`);
      console.log(`Overall Status: ${result.cleared ? '✅ ALL INVARIANTS CLEARED' : '❌ NOT CLEARED'}`);
      console.log(`Total Invariant Violations: ${result.totalViolations}`);
      console.log(`Legacy NULL Moderation Count: ${result.legacyNullCount} (allowed by migration 004, but not publication-eligible)`);
      if (result.missingTables.length > 0) {
        console.error(`Missing Required Schema Tables: ${result.missingTables.join(', ')}`);
      }
      console.log('');

      console.table(result.reports.map(r => ({
        Table: r.table,
        Column: r.column,
        Count: r.count,
        SampleIDs: r.sampleIds.length > 0 ? r.sampleIds.join(', ') : 'None',
        Status: r.status,
        IsViolation: r.isViolation ? 'YES' : 'NO (Legacy/Info)'
      })));

      if (!result.cleared) {
        if (result.missingTables.length > 0) {
          console.error('\n❌ FAIL-CLOSED: Missing required schema tables. Database schema is not ready.');
        } else {
          console.warn('\n⚠️  ACTION REQUIRED: Remediate existing violation rows before running any future constraint validation.');
        }
        process.exit(1);
      } else {
        console.log('\n✅ Safe to apply migration 004_canonical_constraints.sql (added with NOT VALID).');
        console.log('✅ Invariant checks passed in read-only mode.');
        process.exit(0);
      }
    })
    .catch(err => {
      console.error('[FATAL PREFLIGHT ERROR]:', err.message);
      process.exit(1);
    });
}
