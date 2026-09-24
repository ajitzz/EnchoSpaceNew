import {readFileSync} from 'node:fs';
import type pg from 'pg';
import {conversationColumnContract,conversationConstraintContract,conversationIndexContract,conversationRecentIndexContract} from './conversationCatalogContract.js';
import {serviceCaseThreadExpression,serviceCaseMessageExpression,verifyServiceCaseBoundaryCatalog} from './serviceCaseReadiness.js';

export const conversationDeliveryTables=['threads','messages','conversation_read_cursors','notification_intents','notification_intent_events'] as const;
const intentMutable=['state','fence','attempts','lease_until','available_at','claimed_by','last_error_code','updated_at','completed_at'];
const threadMutable=['last_message','unread_count_guest','unread_count_host','updated_at','last_message_sequence'];
const functions=['conversation_actor_id','conversation_notification_fingerprint','conversation_sequence_message','conversation_enqueue_message','conversation_guard_message','conversation_guard_thread','conversation_create_thread','conversation_guard_cursor','conversation_guard_intent','conversation_immutable_event','conversation_acknowledge_read'];
const triggers=[
 ['messages','conversation_message_sequence','conversation_sequence_message',7],
 ['messages','conversation_message_enqueue','conversation_enqueue_message',5],
 ['messages','conversation_message_immutable','conversation_guard_message',27],
 ['threads','conversation_thread_immutable','conversation_guard_thread',27],
 ['threads','conversation_thread_create','conversation_create_thread',7],
 ['conversation_read_cursors','conversation_cursor_monotonic','conversation_guard_cursor',31],
 ['notification_intents','notification_intent_immutable','conversation_guard_intent',31],
 ['notification_intent_events','notification_event_immutable','conversation_immutable_event',27],
] as const;
const roleName=(role:string)=>{if(!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw new Error('CONVERSATION_ROLE_INVALID');return `"${role}"`;};
const runtimePolicies=['notification_recipient_read','notification_sender_enqueue','notification_recipient_events','notification_sender_event'];

/** Review/apply under migration authority. Never called by runtime startup. */
export function conversationRuntimeGrants(runtimeRole:string):string[]{
 const role=roleName(runtimeRole);
 return [
  `GRANT USAGE ON SCHEMA public TO ${role}`,
  `REVOKE ALL ON conversation_read_cursors,notification_intents,notification_intent_events FROM ${role}`,
  `REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON threads,messages FROM ${role}`,
  `GRANT SELECT,INSERT ON threads,messages TO ${role}`,
  `GRANT UPDATE(${threadMutable.join(',')}) ON threads TO ${role}`,
  `GRANT UPDATE(is_read) ON messages TO ${role}`,
  `GRANT SELECT,INSERT,UPDATE ON conversation_read_cursors TO ${role}`,
  `GRANT SELECT,INSERT ON notification_intents,notification_intent_events TO ${role}`,
  `GRANT USAGE ON SEQUENCE threads_id_seq,messages_id_seq,notification_intent_events_id_seq TO ${role}`,
  `GRANT EXECUTE ON FUNCTION conversation_actor_id(),conversation_notification_fingerprint(integer,integer,uuid,integer),conversation_acknowledge_read(integer,integer) TO ${role}`,
  ...runtimePolicies.map((policy,index)=>`ALTER POLICY ${policy} ON ${index<2?'notification_intents':'notification_intent_events'} TO ${role}`),
 ];
}
/** Dedicated content-free queue worker; never inherits the application role. */
export function conversationWorkerGrants(workerRole:string):string[]{
 const role=roleName(workerRole);
 return [
  `GRANT USAGE ON SCHEMA public TO ${role}`,
  `REVOKE ALL ON threads,messages,conversation_read_cursors,notification_intents,notification_intent_events FROM ${role}`,
  `GRANT SELECT ON notification_intents,notification_intent_events TO ${role}`,
  `GRANT UPDATE(${intentMutable.join(',')}) ON notification_intents TO ${role}`,
  `GRANT INSERT ON notification_intent_events TO ${role}`,
  `GRANT USAGE ON SEQUENCE notification_intent_events_id_seq TO ${role}`,
  `GRANT EXECUTE ON FUNCTION conversation_actor_id(),conversation_notification_fingerprint(integer,integer,uuid,integer) TO ${role}`,
  'DROP POLICY IF EXISTS notification_worker_read ON notification_intents',
  `CREATE POLICY notification_worker_read ON notification_intents FOR SELECT TO ${role} USING(true)`,
  'DROP POLICY IF EXISTS notification_worker_update ON notification_intents',
  `CREATE POLICY notification_worker_update ON notification_intents FOR UPDATE TO ${role} USING(true) WITH CHECK(true)`,
  'DROP POLICY IF EXISTS notification_worker_event_read ON notification_intent_events',
  `CREATE POLICY notification_worker_event_read ON notification_intent_events FOR SELECT TO ${role} USING(true)`,
  'DROP POLICY IF EXISTS notification_worker_event_record ON notification_intent_events',
  `CREATE POLICY notification_worker_event_record ON notification_intent_events FOR INSERT TO ${role} WITH CHECK(event_type<>'ENQUEUED')`,
 ];
}

/** Catalog checks read metadata only; role/behavior tests remain an independent gate. */
export async function verifyConversationCatalog(client:pg.PoolClient,mode:'runtime'|'worker'='runtime'){
 const role=(await client.query<{name:string;safe:boolean}>(`SELECT current_user AS name,
  NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR has_schema_privilege(current_user,'public','CREATE')
  OR EXISTS(SELECT 1 FROM pg_roles inherited WHERE pg_has_role(current_user,inherited.oid,'MEMBER') AND(inherited.rolsuper OR inherited.rolbypassrls OR inherited.rolcreaterole OR inherited.rolcreatedb))) AS safe
  FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
 const tableRows=(await client.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean;owns:boolean;public_grant:boolean}>(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_has_role(current_user,c.relowner,'MEMBER') AS owns,
  EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_grant
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[conversationDeliveryTables])).rows;
 const tableSafety=tableRows.length===5&&tableRows.every(row=>row.relrowsecurity&&row.relforcerowsecurity&&!row.owns&&!row.public_grant);
 // information_schema hides inaccessible message columns from the worker; use pg_catalog instead.
 const catalogColumns=(await client.query<{table_name:string;column_name:string;udt_name:string;not_null:boolean}>(`SELECT c.relname AS table_name,a.attname AS column_name,t.typname AS udt_name,a.attnotnull AS not_null FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped`,[conversationDeliveryTables])).rows;
 const columnsValid=conversationColumnContract.every(expected=>catalogColumns.some(row=>row.table_name===expected.table_name&&row.column_name===expected.column_name&&row.udt_name===expected.udt_name&&row.not_null===expected.not_null));
 const policies=(await client.query<{tablename:string;policyname:string;permissive:string;roles:string[];cmd:string;qual:string|null;with_check:string|null}>(`SELECT tablename,policyname,permissive,roles::text[],cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])`,[conversationDeliveryTables])).rows;
 // Ignore formatting only outside SQL literals; changing literal content is drift.
 const normalized=(value:string|null)=>value?.replace(/'(?:''|[^'])*'|\s+/g,part=>part.startsWith("'")?part:'')??'';
 const constraints=(await client.query<{table_name:string;name:string;definition:string;validated:boolean;deferred:boolean}>(`SELECT c.relname AS table_name,k.conname AS name,pg_get_constraintdef(k.oid) AS definition,k.convalidated AS validated,k.condeferrable AS deferred FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[conversationDeliveryTables])).rows;
 const constraintsValid=conversationConstraintContract.every(expected=>constraints.some(row=>row.table_name===expected.table_name&&row.name===expected.name&&row.validated&&!row.deferred&&normalized(row.definition)===normalized(expected.definition)));
 const indexes=(await client.query<{table_name:string;name:string;definition:string;valid:boolean;ready:boolean}>(`SELECT c.relname AS table_name,i.relname AS name,pg_get_indexdef(x.indexrelid) AS definition,x.indisvalid AS valid,x.indisready AS ready FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[conversationDeliveryTables])).rows;
 const indexesValid=[...conversationIndexContract,...conversationRecentIndexContract].every(expected=>indexes.some(row=>row.table_name===expected.table_name&&row.name===expected.name&&row.valid&&row.ready&&normalized(row.definition)===normalized(expected.definition)));
 const threadExpression='((conversation_actor_id() = guest_id) OR (conversation_actor_id() = host_id))';
 const messageRead='(((thread_id IS NULL) AND ((conversation_actor_id() = sender_id) OR (conversation_actor_id() = receiver_id))) OR (EXISTS ( SELECT 1 FROM threads t WHERE ((t.id = messages.thread_id) AND ((conversation_actor_id() = t.guest_id) OR (conversation_actor_id() = t.host_id))))))';
 const messageWrite='((thread_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM threads t WHERE ((t.id = messages.thread_id) AND ((conversation_actor_id() = t.guest_id) OR (conversation_actor_id() = t.host_id))))))';
 const cursorExpression='((user_id = conversation_actor_id()) AND (EXISTS ( SELECT 1 FROM threads t WHERE (t.id = conversation_read_cursors.thread_id))))';
 const extended=(await client.query<{present:boolean}>("SELECT to_regclass('public.service_cases') IS NOT NULL AS present")).rows[0]?.present===true;
 const serviceExtensionValid=!extended||(await verifyServiceCaseBoundaryCatalog(client)).ready;
 const contracts=[
  ['threads','conversation_thread_access','ALL','PERMISSIVE','public',threadExpression,threadExpression],
  ['threads','conversation_thread_boundary','ALL','RESTRICTIVE','public',extended?serviceCaseThreadExpression:threadExpression,threadExpression],
  ['messages','conversation_message_access','ALL','PERMISSIVE','public',messageRead,messageWrite],
  ['messages','conversation_message_boundary','ALL','RESTRICTIVE','public',extended?serviceCaseMessageExpression:messageRead,messageWrite],
  ['conversation_read_cursors','conversation_cursor_access','ALL','PERMISSIVE','public',cursorExpression,cursorExpression],
  ['notification_intents','notification_recipient_read','SELECT','PERMISSIVE','runtime','(recipient_id = conversation_actor_id())',''],
  ['notification_intents','notification_sender_enqueue','INSERT','PERMISSIVE','runtime','','(sender_id = conversation_actor_id())'],
  ['notification_intent_events','notification_recipient_events','SELECT','PERMISSIVE','runtime','(EXISTS ( SELECT 1 FROM notification_intents i WHERE (i.id = notification_intent_events.outbox_id)))',''],
  ['notification_intent_events','notification_sender_event','INSERT','PERMISSIVE','runtime','',"((event_type = 'ENQUEUED'::text) AND (actor_id IS NULL) AND (reason IS NULL) AND (EXISTS ( SELECT 1 FROM messages m WHERE ((m.notification_intent_id = notification_intent_events.outbox_id) AND (m.sender_id = conversation_actor_id())))))"],
  ['notification_intents','notification_worker_read','SELECT','PERMISSIVE','worker','true',''],
  ['notification_intents','notification_worker_update','UPDATE','PERMISSIVE','worker','true','true'],
  ['notification_intent_events','notification_worker_event_read','SELECT','PERMISSIVE','worker','true',''],
  ['notification_intent_events','notification_worker_event_record','INSERT','PERMISSIVE','worker','',"(event_type <> 'ENQUEUED'::text)"],
 ] as const;
 const runtimePolicyRole=policies.find(row=>row.policyname==='notification_recipient_read')?.roles[0];
 const workerPolicyRole=policies.find(row=>row.policyname==='notification_worker_read')?.roles[0];
 const expectedRole={public:'public',runtime:runtimePolicyRole,worker:workerPolicyRole};
 const exactPolicies=contracts.every(([table,name,cmd,permissive,kind,qual,check])=>policies.some(row=>row.tablename===table&&row.policyname===name&&row.cmd===cmd&&row.permissive===permissive&&row.roles.length===1&&row.roles[0]===expectedRole[kind]&&normalized(row.qual)===normalized(qual)&&normalized(row.with_check)===normalized(check)));
 const namedRoles=runtimePolicyRole&&workerPolicyRole&&runtimePolicyRole!=='public'&&workerPolicyRole!=='public'&&runtimePolicyRole!==workerPolicyRole&&expectedRole[mode]===role?.name;
 const noUnknownPolicies=policies.every(row=>contracts.some(([table,name])=>table===row.tablename&&name===row.policyname)||(row.tablename==='threads'&&row.policyname==='threads_policy')||(row.tablename==='messages'&&row.policyname==='messages_policy')||(extended&&((row.tablename==='threads'&&row.policyname==='service_case_thread_context')||(row.tablename==='messages'&&row.policyname==='service_case_message_content'))));
 const policyValid=Boolean(exactPolicies&&namedRoles&&noUnknownPolicies&&serviceExtensionValid);
 const triggerRows=(await client.query<{relname:string;tgname:string;proname:string;tgenabled:string;tgtype:number;unconditional:boolean;function_schema:string}>(`SELECT c.relname,t.tgname,p.proname,pn.nspname AS function_schema,t.tgenabled,t.tgtype,t.tgqual IS NULL AS unconditional FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal`,[conversationDeliveryTables])).rows;
 const triggersValid=triggers.every(([table,name,fn,type])=>triggerRows.some(row=>row.relname===table&&row.tgname===name&&row.proname===fn&&row.tgenabled==='O'&&row.tgtype===type&&row.unconditional&&row.function_schema==='public'));
 const sql=readFileSync(new URL('../../migrations/037_conversation_delivery.sql',import.meta.url),'utf8');
 const functionRows=(await client.query<{proname:string;prosrc:string;prosecdef:boolean;proconfig:string[]|null;public_execute:boolean}>(`SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,[functions])).rows;
 const functionsValid=functionRows.length===functions.length&&functions.every(name=>{const body=sql.match(new RegExp(`CREATE FUNCTION ${name}\\([^]*?AS \\$\\$([^]*?)\\$\\$`,'i'))?.[1]?.trim();return body&&functionRows.some(row=>row.proname===name&&!row.prosecdef&&!row.public_execute&&row.proconfig?.includes('search_path=pg_catalog, public')&&(name==='conversation_notification_fingerprint'||row.proconfig.includes('row_security=on'))&&row.prosrc.trim()===body);});
 const privileges=(await client.query<{table_name:string;column_name:string;can_select:boolean;can_insert:boolean;can_update:boolean;can_delete:boolean;can_truncate:boolean;can_trigger:boolean}>(`SELECT c.relname AS table_name,a.attname AS column_name,has_column_privilege(current_user,c.oid,a.attnum,'SELECT') AS can_select,has_column_privilege(current_user,c.oid,a.attnum,'INSERT') AS can_insert,has_column_privilege(current_user,c.oid,a.attnum,'UPDATE') AS can_update,has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,has_table_privilege(current_user,c.oid,'TRIGGER') AS can_trigger FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[conversationDeliveryTables])).rows;
 const grantsValid=privileges.length>0&&privileges.every(row=>{
  const runtimeUpdate=row.table_name==='threads'?threadMutable.includes(row.column_name):row.table_name==='messages'?row.column_name==='is_read':row.table_name==='conversation_read_cursors';
  const expectedUpdate=mode==='runtime'?runtimeUpdate:row.table_name==='notification_intents'&&intentMutable.includes(row.column_name);
  const expectedRead=mode==='runtime'||['notification_intents','notification_intent_events'].includes(row.table_name);
  const expectedInsert=mode==='runtime'||row.table_name==='notification_intent_events';
  return row.can_select===expectedRead&&row.can_insert===expectedInsert&&row.can_update===expectedUpdate&&!row.can_delete&&!row.can_truncate&&!row.can_trigger;
 });
 const execute=(await client.query<{proname:string;allowed:boolean}>(`SELECT p.proname,has_function_privilege(current_user,p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,[functions])).rows;
 const executeValid=execute.length===functions.length&&execute.every(row=>row.allowed===(['conversation_actor_id','conversation_notification_fingerprint',...(mode==='runtime'?['conversation_acknowledge_read']:[])].includes(row.proname)));
 const sequences=(await client.query<{name:string;usage:boolean;can_update:boolean;owns:boolean}>(`SELECT c.relname AS name,has_sequence_privilege(current_user,c.oid,'USAGE') AS usage,has_sequence_privilege(current_user,c.oid,'UPDATE') AS can_update,pg_has_role(current_user,c.relowner,'MEMBER') AS owns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' AND c.relname=ANY($1::text[])`,[['threads_id_seq','messages_id_seq','notification_intent_events_id_seq']])).rows;
 const sequenceValid=sequences.length===3&&sequences.every(row=>!row.owns&&!row.can_update&&row.usage===(mode==='runtime'||row.name==='notification_intent_events_id_seq'));
 const roleSafe=role?.safe===true;
 return {ready:roleSafe&&tableSafety&&columnsValid&&constraintsValid&&indexesValid&&policyValid&&triggersValid&&functionsValid&&grantsValid&&executeValid&&sequenceValid,roleSafe,tableSafety,columnsValid,constraintsValid,indexesValid,policyValid,triggersValid,functionsValid,grantsValid,executeValid,sequenceValid};
}
