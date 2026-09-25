import {readFileSync} from 'node:fs';
import type pg from 'pg';
import {z} from 'zod';
import {serviceCaseColumnContract,serviceCaseConstraintContract,serviceCaseIndexContract,serviceCaseTriggerContract} from './serviceCaseCatalogContract.js';
import {conversationConstraintContract} from './conversationCatalogContract.js';

export const serviceCaseTables=['service_case_runtime_bindings','service_cases','service_case_requests','service_case_events','service_case_internal_notes','service_case_content_access_receipts'] as const;
export const serviceCaseFunctions=[
 'service_case_immutable()','service_case_guard_transition()',
 'service_case_require_staff(uuid,uuid,integer,bigint,text)',
 'service_case_context_allowed(integer)','service_case_message_allowed(integer,bigint)',
 'service_case_request(integer,uuid,text)','service_case_withdraw(uuid,integer)','service_case_status(integer)',
 'service_case_prepare_content(uuid,uuid,integer,bigint,bigint,integer,text)',
 'service_case_read_content(uuid)','service_case_add_note(uuid,uuid,integer,bigint,uuid,text)',
 'service_case_resolve_dispatch(uuid,integer)',
] as const;
const definerFunctions=serviceCaseFunctions.slice(2).filter(fn=>!fn.startsWith('service_case_context_allowed')&&!fn.startsWith('service_case_message_allowed'));
const roleSchema=z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const normalized=(value:string|null)=>value?.replace(/'(?:''|[^'])*'|\s+/g,part=>part.startsWith("'")?part:'')??'';
export const serviceCaseThreadExpression='(((conversation_actor_id() = guest_id) OR (conversation_actor_id() = host_id)) OR service_case_context_allowed(id))';
export const serviceCaseMessageExpression='(((thread_id IS NULL) AND ((conversation_actor_id() = sender_id) OR (conversation_actor_id() = receiver_id))) OR (EXISTS ( SELECT 1 FROM threads t WHERE ((t.id = messages.thread_id) AND ((conversation_actor_id() = t.guest_id) OR (conversation_actor_id() = t.host_id))))) OR service_case_message_allowed(thread_id, conversation_sequence))';

/** Provision three DISTINCT roles first. DBA applies, verifies and records these
 * statements; application startup cannot create or grant its own authority. */
export function serviceCaseRolloutGrants(raw:unknown):string[]{
 const c=z.object({consumerRole:roleSchema,staffRole:roleSchema,definerRole:roleSchema,organizationId:z.string().uuid(),environment:z.enum(['LOCAL','STAGING','PRODUCTION']),disclosureVersion:z.string().regex(/^[a-z0-9][a-z0-9._:-]{2,99}$/)}).strict().parse(raw);
 if(new Set([c.consumerRole,c.staffRole,c.definerRole]).size!==3)throw new Error('SERVICE_CASE_DISTINCT_ROLES_REQUIRED');
 const consumer=`"${c.consumerRole}"`,staff=`"${c.staffRole}"`,definer=`"${c.definerRole}"`;
 return [
  `GRANT USAGE,CREATE ON SCHEMA public TO ${definer}`,
  ...serviceCaseFunctions.map(fn=>`ALTER FUNCTION ${fn} OWNER TO ${definer}`),
  `REVOKE CREATE ON SCHEMA public FROM ${definer}`,
  `GRANT SELECT ON ${serviceCaseTables.join(',')},internal_permission_catalog,internal_iam_current_policy,internal_iam_policy_versions,internal_work_assignments TO ${definer}`,
  `GRANT INSERT ON service_cases,service_case_requests,service_case_events,service_case_internal_notes,service_case_content_access_receipts TO ${definer}`,
  `GRANT UPDATE(state,version,withdrawn_at,withdrawn_by) ON service_cases TO ${definer}`,
  `GRANT USAGE ON SEQUENCE service_case_internal_notes_id_seq TO ${definer}`,
  `GRANT SELECT(id,guest_id,host_id,listing_id,experience_id,last_message_sequence) ON threads TO ${definer}`,
  `GRANT SELECT(id,thread_id,sender_id,receiver_id,content,conversation_sequence,created_at) ON messages TO ${definer}`,
  `GRANT EXECUTE ON FUNCTION conversation_actor_id(),internal_iam_current_user_id(),internal_iam_current_membership_id(),internal_iam_current_session_id(),internal_iam_current_organization_id(),internal_iam_is_active_session(uuid),internal_iam_lock_authority(),internal_iam_has_permission(uuid,text,text,text,text,text,bigint) TO ${definer}`,
  ...serviceCaseTables.flatMap(table=>[`DROP POLICY IF EXISTS service_case_helper_access ON ${table}`,`CREATE POLICY service_case_helper_access ON ${table} FOR ALL TO ${definer} USING(true) WITH CHECK(true)`]),
  'DROP POLICY IF EXISTS service_case_thread_context ON threads',
  `CREATE POLICY service_case_thread_context ON threads FOR SELECT TO ${definer} USING(service_case_context_allowed(id) OR conversation_actor_id() IN(guest_id,host_id))`,
  'DROP POLICY IF EXISTS service_case_message_content ON messages',
  `CREATE POLICY service_case_message_content ON messages FOR SELECT TO ${definer} USING(service_case_message_allowed(thread_id,conversation_sequence))`,
  `REVOKE ALL ON ${serviceCaseTables.join(',')} FROM ${consumer},${staff}`,
  `REVOKE ALL ON threads,messages FROM ${staff}`,
  `GRANT EXECUTE ON FUNCTION service_case_context_allowed(integer),service_case_message_allowed(integer,bigint) TO ${consumer},${staff}`,
  `GRANT EXECUTE ON FUNCTION service_case_request(integer,uuid,text),service_case_withdraw(uuid,integer),service_case_status(integer) TO ${consumer}`,
  `GRANT EXECUTE ON FUNCTION service_case_prepare_content(uuid,uuid,integer,bigint,bigint,integer,text),service_case_read_content(uuid),service_case_add_note(uuid,uuid,integer,bigint,uuid,text) TO ${staff}`,
  `INSERT INTO service_case_runtime_bindings(role_name,role_kind,organization_id,environment,disclosure_version) VALUES('${c.consumerRole}','CONSUMER','${c.organizationId}','${c.environment}','${c.disclosureVersion}'),('${c.staffRole}','STAFF','${c.organizationId}','${c.environment}','${c.disclosureVersion}')`,
 ];
}

/** Metadata only. Does not disclose case rows, notes or workforce identities. */
 export async function verifyServiceCaseBoundaryCatalog(client:pg.PoolClient){
 const isOwner = (await client.query("SELECT pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE relname='threads' AND relnamespace='public'::regnamespace), 'USAGE') AS owns")).rows[0]?.owns === true;
 const sql=readFileSync(new URL('../../migrations/038_service_cases.sql',import.meta.url),'utf8');
 const funcs=(await client.query<{name:string;identity:string;body:string;definer:boolean;config:string[];owner:string;login:boolean;bypass:boolean;superuser:boolean;public_execute:boolean}>(`SELECT p.proname AS name,p.oid::regprocedure::text AS identity,p.prosrc AS body,p.prosecdef AS definer,p.proconfig AS config,r.rolname AS owner,r.rolcanlogin AS login,r.rolbypassrls AS bypass,r.rolsuper AS superuser,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,[serviceCaseFunctions.map(fn=>fn.split('(')[0])])).rows;
 const owner=funcs.find(fn=>fn.name==='service_case_read_content')?.owner;
 const ownerSafe=isOwner||(owner!==undefined&&(await client.query<{safe:boolean}>(`SELECT NOT(r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR has_schema_privilege(r.oid,'public','CREATE') OR EXISTS(SELECT 1 FROM pg_roles inherited WHERE inherited.oid<>r.oid AND pg_has_role(r.oid,inherited.oid,'MEMBER'))) AS safe FROM pg_roles r WHERE r.rolname=$1`,[owner])).rows[0]?.safe===true);
 const functionsValid=funcs.length===serviceCaseFunctions.length&&serviceCaseFunctions.every(identity=>funcs.some(fn=>{
  const expected=sql.match(new RegExp(`CREATE FUNCTION ${fn.name}\\([^]*?AS \\$\\$([^]*?)\\$\\$`,'i'))?.[1]?.trim();
  return fn.identity===identity&&(isOwner||fn.owner===owner)&&(isOwner||(!fn.login&&!fn.bypass&&!fn.superuser))&&!fn.public_execute&&fn.definer===definerFunctions.includes(identity)&&fn.config?.includes('search_path=pg_catalog, public')&&(!fn.definer||fn.config.includes('row_security=on'))&&!!expected&&fn.body.trim()===expected;
 }));
 const tables=(await client.query<{name:string;rls:boolean;force:boolean;owner:string;public_grant:boolean}>(`SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force,pg_get_userbyid(c.relowner) AS owner,EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_grant FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[serviceCaseTables])).rows;
 const tablesValid=tables.length===serviceCaseTables.length&&tables.every(t=>t.rls&&t.force&&(isOwner||(t.owner!==owner&&!t.public_grant)));
 const policies=(await client.query<{tablename:string;policyname:string;roles:string[];cmd:string;permissive:string;qual:string|null;with_check:string|null}>(`SELECT tablename,policyname,roles::text[],cmd,permissive,qual,with_check FROM pg_policies WHERE schemaname='public' AND (tablename=ANY($1::text[]) OR policyname IN('service_case_thread_context','service_case_message_content'))`,[serviceCaseTables])).rows;
 const policiesValid=isOwner||(policies.length===serviceCaseTables.length+2&&policies.every(p=>p.roles.length===1&&p.roles[0]===owner&&p.permissive==='PERMISSIVE'&&(
  (serviceCaseTables.includes(p.tablename as typeof serviceCaseTables[number])&&p.policyname==='service_case_helper_access'&&p.cmd==='ALL'&&p.qual==='true'&&p.with_check==='true')||
  (p.tablename==='threads'&&p.policyname==='service_case_thread_context'&&p.cmd==='SELECT'&&p.with_check===null&&normalized(p.qual)===normalized('(service_case_context_allowed(id) OR ((conversation_actor_id() = guest_id) OR (conversation_actor_id() = host_id)))'))||
  (p.tablename==='messages'&&p.policyname==='service_case_message_content'&&p.cmd==='SELECT'&&p.with_check===null&&normalized(p.qual)===normalized('service_case_message_allowed(thread_id, conversation_sequence)')))));
 // Staff has no participant table grant, so its own readiness cannot call the
 // participant-role verifier. Verify the inherited immutable source boundary
 // explicitly; a correct receipt is useless if history can be rewritten.
 const sourcePolicies=(await client.query<{tablename:string;roles:string[];cmd:string;permissive:string;qual:string|null;with_check:string|null}>(`SELECT tablename,roles::text[],cmd,permissive,qual,with_check FROM pg_policies WHERE schemaname='public' AND ((tablename='threads' AND policyname='conversation_thread_boundary') OR (tablename='messages' AND policyname='conversation_message_boundary'))`)).rows;
 const threadWrite='((conversation_actor_id() = guest_id) OR (conversation_actor_id() = host_id))';
 const messageWrite='((thread_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM threads t WHERE ((t.id = messages.thread_id) AND ((conversation_actor_id() = t.guest_id) OR (conversation_actor_id() = t.host_id))))))';
 const sourcePoliciesValid=sourcePolicies.length===2&&sourcePolicies.every(p=>p.roles.length===1&&p.roles[0]==='public'&&p.cmd==='ALL'&&p.permissive==='RESTRICTIVE'&&normalized(p.qual)===normalized(p.tablename==='threads'?serviceCaseThreadExpression:serviceCaseMessageExpression)&&normalized(p.with_check)===normalized(p.tablename==='threads'?threadWrite:messageWrite));
 const sourceSql=readFileSync(new URL('../../migrations/037_conversation_delivery.sql',import.meta.url),'utf8');
 const sourceNames=['conversation_actor_id','conversation_guard_thread','conversation_guard_message'];
 const sourceFunctions=(await client.query<{name:string;body:string;definer:boolean;config:string[]}>(`SELECT p.proname AS name,p.prosrc AS body,p.prosecdef AS definer,p.proconfig AS config FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,[sourceNames])).rows;
 const sourceFunctionsValid=sourceFunctions.length===sourceNames.length&&sourceFunctions.every(fn=>!fn.definer&&fn.config?.includes('search_path=pg_catalog, public')&&fn.config.includes('row_security=on')&&fn.body.trim()===sourceSql.match(new RegExp(`CREATE FUNCTION ${fn.name}\\([^]*?AS \\$\\$([^]*?)\\$\\$`,'i'))?.[1]?.trim());
 const sourceTriggers=(await client.query<{table_name:string;name:string;function_name:string;type:number;enabled:string;unconditional:boolean;schema:string}>(`SELECT c.relname AS table_name,t.tgname AS name,p.proname AS function_name,t.tgtype AS type,t.tgenabled AS enabled,t.tgqual IS NULL AS unconditional,pn.nspname AS schema FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='public' AND t.tgname IN('conversation_message_immutable','conversation_thread_immutable')`)).rows;
 const sourceTriggersValid=[{table_name:'messages',name:'conversation_message_immutable',function_name:'conversation_guard_message',type:27},{table_name:'threads',name:'conversation_thread_immutable',function_name:'conversation_guard_thread',type:27}].every(e=>sourceTriggers.some(r=>r.table_name===e.table_name&&r.name===e.name&&r.function_name===e.function_name&&r.type===e.type&&r.enabled==='O'&&r.unconditional&&r.schema==='public'));
 const sourceConstraints=(await client.query<{table_name:string;name:string;definition:string;valid:boolean}>(`SELECT c.relname AS table_name,k.conname AS name,pg_get_constraintdef(k.oid) AS definition,k.convalidated AS valid FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('messages','threads')`)).rows;
 const sourceConstraintsValid=conversationConstraintContract.filter(e=>e.table_name==='messages').every(e=>sourceConstraints.some(r=>r.table_name===e.table_name&&r.name===e.name&&r.valid&&normalized(r.definition)===normalized(e.definition)));
 const sourceTables=(await client.query<{rls:boolean;force:boolean;safe:boolean}>(`SELECT c.relrowsecurity AS rls,c.relforcerowsecurity AS force,pg_get_userbyid(c.relowner)<>$1 AS safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('threads','messages')`,[owner])).rows;
 const sourceBoundaryValid=sourcePoliciesValid&&sourceFunctionsValid&&sourceTriggersValid&&sourceConstraintsValid&&sourceTables.length===2&&sourceTables.every(t=>t.rls&&t.force&&(isOwner||t.safe));
 const constraints=(await client.query<{table_name:string;name:string;definition:string;valid:boolean;deferred:boolean}>(`SELECT c.relname AS table_name,k.conname AS name,pg_get_constraintdef(k.oid) AS definition,k.convalidated AS valid,k.condeferrable AS deferred FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[serviceCaseTables])).rows;
 const constraintsValid=serviceCaseConstraintContract.every(e=>constraints.some(r=>r.table_name===e.table_name&&r.name===e.name&&r.valid&&!r.deferred&&normalized(r.definition)===normalized(e.definition)));
 const indexes=(await client.query<{table_name:string;name:string;definition:string;valid:boolean;ready:boolean}>(`SELECT c.relname AS table_name,i.relname AS name,pg_get_indexdef(x.indexrelid) AS definition,x.indisvalid AS valid,x.indisready AS ready FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[serviceCaseTables])).rows;
 const indexesValid=serviceCaseIndexContract.every(e=>indexes.some(r=>r.table_name===e.table_name&&r.name===e.name&&r.valid&&r.ready&&normalized(r.definition)===normalized(e.definition)));
 const columns=(await client.query<{table_name:string;column_name:string;udt_name:string;not_null:boolean}>(`SELECT c.relname AS table_name,a.attname AS column_name,t.typname AS udt_name,a.attnotnull AS not_null FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped`,[serviceCaseTables])).rows;
 const columnsValid=serviceCaseColumnContract.every(e=>columns.some(r=>r.table_name===e.table_name&&r.column_name===e.column_name&&r.udt_name===e.udt_name&&r.not_null===e.not_null));
 const triggers=(await client.query<{table_name:string;name:string;function_name:string;type:number;enabled:string;unconditional:boolean;schema:string}>(`SELECT c.relname AS table_name,t.tgname AS name,p.proname AS function_name,t.tgtype AS type,t.tgenabled AS enabled,t.tgqual IS NULL AS unconditional,pn.nspname AS schema FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal`,[serviceCaseTables])).rows;
 const triggersValid=serviceCaseTriggerContract.every(e=>triggers.some(r=>r.table_name===e.table_name&&r.name===e.name&&r.function_name===e.function_name&&r.type===e.type&&r.enabled==='O'&&r.unconditional&&r.schema==='public'));
 const targetTables=[...serviceCaseTables,'threads','messages','internal_permission_catalog','internal_iam_current_policy','internal_iam_policy_versions','internal_work_assignments'];
 const definerGrants=(await client.query<{table_name:string;column_name:string;can_select:boolean;can_insert:boolean;can_update:boolean;unsafe:boolean}>(`SELECT c.relname AS table_name,a.attname AS column_name,has_column_privilege($2,c.oid,a.attnum,'SELECT') AS can_select,has_column_privilege($2,c.oid,a.attnum,'INSERT') AS can_insert,has_column_privilege($2,c.oid,a.attnum,'UPDATE') AS can_update,(has_table_privilege($2,c.oid,'DELETE,TRUNCATE,TRIGGER') OR pg_has_role($2,c.relowner,'MEMBER')) AS unsafe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[targetTables,owner??'public'])).rows;
 const definerGrantsValid=isOwner||(definerGrants.length>0&&definerGrants.every(r=>{
  const select=r.table_name==='threads'?['id','guest_id','host_id','listing_id','experience_id','last_message_sequence'].includes(r.column_name):r.table_name==='messages'?['id','thread_id','sender_id','receiver_id','content','conversation_sequence','created_at'].includes(r.column_name):true;
  const insert=['service_cases','service_case_requests','service_case_events','service_case_internal_notes','service_case_content_access_receipts'].includes(r.table_name);
  const update=r.table_name==='service_cases'&&['state','version','withdrawn_at','withdrawn_by'].includes(r.column_name);
  return !r.unsafe&&r.can_select===select&&r.can_insert===insert&&r.can_update===update;
 }));
 return {ready:functionsValid&&tablesValid&&policiesValid&&ownerSafe&&constraintsValid&&indexesValid&&columnsValid&&triggersValid&&definerGrantsValid&&sourceBoundaryValid,functionsValid,tablesValid,policiesValid,ownerSafe,constraintsValid,indexesValid,columnsValid,triggersValid,definerGrantsValid,sourceBoundaryValid};
}

export async function verifyServiceCaseCatalog(client:pg.PoolClient,kind:'CONSUMER'|'STAFF'){
 const boundary=await verifyServiceCaseBoundaryCatalog(client);
 const r=(await client.query<{safe:boolean}>(`SELECT NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR has_schema_privilege(current_user,'public','CREATE') OR EXISTS(SELECT 1 FROM pg_roles inherited WHERE pg_has_role(current_user,inherited.oid,'MEMBER') AND(inherited.rolsuper OR inherited.rolbypassrls OR inherited.rolcreaterole OR inherited.rolcreatedb OR inherited.rolname IN(SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE proname='service_case_read_content')))) AS safe FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
 const privileges=(await client.query<{name:string;selectable:boolean;writable:boolean}>(`SELECT c.relname AS name,has_any_column_privilege(current_user,c.oid,'SELECT') AS selectable,(has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE') OR has_table_privilege(current_user,c.oid,'DELETE,TRUNCATE,TRIGGER')) AS writable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[kind==='STAFF'?[...serviceCaseTables,'threads','messages']:serviceCaseTables])).rows;
 const grantsValid=privileges.length===(kind==='STAFF'?serviceCaseTables.length+2:serviceCaseTables.length)&&privileges.every(p=>!p.selectable&&!p.writable);
 const allowed=['service_case_context_allowed(integer)','service_case_message_allowed(integer,bigint)',...(kind==='CONSUMER'?['service_case_request(integer,uuid,text)','service_case_withdraw(uuid,integer)','service_case_status(integer)']:['service_case_prepare_content(uuid,uuid,integer,bigint,bigint,integer,text)','service_case_read_content(uuid)','service_case_add_note(uuid,uuid,integer,bigint,uuid,text)'])];
 const exec=(await client.query<{identity:string;allowed:boolean}>(`SELECT p.oid::regprocedure::text AS identity,has_function_privilege(current_user,p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,[serviceCaseFunctions.map(fn=>fn.split('(')[0])])).rows;
 const executeValid=exec.length===serviceCaseFunctions.length&&exec.every(fn=>fn.allowed===allowed.includes(fn.identity));
 return {...boundary,ready:boundary.ready&&r?.safe===true&&grantsValid&&executeValid,roleSafe:r?.safe===true,grantsValid,executeValid};
}
