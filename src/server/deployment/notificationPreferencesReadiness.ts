import {readFileSync} from 'node:fs';
import type pg from 'pg';
import {verifyConversationCatalog} from './conversationReadiness.js';
import {notificationPreferenceColumnContract,notificationPreferenceConstraintContract,notificationPreferenceIndexContract} from './notificationPreferencesCatalogContract.js';

export const notificationPreferenceTables=['conversation_notification_preferences','conversation_notification_preference_events'] as const;
const functions=['conversation_guard_notification_preference','conversation_record_notification_preference','conversation_guard_notification_preference_event'];
const triggers=[
 ['conversation_notification_preferences','conversation_notification_preference_guard','conversation_guard_notification_preference',31],
 ['conversation_notification_preferences','conversation_notification_preference_record','conversation_record_notification_preference',21],
 ['conversation_notification_preference_events','conversation_notification_preference_event_guard','conversation_guard_notification_preference_event',31],
] as const;
const normalize=(value:string|null)=>value?.replace(/'(?:''|[^'])*'|\s+/g,part=>part.startsWith("'")?part:'')??'';
/** DBA-reviewed rollout only. Runtime must never self-grant this authority. */
export function notificationPreferenceRuntimeGrants(runtimeRole:string):string[]{
 if(!/^[a-z][a-z0-9_]{0,62}$/.test(runtimeRole))throw new Error('NOTIFICATION_PREFERENCE_ROLE_INVALID');
 const role=`"${runtimeRole}"`;
 return [
  `REVOKE ALL ON ${notificationPreferenceTables.join(',')} FROM ${role}`,
  `GRANT SELECT ON ${notificationPreferenceTables.join(',')} TO ${role}`,
  `GRANT INSERT(user_id,in_app_alerts,version),UPDATE(in_app_alerts,version) ON conversation_notification_preferences TO ${role}`,
  `GRANT INSERT(user_id,request_id,previous_version,previous_in_app_alerts,version,in_app_alerts,correlation_id) ON conversation_notification_preference_events TO ${role}`,
  `ALTER POLICY notification_preference_actor ON conversation_notification_preferences TO ${role}`,
  `ALTER POLICY notification_preference_event_actor ON conversation_notification_preference_events TO ${role}`,
 ];
}
/** Includes inherited037 readiness; an available preference route never clears
 * conversation isolation or reinterprets legacy fabricated delivery records. */
export async function verifyNotificationPreferenceCatalog(client:pg.PoolClient){
 const conversationReady=(await verifyConversationCatalog(client,'runtime')).ready;
 const role=(await client.query<{name:string}>('SELECT current_user AS name')).rows[0]?.name;
 const tables=(await client.query<{name:string;safe:boolean}>(`SELECT c.relname AS name,c.relrowsecurity AND c.relforcerowsecurity AND NOT pg_has_role(current_user,c.relowner,'MEMBER') AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[notificationPreferenceTables])).rows;
 const tablesValid=tables.length===2&&tables.every(row=>row.safe);
 const policies=(await client.query<{tablename:string;policyname:string;roles:string[];permissive:string;cmd:string;qual:string|null;with_check:string|null}>("SELECT tablename,policyname,roles::text[],permissive,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])",[notificationPreferenceTables])).rows;
 const policiesValid=policies.length===4&&notificationPreferenceTables.every((table,index)=>[
  [`notification_preference${index?'_event':''}_actor`,'PERMISSIVE',role],
  [`notification_preference${index?'_event':''}_boundary`,'RESTRICTIVE','public'],
 ].every(([name,permissive,expectedRole])=>policies.some(row=>row.tablename===table&&row.policyname===name&&row.permissive===permissive&&row.cmd==='ALL'&&row.roles.length===1&&row.roles[0]===expectedRole&&normalize(row.qual)===normalize('(user_id = conversation_actor_id())')&&normalize(row.with_check)===normalize('(user_id = conversation_actor_id())'))));
 const columns=(await client.query<{table_name:string;column_name:string;type:string;not_null:boolean;default_value:string|null}>(`SELECT c.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped`,[notificationPreferenceTables])).rows;
 const columnsValid=columns.length===notificationPreferenceColumnContract.length&&notificationPreferenceColumnContract.every(expected=>columns.some(row=>row.table_name===expected.table_name&&row.column_name===expected.column_name&&row.type===expected.type&&row.not_null===expected.not_null&&normalize(row.default_value)===normalize(expected.default_value)));
 const constraints=(await client.query<{table_name:string;name:string;definition:string;validated:boolean;deferred:boolean}>(`SELECT c.relname AS table_name,k.conname AS name,pg_get_constraintdef(k.oid) AS definition,k.convalidated AS validated,k.condeferrable AS deferred FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[notificationPreferenceTables])).rows;
 const constraintsValid=constraints.length===notificationPreferenceConstraintContract.length&&notificationPreferenceConstraintContract.every(expected=>constraints.some(row=>row.table_name===expected.table_name&&row.name===expected.name&&row.validated&&!row.deferred&&normalize(row.definition)===normalize(expected.definition)));
 const indexes=(await client.query<{table_name:string;name:string;definition:string;valid:boolean;ready:boolean}>(`SELECT c.relname AS table_name,i.relname AS name,pg_get_indexdef(x.indexrelid) AS definition,x.indisvalid AS valid,x.indisready AS ready FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[notificationPreferenceTables])).rows;
 const indexesValid=indexes.length===notificationPreferenceIndexContract.length&&notificationPreferenceIndexContract.every(expected=>indexes.some(row=>row.table_name===expected.table_name&&row.name===expected.name&&row.valid&&row.ready&&normalize(row.definition)===normalize(expected.definition)));
 const triggerRows=(await client.query<{table_name:string;name:string;function_name:string;enabled:string;type:number;unconditional:boolean;schema:string}>(`SELECT c.relname AS table_name,t.tgname AS name,p.proname AS function_name,t.tgenabled AS enabled,t.tgtype AS type,t.tgqual IS NULL AS unconditional,pn.nspname AS schema FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal`,[notificationPreferenceTables])).rows;
 const triggersValid=triggerRows.length===triggers.length&&triggers.every(([table,name,fn,type])=>triggerRows.some(row=>row.table_name===table&&row.name===name&&row.function_name===fn&&row.enabled==='O'&&row.type===type&&row.unconditional&&row.schema==='public'));
 const sql=readFileSync(new URL('../../migrations/039_conversation_notification_preferences.sql',import.meta.url),'utf8');
 const functionRows=(await client.query<{name:string;body:string;security_definer:boolean;config:string[]|null;public_execute:boolean;caller_execute:boolean}>(`SELECT p.proname AS name,p.prosrc AS body,p.prosecdef AS security_definer,p.proconfig AS config,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,has_function_privilege(current_user,p.oid,'EXECUTE') AS caller_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,[functions])).rows;
 const functionsValid=functionRows.length===functions.length&&functions.every(name=>{const body=sql.match(new RegExp(`CREATE FUNCTION ${name}\\([^]*?AS \\$\\$([^]*?)\\$\\$`,'i'))?.[1]?.trim();return body&&functionRows.some(row=>row.name===name&&row.body.trim()===body&&!row.security_definer&&!row.public_execute&&!row.caller_execute&&row.config?.length===2&&row.config.includes('search_path=pg_catalog, public')&&row.config.includes('row_security=on'));});
 const grants=(await client.query<{table_name:string;column_name:string;read:boolean;insert:boolean;update:boolean;excess:boolean}>(`SELECT c.relname AS table_name,a.attname AS column_name,has_column_privilege(current_user,c.oid,a.attnum,'SELECT') AS read,has_column_privilege(current_user,c.oid,a.attnum,'INSERT') AS insert,has_column_privilege(current_user,c.oid,a.attnum,'UPDATE') AS update,(has_table_privilege(current_user,c.oid,'DELETE') OR has_table_privilege(current_user,c.oid,'TRUNCATE') OR has_table_privilege(current_user,c.oid,'REFERENCES') OR has_table_privilege(current_user,c.oid,'TRIGGER')) AS excess FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[notificationPreferenceTables])).rows;
 const grantsValid=grants.length===columns.length&&grants.every(row=>row.read&&!row.excess&&row.insert===(row.table_name==='conversation_notification_preferences'?['user_id','in_app_alerts','version'].includes(row.column_name):row.column_name!=='created_at')&&row.update===(row.table_name==='conversation_notification_preferences'&&['in_app_alerts','version'].includes(row.column_name)));
 return {ready:conversationReady&&tablesValid&&policiesValid&&columnsValid&&constraintsValid&&indexesValid&&triggersValid&&functionsValid&&grantsValid,conversationReady,tablesValid,policiesValid,columnsValid,constraintsValid,indexesValid,triggersValid,functionsValid,grantsValid};
}
