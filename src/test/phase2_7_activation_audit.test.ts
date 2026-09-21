import {describe,it,expect} from 'vitest';
import {activateMetaCampaign} from '../../server.ts';
import {assertRetiredPaidCall,useLegacyPaidBoundaryFixture} from './legacyPaidBoundaryFixture.js';
// Current positive activation, full hierarchy readback, durable audit/replay and
// unknown-outcome contracts: harvo/meta_provider, provider_controls, engine_acceptance.
describe('Legacy activation cannot bypass current guarded workflow',()=>{
 const db=useLegacyPaidBoundaryFixture();
 it.each(['paused','approved','active','EXTERNAL_OUTCOME_UNKNOWN'])('rejects legacy %s activation without mutations or false LIVE claims',async status=>{
  const id=await db.campaign(status);
  await assertRetiredPaidCall(db.pool,id,()=>activateMetaCampaign(id,{user:{id:1,role:'admin'}}));
 });
 it('rejects duplicate and concurrent attempts without remote writes or duplicate receipts',async()=>{
  const id=await db.campaign();
  await assertRetiredPaidCall(db.pool,id,async()=>{
   const results=await Promise.allSettled(Array.from({length:8},()=>activateMetaCampaign(id,{user:{id:1,role:'admin'}})));
   expect(results.every(result=>result.status==='rejected' && result.reason.message.includes('HARVO_V2_REQUIRED'))).toBe(true);
   throw new Error('HARVO_V2_REQUIRED');
  });
 });
 it('preserves prior readback evidence and provider identity',async()=>{
  const id=await db.campaign('paused');
  await db.pool.query("UPDATE host_marketing_campaigns SET meta_campaign_id='123',meta_adset_id='124',meta_ad_id='125',meta_status='PAUSED',meta_effective_status='PAUSED' WHERE id=$1",[id]);
  await assertRetiredPaidCall(db.pool,id,()=>activateMetaCampaign(id,{user:{id:1,role:'admin'}}));
 });
});
