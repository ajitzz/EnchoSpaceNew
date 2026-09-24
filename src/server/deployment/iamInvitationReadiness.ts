import type pg from 'pg';

type PolicyRow={tablename:string;policyname:string;cmd:string;permissive:string;roles:string[];qual:string|null;with_check:string|null};
type RelationRow={relname:unknown;owner_name:unknown};
const setting="current_setting('app.iam_acceptance_invitation'::text, true)";
const ownerPolicies={
  iam_invitation_owner_create:{table:'internal_organization_invitations',command:'INSERT',using:null,
    check:'((inviter_membership_id = internal_iam_current_membership_id()) AND (invited_by = internal_iam_current_user_id()))'},
  iam_invitation_owner_accept:{table:'internal_organization_invitations',command:'UPDATE',using:`((id)::text = ${setting})`,check:`((id)::text = ${setting})`},
  iam_membership_owner_accept:{table:'internal_organization_memberships',command:'INSERT',using:null,
    check:`(EXISTS ( SELECT 1 FROM internal_invitation_identity_receipts r WHERE ((r.membership_id = internal_organization_memberships.id) AND (r.user_id = internal_organization_memberships.user_id) AND (r.invitation_id = internal_organization_memberships.accepted_invitation_id) AND (r.organization_id = internal_organization_memberships.organization_id) AND ((r.invitation_id)::text = ${setting}))))`},
  iam_grant_owner_accept:{table:'internal_membership_grants',command:'INSERT',using:null,
    check:`(EXISTS ( SELECT 1 FROM internal_invitation_identity_receipts r WHERE ((r.membership_id = internal_membership_grants.membership_id) AND (r.organization_id = internal_membership_grants.organization_id) AND ((r.invitation_id)::text = ${setting}))))`},
  iam_event_owner_accept:{table:'internal_iam_events',command:'INSERT',using:null,
    check:`((entity_type = 'INVITATION'::text) AND (entity_id = ${setting}) AND (event_type = ANY (ARRAY['WORKFORCE_INVITATION_ACCEPTED'::text, 'WORKFORCE_INVITATION_EXPIRED'::text])))`},
} as const;
export const invitationBaseOwnerPolicyNames=Object.keys(ownerPolicies);
const normalized=(value:string|null)=>value?.replace(/\s+/g,' ').trim()??null;
export function verifyInvitationBaseOwnerPolicies(policies:readonly PolicyRow[],relations:readonly RelationRow[]):boolean {
  const selected=policies.filter(policy=>invitationBaseOwnerPolicyNames.includes(policy.policyname));
  return selected.length===invitationBaseOwnerPolicyNames.length && selected.every(policy=>{
    const expected=ownerPolicies[policy.policyname as keyof typeof ownerPolicies];
    const relation=relations.find(row=>row.relname===expected.table);
    return policy.tablename===expected.table && policy.cmd===expected.command && policy.permissive==='PERMISSIVE'
      && JSON.stringify(policy.roles)===JSON.stringify([relation?.owner_name])
      && normalized(policy.qual)===normalized(expected.using) && normalized(policy.with_check)===normalized(expected.check);
  });
}

const acceptanceFunction='internal_iam_accept_invitation(text,text,jsonb,text,text)';
const issueFunctions=['internal_iam_issue_invitation(jsonb,uuid,text,text)','internal_iam_revoke_invitation(jsonb,uuid,text)'];
function roleIdentifier(role:string):string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(role)) throw new Error('IAM_ROLE_INVALID');return `"${role}"`;
}
/** Additional exact function grants; no raw invitation INSERT/UPDATE grant. */
export function iamInvitationRuntimeGrants(role:string):string[] {
  return [`GRANT EXECUTE ON FUNCTION ${issueFunctions.join(',')} TO ${roleIdentifier(role)}`];
}
/** Configure a separate identity adapter role, never the shared workforce role. */
export function iamInvitationIdentityWriterGrants(role:string):string[] {
  const target=roleIdentifier(role);
  return [`GRANT USAGE ON SCHEMA public TO ${target}`,`GRANT EXECUTE ON FUNCTION ${acceptanceFunction} TO ${target}`];
}

export async function verifyIamInvitationCatalog(client:pg.PoolClient,mode:'RUNTIME'|'IDENTITY_WRITER') {
  const functions=(await client.query<{proname:string;safe:boolean;executable:boolean}>(`SELECT p.proname,
    p.prosecdef AND NOT(r.rolsuper OR r.rolbypassrls) AND NOT pg_has_role(current_user,p.proowner,'MEMBER')
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public','row_security=on']
      AND (p.proname<>'internal_iam_accept_invitation' OR
        (has_column_privilege(p.proowner,'public.users','id','SELECT') AND has_column_privilege(p.proowner,'public.users','id','UPDATE')
          AND has_column_privilege(p.proowner,'public.users','email','SELECT')))
      AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS safe,
    has_function_privilege(current_user,p.oid,'EXECUTE') AS executable
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
    WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,[['internal_iam_accept_invitation','internal_iam_issue_invitation','internal_iam_revoke_invitation']])).rows;
  const functionsSafe=functions.length===3 && functions.every(row=>row.safe && row.executable===(mode==='IDENTITY_WRITER'?row.proname==='internal_iam_accept_invitation':row.proname!=='internal_iam_accept_invitation'));
  const role=(await client.query<{safe:boolean}>(`SELECT NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR has_schema_privilege(current_user,'public','CREATE'))
    AND session_user=current_user
    AND NOT EXISTS(SELECT 1 FROM pg_roles inherited WHERE pg_has_role(current_user,inherited.oid,'MEMBER') AND (inherited.rolsuper OR inherited.rolbypassrls OR inherited.rolcreaterole OR inherited.rolcreatedb))
    AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND ($1::boolean OR c.relname LIKE 'internal_%')
      AND (pg_has_role(current_user,c.relowner,'MEMBER') OR ($1::boolean AND
        (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))))) AS safe
    FROM pg_roles r WHERE r.rolname=current_user`,[mode==='IDENTITY_WRITER'])).rows[0];
  const receipt=(await client.query<{safe:boolean}>(`SELECT c.relrowsecurity AND c.relforcerowsecurity
    AND NOT has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    AND NOT has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
    AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl WHERE acl.grantee=0)
    AND EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=c.oid AND t.tgname='internal_iam_immutable' AND p.proname='internal_iam_reject_mutation') AS safe
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='internal_invitation_identity_receipts'`)).rows[0];
  const receiptPolicies=(await client.query<PolicyRow & {owner_name:string}>(`SELECT p.tablename,p.policyname,p.cmd,p.permissive,p.roles::text[],p.qual,p.with_check,pg_get_userbyid(c.relowner) AS owner_name
    FROM pg_policies p JOIN pg_class c ON c.relname=p.tablename JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=p.schemaname
    WHERE p.schemaname='public' AND p.tablename='internal_invitation_identity_receipts'`)).rows;
  const identityPoliciesSafe=receiptPolicies.length===2 && receiptPolicies.every(row=>row.permissive==='PERMISSIVE' && JSON.stringify(row.roles)===JSON.stringify([row.owner_name])
    && (row.policyname==='iam_identity_receipt_owner_read' ? row.cmd==='SELECT' && row.qual==='true' && row.with_check===null
      : row.policyname==='iam_identity_receipt_owner_insert' && row.cmd==='INSERT' && row.qual===null && normalized(row.with_check)===`((invitation_id)::text = ${setting})`));
  const lifecycle=(await client.query<{safe:boolean}>(`SELECT
    EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='internal_organization_invitations'::regclass AND t.tgname='internal_invitation_transition' AND p.proname='internal_iam_guard_invitation')
    AND EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='internal_organization_invitations'::regclass AND t.tgname='internal_invitation_no_delete' AND p.proname='internal_iam_reject_mutation')
    AND EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='internal_action_authorizations'::regclass AND t.tgname='internal_consumption_transaction' AND p.proname='internal_iam_stamp_consumption_transaction') AS safe`)).rows[0];
  return {ready:functionsSafe && role?.safe===true && receipt?.safe===true && identityPoliciesSafe && lifecycle?.safe===true,
    functionsSafe,roleSafe:role?.safe===true,receiptSafe:receipt?.safe===true,identityPoliciesSafe,lifecycleSafe:lifecycle?.safe===true};
}
