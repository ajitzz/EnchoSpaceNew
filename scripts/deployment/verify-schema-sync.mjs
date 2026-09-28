#!/usr/bin/env node
/** Explicit, read-only deployment preflight. Never loads dotenv or applies DDL. */
import pg from 'pg';

let pool;
try {
  const {schemaPreflightConfiguration, verifyDeploymentSchema} = await import('../../build/server/src/server/deployment/schemaPreflight.js');
  const {target, connection} = schemaPreflightConfiguration(process.env);
  const {readMigrationManifest} = await import('../../build/server/src/migrations/manifest.js');
  const source = readMigrationManifest(new URL('../../src/migrations/', import.meta.url));
  const packaged = readMigrationManifest(new URL('../../build/server/src/migrations/', import.meta.url));
  pool = new pg.Pool(connection);
  console.log(JSON.stringify(await verifyDeploymentSchema(pool, target, source, packaged)));
} catch (error) {
  // Driver/module errors may contain connection strings or local secrets.
  const code = typeof error?.code === 'string' && /^(?:MIGRATION|DEPLOYMENT)_[A-Z_]+$/.test(error.code)
    ? error.code : 'DEPLOYMENT_PREFLIGHT_UNAVAILABLE';
  console.error(JSON.stringify({status: 'FAILED', code, productionCertification: false}));
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
