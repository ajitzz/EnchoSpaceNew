import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {GoogleInvoiceImporter,googleInvoiceImportSchema,type GoogleInvoiceImporterOptions} from '../../lib/marketing/googleInvoiceImport.js';
import {MarketingSettlementService} from '../../lib/marketing/settlementService.js';
import {createWorkflowPgFixture} from './workflowPgFixture.js';

const admin={id:90,role:'admin' as const},reviewer={id:91,role:'admin' as const},host={id:10,role:'host' as const};
const input={issueYear:2026,issueMonth:9};
const binding={servingCustomerId:'1234567890',billingSetup:'customers/1234567890/billingSetups/777',payingManagerCustomerId:'9876543210',currency:'INR' as const,monthlyInvoicingReference:'isolated-monthly-invoicing-approval'};
const invoice=(overrides:Record<string,unknown>={})=>({
 resourceName:'customers/1234567890/invoices/INV-2026-09',id:'INV-2026-09',type:'INVOICE',billingSetup:binding.billingSetup,currencyCode:'INR',
 issueDate:'2026-09-01',serviceDateRange:{startDate:'2026-08-01',endDate:'2026-08-31'},
 subtotalAmountMicros:'90000000',taxAmountMicros:'10000000',totalAmountMicros:'100000000',
 accountBudgetSummaries:[{customer:'customers/1234567890',accountBudget:'customers/1234567890/accountBudgets/88',billableActivityDateRange:{startDate:'2026-08-01',endDate:'2026-08-31'},campaignSummaries:[{campaignDescription:'Garden villa autumn stays',amountMicros:'90000000',quantity:'4',unitOfMeasure:'CLICKS'}]}],
 ...overrides,
});
function harness(data:unknown={invoices:[invoice()]},options:Partial<GoogleInvoiceImporterOptions>={},status=200){
 const bytes=Buffer.from(JSON.stringify(data,null,2)+'\n');
 const accessToken=vi.fn(async()=>'isolated-access-token');
 const transport=vi.fn(async()=>new Response(bytes,{status,headers:{'content-type':'application/json; charset=utf-8','request-id':'isolated-request-44'}}));
 const importer=new GoogleInvoiceImporter({...binding,accessToken,developerToken:'isolated-developer-token',...options},{fetch:transport as unknown as typeof fetch});
 return {bytes,accessToken,transport,importer};
}

describe('Google monthly invoice authenticated read contract',()=>{
 it('uses a fixed v25 read endpoint and preserves exact provider bytes and distinct gross, subtotal and tax',async()=>{
  const h=harness(),observed=await h.importer.read(input);
  const [url,request]=h.transport.mock.calls[0] as unknown as [string,RequestInit];
  expect(new URL(url)).toMatchObject({origin:'https://googleads.googleapis.com',pathname:'/v25/customers/1234567890/invoices'});
  expect(Object.fromEntries(new URL(url).searchParams)).toEqual({billingSetup:binding.billingSetup,issueYear:'2026',issueMonth:'SEPTEMBER',includeGranularLevelInvoiceDetails:'true'});
  expect(request).toMatchObject({method:'GET',redirect:'error',headers:{Authorization:'Bearer isolated-access-token','developer-token':'isolated-developer-token','login-customer-id':'9876543210'}});
  expect(url).not.toContain('token');expect(observed.bytes.equals(h.bytes)).toBe(true);
  expect(observed.sha256).toBe(createHash('sha256').update(h.bytes).digest('hex'));
  expect(observed.invoices[0]).toMatchObject({totalMinor:'10000',periodStart:'2026-08-01',periodEnd:'2026-08-31',issuedAt:'2026-09-01T00:00:00.000Z',evidence:{amountBasis:'INVOICE_GROSS_TOTAL',amountsMicros:{subtotalAmountMicros:'90000000',taxAmountMicros:'10000000',totalAmountMicros:'100000000',regulatoryCostsSubtotalAmountMicros:null},campaignAllocation:'INDEPENDENT_EVIDENCE_REQUIRED',automaticProviderFinality:false}});
  expect(observed.invoices[0]).not.toHaveProperty('campaignExternalId');
 });
 it.each([
  [{currencyCode:'USD'},'GOOGLE_INVOICE_CURRENCY_UNSUPPORTED'],
  [{billingSetup:'customers/1234567890/billingSetups/999'},'GOOGLE_INVOICE_BILLING_SETUP_MISMATCH'],
  [{resourceName:'customers/1111111111/invoices/INV-2026-09'},'GOOGLE_INVOICE_IDENTITY_MISMATCH'],
  [{totalAmountMicros:100000000},'GOOGLE_INVOICE_INVALID_RESPONSE'],
  [{totalAmountMicros:'100000001'},'GOOGLE_INVOICE_MINOR_UNIT_REVIEW_REQUIRED'],
  [{totalAmountMicros:'-100000000'},'GOOGLE_INVOICE_CREDIT_REVIEW_REQUIRED'],
  [{type:'CREDIT_MEMO'},'GOOGLE_INVOICE_CREDIT_REVIEW_REQUIRED'],
  [{issueDate:'2026-08-31'},'GOOGLE_INVOICE_PERIOD_INVALID'],
  [{serviceDateRange:{startDate:'2026-02-30',endDate:'2026-08-31'}},'GOOGLE_INVOICE_INVALID_RESPONSE'],
  [{accountBudgetSummaries:[]},'GOOGLE_INVOICE_ACCOUNT_COVERAGE_REQUIRED'],
  [{accountBudgetSummaries:[{customer:'customers/1111111111'}]},'GOOGLE_INVOICE_CONSOLIDATED_REVIEW_REQUIRED'],
  [{pdfUrl:'https://payments.google.com/invoice?access_token=unsafe'},'GOOGLE_INVOICE_INVALID_RESPONSE'],
  [{pdfUrl:'https://payments.google.com/invoice#token=unsafe'},'GOOGLE_INVOICE_INVALID_RESPONSE'],
 ] as const)('rejects unsupported or mismatched invoice evidence %#',async(overrides,code)=>{
  await expect(harness({invoices:[invoice(overrides)]}).importer.read(input)).rejects.toMatchObject({code});
 });
 it('retains positive invoice correction links without creating an accounting adjustment',async()=>{
  const observed=await harness({invoices:[invoice({correctedInvoice:'customers/1234567890/invoices/OLD-1'})]}).importer.read(input);
  expect(observed.invoices[0].evidence).toMatchObject({correctedInvoice:'customers/1234567890/invoices/OLD-1',replacedInvoices:[],automaticProviderFinality:false});
 });
 it('reports the actual monthly-invoicing eligibility error without exposing the provider error body',async()=>{
  const h=harness({error:{message:'sensitive provider detail',details:[{errors:[{errorCode:{invoiceError:'NOT_INVOICED_CUSTOMER'}}]}]}},{},400);
  await expect(h.importer.read(input)).rejects.toMatchObject({code:'GOOGLE_INVOICE_MONTHLY_INVOICING_UNSUPPORTED'});
 });
 it('rejects duplicate invoice identities and cross-account replacement references',async()=>{
  await expect(harness({invoices:[invoice(),invoice()]}).importer.read(input)).rejects.toMatchObject({code:'GOOGLE_INVOICE_IDENTITY_MISMATCH'});
  await expect(harness({invoices:[invoice({replacedInvoices:['customers/1111111111/invoices/other']})]}).importer.read(input)).rejects.toMatchObject({code:'GOOGLE_INVOICE_IDENTITY_MISMATCH'});
 });
 it('does not allow request bodies to choose an account, source URL or verification status',()=>{
  for(const extra of [{servingCustomerId:'1111111111'},{sourceUrl:'https://attacker.example'},{providerApiVerified:true}])expect(googleInvoiceImportSchema.safeParse({...input,...extra}).success).toBe(false);
  expect(()=>harness(undefined,{billingSetup:'customers/1111111111/billingSetups/777'})).toThrow();
 });
 it('bounds response bytes and OAuth latency before a read can continue',async()=>{
  const transport=vi.fn(async()=>new Response('{}',{headers:{'content-type':'application/json','content-length':String(5*1024*1024+1)}}));
  const bounded=new GoogleInvoiceImporter({...binding,developerToken:'isolated-developer-token',accessToken:async()=>'token'},{fetch:transport as unknown as typeof fetch});
  await expect(bounded.read(input)).rejects.toMatchObject({code:'GOOGLE_INVOICE_RESPONSE_TOO_LARGE'});
  const neverRead=vi.fn();let release!:(value:string)=>void;
  const delayed=new GoogleInvoiceImporter({...binding,developerToken:'isolated-developer-token',accessToken:()=>new Promise(resolve=>{release=resolve;})},{fetch:neverRead as unknown as typeof fetch,timeoutMs:10});
  await expect(delayed.read(input)).rejects.toMatchObject({code:'GOOGLE_INVOICE_TIMEOUT'});release('late-token');await new Promise(resolve=>setTimeout(resolve,0));expect(neverRead).not.toHaveBeenCalled();
 });
});

describe('Google invoice evidence integration on disposable PostgreSQL',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>;
 beforeAll(async()=>{fixture=await createWorkflowPgFixture();for(const name of ['012_harvo_marketing_settlement.sql','016_harvo_google_invoice_imports.sql'])await fixture.pool.query(readFileSync(new URL(`../../migrations/${name}`,import.meta.url),'utf8'));});
 afterAll(async()=>{await fixture?.close();});
 beforeEach(async()=>{await fixture.reset();await fixture.pool.query("INSERT INTO users VALUES(91,'admin'),(92,'admin')");});
 const service=(importer:GoogleInvoiceImporter)=>new MarketingSettlementService(fixture.pool,{operatorIds:[90,91],policyReference:'isolated-dual-accounting-review',providerAccounts:{GOOGLE:binding.servingCustomerId},googleInvoices:importer});
 it('imports original bytes once into the document library without a proposal, allocation or ledger mutation',async()=>{
  const h=harness(),s=service(h.importer),result=await s.importGoogleInvoices(admin,input,'first-import');
  expect(result).toMatchObject({issuer:'GOOGLE',billingSetup:binding.billingSetup,sourceResponseHash:createHash('sha256').update(h.bytes).digest('hex'),campaignAllocation:'INDEPENDENT_EVIDENCE_REQUIRED',automaticProviderFinality:false});
  expect(result.documents).toHaveLength(1);expect(result.documents[0]).toMatchObject({kind:'PROVIDER_INVOICE',source:'GOOGLE_ADS_INVOICE_API',providerApiVerified:true,totalMinor:'10000'});
  expect((await s.getDocument(reviewer,result.documents[0].id)).content.equals(h.bytes)).toBe(true);
  expect((await s.listDocuments(reviewer)).documents[0].metadata.apiEvidence).toMatchObject({billingSetup:binding.billingSetup,coveredCustomerIds:[binding.servingCustomerId],campaignAllocation:'INDEPENDENT_EVIDENCE_REQUIRED'});
  for(const table of ['marketing_settlement_proposals','marketing_settlement_allocations','marketing_finance_journals','marketing_finance_accounts'])expect((await fixture.pool.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
  const replay=await s.importGoogleInvoices(admin,input,'first-import');expect(replay.idempotent).toBe(true);expect(replay.documents[0].id).toBe(result.documents[0].id);expect(h.transport).toHaveBeenCalledOnce();
  await expect(s.importGoogleInvoices(admin,{issueYear:2026,issueMonth:8},'first-import')).rejects.toMatchObject({code:'SETTLEMENT_IDEMPOTENCY_CONFLICT'});
  await expect(fixture.pool.query("UPDATE marketing_settlement_documents SET total_minor=1 WHERE id=$1",[result.documents[0].id])).rejects.toThrow();
 });
 it('checks named and current administrator authority before OAuth or provider requests',async()=>{
  const h=harness(),s=service(h.importer);
  for(const actor of [host,{id:92,role:'admin' as const}])await expect(s.importGoogleInvoices(actor,input,'unauthorized')).rejects.toMatchObject({code:'SETTLEMENT_OPERATOR_REQUIRED'});
  await fixture.pool.query("UPDATE users SET role='host' WHERE id=90");
  await expect(s.importGoogleInvoices(admin,input,'revoked')).rejects.toMatchObject({code:'SETTLEMENT_OPERATOR_REQUIRED'});
  expect(h.accessToken).not.toHaveBeenCalled();expect(h.transport).not.toHaveBeenCalled();
 });
 it('rechecks a revoked finance operator after the provider read before persisting any documents',async()=>{
  const h=harness(),s=service(h.importer);
  h.transport.mockImplementationOnce(async()=>{await fixture.pool.query("UPDATE users SET role='host' WHERE id=90");return new Response(h.bytes,{headers:{'content-type':'application/json'}});});
  await expect(s.importGoogleInvoices(admin,input,'revoked-in-flight')).rejects.toMatchObject({code:'SETTLEMENT_OPERATOR_REQUIRED'});
  expect((await fixture.pool.query('SELECT * FROM marketing_settlement_documents')).rows).toHaveLength(0);
 });
 it('cannot accept a manual upload claiming API provenance or let a host read master-account documents',async()=>{
  const h=harness(),s=service(h.importer),result=await s.importGoogleInvoices(admin,input,'provenance');
  await expect(s.uploadDocument(admin,{...result.documents[0].metadata,contentBase64:h.bytes.toString('base64')},'forged-api')).rejects.toThrow();
  await expect(s.getDocument(host,result.documents[0].id)).rejects.toMatchObject({code:'SETTLEMENT_OPERATOR_REQUIRED'});
 });
 it('atomically rejects changed invoice evidence and does not retain a partial batch',async()=>{
  const h=harness(),s=service(h.importer);await s.importGoogleInvoices(admin,input,'original');
  const changed=harness({invoices:[invoice({id:'AAA-NEW',resourceName:'customers/1234567890/invoices/AAA-NEW'}),invoice({totalAmountMicros:'200000000'})]});
  await expect(service(changed.importer).importGoogleInvoices(admin,input,'changed-response')).rejects.toMatchObject({code:'SETTLEMENT_IDEMPOTENCY_CONFLICT'});
  expect((await fixture.pool.query('SELECT external_document_id,total_minor FROM marketing_settlement_documents')).rows).toEqual([{external_document_id:'INV-2026-09',total_minor:'10000'}]);
 });
 it('serializes concurrent immutable imports with no duplicate invoice rows',async()=>{
  const h=harness(),s=service(h.importer);
  const [a,b]=await Promise.all([s.importGoogleInvoices(admin,input,'concurrent'),s.importGoogleInvoices(admin,input,'concurrent')]);
  expect(a.documents[0].id).toBe(b.documents[0].id);expect((await fixture.pool.query('SELECT id FROM marketing_settlement_documents')).rows).toHaveLength(1);
 });
});
