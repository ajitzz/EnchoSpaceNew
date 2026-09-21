import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createAdtechFixture} from './adtechFixture.js';
import {inTransaction} from '../../lib/marketing/database.js';
import {fingerprint} from '../../lib/marketing/domain.js';
import {CampaignStrategyBindings} from '../../lib/marketing/adtech/bindings.js';
import {FeederCorridorResolver} from '../../lib/marketing/adtech/corridors.js';
import {AdtechStrategyRegistry} from '../../lib/marketing/adtech/registry.js';
import {compileMetaStrategy,assertMetaStrategyReadback,googleStrategyCriteria} from '../../lib/marketing/adtech/compiler.js';
import {ADTECH_COMPILER_HASH,type ResolvedCampaignStrategy} from '../../lib/marketing/adtech/contracts.js';
import {buildGoogleSearchPlan} from '../../lib/providers/google/GoogleSearchPlan.js';
import {buildMetaCampaignPlan} from '../../lib/providers/meta/MetaCampaignPlan.js';
import {assertGoogleStrategyReadback} from '../../lib/marketing/adtech/googleReadback.js';
const admin={id:90,role:'admin'} as const,host={id:10,role:'host'} as const;
const seal=(value:any)=>({...value,evidenceHash:fingerprint(value)});
const geo=[seal({provider:'META',apiVersion:'v26.0',country:'IN',verifiedAt:'2026-09-22T00:00:00.000Z',kind:'PROVIDER_CITY_RADIUS',label:'Synthetic Bengaluru feeder',providerKey:'101',latitude:12.97,longitude:77.59,radiusKm:30}),seal({provider:'META',apiVersion:'v26.0',country:'IN',verifiedAt:'2026-09-22T00:00:00.000Z',kind:'PROVIDER_REGION_EXCLUSION',label:'Synthetic Wayanad',providerKey:'202',administrativeLevel:'DISTRICT'})];
function providerRequest(strategy:any):any{return {campaignId:30,hostId:10,listingId:20,title:'Verified stay campaign',objective:'BOOKINGS',budget:{currency:'INR',minor_units:200000},startTime:'2099-01-01T00:00:00Z',endTime:'2099-01-06T23:59:59Z',targetAudience:{locations:['Bengaluru']},creativeAssets:{headline:'Explore this stay',description:'Review the verified rooms and select available dates.',mediaUrl:'https://media.encho.co.in/image.jpg',mediaType:'IMAGE',landingPageUrl:'https://www.encho.co.in/stay/verified-stay'},idempotencyKey:'bound-campaign-30',correlationId:'correlation-30',metadata:{adtechStrategy:strategy,metaWebsite:{version:1,countries:['IN'],placements:['FACEBOOK_FEED','INSTAGRAM_FEED'],specialAdCategories:[]},googleSearch:{version:1,headlines:['Explore this stay','View verified rooms','Plan your next visit'],descriptions:['Review the verified rooms and select available dates.','See property details before booking.'],keywords:[{text:'wayanad villa stay',matchType:'EXACT'}],geoTargetConstants:[],languageConstants:['languageConstants/1000'],geoMode:'PRESENCE_OR_INTEREST',budgetMode:'CAMPAIGN_TOTAL',bidding:'MAXIMIZE_CONVERSIONS',containsEuPoliticalAdvertising:'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'}}};}
describe('immutable revision strategies and provider compilation',()=>{
 let f:Awaited<ReturnType<typeof createAdtechFixture>>,bindings:CampaignStrategyBindings,selection:any,bound:ResolvedCampaignStrategy;
 const row:any={campaign_id:30,revision:1,host_id:10,listing_id:20,provider:'META',draft:{mediaBudgetMinor:'200000'}};
 beforeAll(async()=>{
  f=await createAdtechFixture();const c=await f.pool.connect();try{await c.query('BEGIN');await c.query(readFileSync('src/migrations/033_marketing_adtech_corridors.sql','utf8'));await c.query('CREATE TABLE marketing_campaign_revisions(campaign_id INT,revision INT,host_id INT,draft JSONB,PRIMARY KEY(campaign_id,revision))');await c.query(readFileSync('src/migrations/034_marketing_adtech_bindings.sql','utf8'));await c.query('COMMIT');}finally{c.release();}
  await f.pool.query(`GRANT SELECT,INSERT ON marketing_destination_corridors,marketing_destination_corridor_versions,marketing_corridor_geography_evidence,marketing_campaign_strategy_bindings TO marketing_worker,authenticated_host;GRANT SELECT,INSERT,UPDATE ON marketing_corridor_current_versions TO marketing_worker;GRANT SELECT ON marketing_campaign_revisions TO marketing_worker,authenticated_host;GRANT UPDATE(id) ON listings TO marketing_worker;GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO marketing_worker;INSERT INTO marketing_campaign_revisions VALUES(30,1,10,'{}')`);
  const resolver={search:async()=>[],resolve:async(input:any)=>geo[input.kind==='PROVIDER_REGION_EXCLUSION'?1:0]};
  const corridors=new FeederCorridorResolver(f.runtime,{META:resolver,GOOGLE:resolver});
  const v=await corridors.save(admin,1,{provider:'META',tier:'BUDGET',expectedVersion:0,entries:[{kind:'PROVIDER_CITY_RADIUS',query:'Bengaluru',providerKey:'101',radiusKm:30},{kind:'PROVIDER_REGION_EXCLUSION',query:'Wayanad',providerKey:'202'}],reason:'Synthetic verified corridor for revision tests'},'binding-corridor-save');
  await corridors.publish(admin,1,{versionId:v.id,expectedVersionId:null,reason:'Publish synthetic corridor for binding tests'},'binding-corridor-publish');
  bindings=new CampaignStrategyBindings(f.runtime,admin,true);selection=(await bindings.defaults(host,20,'META')).selection;row.draft.strategySelection=selection;
  await inTransaction(f.runtime,host,c=>bindings.bind(c,row));bound=(await inTransaction(f.runtime,host,c=>bindings.load(c,row)))!;
 });
 afterAll(async()=>{await f?.close();});
 it('persists a private immutable binding with precise price evidence',async()=>{
  expect(bound.price.amountMinor).toBe('350000');expect(bound.compilerContractHash).toBe(ADTECH_COMPILER_HASH);
  const visible=await bindings.defaults(host,20,'META');expect(JSON.stringify(visible)).not.toContain('providerKey');expect(visible).not.toHaveProperty('lat');
  expect((await inTransaction(f.hostPool,{id:11,role:'host'},c=>c.query('SELECT * FROM marketing_campaign_strategy_bindings'))).rowCount).toBe(0);
  await expect(f.pool.query('DELETE FROM marketing_campaign_strategy_bindings')).rejects.toThrow(/IMMUTABLE/);
 });
 it('rejects missing authority, foreign listings, exclusion overrides and unknown feeder hashes',async()=>{
  await expect(bindings.defaults({id:11,role:'host'},20,'META')).rejects.toMatchObject({code:'LISTING_NOT_AVAILABLE'});
  await expect(inTransaction(f.runtime,host,c=>bindings.bind(c,{...row,draft:{} as any}))).rejects.toMatchObject({code:'STRATEGY_REQUIRED'});
  for(const evidenceHash of [geo[1].evidenceHash,'f'.repeat(64)])await expect(inTransaction(f.runtime,host,c=>bindings.bind(c,{...row,draft:{...row.draft,strategySelection:{...selection,overrides:[{evidenceHash,radiusKm:30}]}}}))).rejects.toMatchObject({code:'TARGETING_OVERRIDE_INVALID'});
 });
 it('new admin releases never change existing compiled payloads; stale previews reject',async()=>{
  const before=buildMetaCampaignPlan(providerRequest(bound),'https://www.encho.co.in',{accountId:'act_1',pageId:'2',pixelId:'3',instagramId:'4'});
  const registry=new AdtechStrategyRegistry(f.runtime);const current=await registry.list(admin);const first=current.profiles[0];const next=await registry.save(admin,{expectedVersion:1,profile:{...first.config,meta:{...first.config.meta,ageMax:34}},reason:'Change age only for future campaign drafts'},'binding-new-profile');
  await registry.publish(admin,{expectedReleaseId:current.currentReleaseId,versionIds:[next.id,...current.profiles.slice(1).map(v=>v.version_id)],reason:'Publish a new revision without modifying history'},'binding-new-release');
  const loaded=await inTransaction(f.runtime,host,c=>bindings.load(c,row));expect(buildMetaCampaignPlan(providerRequest(loaded),'https://www.encho.co.in',{accountId:'act_1',pageId:'2',pixelId:'3',instagramId:'4'}).fingerprint).toBe(before.fingerprint);
  await expect(inTransaction(f.runtime,host,c=>bindings.bind(c,row))).rejects.toMatchObject({code:'STRATEGY_DEFAULTS_CHANGED'});
 });
 it('compiles Meta radii/exclusions/attribution and detects provider drift',()=>{
  const expected=compileMetaStrategy(bound);expect(expected.targeting.geo_locations).not.toHaveProperty('countries');expect(expected.targeting.excluded_geo_locations.regions).toEqual([{key:'202'}]);
  const remote={...expected,targeting:structuredClone(expected.targeting)};expect(()=>assertMetaStrategyReadback(bound,expected,remote)).not.toThrow();remote.targeting.geo_locations.cities![0].radius=40;
  expect(()=>assertMetaStrategyReadback(bound,expected,remote)).toThrow(/differs/);
 });
 it('compiles Google proximity, exclusions, negative terms and exact micros without country fallback',async()=>{
  const content={...bound,provider:'GOOGLE' as const,profile:{...bound.profile,google:{...bound.profile.google,targetCpaMinor:'60000',negativeKeywords:[{text:'jobs',matchType:'PHRASE' as const}]}},geography:bound.geography.map(g=>({...g,provider:'GOOGLE' as const,apiVersion:'v25' as const,...('providerKey'in g?{providerKey:`geoTargetConstants/${g.providerKey}`}:{})}))};
  const {snapshotHash:_,...body}=content;const strategy={...body,snapshotHash:fingerprint(body)};const request=providerRequest(strategy);request.startTime='2099-01-01';request.endTime='2099-01-06';
  const plan=buildGoogleSearchPlan(request,'1234567890','https://www.encho.co.in');expect((plan.operations[1] as any).campaignOperation.create).toMatchObject({maximizeConversions:{targetCpaMicros:'600000000'},geoTargetTypeSetting:{positiveGeoTargetType:'PRESENCE'}});
  const criteria=googleStrategyCriteria(strategy,'customers/1234567890/campaigns/99');expect(criteria).toHaveLength(3);expect(criteria[0]).toMatchObject({proximity:{radius:30,radiusUnits:'KILOMETERS'}});expect(criteria[1]).toMatchObject({negative:true,location:{geoTargetConstant:'geoTargetConstants/202'}});
  const client={searchStream:async(_id:string,query:string)=>query.includes('FROM campaign_criterion')?criteria.map(c=>({campaignCriterion:c})):[{campaign:{resourceName:'customers/1234567890/campaigns/99',maximizeConversions:{targetCpaMicros:'600000000'},geoTargetTypeSetting:{positiveGeoTargetType:'PRESENCE'}}}]};
  await expect(assertGoogleStrategyReadback(client as any,'1234567890','99',strategy)).resolves.toBeUndefined();criteria.pop();await expect(assertGoogleStrategyReadback(client as any,'1234567890','99',strategy)).rejects.toMatchObject({code:'GOOGLE_STRATEGY_READBACK_MISMATCH'});
 });
 it('rejects tampered snapshot hashes and price changes',async()=>{
  expect(()=>compileMetaStrategy({...bound,snapshotHash:'0'.repeat(64)})).toThrow(/approved strategy/);
  await f.pool.query('UPDATE listings SET price=3501 WHERE id=20');await expect(inTransaction(f.runtime,host,c=>bindings.verify(c,row))).rejects.toMatchObject({code:'STRATEGY_PRICE_CHANGED'});
 });
});
