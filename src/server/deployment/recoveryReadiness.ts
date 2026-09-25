import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import type pg from 'pg';

const migrationDirectory=new URL('../../migrations/',import.meta.url);
export function deployedMigrationManifest(){
 return readdirSync(migrationDirectory).filter(name=>/^\d+_[a-z0-9_]+\.sql$/.test(name)).sort().map(version=>({version,checksum:createHash('sha256').update(readFileSync(new URL(version,migrationDirectory))).digest('hex')}));
}
export async function verifyMigrationHistory(c:pg.PoolClient){
 const exists=(await c.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present")).rows[0]?.present===true;
 if(!exists)return false;
 const authority=(await c.query("SELECT pg_has_role(current_user,c.relowner,'USAGE') AS owns,has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') AS can_mutate FROM pg_class c WHERE c.oid='public.schema_migrations'::regclass")).rows[0];
 const isOwner = Boolean(authority?.owns || authority?.can_mutate);
 if(!authority||(!isOwner&&authority.can_mutate))return false;
 const rows=(await c.query('SELECT version,checksum FROM public.schema_migrations')).rows;
 const manifest=deployedMigrationManifest();
 return manifest.length>0&&manifest.every(expected=>rows.some(row=>row.version===expected.version&&row.checksum===expected.checksum));
}
const normalize=(sql:string|null|undefined)=>(sql||'').replace(/::text/g,'').replace(/[\s()]/g,'');
const adminExpression=normalize("current_setting('app.marketing_admin', true) = 'true'");
const contracts=[
 {table:'marketing_pause_recoveries',policy:'harvo_pause_recovery_admin',cmd:'SELECT',qual:adminExpression,check:'',trigger:'marketing_pause_recovery_immutable',fn:'harvo_reject_evidence_mutation',migration:'010_harvo_marketing_workflow.sql'},
 {table:'marketing_pause_recoveries',policy:'harvo_pause_recovery_record',cmd:'INSERT',qual:'',check:adminExpression},
 {table:'marketing_pause_recovery_attempts',policy:'harvo_pause_attempt_admin',cmd:'ALL',qual:adminExpression,check:adminExpression,trigger:'marketing_pause_attempt_guard',fn:'harvo_guard_pause_attempt',migration:'022_marketing_pause_recovery_attempts.sql'},
];
/** Catalog assertions complement behavioral non-bypass-role tests; no customer data is read. */
export async function verifyRecoveryCatalog(c:pg.PoolClient){
 const tables=['marketing_pause_recoveries','marketing_pause_recovery_attempts'];
 const policies=(await c.query('SELECT tablename,policyname,permissive,roles::text[] AS roles,cmd,qual,with_check FROM pg_policies WHERE schemaname=\'public\' AND tablename=ANY($1::text[])',[tables])).rows;
 const policyValid=policies.length===contracts.length&&contracts.every(expected=>policies.some(p=>p.tablename===expected.table&&p.policyname===expected.policy&&p.permissive==='PERMISSIVE'&&JSON.stringify(p.roles)===JSON.stringify(['public'])&&p.cmd===expected.cmd&&normalize(p.qual)===expected.qual&&normalize(p.with_check)===expected.check));
 const triggers=(await c.query(`SELECT c.relname,t.tgname,t.tgenabled,t.tgtype,t.tgqual IS NULL AS unconditional,p.proname,p.prosrc,p.prosecdef,p.proconfig,n.nspname AS function_schema
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
  JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE cn.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal`,[tables])).rows;
 const immutable=contracts.filter(expected=>expected.trigger).every(expected=>{
  const sql=readFileSync(new URL(expected.migration!,migrationDirectory),'utf8');
  const body=sql.match(new RegExp(`FUNCTION ${expected.fn}\\([^]*?AS \\$\\$([^]*?)\\$\\$`,'i'))?.[1]?.trim();
  return !!body&&triggers.some(t=>t.relname===expected.table&&t.tgname===expected.trigger&&['O','A'].includes(t.tgenabled)&&t.tgtype===27&&t.unconditional===true&&t.proname===expected.fn&&t.function_schema==='public'&&t.prosecdef===false&&t.proconfig===null&&t.prosrc.trim()===body);
 });
 const grants=(await c.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_has_role(current_user,c.relowner,'USAGE') AS owns,
  has_table_privilege(current_user,c.oid,'SELECT') AS can_read,has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
  has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,
  has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,has_table_privilege(current_user,c.oid,'TRIGGER') AS can_trigger,
  EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl WHERE acl.grantee=0) AS public_grant
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[tables])).rows;
 const isOwner=grants.some(g=>g.owns);
 const privileges=grants.length===2&&grants.every(g=>g.relrowsecurity&&g.relforcerowsecurity&&(isOwner||!g.owns)&&g.can_read&&g.can_insert&&(isOwner||(!g.can_delete&&!g.can_truncate&&!g.can_trigger&&!g.public_grant&&(g.can_update===(g.relname==='marketing_pause_recovery_attempts')))));
 const indexes=(await c.query(`SELECT i.indisunique,i.indisvalid,i.indisready,pg_get_expr(i.indpred,i.indrelid) AS predicate,pg_get_indexdef(i.indexrelid,1,true) AS column_name,i.indnkeyatts
 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid JOIN pg_namespace n ON n.oid=idx.relnamespace
 WHERE n.nspname='public' AND idx.relname='marketing_pause_recovery_one_reader' AND i.indrelid=to_regclass('public.marketing_pause_recovery_attempts')`)).rows;
 const claimIndex=indexes.length===1&&indexes[0].indisunique&&indexes[0].indisvalid&&indexes[0].indisready&&indexes[0].column_name==='job_id'&&indexes[0].indnkeyatts===1&&normalize(indexes[0].predicate)===normalize("state = 'RUNNING'");
 return {ready:policyValid&&immutable&&privileges&&claimIndex,policyValid,immutable,privileges,claimIndex};
}
