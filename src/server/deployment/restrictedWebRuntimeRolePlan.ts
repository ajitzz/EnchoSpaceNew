import { adtechRolloutGrants } from './adtechReadiness.js';
import { portfolioRolloutGrants } from './portfolioRehearsal.js';

const quoteRole = (name: string): string => {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error('RUNTIME_ROLE_INVALID');
  return `"${name}"`;
};

/**
 * DBA-reviewed bootstrap for a NEW login only. No password, target database,
 * SQL executor, or ambient connection is supplied by application code.
 * Password creation/rotation and CONNECT permission belong to the named
 * environment's secret-management procedure.
 *
 * This is the readiness + consumer-authentication minimum, not a full web,
 * marketing-worker, or workforce role. Never switch a deployment to it until
 * mounted Guest/Host/Admin paths and an isolated staging readback are proven.
 */
export function restrictedWebRuntimeRolePlan(roleName: string): readonly string[] {
  const role = quoteRole(roleName);
  return [
    `CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`,
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    `GRANT SELECT ON public.schema_migrations TO ${role}`,
    `GRANT SELECT ON public.users,public.settings,public.listings,public.host_marketing_campaigns,public.marketing_campaign_revisions TO ${role}`,
    // Registration and Google/phone account creation use these exact columns.
    // SELECT is required by their RETURNING clauses and current SELECT * login.
    `GRANT INSERT(email,password_hash,name,role,phone,google_id) ON public.users TO ${role}`,
    `GRANT UPDATE(google_id,name,avatar,editorial_quote) ON public.users TO ${role}`,
    `GRANT USAGE ON SEQUENCE public.users_id_seq TO ${role}`,
    `GRANT SELECT,INSERT ON public.marketing_pause_recoveries TO ${role}`,
    `GRANT SELECT,INSERT,UPDATE ON public.marketing_pause_recovery_attempts TO ${role}`,
    // 023–026 were installed before portfolioRolloutGrants existed. A fresh
    // role does not inherit those historical grants from the former app role.
    `GRANT SELECT,INSERT ON public.marketing_fact_snapshots,public.marketing_revision_products,public.marketing_campaign_search_targets,public.marketing_campaign_search_scopes,public.marketing_search_conflict_assessments,public.marketing_search_conflict_reviews TO ${role}`,
    // portfolioRolloutGrants predates keyword research; its catalog requires
    // these two mutable tables in addition to the later 027–031 grants.
    `GRANT SELECT,INSERT,UPDATE,DELETE ON public.marketing_keyword_research TO ${role}`,
    `GRANT SELECT,INSERT,UPDATE ON public.marketing_keyword_customer_slots TO ${role}`,
    ...portfolioRolloutGrants(roleName),
    ...adtechRolloutGrants(roleName),
  ];
}
