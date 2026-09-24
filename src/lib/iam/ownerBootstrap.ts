import {createHash, randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {workforceEnvironmentSchema} from '../../shared/iam/contracts.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const accountId = z.number().int().positive().safe();
const timestamp = z.iso.datetime({offset: true});
export const ownerBootstrapManifestSchema = z.object({
  version: z.literal(1),
  organizationKey: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  environment: workforceEnvironmentSchema,
  activePolicyHash: hash,
  ownerRoleHash: hash,
  operatorUserId: accountId,
  reviewerUserId: accountId,
  reviewEvidenceHash: hash,
  issuedAt: timestamp,
  expiresAt: timestamp,
  reason: z.string().trim().min(10).max(1000),
  owners: z.array(z.object({
    userId: accountId,
    verifiedEmailHash: hash,
    identityReceiptHash: hash,
    verifiedSubjectHash: hash,
  }).strict()).min(1).max(8),
}).strict().superRefine((value, ctx) => {
  for (const field of ['userId', 'verifiedEmailHash', 'verifiedSubjectHash'] as const) {
    if (new Set(value.owners.map(owner => owner[field])).size !== value.owners.length) {
      ctx.addIssue({code: 'custom', path: ['owners'], message: `Duplicate owner ${field}.`});
    }
  }
  for (const id of [value.operatorUserId, value.reviewerUserId]) {
    if (!value.owners.some(owner => owner.userId === id)) ctx.addIssue({code: 'custom', message: 'Operator and reviewer must be explicitly named owners.'});
  }
  const lifetime = Date.parse(value.expiresAt) - Date.parse(value.issuedAt);
  if (lifetime <= 0 || lifetime > 86400000) ctx.addIssue({code: 'custom', path: ['expiresAt'], message: 'Bootstrap manifest lifetime must be positive and no longer than 24 hours.'});
  if (value.environment === 'PRODUCTION' && (value.owners.length < 2 || value.operatorUserId === value.reviewerUserId)) {
    ctx.addIssue({code: 'custom', message: 'Production requires two independent owners and a distinct reviewer.'});
  }
});
export type OwnerBootstrapManifest = z.infer<typeof ownerBootstrapManifestSchema>;

/** This port consumes already verified evidence from an isolated identity service. */
export const ownerIdentityEvidenceSchema = z.object({
  userId: accountId,
  emailVerified: z.literal(true),
  verifiedEmailHash: hash,
  receiptHash: hash,
  verifiedSubjectHash: hash,
  verifiedAt: timestamp,
  expiresAt: timestamp,
  source: z.enum(['TRUSTED_IDENTITY_SERVICE', 'LOCAL_FIXTURE']),
}).strict();
export type OwnerIdentityEvidence = z.infer<typeof ownerIdentityEvidenceSchema>;
export type OwnerIdentityEvidencePort = Readonly<{
  verify(input: Readonly<{userId: number; receiptHash: string}>): Promise<OwnerIdentityEvidence | null>;
}>;

const errorCodes = [
  'MANIFEST_INVALID', 'MANIFEST_NOT_CURRENT', 'MANIFEST_REVIEW_REQUIRED',
  'MIGRATION_OWNER_REQUIRED', 'ORGANIZATION_UNAVAILABLE', 'POLICY_MISMATCH',
  'POLICY_NOT_APPROVED', 'OWNER_ROLE_MISMATCH', 'OWNER_IDENTITY_UNVERIFIED',
  'OWNER_ACCOUNT_MISMATCH', 'OWNER_MEMBERSHIP_UNAVAILABLE', 'OWNER_GRANT_CONFLICT',
  'BOOTSTRAP_MANIFEST_CONFLICT', 'BOOTSTRAP_TRANSACTION_FAILED',
] as const;
export class OwnerBootstrapError extends Error {
  constructor(readonly code: typeof errorCodes[number]) { super(code); this.name = 'OwnerBootstrapError'; }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function digest(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
export function verifiedEmailHash(email: string): string {
  return createHash('sha256').update(z.email().parse(email.trim().toLowerCase())).digest('hex');
}
export function ownerBootstrapManifestHash(input: unknown): string {
  const manifest = ownerBootstrapManifestSchema.parse(input);
  return digest({...manifest, owners: [...manifest.owners].sort((a, b) => a.userId - b.userId)});
}

const ownerPermissions = [
  'workforce.member.read', 'workforce.invite', 'workforce.grant', 'workforce.suspend',
  'workforce.access_review', 'work.assignment.read', 'work.assignment.reassign',
  'audit.read', 'incident.read', 'incident.declare', 'incident.pause_global',
].sort();
const bootstrapTables = ['internal_organization_memberships', 'internal_membership_grants', 'internal_iam_events'] as const;
function sqlIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function sqlLiteral(value: string): string { return `'${value.replaceAll("'", "''")}'`; }

export type OwnerBootstrapReceipt = Readonly<{
  outcome: 'DRY_RUN' | 'APPLIED' | 'ALREADY_APPLIED';
  manifestHash: string;
  organizationId: string;
  activePolicyHash: string;
  ownerRoleHash: string;
  ownerUserIds: number[];
  membershipIds: string[];
  grantIds: string[];
  eventId: string | null;
}>;

/**
 * Offline migration-owner operation only. The pool must never be the shared
 * runtime pool. Identity verification happens before database locks and is
 * rechecked for freshness against the database clock inside the transaction.
 * No existing account is chosen, promoted, reactivated or given MFA evidence.
 */
export async function bootstrapWorkforceOwners(input: {
  pool: pg.Pool;
  manifest: unknown;
  mode: 'DRY_RUN' | 'APPLY';
  reviewedManifestHash?: string;
  identityEvidence: OwnerIdentityEvidencePort;
}): Promise<OwnerBootstrapReceipt> {
  const parsed = ownerBootstrapManifestSchema.safeParse(input.manifest);
  if (!parsed.success || !['DRY_RUN', 'APPLY'].includes(input.mode)) throw new OwnerBootstrapError('MANIFEST_INVALID');
  const manifest = parsed.data;
  const manifestHash = ownerBootstrapManifestHash(manifest);
  if (input.mode === 'APPLY' && input.reviewedManifestHash !== manifestHash) throw new OwnerBootstrapError('MANIFEST_REVIEW_REQUIRED');
  const evidence: OwnerIdentityEvidence[] = [];
  for (const owner of manifest.owners) {
    let value: unknown;
    try { value = await input.identityEvidence.verify({userId: owner.userId, receiptHash: owner.identityReceiptHash}); }
    catch { throw new OwnerBootstrapError('OWNER_IDENTITY_UNVERIFIED'); }
    const proof = ownerIdentityEvidenceSchema.safeParse(value);
    if (!proof.success || proof.data.userId !== owner.userId || proof.data.verifiedEmailHash !== owner.verifiedEmailHash
      || proof.data.receiptHash !== owner.identityReceiptHash || proof.data.verifiedSubjectHash !== owner.verifiedSubjectHash
      || (manifest.environment !== 'LOCAL' && proof.data.source !== 'TRUSTED_IDENTITY_SERVICE')) {
      throw new OwnerBootstrapError('OWNER_IDENTITY_UNVERIFIED');
    }
    evidence.push(proof.data);
  }

  let client: pg.PoolClient;
  try { client = await input.pool.connect(); }
  catch { throw new OwnerBootstrapError('BOOTSTRAP_TRANSACTION_FAILED'); }
  let transaction = false;
  let destroyConnection = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); transaction = true;
    // CREATE POLICY cannot bind SQL parameters. Its bounded literals use SQL
    // quote escaping, so pin string semantics rather than trust pool settings.
    await client.query('SET LOCAL standard_conforming_strings=on');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query('SELECT pg_advisory_xact_lock(82749102), pg_advisory_xact_lock(hashtextextended(\'iam-policy\',0))');
    const connection = (await client.query<{role_name: string; safe_owner: boolean}>(`
      SELECT current_user AS role_name,
        (NOT r.rolsuper AND NOT r.rolbypassrls AND session_user=current_user
        AND (SELECT count(*)=3 AND bool_and(c.relowner=r.oid AND c.relrowsecurity AND c.relforcerowsecurity)
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname=ANY($1::text[]))) AS safe_owner
      FROM pg_roles r WHERE r.rolname=current_user`, [[...bootstrapTables]])).rows[0];
    if (!connection?.safe_owner) throw new OwnerBootstrapError('MIGRATION_OWNER_REQUIRED');
    // Role releases must not advance after their hash has been reviewed. The
    // policy advisory lock fences policy changes; this lock fences role pointers.
    await client.query('LOCK TABLE internal_role_current_versions,internal_organizations IN SHARE MODE');
    const now = Date.parse((await client.query<{now: string}>('SELECT clock_timestamp()::text AS now')).rows[0].now);
    if (Date.parse(manifest.issuedAt) > now || Date.parse(manifest.expiresAt) <= now) throw new OwnerBootstrapError('MANIFEST_NOT_CURRENT');
    if (evidence.some(proof => Date.parse(proof.verifiedAt) > now || now - Date.parse(proof.verifiedAt) > 86400000
      || Date.parse(proof.expiresAt) <= now || Date.parse(proof.expiresAt) <= Date.parse(proof.verifiedAt)
      || Date.parse(proof.expiresAt) - Date.parse(proof.verifiedAt) > 86400000)) {
      throw new OwnerBootstrapError('OWNER_IDENTITY_UNVERIFIED');
    }
    const org = (await client.query<{id: string; status: string}>(
      'SELECT id,status FROM internal_organizations WHERE organization_key=$1', [manifest.organizationKey])).rows[0];
    if (!org || org.status !== 'ACTIVE') throw new OwnerBootstrapError('ORGANIZATION_UNAVAILABLE');
    const policy = (await client.query<{config_hash: string; approval_status: string; minimum_owners: number}>(`
      SELECT v.config_hash,v.approval_status,(v.config->>'minimumOwnersForProduction')::int AS minimum_owners
      FROM internal_iam_current_policy c JOIN internal_iam_policy_versions v ON v.id=c.version_id WHERE c.singleton`)).rows[0];
    if (!policy || policy.config_hash !== manifest.activePolicyHash) throw new OwnerBootstrapError('POLICY_MISMATCH');
    if (manifest.environment === 'PRODUCTION' && (policy.approval_status !== 'APPROVED' || manifest.owners.length < Math.max(2, policy.minimum_owners))) {
      throw new OwnerBootstrapError('POLICY_NOT_APPROVED');
    }
    const role = (await client.query<{id: string; config_hash: string}>(`
      SELECT v.id,v.config_hash FROM internal_role_definitions d
      JOIN internal_role_current_versions c ON c.role_id=d.id AND c.organization_id=d.organization_id
      JOIN internal_role_versions v ON v.id=c.version_id
      WHERE d.organization_id=$1 AND d.role_key='platform_owner'`, [org.id])).rows[0];
    if (!role || role.config_hash !== manifest.ownerRoleHash) throw new OwnerBootstrapError('OWNER_ROLE_MISMATCH');
    const actualPermissions = (await client.query<{permission_code: string}>(
      'SELECT permission_code FROM internal_role_permissions WHERE role_version_id=$1 ORDER BY permission_code', [role.id])).rows.map(row => row.permission_code);
    if (canonicalJson(actualPermissions) !== canonicalJson(ownerPermissions)) throw new OwnerBootstrapError('OWNER_ROLE_MISMATCH');
    for (const owner of manifest.owners) {
      const account = (await client.query<{email: string; role: string}>(
        'SELECT email,role FROM users WHERE id=$1 FOR SHARE', [owner.userId])).rows[0];
      if (!account || account.role !== 'admin' || verifiedEmailHash(account.email) !== owner.verifiedEmailHash) throw new OwnerBootstrapError('OWNER_ACCOUNT_MISMATCH');
    }

    const prior = (await client.query<{id: string; request_hash: string; evidence: {membershipIds: string[]; grantIds: string[]}}>(`
      SELECT id,request_hash,evidence FROM internal_iam_events
      WHERE organization_id=$1 AND event_type='OWNER_BOOTSTRAP_COMMITTED' AND evidence->>'environment'=$2
      ORDER BY sequence`, [org.id, manifest.environment])).rows;
    if (prior.length > 1 || (prior[0] && prior[0].request_hash !== manifestHash)) throw new OwnerBootstrapError('BOOTSTRAP_MANIFEST_CONFLICT');

    const plans: {owner: OwnerBootstrapManifest['owners'][number]; membershipId: string; grantId: string; grantHash: string; createMembership: boolean; createGrant: boolean}[] = [];
    for (const owner of manifest.owners) {
      const member = (await client.query<{id: string; status: string; expires_at: Date | null}>(`
        SELECT id,status,expires_at FROM internal_organization_memberships WHERE organization_id=$1 AND user_id=$2`, [org.id, owner.userId])).rows[0];
      if (member && (member.status !== 'ACTIVE' || (member.expires_at && member.expires_at.getTime() <= now))) throw new OwnerBootstrapError('OWNER_MEMBERSHIP_UNAVAILABLE');
      const membershipId = member?.id ?? randomUUID();
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('iam-member:'||$1,0))", [membershipId]);
      const grants = (await client.query<{id: string; role_version_id: string; scope_type: string; scope_id: string; revoked: boolean; grant_hash: string; provider: string | null; max_amount_minor: string | null; valid_from: Date; valid_until: Date | null}>(`
        SELECT g.*, x.grant_id IS NOT NULL AS revoked FROM internal_membership_grants g
        LEFT JOIN internal_membership_grant_revocations x ON x.grant_id=g.id
        WHERE g.membership_id=$1 AND g.environment=$2`, [membershipId, manifest.environment])).rows;
      if (grants.some(grant => grant.revoked || grant.role_version_id !== role.id || grant.scope_type !== 'ORGANIZATION' || grant.scope_id !== org.id
        || grant.provider !== null || grant.max_amount_minor !== null || grant.valid_from.getTime() > now || (grant.valid_until && grant.valid_until.getTime() <= now)) || grants.length > 1) {
        throw new OwnerBootstrapError('OWNER_GRANT_CONFLICT');
      }
      const grant = grants[0];
      plans.push({owner, membershipId, grantId: grant?.id ?? randomUUID(), grantHash: grant?.grant_hash ?? digest({manifestHash, membershipId, roleId: role.id, environment: manifest.environment, scope: org.id}), createMembership: !member, createGrant: !grant});
    }
    const base = {manifestHash, organizationId: org.id, activePolicyHash: policy.config_hash, ownerRoleHash: role.config_hash,
      ownerUserIds: plans.map(plan => plan.owner.userId), membershipIds: plans.map(plan => plan.membershipId), grantIds: plans.map(plan => plan.grantId)};
    if (prior[0]) {
      if (plans.some(plan => plan.createMembership || plan.createGrant)
        || canonicalJson([...prior[0].evidence.membershipIds].sort()) !== canonicalJson([...base.membershipIds].sort())
        || canonicalJson([...prior[0].evidence.grantIds].sort()) !== canonicalJson([...base.grantIds].sort())) throw new OwnerBootstrapError('BOOTSTRAP_MANIFEST_CONFLICT');
      await client.query('ROLLBACK'); transaction = false;
      return {...base, outcome: 'ALREADY_APPLIED', eventId: prior[0].id};
    }
    if (input.mode === 'DRY_RUN') {
      await client.query('ROLLBACK'); transaction = false;
      return {...base, outcome: 'DRY_RUN', eventId: null};
    }

    // These policies exist only within this transaction and apply to this exact
    // migration role and manifest. They never grant shared runtime authority.
    const policyName = `cr1_bootstrap_${randomUUID().replaceAll('-', '')}`;
    const targetRole = sqlIdentifier(connection.role_name);
    const organizationClause = `organization_id=${sqlLiteral(org.id)}::uuid`;
    const operatorClause = `=${manifest.operatorUserId}`;
    const memberRows = plans.map(plan => `(id=${sqlLiteral(plan.membershipId)}::uuid AND user_id=${plan.owner.userId})`).join(' OR ');
    const grantRows = plans.map(plan => `(id=${sqlLiteral(plan.grantId)}::uuid AND membership_id=${sqlLiteral(plan.membershipId)}::uuid AND grant_hash=${sqlLiteral(plan.grantHash)})`).join(' OR ');
    const eventId = randomUUID();
    await client.query(`CREATE POLICY ${sqlIdentifier(policyName)} ON internal_organization_memberships FOR INSERT TO ${targetRole}
      WITH CHECK(${organizationClause} AND (${memberRows}) AND status='ACTIVE' AND changed_by${operatorClause}
      AND expires_at IS NULL AND accepted_invitation_id IS NULL AND change_reason=${sqlLiteral(manifest.reason)})`);
    await client.query(`CREATE POLICY ${sqlIdentifier(policyName)} ON internal_membership_grants FOR INSERT TO ${targetRole}
      WITH CHECK(${organizationClause} AND (${grantRows}) AND role_version_id=${sqlLiteral(role.id)}::uuid
      AND scope_type='ORGANIZATION' AND scope_id=${sqlLiteral(org.id)} AND environment=${sqlLiteral(manifest.environment)}
      AND provider IS NULL AND max_amount_minor IS NULL AND valid_until IS NULL AND granted_by${operatorClause} AND reason=${sqlLiteral(manifest.reason)})`);
    await client.query(`CREATE POLICY ${sqlIdentifier(policyName)} ON internal_iam_events FOR INSERT TO ${targetRole}
      WITH CHECK(${organizationClause} AND id=${sqlLiteral(eventId)}::uuid AND actor_user_id${operatorClause}
      AND actor_membership_id IS NULL AND event_type='OWNER_BOOTSTRAP_COMMITTED'
      AND entity_type='ORGANIZATION' AND entity_id=${sqlLiteral(org.id)} AND request_hash=${sqlLiteral(manifestHash)}
      AND new_hash=${sqlLiteral(manifestHash)} AND reason=${sqlLiteral(manifest.reason)})`);
    for (const plan of plans) {
      if (plan.createMembership) await client.query(`INSERT INTO internal_organization_memberships
        (id,organization_id,user_id,status,accepted_at,changed_by,change_reason)
        VALUES($1,$2,$3,'ACTIVE',clock_timestamp(),$4,$5)`, [plan.membershipId, org.id, plan.owner.userId, manifest.operatorUserId, manifest.reason]);
      if (plan.createGrant) await client.query(`INSERT INTO internal_membership_grants
        (id,organization_id,membership_id,role_version_id,scope_type,scope_id,environment,grant_hash,granted_by,reason)
        VALUES($1,$2,$3,$4,'ORGANIZATION',$2::uuid::text,$5,$6,$7,$8)`,
      [plan.grantId, org.id, plan.membershipId, role.id, manifest.environment, plan.grantHash, manifest.operatorUserId, manifest.reason]);
    }
    await client.query(`INSERT INTO internal_iam_events
      (id,organization_id,actor_user_id,event_type,entity_type,entity_id,new_hash,evidence,correlation_id,request_hash,reason)
      VALUES($1,$2,$3,'OWNER_BOOTSTRAP_COMMITTED','ORGANIZATION',$2::uuid::text,$4,$5::jsonb,$6,$4,$7)`,
    [eventId, org.id, manifest.operatorUserId, manifestHash, JSON.stringify({environment: manifest.environment,
      membershipIds: base.membershipIds, grantIds: base.grantIds, owners: manifest.owners, reviewerUserId: manifest.reviewerUserId,
      reviewEvidenceHash: manifest.reviewEvidenceHash, activePolicyHash: policy.config_hash, ownerRoleHash: role.config_hash}), `owner-bootstrap:${manifestHash}`, manifest.reason]);
    for (const table of bootstrapTables) await client.query(`DROP POLICY ${sqlIdentifier(policyName)} ON ${table}`);
    await client.query('COMMIT'); transaction = false;
    return {...base, outcome: 'APPLIED', eventId};
  } catch (error) {
    if (transaction) {
      try { await client.query('ROLLBACK'); } catch { destroyConnection = true; }
    }
    if (error instanceof OwnerBootstrapError) throw error;
    throw new OwnerBootstrapError('BOOTSTRAP_TRANSACTION_FAILED');
  } finally { client.release(destroyConnection); }
}
