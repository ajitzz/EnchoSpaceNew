import {describe, expect, it, vi} from 'vitest';
import {
  PermissionNotGrantedError,
  createDenyByDefaultPermissionAuthorizer,
  permissionCheckInputSchema,
  permissionCheckResultSchema,
  type PermissionCheckInput,
  type PermissionCheckPort,
} from '../lib/iam/authorizationPort.js';
import {parsePrincipalContext} from '../shared/iam/principalContext.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const decisionId = '44444444-4444-4444-8444-444444444444';
const hash = 'a'.repeat(64);
const now = () => new Date('2026-09-23T12:00:00.000Z');

const principal = parsePrincipalContext({
  accountId: 90,
  actorKind: 'STAFF',
  organizationId,
  membershipId,
  sessionId,
  assuranceLevel: 'AAL2',
  authenticatedAt: '2026-09-23T11:50:00.000Z',
  correlationId: 'correlation-90',
  operationId: 'operation-90',
});

const input: PermissionCheckInput = permissionCheckInputSchema.parse({
  principal,
  tenant: {kind: 'INTERNAL_ORGANIZATION', organizationId},
  permission: 'provider.activate',
  resource: {
    target: {type: 'CAMPAIGN', id: 'campaign:42:revision:3'},
    ancestors: [{type: 'PROPERTY', id: 'property:7'}],
    ownerAccountId: 17,
    revision: '3',
  },
  conditions: {
    environment: 'PRODUCTION',
    provider: 'META',
    amountMinor: '1500000',
    commandHash: hash,
    requestedAt: '2026-09-23T12:00:00.000Z',
  },
  evidence: {},
});

describe('CR1 principal context and permission-check port', () => {
  it('keeps roles and effective permissions outside the principal', () => {
    expect(() => parsePrincipalContext({...principal, role: 'admin'})).toThrow();
    expect(() => parsePrincipalContext({...principal, permissions: ['provider.activate']})).toThrow();
  });

  it('rejects cross-tenant and ambiguous resource paths before policy evaluation', () => {
    expect(() => permissionCheckInputSchema.parse({
      ...input,
      tenant: {kind: 'INTERNAL_ORGANIZATION', organizationId: decisionId},
    })).toThrow('do not match');

    expect(() => permissionCheckInputSchema.parse({
      ...input,
      resource: {...input.resource, ancestors: [input.resource.target]},
    })).toThrow('duplicate resources');
  });

  it('denies malformed, account-only and unavailable-policy requests without invoking authority', async () => {
    const delegate: PermissionCheckPort = {check: vi.fn()};
    const authorizer = createDenyByDefaultPermissionAuthorizer(delegate, {now});
    expect(await authorizer.check({...input, unexpected: true})).toMatchObject({effect: 'DENY', reason: 'INVALID_CONTEXT'});

    const accountInput = {
      ...input,
      principal: {
        accountId: 17,
        actorKind: 'ACCOUNT',
        assuranceLevel: 'AAL1',
        authenticatedAt: '2026-09-23T11:50:00.000Z',
        correlationId: 'correlation-17',
        operationId: 'operation-17',
      },
    };
    expect(await authorizer.check(accountInput)).toMatchObject({effect: 'DENY', reason: 'PRINCIPAL_NOT_ELIGIBLE'});
    expect(delegate.check).not.toHaveBeenCalled();
    expect(await createDenyByDefaultPermissionAuthorizer(undefined, {now}).check(input))
      .toMatchObject({effect: 'DENY', reason: 'POLICY_UNAVAILABLE'});
  });

  it('fails closed when a policy throws or returns an untrusted result', async () => {
    const throwing = createDenyByDefaultPermissionAuthorizer({
      check: vi.fn().mockRejectedValue(new Error('database detail must not escape')),
    }, {now});
    expect(await throwing.check(input)).toEqual({
      effect: 'DENY',
      allowed: false,
      reason: 'POLICY_UNAVAILABLE',
      evaluatedAt: '2026-09-23T12:00:00.000Z',
    });

    const malformed = createDenyByDefaultPermissionAuthorizer({
      check: vi.fn().mockResolvedValue({effect: 'ALLOW', allowed: true}),
    } as PermissionCheckPort, {now});
    expect(await malformed.check(input)).toMatchObject({effect: 'DENY', reason: 'POLICY_RESULT_INVALID'});
  });

  it('represents step-up and checker requirements as ungranted outcomes', async () => {
    const result = permissionCheckResultSchema.parse({
      effect: 'REQUIREMENTS',
      allowed: false,
      decisionId,
      policySnapshotHash: hash,
      evaluatedAt: '2026-09-23T12:00:00.000Z',
      requirements: [
        {kind: 'STEP_UP', actionHash: hash, requiredAssuranceLevel: 'PHISHING_RESISTANT'},
        {kind: 'CHECKER', actionHash: hash, requiredApprovals: 1, distinctFromMaker: true},
      ],
    });
    const authorizer = createDenyByDefaultPermissionAuthorizer({check: vi.fn().mockResolvedValue(result)}, {now});
    if (result.effect !== 'REQUIREMENTS') throw new Error('Expected validated authorization requirements.');

    await expect(authorizer.requireAllowed(input)).rejects.toMatchObject({
      code: 'STEP_UP_REQUIRED',
      status: 403,
      decisionId,
      requirements: result.requirements,
    });
  });

  it('returns an allow only when the delegate supplies a fully validated receipt', async () => {
    const allow = permissionCheckResultSchema.parse({
      effect: 'ALLOW',
      allowed: true,
      decisionId,
      policySnapshotHash: hash,
      evaluatedAt: '2026-09-23T12:00:00.000Z',
    });
    const check = vi.fn().mockResolvedValue(allow);
    const authorizer = createDenyByDefaultPermissionAuthorizer({check}, {now});

    await expect(authorizer.requireAllowed(input)).resolves.toEqual(allow);
    expect(check).toHaveBeenCalledWith(input);
  });

  it('rejects inconsistent requirement receipts and preserves safe denial errors', () => {
    expect(() => permissionCheckResultSchema.parse({
      effect: 'REQUIREMENTS',
      allowed: false,
      decisionId,
      policySnapshotHash: hash,
      evaluatedAt: '2026-09-23T12:00:00.000Z',
      requirements: [
        {kind: 'CHECKER', actionHash: hash, requiredApprovals: 1, distinctFromMaker: true},
        {kind: 'CHECKER', actionHash: hash, requiredApprovals: 2, distinctFromMaker: true},
      ],
    })).toThrow('unique by kind');

    const error = new PermissionNotGrantedError({
      effect: 'DENY',
      allowed: false,
      reason: 'RESOURCE_OUT_OF_SCOPE',
      evaluatedAt: '2026-09-23T12:00:00.000Z',
    });
    expect(error).toMatchObject({code: 'RESOURCE_OUT_OF_SCOPE', status: 403});
    expect(error.message).not.toContain('resource graph');
  });
});
