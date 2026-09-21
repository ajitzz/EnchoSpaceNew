import {describe,it,expect} from 'vitest';
import {dispatchMetaCampaign} from '../../server.ts';
import {assertRetiredPaidCall,useLegacyPaidBoundaryFixture} from './legacyPaidBoundaryFixture.js';
// Multi-asset publication is SP6, not the retired launcher. Current publication,
// ownership, replay and partial-failure assertions run in harvo/meta_provider.test.ts.
describe('Legacy multi-variant launcher remains contained pending SP6',()=>{
 const db=useLegacyPaidBoundaryFixture();
 it('cannot turn multiple media URLs into unreviewed provider variants',async()=>{
  const id=await db.campaign();
  await assertRetiredPaidCall(db.pool,id,()=>dispatchMetaCampaign(id,{user:{id:1,role:'admin'}} as any));
  expect((await db.pool.query('SELECT * FROM campaign_creative_variants WHERE campaign_id=$1',[id])).rows).toHaveLength(0);
 });
 it('does not overwrite previously recorded variant asset identity',async()=>{
  const id=await db.campaign();
  await db.pool.query("INSERT INTO campaign_creative_variants(campaign_id,media_url,asset_sha256,meta_creative_id,meta_ad_id,is_published)VALUES($1,'https://assets.example.test/a.jpg','approved-asset-hash','123','124',true)",[id]);
  await assertRetiredPaidCall(db.pool,id,()=>dispatchMetaCampaign(id,{user:{id:1,role:'admin'}} as any));
 });
 it('does not create variants on duplicate calls',async()=>{
  const id=await db.campaign();
  for(let attempt=0;attempt<2;attempt++)await assertRetiredPaidCall(db.pool,id,()=>dispatchMetaCampaign(id,{user:{id:1,role:'admin'}} as any));
 });
 it('does not erase a quarantined partial publication',async()=>{
  const id=await db.campaign('RECONCILIATION_REQUIRED');
  await db.pool.query("INSERT INTO meta_publishing_transactions(campaign_id,idempotency_key,correlation_id,publish_status,meta_campaign_id)VALUES($1,'legacy-partial','legacy-correlation','QUARANTINED','123')",[id]);
  await assertRetiredPaidCall(db.pool,id,()=>dispatchMetaCampaign(id,{user:{id:1,role:'admin'}} as any));
 });
 it('cannot be enabled by supplying another tenant or master account in the request',async()=>{
  const id=await db.campaign();
  await assertRetiredPaidCall(db.pool,id,()=>dispatchMetaCampaign(id,{user:{id:999,role:'admin'},body:{ad_account_id:'999'}} as any));
 });
});
