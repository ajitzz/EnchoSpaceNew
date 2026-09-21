import {describe,it,expect} from 'vitest';
import {useProviderContractFixture} from './harvo/providerContractFixture.js';
import {providerFixture,request} from './harvo/googleProviderFixture.js';
describe('Provider authorization preserves integer contract ceilings',()=>{
 const db=useProviderContractFixture();
 it('rejects a requested total above the stored authorization before provider mutation',async()=>{
  const {provider,state}=providerFixture(),body=request();body.budget.minor_units=10001;
  const result=await provider.createCampaignHierarchy(body,db.pool);
  expect(result.success).toBe(false);expect(result.error?.code).toBe('FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION');
  expect(state.mutations).toBe(0);
 });
 it('permits paused creation exactly at the ceiling without consuming or recreating authorization',async()=>{
  const {provider,state}=providerFixture();
  const before=(await db.pool.query('SELECT * FROM campaign_financial_contracts')).rows;
  expect((await provider.createCampaignHierarchy(request(),db.pool)).success).toBe(true);
  expect(state.mutations).toBe(1);
  expect((await db.pool.query('SELECT * FROM campaign_financial_contracts')).rows).toEqual(before);
 });
});
