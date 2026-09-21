import {describe,it,expect} from 'vitest';
import {useProviderContractFixture} from './harvo/providerContractFixture.js';
import {providerFixture,request,ids} from './harvo/googleProviderFixture.js';
const externalIds={externalCampaignId:ids.campaign,externalContainerId:ids.group,externalAdId:ids.ad};
describe('Google structural reconciliation requires complete owned readback',()=>{
 const db=useProviderContractFixture();
 it('reconciles a durably recorded and remotely verified hierarchy',async()=>{
  const {provider}=providerFixture();expect((await provider.createCampaignHierarchy(request(),db.pool)).success).toBe(true);
  expect(await provider.reconcileHierarchy(1,externalIds,db.pool)).toMatchObject({provider:'GOOGLE',isConsistent:true,skewDetected:false});
 });
 it('reports unknown/inconsistent when the owned local hierarchy is missing',async()=>{
  const {provider}=providerFixture();expect((await provider.reconcileHierarchy(999,externalIds,db.pool)).isConsistent).toBe(false);
 });
 it('does not mutate another provider or invent recovery objects',async()=>{
  const {provider,state}=providerFixture();await provider.createCampaignHierarchy(request(),db.pool);
  await db.pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,account_id) VALUES(1,'META','CAMPAIGN','1001','123456789')");
  const before=(await db.pool.query('SELECT * FROM provider_entities ORDER BY id')).rows;
  const transactions=(await db.pool.query('SELECT * FROM provider_publishing_transactions ORDER BY id')).rows;
  expect((await provider.reconcileHierarchy(1,externalIds,db.pool)).isConsistent).toBe(true);
  expect((await db.pool.query('SELECT * FROM provider_entities ORDER BY id')).rows).toEqual(before);
  expect((await db.pool.query('SELECT * FROM provider_publishing_transactions ORDER BY id')).rows).toEqual(transactions);
  expect(state.mutations).toBe(1);
 });
});
