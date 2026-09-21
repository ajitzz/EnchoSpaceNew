import {describe,it,expect} from 'vitest';
import {useProviderContractFixture} from './harvo/providerContractFixture.js';
import {providerFixture,request,ids} from './harvo/googleProviderFixture.js';
describe('Google unknown outcomes retain original durable claims',()=>{
 const db=useProviderContractFixture();
 it('keeps failed observation unknown and does not invent serving evidence',async()=>{
  const {provider}=providerFixture();await provider.createCampaignHierarchy(request(),db.pool);
  expect(await providerFixture('READ_FAILURE').provider.fetchAuthoritativeDeliveryTruth(ids.campaign,db.pool)).toMatchObject({normalizedState:'UNKNOWN',isLive:false,isServingImpressions:false});
 });
 it('quarantines a lost mutation response and rejects blind replay under either key',async()=>{
  const {provider,state}=providerFixture('TIMEOUT');
  expect((await provider.createCampaignHierarchy(request(),db.pool)).success).toBe(false);
  expect((await provider.createCampaignHierarchy(request(),db.pool)).success).toBe(false);
  expect((await provider.createCampaignHierarchy({...request(),idempotencyKey:'new-key'},db.pool)).success).toBe(false);
  expect(state.mutations).toBe(1);
  expect((await db.pool.query('SELECT publish_status,is_unknown_outcome FROM provider_publishing_transactions')).rows).toEqual([{publish_status:'RECONCILIATION_REQUIRED',is_unknown_outcome:true}]);
 });
});
