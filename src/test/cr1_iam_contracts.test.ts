import { describe, expect, it } from 'vitest';
import {
  inviteWorkforceMemberSchema,
  privilegedActionRequestSchema,
  stepUpReceiptSchema,
  workforceAuthorizationDecisionSchema,
  workforcePermissionCodeSchema,
  workforcePrincipalSchema,
} from '../shared/iam/contracts.js';

const id = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const challengeId = '33333333-3333-4333-8333-333333333333';
const hash = 'a'.repeat(64);

describe('CR1 workforce IAM contracts', () => {
  it('accepts only catalogued capabilities', () => {
    expect(workforcePermissionCodeSchema.parse('provider.create_paused')).toBe('provider.create_paused');
    expect(() => workforcePermissionCodeSchema.parse('provider.write_anything')).toThrow();
  });

  it('normalizes an invitation and rejects duplicate grants', () => {
    const invitation = inviteWorkforceMemberSchema.parse({
      email: '  Operator@Encho.Co.In ',
      reason: 'Join the CR1 provider operations rotation.',
      grants: [{
        roleKey: 'provider_operator',
        scope: { type: 'ORGANIZATION', id },
      }],
    });
    expect(invitation.email).toBe('operator@encho.co.in');
    expect(invitation.grants[0].environment).toBe('PRODUCTION');
    expect(() => inviteWorkforceMemberSchema.parse({
      ...invitation,
      grants: [invitation.grants[0], invitation.grants[0]],
    })).toThrow('Duplicate workforce grant');
  });

  it('never accepts effective permissions embedded in a staff principal', () => {
    const principal = {
      accountId: 90,
      actorKind: 'STAFF',
      organizationId: id,
      membershipId: id,
      sessionId,
      assuranceLevel: 'AAL2',
      authenticatedAt: '2026-09-23T12:00:00.000Z',
    };
    expect(workforcePrincipalSchema.parse(principal)).toEqual(principal);
    expect(() => workforcePrincipalSchema.parse({ ...principal, permissions: ['provider.activate'] })).toThrow();
  });

  it('binds privileged commands to a known permission, resource and hash', () => {
    expect(privilegedActionRequestSchema.parse({
      permission: 'provider.activate',
      resource: { type: 'CAMPAIGN', id: 'campaign:42:revision:3' },
      commandHash: hash,
      reason: 'Activate the exact paused and verified campaign revision.',
      idempotencyKey: 'activate:42:3',
    }).permission).toBe('provider.activate');
  });

  it('rejects expired or internally inconsistent security receipts', () => {
    expect(() => stepUpReceiptSchema.parse({
      challengeId,
      membershipId: id,
      sessionId,
      actionHash: hash,
      assuranceLevel: 'AAL2',
      verifiedAt: '2026-09-23T12:10:00.000Z',
      expiresAt: '2026-09-23T12:00:00.000Z',
      consumedAt: null,
    })).toThrow('expire after verification');
    expect(() => workforceAuthorizationDecisionSchema.parse({
      decisionId: id,
      allowed: true,
      code: 'PERMISSION_DENIED',
      policySnapshotHash: hash,
      evaluatedAt: '2026-09-23T12:00:00.000Z',
    })).toThrow('decision disagree');
  });
});
