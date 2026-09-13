import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createWorkflowPgFixture,workflowConfig,workflowDraft} from './workflowPgFixture.js';
import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {readMarketingConfig} from '../../lib/marketing/config.js';
import {workspaceQuerySchema} from '../../lib/marketing/workspaceQuery.js';
import type {CampaignPaymentGateway} from '../../lib/marketing/payments.js';

describe('Owned campaign and property navigation with real PostgreSQL',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,service:MarketingWorkflowService;
 const host={id:10,role:'host' as const};
 beforeAll(async()=>{fixture=await createWorkflowPgFixture();});afterAll(async()=>fixture?.close());
 beforeEach(async()=>{await fixture.reset();const finance=new WorkflowFinance(fixture.pool,structuredClone(workflowConfig),{} as CampaignPaymentGateway);service=new MarketingWorkflowService(fixture.pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance,publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:[]});});
 it('visits every campaign beyond the first30 despite status updates, without disclosing another host',async()=>{
  const ids:number[]=[];for(let i=0;i<32;i++)ids.push((await service.create(host,workflowDraft({title:`Campaign ${i}`}),`navigation-${i}`)).campaign_id);
  await service.create({id:11,role:'host'},workflowDraft({listingId:21,mediaIds:['101']}),'other-host');
  const first=await service.workspace(host);expect(first.campaigns.map(c=>c.id)).toEqual([...ids].reverse().slice(0,30));expect(first.page.nextCursor).toBe(ids[2]);
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET updated_at=now()+interval '1 day' WHERE campaign_id=$1",[ids[0]]);
  const second=await service.workspace(host,{before:first.page.nextCursor!});expect(second.campaigns.map(c=>c.id)).toEqual([ids[1],ids[0]]);expect(second.page.nextCursor).toBeNull();
  expect(new Set([...first.campaigns,...second.campaigns].map(c=>c.id)).size).toBe(32);
 });
 it('searches all owned campaigns with literal wildcard and injection-shaped input',async()=>{
  const literal=await service.create(host,workflowDraft({title:'Villa 100%_escape'}));
  await service.create(host,workflowDraft({title:'Villa 100 percent escape'}));
  expect((await service.workspace(host,{search:'%_'})).campaigns.map(c=>c.id)).toEqual([literal.campaign_id]);
  expect((await service.workspace(host,{search:"' OR 1=1 --"})).campaigns).toEqual([]);
  expect((await service.workspace(host,{search:String(literal.campaign_id)})).campaigns.map(c=>c.id)).toContain(literal.campaign_id);
 });
 it('filters review and operational exceptions in the database',async()=>{
  const review=await service.create(host,workflowDraft({title:'Needs a review'})),failed=await service.create(host,workflowDraft({title:'Needs recovery'}));
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PENDING_ADMIN' WHERE campaign_id=$1",[review.campaign_id]);
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='FAILED',last_error='PROVIDER_FAILURE' WHERE campaign_id=$1",[failed.campaign_id]);
  expect((await service.workspace(host,{filter:'review'})).campaigns.map(c=>c.id)).toEqual([review.campaign_id]);
  expect((await service.workspace(host,{filter:'exceptions'})).campaigns.map(c=>c.id)).toEqual([failed.campaign_id]);
 });
 it('paginates properties and retains current approved media for campaigns outside the picker page',async()=>{
  const row=await service.create(host,workflowDraft());
  await fixture.pool.query("INSERT INTO listings(id,user_id,title,slug,publication_status) SELECT n,10,'Property '||n,'property-'||n,'published' FROM generate_series(100,155) n");
  const first=await service.workspace(host);expect(first.listings).toHaveLength(50);expect(first.listings.some(l=>l.id===20)).toBe(false);
  expect(first.campaignListings.find(l=>l.id===20)?.media.map(m=>m.id)).toEqual(['100']);
  const second=await service.workspace(host,{listingBefore:first.listingPage.nextCursor!});expect(second.listings).toHaveLength(7);expect(second.listingPage.nextCursor).toBeNull();
  const matching=await service.workspace(host,{listingSearch:'Property 105'});expect(matching.listings.map(l=>l.id)).toEqual([105]);expect(matching.campaigns[0].id).toBe(row.campaign_id);
 });
 it('replays committed create intents during lookup outages and validates new writes before persistence',async()=>{
  const validate=vi.fn(async()=>{});service.options.validateTargeting=validate;
  const draft=workflowDraft(),saved=await service.create(host,draft,'stable-intent');
  validate.mockRejectedValue(new Error('Fixture metadata outage'));
  expect((await service.create(host,draft,'stable-intent')).campaign_id).toBe(saved.campaign_id);expect(validate).toHaveBeenCalledTimes(1);
  await expect(service.create(host,{...draft,title:'Changed intent'},'stable-intent')).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await expect(service.create({id:11,role:'host'},draft,'other-intent')).rejects.toMatchObject({code:'LISTING_NOT_AVAILABLE'});expect(validate).toHaveBeenCalledTimes(1);
  await expect(service.create(host,draft,'new-intent')).rejects.toThrow('Fixture metadata outage');
  expect((await fixture.pool.query('SELECT count(*)::int n FROM marketing_campaign_workflows')).rows[0].n).toBe(1);
 });
});
describe('Navigation and integration configuration boundary',()=>{
 it.each([{before:'1 OR 1=1'},{before:-2},{search:'x'.repeat(101)},{filter:'any'},{hostId:11},{listingBefore:1.1}])('rejects malformed or unsupported query %j',query=>expect(workspaceQuerySchema.safeParse(query).success).toBe(false));
 it('requires distinct settlement administrators and rejects credential-bearing document origins',()=>{
  const valid={...workflowConfig,settlement:{operatorIds:[90,91],policyReference:'reviewed-accounting-close'},conversions:{google:{customerId:'1234567890',conversionActionId:'5'}}};
  expect(readMarketingConfig(JSON.stringify(valid)).settlement?.operatorIds).toEqual([90,91]);
  for(const settlement of [{...valid.settlement,operatorIds:[90,90]},{...valid.settlement,documentOrigins:{ACCOUNTANT:['https://secret@accounting.example']}}])expect(()=>readMarketingConfig(JSON.stringify({...valid,settlement}))).toThrow();
 });
});
