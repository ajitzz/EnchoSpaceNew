#!/usr/bin/env node
/** Disposable local rehearsal only. Never loads dotenv or a database URL. */
import {readFileSync, statSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {
  bootstrapWorkforceOwners, ownerBootstrapManifestHash, OwnerBootstrapError, verifiedEmailHash,
  type OwnerBootstrapManifest, type OwnerIdentityEvidencePort,
} from '../../src/lib/iam/ownerBootstrap.js';
import {createLocalPostgresFixture} from '../../src/test/harvo/postgres.js';

const fixtureOwners = [
  {id: 90, email: 'local-owner-one@example.test'},
  {id: 91, email: 'local-owner-two@example.test'},
] as const;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Fixed synthetic identities exist only in a fresh Unix-socket PostgreSQL cluster. */
export async function createOwnerBootstrapRehearsal() {
  const fixture = await createLocalPostgresFixture({schema: 'empty'});
  let migrationPool: pg.Pool | undefined;
  try {
    await fixture.pool.query(`
      CREATE TABLE users(id INT PRIMARY KEY,email TEXT NOT NULL UNIQUE,role TEXT NOT NULL);
      CREATE ROLE cr1_bootstrap_migration LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      CREATE ROLE cr1_bootstrap_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      GRANT USAGE,CREATE ON SCHEMA public TO cr1_bootstrap_migration;
      GRANT SELECT,REFERENCES,UPDATE(id) ON users TO cr1_bootstrap_migration;
      GRANT USAGE ON SCHEMA public TO cr1_bootstrap_runtime;
    `);
    for (const owner of fixtureOwners) await fixture.pool.query('INSERT INTO users(id,email,role) VALUES($1,$2,\'admin\')', [owner.id, owner.email]);
    migrationPool = new pg.Pool({...fixture.pool.options, user: 'cr1_bootstrap_migration'});
    const client = await migrationPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(readFileSync(new URL('../../src/migrations/036_internal_organization_iam.sql', import.meta.url), 'utf8'));
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    const hashes = (await fixture.pool.query<{policy_hash: string; role_hash: string}>(`
      SELECT p.config_hash AS policy_hash,v.config_hash AS role_hash
      FROM internal_iam_current_policy c JOIN internal_iam_policy_versions p ON p.id=c.version_id
      CROSS JOIN internal_role_definitions d JOIN internal_role_current_versions r ON r.role_id=d.id
      JOIN internal_role_versions v ON v.id=r.version_id WHERE d.role_key='platform_owner'`)).rows[0];
    const issuedAt = new Date(Date.now() - 1000).toISOString();
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    const manifest: OwnerBootstrapManifest = {
      version: 1, organizationKey: 'encho', environment: 'LOCAL', activePolicyHash: hashes.policy_hash,
      ownerRoleHash: hashes.role_hash, operatorUserId: 90, reviewerUserId: 91,
      reviewEvidenceHash: digest('explicit-local-rehearsal-only-not-production-approval'), issuedAt, expiresAt,
      reason: 'Explicit synthetic local bootstrap rehearsal; no production authority.',
      owners: fixtureOwners.map(owner => ({userId: owner.id, verifiedEmailHash: verifiedEmailHash(owner.email),
        identityReceiptHash: digest(`local-fixture-receipt:${owner.id}`), verifiedSubjectHash: digest(`local-fixture-subject:${owner.id}`)})),
    };
    const identityEvidence: OwnerIdentityEvidencePort = {
      async verify(request) {
        const owner = manifest.owners.find(item => item.userId === request.userId && item.identityReceiptHash === request.receiptHash);
        return owner ? {userId: owner.userId, emailVerified: true, verifiedEmailHash: owner.verifiedEmailHash,
          receiptHash: owner.identityReceiptHash, verifiedSubjectHash: owner.verifiedSubjectHash,
          verifiedAt: issuedAt, expiresAt, source: 'LOCAL_FIXTURE'} : null;
      },
    };
    return {fixture, migrationPool, manifest, identityEvidence, close: async () => {await migrationPool?.end(); await fixture.close();}};
  } catch (error) { await migrationPool?.end(); await fixture.close(); throw error; }
}

async function main(args: string[]): Promise<void> {
  const describe = args.includes('--describe-rehearsal');
  const rehearsal = args.includes('--rehearsal');
  const apply = args.includes('--apply');
  const manifestArgument = args.find(arg => arg.startsWith('--manifest='));
  const approvedHash = args.find(arg => arg.startsWith('--reviewed-manifest-hash='))?.slice('--reviewed-manifest-hash='.length);
  const allowed = args.every(arg => ['--describe-rehearsal', '--rehearsal', '--apply'].includes(arg)
    || arg.startsWith('--manifest=') || arg.startsWith('--reviewed-manifest-hash='));
  if (!allowed || (describe && (apply || manifestArgument || rehearsal)) || (!describe && (!rehearsal || !manifestArgument))) {
    throw new OwnerBootstrapError('MANIFEST_INVALID');
  }
  const local = await createOwnerBootstrapRehearsal();
  try {
    if (describe) {
      process.stdout.write(`${JSON.stringify(local.manifest, null, 2)}\n`);
      return;
    }
    const path = manifestArgument!.slice('--manifest='.length);
    if (statSync(path).size > 65536) throw new OwnerBootstrapError('MANIFEST_INVALID');
    const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!manifest || typeof manifest !== 'object' || !('environment' in manifest) || manifest.environment !== 'LOCAL') {
      throw new OwnerBootstrapError('MANIFEST_INVALID');
    }
    const result = await bootstrapWorkforceOwners({pool: local.migrationPool, manifest,
      mode: apply ? 'APPLY' : 'DRY_RUN', reviewedManifestHash: approvedHash, identityEvidence: local.identityEvidence});
    process.stdout.write(`${JSON.stringify({scope: 'DISPOSABLE_LOCAL_REHEARSAL', ...result})}\n`);
  } finally { await local.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    // Never print database error objects, connection URLs, tokens or manifest PII.
    process.stderr.write(`${JSON.stringify({code: error instanceof OwnerBootstrapError ? error.code : 'BOOTSTRAP_REHEARSAL_FAILED'})}\n`);
    process.exitCode = 1;
  });
}

// Imported by operator tooling without invoking main or creating a connection.
export {ownerBootstrapManifestHash};
