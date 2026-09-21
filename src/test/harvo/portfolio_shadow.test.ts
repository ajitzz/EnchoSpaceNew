import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createWorkflowPgFixture,workflowConfig,workflowDraft} from './workflowPgFixture.js';
import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import {draftSchema} from '../../lib/marketing/domain.js';
import {SearchPortfolioConflictAnalyzer,normalizeSearchKeyword} from '../../lib/marketing/portfolio/shadow.js';
import {inTransaction} from '../../lib/marketing/database.js';
const admin={id:90,role:'admin' as const},host={id:10,role:'host' as const};
const google=(extra:Record<string,unknown>={})=>workflowDraft({provider:'GOOGLE',locations:['India'],googleSearch:{version:1,headlines:['Stay at Garden Villa','Explore the garden','Plan your stay'],descriptions:['Explore the garden villa and choose your stay dates.','See the rooms and property details on Encho.'],keywords:[{text:'Garden Villa',matchType:'EXACT'}],geoTargetConstants:['geoTargetConstants/2356'],languageConstants:['languageConstants/1000'],geoMode:'PRESENCE'},...extra});
describe('SP3 shadow authority is isolated from publication and funding',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtime:pg.Pool,workflow:MarketingWorkflowService,observer:SearchPortfolioConflictAnalyzer;
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();await fixture.pool.query(readFileSync('src/migrations/026_search_portfolio_shadow.sql','utf8'));
  await fixture.pool.query(`CREATE ROLE shadow_runtime LOGIN NOSUPERUSER NOBYPASSRLS;GRANT USAGE ON SCHEMA public TO shadow_runtime;
   GRANT SELECT ON users,marketing_campaign_workflows,marketing_campaign_revisions TO shadow_runtime;
   GRANT SELECT,INSERT ON marketing_campaign_search_targets,marketing_campaign_search_scopes,marketing_search_conflict_assessments,marketing_search_conflict_reviews TO shadow_runtime;`);
  runtime=new pg.Pool({...fixture.pool.options,user:'shadow_runtime',max:3});observer=new SearchPortfolioConflictAnalyzer(runtime,'1234567890');
  workflow=new MarketingWorkflowService(fixture.pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:new WorkflowFinance(fixture.pool,workflowConfig,new CampaignPaymentGateway(fixture.pool,{origin:workflowConfig.origin})),publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:[]});
 });
 beforeEach(async()=>{await fixture.reset();});
 afterAll(async()=>{await runtime?.end();await fixture?.close();});
 async function campaign(extra:Record<string,unknown>={}){const row=await workflow.create(host,google(extra));await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='APPROVED' WHERE campaign_id=$1",[row.campaign_id]);return row;}
 async function critical(){return (await fixture.pool.query(`SELECT jsonb_build_object('workflows',(SELECT jsonb_agg(w ORDER BY campaign_id) FROM marketing_campaign_workflows w),'jobs',(SELECT jsonb_agg(j ORDER BY id) FROM marketing_jobs j),'reservations',(SELECT jsonb_agg(r ORDER BY id) FROM marketing_finance_reservations r),'journals',(SELECT jsonb_agg(j ORDER BY id) FROM marketing_finance_journals j)) AS evidence`)).rows[0].evidence;}
 it('compares normalized terms and explicit scope without claiming self-bidding or changing critical state',async()=>{
  const first=await campaign(),second=await campaign({title:'Second garden campaign'});const before=await critical();
  const receipt=await observer.assess(admin,first.campaign_id,1);
  expect(receipt.evidence).toMatchObject({mode:'SHADOW_ONLY',blocking:false,conflicts:[{campaignId:second.campaign_id,confidence:'SHARED_EXPLICIT_SCOPE',sharedKeywords:['garden villa']}]});
  expect(await critical()).toEqual(before);expect(normalizeSearchKeyword(' ＧＡＲＤＥＮ  Villa ')).toBe('garden villa');
  const duplicate=await observer.assess(admin,first.campaign_id,1);expect(duplicate.id).toBe(receipt.id);
  expect((await fixture.pool.query('SELECT * FROM marketing_search_conflict_assessments')).rows).toHaveLength(1);
 });
 it('reports geographic uncertainty instead of treating different resource IDs as disjoint',async()=>{
  const first=await campaign();const draft=draftSchema.parse(google());draft.googleSearch!.geoTargetConstants=['geoTargetConstants/1007740'];await campaign(draft);
  expect((await observer.assess(admin,first.campaign_id,1)).evidence.conflicts[0].confidence).toBe('GEOGRAPHY_OR_LANGUAGE_UNRESOLVED');
 });
 it('excludes non-overlapping dates and proven other accounts from shared-account findings',async()=>{
  const first=await campaign();await campaign({startDate:'2099-02-01',endDate:'2099-02-05'});const other=await campaign();
  await fixture.pool.query('UPDATE marketing_campaign_workflows SET provider_truth=$2 WHERE campaign_id=$1',[other.campaign_id,JSON.stringify({externalCampaignId:'customers/9999999999/campaigns/123'})]);
  expect((await observer.assess(admin,first.campaign_id,1)).evidence.conflicts).toHaveLength(0);
 });
 it('denies hosts and forged admins at the service and hides all observer evidence under FORCE RLS',async()=>{
  const first=await campaign();await observer.assess(admin,first.campaign_id,1);
  for(const actor of [host,{id:10,role:'admin' as const},{id:10,role:'system' as const}])await expect(observer.assess(actor,first.campaign_id,1)).rejects.toMatchObject({code:'ADMIN_REQUIRED'});
  for(const table of ['marketing_campaign_search_targets','marketing_campaign_search_scopes','marketing_search_conflict_assessments'])expect(await inTransaction(runtime,host,c=>c.query(`SELECT * FROM ${table}`))).toMatchObject({rowCount:0});
  await expect(inTransaction(runtime,host,c=>c.query("INSERT INTO marketing_search_conflict_assessments SELECT gen_random_uuid(),$1,1,'shadow-v1','SHADOW_ONLY',repeat('a',64),'{}',10,now()",[first.campaign_id]))).rejects.toThrow(/row-level security/);
 });
 it('rejects stale revisions and keeps both receipts and operator reviews append-only',async()=>{
  const first=await campaign();await expect(observer.assess(admin,first.campaign_id,2)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  const receipt=await observer.assess(admin,first.campaign_id,1);
  await observer.review(admin,receipt.id,{verdict:'INSUFFICIENT_EVIDENCE',note:'No real provider search-term observation is available in this fixture.',evidenceReference:'isolated-shadow-fixture'},'shadow-review-test');
  for(const table of ['marketing_campaign_search_targets','marketing_campaign_search_scopes','marketing_search_conflict_assessments','marketing_search_conflict_reviews'])await expect(fixture.pool.query(`DELETE FROM ${table}`)).rejects.toThrow(/append-only/);
 });
 it('records one review on concurrent replay and preserves changed-evidence conflicts',async()=>{
  const first=await campaign(),receipt=await observer.assess(admin,first.campaign_id,1);
  const input={verdict:'INSUFFICIENT_EVIDENCE',note:'This fixture does not contain accepted live auction evidence.',evidenceReference:'isolated-review-evidence'};
  const results=await Promise.all(Array.from({length:4},()=>observer.review(admin,receipt.id,input,'concurrent-review')));
  expect(new Set(results.map(r=>r.id)).size).toBe(1);expect(results.filter(r=>!r.idempotent)).toHaveLength(1);
  await expect(observer.review(admin,receipt.id,{...input,verdict:'FALSE_POSITIVE'},'concurrent-review')).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await expect(observer.review(host,receipt.id,input,'host-review-test')).rejects.toMatchObject({code:'ADMIN_REQUIRED'});
  expect((await fixture.pool.query('SELECT * FROM marketing_search_conflict_reviews')).rowCount).toBe(1);
 });
 it('does not hold a campaign row lock even while recording observation evidence',async()=>{
  const first=await campaign(),client=await fixture.pool.connect();await client.query('BEGIN');await client.query('SELECT * FROM marketing_campaign_workflows WHERE campaign_id=$1 FOR UPDATE',[first.campaign_id]);
  try{await expect(observer.assess(admin,first.campaign_id,1)).resolves.toMatchObject({mode:'SHADOW_ONLY'});}finally{await client.query('ROLLBACK');client.release();}
 });
});
