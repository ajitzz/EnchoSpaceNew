import {describe,it,expect} from 'vitest';
import {useProviderContractFixture} from './harvo/providerContractFixture.js';
import {providerFixture,request,ids} from './harvo/googleProviderFixture.js';
describe('Google paused hierarchy and durable provider identity',()=>{
 const db=useProviderContractFixture();
 it('stores the three provider-returned Search objects with their exact parent links',async()=>{
  const {provider,state}=providerFixture();
  expect(await provider.createCampaignHierarchy(request(),db.pool)).toMatchObject({success:true,externalCampaignId:ids.campaign});
  const rows=(await db.pool.query('SELECT entity_type,external_id,parent_entity_id,configured_status FROM provider_entities ORDER BY id')).rows;
  expect(rows).toEqual([
   {entity_type:'CAMPAIGN',external_id:ids.campaign,parent_entity_id:null,configured_status:'PAUSED'},
   {entity_type:'AD_GROUP',external_id:ids.group,parent_entity_id:ids.campaign,configured_status:'PAUSED'},
   {entity_type:'AD',external_id:ids.ad,parent_entity_id:ids.group,configured_status:'PAUSED'},
  ]);
  expect(state.mutations).toBe(1);
  await expect(db.pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id) VALUES(1,'GOOGLE','CAMPAIGN',$1)",[ids.campaign])).rejects.toMatchObject({code:'23505'});
 });
});
