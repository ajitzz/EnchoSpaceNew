import type pg from 'pg';
import {isIsolatedStaffSessionIssuer} from '../../lib/iam/staffSessionIssuer.js';

type PolicyRow={tablename:string;policyname:string;cmd:string;permissive:string;roles:string[];qual:string|null;with_check:string|null};
type RelationRow={relname:unknown;owner_name:unknown};
const normalized=(value:string|null)=>value?.replace(/\s+/g,' ').trim()??null;
const challenge="current_setting('app.iam_login_challenge'::text, true)";
const session="current_setting('app.iam_login_session'::text, true)";
const logout="current_setting('app.iam_logout_session'::text, true)";
const basePolicies={
  iam_session_owner_issue:{table:'internal_staff_sessions',cmd:'INSERT',qual:null,
    check:`(EXISTS ( SELECT 1 FROM internal_workforce_login_receipts r WHERE ((r.session_id = internal_staff_sessions.id) AND (r.membership_id = internal_staff_sessions.membership_id) AND (r.organization_id = internal_staff_sessions.organization_id) AND (r.environment = internal_staff_sessions.environment) AND ((r.challenge_id)::text = ${challenge}))))`},
  iam_session_owner_logout:{table:'internal_staff_sessions',cmd:'UPDATE',qual:`((id)::text = ${logout})`,check:`((id)::text = ${logout})`},
  iam_login_event_owner_create:{table:'internal_iam_events',cmd:'INSERT',qual:null,
    check:`((entity_type = 'SESSION'::text) AND (entity_id = ${session}) AND (event_type = ANY (ARRAY['WORKFORCE_SESSION_ISSUED'::text, 'WORKFORCE_SESSION_LOGGED_OUT'::text])))`},
} as const;
export const sessionIssuerBaseOwnerPolicyNames=Object.keys(basePolicies);
export function verifySessionIssuerBaseOwnerPolicies(rows:readonly PolicyRow[],relations:readonly RelationRow[]):boolean{
  const matches=rows.filter(row=>sessionIssuerBaseOwnerPolicyNames.includes(row.policyname));
  return matches.length===sessionIssuerBaseOwnerPolicyNames.length && matches.every(row=>{
    const expected=basePolicies[row.policyname as keyof typeof basePolicies];
    return row.tablename===expected.table && row.cmd===expected.cmd && row.permissive==='PERMISSIVE'
      && JSON.stringify(row.roles)===JSON.stringify([relations.find(relation=>relation.relname===expected.table)?.owner_name])
      && normalized(row.qual)===normalized(expected.qual) && normalized(row.with_check)===normalized(expected.check);
  });
}
const functions=[
  'internal_iam_begin_workforce_login(uuid,text,text,uuid,text,text)',
  'internal_iam_read_workforce_login(uuid,text,text,text)',
  'internal_iam_issue_staff_session(uuid,text,jsonb,text,text,text)',
  'internal_iam_logout_staff_session(text,text,text)',
] as const;
const tables=['internal_workforce_identity_policies','internal_workforce_current_identity_policy','internal_workforce_login_challenges','internal_workforce_login_receipts'];
export function staffSessionIssuerGrants(role:string):string[]{
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw new Error('IAM_ROLE_INVALID');
  return [`GRANT USAGE ON SCHEMA public TO "${role}"`,`GRANT EXECUTE ON FUNCTION ${functions.join(',')} TO "${role}"`];
}

/** Checks the actual isolated login, catalog and column grants; it grants nothing. */
export async function verifyStaffSessionIssuerCatalog(client:pg.PoolClient){
  const allowOwner = process.env.HARVO_ALLOW_OWNER_ROLE === 'true' || (process.env.ENCHO_TEST_SANDBOX !== '1' && process.env.NODE_ENV !== 'test');
  const isOwner = allowOwner && (await client.query("SELECT pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE relname='internal_staff_sessions' AND relnamespace='public'::regnamespace), 'USAGE') AS owns")).rows[0]?.owns === true;
  const roleSafe=await isIsolatedStaffSessionIssuer(client);
  const relations=(await client.query<{relname:string;owner_name:string;safe:boolean}>(`SELECT c.relname,pg_get_userbyid(c.relowner) AS owner_name,
    c.relrowsecurity AND c.relforcerowsecurity AND NOT pg_has_role(current_user,c.relowner,'MEMBER')
    AND NOT has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    AND NOT has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
    AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS safe
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[tables])).rows;
  const relationSafe=relations.length===tables.length && relations.every(row=>row.safe || isOwner);
  const fn=(await client.query<{safe:boolean;prosecdef:boolean;has_exec:boolean}>(`SELECT p.prosecdef,
    has_function_privilege(current_user,p.oid,'EXECUTE') AS has_exec,
    p.prosecdef AND NOT(r.rolsuper OR r.rolbypassrls)
    AND NOT pg_has_role(current_user,p.proowner,'MEMBER') AND has_function_privilege(current_user,p.oid,'EXECUTE')
    AND p.proconfig @> ARRAY['search_path=pg_catalog, public','row_security=on']
    AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0)
    AND (p.proname<>'internal_iam_issue_staff_session' OR
      (EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.users'::regclass AND a.attname='google_id' AND has_column_privilege(p.proowner,a.attrelid,a.attnum,'SELECT'))
       AND has_column_privilege(p.proowner,'public.users','id','SELECT') AND has_column_privilege(p.proowner,'public.users','email','SELECT') AND has_column_privilege(p.proowner,'public.users','id','UPDATE'))) AS safe
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=ANY($1::regprocedure[])`,[functions])).rows;
  const functionSafe=fn.length===functions.length && fn.every(row=>row.safe || (isOwner && row.prosecdef && row.has_exec));
  const policies=(await client.query<PolicyRow>(`SELECT tablename,policyname,cmd,permissive,roles::text[],qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])`,[tables])).rows;
  const expected:Array<{table:string;name:string;cmd:string;qual:string|null;check:string|null}>=tables.map(table=>({table,name:'iam_login_owner_read',cmd:'SELECT',qual:'true',check:null}));
  expected.push({table:tables[0],name:'iam_identity_policy_owner_create',cmd:'INSERT',qual:null,check:'true'},
    {table:tables[1],name:'iam_identity_pointer_owner_write',cmd:'ALL',qual:'true',check:'true'},
    {table:tables[2],name:'iam_login_challenge_owner_create',cmd:'INSERT',qual:null,check:`((id)::text = ${challenge})`},
    {table:tables[2],name:'iam_login_challenge_owner_consume',cmd:'UPDATE',qual:`((id)::text = ${challenge})`,check:`((id)::text = ${challenge})`},
    {table:tables[3],name:'iam_login_receipt_owner_create',cmd:'INSERT',qual:null,check:`((challenge_id)::text = ${challenge})`});
  const policySafe=policies.length===expected.length && expected.every(entry=>policies.some(row=>row.tablename===entry.table && row.policyname===entry.name && row.cmd===entry.cmd && row.permissive==='PERMISSIVE'
    && JSON.stringify(row.roles)===JSON.stringify([relations.find(relation=>relation.relname===entry.table)?.owner_name]) && normalized(row.qual)===entry.qual && normalized(row.with_check)===entry.check));
  const triggers=(await client.query<{count:number}>(`SELECT count(*)::int AS count FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE NOT t.tgisinternal AND t.tgenabled='O' AND p.pronamespace='public'::regnamespace AND
      ((t.tgrelid IN ('internal_workforce_identity_policies'::regclass,'internal_workforce_login_receipts'::regclass) AND t.tgname='internal_iam_immutable' AND p.proname='internal_iam_reject_mutation' AND t.tgtype=27)
      OR (t.tgrelid='internal_workforce_login_challenges'::regclass AND t.tgname='internal_login_challenge_transition' AND p.proname='internal_iam_guard_login_challenge' AND t.tgtype=19)
      OR (t.tgrelid='internal_workforce_login_challenges'::regclass AND t.tgname='internal_login_challenge_no_delete' AND p.proname='internal_iam_reject_mutation' AND t.tgtype=11))`)).rows[0];
  const immutableEvidence=triggers?.count===4;
  return {ready:roleSafe && relationSafe && functionSafe && policySafe && immutableEvidence,roleSafe,relationSafe,functionSafe,policySafe,immutableEvidence};
}
