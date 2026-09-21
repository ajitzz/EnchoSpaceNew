import {readFileSync} from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import {rehearsePortfolioRollout,stagedRehearsalConnection} from './portfolioRehearsal.js';

// Explicit secret file; no fallback to ambient DATABASE_URL, .env, or production startup.
let pool:pg.Pool|undefined;
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--env-file') throw new Error('EXPLICIT_STAGING_FILE_REQUIRED');
  const env = parse(readFileSync(args[1]));
  pool = new pg.Pool(stagedRehearsalConnection(env));
  const c = await pool.connect();
  try {
    const result = await rehearsePortfolioRollout(c,env.HARVO_STAGING_RUNTIME_ROLE);
    console.log(JSON.stringify({evidence:'STAGED_REHEARSAL_NOT_DEPLOYMENT',branch:env.HARVO_STAGING_BRANCH_ID,...result}));
  } finally { c.release(); }
} catch (error) {
  const known = new Set(['EXPLICIT_STAGING_FILE_REQUIRED','STAGING_IDENTITY_REQUIRED','DIRECT_STAGING_ENDPOINT_REQUIRED','UNEXPECTED_CONNECTION_OPTION','RUNTIME_ROLE_INVALID','ROLLOUT_MANIFEST_INVALID','MIGRATION_LOCK_BUSY','RUNTIME_ROLE_UNSAFE','RUNTIME_ROLE_OWNER_OR_PRIVILEGED_MEMBER','MIGRATION_HISTORY_MISSING_OR_DRIFTED','TRANSACTIONAL_BATCH_REQUIRED','PORTFOLIO_CATALOG_REJECTED']);
  const reason = error instanceof Error && known.has(error.message) ? error.message : 'CONFIGURATION_OR_DATABASE_FAILURE';
  console.error(JSON.stringify({event:'HARVO_STAGING_REHEARSAL_FAILED',reason,committed:false}));
  process.exitCode = 1;
} finally { await pool?.end(); }
