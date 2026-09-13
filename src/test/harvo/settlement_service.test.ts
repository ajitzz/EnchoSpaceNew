import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createWorkflowPgFixture,workflowDraft} from './workflowPgFixture.js';
import {MarketingWorkflowService,type WorkflowFinancePort} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {authorizeSpending,MarketingFinanceService,type VerifiedCapture} from '../../lib/marketing/financeService.js';
import {testPolicy,testQuoteInput} from './financeFixtures.js';
import {MarketingSettlementService,type SettlementStopObservation,type SettlementOptions} from '../../lib/marketing/settlementService.js';
import type {SettlementDocumentInput,SettlementProposalInput} from '../../lib/marketing/settlementSchemas.js';

const admin={id:90,role:'admin' as const},reviewer={id:91,role:'admin' as const},host={id:10,role:'host' as const};
const policyReference='verified-accounting-close-procedure-2026';
const pdf=(label:string)=>Buffer.from(`%PDF-1.4\nIsolated billing-document test: ${label}\n%%EOF`).toString('base64');
describe('HARVO documentary billing close on real isolated PostgreSQL',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,service:MarketingSettlementService;
 const verifyStopped=vi.fn(async(binding:any):Promise<SettlementStopObservation>=>({...binding,configuredStatus:'PAUSED',observedAt:new Date().toISOString(),evidenceHash:'f'.repeat(64)}));
 const options: SettlementOptions={operatorIds:[90,91],policyReference,providerAccounts:{META:'987654321',GOOGLE:'1234567890'},additionalDocumentOrigins:{ACCOUNTANT:['https://accounting.encho.example']},verifyStopped};
 beforeAll(async()=>{fixture=await createWorkflowPgFixture();await fixture.pool.query(readFileSync(new URL('../../migrations/012_harvo_marketing_settlement.sql',import.meta.url),'utf8'));});
 afterAll(async()=>{await fixture?.close();});
 beforeEach(async()=>{await fixture.reset();await fixture.pool.query("INSERT INTO users VALUES(91,'admin')");await new MarketingFinanceService(fixture.pool,{actorContext:admin}).persistPolicy(testPolicy,90);service=new MarketingSettlementService(fixture.pool,options);verifyStopped.mockReset().mockImplementation(async binding=>({...binding,configuredStatus:'PAUSED',observedAt:new Date().toISOString(),evidenceHash:'f'.repeat(64)}));});
 const balances=async()=>(await fixture.pool.query('SELECT available_minor,reserved_minor FROM marketing_finance_accounts WHERE host_id=10')).rows[0];
 const journals=async()=>(await fixture.pool.query("SELECT * FROM marketing_finance_journals WHERE kind='SETTLEMENT'")).rows;
 async function ready(){
  const workflow=new MarketingWorkflowService(fixture.pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:{} as WorkflowFinancePort,publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:[]});
  const row=await workflow.create(host,workflowDraft({startDate:'2026-08-01',endDate:'2026-08-03'}));
  const finance=new MarketingFinanceService(fixture.pool,{actorContext:host});const costs=[{code:'META_MEDIA',amountMinor:'90000'},{code:'GOOGLE_MEDIA',amountMinor:'0'},{code:'PROCESSING',amountMinor:'9000'},{code:'COST_TAX',amountMinor:'1000'}];
  const quote=await finance.quote(testQuoteInput({campaignId:row.campaign_id,campaignRevision:'1',costs,idempotencyKey:`quote-${row.campaign_id}`}),testPolicy);
  const capture:VerifiedCapture={provider:'RAZORPAY',accountId:'merchant-verified',eventId:`event-${row.campaign_id}`,paymentId:`payment-${row.campaign_id}`,orderId:`order-${row.campaign_id}`,quoteId:quote.id,currency:'INR',amountMinor:quote.totalMinor,payloadHash:'a'.repeat(64),capturedAt:new Date(Date.now()-25*3600000).toISOString()};
  await new MarketingFinanceService(fixture.pool,{actorContext:admin,fundingEnabled:true,verifyCapture:async()=>capture}).recordVerifiedCapture({});
  const reserve=await finance.reserve({quoteId:quote.id,hostId:10,idempotencyKey:`reserve-${row.campaign_id}`});
  const c=await fixture.pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.marketing_admin','true',true)");await authorizeSpending(c,{reservationId:reserve.reservationId,campaignId:row.campaign_id,hostId:10,revision:'1',provider:'META',accountId:'987654321',amountMinor:'90000',idempotencyKey:`spend-${row.campaign_id}`});await c.query('COMMIT');}finally{c.release();}
  const externalCampaignId=String(80000+row.campaign_id);
  await fixture.pool.query("INSERT INTO provider_entities(campaign_id,provider,entity_type,external_id,account_id,configured_status,effective_status,metadata) VALUES($1,'META','CAMPAIGN',$2,'987654321','PAUSED','PAUSED','{}')",[row.campaign_id,externalCampaignId]);
  await fixture.pool.query("UPDATE marketing_campaign_workflows SET state='PAUSED',quote_id=$2,reservation_id=$3,provider_truth=$4 WHERE campaign_id=$1",[row.campaign_id,quote.id,reserve.reservationId,JSON.stringify({externalCampaignId,configuredStatus:'PAUSED'})]);
  return {campaignId:row.campaign_id,revision:1,reservationId:reserve.reservationId,externalCampaignId};
 }
 async function document(overrides:Partial<SettlementDocumentInput>={},uploader=admin){
  const externalDocumentId=overrides.externalDocumentId??`invoice-${randomUUID()}`;
  const value: SettlementDocumentInput={kind:'PROVIDER_INVOICE',issuer:'META',accountId:'987654321',externalDocumentId,currency:'INR',totalMinor:'80000',periodStart:'2026-08-01',periodEnd:'2026-08-03',issuedAt:'2026-08-05T00:00:00.000Z',sourceUrl:'https://business.facebook.com/billing/invoices',description:'Actual invoice and accounting evidence are represented only by isolated test bytes.',contentType:'application/pdf',contentBase64:pdf(externalDocumentId),...overrides};
  return service.uploadDocument(uploader,value,externalDocumentId);
 }
 async function evidence(row:Awaited<ReturnType<typeof ready>>,media='80000',sharedInvoice?:string):Promise<SettlementProposalInput>{
  const invoiceId=sharedInvoice??(await document({totalMinor:media})).id;
  const detail=await document({kind:'CAMPAIGN_BILLING_DETAIL',provider:'META',campaignExternalId:row.externalCampaignId,totalMinor:media});
  const closure=await document({kind:'BILLING_CLOSURE',issuer:'ACCOUNTANT',provider:'META',campaignExternalId:row.externalCampaignId,totalMinor:'0',sourceUrl:'https://accounting.encho.example/closed-period',policyReference});
  const fee=await document({kind:'COST_INVOICE',issuer:'RAZORPAY',accountId:'merchant-verified',sourceUrl:'https://dashboard.razorpay.com/invoices',totalMinor:'9000'});
  const tax=await document({kind:'TAX_STATEMENT',issuer:'ACCOUNTANT',accountId:'encho-accounting',sourceUrl:'https://accounting.encho.example/tax',totalMinor:'1000'});
  const note='Independently allocated against the exact issued billing document.';
  return {campaignId:row.campaignId,revision:1,reservationId:row.reservationId,allocations:[{code:'META_MEDIA',amountMinor:media,invoiceDocumentId:invoiceId,note},{code:'GOOGLE_MEDIA',amountMinor:'0',note:'No Google media was authorized in this exact immutable quote.'},{code:'PROCESSING',amountMinor:'9000',invoiceDocumentId:fee.id,note},{code:'COST_TAX',amountMinor:'1000',invoiceDocumentId:tax.id,note}],remittanceTaxMinor:'0',closures:[{provider:'META',accountId:'987654321',externalCampaignId:row.externalCampaignId,invoiceDocumentIds:[invoiceId],detailDocumentId:detail.id,closureDocumentId:closure.id}],policyReference,note:'Close the completed billing period against retained invoice and campaign detail evidence.'};
 }
 const reviewInput=(proposal:any,extra={})=>({fingerprint:proposal.fingerprint,decision:'APPROVE' as const,note:'Independently checked the provider portal, identity, document lines, allocations and accounting close.',independentVerificationReference:'Independent finance portal verification record by second operator.',checkedDocuments:proposal.snapshot.documents.map((d:any)=>({id:d.id,sha256:d.sha256})),...extra});
 async function approved(media='80000'){const row=await ready(),input=await evidence(row,media),proposal=await service.propose(admin,input,`proposal-${row.campaignId}`);await service.review(reviewer,proposal.id,reviewInput(proposal));return {row,input,proposal};}

 it('requires configured distinct operators and their current persisted administrator role',async()=>{
  await expect(service.list(host)).rejects.toMatchObject({code:'SETTLEMENT_OPERATOR_REQUIRED'});
  await expect(new MarketingSettlementService(fixture.pool,{...options,operatorIds:[90]}).list(admin)).rejects.toMatchObject({code:'SETTLEMENT_OPERATOR_REQUIRED'});
  await fixture.pool.query("UPDATE users SET role='host' WHERE id=90");await expect(service.list(admin)).rejects.toMatchObject({code:'SETTLEMENT_OPERATOR_REQUIRED'});
 });
 it('stores actual immutable bytes and derives its digest instead of accepting a client evidence hash',async()=>{
  const doc=await document({externalDocumentId:'same-issued-invoice'}),again=await document({externalDocumentId:'same-issued-invoice'});expect(again.id).toBe(doc.id);expect(doc).toMatchObject({source:'MANUALLY_SOURCED_DOCUMENT',providerApiVerified:false});
  expect((await service.getDocument(admin,doc.id)).content.toString()).toContain('same-issued-invoice');
  await expect(fixture.pool.query("UPDATE marketing_settlement_documents SET total_minor=0 WHERE id=$1",[doc.id])).rejects.toThrow('IMMUTABLE');
  await expect(document({externalDocumentId:'same-issued-invoice',totalMinor:'70000'})).rejects.toMatchObject({code:'SETTLEMENT_IDEMPOTENCY_CONFLICT'});
 });
 it('returns exact review documents outside the library window and canonical preparation identities',async()=>{
  const row=await ready(),input=await evidence(row),proposal=await service.propose(admin,input,'projection-evidence');
  const list=await service.list(admin);expect(list).toMatchObject({currentOperatorId:90,capabilities:{configured:true}});expect(list.eligibleCampaigns).toContainEqual(expect.objectContaining({campaignId:row.campaignId,reservationId:row.reservationId,accountId:'987654321',currency:'INR',markupBps:500}));
  const detail=await service.get(reviewer,proposal.id);expect(detail.documents).toHaveLength(proposal.snapshot.documents.length);expect(detail.documents.every(d=>!('content' in d)&&!('contentBase64' in d.metadata))).toBe(true);
 });
 it('pages immutable document and proposal history without dropping older records or treating search wildcards as patterns',async()=>{
  const row=await ready(),input=await evidence(row),proposal=await service.propose(admin,input,'history-base'),doc=await document({externalDocumentId:'literal%invoice'});
  await fixture.pool.query(`INSERT INTO marketing_settlement_documents(id,kind,issuer,account_id,external_document_id,currency,total_minor,period_start,period_end,issued_at,content_type,content,content_hash,metadata,uploaded_by,request_key,fingerprint) SELECT gen_random_uuid(),kind,issuer,account_id,'history-'||n,currency,total_minor,period_start,period_end,issued_at,content_type,content,content_hash,metadata,uploaded_by,'history-'||n,fingerprint FROM marketing_settlement_documents CROSS JOIN generate_series(1,32) n WHERE id=$1`,[doc.id]);
  const first=await service.listDocuments(admin),second=await service.listDocuments(admin,{before:first.page.nextCursor!});expect(first.documents).toHaveLength(30);expect(second.documents).toHaveLength(8);expect(new Set([...first.documents,...second.documents].map(d=>d.id)).size).toBe(38);
  expect((await service.listDocuments(admin,{search:'literal%'})).documents.map(d=>d.id)).toEqual([doc.id]);
  await fixture.pool.query(`INSERT INTO marketing_settlement_proposals(id,campaign_id,host_id,revision,reservation_id,snapshot,fingerprint,prepared_by,request_key,status) SELECT gen_random_uuid(),campaign_id,host_id,revision,reservation_id,snapshot,fingerprint,prepared_by,'history-'||n,'REJECTED' FROM marketing_settlement_proposals CROSS JOIN generate_series(1,32) n WHERE id=$1`,[proposal.id]);
  const a=await service.list(admin),b=await service.list(admin,{before:a.page.nextCursor!});expect(a.proposals).toHaveLength(30);expect(b.proposals).toHaveLength(3);expect(new Set([...a.proposals,...b.proposals].map(p=>p.id)).size).toBe(33);expect((await service.list(admin,{search:proposal.id})).proposals.map(p=>p.id)).toEqual([proposal.id]);
  expect((await service.get(reviewer,proposal.id)).documents).toHaveLength(proposal.snapshot.documents.length);
 });
 it('enforces financial evidence RLS for a nonowner database role',async()=>{
  const row=await ready(),input=await evidence(row);await service.propose(admin,input,'rls-evidence');
  await fixture.pool.query('CREATE ROLE harvo_settlement_reader');await fixture.pool.query('GRANT USAGE ON SCHEMA public TO harvo_settlement_reader');await fixture.pool.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO harvo_settlement_reader');
  const c=await fixture.pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE harvo_settlement_reader');await c.query("SELECT set_config('app.current_user_id','11',true),set_config('app.marketing_admin','false',true)");
   expect((await c.query('SELECT * FROM marketing_settlement_proposals')).rows).toHaveLength(0);expect((await c.query('SELECT * FROM marketing_settlement_documents')).rows).toHaveLength(0);
   await c.query("SELECT set_config('app.current_user_id','10',true)");expect((await c.query('SELECT * FROM marketing_settlement_proposals')).rows).toHaveLength(1);expect((await c.query('SELECT * FROM marketing_settlement_documents')).rows).toHaveLength(0);await c.query('COMMIT');
  }finally{await c.query('ROLLBACK');c.release();}
  expect((await fixture.pool.query("SELECT relname FROM pg_class WHERE relname LIKE 'marketing_settlement_%' AND relkind='r' AND (NOT relrowsecurity OR NOT relforcerowsecurity)")).rows).toHaveLength(0);
 });
 it.each([{sourceUrl:'https://attacker.example/invoice'},{sourceUrl:'https://ads.google.com/#access_token=private',issuer:'GOOGLE' as const},{contentBase64:Buffer.from('pretend pdf').toString('base64')},{issuedAt:'2099-01-01T00:00:00.000Z'}])('rejects invalid documentary provenance or issuance %j',async extra=>{await expect(document(extra)).rejects.toBeTruthy();expect((await fixture.pool.query('SELECT * FROM marketing_settlement_documents')).rows).toHaveLength(0);});
 it('settles only after independent review and preserves exact cost-plus math and original reserve',async()=>{
  const {row,input,proposal}=await approved();const result=await service.settle(admin,proposal.id,{fingerprint:proposal.fingerprint},'settle-valid');
  expect(result).toMatchObject({actualCostMinor:'90000',chargedCostMinor:'90000',profitMinor:'4500',returnedMinor:'10500',platformOverrunMinor:'0',providerAbsoluteFinality:false});expect(await balances()).toMatchObject({available_minor:'10500',reserved_minor:'0'});expect(await journals()).toHaveLength(1);
  expect((await service.hostSummary(host,row.campaignId)).status).toBe('SETTLED');await expect(service.hostSummary({id:11,role:'host'},row.campaignId)).rejects.toMatchObject({code:'CAMPAIGN_NOT_FOUND'});
  const c=await fixture.pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.marketing_admin','true',true)");await expect(authorizeSpending(c,{reservationId:row.reservationId,campaignId:row.campaignId,hostId:10,revision:'1',provider:'META',accountId:'987654321',amountMinor:'90000',idempotencyKey:'late-activation'})).rejects.toMatchObject({code:'FINANCE_AUTHORIZATION_BLOCKED'});await c.query('ROLLBACK');}finally{c.release();}
  expect(input.allocations[0].amountMinor).toBe('80000');
 });
 it('requires independent actual document review; self-approval or missing hashes never release money',async()=>{
  const row=await ready(),input=await evidence(row),proposal=await service.propose(admin,input,'dual-control');
  await expect(service.review(admin,proposal.id,reviewInput(proposal))).rejects.toMatchObject({code:'SETTLEMENT_DUAL_CONTROL'});
  await expect(service.review(reviewer,proposal.id,reviewInput(proposal,{checkedDocuments:[]}))).rejects.toBeTruthy();
  await expect(service.settle(admin,proposal.id,{fingerprint:proposal.fingerprint},'no-review')).rejects.toMatchObject({code:'SETTLEMENT_REVIEW_REQUIRED'});expect(await journals()).toHaveLength(0);
 });
 it('invalidates financial review after operator demotion or evidence drift',async()=>{
  const {proposal}=await approved();await fixture.pool.query("UPDATE users SET role='host' WHERE id=91");await expect(service.settle(admin,proposal.id,{fingerprint:proposal.fingerprint},'demoted-review')).rejects.toMatchObject({code:'SETTLEMENT_DUAL_CONTROL'});expect(await balances()).toMatchObject({reserved_minor:'105000'});
 });
 it('does not treat zero telemetry, local pause or a caller final=true as final billing evidence',async()=>{
  const row=await ready(),input=await evidence(row);await expect(service.propose(admin,{...input,closures:[],final:true},'fake-final')).rejects.toBeTruthy();
  const proposal=await service.propose(admin,input,'proper-evidence');await service.review(reviewer,proposal.id,reviewInput(proposal));const disabled=new MarketingSettlementService(fixture.pool,{...options,verifyStopped:undefined});await expect(disabled.settle(admin,proposal.id,{fingerprint:proposal.fingerprint},'missing-transport')).rejects.toMatchObject({code:'SETTLEMENT_PROVIDER_VERIFICATION_UNAVAILABLE'});expect(await journals()).toHaveLength(0);
 });
 it.each([{configuredStatus:'ACTIVE'},{accountId:'another-account'},{observedAt:'2026-01-01T00:00:00.000Z'}])('rejects unavailable, wrong or stale authenticated stop evidence %j',async extra=>{
  const {proposal}=await approved();verifyStopped.mockImplementation(async binding=>({...binding,configuredStatus:'PAUSED',observedAt:new Date().toISOString(),evidenceHash:'f'.repeat(64),...extra}) as SettlementStopObservation);
  await expect(service.settle(admin,proposal.id,{fingerprint:proposal.fingerprint},'bad-provider-observation')).rejects.toBeTruthy();expect(await journals()).toHaveLength(0);
 });
 it('rejects wrong account, currency, campaign identity and unresolved provider writes',async()=>{
  const row=await ready(),input=await evidence(row);const bad=structuredClone(input);bad.closures[0].externalCampaignId='999999';await expect(service.propose(admin,bad,'wrong-campaign')).rejects.toMatchObject({code:'SETTLEMENT_ACCOUNT_MISMATCH'});
  const wrong=await document({currency:'USD'});const changed=structuredClone(input);changed.allocations[0].invoiceDocumentId=wrong.id;changed.closures[0].invoiceDocumentIds=[wrong.id];await expect(service.propose(admin,changed,'wrong-currency')).rejects.toMatchObject({code:'SETTLEMENT_EVIDENCE_MISMATCH'});
  await fixture.pool.query("INSERT INTO provider_publishing_transactions(campaign_id,provider,operation_type,idempotency_key,correlation_id,publish_status,is_unknown_outcome,payload) VALUES($1,'META','RESUME','unknown-write','isolated','RECONCILIATION_REQUIRED',true,'{}')",[row.campaignId]);await expect(service.propose(admin,input,'unknown-write-close')).rejects.toMatchObject({code:'SETTLEMENT_PROVIDER_UNRESOLVED'});
 });
 it('rejects incomplete billing periods, changed revisions and extra taxes without guessing policy',async()=>{
  const row=await ready(),input=await evidence(row);await expect(service.propose(admin,{...input,revision:2},'wrong-revision')).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  await expect(service.propose(admin,{...input,remittanceTaxMinor:'1'},'extra-tax')).rejects.toMatchObject({code:'SETTLEMENT_TAX_VARIANCE'});
  const invoice=await document({periodStart:'2026-08-02'});const missing=structuredClone(input);missing.allocations[0].invoiceDocumentId=invoice.id;missing.closures[0].invoiceDocumentIds=[invoice.id];await expect(service.propose(admin,missing,'missing-period')).rejects.toMatchObject({code:'SETTLEMENT_PERIOD_OPEN'});
 });
 it('applies per-line host ceilings while accounting for provider overruns as platform expense',async()=>{
  const {proposal}=await approved('110000');const result=await service.settle(admin,proposal.id,{fingerprint:proposal.fingerprint},'overrun-close');expect(result).toMatchObject({actualCostMinor:'120000',chargedCostMinor:'100000',profitMinor:'5000',platformOverrunMinor:'20000',realizedCampaignContributionMinor:'-15000',returnedMinor:'0'});
 });
 it('reconciles exact invoice splits across a completed billing period and rejects ambiguous splits',async()=>{
  const row=await ready(),input=await evidence(row),a=await document({totalMinor:'30000',periodEnd:'2026-08-01'}),b=await document({totalMinor:'50000',periodStart:'2026-08-02'});
  delete input.allocations[0].invoiceDocumentId;input.allocations[0].invoiceAllocations=[{documentId:a.id,amountMinor:'30000'},{documentId:b.id,amountMinor:'50000'}];input.closures[0].invoiceDocumentIds=[a.id,b.id];
  const bad=structuredClone(input);bad.allocations[0].invoiceAllocations![1].amountMinor='40000';await expect(service.propose(admin,bad,'bad-split')).rejects.toMatchObject({code:'SETTLEMENT_COST_MISMATCH'});
  const proposal=await service.propose(admin,input,'multi-invoice');await service.review(reviewer,proposal.id,reviewInput(proposal));expect(await service.settle(admin,proposal.id,{fingerprint:proposal.fingerprint},'split-close')).toMatchObject({actualCostMinor:'90000',returnedMinor:'10500'});
  expect((await fixture.pool.query('SELECT document_id,amount_minor FROM marketing_settlement_allocations WHERE cost_code=$1 ORDER BY amount_minor',['META_MEDIA'])).rows).toEqual([{document_id:a.id,amount_minor:'30000'},{document_id:b.id,amount_minor:'50000'}]);
 });
 it('deduplicates concurrent preparation and settlement without allocating an invoice or ledger twice',async()=>{
  const row=await ready(),input=await evidence(row);const proposed=await Promise.all(Array.from({length:8},()=>service.propose(admin,input,'same-proposal')));expect(new Set(proposed.map(p=>p.id)).size).toBe(1);const proposal=proposed[0];await service.review(reviewer,proposal.id,reviewInput(proposal));
  const results=await Promise.all(Array.from({length:8},()=>service.settle(admin,proposal.id,{fingerprint:proposal.fingerprint},'same-close')));expect(results.filter(r=>!r.idempotent)).toHaveLength(1);expect(await journals()).toHaveLength(1);expect((await fixture.pool.query('SELECT sum(amount_minor)::text AS total FROM marketing_settlement_allocations')).rows[0].total).toBe('90000');
 });
 it('prevents a shared issued invoice from being over-allocated across separate host campaigns',async()=>{
  const a=await ready(),b=await ready(),invoice=await document({totalMinor:'120000'});const pa=await service.propose(admin,await evidence(a,'80000',invoice.id),'shared-a');const pb=await service.propose(admin,await evidence(b,'80000',invoice.id),'shared-b');await service.review(reviewer,pa.id,reviewInput(pa));await service.review(reviewer,pb.id,reviewInput(pb));await service.settle(admin,pa.id,{fingerprint:pa.fingerprint},'shared-close-a');
  await expect(service.settle(admin,pb.id,{fingerprint:pb.fingerprint},'shared-close-b')).rejects.toMatchObject({code:'SETTLEMENT_INVOICE_OVERALLOCATED'});expect(await journals()).toHaveLength(1);
 });
 it('rolls back money and invoice claims when the final proposal persistence fails',async()=>{
  const {proposal}=await approved();await fixture.pool.query("CREATE FUNCTION fail_settlement_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='SETTLED' THEN RAISE EXCEPTION 'INJECTED_STORAGE_FAILURE'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_settlement_commit BEFORE UPDATE ON marketing_settlement_proposals FOR EACH ROW EXECUTE FUNCTION fail_settlement_commit()");
  try{await expect(service.settle(admin,proposal.id,{fingerprint:proposal.fingerprint},'storage-failure')).rejects.toThrow('INJECTED_STORAGE_FAILURE');expect(await journals()).toHaveLength(0);expect((await fixture.pool.query('SELECT * FROM marketing_settlement_allocations')).rows).toHaveLength(0);expect(await balances()).toMatchObject({reserved_minor:'105000',available_minor:'0'});}finally{await fixture.pool.query('DROP TRIGGER fail_settlement_commit ON marketing_settlement_proposals; DROP FUNCTION fail_settlement_commit()');}
 });
 it('allows explicit withdrawal and corrected re-preparation while preserving review history',async()=>{
  const {input,proposal}=await approved();await service.withdraw(admin,proposal.id,proposal.fingerprint,'Withdraw to correct the original source allocation evidence.');const next=await service.propose(admin,input,'corrected-proposal');expect(next.id).not.toBe(proposal.id);expect((await service.get(admin,proposal.id)).review?.decision).toBe('APPROVE');expect(await journals()).toHaveLength(0);
 });
});
