import {describe,it,expect} from 'vitest';
import {providerFixture,request,ids} from './harvo/googleProviderFixture.js';
import {useProviderContractFixture} from './harvo/providerContractFixture.js';
import {GoogleTelemetryMapper} from '../lib/providers/google/googleTelemetryMapper.js';
import {googleDcoStrategy} from '../lib/providers/google/googleDcoStrategy.js';
// Isolated transport acceptance only. This does not certify live Google access.
describe('Google sandbox contract under the current contained provider',()=>{
 const db=useProviderContractFixture();
 it('verifies serving account identity and currency before paused publishing',async()=>{
  const {provider,state}=providerFixture();expect((await provider.createCampaignHierarchy(request(),db.pool)).success).toBe(true);
  expect(state.calls.some(call=>String(call.body.query).includes('FROM customer'))).toBe(true);
 });
 it('blocks even one minor unit above the stored financial ceiling',async()=>{
  const {provider,state}=providerFixture();expect((await provider.createCampaignHierarchy({...request(),budget:{currency:'INR',minor_units:10001}},db.pool)).error?.code).toBe('FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION');expect(state.mutations).toBe(0);
 });
 it('converts integer money to micros and rejects unsafe inputs',()=>{
  expect(GoogleTelemetryMapper.toGoogleMicros({currency:'INR',minor_units:250000})).toBe(2500000000);
  for(const minor_units of [-100,10.5,Number.NaN])expect(()=>GoogleTelemetryMapper.toGoogleMicros({currency:'INR',minor_units})).toThrow();
 });
 it('persists exactly the returned paused campaign, group and ad hierarchy',async()=>{
  const {provider}=providerFixture();expect((await provider.createCampaignHierarchy(request(),db.pool)).success).toBe(true);
  expect((await db.pool.query('SELECT external_id FROM provider_entities ORDER BY entity_type')).rows.map(row=>row.external_id).sort()).toEqual([ids.campaign,ids.group,ids.ad].sort());
 });
 it('deduplicates committed publication without inventing deterministic provider IDs',async()=>{
  const {provider,state}=providerFixture();const first=await provider.createCampaignHierarchy(request(),db.pool);expect(first.success).toBe(true);
  expect(await provider.createCampaignHierarchy(request(),db.pool)).toMatchObject({...first,isDuplicate:true});expect(state.mutations).toBe(1);
 });
 it('keeps missing provider evidence unknown',async()=>{
  const {provider}=providerFixture();expect(await provider.fetchAuthoritativeDeliveryTruth(ids.campaign,db.pool)).toMatchObject({normalizedState:'UNKNOWN',isLive:false,lastObservedAt:'',reconciliationRequired:true});
 });
 it('does not turn enabled configuration into live delivery',async()=>{
  await providerFixture().provider.createCampaignHierarchy(request(),db.pool);
  expect(await providerFixture('DELIVERY_ELIGIBLE').provider.fetchAuthoritativeDeliveryTruth(ids.campaign,db.pool)).toMatchObject({readiness:'ELIGIBLE',isLive:false,isServingImpressions:false});
 });
 it('exposes ongoing policy review without a false LIVE claim',async()=>{
  await providerFixture().provider.createCampaignHierarchy(request(),db.pool);
  expect(await providerFixture('POLICY_REVIEW').provider.fetchAuthoritativeDeliveryTruth(ids.campaign,db.pool)).toMatchObject({readiness:'REVIEWING',isLive:false});
 });
 it('reconciles only the correct owned hierarchy',async()=>{
  const {provider}=providerFixture();await provider.createCampaignHierarchy(request(),db.pool);
  expect((await provider.reconcileHierarchy(1,{externalCampaignId:ids.campaign,externalContainerId:ids.group,externalAdId:ids.ad},db.pool)).isConsistent).toBe(true);
  expect((await provider.reconcileHierarchy(2,{externalCampaignId:ids.campaign},db.pool)).isConsistent).toBe(false);
 });
 it('returns reporting with finite ratio units and money',async()=>{
  const {provider}=providerFixture();await provider.createCampaignHierarchy(request(),db.pool);
  const data=await provider.fetchTelemetrySnapshot(ids.campaign,{startDate:'2026-10-01',endDate:'2026-10-10'},db.pool);
  expect(data).toMatchObject({impressions:200,clicks:20,ctr:0.1,spend:{currency:'INR',minor_units:123}});
 });
 it('does not report an unapplied DCO asset mutation as successful',async()=>{
  const result=await googleDcoStrategy.applyWinnerDecision(1,{result:'WINNER_IDENTIFIED',winner_variant_id:201} as any,db.pool);
  expect(result).toMatchObject({success:false,mutatedEntityIds:[],actionsTaken:['GOOGLE_DCO_NOT_IMPLEMENTED']});
 });
 it('does not touch Meta rows during a rejected unauthorised control',async()=>{
  const {provider}=providerFixture();await provider.createCampaignHierarchy(request(),db.pool);
  await db.pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,account_id)VALUES(1,'META','CAMPAIGN','1001','123456789')");
  const before=(await db.pool.query("SELECT * FROM provider_entities WHERE provider='META'")).rows;
  expect((await provider.pauseCampaign({campaignId:1,externalCampaignId:ids.campaign,action:'PAUSE',actorType:'admin',actorId:1,idempotencyKey:'pause-try',correlationId:'fixture'},db.pool)).success).toBe(false);
  expect((await db.pool.query("SELECT * FROM provider_entities WHERE provider='META'")).rows).toEqual(before);
 });
 it('rejects tenant mismatch without provider calls',async()=>{
  const {provider,transport}=providerFixture();expect((await provider.createCampaignHierarchy({...request(),hostId:11},db.pool)).success).toBe(false);expect(transport).not.toHaveBeenCalled();
 });
 it('persists neither OAuth secrets nor tokens in provider receipts',async()=>{
  const {provider}=providerFixture();const result=await provider.createCampaignHierarchy(request(),db.pool);expect(result.success).toBe(true);
  const evidence=JSON.stringify([result,(await db.pool.query('SELECT * FROM provider_publishing_transactions')).rows,(await db.pool.query('SELECT * FROM provider_entities')).rows]);
  for(const secret of ['fixture-secret','fixture-refresh','fixture-access-token'])expect(evidence).not.toContain(secret);
 });
});
