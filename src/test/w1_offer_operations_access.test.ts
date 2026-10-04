import {describe,expect,it} from 'vitest';
import {currentOfferReviewWorkspace} from '../../components/operations/offerReviewAccess.js';
import type {OperationsWorkspace} from '../shared/iam/workspace.js';

const now=Date.parse('2026-10-04T10:00:00Z');
const workspace=():OperationsWorkspace=>({
  schemaVersion:1,generatedAt:'2026-10-04T09:59:30Z',freshUntil:'2026-10-04T10:00:30Z',
  correlationId:'test.operation:1',
  organization:{id:'22222222-2222-4222-8222-222222222222',displayName:'Test organization'},
  member:{membershipId:'33333333-3333-4333-8333-333333333333',state:'ACTIVE'},
  session:{id:'44444444-4444-4444-8444-444444444444',state:'ACTIVE',expiresAt:'2026-10-04T11:00:00Z'},
  desks:[{id:'my-work',permittedActions:['offer.read','offer.accept']}],
  work:{items:[],nextCursor:null,total:0},audit:{state:'NOT_PERMITTED',latestReceiptAt:null},
  workforce:{state:'ACTIVE',explanation:null},
});

describe('W1 independent Operations offer review entry',()=>{
  it('allows a fresh scoped workforce projection without any consumer admin role',()=>{
    expect(currentOfferReviewWorkspace(workspace(),now)?.member.state).toBe('ACTIVE');
  });
  it('denies missing grant, stale evidence, expired session and malformed client claims',()=>{
    const noGrant=workspace();noGrant.desks[0].permittedActions=[];
    expect(currentOfferReviewWorkspace(noGrant,now)).toBeNull();
    expect(currentOfferReviewWorkspace(workspace(),now+60_000)).toBeNull();
    const expired=workspace();expired.session.expiresAt='2026-10-04T09:59:00Z';
    expect(currentOfferReviewWorkspace(expired,now)).toBeNull();
    expect(currentOfferReviewWorkspace({...workspace(),role:'admin'},now)).toBeNull();
  });
});
