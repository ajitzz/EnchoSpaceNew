import {readFileSync} from 'node:fs';
import type pg from 'pg';
import {deployedMigrationManifest} from './recoveryReadiness.js';
import {verifyPortfolioCatalog} from './portfolioReadiness.js';

const immutable = ['marketing_attribution_links','marketing_measurement_consents','marketing_attribution_touchpoints','marketing_pool_events','marketing_pool_exposures','marketing_pool_spend_claims','marketing_spatial_stories','marketing_spatial_story_reviews','marketing_inquiry_attributions'];
const mutable = ['marketing_destination_pools','marketing_pool_memberships'];
const sequences = ['marketing_measurement_consents_sequence_seq','marketing_spatial_story_reviews_sequence_seq'];
const identifier = (value:string) => `"${value.replaceAll('"','""')}"`;

/** The branch label is operator-attested; the endpoint/database pin is enforced before connecting. */
export function stagedRehearsalConnection(env:Record<string,string>):pg.PoolConfig & {enableChannelBinding:true} {
  if (env.HARVO_STAGING_CONFIRMED !== 'true' || !/^br-[a-z0-9-]+$/.test(env.HARVO_STAGING_BRANCH_ID || '')) throw new Error('STAGING_IDENTITY_REQUIRED');
  portfolioRolloutGrants(env.HARVO_STAGING_RUNTIME_ROLE);
  const url = new URL(env.HARVO_STAGING_MIGRATION_URL);
  if (!['postgres:','postgresql:'].includes(url.protocol) || !url.username || !url.password || !url.hostname.endsWith('.neon.tech') || url.hostname.includes('-pooler.') || url.hostname !== env.HARVO_STAGING_EXPECTED_HOST || decodeURIComponent(url.pathname.slice(1)) !== env.HARVO_STAGING_EXPECTED_DATABASE) throw new Error('DIRECT_STAGING_ENDPOINT_REQUIRED');
  for (const key of [...url.searchParams.keys()]) if (!['sslmode','channel_binding'].includes(key)) throw new Error('UNEXPECTED_CONNECTION_OPTION');
  // Script-only URL copy: prevent URL SSL options overriding certificate/hostname validation.
  url.searchParams.delete('sslmode');url.searchParams.delete('channel_binding');
  // pg supports this option; the installed @types/pg does not yet declare it.
  return {connectionString:url.toString(),ssl:{rejectUnauthorized:true},enableChannelBinding:true,max:1,connectionTimeoutMillis:10000,application_name:'harvo034_staging_rehearsal'};
}

export function portfolioRolloutGrants(runtimeRole:string) {
  if (typeof runtimeRole !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(runtimeRole)) throw new Error('RUNTIME_ROLE_INVALID');
  const role = identifier(runtimeRole);
  return [
    `GRANT SELECT,INSERT ON ${immutable.map(identifier).join(',')} TO ${role}`,
    `GRANT SELECT,INSERT,UPDATE ON ${mutable.map(identifier).join(',')} TO ${role}`,
    `GRANT SELECT,INSERT,DELETE ON marketing_measurement_payloads TO ${role}`,
    `GRANT USAGE ON SEQUENCE ${sequences.map(identifier).join(',')} TO ${role}`,
  ];
}

/** Only 027–031, no fixture rows, no commit. The caller must identify the staging connection. */
export async function rehearsePortfolioRollout(c:pg.PoolClient,runtimeRole:string) {
  const grants = portfolioRolloutGrants(runtimeRole);
  const manifest = deployedMigrationManifest();
  const batch = manifest.filter(m => /^(027|028|029|030|031)_/.test(m.version));
  if (batch.length !== 5) throw new Error('ROLLOUT_MANIFEST_INVALID');
  await c.query('BEGIN');
  try {
    await c.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='60s'; SET LOCAL search_path=public,pg_catalog");
    if (!(await c.query('SELECT pg_try_advisory_xact_lock(82749102) AS acquired')).rows[0]?.acquired) throw new Error('MIGRATION_LOCK_BUSY');
    const role = (await c.query('SELECT oid,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication FROM pg_roles WHERE rolname=$1',[runtimeRole])).rows[0];
    if (!role || role.rolsuper || role.rolbypassrls || role.rolcreaterole || role.rolcreatedb || role.rolreplication) throw new Error('RUNTIME_ROLE_UNSAFE');
    const reachable = (await c.query(`WITH RECURSIVE roles(oid) AS (
      SELECT $1::oid UNION SELECT m.roleid FROM pg_auth_members m JOIN roles r ON m.member=r.oid
    ) SELECT EXISTS(SELECT 1 FROM roles r JOIN pg_roles p ON p.oid=r.oid WHERE p.rolsuper OR p.rolbypassrls OR p.rolcreaterole OR p.rolcreatedb OR p.rolreplication)
      OR EXISTS(SELECT 1 FROM roles r JOIN pg_class t ON t.relowner=r.oid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relkind IN ('r','p','S')) AS unsafe`,[role.oid])).rows[0]?.unsafe;
    if (reachable) throw new Error('RUNTIME_ROLE_OWNER_OR_PRIVILEGED_MEMBER');
    const history = (await c.query('SELECT version,checksum FROM public.schema_migrations')).rows;
    for (const migration of manifest) {
      const prior = Number(migration.version.slice(0,3)) < 27;
      const recorded = history.find(r => r.version === migration.version);
      if (recorded ? recorded.checksum !== migration.checksum : prior) throw new Error('MIGRATION_HISTORY_MISSING_OR_DRIFTED');
    }
    const executed:string[] = [];
    for (const migration of batch) {
      if (history.some(r => r.version === migration.version)) continue;
      const sql = readFileSync(new URL(`../../migrations/${migration.version}`,import.meta.url),'utf8');
      if (/\bCONCURRENTLY\b|-- NON-TRANSACTIONAL/.test(sql)) throw new Error('TRANSACTIONAL_BATCH_REQUIRED');
      await c.query(sql);
      await c.query('INSERT INTO public.schema_migrations(version,checksum) VALUES($1,$2)',[migration.version,migration.checksum]);
      executed.push(migration.version);
    }
    for (const grant of grants) await c.query(grant);
    await c.query(`SET LOCAL ROLE ${identifier(runtimeRole)}`);
    const portfolio = await verifyPortfolioCatalog(c);
    if (!portfolio.ready) throw new Error('PORTFOLIO_CATALOG_REJECTED');
    return {status:'REHEARSED_ROLLED_BACK' as const, executed, retained:batch.filter(m=>!executed.includes(m.version)).map(m=>m.version), portfolio};
  } finally {
    // A broken connection also rolls its transaction back on the database; never mask it as success.
    await c.query('ROLLBACK');
  }
}
