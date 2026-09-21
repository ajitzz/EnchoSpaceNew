import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {MarketingAttributionLinks} from '../../lib/marketing/portfolio/attribution.js';
import {createWorkflowPgFixture,workflowConfig,workflowDraft} from './workflowPgFixture.js';
import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import {inTransaction} from '../../lib/marketing/database.js';
import {hasOnlyAttributionQuery} from '../../shared/marketingAttribution.js';
const origin='https://encho.example',admin={id:90,role:'system' as const},keys={active:'test',keys:{test:Buffer.alloc(32,7).toString('base64url')}};
describe('RFC-M1 opaque signed campaign references',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtime:pg.Pool,workflow:MarketingWorkflowService,links:MarketingAttributionLinks,now:Date;
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();await fixture.pool.query(readFileSync('src/migrations/027_marketing_attribution_links.sql','utf8'));
  await fixture.pool.query(`CREATE ROLE attribution_runtime LOGIN NOSUPERUSER NOBYPASSRLS;GRANT USAGE ON SCHEMA public TO attribution_runtime;
   GRANT SELECT ON users,listings,marketing_campaign_workflows TO attribution_runtime;GRANT SELECT,INSERT ON marketing_attribution_links TO attribution_runtime;`);
  runtime=new pg.Pool({...fixture.pool.options,user:'attribution_runtime',max:5});
  workflow=new MarketingWorkflowService(fixture.pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:new WorkflowFinance(fixture.pool,workflowConfig,new CampaignPaymentGateway(fixture.pool,{origin})),publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:[]});
  links=new MarketingAttributionLinks(runtime,admin,origin,keys,()=>now);
 });
 beforeEach(async()=>{now=new Date('2099-01-01T00:00:00Z');await fixture.reset();});
 afterAll(async()=>{await runtime?.end();await fixture?.close();});
 const campaign=()=>workflow.create({id:10,role:'host'},workflowDraft());
 it('issues one stable opaque reference across simultaneous retries and binds the exact revision/card',async()=>{
  const row=await campaign();const urls=await Promise.all(Array.from({length:10},()=>links.issue(row.campaign_id,1)));
  expect(new Set(urls).size).toBe(1);const url=new URL(urls[0]);expect(hasOnlyAttributionQuery(url)).toBe(true);
  const token=url.searchParams.get('enc_ref')!;expect(token.split('.')).toHaveLength(4);
  expect((await fixture.pool.query('SELECT * FROM marketing_attribution_links')).rows).toHaveLength(1);
  const binding=await links.inspect(token,url.pathname);expect(binding).toMatchObject({campaignId:row.campaign_id,revision:1,hostId:10,listingId:20,provider:'META',assetCard:'primary'});
  expect(await links.issue(row.campaign_id,1,'card-1')).not.toBe(urls[0]);
  await expect(links.issue(row.campaign_id,2)).rejects.toMatchObject({code:'ATTRIBUTION_INVALID'});
 });
 it('rejects forgery, noncanonical signature aliases, origin/path/campaign substitution and expiry',async()=>{
  const row=await campaign(),url=new URL(await links.issue(row.campaign_id,1)),token=url.searchParams.get('enc_ref')!;
  await expect(links.inspect(token.slice(0,-1)+(token.endsWith('A')?'B':'A'),url.pathname)).rejects.toMatchObject({code:'ATTRIBUTION_INVALID'});
  await expect(links.inspect(token,url.pathname+'-other')).rejects.toMatchObject({code:'ATTRIBUTION_INVALID'});
  for(const bad of [url.href+'&host_id=11',url.href.replace(origin,'https://wrong.example'),url.href+'#section'])await expect(inTransaction(runtime,admin,c=>links.verifyLanding(c,{campaignId:row.campaign_id,revision:1,provider:'META',hostId:10,listingId:20,url:bad}))).rejects.toMatchObject({code:'ATTRIBUTION_INVALID'});
  await expect(inTransaction(runtime,admin,c=>links.verifyLanding(c,{campaignId:row.campaign_id,revision:1,provider:'GOOGLE',hostId:10,listingId:20,url:url.href}))).rejects.toMatchObject({code:'ATTRIBUTION_INVALID'});
  now=new Date('2099-03-01T00:00:00Z');await expect(links.inspect(token,url.pathname)).rejects.toMatchObject({code:'ATTRIBUTION_INVALID'});
 });
 it('preserves historical key identity on rotation and does not expose records to either host',async()=>{
  const row=await campaign(),url=new URL(await links.issue(row.campaign_id,1));
  const rotated=new MarketingAttributionLinks(runtime,admin,origin,{active:'next',keys:{...keys.keys,next:Buffer.alloc(32,9).toString('base64url')}},()=>now);
  expect(await rotated.issue(row.campaign_id,1)).toBe(url.href);
  for(const id of [10,11])expect(await inTransaction(runtime,{id,role:'host'},c=>c.query('SELECT * FROM marketing_attribution_links'))).toMatchObject({rowCount:0});
  await expect(fixture.pool.query("UPDATE marketing_attribution_links SET asset_card='card-2'")).rejects.toThrow(/append-only/);
  const forged=new MarketingAttributionLinks(runtime,{id:10,role:'system'},origin,keys,()=>now);await expect(forged.issue(row.campaign_id,1)).rejects.toMatchObject({code:'SERVICE_ACTOR_REQUIRED'});
 });
 it('requires no capture, consent, provider request or financial change to inspect a link',async()=>{
  const row=await campaign(),url=new URL(await links.issue(row.campaign_id,1));
  await links.inspect(url.searchParams.get('enc_ref')!,url.pathname);
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_journals')).rowCount).toBe(0);
  expect((await fixture.pool.query('SELECT * FROM marketing_jobs')).rowCount).toBe(0);
  expect((await workflow.get(row.campaign_id,{id:10,role:'host'})).state).toBe('DRAFT');
 });
});
