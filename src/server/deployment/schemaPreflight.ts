import type pg from 'pg';
import {z} from 'zod';
import {compareMigrationHistory, MigrationExecutionError} from '../../migrations/history.js';
import {migrationConnectionConfig} from '../../migrations/runner.js';
import {migrationHistoryAuthoritySql} from '../../migrations/historyAuthority.js';

const identifier = z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/);
export const deploymentSchemaTarget = z.object({
  environment: z.enum(['LOCAL', 'STAGING', 'PRODUCTION']),
  target: identifier,
  expectedDatabase: identifier,
  expectedRole: identifier,
  expectedHost: z.string().regex(/^[a-z0-9.:[\]-]{1,253}$/),
}).strict();
export type DeploymentSchemaTarget = z.infer<typeof deploymentSchemaTarget>;

/** Explicit deployment inputs only. Generic DATABASE_URL and .env are not used. */
export function schemaPreflightConfiguration(env: NodeJS.ProcessEnv): {
  target: DeploymentSchemaTarget; connection: pg.PoolConfig;
} {
  const parsed = deploymentSchemaTarget.safeParse({
    environment: env.ENCHO_DEPLOYMENT_ENVIRONMENT,
    target: env.ENCHO_DEPLOYMENT_TARGET,
    expectedDatabase: env.ENCHO_DEPLOYMENT_EXPECTED_DATABASE,
    expectedRole: env.ENCHO_DEPLOYMENT_EXPECTED_ROLE,
    expectedHost: env.ENCHO_DEPLOYMENT_EXPECTED_HOST,
  });
  if (!parsed.success) throw new MigrationExecutionError('DEPLOYMENT_TARGET_CONFIGURATION_INVALID');
  const connection = migrationConnectionConfig(env.ENCHO_DEPLOYMENT_DATABASE_URL);
  const url = new URL(connection.connectionString!);
  if (parsed.data.environment !== 'LOCAL' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new MigrationExecutionError('DEPLOYMENT_ENVIRONMENT_MISMATCH');
  }
  if (url.hostname !== parsed.data.expectedHost || decodeURIComponent(url.username) !== parsed.data.expectedRole
    || decodeURIComponent(url.pathname.slice(1)) !== parsed.data.expectedDatabase) {
    throw new MigrationExecutionError('DEPLOYMENT_TARGET_IDENTITY_MISMATCH');
  }
  return {target: parsed.data, connection: {...connection, application_name: 'encho_readonly_schema_preflight'}};
}

const identitySchema = z.object({
  database_name: z.string(), login_role: z.string(), effective_role: z.string(),
  unsafe_roles: z.boolean(), owns_objects: z.boolean(), can_create: z.boolean(),
}).strict();

/** Proves exact migration history and basic login isolation only. Domain policy
 * readiness and end-to-end role journeys remain separate release predicates.
 * No DDL-capable executor is called; a missing history table stays missing. */
export async function verifyDeploymentSchema(pool: Pick<pg.Pool, 'connect'>, rawTarget: unknown,
  sourceManifest: unknown, packagedManifest: unknown) {
  const target = deploymentSchemaTarget.parse(rawTarget);
  compareMigrationHistory(sourceManifest, packagedManifest, {requireComplete: true});
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='3s'");
    const lock = await client.query<{locked: boolean}>('SELECT pg_try_advisory_xact_lock_shared(82749102) AS locked');
    if (lock.rows[0]?.locked !== true) throw new MigrationExecutionError('MIGRATION_LOCK_BUSY');
    const identity = identitySchema.parse((await client.query(`
      WITH RECURSIVE reachable(oid) AS (
        SELECT oid FROM pg_roles WHERE rolname=session_user
        UNION SELECT m.roleid FROM pg_auth_members m JOIN reachable r ON m.member=r.oid
      )
      SELECT current_database() AS database_name, session_user AS login_role, current_user AS effective_role,
        EXISTS(SELECT 1 FROM pg_roles r JOIN reachable a ON r.oid=a.oid
          WHERE r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication) AS unsafe_roles,
        (EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND d.datdba IN(SELECT oid FROM reachable))
          OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relowner IN(SELECT oid FROM reachable))
          OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND n.nspowner IN(SELECT oid FROM reachable))
          OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proowner IN(SELECT oid FROM reachable))) AS owns_objects,
        EXISTS(SELECT 1 FROM reachable r WHERE has_schema_privilege(r.oid,'public','CREATE')
          OR has_database_privilege(r.oid,current_database(),'CREATE')) AS can_create
    `)).rows[0]);
    if (identity.database_name !== target.expectedDatabase || identity.login_role !== target.expectedRole
      || identity.effective_role !== target.expectedRole) throw new MigrationExecutionError('DEPLOYMENT_TARGET_IDENTITY_MISMATCH');
    if (identity.unsafe_roles || identity.owns_objects || identity.can_create) throw new MigrationExecutionError('DEPLOYMENT_RUNTIME_ROLE_UNSAFE');
    const exists = await client.query<{present: boolean}>("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present");
    if (exists.rows[0]?.present !== true) throw new MigrationExecutionError('MIGRATION_HISTORY_MISSING');
    const permissions = await client.query<{can_mutate: boolean; owns: boolean}>(migrationHistoryAuthoritySql);
    if (permissions.rows[0]?.can_mutate !== false || permissions.rows[0]?.owns !== false) throw new MigrationExecutionError('MIGRATION_HISTORY_MUTABLE');
    const history = (await client.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows;
    compareMigrationHistory(sourceManifest, history, {requireComplete: true});
    await client.query('COMMIT');
    return {status: 'SCHEMA_IDENTITY_VERIFIED' as const, target, migrationCount: history.length,
      scope: 'exact source/packaged/applied history and basic actual-login isolation only',
      environmentAuthority: 'operator-declared; independent staging/production identity not certified',
      productionCertification: false as const};
  } finally {
    try {await client.query('ROLLBACK');} catch {discard = true;}
    client.release(discard);
  }
}
