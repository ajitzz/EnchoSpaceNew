import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MigrationResult {
  file: string;
  status: 'applied' | 'skipped' | 'failed';
  error?: string;
}

/**
 * Validates database connection string safety.
 * Rejects missing or dummy configurations and warns against running in unsafe conditions.
 */
export function validateDatabaseUrl(rawUrl?: string): { isValid: boolean; error?: string; url?: string } {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return { isValid: false, error: 'DATABASE_URL is missing or empty' };
  }

  const trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();

  if (
    lower.includes('dummy') ||
    lower.includes('example.com') ||
    lower.includes('placeholder') ||
    lower === 'postgresql://' ||
    lower === 'postgres://'
  ) {
    return { isValid: false, error: 'DATABASE_URL contains placeholder or dummy credentials' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      return { isValid: false, error: `Invalid protocol: ${parsed.protocol}` };
    }
  } catch (err: any) {
    return { isValid: false, error: `Malformed connection URL: ${err.message}` };
  }

  return { isValid: true, url: trimmed };
}

/**
 * Computes SHA-256 checksum of migration file content for audit & drift detection.
 */
export function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Migration Runner with:
 * - Advisory locking (pg_advisory_lock)
 * - Checksum auditing
 * - Transactional execution for transactional migrations
 * - Non-destructive rollback notes
 */
export async function runMigrations(customPool?: any): Promise<MigrationResult[]> {
  const dbCheck = validateDatabaseUrl(process.env.DATABASE_URL);
  if (!customPool && !dbCheck.isValid) {
    throw new Error(`[MIGRATION_ABORTED] ${dbCheck.error}`);
  }

  // Safe SSL resolution preserving SSL parameters without leaking credentials to logs
  const isLocal = process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1');
  const pool = customPool || new Pool({
    connectionString: dbCheck.url,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  const results: MigrationResult[] = [];

  // Encho advisory lock key (hash of 'encho_schema_migrations')
  const ADVISORY_LOCK_ID = 82749102;

  try {
    // 1. Acquire transactional advisory lock to prevent concurrent runner collisions
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);

    // 2. Create or upgrade schema_migrations audit table with checksum support
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64)
      );
    `);

    // Ensure checksum column exists if table was previously created
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'schema_migrations' AND column_name = 'checksum'
        ) THEN
          ALTER TABLE schema_migrations ADD COLUMN checksum VARCHAR(64);
        END IF;
      END $$;
    `);

    // 3. Discover .sql migration files in src/migrations
    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file;
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const currentChecksum = computeChecksum(sql);

      const checkResult = await client.query(
        'SELECT version, checksum FROM schema_migrations WHERE version = $1',
        [version]
      );

      if (checkResult.rows.length > 0) {
        const recorded = checkResult.rows[0];
        if (recorded.checksum && recorded.checksum !== currentChecksum) {
          console.warn(`[MIGRATION CHECKSUM DRIFT WARNING] File ${file} has changed since being applied! Recorded: ${recorded.checksum}, Current: ${currentChecksum}`);
        }
        results.push({ file, status: 'skipped' });
        continue;
      }

      // Check if migration declares non-transactional execution (e.g., CREATE INDEX CONCURRENTLY)
      const isNonTransactional = sql.includes('-- NON-TRANSACTIONAL') || sql.includes('CONCURRENTLY');

      try {
        if (isNonTransactional) {
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (version, applied_at, checksum) VALUES ($1, NOW(), $2)',
            [version, currentChecksum]
          );
        } else {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (version, applied_at, checksum) VALUES ($1, NOW(), $2)',
            [version, currentChecksum]
          );
          await client.query('COMMIT');
        }
        results.push({ file, status: 'applied' });
      } catch (err: any) {
        if (!isNonTransactional) {
          await client.query('ROLLBACK');
        }
        results.push({ file, status: 'failed', error: err?.message || String(err) });
        break; // Stop running further migrations on failure
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch (_e) { /* non-blocking unlock */ }
    client.release();
    if (!customPool) {
      await pool.end();
    }
  }

  return results;
}

// CLI entry point
if (process.argv[1] && (process.argv[1].endsWith('runner.ts') || process.argv[1].endsWith('runner.js'))) {
  console.log('--- ENCHO HARDENED VERSIONED MIGRATION RUNNER ---');
  runMigrations()
    .then(results => {
      console.log('Migration execution summary:');
      results.forEach(r => {
        console.log(` - ${r.file}: [${r.status.toUpperCase()}] ${r.error ? `Error: ${r.error}` : ''}`);
      });
      const hasFailure = results.some(r => r.status === 'failed');
      process.exit(hasFailure ? 1 : 0);
    })
    .catch(err => {
      console.error('[FATAL MIGRATION ERROR]:', err.message);
      process.exit(1);
    });
}
