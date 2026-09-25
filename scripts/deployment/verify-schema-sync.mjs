#!/usr/bin/env node
/**
 * FAANG L7/L8 Deployment Schema Synchronicity Gatekeeper.
 *
 * Verifies that the target database instance is fully synchronized with the
 * migration manifest in src/migrations/ before release certification.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { deployedMigrationManifest } from '../../build/server/src/server/deployment/recoveryReadiness.js';

dotenv.config({ quiet: true });

async function verifySchemaSync() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || /dummy|placeholder|example\.com/i.test(dbUrl)) {
    console.log(JSON.stringify({
      event: 'SCHEMA_SYNC_SKIPPED',
      reason: 'No live target DATABASE_URL configured in runtime environment (offline build).',
    }));
    return;
  }

  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  try {
    const tableCheck = await pool.query(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists"
    );
    if (!tableCheck.rows[0]?.exists) {
      console.error(JSON.stringify({
        event: 'SCHEMA_SYNC_FAILED',
        error: 'SCHEMA_MIGRATIONS_TABLE_MISSING',
        message: 'The public.schema_migrations table does not exist on the target database.',
      }));
      process.exit(1);
    }

    const dbRows = (
      await pool.query('SELECT version, checksum FROM public.schema_migrations ORDER BY version')
    ).rows;

    const manifest = deployedMigrationManifest();
    const appliedVersions = new Set(dbRows.map(r => r.version));
    const unapplied = manifest.filter(m => !appliedVersions.has(m.version));

    if (unapplied.length > 0) {
      console.error(JSON.stringify({
        event: 'SCHEMA_SYNC_FAILED',
        error: 'UNAPPLIED_MIGRATIONS_DETECTED',
        unappliedCount: unapplied.length,
        unappliedFiles: unapplied.map(u => u.version),
        message: 'Deployment blocked: Target database is behind migration manifest. Run npm run migrate before deploying.',
      }, null, 2));
      process.exit(1);
    }

    console.log(JSON.stringify({
      event: 'SCHEMA_SYNCHRONICITY_VERIFIED',
      manifestCount: manifest.length,
      appliedCount: dbRows.length,
      status: 'SYNCHRONIZED',
    }));
  } catch (err) {
    console.error(JSON.stringify({
      event: 'SCHEMA_SYNC_ERROR',
      error: err.message,
    }));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifySchemaSync();
