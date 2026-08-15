import { Pool } from 'pg';

// We flag whether we already hooked so we don't infinitely wrap the query prototype
let isHooked = false;

export function enforceTestDatabaseSafety() {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  if (!isTestEnv) {
    throw new Error('TEST_DATABASE_SAFETY_VIOLATION: NODE_ENV must be "test" or VITEST="true"');
  }

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error('TEST_DATABASE_SAFETY_VIOLATION: TEST_DATABASE_URL is required for tests. Execution blocked.');
  }

  const prodUrl = process.env.DATABASE_URL;
  if (testUrl === prodUrl && testUrl) {
    throw new Error('TEST_DATABASE_SAFETY_VIOLATION: TEST_DATABASE_URL matches production DATABASE_URL.');
  }

  if (!testUrl.includes('test') && !testUrl.includes('localhost') && !testUrl.includes('127.0.0.1')) {
    throw new Error('TEST_DATABASE_SAFETY_VIOLATION: TEST_DATABASE_URL does not match an approved test database pattern.');
  }

  // Override DATABASE_URL for the current process so pool gets test URL
  process.env.DATABASE_URL = testUrl;

  if (isHooked) return;

  const originalQuery = Pool.prototype.query;
  Pool.prototype.query = function (...args: any[]) {
    const text = args[0];
    let sql = typeof text === 'string' ? text : text?.text || '';
    sql = sql.toUpperCase();

    // Check for destructive commands
    const isDestructive = 
      sql.includes('DROP TABLE') ||
      sql.includes('DROP SCHEMA') ||
      sql.includes('TRUNCATE TABLE') ||
      sql.includes('ALTER TABLE') ||
      sql.match(/DELETE\s+FROM\s+\w+(?!\s+WHERE)/); // Unscoped DELETE

    if (isDestructive) {
      // Re-verify at query time just in case someone messed with env vars during the test
      const queryIsTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
      if (!queryIsTestEnv || !process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
        throw new Error('PRODUCTION_DATABASE_DESTRUCTIVE_QUERY_BLOCKED: Destructive queries are not allowed outside of isolated test environments.');
      }
    }

    return originalQuery.apply(this, args as any) as any;
  };
  
  isHooked = true;
}
