import type pg from 'pg';

/** NOINHERIT does not prevent SET ROLE: inspect every reachable authority, not
 * only privileges currently inherited by the authenticated runtime login. */
export async function isRestrictedWorkforceRuntime(client: pg.PoolClient): Promise<boolean> {
  const row = (await client.query<{unsafe: boolean}>(`SELECT session_user<>current_user
    OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
    OR EXISTS(SELECT 1 FROM pg_roles reachable WHERE pg_has_role(current_user,reachable.oid,'MEMBER') AND (
      reachable.rolsuper OR reachable.rolbypassrls OR reachable.rolcreaterole OR reachable.rolcreatedb OR reachable.rolreplication
      OR has_schema_privilege(reachable.oid,'public','CREATE')
      OR EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND
        (pg_has_role(reachable.oid,d.datdba,'MEMBER') OR has_database_privilege(reachable.oid,d.oid,'CREATE')))
      OR has_function_privilege(reachable.oid,'internal_iam_issue_staff_session(uuid,text,jsonb,text,text,text)','EXECUTE')
      OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (
          pg_has_role(reachable.oid,c.relowner,'MEMBER')
          OR (c.relname='users' AND has_any_column_privilege(reachable.oid,c.oid,'INSERT,UPDATE,REFERENCES'))
          OR (c.relname LIKE 'internal\\_%' ESCAPE '\\' AND (
            has_table_privilege(reachable.oid,c.oid,'DELETE,TRUNCATE,TRIGGER')
            OR has_any_column_privilege(reachable.oid,c.oid,'REFERENCES')
            OR (c.relname NOT IN ('internal_action_authorizations','internal_action_approvals','internal_iam_events')
              AND has_any_column_privilege(reachable.oid,c.oid,'INSERT'))
            OR (c.relname<>'internal_action_authorizations' AND has_any_column_privilege(reachable.oid,c.oid,'UPDATE'))
          ))
        ))
    )) AS unsafe FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
  return row?.unsafe === false;
}
