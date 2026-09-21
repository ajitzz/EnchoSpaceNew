import {readFileSync} from 'node:fs';
import type pg from 'pg';
import {deployedMigrationManifest} from './recoveryReadiness.js';
import {adtechRolloutGrants,verifyAdtechCatalog} from './adtechReadiness.js';

/** Explicit caller-owned connection only. Exact 032–035 DDL, grants and history always roll back. */
export async function rehearseAdtechRollout(c:pg.PoolClient,runtimeRole:string){
 const grants=adtechRolloutGrants(runtimeRole),manifest=deployedMigrationManifest(),batch=manifest.filter(m=>/^(032|033|034|035)_/.test(m.version));
 if(batch.length!==4)throw new Error('ADTECH_MANIFEST_INVALID');
 await c.query('BEGIN');
 try{
  await c.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='60s'; SET LOCAL search_path=public,pg_catalog");
  if(!(await c.query('SELECT pg_try_advisory_xact_lock(82749102) AS acquired')).rows[0]?.acquired)throw new Error('MIGRATION_LOCK_BUSY');
  const role=(await c.query('SELECT oid,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication FROM pg_roles WHERE rolname=$1',[runtimeRole])).rows[0];
  if(!role||role.rolsuper||role.rolbypassrls||role.rolcreaterole||role.rolcreatedb||role.rolreplication)throw new Error('RUNTIME_ROLE_UNSAFE');
  const reachable=(await c.query(`WITH RECURSIVE roles(oid) AS (SELECT $1::oid UNION SELECT m.roleid FROM pg_auth_members m JOIN roles r ON m.member=r.oid)
   SELECT EXISTS(SELECT 1 FROM roles r JOIN pg_roles p ON p.oid=r.oid WHERE p.rolsuper OR p.rolbypassrls OR p.rolcreaterole OR p.rolcreatedb OR p.rolreplication)
   OR EXISTS(SELECT 1 FROM roles r JOIN pg_class t ON t.relowner=r.oid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relkind IN ('r','p','S')) AS unsafe`,[role.oid])).rows[0]?.unsafe;
  if(reachable)throw new Error('RUNTIME_ROLE_OWNER_OR_PRIVILEGED_MEMBER');
  const history=(await c.query('SELECT version,checksum FROM schema_migrations')).rows;
  for(const migration of manifest){const recorded=history.find(r=>r.version===migration.version);if(recorded?recorded.checksum!==migration.checksum:Number(migration.version.slice(0,3))<32)throw new Error('MIGRATION_HISTORY_MISSING_OR_DRIFTED');}
  const executed:string[]=[];
  for(const migration of batch){if(history.some(r=>r.version===migration.version))continue;
   await c.query(readFileSync(new URL('../../migrations/'+migration.version,import.meta.url),'utf8'));
   await c.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[migration.version,migration.checksum]);executed.push(migration.version);
  }
  for(const grant of grants)await c.query(grant);
  await c.query(`SET LOCAL ROLE "${runtimeRole}"`);
  const catalog=await verifyAdtechCatalog(c);if(!catalog.ready)throw new Error('ADTECH_CATALOG_REJECTED');
  return {status:'REHEARSED_ROLLED_BACK' as const,executed,retained:batch.filter(m=>!executed.includes(m.version)).map(m=>m.version),catalog};
 }finally{await c.query('ROLLBACK');}
}
