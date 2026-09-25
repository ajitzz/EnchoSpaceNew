import type pg from 'pg';

/**
 * Validates that the executing PostgreSQL connection complies with FAANG L7/L8
 * Least-Privilege & Tenant Boundary Invariants.
 * 
 * In isolated sandbox/test execution (e.g. cr1_iam_runtime in Docker/vitest):
 *   Strictly ensures an unprivileged non-owner role, no superuser, no bypassrls, no schema create.
 * 
 * In managed cloud deployments (e.g. Neon, Aurora Serverless) when allowOwner is enabled:
 *   Validates that the connecting role is NOT a superuser, and that FORCE ROW LEVEL
 *   SECURITY is strictly active on internal IAM tables so that all tenant isolation
 *   and staff authorization policies are immutably evaluated by the PostgreSQL kernel.
 */
export async function isRestrictedWorkforceRuntime(client: pg.PoolClient): Promise<boolean> {
  const allowOwner = process.env.HARVO_ALLOW_OWNER_ROLE === 'true' || (process.env.ENCHO_TEST_SANDBOX !== '1' && process.env.NODE_ENV !== 'test');
  if (allowOwner) {
    const ownerCheck = (await client.query<{ safe: boolean }>(`
      SELECT NOT r.rolsuper
        AND c.relrowsecurity
        AND c.relforcerowsecurity
        AND pg_has_role(current_user, c.relowner, 'USAGE') AS safe
      FROM pg_roles r
      JOIN pg_class c ON c.oid = 'public.internal_organizations'::regclass
      WHERE r.rolname = current_user
    `)).rows[0];
    if (ownerCheck?.safe === true) {
      return true;
    }
  }

  // Strict isolated non-owner role check (for Docker local fixture / enterprise dedicated roles)
  const row = (await client.query<{ unsafe: boolean }>(`
    SELECT r.rolsuper OR r.rolbypassrls
      OR r.rolcreaterole OR r.rolcreatedb OR has_schema_privilege(current_user, 'public', 'CREATE')
      OR pg_has_role(current_user, c.relowner, 'MEMBER')
      OR EXISTS (
        SELECT 1 FROM pg_roles inherited
        WHERE pg_has_role(current_user, inherited.oid, 'MEMBER')
          AND (inherited.rolsuper OR inherited.rolbypassrls OR inherited.rolcreaterole OR inherited.rolcreatedb)
      ) AS unsafe
    FROM pg_roles r
    JOIN pg_class c ON c.oid = 'public.internal_organizations'::regclass
    WHERE r.rolname = current_user
  `)).rows[0];

  return row?.unsafe === false;
}
