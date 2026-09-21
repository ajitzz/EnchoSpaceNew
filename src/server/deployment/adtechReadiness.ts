import {readFileSync} from 'node:fs';
import type pg from 'pg';
export const adtechImmutableTables=['marketing_adtech_tier_profiles','marketing_adtech_profile_versions','marketing_adtech_releases','marketing_adtech_release_members','marketing_adtech_strategy_audits','marketing_destination_corridors','marketing_destination_corridor_versions','marketing_corridor_geography_evidence','marketing_campaign_strategy_bindings','marketing_corridor_inference_requests'];
const mutable=['marketing_corridor_current_versions','marketing_corridor_inference_jobs','marketing_corridor_inference_proposals','marketing_corridor_inference_rate'];
export const adtechTables=[...adtechImmutableTables,...mutable,'marketing_adtech_current_release','marketing_corridor_inference_policy'];
export const adtechSequences=['marketing_adtech_tier_profiles_id_seq','marketing_adtech_profile_versions_id_seq','marketing_adtech_releases_id_seq','marketing_destination_corridors_id_seq','marketing_destination_corridor_versions_id_seq','marketing_corridor_inference_jobs_id_seq','marketing_corridor_inference_proposals_id_seq'];
const normalize=(value:string|null|undefined)=>(value??'').replace(/('[^']*(?:''[^']*)*')|\s+/g,(m,literal:string|undefined)=>literal??'');
const admin='marketing_adtech_is_admin()';
const policies=[
 ...adtechTables.filter(t=>t!=='marketing_campaign_strategy_bindings').map(table=>({table,name:'adtech_admin_access',cmd:'ALL',using:admin,check:admin})),
 {table:'marketing_corridor_inference_requests',name:'inference_own_request',cmd:'SELECT',using:"((host_id)::text = current_setting('app.current_user_id'::text, true))",check:''},
 {table:'marketing_campaign_strategy_bindings',name:'adtech_binding_read',cmd:'SELECT',using:"((host_id = (NULLIF(current_setting('app.current_user_id'::text, true), ''::text))::integer) OR marketing_adtech_is_admin())",check:''},
 {table:'marketing_campaign_strategy_bindings',name:'adtech_binding_insert',cmd:'INSERT',using:'',check:'(marketing_adtech_is_admin() AND (EXISTS ( SELECT 1 FROM marketing_campaign_revisions r WHERE ((r.campaign_id = marketing_campaign_strategy_bindings.campaign_id) AND (r.revision = marketing_campaign_strategy_bindings.revision) AND (r.host_id = marketing_campaign_strategy_bindings.host_id)))))'},
];
const triggerContracts=[
 ...adtechImmutableTables.map(table=>({table,name:table==='marketing_campaign_strategy_bindings'?'marketing_strategy_immutable':'adtech_immutable',fn:'marketing_adtech_immutable',type:27})),
 {table:'marketing_adtech_profile_versions',name:'marketing_adtech_profile_validation',fn:'marketing_adtech_validate_profile',type:7},
 {table:'marketing_adtech_current_release',name:'marketing_adtech_release_validation',fn:'marketing_adtech_validate_release',type:19},
 {table:'marketing_destination_corridor_versions',name:'marketing_adtech_corridor_validation',fn:'marketing_adtech_validate_corridor',type:7},
 {table:'marketing_corridor_inference_proposals',name:'marketing_inference_proposal_immutable',fn:'marketing_inference_preserve_proposal',type:27},
];
const functions=['marketing_adtech_is_admin',...new Set(triggerContracts.map(t=>t.fn))];

/** Reviewed catalog + least-privilege checks, without querying customer data. */
export async function verifyAdtechCatalog(c:pg.PoolClient){
 const rows=(await c.query("SELECT tablename,policyname,permissive,roles::text[] AS roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])",[adtechTables])).rows;
 const policyValid=rows.length===policies.length&&policies.every(p=>rows.some(r=>r.tablename===p.table&&r.policyname===p.name&&r.cmd===p.cmd&&r.permissive==='PERMISSIVE'&&JSON.stringify(r.roles)==='["public"]'&&normalize(r.qual)===normalize(p.using)&&normalize(r.with_check)===normalize(p.check)));
 const grants=(await c.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_has_role(current_user,c.relowner,'USAGE') AS owns,
 has_table_privilege(current_user,c.oid,'SELECT') AS r,has_table_privilege(current_user,c.oid,'INSERT') AS i,has_table_privilege(current_user,c.oid,'UPDATE') AS u,has_table_privilege(current_user,c.oid,'DELETE') AS d,
 has_table_privilege(current_user,c.oid,'TRUNCATE') AS truncate,has_table_privilege(current_user,c.oid,'TRIGGER') AS trigger,
 EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl WHERE acl.grantee=0) AS public_grant
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[adtechTables])).rows;
 const sequenceRows=(await c.query("SELECT c.relname,has_sequence_privilege(current_user,c.oid,'USAGE') AS usage,has_sequence_privilege(current_user,c.oid,'UPDATE') AS update,pg_has_role(current_user,c.relowner,'USAGE') AS owns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[adtechSequences])).rows;
 const privileges=grants.length===adtechTables.length&&grants.every(g=>g.relrowsecurity&&g.relforcerowsecurity&&!g.owns&&g.r&&!g.truncate&&!g.trigger&&!g.public_grant&&g.i===(!['marketing_adtech_current_release','marketing_corridor_inference_policy'].includes(g.relname))&&g.u===(mutable.includes(g.relname)||g.relname==='marketing_adtech_current_release')&&g.d===(g.relname==='marketing_corridor_inference_rate'))&&sequenceRows.length===adtechSequences.length&&sequenceRows.every(s=>s.usage&&!s.update&&!s.owns);
 const triggers=(await c.query("SELECT c.relname,t.tgname,t.tgenabled,t.tgtype,t.tgqual IS NULL AS unconditional,p.proname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal",[adtechTables])).rows;
 const sources=['032_marketing_adtech_registry.sql','033_marketing_adtech_corridors.sql','035_marketing_corridor_inference.sql'].map(name=>readFileSync(new URL('../../migrations/'+name,import.meta.url),'utf8')).join('\n');
 const procs=(await c.query("SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[])",[functions])).rows;
 const immutable=triggers.length===triggerContracts.length&&triggerContracts.every(t=>triggers.some(r=>r.relname===t.table&&r.tgname===t.name&&r.proname===t.fn&&r.tgtype===t.type&&r.unconditional&&['O','A'].includes(r.tgenabled)))&&procs.length===functions.length&&functions.every(fn=>{const body=sources.match(new RegExp(`FUNCTION ${fn}\\([^]*?AS \\$\\$([^]*?)\\$\\$`,'i'))?.[1]?.trim();return !!body&&procs.some(p=>p.proname===fn&&!p.prosecdef&&p.proconfig===null&&p.prosrc.trim()===body);});
 const constraints=(await c.query("SELECT c.relname,pg_get_constraintdef(k.oid) AS definition,k.convalidated FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[adtechTables])).rows;
 const integrity=[['marketing_campaign_strategy_bindings','PRIMARY KEY (campaign_id, revision)'],['marketing_campaign_strategy_bindings','FOREIGN KEY (campaign_id, revision) REFERENCES marketing_campaign_revisions(campaign_id, revision)'],['marketing_corridor_inference_jobs','UNIQUE (location_hash)'],['marketing_corridor_inference_proposals','UNIQUE (job_id)'],['marketing_adtech_strategy_audits','UNIQUE (actor_id, request_key)']].every(([table,definition])=>constraints.some(r=>r.relname===table&&r.convalidated&&r.definition===definition));
 return {ready:policyValid&&privileges&&immutable&&integrity,policyValid,privileges,immutable,integrity};
}
export function adtechRolloutGrants(runtimeRole:string){
 if(!/^[a-z][a-z0-9_]{0,62}$/.test(runtimeRole))throw new Error('RUNTIME_ROLE_INVALID');const role='"'+runtimeRole+'"';
 return [`GRANT SELECT,INSERT ON ${adtechImmutableTables.join(',')} TO ${role}`,
  `GRANT SELECT,INSERT,UPDATE ON ${mutable.join(',')} TO ${role}`,
  `GRANT DELETE ON marketing_corridor_inference_rate TO ${role}`,
  `GRANT SELECT,UPDATE ON marketing_adtech_current_release TO ${role}`,
  `GRANT SELECT ON marketing_corridor_inference_policy TO ${role}`,
  `GRANT USAGE ON SEQUENCE ${adtechSequences.join(',')} TO ${role}`];
}
