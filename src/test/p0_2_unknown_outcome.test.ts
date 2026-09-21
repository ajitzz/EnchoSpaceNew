import {describe,it,expect} from 'vitest';
import {dispatchMetaCampaign,classifyMetaError} from '../../server.ts';
import {useLegacyPaidBoundaryFixture,assertRetiredPaidCall} from './legacyPaidBoundaryFixture.js';
// Positive lost-response/400 containment successors: harvo/meta_provider.test.ts.
describe('P0-2 retired dispatch boundary and error classification',()=>{
 const db=useLegacyPaidBoundaryFixture();
 it.each(['approved','CAMPAIGN_LIVE','EXTERNAL_OUTCOME_UNKNOWN','RECONCILIATION_REQUIRED'])('cannot re-dispatch a legacy %s campaign',async status=>{
  const id=await db.campaign(status);
  await assertRetiredPaidCall(db.pool,id,()=>dispatchMetaCampaign(id,{user:{id:1,role:'admin'}} as any,'retirement-check'));
 });
  it('5. classifyMetaError taxonomy correctly distinguishes network timeout vs Meta API errors', () => {
    const timeoutClassification = classifyMetaError({
      error: { message: 'fetch failed: ETIMEDOUT', isNetworkTimeout: true, code: 0 }
    });
    expect(timeoutClassification.code_name).toBe('EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME');
    expect(timeoutClassification.category).toBe('NETWORK_TRANSPORT');

    const metaErrorClassification = classifyMetaError({
      error: { message: 'Permissions error', code: 200, type: 'OAuthException' }
    });
    expect(metaErrorClassification.code_name).not.toBe('EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME');
    expect(metaErrorClassification.code_name).toBe('AUTH_MISSING_PERMISSIONS');
  });
});
