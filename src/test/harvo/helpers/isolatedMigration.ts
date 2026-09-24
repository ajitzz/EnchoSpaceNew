import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type pg from 'pg';

/** Test-only isolated schema setup, not a full deployment rehearsal. Tests that
 * synthesize predecessor history must never ask the production runner to accept
 * an out-of-order catalog. Actual runner integrity has its own PostgreSQL suite. */
export async function applyIsolatedMigration(pool:pg.Pool,file:string):Promise<void>{
 if(!/^\d{3}_[a-z0-9_]+\.sql$/.test(file))throw new Error('Invalid isolated migration');
 const sql=readFileSync(new URL(`../../../migrations/${file}`,import.meta.url),'utf8');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(82749102)');
  await client.query(sql);
  await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[file,createHash('sha256').update(sql).digest('hex')]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
