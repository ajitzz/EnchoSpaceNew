import type pg from 'pg';

type PolicyRow={tablename:string;policyname:string;cmd:string;permissive:string;roles:string[];qual:string|null;with_check:string|null};
type RelationRow={relname:unknown;owner_name:unknown};
const setting="current_setting('app.iam_lifecycle_member'::text, true)";
const policies={
  iam_membership_owner_lifecycle:{table:'internal_organization_memberships',cmd:'UPDATE',qual:`((id)::text = ${setting})`,check:`((id)::text = ${setting})`},
  iam_session_owner_lifecycle:{table:'internal_staff_sessions',cmd:'UPDATE',qual:`((membership_id)::text = ${setting})`,check:`((membership_id)::text = ${setting})`},
  iam_assignment_owner_lifecycle:{table:'internal_work_assignments',cmd:'UPDATE',qual:`((assignee_membership_id)::text = ${setting})`,check:`((assignee_membership_id)::text = ${setting})`},
  iam_revocation_owner_lifecycle:{table:'internal_membership_grant_revocations',cmd:'INSERT',qual:null,check:`(EXISTS ( SELECT 1 FROM internal_membership_grants g WHERE ((g.id = internal_membership_grant_revocations.grant_id) AND ((g.membership_id)::text = ${setting}))))`},
} as const;
export const lifecycleBaseOwnerPolicyNames=Object.keys(policies);
const normalized=(value:string|null)=>value?.replace(/\s+/g,' ').trim()??null;
export function verifyLifecycleBaseOwnerPolicies(rows:readonly PolicyRow[],relations:readonly RelationRow[]):boolean{
  const matches=rows.filter(row=>lifecycleBaseOwnerPolicyNames.includes(row.policyname));
  return matches.length===lifecycleBaseOwnerPolicyNames.length && matches.every(row=>{
    const expected=policies[row.policyname as keyof typeof policies];
    const owner=relations.find(relation=>relation.relname===expected.table)?.owner_name;
    return row.tablename===expected.table && row.cmd===expected.cmd && row.permissive==='PERMISSIVE'
      && JSON.stringify(row.roles)===JSON.stringify([owner]) && normalized(row.qual)===normalized(expected.qual)
      && normalized(row.with_check)===normalized(expected.check);
  });
}
const helper='internal_iam_apply_workforce_lifecycle(jsonb,uuid,text,text,text)';
export function iamLifecycleRuntimeGrants(role:string):string[]{
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw new Error('IAM_ROLE_INVALID');
  return [`GRANT SELECT ON internal_workforce_lifecycle_commands TO "${role}"`,`GRANT EXECUTE ON FUNCTION ${helper} TO "${role}"`];
}
export async function verifyIamLifecycleCatalog(client:pg.PoolClient){
  const relation=(await client.query<{safe:boolean;owner_name:string}>(`SELECT c.relrowsecurity AND c.relforcerowsecurity
    AND NOT pg_has_role(current_user,c.relowner,'MEMBER')
    AND has_table_privilege(current_user,c.oid,'SELECT')
    AND NOT has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0)
    AND EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=c.oid AND t.tgname='internal_iam_immutable'
      AND t.tgenabled='O' AND t.tgtype=27 AND NOT t.tgisinternal
      AND p.proname='internal_iam_reject_mutation' AND p.pronamespace='public'::regnamespace) AS safe,pg_get_userbyid(c.relowner) AS owner_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='internal_workforce_lifecycle_commands'`)).rows[0];
  const fn=(await client.query<{safe:boolean}>(`SELECT p.prosecdef AND NOT(r.rolsuper OR r.rolbypassrls)
    AND NOT pg_has_role(current_user,p.proowner,'MEMBER') AND has_function_privilege(current_user,p.oid,'EXECUTE')
    AND p.proconfig @> ARRAY['search_path=pg_catalog, public','row_security=on']
    AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS safe
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=$1::regprocedure`,[helper])).rows[0];
  const actual=(await client.query<PolicyRow>(`SELECT tablename,policyname,cmd,permissive,roles::text[],qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='internal_workforce_lifecycle_commands'`)).rows;
  const expected=[
    {name:'iam_lifecycle_owner_read',cmd:'SELECT',roles:[relation?.owner_name],qual:'true',check:null},
    {name:'iam_lifecycle_owner_create',cmd:'INSERT',roles:[relation?.owner_name],qual:null,check:'((actor_membership_id = internal_iam_current_membership_id()) AND (organization_id = internal_iam_current_organization_id()))'},
    {name:'iam_lifecycle_self_read',cmd:'SELECT',roles:['public'],qual:"((actor_membership_id = internal_iam_current_membership_id()) AND internal_iam_is_active_session(organization_id) AND internal_iam_has_permission(organization_id, 'workforce.suspend'::text, 'WORKFORCE'::text, (organization_id)::text, NULL::text, environment, NULL::bigint))",check:null},
  ];
  const policySafe=actual.length===expected.length && expected.every(entry=>actual.some(row=>row.policyname===entry.name && row.cmd===entry.cmd && row.permissive==='PERMISSIVE' && JSON.stringify(row.roles)===JSON.stringify(entry.roles) && normalized(row.qual)===normalized(entry.qual) && normalized(row.with_check)===normalized(entry.check)));
  return {ready:relation?.safe===true && fn?.safe===true && policySafe,relationSafe:relation?.safe===true,functionSafe:fn?.safe===true,policySafe};
}
