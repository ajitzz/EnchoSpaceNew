/** Includes NOINHERIT memberships: SET ROLE can acquire their permissions.
 * Table ACLs alone miss column UPDATE/INSERT/REFERENCES grants. */
export const migrationHistoryAuthoritySql = `
  WITH RECURSIVE reachable(oid) AS (
    SELECT oid FROM pg_roles WHERE rolname = session_user
    UNION SELECT m.roleid FROM pg_auth_members m JOIN reachable r ON m.member = r.oid
  )
  SELECT c.relowner IN (SELECT oid FROM reachable) AS owns,
    EXISTS(SELECT 1 FROM reachable r WHERE
      has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE,REFERENCES')) AS can_mutate
  FROM pg_class c WHERE c.oid = 'public.schema_migrations'::regclass
`;
