import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createLocalPostgresFixture} from './postgres.js';
import {fixture as metaFixture,request as metaRequest,ids as metaIds,media} from './metaProviderFixture.js';
import {providerFixture as googleFixture,request as googleRequest,ids as googleIds} from './googleProviderFixture.js';
import {fingerprint} from '../../lib/marketing/domain.js';
import {ADTECH_COMPILER_HASH,canonicalPriceEvidence} from '../../lib/marketing/adtech/contracts.js';
import {publishedStrategyReference} from '../../lib/marketing/adtech/publishedStrategy.js';
let f:Awaited<ReturnType<typeof createLocalPostgresFixture>>;
function strategy(provider:'META'|'GOOGLE'){
 const profile=JSON.parse(readFileSync('src/migrations/032_marketing_adtech_registry.sql','utf8').match(/\$profiles\$([\s\S]*?)\$profiles\$/)![1])[0];
 const base={provider,apiVersion:provider==='META'?'v26.0':'v25',country:'IN',verifiedAt:'2026-09-22T00:00:00.000Z'};
 const geo=[{...base,kind:'COORDINATE_RADIUS',label:'Synthetic feeder',latitude:12.97,longitude:77.59,radiusKm:30},{...base,kind:'PROVIDER_REGION_EXCLUSION',label:'Synthetic district',providerKey:provider==='META'?'222':'geoTargetConstants/222',administrativeLevel:'DISTRICT'}];
 const body={version:1,provider,releaseId:1,profileVersionId:1,corridorVersionId:1,price:canonicalPriceEvidence({id:20,price:'3500',currency:'INR',rental_mode:'entire_place'}),profile,geography:geo.map(g=>({...g,evidenceHash:fingerprint(g)})),compilerContract:'ADTECH_V1',compilerContractHash:ADTECH_COMPILER_HASH,hostOverrides:[]};
 return {...body,snapshotHash:fingerprint(body)};
}
beforeAll(async()=>{f=await createLocalPostgresFixture();await f.pool.query('CREATE TABLE media_assets(id SERIAL PRIMARY KEY,entity_type TEXT,entity_id INT,url TEXT,moderation_status TEXT);CREATE TABLE marketing_campaign_strategy_bindings(campaign_id INT,revision INT,snapshot JSONB,PRIMARY KEY(campaign_id,revision))');});
afterAll(async()=>{await f?.close();});
beforeEach(async()=>{
 await f.pool.query('TRUNCATE provider_entities,provider_publishing_transactions,campaign_financial_contracts,host_marketing_campaigns,listings,media_assets,marketing_campaign_strategy_bindings RESTART IDENTITY CASCADE');
 await f.pool.query("INSERT INTO listings VALUES(20,10,'Lake House','lake-house','published');INSERT INTO host_marketing_campaigns VALUES(1,10,20);INSERT INTO campaign_financial_contracts(campaign_id,gross_host_charge,encho_fee_amount,meta_authorized_spend,meta_remaining_authorization,currency)VALUES(1,10500,500,10000,10000,'INR')");
 await f.pool.query("INSERT INTO media_assets(entity_type,entity_id,url,moderation_status)VALUES('listing',20,$1,'approved')",[media]);
});
it('rejects missing revision evidence before bound publication',()=>{
 const request=metaRequest();request.metadata!.adtechStrategy=strategy('META');expect(()=>publishedStrategyReference(request)).toThrow(/revision/);
});
it.each(['META','GOOGLE'] as const)('%s blocks spending after geographic drift; reads the published immutable revision',async provider=>{
 const binding=strategy(provider);await f.pool.query('INSERT INTO marketing_campaign_strategy_bindings VALUES(1,3,$1)',[JSON.stringify(binding)]);
 const request=provider==='META'?metaRequest():googleRequest();request.metadata={...request.metadata,revision:3,adtechStrategy:binding};
 const remote=provider==='META'?metaFixture('ADTECH'):googleFixture('ADTECH',async()=>({authorizationId:'synthetic-control-guard'}));
 expect(await remote.provider.createCampaignHierarchy(request,f.pool)).toMatchObject({success:true});
 const stored=(await f.pool.query("SELECT metadata FROM provider_entities WHERE entity_type=$1",[provider==='META'?'AD_SET':'CAMPAIGN'])).rows[0].metadata;
 expect(stored).toMatchObject({adtechRevision:3,adtechStrategyHash:binding.snapshotHash});
 const state:any=remote.state;
 if(provider==='META')state.posts.find((p:any)=>p.path.endsWith('/adsets')).payload.targeting.geo_locations.custom_locations[0].radius=80;
 else state.operations.find((op:any)=>op.campaignCriterionOperation?.create.proximity).campaignCriterionOperation.create.proximity.radius=80;
 const writes=provider==='META'?state.posts.length:state.mutations;
 const control={campaignId:1,externalCampaignId:provider==='META'?metaIds.campaign:googleIds.campaign,action:'RESUME' as const,actorType:'system' as const,idempotencyKey:'bound-resume',correlationId:'synthetic-control-correlation'};
 expect(await remote.provider.resumeCampaign(control,f.pool)).toMatchObject({success:false});
 expect(provider==='META'?state.posts.length:state.mutations).toBe(writes);
 if(provider==='META')expect(await remote.provider.pauseCampaign({...control,action:'PAUSE',idempotencyKey:'bound-safety-pause'},f.pool)).toMatchObject({success:true});
});
it('does not treat a missing binding as a legacy campaign',async()=>{
 const {provider,state}=metaFixture();expect(await provider.createCampaignHierarchy(metaRequest(),f.pool)).toMatchObject({success:true});
 await f.pool.query("UPDATE provider_entities SET metadata=metadata||$1::jsonb WHERE entity_type='AD_SET'",[JSON.stringify({adtechRevision:4,adtechStrategyHash:'a'.repeat(64)})]);
 const count=state.posts.length;
 expect(await provider.resumeCampaign({campaignId:1,externalCampaignId:metaIds.campaign,action:'RESUME',actorType:'system',idempotencyKey:'missing-bound-resume',correlationId:'synthetic'},f.pool)).toMatchObject({success:false});expect(state.posts).toHaveLength(count);
});
