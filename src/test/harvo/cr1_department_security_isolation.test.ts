import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createCr1IamFixture } from './helpers/cr1IamFixture.js';
import { projectOperationsWorkspace, ROLE_AUTHORIZED_DESKS } from '../../lib/iam/workspaceProjection.js';
import { StaffSessionReader } from '../../lib/iam/staffSessions.js';
import { createRootExecutionContext, runWithExecutionContext } from '../../lib/observability/executionContext.js';

describe('CR1 Strict Departmental Security Isolation', () => {
  let fixture: Awaited<ReturnType<typeof createCr1IamFixture>>;
  let reader: StaffSessionReader;

  beforeAll(async () => {
    fixture = await createCr1IamFixture();
    reader = new StaffSessionReader(fixture.runtime, 'LOCAL');
  });

  afterAll(async () => {
    await fixture.close();
  });

  const getRoleId = async (roleKey: string): Promise<string> => {
    const row = (await fixture.pool.query(
      `SELECT v.id FROM internal_role_versions v
       JOIN internal_role_definitions d ON d.id = v.role_id
       WHERE d.role_key = $1 AND v.version = 1`,
      [roleKey]
    )).rows[0];
    if (!row) throw new Error(`Role ${roleKey} not found in catalog`);
    return row.id;
  };

  const createStaffWithRole = async (userId: number, roleKey: string) => {
    const membershipId = randomUUID();
    const sessionId = randomUUID();
    const roleVersionId = await getRoleId(roleKey);
    const token = `wfs_${randomBytes(32).toString('base64url')}`;
    const digest = createHash('sha256').update(token).digest('hex');

    await fixture.pool.query(
      `INSERT INTO users(id, email, role) VALUES($1, $2, 'user') ON CONFLICT (id) DO NOTHING`,
      [userId, `user_${userId}@encho.test`]
    );

    await fixture.pool.query(
      `INSERT INTO internal_organization_memberships(id, organization_id, user_id, status, accepted_at, changed_by, change_reason)
       VALUES($1, $2, $3, 'ACTIVE', clock_timestamp(), 90, 'Department isolation test member bootstrap.')`,
      [membershipId, fixture.organizationId, userId]
    );

    await fixture.pool.query(
      `INSERT INTO internal_staff_sessions(id, organization_id, membership_id, token_hash, assurance_level, authenticated_at, idle_expires_at, absolute_expires_at, environment)
       VALUES($1, $2, $3, $4, 'AAL2', clock_timestamp(), clock_timestamp() + interval '10 minutes', clock_timestamp() + interval '1 hour', 'LOCAL')`,
      [sessionId, fixture.organizationId, membershipId, digest]
    );

    await fixture.pool.query(
      `INSERT INTO internal_membership_grants(organization_id, membership_id, role_version_id, scope_type, scope_id, environment, grant_hash, granted_by, reason)
       VALUES($1, $2, $3, 'ORGANIZATION', $1::uuid::text, 'LOCAL', repeat($4, 64), 90, 'Department isolation grant.')`,
      [fixture.organizationId, membershipId, roleVersionId, String(userId % 10)]
    );

    return { token };
  };

  const readWorkspace = async (token: string) => {
    const context = createRootExecutionContext({ source: 'SYSTEM' });
    return await runWithExecutionContext(context, () =>
      reader.read(`Bearer ${token}`, (client, principal, expires) =>
        projectOperationsWorkspace(client, principal, expires, 'LOCAL')
      )
    );
  };

  it('strictly maps roles to their authorized department desks in ROLE_AUTHORIZED_DESKS', () => {
    expect(ROLE_AUTHORIZED_DESKS.campaign_operator).toEqual(['flight', 'my-work']);
    expect(ROLE_AUTHORIZED_DESKS.creative_policy_reviewer).toEqual(['creative', 'my-work']);
    expect(ROLE_AUTHORIZED_DESKS.finance_risk_reviewer).toEqual(['finance', 'my-work']);
    expect(ROLE_AUTHORIZED_DESKS.support_analyst).toEqual(['service', 'my-work']);
    expect(ROLE_AUTHORIZED_DESKS.auditor).toEqual(['audit', 'my-work']);
    expect(ROLE_AUTHORIZED_DESKS.platform_owner).toEqual(['workforce', 'audit', 'incident', 'my-work']);
  });

  it('restricts Marketing campaign_operator strictly to flight desk (blocking creative & provider)', async () => {
    const { token } = await createStaffWithRole(901, 'campaign_operator');
    const workspace = await readWorkspace(token);

    const deskIds = workspace.desks.map(d => d.id).sort();
    expect(deskIds).toEqual(['flight', 'my-work'].sort());

    // Despite having creative.read and provider.read, creative and provider desks MUST NOT be projected
    expect(workspace.desks.some(d => d.id === 'creative')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'provider')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'finance')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'workforce')).toBe(false);
  });

  it('restricts Creative reviewer strictly to creative desk (blocking flight, finance, workforce)', async () => {
    const { token } = await createStaffWithRole(902, 'creative_policy_reviewer');
    const workspace = await readWorkspace(token);

    const deskIds = workspace.desks.map(d => d.id).sort();
    expect(deskIds).toEqual(['creative', 'my-work'].sort());

    expect(workspace.desks.some(d => d.id === 'flight')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'finance')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'service')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'workforce')).toBe(false);
  });

  it('restricts Finance reviewer strictly to finance desk (blocking flight, creative, workforce)', async () => {
    const { token } = await createStaffWithRole(903, 'finance_risk_reviewer');
    const workspace = await readWorkspace(token);

    const deskIds = workspace.desks.map(d => d.id).sort();
    expect(deskIds).toEqual(['finance', 'my-work'].sort());

    expect(workspace.desks.some(d => d.id === 'flight')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'creative')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'workforce')).toBe(false);
  });

  it('restricts Support analyst strictly to service desk', async () => {
    const { token } = await createStaffWithRole(904, 'support_analyst');
    const workspace = await readWorkspace(token);

    const deskIds = workspace.desks.map(d => d.id).sort();
    expect(deskIds).toEqual(['my-work', 'service'].sort());

    expect(workspace.desks.some(d => d.id === 'flight')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'finance')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'creative')).toBe(false);
  });

  it('restricts Auditor strictly to audit desk despite broad read access', async () => {
    const { token } = await createStaffWithRole(905, 'auditor');
    const workspace = await readWorkspace(token);

    const deskIds = workspace.desks.map(d => d.id).sort();
    expect(deskIds).toEqual(['audit', 'my-work'].sort());

    // Auditor has read access on strategy, campaign, provider, finance, incident,
    // but under departmental boundary enforcement they CANNOT access those domain operational desks!
    expect(workspace.desks.some(d => d.id === 'strategy')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'flight')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'provider')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'finance')).toBe(false);
    expect(workspace.desks.some(d => d.id === 'incident')).toBe(false);
  });
});
