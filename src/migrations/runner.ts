import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import dotenv from 'dotenv';
import {executeMigrations,MigrationExecutionError,type MigrationResult} from './execution.js';
export type {MigrationResult} from './execution.js';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validates database connection string safety.
 * Rejects missing or dummy configurations and warns against running in unsafe conditions.
 */
export function validateDatabaseUrl(rawUrl?:string):{isValid:boolean;error?:string;url?:string}{
  try{
    if(!rawUrl||/dummy|placeholder|example\.com/i.test(rawUrl))throw new Error();
    const parsed=new URL(rawUrl.trim());
    const local=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
    if(!['postgres:','postgresql:'].includes(parsed.protocol)||!parsed.hostname||!parsed.username||parsed.pathname.length<2||parsed.hash||(!local&&!parsed.password))throw new Error();
    for(const name of parsed.searchParams.keys())if(!['sslmode','channel_binding'].includes(name))throw new Error();
    parsed.searchParams.delete('sslmode');parsed.searchParams.delete('channel_binding');
    return {isValid:true,url:parsed.toString()};
  }catch{return {isValid:false,error:'DATABASE_URL is missing or invalid for migration execution'};}
}

export function migrationConnectionConfig(rawUrl?:string):pkg.PoolConfig{
  const validated=validateDatabaseUrl(rawUrl);
  if(!validated.isValid||!validated.url)throw new MigrationExecutionError('MIGRATION_CONFIGURATION_INVALID');
  const local=['localhost','127.0.0.1','[::1]'].includes(new URL(validated.url).hostname);
  return {connectionString:validated.url,ssl:local?false:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000,application_name:'encho_schema_migrations'};
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
export async function runMigrations(customPool?:pkg.Pool):Promise<MigrationResult[]>{
  const pool=customPool??new Pool(migrationConnectionConfig(process.env.DATABASE_URL));
  try{
    const entries=fs.readdirSync(__dirname).filter(file=>file.endsWith('.sql')).sort().map(file=>{
      const sql=fs.readFileSync(path.join(__dirname,file),'utf8');
      return {file,sql,checksum:computeChecksum(sql)};
    });
    return await executeMigrations(pool,entries);
  }finally{if(!customPool)await pool.end();}
}

// CLI entry point
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  dotenv.config({quiet:true});
  console.log('--- ENCHO HARDENED VERSIONED MIGRATION RUNNER ---');
  runMigrations()
    .then(results => {
      console.log('Migration execution summary:');
      results.forEach(r => {
        console.log(` - ${r.file}: [${r.status.toUpperCase()}] ${r.error ? `Error: ${r.error}` : ''}`);
      });
      const hasFailure = results.some(r => r.status === 'failed' || r.status === 'unknown');
      process.exit(hasFailure ? 1 : 0);
    })
    .catch(err => {
      console.error('[FATAL MIGRATION ERROR]:', err instanceof MigrationExecutionError ? err.message : 'MIGRATION_EXECUTION_FAILED');
      process.exit(1);
    });
}
