import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createWorkflowPgFixture} from './workflowPgFixture.js';
import {CanonicalMarketingFacts} from '../../lib/marketing/portfolio/facts.js';
import {KeywordResearchService} from '../../lib/marketing/portfolio/keywordResearch.js';
import {parseKeywordIdeas,GoogleKeywordResearchAdapter} from '../../lib/providers/google/keywordResearch.js';
import {GoogleAdsClient} from '../../lib/providers/google/GoogleAdsClient.js';
import {inTransaction} from '../../lib/marketing/database.js';
import type {KeywordResearchEvidence} from '../../lib/marketing/portfolio/keywordContract.js';
const host={id:10,role:'host' as const},system={id:90,role:'system' as const};
const sample=():KeywordResearchEvidence=>({source:'GOOGLE_KEYWORD_PLAN_IDEA',apiVersion:'v25',currency:'INR',observedAt:new Date().toISOString(),historical:true,truncated:false,ideas:[]});
const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});

describe('Google historical research transport',()=>{
 it('uses configured customer/MCC, GOOGLE_SEARCH and canonical seed without any mutation',async()=>{
  const transport=vi.fn(async(url:any,init?:RequestInit)=>{
   if(String(url).includes('oauth2'))return json({access_token:'fixture-token',expires_in:3600,token_type:'Bearer'});
   if(String(url).endsWith('googleAds:searchStream'))return json([{results:[{customer:{id:'1234567890',manager:false,currencyCode:'INR'}}]}]);
   expect(String(url)).toBe('https://googleads.googleapis.com/v25/customers/1234567890:generateKeywordIdeas');
   expect(init?.headers).toMatchObject({'login-customer-id':'1112223333',Authorization:'Bearer fixture-token'});
   expect(JSON.parse(String(init?.body))).toMatchObject({includeAdultKeywords:false,keywordPlanNetwork:'GOOGLE_SEARCH',pageSize:100,keywordAndUrlSeed:{url:'https://encho.example/stay/garden-villa',keywords:['garden villa']}});
   return json({results:[{text:'garden villa',keywordIdeaMetrics:{avgMonthlySearches:'0',competition:'LOW',competitionIndex:'12',lowTopOfPageBidMicros:'120000',highTopOfPageBidMicros:'300000',monthlySearchVolumes:[{year:'2026',month:'AUGUST',monthlySearches:'0'}]}}]});
  });
  const client=new GoogleAdsClient({clientId:'fixture-client',clientSecret:'fixture-secret',refreshToken:'fixture-refresh',mccCustomerId:'1112223333',customerId:'1234567890'},{fetch:transport as typeof fetch});
  const result=await new GoogleKeywordResearchAdapter(client).research({canonicalUrl:'https://encho.example/stay/garden-villa',keywords:['garden villa'],geoTargetConstants:['geoTargetConstants/2356'],languageConstant:'languageConstants/1000'});
  expect(result.ideas[0]).toMatchObject({averageMonthlySearches:'0',competitionIndex:12,monthlySearchVolumes:[{year:2026,month:'AUGUST',searches:'0'}]});expect(result.historical).toBe(true);expect(transport.mock.calls.every(([url])=>!String(url).includes('mutate'))).toBe(true);
 });
 it('keeps missing metrics distinct from zero and pagination explicitly truncated',()=>{
  expect(parseKeywordIdeas({results:[{text:'sparse result'}],nextPageToken:'opaque'})).toMatchObject({truncated:true,ideas:[{averageMonthlySearches:null,competitionIndex:null,lowTopOfPageBidMicros:null,monthlySearchVolumes:[]}]});
  expect(parseKeywordIdeas({})).toEqual({ideas:[],truncated:false});
 });
 it.each([{avgMonthlySearches:'-1'},{avgMonthlySearches:9007199254740992},{competitionIndex:'101'},{lowTopOfPageBidMicros:'500',highTopOfPageBidMicros:'1'},{monthlySearchVolumes:[{year:'2026',month:'UNKNOWN',monthlySearches:'1'}]}])('rejects malformed metrics %j',metrics=>{
  expect(()=>parseKeywordIdeas({results:[{text:'villa',keywordIdeaMetrics:metrics}]})).toThrow('invalid historical');
 });
});

describe('distributed keyword coalescing, tenant cache and shared customer quota',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtime:pg.Pool,facts:CanonicalMarketingFacts,service:KeywordResearchService,input:any;
 const provider=vi.fn(async()=>sample()),resolve=vi.fn(async()=>({}));
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();await fixture.pool.query('ALTER TABLE listings ADD COLUMN amenities JSONB; ALTER TABLE room_types ADD COLUMN name TEXT,ADD COLUMN description TEXT,ADD COLUMN amenities JSONB');
  for(const name of ['014_harvo_marketing_request_limits.sql','023_marketing_product_facts.sql','024_marketing_keyword_research.sql'])await fixture.pool.query(readFileSync(`src/migrations/${name}`,'utf8'));
  await fixture.pool.query(`CREATE ROLE research_runtime LOGIN NOSUPERUSER NOBYPASSRLS;GRANT USAGE ON SCHEMA public TO research_runtime;
   GRANT SELECT,UPDATE ON users,listings,media_assets,room_types TO research_runtime;
   GRANT SELECT,INSERT,UPDATE,DELETE ON marketing_keyword_research,marketing_keyword_customer_slots,marketing_request_limits TO research_runtime;`);
  runtime=new pg.Pool({...fixture.pool.options,user:'research_runtime',max:6});facts=new CanonicalMarketingFacts(runtime);
 });
 beforeEach(async()=>{await fixture.reset();provider.mockReset().mockResolvedValue(sample());resolve.mockReset().mockResolvedValue({});service=new KeywordResearchService(runtime,facts,{customerId:'1234567890',research:provider},'https://encho.example',system,resolve);input={listingId:20,factHash:(await facts.preview(host,20)).factHash,keywords:['garden villa'],geoTargetConstants:['geoTargetConstants/2356'],languageConstant:'languageConstants/1000'};});
 afterAll(async()=>{await runtime?.end();await fixture?.close();});
 it('coalesces independent instances before remote work and reuses bounded tenant evidence',async()=>{
  let finish!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{finish=r;}),start=new Promise<void>(r=>{entered=r;});provider.mockImplementationOnce(async()=>{entered();await gate;return sample();});
  const first=service.research(host,input);await start;
  const otherInstance=new KeywordResearchService(runtime,facts,{customerId:'1234567890',research:provider},'https://encho.example',system,resolve);
  try{expect(await otherInstance.research(host,input)).toMatchObject({status:'PENDING',evidence:null});expect(provider).toHaveBeenCalledOnce();}finally{finish();}
  const result=await first;if(!('id' in result))throw new Error('Expected completed research');expect(result).toMatchObject({status:'EMPTY',cached:false});expect(await otherInstance.research(host,input)).toMatchObject({id:result.id,cached:true,status:'EMPTY'});expect(provider).toHaveBeenCalledOnce();
 });
 it('serializes distinct requests and tenants sharing one serving customer, preserving cooldown after completion',async()=>{
  await service.research(host,input);
  expect(await service.research(host,{...input,keywords:['another keyword']})).toMatchObject({status:'RATE_LIMITED'});
  const other={id:11,role:'host' as const},otherInput={...input,listingId:21,factHash:(await facts.preview(other,21)).factHash};
  expect(await service.research(other,otherInput)).toMatchObject({status:'RATE_LIMITED'});
  await fixture.pool.query("UPDATE marketing_keyword_customer_slots SET next_allowed_at=clock_timestamp()-interval '1 second'");
  expect(await service.research(other,otherInput)).toMatchObject({status:'EMPTY',cached:false});expect(provider).toHaveBeenCalledTimes(2);
  expect((await inTransaction(runtime,host,c=>c.query('SELECT host_id FROM marketing_keyword_research'))).rows).toEqual([{host_id:10}]);
  expect((await inTransaction(runtime,host,c=>c.query('SELECT * FROM marketing_keyword_customer_slots'))).rows).toHaveLength(0);
 });
 it('refuses foreign/stale listing evidence and host-supplied accounts or URLs before any provider call',async()=>{
  for(const bad of [{...input,listingId:21},{...input,factHash:'a'.repeat(64)},{...input,customerId:'9999999999'},{...input,url:'https://attacker.invalid'}])await expect(service.research(host,bad)).rejects.toThrow();
  expect(provider).not.toHaveBeenCalled();
 });
 it('records sanitized unavailability without fabricating empty data or retrying immediately',async()=>{
  provider.mockRejectedValueOnce(new Error('secret-access-token'));const result=await service.research(host,input);
  expect(result).toMatchObject({status:'UNAVAILABLE',code:'RESEARCH_UNAVAILABLE',evidence:null});expect(JSON.stringify(result)).not.toContain('secret');
  expect(await service.research(host,input)).toMatchObject({status:'UNAVAILABLE',cached:true});expect(provider).toHaveBeenCalledOnce();
 });
 it('expired fences cannot store a late response or release a successor’s quota lease',async()=>{
  provider.mockImplementationOnce(async()=>{
   await fixture.pool.query("UPDATE marketing_keyword_research SET fence=fence+1,lease_until=clock_timestamp()+interval '120 seconds'");
   await fixture.pool.query("UPDATE marketing_keyword_customer_slots SET claim_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'");return sample();
  });
  await expect(service.research(host,input)).rejects.toMatchObject({code:'RESEARCH_CLAIM_EXPIRED'});
  expect((await fixture.pool.query('SELECT state,evidence FROM marketing_keyword_research')).rows).toEqual([{state:'RUNNING',evidence:null}]);
  expect((await fixture.pool.query('SELECT claim_id FROM marketing_keyword_customer_slots')).rows[0].claim_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 });
 it('host database authority cannot create research results or take the shared customer slot',async()=>{
  await expect(inTransaction(runtime,host,c=>c.query("INSERT INTO marketing_keyword_customer_slots(customer_id) VALUES('1234567890')"))).rejects.toThrow(/row-level security/);
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_reservations')).rows).toHaveLength(0);
 });
 it('applies the distributed targeting budget before any provider metadata lookup',async()=>{
  await fixture.pool.query("INSERT INTO marketing_request_limits(host_id,scope,bucket,attempts) VALUES(10,'TARGETING',date_trunc('minute',clock_timestamp()),60)");
  await expect(service.research(host,input)).rejects.toMatchObject({code:'MARKETING_REQUEST_LIMIT',status:429});
  expect(resolve).not.toHaveBeenCalled();expect(provider).not.toHaveBeenCalled();
 });
});
