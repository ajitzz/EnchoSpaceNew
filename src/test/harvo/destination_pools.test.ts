import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {DestinationPools,poolPolicy} from '../../lib/marketing/portfolio/pools.js';
import {CanonicalMarketingFacts} from '../../lib/marketing/portfolio/facts.js';
import {MarketingFinanceService} from '../../lib/marketing/financeService.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import {createWorkflowPgFixture,workflowDraft,workflowConfig,workflowPolicy} from './workflowPgFixture.js';
import {inTransaction} from '../../lib/marketing/database.js';
const admin={id:90,role:'admin' as const},host={id:10,role:'host' as const},other={id:11,role:'host' as const};
const day=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
const flight=()=>({destination:'wayanad',title:'Considered Wayanad stays',startsAt:day(-2)+'T00:00:00+05:30',endsAt:day(14)+'T23:59:59+05:30',stayStart:day(20),stayEnd:day(23)});
describe('HARVO-033 destination contributions and fair collection exposure',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtime:pg.Pool,pools:DestinationPools,facts:CanonicalMarketingFacts,finance:WorkflowFinance,workflow:MarketingWorkflowService;
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();await fixture.pool.query('ALTER TABLE listings ADD COLUMN amenities JSONB;ALTER TABLE room_types ADD COLUMN name TEXT,ADD COLUMN description TEXT,ADD COLUMN amenities JSONB');
  for(const name of ['014_harvo_marketing_request_limits.sql','023_marketing_product_facts.sql','029_marketing_destination_pools.sql'])await fixture.pool.query(readFileSync('src/migrations/'+name,'utf8'));
  await fixture.pool.query(`CREATE ROLE pools_runtime LOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO pools_runtime; GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO pools_runtime;GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO pools_runtime`);
  runtime=new pg.Pool({...fixture.pool.options,user:'pools_runtime',max:12});facts=new CanonicalMarketingFacts(runtime);pools=new DestinationPools(runtime,{id:90,role:'system'},facts,{META:'123456'});
  finance=new WorkflowFinance(runtime,workflowConfig,new CampaignPaymentGateway(runtime,{origin:workflowConfig.origin}),(c,row)=>pools.quoteProduct(c,row));
  workflow=new MarketingWorkflowService(runtime,{guardDedicated:(c,row)=>pools.guardCampaign(c,row),finance,ai:new CampaignAiReviewer({mediaOrigins:new Set()}),publishingEnabled:true,activationEnabled:true,fundingEnabled:false,configurationReasons:[]});
 });
 beforeEach(async()=>{
  await fixture.reset();await fixture.pool.query("INSERT INTO room_types(id,listing_id,currency,name) VALUES(30,20,'INR','Garden room'),(31,21,'INR','Courtyard room')");
  await fixture.pool.query("INSERT INTO inventory_days SELECT listing_id,id,d::date,2,0,0,0 FROM room_types CROSS JOIN generate_series($1::date,$2::date-1,'1 day') d",[flight().stayStart,flight().stayEnd]);
  await new MarketingFinanceService(runtime,{actorContext:admin}).persistPolicy(workflowPolicy,90);
 });
 afterAll(async()=>{await runtime?.end();await fixture?.close();});
 async function create(destination='wayanad'){const p=await pools.create(admin,{...flight(),destination},randomUUID());await pools.setState(admin,p.id,{state:'OPEN',version:1,reason:'Open this verified staging flight'},randomUUID());return p.id;}
 async function member(poolId:string,actor=host,amount='100000'){
  const listingId=actor.id===10?20:21,mediaId=actor.id===10?'100':'101';
  const invite=await pools.invite(admin,poolId,{listingId},randomUUID());
  const draft=workflowDraft({listingId,mediaIds:[mediaId],mediaBudgetMinor:amount,startDate:day(-2),endDate:day(14),stayStartDate:flight().stayStart,stayEndDate:flight().stayEnd});const row=await workflow.create(actor,draft);
  await fixture.pool.query(`UPDATE marketing_campaign_workflows SET state='APPROVED',content_approval='{"status":"APPROVED","revision":1}' WHERE campaign_id=$1`,[row.campaign_id]);
  await pools.consent(actor,invite.id,{version:1,campaignId:row.campaign_id,campaignRevision:1,policyVersion:1,disclosureAccepted:true},randomUUID());
  await pools.review(admin,invite.id,{version:2,factHash:(await facts.preview(admin,listingId)).factHash,verifiedVilla:true,verifiedDestination:true,reason:'Fixture-only independent property and destination eligibility'},randomUUID());
  await workflow.quote(row.campaign_id,actor,1,randomUUID());const current=await workflow.get(row.campaign_id,actor);const q=(await fixture.pool.query('SELECT * FROM marketing_finance_quotes WHERE id=$1',[current.quote_id])).rows[0];
  await new MarketingFinanceService(runtime,{actorContext:admin,fundingEnabled:true,verifyCapture:async()=>({provider:'RAZORPAY',accountId:'fixture-account',eventId:randomUUID(),paymentId:randomUUID(),orderId:randomUUID(),quoteId:q.id,currency:'INR',amountMinor:q.total_minor,payloadHash:'a'.repeat(64),capturedAt:new Date(Date.now()-25*3600000).toISOString()})}).recordVerifiedCapture({});
  await pools.activateMember(actor,invite.id,randomUUID(),(c,r)=>finance.reserveLocked(c,r,'pool-test'));
  return {id:invite.id,campaignId:row.campaign_id,draft};
 }
 it('validates commercial policy, exact owner consent and a previously unfunded plan',async()=>{
  expect(poolPolicy).toMatchObject({minimumContributionMinor:'100000',maximumDailyPoolSpendMinor:'1000000',providerImpressionGuarantee:false,transferable:false});
  await expect(pools.create(host,flight(),randomUUID())).rejects.toMatchObject({code:'POOL_ACCESS_DENIED'});
  const id=await create(),inv=await pools.invite(admin,id,{listingId:20},randomUUID());
  await expect(pools.consent(other,inv.id,{version:1,campaignId:123,campaignRevision:1,policyVersion:1,disclosureAccepted:true},randomUUID())).rejects.toThrow();
  expect((await pools.list(other)).pools).toHaveLength(0);
 });
 it('binds a distinct quote/reservation and blocks dedicated publishing or editing after pool consent',async()=>{
  const id=await create(),m=await member(id);
  const row=await workflow.get(m.campaignId,host);expect(row.reservation_id).toBeTruthy();
  const q=(await fixture.pool.query('SELECT snapshot FROM marketing_finance_quotes WHERE id=$1',[row.quote_id])).rows[0].snapshot;
  expect(q.product).toMatchObject({kind:'DESTINATION_POOL',poolId:id,membershipId:m.id,contributionMinor:'100000'});
  await expect(workflow.schedule(m.campaignId,admin,1,'PUBLISH','must-not-publish')).rejects.toMatchObject({code:'POOL_SEPARATE_PRODUCT'});
  await expect(workflow.update(m.campaignId,host,1,m.draft)).rejects.toThrow();
  expect((await fixture.pool.query('SELECT * FROM provider_publishing_transactions')).rowCount).toBe(0);
 });
 it('rotates weighted placement 1:2 and pauses occupied inventory without moving either wallet',async()=>{
  const id=await create(),a=await member(id),b=await member(id,other,'200000');await pools.setState(admin,id,{state:'ACTIVE',version:2,reason:'Start bounded collection staging'},randomUUID());
  const before=(await fixture.pool.query('SELECT host_id,available_minor,reserved_minor FROM marketing_finance_accounts ORDER BY host_id')).rows;
  for(let i=0;i<12;i++)await pools.collection('wayanad');
  expect((await fixture.pool.query('SELECT membership_id,count(*)::int AS n FROM marketing_pool_exposures GROUP BY membership_id ORDER BY n')).rows).toEqual([{membership_id:a.id,n:4},{membership_id:b.id,n:8}]);
  await fixture.pool.query('UPDATE inventory_days SET booked_units=total_units WHERE listing_id=20');
  const page=await pools.collection('wayanad');expect(page.items.map((i:any)=>i.path)).toEqual(['/stay/other-villa-21']);
  expect((await pools.list(host)).pools[0].members[0].state).toBe('PAUSED');
  expect((await fixture.pool.query('SELECT host_id,available_minor,reserved_minor FROM marketing_finance_accounts ORDER BY host_id')).rows).toEqual(before);
  expect((await fixture.pool.query('SELECT * FROM marketing_pool_spend_claims')).rowCount).toBe(0);
 });
 it('serializes daily spend claims, preserves unknown-operation capacity and enforces each host cap',async()=>{
  const id=await create(),a=await member(id,host,'1500000');await pools.setState(admin,id,{state:'ACTIVE',version:2,reason:'Start bounded spending-authority test'},randomUUID());
  const calls=await Promise.allSettled(Array.from({length:3},()=>pools.claimSpend(admin,a.id,{amountMinor:'400000',provider:'META'},randomUUID())));
  expect(calls.filter(r=>r.status==='fulfilled')).toHaveLength(2);expect(calls.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((await fixture.pool.query('SELECT sum(amount_minor)::text AS total FROM marketing_pool_spend_claims')).rows[0].total).toBe('800000');
  const key=randomUUID();await pools.claimSpend(admin,a.id,{amountMinor:'100000',provider:'META'},key);await pools.claimSpend(admin,a.id,{amountMinor:'100000',provider:'META'},key);
  expect((await fixture.pool.query('SELECT sum(amount_minor)::text AS total FROM marketing_pool_spend_claims')).rows[0].total).toBe('900000');
  await expect(pools.claimSpend(host,a.id,{amountMinor:'1',provider:'META'},randomUUID())).rejects.toMatchObject({code:'POOL_ACCESS_DENIED'});
 });
 it('requires fresh inventory before resuming and never changes funds during pause or resume',async()=>{
  const id=await create(),a=await member(id);await pools.pauseMember(host,a.id,randomUUID());
  const before=(await fixture.pool.query('SELECT * FROM marketing_finance_accounts')).rows;
  await fixture.pool.query('UPDATE inventory_days SET booked_units=total_units WHERE listing_id=20');
  await expect(pools.resumeMember(host,a.id,randomUUID())).rejects.toMatchObject({code:'INVENTORY_UNAVAILABLE'});
  await expect(pools.resumeMember(other,a.id,randomUUID())).rejects.toMatchObject({code:'MEMBERSHIP_NOT_FOUND'});
  await fixture.pool.query('UPDATE inventory_days SET booked_units=0 WHERE listing_id=20');
  const key=randomUUID();expect(await pools.resumeMember(host,a.id,key)).toMatchObject({state:'ACTIVE'});
  expect(await pools.resumeMember(host,a.id,key)).toMatchObject({state:'ACTIVE'});
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_accounts')).rows).toEqual(before);
  await expect(pools.withdrawMember(host,a.id,randomUUID())).rejects.toMatchObject({code:'POOL_SETTLEMENT_REQUIRED'});
 });
 it('withdraws an unfunded invitation and refuses deployment funding before a pool publisher exists',async()=>{
  const id=await create(),inv=await pools.invite(admin,id,{listingId:20},randomUUID());
  const key=randomUUID();expect(await pools.withdrawMember(host,inv.id,key)).toMatchObject({state:'WITHDRAWN'});
  expect(await pools.withdrawMember(host,inv.id,key)).toMatchObject({state:'WITHDRAWN'});
  expect(()=>pools.assertExecutionAvailable()).toThrow(/provider publication and spend settlement/);
  expect((await pools.list(host)).capabilities).toMatchObject({funding:false,activation:false});
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_reservations')).rowCount).toBe(0);
 });
 it('keeps dedicated quote authority independent while deployment blocks a consented pool plan',async()=>{
  const draft=workflowDraft({mediaBudgetMinor:'100000',startDate:day(-2),endDate:day(14),stayStartDate:flight().stayStart,stayEndDate:flight().stayEnd});
  const row=await workflow.create(host,draft);
  await fixture.pool.query(`UPDATE marketing_campaign_workflows SET state='APPROVED',content_approval='{"status":"APPROVED","revision":1}' WHERE campaign_id=$1`,[row.campaign_id]);
  const dedicated=await workflow.get(row.campaign_id,host);
  expect(await inTransaction(runtime,admin,async c=>{await pools.guardCampaign(c,dedicated);return pools.executionQuoteProduct(c,dedicated);})).toBeUndefined();
  const poolId=await create(),invite=await pools.invite(admin,poolId,{listingId:20},randomUUID());
  await pools.consent(host,invite.id,{version:1,campaignId:row.campaign_id,campaignRevision:1,policyVersion:1,disclosureAccepted:true},randomUUID());
  await expect(inTransaction(runtime,admin,c=>pools.executionQuoteProduct(c,dedicated))).rejects.toMatchObject({code:'POOL_EXECUTION_UNAVAILABLE'});
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_quotes')).rowCount).toBe(0);
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_reservations')).rowCount).toBe(0);
 });
 it.each(['wayanad','coorg','goa'])('stages %s with independent occupancy maintenance and no wallet debit',async(destination)=>{
  const id=await create(destination),a=await member(id);await pools.setState(admin,id,{state:'ACTIVE',version:2,reason:'Isolated corridor staging only'},randomUUID());
  const before=(await fixture.pool.query('SELECT * FROM marketing_finance_accounts')).rows;
  await fixture.pool.query('UPDATE inventory_days SET booked_units=total_units WHERE listing_id=20');
  expect(await pools.sweepEligibility()).toMatchObject({paused:1,expired:0});
  expect((await pools.list(host)).pools[0].members[0]).toMatchObject({id:a.id,state:'PAUSED'});
  expect((await pools.collection(destination)).items).toEqual([]);
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_accounts')).rows).toEqual(before);
  expect((await fixture.pool.query('SELECT * FROM provider_publishing_transactions')).rowCount).toBe(0);
 });
 it('keeps tenant data and financial evidence inaccessible to other hosts under non-bypass RLS',async()=>{
  const id=await create(),a=await member(id);await pools.setState(admin,id,{state:'ACTIVE',version:2,reason:'Open privacy verification flight'},randomUUID());await pools.collection('wayanad');
  for(const table of ['marketing_destination_pools','marketing_pool_memberships','marketing_pool_events','marketing_pool_exposures'])expect((await inTransaction(runtime,other,c=>c.query(`SELECT * FROM ${table}`))).rowCount).toBe(0);
  await expect(inTransaction(runtime,other,c=>c.query("UPDATE marketing_pool_memberships SET state='ACTIVE' WHERE id=$1",[a.id]))).resolves.toMatchObject({rowCount:0});
  await expect(fixture.pool.query("UPDATE marketing_pool_events SET kind='forged'")).rejects.toThrow(/append-only/);
 });
});
