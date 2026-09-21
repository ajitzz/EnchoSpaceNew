import {describe,it,expect} from 'vitest';
import {providerRegistry} from '../lib/providers/providerRegistry.js';
import {providerFixture,request,ids} from './harvo/googleProviderFixture.js';
import {useProviderContractFixture} from './harvo/providerContractFixture.js';
// Current positive pause/resume/budget contracts also run in harvo/provider_controls.test.ts.
// A registered singleton or a client-supplied actor label is not spending authority.
describe('Google provider contract with verified transport and isolated PostgreSQL',()=>{
 const db=useProviderContractFixture();
 const externalIds={externalCampaignId:ids.campaign,externalContainerId:ids.group,externalAdId:ids.ad};
 const control=()=>({campaignId:1,externalCampaignId:ids.campaign,action:'RESUME' as const,actorType:'admin' as const,actorId:1,idempotencyKey:'control',correlationId:'fixture'});
 it('registers the version and only supported capabilities',()=>{
  const {provider}=providerFixture();providerRegistry.registerProvider(provider);
  expect(providerRegistry.getProvider('GOOGLE')).toBe(provider);
  expect(provider.apiVersion).toBe('v25');
  expect(provider.capabilities).toMatchObject({supportsBudgetMutation:true,supportsCreativeMutation:false,supportsAssetLevelTargeting:false});
 });
 it('creates actual returned resource names in a paused hierarchy',async()=>{
  const {provider}=providerFixture();const result=await provider.createCampaignHierarchy(request(),db.pool);
  expect(result).toMatchObject({success:true,externalCampaignId:ids.campaign,provider:'GOOGLE'});
  expect((await db.pool.query('SELECT external_id,configured_status FROM provider_entities')).rows).toEqual(expect.arrayContaining([{external_id:ids.ad,configured_status:'PAUSED'}]));
 });
 it.each(['PAUSE','RESUME'] as const)('requires trusted authorization for %s even for an admin label',async action=>{
  const {provider,state}=providerFixture();expect((await provider.createCampaignHierarchy(request(),db.pool)).success).toBe(true);
  const result=await (action==='PAUSE'?provider.pauseCampaign({...control(),action},db.pool):provider.resumeCampaign(control(),db.pool));
  expect(result.success).toBe(false);expect(state.mutations).toBe(1);
 });
 it('does not accept a caller-supplied budget authorization',async()=>{
  const {provider,state}=providerFixture();await provider.createCampaignHierarchy(request(),db.pool);
  expect((await provider.updateBudget({campaignId:1,externalCampaignId:ids.campaign,newBudget:{currency:'INR',minor_units:999999},authorizedLimit:{currency:'INR',minor_units:999999},idempotencyKey:'forged',correlationId:'fixture'},db.pool)).success).toBe(false);
  expect(state.mutations).toBe(1);
 });
 it('verifies local and external hierarchy ownership',async()=>{
  const {provider}=providerFixture();await provider.createCampaignHierarchy(request(),db.pool);
  expect((await provider.reconcileHierarchy(1,externalIds,db.pool)).isConsistent).toBe(true);
  expect((await provider.reconcileHierarchy(999,externalIds,db.pool)).isConsistent).toBe(false);
 });
 it('projects eligibility without inventing current live delivery',async()=>{
  await providerFixture().provider.createCampaignHierarchy(request(),db.pool);
  expect(await providerFixture('DELIVERY_ELIGIBLE').provider.fetchAuthoritativeDeliveryTruth(ids.campaign,db.pool)).toMatchObject({readiness:'ELIGIBLE',isLive:false,isServingImpressions:false});
 });
 it('normalizes real-shaped reporting metrics in account currency',async()=>{
  const {provider}=providerFixture();await provider.createCampaignHierarchy(request(),db.pool);
  expect(await provider.fetchTelemetrySnapshot(ids.campaign,{startDate:'2026-10-01',endDate:'2026-10-10'},db.pool)).toMatchObject({impressions:200,clicks:20,ctr:0.1,spend:{currency:'INR',minor_units:123}});
 });
 it('reconciles readback without issuing another mutation',async()=>{
  const {provider,state}=providerFixture();await provider.createCampaignHierarchy(request(),db.pool);
  expect((await provider.reconcileHierarchy(1,externalIds,db.pool)).isConsistent).toBe(true);expect(state.mutations).toBe(1);
 });
 it('rejects a cross-tenant campaign/listing binding before transport',async()=>{
  const {provider,transport}=providerFixture();expect((await provider.createCampaignHierarchy({...request(),hostId:11},db.pool)).success).toBe(false);expect(transport).not.toHaveBeenCalled();
 });
});
