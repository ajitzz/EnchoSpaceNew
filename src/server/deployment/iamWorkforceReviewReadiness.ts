import type pg from 'pg';

export const workforceReviewHelper='internal_iam_project_workforce_review(uuid,text,uuid,uuid,uuid,integer)';
const expectedBodyHash='2d854dff4cd0784a3de904c1b27ddb38148c8255792f07eb3c5bccca392fdfb3';
const sourceTables=['internal_organizations','internal_permission_catalog','internal_iam_current_policy','internal_iam_policy_versions',
  'internal_organization_memberships','internal_membership_grants','internal_membership_grant_revocations',
  'internal_role_versions','internal_role_definitions','internal_organization_invitations'];

/** Separate opt-in grant. Base IAM does not enable organization directory reads. */
export function iamWorkforceReviewRuntimeGrants(role:string):string[]{
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw new Error('IAM_ROLE_INVALID');
  return [`GRANT EXECUTE ON FUNCTION ${workforceReviewHelper} TO "${role}"`];
}
export async function verifyIamWorkforceReviewCatalog(client:pg.PoolClient){
  const row=(await client.query<{safe:boolean;source_safe:boolean}>(`SELECT
    p.prosecdef AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolcanlogin OR r.rolcreaterole OR r.rolcreatedb)
    AND NOT pg_has_role(current_user,p.proowner,'MEMBER')
    AND has_function_privilege(current_user,p.oid,'EXECUTE')
    AND p.proconfig @> ARRAY['search_path=pg_catalog, public','row_security=on']
    AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=$2
    AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS safe,
    (SELECT count(*)=$4 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity AND c.relowner=p.proowner
      AND EXISTS(SELECT 1 FROM pg_policy pol WHERE pol.polrelid=c.oid AND pol.polname='iam_catalog_owner_read'
        AND pol.polcmd='r' AND pol.polroles=ARRAY[p.proowner] AND pg_get_expr(pol.polqual,pol.polrelid)='true'))
      FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($3::text[])) AS source_safe
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($1)`,
  [workforceReviewHelper,expectedBodyHash,sourceTables,sourceTables.length])).rows[0];
  return {ready:row?.safe===true&&row.source_safe===true,functionSafe:row?.safe===true,sourceSafe:row?.source_safe===true};
}
