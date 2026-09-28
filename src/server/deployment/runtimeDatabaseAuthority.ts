import type pg from 'pg';
import { z } from 'zod';

// Traverse membership even when NOINHERIT: the login may still SET ROLE. Seed
// both identities so checking through an already-switched role cannot hide
// privileged login authority. Conservative membership denial is intentional.
export const reachableRuntimeRolesSql = `WITH RECURSIVE reachable(oid) AS (
  SELECT oid FROM pg_roles WHERE rolname IN (session_user,current_user)
  UNION SELECT m.roleid FROM pg_auth_members m JOIN reachable r ON m.member=r.oid
)`;

const authoritySchema = z.object({
  unsafe_roles: z.boolean(), bypasses_rls: z.boolean(),
  owns_objects: z.boolean(), can_create: z.boolean(),
}).strict();

/** Metadata-only login authority check; not a domain RLS or release certificate. */
export async function verifyRuntimeDatabaseAuthority(client: pg.PoolClient) {
  const raw = (await client.query(`${reachableRuntimeRolesSql}
    SELECT
      EXISTS(SELECT 1 FROM pg_roles r JOIN reachable a ON r.oid=a.oid
        WHERE r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication) AS unsafe_roles,
      EXISTS(SELECT 1 FROM pg_roles r JOIN reachable a ON r.oid=a.oid
        WHERE r.rolsuper OR r.rolbypassrls) AS bypasses_rls,
      (EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND d.datdba IN(SELECT oid FROM reachable))
        OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND n.nspowner IN(SELECT oid FROM reachable))
        OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relowner IN(SELECT oid FROM reachable))
        OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proowner IN(SELECT oid FROM reachable))
        OR EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
          WHERE n.nspname='public' AND t.typowner IN(SELECT oid FROM reachable))) AS owns_objects,
      EXISTS(SELECT 1 FROM reachable r WHERE has_schema_privilege(r.oid,'public','CREATE')
        OR has_database_privilege(r.oid,current_database(),'CREATE')) AS can_create
  `)).rows[0];
  const parsed = authoritySchema.safeParse(raw);
  if (!parsed.success) return { safe: false, known: false, roleBypassesRls: null, ownsObjects: null, canCreate: null };
  const facts = parsed.data;
  return { safe: !facts.unsafe_roles && !facts.owns_objects && !facts.can_create, known: true,
    roleBypassesRls: facts.bypasses_rls, ownsObjects: facts.owns_objects, canCreate: facts.can_create };
}
