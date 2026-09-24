import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import pg from 'pg';
import {createOwnerBootstrapRehearsal} from '../../../scripts/cr1/bootstrap-workforce.js';
import {
  bootstrapWorkforceOwners, ownerBootstrapManifestHash, ownerBootstrapManifestSchema,
  type OwnerIdentityEvidencePort,
} from '../../lib/iam/ownerBootstrap.js';

describe('CR1 explicit workforce owner bootstrap on real PostgreSQL', () => {
  let local: Awaited<ReturnType<typeof createOwnerBootstrapRehearsal>>;
  beforeEach(async () => {local = await createOwnerBootstrapRehearsal();}, 30000);
  afterEach(async () => {await local?.close();});
  const count = async (table: string) => Number((await local.fixture.pool.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count);
  const run = (mode: 'DRY_RUN' | 'APPLY' = 'DRY_RUN', manifest: unknown = local.manifest, identityEvidence = local.identityEvidence) => bootstrapWorkforceOwners({
    pool: local.migrationPool, manifest, mode, reviewedManifestHash: ownerBootstrapManifestHash(manifest), identityEvidence,
  });
  const remainingPolicies = async () => (await local.fixture.pool.query("SELECT policyname FROM pg_policies WHERE policyname LIKE 'cr1_bootstrap_%'")).rowCount;

  it('hashes semantic owner order deterministically and rejects duplicate identities and production single-owner manifests', () => {
    expect(ownerBootstrapManifestHash(local.manifest)).toBe(ownerBootstrapManifestHash({...local.manifest, owners: [...local.manifest.owners].reverse()}));
    expect(ownerBootstrapManifestSchema.safeParse({...local.manifest, owners: [local.manifest.owners[0], local.manifest.owners[0]]}).success).toBe(false);
    expect(ownerBootstrapManifestSchema.safeParse({...local.manifest, environment: 'PRODUCTION', reviewerUserId: 90, owners: [local.manifest.owners[0]]}).success).toBe(false);
  });

  it('dry-runs without membership, grant, session, factor or audit writes', async () => {
    expect(await run()).toMatchObject({outcome: 'DRY_RUN', eventId: null, ownerUserIds: [90, 91]});
    for (const table of ['internal_organization_memberships', 'internal_membership_grants', 'internal_staff_sessions', 'internal_step_up_challenges', 'internal_iam_events']) expect(await count(table)).toBe(0);
    expect(await remainingPolicies()).toBe(0);
  });

  it('requires explicit review hash and independently verified current exact email evidence', async () => {
    await expect(bootstrapWorkforceOwners({pool: local.migrationPool, manifest: local.manifest, mode: 'APPLY', identityEvidence: local.identityEvidence})).rejects.toMatchObject({code: 'MANIFEST_REVIEW_REQUIRED'});
    const missing: OwnerIdentityEvidencePort = {verify: async () => null};
    await expect(run('APPLY', local.manifest, missing)).rejects.toMatchObject({code: 'OWNER_IDENTITY_UNVERIFIED'});
    const stale: OwnerIdentityEvidencePort = {verify: async request => {
      const proof = await local.identityEvidence.verify(request);
      return proof && {...proof, verifiedAt: new Date(Date.now() - 172800000).toISOString()};
    }};
    await expect(run('APPLY', local.manifest, stale)).rejects.toMatchObject({code: 'OWNER_IDENTITY_UNVERIFIED'});
    await local.fixture.pool.query("UPDATE users SET email='changed@example.test' WHERE id=91");
    await expect(run('APPLY')).rejects.toMatchObject({code: 'OWNER_ACCOUNT_MISMATCH'});
    expect(await count('internal_organization_memberships')).toBe(0);
  });

  it('rejects stale manifest, changed policy and unapproved production policy', async () => {
    await expect(run('APPLY', {...local.manifest, issuedAt: new Date(Date.now() - 7200000).toISOString(), expiresAt: new Date(Date.now() - 3600000).toISOString()})).rejects.toMatchObject({code: 'MANIFEST_NOT_CURRENT'});
    await expect(run('APPLY', {...local.manifest, activePolicyHash: 'f'.repeat(64)})).rejects.toMatchObject({code: 'POLICY_MISMATCH'});
    const trusted: OwnerIdentityEvidencePort = {verify: async request => {const proof = await local.identityEvidence.verify(request); return proof && {...proof, source: 'TRUSTED_IDENTITY_SERVICE'};}};
    await expect(run('APPLY', {...local.manifest, environment: 'PRODUCTION'}, trusted)).rejects.toMatchObject({code: 'POLICY_NOT_APPROVED'});
    await expect(run('APPLY', {...local.manifest, environment: 'PRODUCTION'})).rejects.toMatchObject({code: 'OWNER_IDENTITY_UNVERIFIED'});
  });

  it('rejects the shared runtime connection before granting authority', async () => {
    const runtime = new pg.Pool({...local.fixture.pool.options, user: 'cr1_bootstrap_runtime'});
    try {
      await expect(bootstrapWorkforceOwners({pool: runtime, manifest: local.manifest, mode: 'APPLY', reviewedManifestHash: ownerBootstrapManifestHash(local.manifest), identityEvidence: local.identityEvidence})).rejects.toMatchObject({code: 'MIGRATION_OWNER_REQUIRED'});
    } finally {await runtime.end();}
    await expect(bootstrapWorkforceOwners({pool: local.fixture.pool, manifest: local.manifest, mode: 'APPLY', reviewedManifestHash: ownerBootstrapManifestHash(local.manifest), identityEvidence: local.identityEvidence})).rejects.toMatchObject({code: 'MIGRATION_OWNER_REQUIRED'});
  });

  it('rejects owner-role permission widening even when the released hash has not changed', async () => {
    await local.fixture.pool.query(`INSERT INTO internal_role_permissions(role_version_id,permission_code)
      SELECT v.id,'provider.activate' FROM internal_role_versions v JOIN internal_role_definitions d ON d.id=v.role_id WHERE d.role_key='platform_owner'`);
    await expect(run('APPLY')).rejects.toMatchObject({code: 'OWNER_ROLE_MISMATCH'});
    expect(await count('internal_organization_memberships')).toBe(0);
  });

  it('honors an explicitly approved production policy only with distinct freshly verified owners', async () => {
    const policy = (await local.fixture.pool.query(`INSERT INTO internal_iam_policy_versions(version,config,config_hash,approval_status,reason)
      SELECT 2,config || '{"version":2,"operationalApproval":"APPROVED"}'::jsonb,repeat('0',64),'APPROVED','Explicit isolated test policy approval; not deployment approval.'
      FROM internal_iam_policy_versions WHERE version=1 RETURNING id,config_hash`)).rows[0];
    await local.fixture.pool.query('UPDATE internal_iam_current_policy SET version_id=$1', [policy.id]);
    const manifest = {...local.manifest, environment: 'PRODUCTION', activePolicyHash: policy.config_hash};
    const trustedFixture: OwnerIdentityEvidencePort = {verify: async request => {
      const proof = await local.identityEvidence.verify(request);
      return proof && {...proof, source: 'TRUSTED_IDENTITY_SERVICE'};
    }};
    expect(await run('APPLY', manifest, trustedFixture)).toMatchObject({outcome: 'APPLIED'});
    expect(await count('internal_staff_sessions')).toBe(0);
    expect(await remainingPolicies()).toBe(0);
  });

  it('serializes simultaneous bootstrap attempts without duplicate grants or audit events', async () => {
    const attempts = await Promise.allSettled([run('APPLY'), run('APPLY')]);
    expect(attempts.filter(result => result.status === 'fulfilled' && result.value.outcome === 'APPLIED')).toHaveLength(1);
    for (const result of attempts) if (result.status === 'rejected') expect(result.reason).toMatchObject({code: 'BOOTSTRAP_TRANSACTION_FAILED'});
    expect(await run('APPLY')).toMatchObject({outcome: 'ALREADY_APPLIED'});
    expect(await count('internal_organization_memberships')).toBe(2);
    expect(await count('internal_membership_grants')).toBe(2);
    expect(await count('internal_iam_events')).toBe(1);
    expect(await remainingPolicies()).toBe(0);
  });

  it('rolls back all membership/grant/policy changes when the second member write fails', async () => {
    await local.fixture.pool.query(`CREATE FUNCTION reject_second_bootstrap_member() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.user_id=91 THEN RAISE EXCEPTION 'test-injected'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_second_bootstrap_member BEFORE INSERT ON internal_organization_memberships FOR EACH ROW EXECUTE FUNCTION reject_second_bootstrap_member();`);
    await expect(run('APPLY')).rejects.toMatchObject({code: 'BOOTSTRAP_TRANSACTION_FAILED'});
    expect(await count('internal_organization_memberships')).toBe(0);
    expect(await count('internal_membership_grants')).toBe(0);
    expect(await count('internal_iam_events')).toBe(0);
    expect(await remainingPolicies()).toBe(0);
  });

  it('applies exactly scoped owner grants once with immutable evidence and no invented sessions/MFA', async () => {
    const receipt = await run('APPLY');
    expect(receipt).toMatchObject({outcome: 'APPLIED', ownerUserIds: [90, 91]});
    const replay = await run('APPLY');
    expect(replay).toEqual({...receipt, outcome: 'ALREADY_APPLIED'});
    expect(await count('internal_organization_memberships')).toBe(2);
    expect(await count('internal_membership_grants')).toBe(2);
    expect(await count('internal_iam_events')).toBe(1);
    expect(await count('internal_staff_sessions')).toBe(0);
    expect(await count('internal_step_up_challenges')).toBe(0);
    expect(await remainingPolicies()).toBe(0);
    const flags = (await local.fixture.pool.query("SELECT bool_and(relrowsecurity AND relforcerowsecurity) AS enabled FROM pg_class WHERE relname IN ('internal_organization_memberships','internal_membership_grants','internal_iam_events')")).rows[0];
    expect(flags.enabled).toBe(true);
    const grants = (await local.fixture.pool.query('SELECT scope_type,scope_id,environment,provider,max_amount_minor FROM internal_membership_grants')).rows;
    expect(grants).toEqual([expect.objectContaining({scope_type: 'ORGANIZATION', scope_id: receipt.organizationId, environment: 'LOCAL', provider: null, max_amount_minor: null}), expect.any(Object)]);
    await expect(local.fixture.pool.query("UPDATE internal_iam_events SET reason='overwrite history' WHERE id=$1", [receipt.eventId])).rejects.toThrow('IAM_IMMUTABLE_EVIDENCE');
    await expect(run('APPLY', {...local.manifest, reason: 'Different reviewed manifest cannot replace the existing bootstrap.'})).rejects.toMatchObject({code: 'BOOTSTRAP_MANIFEST_CONFLICT'});
  });

  it('never restores explicitly revoked or suspended owner authority on replay', async () => {
    const receipt = await run('APPLY');
    await local.fixture.pool.query(`INSERT INTO internal_membership_grant_revocations(grant_id,revoked_by,reason)
      VALUES($1,91,'Explicit isolated authority revocation.')`, [receipt.grantIds[0]]);
    await expect(run('APPLY')).rejects.toMatchObject({code: 'OWNER_GRANT_CONFLICT'});
    await local.fixture.pool.query(`UPDATE internal_organization_memberships SET status='SUSPENDED',version=version+1,suspended_at=clock_timestamp(),changed_by=91,change_reason='Explicit isolated member suspension.' WHERE id=$1`, [receipt.membershipIds[0]]);
    await expect(run('APPLY')).rejects.toMatchObject({code: 'OWNER_MEMBERSHIP_UNAVAILABLE'});
    expect(await count('internal_iam_events')).toBe(1);
    expect(await remainingPolicies()).toBe(0);
  });
});
