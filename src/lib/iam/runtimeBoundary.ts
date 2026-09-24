import type pg from 'pg';

/** NOINHERIT does not prevent SET ROLE: membership, not only USAGE, is unsafe. */
export async function isRestrictedWorkforceRuntime(client: pg.PoolClient): Promise<boolean> {
  const row = (await client.query<{unsafe: boolean}>(`SELECT r.rolsuper OR r.rolbypassrls
    OR r.rolcreaterole OR r.rolcreatedb OR has_schema_privilege(current_user,'public','CREATE')
    OR pg_has_role(current_user,c.relowner,'MEMBER')
    OR EXISTS(SELECT 1 FROM pg_roles inherited WHERE pg_has_role(current_user,inherited.oid,'MEMBER')
      AND (inherited.rolsuper OR inherited.rolbypassrls OR inherited.rolcreaterole OR inherited.rolcreatedb)) AS unsafe
    FROM pg_roles r JOIN pg_class c ON c.oid='public.internal_organizations'::regclass
    WHERE r.rolname=current_user`)).rows[0];
  return row?.unsafe === false;
}
