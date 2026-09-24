import type pg from 'pg';
import {isIsolatedFactorWriter} from '../../lib/iam/factors/workforceStepUp.js';
type Row={tablename:string;policyname:string;cmd:string;permissive:string;roles:string[];qual:string|null;with_check:string|null};
const normalize=(value:string|null)=>value?.replace(/\s+/g,' ').trim()??null;
const setting="current_setting('app.passkey_ceremony'::text, true)";
const base={
 iam_passkey_factor_create:{table:'internal_step_up_challenges',check:`(((id)::text = ${setting}) AND (status = 'PENDING'::text) AND (required_assurance = 'PHISHING_RESISTANT'::text))`},
 iam_passkey_event_create:{table:'internal_iam_events',check:`((entity_type = 'STEP_UP'::text) AND (entity_id = ${setting}) AND (event_type = ANY (ARRAY['PASSKEY_CHALLENGE_CREATED'::text, 'PASSKEY_ASSERTION_VERIFIED'::text])))`},
};
export const factorBaseOwnerPolicyNames=Object.keys(base);
export function verifyFactorBaseOwnerPolicies(rows:readonly Row[],relations:readonly {relname:unknown;owner_name:unknown}[]):boolean{
 const found=rows.filter(row=>factorBaseOwnerPolicyNames.includes(row.policyname));
 return found.length===factorBaseOwnerPolicyNames.length&&found.every(row=>{const expected=base[row.policyname as keyof typeof base];
 return row.tablename===expected.table&&row.cmd==='INSERT'&&row.permissive==='PERMISSIVE'&&row.qual===null&&normalize(row.with_check)===expected.check&&JSON.stringify(row.roles)===JSON.stringify([relations.find(r=>r.relname===expected.table)?.owner_name]);});
}
const funcs=['internal_iam_begin_passkey(text,uuid,text,uuid,text,text,text)','internal_iam_read_passkey_ceremony(text,uuid,text)','internal_iam_record_passkey(text,uuid,jsonb,text,text)'];
const tables=['internal_workforce_factor_policies','internal_workforce_current_factor_policy','internal_workforce_passkey_enrollments','internal_workforce_passkey_state','internal_workforce_passkey_ceremonies','internal_workforce_passkey_receipts'];
export function workforceFactorGrants(role:string):string[]{if(!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw new Error('IAM_ROLE_INVALID');return [`GRANT USAGE ON SCHEMA public TO "${role}"`,`GRANT EXECUTE ON FUNCTION ${funcs.join(',')} TO "${role}"`];}
export async function verifyWorkforceFactorCatalog(client:pg.PoolClient){
 const roleSafe=await isIsolatedFactorWriter(client);
 const relations=(await client.query<{relname:string;owner_name:string;safe:boolean}>(`SELECT c.relname,pg_get_userbyid(c.relowner) AS owner_name,c.relrowsecurity AND c.relforcerowsecurity AND NOT pg_has_role(current_user,c.relowner,'MEMBER') AND NOT has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AND NOT has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[tables])).rows;
 const relationSafe=relations.length===tables.length&&relations.every(r=>r.safe);
 const functions=(await client.query<{safe:boolean}>(`SELECT p.prosecdef AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolcanlogin) AND p.proconfig @> ARRAY['search_path=pg_catalog, public','row_security=on'] AND has_function_privilege(current_user,p.oid,'EXECUTE') AND NOT pg_has_role(current_user,p.proowner,'MEMBER') AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0) AS safe FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=ANY($1::regprocedure[])`,[funcs])).rows;
 const functionSafe=functions.length===funcs.length&&functions.every(r=>r.safe);
 const policies=(await client.query<Row>(`SELECT tablename,policyname,cmd,permissive,roles::text[],qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])`,[tables])).rows;
 const expected:Array<{table:string;name:string;cmd:string;qual:string|null;check:string|null}>=tables.map(table=>({table,name:'iam_passkey_owner_read',cmd:'SELECT',qual:'true',check:null}));
 expected.push({table:tables[0],name:'iam_passkey_policy_create',cmd:'INSERT',qual:null,check:'true'},
 {table:tables[1],name:'iam_passkey_policy_pointer',cmd:'ALL',qual:'true',check:'true'},
 {table:tables[3],name:'iam_passkey_counter_write',cmd:'UPDATE',qual:"((enrollment_id)::text = current_setting('app.passkey_enrollment'::text, true))",check:"((enrollment_id)::text = current_setting('app.passkey_enrollment'::text, true))"},
 {table:tables[4],name:'iam_passkey_ceremony_create',cmd:'INSERT',qual:null,check:`((id)::text = ${setting})`},
 {table:tables[5],name:'iam_passkey_receipt_create',cmd:'INSERT',qual:null,check:`((ceremony_id)::text = ${setting})`});
 const policySafe=policies.length===expected.length&&expected.every(e=>policies.some(r=>r.tablename===e.table&&r.policyname===e.name&&r.cmd===e.cmd&&r.permissive==='PERMISSIVE'&&normalize(r.qual)===e.qual&&normalize(r.with_check)===e.check&&JSON.stringify(r.roles)===JSON.stringify([relations.find(x=>x.relname===e.table)?.owner_name])));
 const immutableEvidence=Number((await client.query<{count:number}>(`SELECT count(*)::int AS count FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=27 AND t.tgname='internal_iam_immutable' AND p.proname='internal_iam_reject_mutation' AND t.tgrelid IN ('internal_workforce_factor_policies'::regclass,'internal_workforce_passkey_enrollments'::regclass,'internal_workforce_passkey_ceremonies'::regclass,'internal_workforce_passkey_receipts'::regclass)`)).rows[0]?.count)===4;
 return {ready:roleSafe&&relationSafe&&functionSafe&&policySafe&&immutableEvidence,roleSafe,relationSafe,functionSafe,policySafe,immutableEvidence};
}
