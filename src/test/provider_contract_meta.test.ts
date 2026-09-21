import {describe,it,expect} from 'vitest';
import {providerRegistry} from '../lib/providers/providerRegistry.js';
import {fixture,request,ids} from './harvo/metaProviderFixture.js';
import {useProviderContractFixture} from './harvo/providerContractFixture.js';
describe('Meta provider contract with verified transport and isolated PostgreSQL',()=>{
 const db=useProviderContractFixture();
 const externalIds={externalCampaignId:ids.campaign,externalContainerId:ids.adset,externalAdId:ids.ad};
 const control=(action:'RESUME'|'PAUSE')=>({campaignId:1,externalCampaignId:ids.campaign,action,actorType:'admin' as const,actorId:1,idempotencyKey:action,correlationId:'fixture'});
 it('registers only implemented version-bound capabilities',()=>{
  const {provider}=fixture();providerRegistry.registerProvider(provider);expect(providerRegistry.getProvider('META')).toBe(provider);
  expect(provider.apiVersion).toBe('v26.0');expect(provider.capabilities).toMatchObject({supportsBudgetMutation:true,supportsCreativeMutation:false,supportsHierarchyRollback:false});
 });
 it('persists all four remotely returned objects in a paused hierarchy',async()=>{
  const {provider,state}=fixture();expect(await provider.createCampaignHierarchy(request(),db.pool)).toMatchObject({success:true,externalCampaignId:ids.campaign});
  expect(state.posts).toHaveLength(4);expect((await db.pool.query('SELECT external_id FROM provider_entities')).rows.map(row=>row.external_id).sort()).toEqual([ids.campaign,ids.adset,ids.creative,ids.ad].sort());
 });
 it.each(['PAUSE','RESUME'] as const)('performs guarded %s with readback and a durable receipt',async action=>{
  const {provider}=fixture();await provider.createCampaignHierarchy(request(),db.pool);
  const result=action==='PAUSE'?await provider.pauseCampaign(control(action),db.pool):await provider.resumeCampaign(control(action),db.pool);
  expect(result).toMatchObject({success:true,newStatus:action==='PAUSE'?'PAUSED':'ACTIVE',normalizedDeliveryState:action==='PAUSE'?'PAUSED':'UNKNOWN'});
  expect((await db.pool.query('SELECT publish_status FROM provider_publishing_transactions WHERE operation_type=$1',[action])).rows[0].publish_status).toBe('COMMITTED');
 });
 it('enforces the stored authorization rather than a forged budget limit',async()=>{
  const {provider}=fixture();await provider.createCampaignHierarchy(request(),db.pool);
  const denied=fixture('OK',async()=>{throw new Error('budget not approved');});
  expect((await denied.provider.updateBudget({campaignId:1,externalCampaignId:ids.campaign,newBudget:{currency:'INR',minor_units:10001},authorizedLimit:{currency:'INR',minor_units:999999},idempotencyKey:'over',correlationId:'fixture'},db.pool)).success).toBe(false);expect(denied.transport).not.toHaveBeenCalled();
 });
 it('requires complete local and provider ownership evidence',async()=>{
  const {provider}=fixture();await provider.createCampaignHierarchy(request(),db.pool);
  expect((await provider.reconcileHierarchy(1,externalIds,db.pool)).isConsistent).toBe(true);
  expect((await fixture('FOREIGN_PARENT').provider.reconcileHierarchy(1,externalIds,db.pool)).isConsistent).toBe(false);
 });
 it('does not mistake configured ACTIVE for current live impressions',async()=>{
  const {provider,state}=fixture();await provider.createCampaignHierarchy(request(),db.pool);state.campaign=state.adset=state.ad='ACTIVE';
  expect(await provider.fetchAuthoritativeDeliveryTruth(ids.campaign,db.pool)).toMatchObject({readiness:'ELIGIBLE',isLive:false,isServingImpressions:false});
 });
 it('normalizes metrics and money without substituting missing values',async()=>{
  const {provider}=fixture();await provider.createCampaignHierarchy(request(),db.pool);
  expect(await provider.fetchTelemetrySnapshot(ids.campaign,{startDate:'2026-10-01',endDate:'2026-10-10'},db.pool)).toMatchObject({impressions:1000,clicks:20,spend:{currency:'INR',minor_units:12345}});
 });
 it('reconciles without repeating remote writes',async()=>{
  const {provider,state}=fixture();await provider.createCampaignHierarchy(request(),db.pool);
  expect((await provider.reconcileHierarchy(1,externalIds,db.pool)).isConsistent).toBe(true);expect(state.posts).toHaveLength(4);
 });
 it('retains an unknown remote outcome and blocks a new-key publish',async()=>{
  const {provider,state}=fixture('LOST_CREATE');expect((await provider.createCampaignHierarchy(request(),db.pool)).success).toBe(false);
  expect((await provider.createCampaignHierarchy({...request(),idempotencyKey:'new'},db.pool)).success).toBe(false);expect(state.posts).toHaveLength(1);
  expect((await db.pool.query('SELECT is_unknown_outcome FROM provider_publishing_transactions')).rows[0].is_unknown_outcome).toBe(true);
 });
 it('replays the same publication without duplicate remote objects',async()=>{
  const {provider,state}=fixture();const first=await provider.createCampaignHierarchy(request(),db.pool);expect(first.success).toBe(true);
  expect(await provider.createCampaignHierarchy(request(),db.pool)).toMatchObject({success:true,externalCampaignId:first.externalCampaignId});expect(state.posts).toHaveLength(4);
 });
 it('rejects a foreign host binding before any transport call',async()=>{
  const {provider,transport}=fixture();expect((await provider.createCampaignHierarchy({...request(),hostId:11},db.pool)).success).toBe(false);expect(transport).not.toHaveBeenCalled();
 });
});
