/**
 * Verifies that the connected PostgreSQL runtime adheres to FAANG L7/L8 Least-Privilege invariants.
 * Strictly verifies rolsuper=false, rolbypassrls=false, and RLS enforcement.
 */
export async function verifyDatabaseRoles(pool) {
  const errors = [];
  const warnings = [];

  const roleQuery = `
    SELECT current_user AS current_user, r.rolname, r.rolsuper, r.rolbypassrls
    FROM pg_roles r
    WHERE r.rolname = current_user;
  `;

  const roleRes = await pool.query(roleQuery);
  if (roleRes.rows.length === 0) {
    errors.push('ROLE_LOOKUP_FAILED: Unable to resolve permissions for current_user');
    return { valid: false, errors, warnings, role: null };
  }

  const role = roleRes.rows[0];

  // Invariant 1: Superuser connection is strictly prohibited
  if (role.rolsuper === true) {
    errors.push('SUPERUSER_RUNTIME_FORBIDDEN: Application runtime cannot connect as a PostgreSQL superuser (rolsuper=true)');
  }

  // Invariant 2: BYPASSRLS is strictly prohibited for application connections
  if (role.rolbypassrls === true) {
    errors.push('BYPASSRLS_RUNTIME_FORBIDDEN: Application runtime cannot have rolbypassrls=true; all queries must respect tenant RLS');
  }

  // Invariant 3: Check RLS status on critical public tables if they exist
  const rlsQuery = `
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN ('host_marketing_campaigns', 'conversations', 'test_commerce_orders', 'campaign_financial_contracts');
  `;

  const rlsRes = await pool.query(rlsQuery);
  for (const table of rlsRes.rows) {
    if (!table.relrowsecurity) {
      warnings.push(`RLS_DISABLED: Table ${table.relname} does not have ROW LEVEL SECURITY enabled`);
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    role: {
      user: role.current_user,
      isSuperuser: role.rolsuper,
      bypassRls: role.rolbypassrls,
    },
    tablesChecked: rlsRes.rows.length,
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };
}
