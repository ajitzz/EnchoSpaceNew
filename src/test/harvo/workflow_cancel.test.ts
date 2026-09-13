import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import type pg from 'pg';
import {createWorkflowPgFixture,workflowConfig,workflowDraft,workflowPolicy} from './workflowPgFixture.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {MarketingFinanceService,authorizeSpending} from '../../lib/marketing/financeService.js';
import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {MarketingEngine} from '../../lib/marketing/engine.js';
import {inTransaction} from '../../lib/marketing/database.js';
import {enqueue} from '../../lib/marketing/jobs.js';
import {ProviderOperationStore,type ProviderAuthorizationGuard} from '../../lib/providers/ProviderOperationStore.js';
import type {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import type {ProviderPublishRequest} from '../../lib/providers/types.js';
import type {AdProvider} from '../../lib/providers/AdProvider.js';

const host={id:10,role:'host' as const},admin={id:90,role:'admin' as const};
const reason='The campaign cannot be published with the configured provider account.';
describe('HARVO cancellation only before any provider submission',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,bridge:WorkflowFinance,workflow:MarketingWorkflowService;
 const gateway={} as CampaignPaymentGateway;
 beforeAll(async()=>{fixture=await createWorkflowPgFixture();});
 afterAll(async()=>{await fixture?.close();});
 beforeEach(async()=>{
  await fixture.reset();await new MarketingFinanceService(fixture.pool,{actorContext:admin}).persistPolicy(workflowPolicy,admin.id);
  bridge=new WorkflowFinance(fixture.pool,structuredClone(workflowConfig),gateway);
  workflow=new MarketingWorkflowService(fixture.pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:bridge,publishingEnabled:true,activationEnabled:true,fundingEnabled:true,configurationReasons:[]});
  vi.spyOn(console,'error').mockImplementation(()=>undefined);
 });
 async function funded(reserve=true){
  let row=await workflow.create(host,workflowDraft());await workflow.evaluate(row.campaign_id,host,1);
  await workflow.review(row.campaign_id,admin,{revision:1,decision:'APPROVE',note:'Manual review of actual property media and policy.',mediaConfirmed:true,policyConfirmed:true});
  row=await workflow.quote(row.campaign_id,host,1,'quote');
  await new MarketingFinanceService(fixture.pool,{actorContext:{id:90,role:'system'},fundingEnabled:true,verifyCapture:async()=>({provider:'RAZORPAY',accountId:'isolated-recipient',paymentId:`pay_Cancel${row.campaign_id}`,orderId:`order-${row.campaign_id}`,eventId:`event-${row.campaign_id}`,quoteId:row.quote_id,currency:'INR',amountMinor:'105000',payloadHash:'a'.repeat(64),capturedAt:new Date(Date.now()-25*3600000).toISOString()})}).recordVerifiedCapture({});
  if(reserve)await workflow.schedule(row.campaign_id,admin,1,'PUBLISH','publication');
  return workflow.get(row.campaign_id,host);
 }
 const balances=async()=>(await fixture.pool.query('SELECT available_minor,reserved_minor,refund_pending_minor FROM marketing_finance_accounts WHERE host_id=10')).rows[0];
 async function expectReserveIntact(row:any){expect(await balances()).toMatchObject({available_minor:'0',reserved_minor:'105000'});expect((await workflow.get(row.campaign_id,host)).state).not.toBe('CANCELLED');expect((await fixture.pool.query("SELECT id FROM marketing_finance_journals WHERE kind='UNSUBMITTED_CANCELLATION'")).rows).toHaveLength(0);}
 it('cancels an unfunded draft without inventing money or external refund evidence',async()=>{
  const row=await workflow.create(host,workflowDraft());const result=await bridge.cancelBeforeProvider(row,host,'cancel-draft',reason);
  expect(result).toMatchObject({state:'CANCELLED',pending_job_id:null});
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_accounts')).rows).toHaveLength(0);
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_journals')).rows).toHaveLength(0);
  await expect(workflow.evaluate(row.campaign_id,host,1)).rejects.toMatchObject({code:'CAMPAIGN_LOCKED'});
 });
 it('keeps already captured unreserved funds available for a separately requested original-payment refund',async()=>{
  const row=await funded(false);const result=await bridge.cancelBeforeProvider(row,host,'cancel-captured',reason);
  expect(result.state).toBe('CANCELLED');expect(await balances()).toMatchObject({available_minor:'105000',reserved_minor:'0'});
  expect((await bridge.snapshot(result)).funding.refundableMinor).toBe('105000');
  expect((await bridge.requestRefund(result,host,'105000','refund-cancelled',reason)).status).toBe('REQUESTED');
 });
 it('recovers a reserved publication that failed before the provider adapter made any claim',async()=>{
  const row=await funded();const engine=new MarketingEngine(fixture.pool,workflow,workflowConfig,gateway,()=>{throw Object.assign(new Error('Configuration is absent'),{code:'PROVIDER_NOT_CONFIGURED'});});
  expect(await engine.runOnce()).toBe(false);expect((await workflow.get(row.campaign_id,host)).state).toBe('RECONCILIATION_REQUIRED');
  const result=await bridge.cancelBeforeProvider(row,host,'cancel-preflight',reason);
  expect(result).toMatchObject({state:'CANCELLED',pending_job_id:null});expect(await balances()).toMatchObject({available_minor:'105000',reserved_minor:'0',refund_pending_minor:'0'});
  expect((await bridge.snapshot(result)).funding).toMatchObject({status:'RELEASED',refundableMinor:'105000',released:false});
  expect((await fixture.pool.query('SELECT status,settlement_snapshot FROM marketing_finance_reservations')).rows[0]).toMatchObject({status:'RELEASED',settlement_snapshot:{kind:'UNSUBMITTED_CANCELLATION',returnedMinor:'105000'}});
  expect((await fixture.pool.query("SELECT account,side,amount_minor FROM marketing_finance_lines l JOIN marketing_finance_journals j ON j.id=l.journal_id WHERE j.kind='UNSUBMITTED_CANCELLATION' ORDER BY side")).rows).toEqual([{account:'HOST_AVAILABLE',side:'CREDIT',amount_minor:'105000'},{account:'CAMPAIGN_RESERVED',side:'DEBIT',amount_minor:'105000'}]);
  expect((await fixture.pool.query("SELECT state,last_error FROM marketing_jobs WHERE kind='PUBLISH'")).rows[0]).toEqual({state:'DEAD',last_error:'CAMPAIGN_CANCELLED_BEFORE_PROVIDER'});
 });
 it('serializes repeated cancellations and binds one immutable reason to the request',async()=>{
  const row=await funded();const results=await Promise.all(Array.from({length:8},()=>bridge.cancelBeforeProvider(row,host,'same-cancellation',reason)));
  expect(results.every(r=>r.state==='CANCELLED')).toBe(true);
  expect((await fixture.pool.query("SELECT id FROM marketing_finance_journals WHERE kind='UNSUBMITTED_CANCELLATION'")).rows).toHaveLength(1);
  expect((await fixture.pool.query("SELECT id FROM marketing_workflow_events WHERE event_type='CAMPAIGN_CANCELLED_BEFORE_PROVIDER'")).rows).toHaveLength(1);
  await expect(bridge.cancelBeforeProvider(row,host,'same-cancellation','A materially different reason for cancelling.')).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 });
 it.each(['META','GOOGLE'])('refuses even a failed %s provider claim with no external ID',async provider=>{
  const row=await funded();await fixture.pool.query("INSERT INTO provider_publishing_transactions(campaign_id,provider,operation_type,idempotency_key,publish_status) VALUES($1,$2,'CREATE_HIERARCHY','existing-claim','FAILED')",[row.campaign_id,provider]);
  await expect(bridge.cancelBeforeProvider(row,host,'claimed-cancel',reason)).rejects.toMatchObject({code:'FINANCE_PROVIDER_FINALITY_REQUIRED'});await expectReserveIntact(row);
 });
 it.each(['entity','legacy','authorization','activation','paused','truth'])('refuses possible external history represented by %s',async evidence=>{
  const row=await funded();
  if(evidence==='entity')await fixture.pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id) VALUES($1,'META','CAMPAIGN','123456789')",[row.campaign_id]);
  if(evidence==='legacy')await fixture.pool.query("INSERT INTO meta_publishing_transactions(campaign_id,idempotency_key,correlation_id,publish_status) VALUES($1,'legacy-attempt','legacy-correlation','FAILED')",[row.campaign_id]);
  if(evidence==='authorization')await inTransaction(fixture.pool,host,c=>authorizeSpending(c,{reservationId:row.reservation_id,campaignId:row.campaign_id,hostId:10,revision:'1',provider:'META',accountId:'123456789',amountMinor:'90000',idempotencyKey:'existing-authorization'}));
  if(evidence==='activation')await enqueue(fixture.pool,{campaignId:row.campaign_id,revision:1,kind:'ACTIVATE',key:'prior-activation'});
  if(evidence==='paused')await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PAUSED' WHERE campaign_id=$1",[row.campaign_id]);
  if(evidence==='truth')await fixture.pool.query("UPDATE marketing_campaign_workflows SET provider_truth='{}' WHERE campaign_id=$1",[row.campaign_id]);
  await expect(bridge.cancelBeforeProvider(row,host,'unsafe-cancel',reason)).rejects.toMatchObject({code:'FINANCE_PROVIDER_FINALITY_REQUIRED'});await expectReserveIntact(row);
 });
 it('rejects a different host or stale revision before touching funds',async()=>{
  const row=await funded();await expect(bridge.cancelBeforeProvider(row,{id:11,role:'host'},'foreign-owner',reason)).rejects.toMatchObject({code:'CAMPAIGN_NOT_FOUND'});
  await expect(bridge.cancelBeforeProvider({...row,revision:2},host,'stale-revision',reason)).rejects.toMatchObject({code:'REVISION_CONFLICT'});await expectReserveIntact(row);
 });
 it('rolls back reserve release and worker fencing when the immutable audit cannot be recorded',async()=>{
  const row=await funded();const oldJob=(await fixture.pool.query("SELECT fence,state FROM marketing_jobs WHERE kind='PUBLISH'")).rows[0];
  await fixture.pool.query("CREATE FUNCTION harvo_test_cancel_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='CAMPAIGN_CANCELLED_BEFORE_PROVIDER' THEN RAISE EXCEPTION 'isolated cancellation audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER harvo_test_cancel_audit_failure BEFORE INSERT ON marketing_workflow_events FOR EACH ROW EXECUTE FUNCTION harvo_test_cancel_audit_failure()");
  try{await expect(bridge.cancelBeforeProvider(row,host,'rollback-cancel',reason)).rejects.toThrow(/isolated cancellation audit failure/);}
  finally{await fixture.pool.query('DROP TRIGGER harvo_test_cancel_audit_failure ON marketing_workflow_events; DROP FUNCTION harvo_test_cancel_audit_failure()');}
  await expectReserveIntact(row);expect((await fixture.pool.query("SELECT fence,state FROM marketing_jobs WHERE kind='PUBLISH'")).rows[0]).toEqual(oldJob);
 });
 function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
 async function raceEngine(row:any,claimFirst:boolean){
  const reached=deferred(),continueWorker=deferred(),send=vi.fn();let guard:ProviderAuthorizationGuard;
  const adapter={createCampaignHierarchy:async(request:ProviderPublishRequest,pool:pg.Pool)=>{
   const claim=()=>new ProviderOperationStore(pool).claim({campaignId:request.campaignId,provider:'META',operation:'CREATE_HIERARCHY',fingerprint:'b'.repeat(64),idempotencyKey:request.idempotencyKey,correlationId:request.correlationId},request,guard);
   if(claimFirst)await claim();reached.resolve();await continueWorker.promise;if(!claimFirst)await claim();send();
   return {success:true,provider:'META',externalCampaignId:'123456789'};
  }} as AdProvider;
  const engine=new MarketingEngine(fixture.pool,workflow,workflowConfig,gateway,(_row,authorize)=>{guard=authorize;return adapter;});
  const running=engine.runOnce();await reached.promise;
  try{
   if(claimFirst)await expect(bridge.cancelBeforeProvider(row,host,'race-cancel',reason)).rejects.toMatchObject({code:'FINANCE_PROVIDER_FINALITY_REQUIRED'});
   else expect((await bridge.cancelBeforeProvider(row,host,'race-cancel',reason)).state).toBe('CANCELLED');
  }finally{continueWorker.resolve();}
  await running;return send;
 }
 it('a cancellation that wins the parent lock fences a stale worker before any remote send',async()=>{
  const row=await funded();const send=await raceEngine(row,false);expect(send).not.toHaveBeenCalled();
  expect((await workflow.get(row.campaign_id,host)).state).toBe('CANCELLED');expect(await balances()).toMatchObject({available_minor:'105000',reserved_minor:'0'});
  expect((await fixture.pool.query('SELECT * FROM provider_publishing_transactions')).rows).toHaveLength(0);
 });
 it('a provider claim that wins the parent lock prevents cancellation even before its remote send returns',async()=>{
  const row=await funded();const send=await raceEngine(row,true);expect(send).toHaveBeenCalledOnce();await expectReserveIntact(row);
 });
});
