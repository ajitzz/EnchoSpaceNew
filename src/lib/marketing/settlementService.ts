import {createHash,randomUUID} from 'node:crypto';
import type pg from 'pg';
import {type Actor,MarketingError,requireRevision} from './domain.js';
import {event,inTransaction,lockWorkflow} from './database.js';
import {calculateCosts,dateTime,fingerprint,identifier,stableJson,type CampaignQuote,type CostPolicyV1} from './financeQuote.js';
import {MarketingFinanceService,type VerifiedCampaignSettlement} from './financeService.js';
import {settlementDocumentSchema,settlementProposalSchema,settlementReviewSchema,settlementCommitSchema,settlementListQuerySchema,settlementDocumentQuerySchema,type SettlementDocumentInput,type SettlementProposalInput,type SettlementReviewInput,type SettlementListQuery,type SettlementDocumentQuery} from './settlementSchemas.js';
import {GoogleInvoiceImporter,googleInvoiceImportSchema,type GoogleInvoiceEvidence} from './googleInvoiceImport.js';

type Provider='GOOGLE'|'META';
export interface SettlementProviderBinding {provider:Provider;accountId:string;externalCampaignId:string;campaignId:number;revision:number;}
export interface SettlementStopObservation extends SettlementProviderBinding {configuredStatus:'PAUSED'|'REMOVED'|'ARCHIVED';observedAt:string;evidenceHash:string;}
export interface SettlementOptions {
 /** Named human finance operators; current persisted admin role is also required on every call. */
 operatorIds:readonly number[];policyReference:string;providerAccounts:Partial<Record<Provider,string>>;
 /** Read-only authenticated provider transport, never supplied by the request body. */
 verifyStopped?:(binding:SettlementProviderBinding)=>Promise<SettlementStopObservation>;
 additionalDocumentOrigins?:Partial<Record<'GOOGLE'|'META'|'STRIPE'|'RAZORPAY'|'ACCOUNTANT',readonly string[]>>;
 googleInvoices?:GoogleInvoiceImporter;
}
type DocumentMetadata=Omit<SettlementDocumentInput,'contentBase64'>&{apiEvidence?:GoogleInvoiceEvidence&{requestKeyHash:string;requestFingerprint:string}};
export interface SettlementDocumentView {id:string;kind:SettlementDocumentInput['kind'];issuer:SettlementDocumentInput['issuer'];accountId:string;externalDocumentId:string;currency:'INR'|'USD';totalMinor:string;periodStart:string;periodEnd:string;issuedAt:string;sha256:string;contentType:SettlementDocumentInput['contentType'];uploadedBy:number;metadata:DocumentMetadata;source:'MANUALLY_SOURCED_DOCUMENT'|'GOOGLE_ADS_INVOICE_API';providerApiVerified:boolean;}
export interface SettlementProposalView {id:string;campaignId:number;hostId:number;revision:number;reservationId:string;status:'PENDING_REVIEW'|'APPROVED'|'REJECTED'|'SETTLED';fingerprint:string;preparedBy:number;snapshot:{protocol:'HARVO_DOCUMENTARY_ACCOUNTING_CLOSE_V1';input:SettlementProposalInput;binding:any;documents:{id:string;sha256:string;uploadedBy:number;metadataHash:string}[];source:string;providerAbsoluteFinality:false;preparedAt:string};result:any|null;createdAt:string;}
export interface SettlementEligibleCampaign {campaignId:number;hostId:number;revision:number;reservationId:string;title:string;listingTitle:string;provider:Provider;externalCampaignId:string;accountId:string;currency:'INR'|'USD';flightStart:string;flightEnd:string;quoteCosts:{code:string;amountMinor:string}[];quotedTaxMinor:string;markupBps:number;}
const defaultOrigins={GOOGLE:['https://ads.google.com','https://payments.google.com'],META:['https://business.facebook.com','https://adsmanager.facebook.com'],STRIPE:['https://dashboard.stripe.com'],RAZORPAY:['https://dashboard.razorpay.com'],ACCOUNTANT:[] as string[]};
const fail=(code:string,message:string,status=409):never=>{throw new MarketingError(code,message,status);};
const sha256=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const account=(provider:Provider,value:string)=>provider==='GOOGLE'?value.replaceAll('-',''):value.replace(/^act_/,'');
const contains=(value:string)=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
type Binding={row:any;quote:CampaignQuote;policy:CostPolicyV1;providers:SettlementProviderBinding[];authorizations:{authorizationId:string;provider:Provider;accountId:string}[];snapshot:unknown;};

/** Documentary close with dual control. An authenticated invoice observation never certifies final billing. */
export class MarketingSettlementService {
 constructor(private pool:pg.Pool,private options:SettlementOptions){}
 capabilities(){const hasAccount=Object.entries(this.options.providerAccounts).some(([provider,value])=>typeof value==='string'&&(provider==='GOOGLE'?/^\d{10}$/:/^[1-9]\d{0,29}$/).test(account(provider as Provider,value)));return {configured:new Set(this.options.operatorIds).size>=2&&!!this.options.policyReference&&!!this.options.verifyStopped&&hasAccount,source:'DUAL_CONTROL_DOCUMENTARY_ACCOUNTING_CLOSE',automaticProviderFinality:false,policyReference:this.options.policyReference,googleInvoiceImport:!!this.options.googleInvoices&&this.options.googleInvoices.binding().servingCustomerId===account('GOOGLE',this.options.providerAccounts.GOOGLE??'')};}
 private requireOperator(actor:Actor){
  if(actor.role!=='admin'||!this.options.operatorIds.includes(actor.id)||new Set(this.options.operatorIds).size<2)fail('SETTLEMENT_OPERATOR_REQUIRED','Two distinct configured financial administrators are required',403);
  identifier(this.options.policyReference,'accounting close policy reference');
 }
 private async tx<T>(actor:Actor,work:(c:pg.PoolClient)=>Promise<T>):Promise<T>{
  this.requireOperator(actor);
  return inTransaction(this.pool,actor,async c=>{
   if(!(await c.query("SELECT id FROM users WHERE id=$1 AND role='admin' FOR SHARE",[actor.id])).rows[0])fail('SETTLEMENT_OPERATOR_REQUIRED','Current administrator authority is required',403);
   return work(c);
  });
 }
 private documentView(row:any):SettlementDocumentView{const api=row.metadata?.apiEvidence?.protocol==='HARVO_GOOGLE_INVOICE_OBSERVATION_V1';return {id:row.id,kind:row.kind,issuer:row.issuer,accountId:row.account_id,externalDocumentId:row.external_document_id,currency:row.currency,totalMinor:row.total_minor,periodStart:row.period_start instanceof Date?row.period_start.toISOString().slice(0,10):row.period_start,periodEnd:row.period_end instanceof Date?row.period_end.toISOString().slice(0,10):row.period_end,issuedAt:new Date(row.issued_at).toISOString(),sha256:row.content_hash,contentType:row.content_type,uploadedBy:row.uploaded_by,metadata:row.metadata,source:api?'GOOGLE_ADS_INVOICE_API':'MANUALLY_SOURCED_DOCUMENT',providerApiVerified:api};}
 private async persistDocument(c:pg.PoolClient,actor:Actor,metadata:DocumentMetadata,bytes:Buffer,key:string){
  const contentHash=sha256(bytes),semanticHash=fingerprint({...metadata,contentHash});
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`settlement-document-key:${actor.id}:${key}`]);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`settlement-document:${metadata.issuer}:${metadata.accountId}:${metadata.kind}:${metadata.externalDocumentId}`]);
  const previous=(await c.query('SELECT * FROM marketing_settlement_documents WHERE (uploaded_by=$1 AND request_key=$2) OR (issuer=$3 AND account_id=$4 AND kind=$5 AND external_document_id=$6)',[actor.id,key,metadata.issuer,metadata.accountId,metadata.kind,metadata.externalDocumentId])).rows;
  if(previous.length){
   const prior=previous[0];
   const sameApiInvoice=metadata.apiEvidence&&prior?.metadata?.apiEvidence?.protocol===metadata.apiEvidence.protocol&&prior.metadata.apiEvidence.invoiceFingerprint===metadata.apiEvidence.invoiceFingerprint&&
    prior.metadata.apiEvidence.invoiceResourceName===metadata.apiEvidence.invoiceResourceName&&prior.metadata.apiEvidence.billingSetup===metadata.apiEvidence.billingSetup;
   if(previous.length!==1||prior.fingerprint!==semanticHash&&!sameApiInvoice)fail('SETTLEMENT_IDEMPOTENCY_CONFLICT','Document identity already has different immutable evidence');
   return {...this.documentView(prior),idempotent:true};
  }
  const row=(await c.query(`INSERT INTO marketing_settlement_documents(id,kind,issuer,account_id,external_document_id,currency,total_minor,period_start,period_end,issued_at,content_type,content,content_hash,metadata,uploaded_by,request_key,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,[randomUUID(),metadata.kind,metadata.issuer,metadata.accountId,metadata.externalDocumentId,metadata.currency,metadata.totalMinor,metadata.periodStart,metadata.periodEnd,metadata.issuedAt,metadata.contentType,bytes,contentHash,stableJson(metadata),actor.id,key,semanticHash])).rows[0];
  return {...this.documentView(row),idempotent:false};
 }
 async importGoogleInvoices(actor:Actor,raw:unknown,key:string){
  this.requireOperator(actor);identifier(key,'invoice import request key');const input=googleInvoiceImportSchema.parse(raw),importer=this.options.googleInvoices;
  if(!importer)fail('GOOGLE_INVOICE_CONFIGURATION_REQUIRED','Monthly invoice import is not configured; use independently sourced documents',503);
  const binding=importer!.binding();
  if(binding.servingCustomerId!==account('GOOGLE',this.options.providerAccounts.GOOGLE??''))fail('SETTLEMENT_ACCOUNT_MISMATCH','Invoice import account differs from configured settlement authority');
  const requestKeyHash=fingerprint({actorId:actor.id,key}),requestFingerprint=fingerprint({...binding,...input});
  // Persisted operator authority is checked before token refresh or any provider read.
  const intent=await this.tx(actor,async c=>{
   await c.query('INSERT INTO marketing_google_invoice_imports(id,operator_id,request_key,request_fingerprint,request_snapshot) VALUES($1,$2,$3,$4,$5) ON CONFLICT(operator_id,request_key) DO NOTHING',[randomUUID(),actor.id,key,requestFingerprint,stableJson({...binding,...input})]);
   const row=(await c.query('SELECT id,state,request_fingerprint,result FROM marketing_google_invoice_imports WHERE operator_id=$1 AND request_key=$2 FOR UPDATE',[actor.id,key])).rows[0];
   if(!row||row.request_fingerprint!==requestFingerprint)fail('SETTLEMENT_IDEMPOTENCY_CONFLICT','Invoice import key is already bound to another request');return row;
  });
  if(intent.state==='OBSERVED')return {...intent.result,idempotent:true};
  const observation=await importer!.read(input);
  return this.tx(actor,async c=>{
   const current=(await c.query('SELECT state,result FROM marketing_google_invoice_imports WHERE id=$1 FOR UPDATE',[intent.id])).rows[0];
   if(current.state==='OBSERVED')return {...current.result,idempotent:true};
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`settlement-google-invoices:${binding.servingCustomerId}`]);
   const documents=[];
   for(const invoice of [...observation.invoices].sort((a,b)=>a.externalDocumentId.localeCompare(b.externalDocumentId))){
    const metadata:DocumentMetadata={kind:'PROVIDER_INVOICE',issuer:'GOOGLE',provider:'GOOGLE',accountId:invoice.accountId,externalDocumentId:invoice.externalDocumentId,currency:invoice.currency,totalMinor:invoice.totalMinor,periodStart:invoice.periodStart,periodEnd:invoice.periodEnd,issuedAt:invoice.issuedAt,sourceUrl:observation.sourceUrl,description:'Authenticated Google monthly invoice observation. Gross invoice total includes provider-reported tax and other invoice charges. Campaign allocation and accounting closure require independent evidence.',contentType:'application/json',apiEvidence:{...invoice.evidence,requestKeyHash,requestFingerprint}};
    documents.push(await this.persistDocument(c,actor,metadata,observation.bytes,`google-invoice:${fingerprint({requestKeyHash,invoice:invoice.externalDocumentId})}`));
   }
   const correction=observation.invoices.some(invoice=>invoice.evidence.correctedInvoice||invoice.evidence.replacedInvoices.length);
   const result={importId:intent.id as string,documents,sourceResponseHash:observation.sha256,idempotent:false,issuer:'GOOGLE' as const,...binding,...input,campaignAllocation:'INDEPENDENT_EVIDENCE_REQUIRED' as const,automaticProviderFinality:false as const,blockers:['GOOGLE_INVOICE_CAMPAIGN_ALLOCATION_REQUIRES_INDEPENDENT_EVIDENCE',...(correction?['GOOGLE_INVOICE_CORRECTION_REQUIRES_ACCOUNTING_REMEDIATION']:[])]};
   await c.query("UPDATE marketing_google_invoice_imports SET state='OBSERVED',source_url=$2,response_content=$3,response_hash=$4,result=$5,observed_at=$6 WHERE id=$1",[intent.id,observation.sourceUrl,observation.bytes,observation.sha256,stableJson(result),observation.observedAt]);
   return result;
  });
 }
 async getGoogleInvoiceObservation(actor:Actor,id:string){
  identifier(id,'invoice import id');return this.tx(actor,async c=>{
   const row=(await c.query("SELECT response_content,response_hash,result FROM marketing_google_invoice_imports WHERE id=$1 AND state='OBSERVED'",[id])).rows[0];
   if(!row)fail('GOOGLE_INVOICE_OBSERVATION_NOT_FOUND','Invoice observation was not found',404);
   if(sha256(row.response_content)!==row.response_hash)fail('SETTLEMENT_EVIDENCE_CORRUPTED','Stored invoice response digest mismatch');
   return {content:row.response_content as Buffer,contentType:'application/json' as const,sha256:row.response_hash as string,result:row.result};
  });
 }
 async uploadDocument(actor:Actor,input:unknown,key:string){
  this.requireOperator(actor);identifier(key,'document request key');const parsed=settlementDocumentSchema.parse(input);
  if(parsed.contentBase64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(parsed.contentBase64))fail('SETTLEMENT_DOCUMENT_INVALID','Use canonical base64 document bytes',422);
  const bytes=Buffer.from(parsed.contentBase64,'base64');if(!bytes.length||bytes.length>5*1024*1024||bytes.toString('base64')!==parsed.contentBase64)fail('SETTLEMENT_DOCUMENT_INVALID','Document must be at most 5 MiB',422);
  if(parsed.contentType==='application/pdf'&&(!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))||!bytes.subarray(-4096).includes(Buffer.from('%%EOF'))))fail('SETTLEMENT_DOCUMENT_INVALID','A complete PDF document is required',422);
  if(parsed.contentType==='application/json'){try{JSON.parse(bytes.toString('utf8'));}catch{fail('SETTLEMENT_DOCUMENT_INVALID','Document JSON is malformed',422);}}
  const source=new URL(parsed.sourceUrl),origins=[...defaultOrigins[parsed.issuer],...(this.options.additionalDocumentOrigins?.[parsed.issuer]??[])];
  if(source.protocol!=='https:'||source.username||source.password||source.port||source.hash||!origins.includes(source.origin)||[...source.searchParams.keys()].some(k=>/token|secret|password|signature|key/i.test(k)))fail('SETTLEMENT_PROVENANCE_INVALID','Use the configured provider or accounting portal; credential URLs are not accepted',422);
  if(Date.parse(dateTime(parsed.issuedAt,'document issuance'))>Date.now()||parsed.issuedAt.slice(0,10)<parsed.periodEnd)fail('SETTLEMENT_PERIOD_OPEN','Document issuance must cover the completed billing period',422);
  if(parsed.kind==='PROVIDER_INVOICE'&&!['GOOGLE','META'].includes(parsed.issuer))fail('SETTLEMENT_DOCUMENT_INVALID','An ad-provider invoice must identify the issuing ad provider',422);
  if(['CAMPAIGN_BILLING_DETAIL','BILLING_CLOSURE'].includes(parsed.kind)&&(!parsed.provider||!parsed.campaignExternalId))fail('SETTLEMENT_DOCUMENT_INVALID','Campaign billing evidence must identify its provider and external campaign',422);
  if(parsed.kind==='BILLING_CLOSURE'&&parsed.policyReference!==this.options.policyReference)fail('SETTLEMENT_POLICY_REQUIRED','Accounting closure must cite the configured policy',422);
  const {contentBase64:_bytes,...metadata}=parsed;
  return this.tx(actor,c=>this.persistDocument(c,actor,metadata,bytes,key));
 }
 async listDocuments(actor:Actor,raw:SettlementDocumentQuery={}){const query=settlementDocumentQuerySchema.parse(raw);return this.tx(actor,async c=>{
  const rows=(await c.query(`SELECT id,kind,issuer,account_id,external_document_id,currency,total_minor,period_start,period_end,issued_at,content_type,content_hash,uploaded_by,metadata FROM marketing_settlement_documents WHERE ($1::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM marketing_settlement_documents WHERE id=$1)) AND ($2='' OR external_document_id ILIKE $3 ESCAPE E'\\\\' OR account_id ILIKE $3 ESCAPE E'\\\\' OR id::text=$2) ORDER BY created_at DESC,id DESC LIMIT 31`,[query.before??null,query.search,contains(query.search)])).rows;
  return {documents:rows.slice(0,30).map(r=>this.documentView(r)),page:{nextCursor:rows.length>30?rows[29].id as string:null}};
 });}
 async getDocument(actor:Actor,id:string){identifier(id,'document id');return this.tx(actor,async c=>{const row=(await c.query('SELECT * FROM marketing_settlement_documents WHERE id=$1',[id])).rows[0];if(!row)fail('SETTLEMENT_DOCUMENT_NOT_FOUND','Document not found',404);if(sha256(row.content)!==row.content_hash)fail('SETTLEMENT_EVIDENCE_CORRUPTED','Stored document digest mismatch');return {...this.documentView(row),content:row.content as Buffer};});}
 private async binding(c:pg.PoolClient,actor:Actor,input:{campaignId:number;revision:number;reservationId:string}):Promise<Binding>{
  const row=await lockWorkflow(c,input.campaignId,actor);requireRevision(row,input.revision);
  if(!['PAUSED','PROVIDER_PAUSED'].includes(row.state)||row.reservation_id!==input.reservationId)fail('SETTLEMENT_CAMPAIGN_NOT_CLOSED','Exact reserved campaign must be paused before accounting close');
  if(row.draft.endDate>=new Date().toISOString().slice(0,10))fail('SETTLEMENT_PERIOD_OPEN','The approved campaign flight has not finished');
  const reservation=(await c.query('SELECT * FROM marketing_finance_reservations WHERE id=$1',[input.reservationId])).rows[0];
  if(!reservation||reservation.campaign_id!==row.campaign_id||reservation.host_id!==row.host_id||reservation.revision!==String(row.revision)||reservation.quote_id!==row.quote_id||reservation.status!=='RESERVED')fail('SETTLEMENT_RESERVATION_MISMATCH','Campaign, revision and intact reservation must match');
  const quote=(await c.query('SELECT snapshot FROM marketing_finance_quotes WHERE id=$1',[row.quote_id])).rows[0]?.snapshot as CampaignQuote;
  const policy=(await c.query('SELECT snapshot FROM marketing_finance_policies WHERE policy_id=$1 AND version=$2',[quote?.policyId,quote?.policyVersion])).rows[0]?.snapshot as CostPolicyV1;
  if(!quote||!policy||fingerprint(policy)!==quote.policyFingerprint||quote.markupBps<300||quote.markupBps>500)fail('SETTLEMENT_POLICY_REQUIRED','Exact immutable cost-plus policy and quote are required');
  const pending=(await c.query("SELECT id FROM marketing_jobs WHERE campaign_id=$1 AND kind IN ('PUBLISH','ACTIVATE','PAUSE') AND state IN ('PENDING','RUNNING','RETRY','RECONCILIATION_REQUIRED') LIMIT 1",[row.campaign_id])).rows;
  const operations=(await c.query('SELECT id,provider,operation_type,publish_status,is_unknown_outcome,payload,response FROM provider_publishing_transactions WHERE campaign_id=$1 ORDER BY id',[row.campaign_id])).rows;
  if(pending.length||operations.some(op=>op.is_unknown_outcome||['REQUESTED','RECONCILIATION_REQUIRED','ASSET_PREPARING'].includes(op.publish_status)))fail('SETTLEMENT_PROVIDER_UNRESOLVED','Pending or uncertain provider operations must be reconciled before settlement');
  const entities=(await c.query("SELECT provider,external_id,account_id FROM provider_entities WHERE campaign_id=$1 AND entity_type='CAMPAIGN' ORDER BY provider,external_id",[row.campaign_id])).rows;
  if(entities.length!==1||entities[0].provider!==row.provider)fail('SETTLEMENT_PROVIDER_UNRESOLVED','One exact verified provider campaign is required');
  const providers=entities.map(e=>{const provider=e.provider as Provider;const configured=this.options.providerAccounts[provider];if(!configured||account(provider,e.account_id)!==account(provider,configured))fail('SETTLEMENT_ACCOUNT_MISMATCH','Provider account differs from configured billing authority');return {provider,accountId:account(provider,e.account_id),externalCampaignId:e.external_id,campaignId:row.campaign_id,revision:row.revision};});
  const authorizations=(await c.query('SELECT id,provider,account_id FROM marketing_finance_authorizations WHERE reservation_id=$1 ORDER BY provider,id',[reservation.id])).rows.map(a=>({authorizationId:a.id as string,provider:a.provider as Provider,accountId:a.account_id as string}));
  if(authorizations.some(a=>!providers.some(p=>p.provider===a.provider&&p.accountId===account(a.provider,a.accountId))))fail('SETTLEMENT_ACCOUNT_MISMATCH','Every spending authorization needs matching provider identity');
  return {row,quote,policy,providers,authorizations,snapshot:{campaignId:row.campaign_id,hostId:row.host_id,listingId:row.listing_id,revision:row.revision,reservationId:reservation.id,quoteId:row.quote_id,quoteFingerprint:quote.fingerprint,providers,authorizations,operations:operations.map(op=>({id:op.id,provider:op.provider,operation:op.operation_type,status:op.publish_status,evidenceHash:fingerprint({payload:op.payload,response:op.response})}))}};
 }
 private allocationSources(a:SettlementProposalInput['allocations'][number]){return a.invoiceAllocations??(a.invoiceDocumentId?[{documentId:a.invoiceDocumentId,amountMinor:a.amountMinor}]:[]);}
 private documentIds(input:SettlementProposalInput){return [...new Set([...input.allocations.flatMap(a=>this.allocationSources(a).map(x=>x.documentId)),...(input.taxDocumentId?[input.taxDocumentId]:[]),...input.closures.flatMap(x=>[...x.invoiceDocumentIds,x.detailDocumentId,x.closureDocumentId])])].sort();}
 private async validateEvidence(c:pg.PoolClient,input:SettlementProposalInput,binding:Binding){
  if(input.policyReference!==this.options.policyReference)fail('SETTLEMENT_POLICY_REQUIRED','Proposal must cite the current configured accounting-close policy');
  calculateCosts(input.allocations,binding.policy);
  for(const provider of binding.providers.filter(p=>p.provider==='GOOGLE'))await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`settlement-google-invoices:${provider.accountId}`]);
  const ids=this.documentIds(input);if(ids.length>60)fail('SETTLEMENT_DOCUMENT_INVALID','At most 60 referenced documents are supported');
  const aggregate=(await c.query('SELECT COALESCE(sum(octet_length(content)),0) AS bytes FROM marketing_settlement_documents WHERE id=ANY($1::uuid[])',[ids])).rows[0];if(Number(aggregate.bytes)>20*1024*1024)fail('SETTLEMENT_DOCUMENT_INVALID','One evidence bundle must be at most 20 MiB');
  const docs=(await c.query('SELECT * FROM marketing_settlement_documents WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[ids])).rows;
  const googleInvoices=docs.filter(d=>d.kind==='PROVIDER_INVOICE'&&d.issuer==='GOOGLE');
  if(googleInvoices.some(d=>d.metadata?.apiEvidence?.correctedInvoice||d.metadata?.apiEvidence?.replacedInvoices?.length))fail('GOOGLE_INVOICE_CORRECTION_REQUIRES_ACCOUNTING_REMEDIATION','Corrected or replacement invoices require explicit accounting remediation before allocations');
  if(googleInvoices.length){
   const resources=googleInvoices.map(d=>`customers/${account('GOOGLE',d.account_id)}/invoices/${d.external_document_id}`);
   const corrections=(await c.query("SELECT id FROM marketing_settlement_documents WHERE metadata->'apiEvidence'->>'correctedInvoice'=ANY($1::text[]) OR (metadata->'apiEvidence'->'replacedInvoices') ?| $1::text[] LIMIT 1",[resources])).rows;
   if(corrections.length)fail('GOOGLE_INVOICE_CORRECTION_REQUIRES_ACCOUNTING_REMEDIATION','A retained Google invoice corrects or replaces this source; independent accounting remediation is required');
  }
  if(docs.length!==ids.length||docs.some(d=>d.currency!==binding.quote.currency||sha256(d.content)!==d.content_hash))fail('SETTLEMENT_EVIDENCE_MISMATCH','Every document must exist, retain its digest and match the quote currency');
  const find=(id:string)=>docs.find(d=>d.id===id)!;
  if(input.closures.length!==binding.providers.length)fail('SETTLEMENT_PROVIDER_UNRESOLVED','Close every actual provider campaign exactly once');
  for(const p of binding.providers){
   const closed=input.closures.filter(x=>x.provider===p.provider&&x.accountId===p.accountId&&x.externalCampaignId===p.externalCampaignId);if(closed.length!==1)fail('SETTLEMENT_ACCOUNT_MISMATCH','Closure account and campaign do not match stored provider identity');
   const closure=closed[0],detail=find(closure.detailDocumentId),final=find(closure.closureDocumentId);
   const matches=(d:any)=>d.account_id===p.accountId&&d.metadata.provider===p.provider&&d.metadata.campaignExternalId===p.externalCampaignId&&d.metadata.periodStart<=binding.row.draft.startDate&&d.metadata.periodEnd>=binding.row.draft.endDate;
   if(detail.kind!=='CAMPAIGN_BILLING_DETAIL'||detail.issuer!==p.provider||!matches(detail)||final.kind!=='BILLING_CLOSURE'||!matches(final)||final.metadata.policyReference!==this.options.policyReference)fail('SETTLEMENT_CLOSURE_EVIDENCE_REQUIRED','Matching provider campaign billing detail and policy-bound accounting closure are required');
   if(new Set(closure.invoiceDocumentIds).size!==closure.invoiceDocumentIds.length)fail('SETTLEMENT_DOCUMENT_INVALID','Invoice references cannot repeat');
   const invoices=closure.invoiceDocumentIds.map(find);
   if(invoices.some(d=>d.kind!=='PROVIDER_INVOICE'||d.issuer!==p.provider||d.account_id!==p.accountId))fail('SETTLEMENT_ACCOUNT_MISMATCH','Invoices must belong to the exact provider billing account');
   if(invoices.some(d=>new Date(d.issued_at)>new Date(final.issued_at))||new Date(detail.issued_at)>new Date(final.issued_at))fail('SETTLEMENT_PERIOD_OPEN','Accounting closure cannot precede its supporting invoices and campaign detail');
   const covered=invoices.map(d=>({start:d.metadata.periodStart as string,end:d.metadata.periodEnd as string})).sort((a,b)=>a.start.localeCompare(b.start));let through=binding.row.draft.startDate;
   for(const period of covered){if(period.start>through)break;if(period.end>=through)through=new Date(Date.parse(period.end)+86400000).toISOString().slice(0,10);}
   if(through<=binding.row.draft.endDate)fail('SETTLEMENT_PERIOD_OPEN','Invoices leave a gap in the campaign billing period');
   const media=input.allocations.filter(a=>binding.policy.costCodes.find(k=>k.code===a.code)?.provider===p.provider);
   if(media.reduce((n,a)=>n+BigInt(a.amountMinor),0n)!==BigInt(detail.total_minor)||media.some(a=>!this.allocationSources(a).length||this.allocationSources(a).some(x=>!closure.invoiceDocumentIds.includes(x.documentId))))fail('SETTLEMENT_COST_MISMATCH','Media costs must equal the campaign billing detail and reference its invoices');
  }
  for(const allocation of input.allocations){
   const rule=binding.policy.costCodes.find(k=>k.code===allocation.code)!;
   if(rule.kind==='MEDIA'&&allocation.amountMinor!=='0'&&!binding.providers.some(p=>p.provider===rule.provider))fail('SETTLEMENT_ACCOUNT_MISMATCH','Actual media cost cannot be assigned to a provider absent from this campaign');
   const sources=this.allocationSources(allocation);
   if(!sources.length){if(allocation.amountMinor!=='0'||binding.quote.costs.find(x=>x.code===allocation.code)?.amountMinor!=='0')fail('SETTLEMENT_COST_EVIDENCE_REQUIRED','Every charged or quoted cost needs its source invoice, including explicit final zero cost');continue;}
   if(new Set(sources.map(x=>x.documentId)).size!==sources.length||sources.reduce((n,x)=>n+BigInt(x.amountMinor),0n)!==BigInt(allocation.amountMinor))fail('SETTLEMENT_COST_MISMATCH','Invoice splits must sum exactly to each actual cost');
   for(const source of sources){const doc=find(source.documentId);if(!['PROVIDER_INVOICE','COST_INVOICE','TAX_STATEMENT'].includes(doc.kind))fail('SETTLEMENT_COST_EVIDENCE_REQUIRED','Cost allocation requires an invoice or tax statement');
   if(rule.kind==='MEDIA'&&(doc.issuer!==rule.provider||doc.kind!=='PROVIDER_INVOICE'))fail('SETTLEMENT_ACCOUNT_MISMATCH','Media allocation requires its provider invoice');
   if(rule.kind!=='MEDIA'&&['STRIPE','RAZORPAY'].includes(doc.issuer)&&!(await c.query('SELECT id FROM marketing_finance_captures WHERE quote_id=$1 AND provider=$2 AND account_id=$3 LIMIT 1',[binding.row.quote_id,doc.issuer,doc.account_id])).rows[0])fail('SETTLEMENT_ACCOUNT_MISMATCH','Gateway fee evidence must match the actual captured-payment account');}
  }
  if(BigInt(input.remittanceTaxMinor)>BigInt(binding.quote.remittanceTaxMinor))fail('SETTLEMENT_TAX_VARIANCE','Tax above the quoted reserve requires specialist review');
  if(input.remittanceTaxMinor!=='0'&&!input.taxDocumentId)fail('SETTLEMENT_COST_EVIDENCE_REQUIRED','Remittance tax requires documentary evidence');
  if(input.taxDocumentId){const tax=find(input.taxDocumentId);if(tax.kind!=='TAX_STATEMENT'||BigInt(tax.total_minor)<BigInt(input.remittanceTaxMinor))fail('SETTLEMENT_COST_MISMATCH','Remittance tax does not match its supporting statement');}
  const claims=input.allocations.flatMap(a=>this.allocationSources(a).map(x=>({documentId:x.documentId,code:a.code,amountMinor:x.amountMinor})));if(input.taxDocumentId)claims.push({documentId:input.taxDocumentId,code:'REMITTANCE_TAX',amountMinor:input.remittanceTaxMinor});
  for(const doc of docs){const claimed=claims.filter(x=>x.documentId===doc.id).reduce((n,x)=>n+BigInt(x.amountMinor),0n);const used=BigInt((await c.query('SELECT COALESCE(sum(amount_minor),0) AS amount FROM marketing_settlement_allocations WHERE document_id=$1',[doc.id])).rows[0].amount);if(claimed+used>BigInt(doc.total_minor))fail('SETTLEMENT_INVOICE_OVERALLOCATED','Document allocations exceed its billed total');}
  return {documents:docs.map(d=>({id:d.id,sha256:d.content_hash,uploadedBy:d.uploaded_by,metadataHash:fingerprint(d.metadata)})),claims};
 }
 async propose(actor:Actor,raw:unknown,key:string){
  const input=settlementProposalSchema.parse(raw);identifier(key,'settlement proposal key');
  return this.tx(actor,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`settlement-proposal-key:${actor.id}:${key}`]);
   await lockWorkflow(c,input.campaignId,actor);
   const prior=(await c.query('SELECT * FROM marketing_settlement_proposals WHERE prepared_by=$1 AND request_key=$2',[actor.id,key])).rows[0];if(prior){if(fingerprint(prior.snapshot.input)!==fingerprint(input))fail('SETTLEMENT_IDEMPOTENCY_CONFLICT','Proposal key has different content');return this.projection(prior);}
   const binding=await this.binding(c,actor,input),evidence=await this.validateEvidence(c,input,binding);
   const snapshot={protocol:'HARVO_DOCUMENTARY_ACCOUNTING_CLOSE_V1',input,binding:binding.snapshot,documents:evidence.documents,source:'DUAL_CONTROL_MANUAL_BILLING_EVIDENCE',providerAbsoluteFinality:false,preparedAt:new Date().toISOString()};const hash=fingerprint(snapshot);
   if((await c.query("SELECT id FROM marketing_settlement_proposals WHERE reservation_id=$1 AND status<>'REJECTED'",[input.reservationId])).rows.length)fail('SETTLEMENT_PROPOSAL_EXISTS','Withdraw the existing open proposal before replacing its evidence');
   const row=(await c.query('INSERT INTO marketing_settlement_proposals(id,campaign_id,host_id,revision,reservation_id,snapshot,fingerprint,prepared_by,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[randomUUID(),input.campaignId,binding.row.host_id,input.revision,input.reservationId,stableJson(snapshot),hash,actor.id,key])).rows[0];
   await event(c,binding.row,actor,'SETTLEMENT_PREPARED',{proposalId:row.id,fingerprint:hash,documentHashes:evidence.documents.map(d=>({id:d.id,sha256:d.sha256}))});return this.projection(row);
  });
 }
 private projection(row:any):SettlementProposalView{return {id:row.id,campaignId:row.campaign_id,hostId:row.host_id,revision:row.revision,reservationId:row.reservation_id,status:row.status,fingerprint:row.fingerprint,preparedBy:row.prepared_by,snapshot:row.snapshot,result:row.settlement_result??null,createdAt:new Date(row.created_at).toISOString()};}
 async list(actor:Actor,raw:SettlementListQuery={}){const query=settlementListQuerySchema.parse(raw);return this.tx(actor,async c=>{
  const rows=(await c.query(`SELECT w.*,q.snapshot AS quoted,e.external_id,e.account_id FROM marketing_campaign_workflows w JOIN marketing_finance_reservations r ON r.id=w.reservation_id AND r.status='RESERVED' JOIN marketing_finance_quotes q ON q.id=w.quote_id JOIN provider_entities e ON e.campaign_id=w.campaign_id AND e.entity_type='CAMPAIGN' AND e.provider=w.provider WHERE w.state IN ('PAUSED','PROVIDER_PAUSED') AND ($1::int IS NULL OR w.campaign_id<$1) AND ($2='' OR w.campaign_id::text=$2 OR w.draft->>'title' ILIKE $3 ESCAPE E'\\\\' OR w.listing_snapshot->>'title' ILIKE $3 ESCAPE E'\\\\') ORDER BY w.campaign_id DESC LIMIT 31`,[query.campaignBefore??null,query.search,contains(query.search)])).rows;
  const eligibleCampaigns:SettlementEligibleCampaign[]=rows.slice(0,30).map(r=>({campaignId:r.campaign_id,hostId:r.host_id,revision:r.revision,reservationId:r.reservation_id,title:r.draft.title,listingTitle:r.listing_snapshot.title,provider:r.provider,externalCampaignId:r.external_id,accountId:account(r.provider,r.account_id),currency:r.quoted.currency,flightStart:r.draft.startDate,flightEnd:r.draft.endDate,quoteCosts:r.quoted.costs,quotedTaxMinor:r.quoted.remittanceTaxMinor,markupBps:r.quoted.markupBps}));
  const proposals=(await c.query(`SELECT s.* FROM marketing_settlement_proposals s JOIN marketing_campaign_workflows w ON w.campaign_id=s.campaign_id WHERE ($1::uuid IS NULL OR (s.created_at,s.id)<(SELECT created_at,id FROM marketing_settlement_proposals WHERE id=$1)) AND ($2='' OR s.campaign_id::text=$2 OR s.id::text=$2 OR w.draft->>'title' ILIKE $3 ESCAPE E'\\\\' OR w.listing_snapshot->>'title' ILIKE $3 ESCAPE E'\\\\') ORDER BY s.created_at DESC,s.id DESC LIMIT 31`,[query.before??null,query.search,contains(query.search)])).rows;
  return {capabilities:this.capabilities(),currentOperatorId:actor.id,eligibleCampaigns,proposals:proposals.slice(0,30).map(r=>this.projection(r)),page:{nextCursor:proposals.length>30?proposals[29].id as string:null},campaignPage:{nextCursor:rows.length>30?rows[29].campaign_id as number:null}};
 });}
 async get(actor:Actor,id:string){return this.tx(actor,async c=>{const row=(await c.query('SELECT * FROM marketing_settlement_proposals WHERE id=$1',[id])).rows[0];if(!row)fail('SETTLEMENT_NOT_FOUND','Proposal not found',404);const review=(await c.query('SELECT reviewer_id,decision,evidence,created_at FROM marketing_settlement_reviews WHERE proposal_id=$1',[id])).rows[0];const documents=(await c.query('SELECT id,kind,issuer,account_id,external_document_id,currency,total_minor,period_start,period_end,issued_at,content_type,content_hash,uploaded_by,metadata FROM marketing_settlement_documents WHERE id=ANY($1::uuid[]) ORDER BY id',[row.snapshot.documents.map((d:{id:string})=>d.id)])).rows.map(d=>this.documentView(d));return {...this.projection(row),documents,review:review?{reviewerId:review.reviewer_id,decision:review.decision as 'APPROVE'|'REJECT',evidence:review.evidence as SettlementReviewInput,createdAt:new Date(review.created_at).toISOString()}:null};});}
 async review(actor:Actor,id:string,raw:unknown){
  const input=settlementReviewSchema.parse(raw);return this.tx(actor,async c=>{
   const candidate=(await c.query('SELECT * FROM marketing_settlement_proposals WHERE id=$1',[id])).rows[0];if(!candidate)fail('SETTLEMENT_NOT_FOUND','Proposal not found',404);
   await lockWorkflow(c,candidate.campaign_id,actor);const row=(await c.query('SELECT * FROM marketing_settlement_proposals WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(row.fingerprint!==input.fingerprint)fail('SETTLEMENT_FINGERPRINT_MISMATCH','Review the exact current evidence fingerprint');
   const prior=(await c.query('SELECT * FROM marketing_settlement_reviews WHERE proposal_id=$1',[id])).rows[0];if(prior){if(prior.reviewer_id!==actor.id||prior.fingerprint!==fingerprint(input))fail('SETTLEMENT_IDEMPOTENCY_CONFLICT','Review is already bound to another decision');return this.projection(row);}
   if(row.status!=='PENDING_REVIEW')fail('SETTLEMENT_STATE','Proposal is not pending independent review');
   const binding=await this.binding(c,actor,candidate.snapshot.input);
   if(row.prepared_by===actor.id||row.snapshot.documents.some((d:any)=>d.uploadedBy===actor.id))fail('SETTLEMENT_DUAL_CONTROL','The independent reviewer cannot prepare this proposal or upload its documents',403);
   if(!this.options.operatorIds.includes(row.prepared_by)||!(await c.query("SELECT id FROM users WHERE id=$1 AND role='admin' FOR SHARE",[row.prepared_by])).rows[0])fail('SETTLEMENT_OPERATOR_REQUIRED','The preparer must retain current financial administrator authority',403);
   const evidence=await this.validateEvidence(c,row.snapshot.input,binding);
   if(fingerprint(binding.snapshot)!==fingerprint(row.snapshot.binding)||fingerprint(evidence.documents)!==fingerprint(row.snapshot.documents))fail('SETTLEMENT_EVIDENCE_CHANGED','Campaign or source evidence changed after preparation');
   const expected=evidence.documents.map(d=>({id:d.id,sha256:d.sha256})).sort((a,b)=>a.id.localeCompare(b.id));const checked=[...input.checkedDocuments].sort((a,b)=>a.id.localeCompare(b.id));if(fingerprint(expected)!==fingerprint(checked))fail('SETTLEMENT_REVIEW_INCOMPLETE','Independently verify every exact document digest');
   await c.query('INSERT INTO marketing_settlement_reviews(id,proposal_id,reviewer_id,decision,evidence,fingerprint) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,actor.id,input.decision,stableJson(input),fingerprint(input)]);
   const updated=(await c.query('UPDATE marketing_settlement_proposals SET status=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,input.decision==='APPROVE'?'APPROVED':'REJECTED'])).rows[0];await event(c,binding.row,actor,'SETTLEMENT_REVIEWED',{proposalId:id,fingerprint:row.fingerprint,decision:input.decision,note:input.note});return this.projection(updated);
  });
 }
 private async observe(bindings:SettlementProviderBinding[]){
  if(!this.options.verifyStopped)fail('SETTLEMENT_PROVIDER_VERIFICATION_UNAVAILABLE','Authenticated provider stop verification is not configured',503);
  return Promise.all(bindings.map(async binding=>{let timer:ReturnType<typeof setTimeout>|undefined;try{
   const observed=await Promise.race([this.options.verifyStopped!(binding),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new MarketingError('SETTLEMENT_PROVIDER_VERIFICATION_UNAVAILABLE','Provider stop verification timed out',503)),15000);})]);
   if(fingerprint({provider:observed.provider,accountId:observed.accountId,externalCampaignId:observed.externalCampaignId,campaignId:observed.campaignId,revision:observed.revision})!==fingerprint(binding)||!['PAUSED','REMOVED','ARCHIVED'].includes(observed.configuredStatus)||!(/^[a-f0-9]{64}$/).test(observed.evidenceHash))fail('SETTLEMENT_PROVIDER_NOT_STOPPED','Provider stopped identity was not verified');
   const age=Date.now()-Date.parse(dateTime(observed.observedAt,'provider observation'));if(age<0||age>300000)fail('SETTLEMENT_PROVIDER_OBSERVATION_STALE','Fresh provider verification is required');return observed;
  }finally{if(timer)clearTimeout(timer);}}));
 }
 async settle(actor:Actor,id:string,raw:unknown,key:string){
  const input=settlementCommitSchema.parse(raw);identifier(key,'settlement commit key');const candidate=await this.get(actor,id);
  if(candidate.fingerprint!==input.fingerprint)fail('SETTLEMENT_FINGERPRINT_MISMATCH','Settlement must use the independently reviewed fingerprint');
  if(candidate.status==='SETTLED')return {...candidate.result,idempotent:true};
  if(candidate.status!=='APPROVED')fail('SETTLEMENT_REVIEW_REQUIRED','Independent documentary review is required before settlement');
  const observations=await this.observe(candidate.snapshot.binding.providers);
  return this.tx(actor,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`settlement-commit:${actor.id}:${key}`]);
   const sameKey=(await c.query('SELECT id FROM marketing_settlement_proposals WHERE committed_by=$1 AND commit_key=$2',[actor.id,key])).rows[0];if(sameKey&&sameKey.id!==id)fail('SETTLEMENT_IDEMPOTENCY_CONFLICT','Commit key already belongs to another proposal');
   await lockWorkflow(c,candidate.campaignId,actor);const row=(await c.query('SELECT * FROM marketing_settlement_proposals WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(row.status==='SETTLED')return {...row.settlement_result,idempotent:true};
   const binding=await this.binding(c,actor,candidate.snapshot.input);
   if(row.status!=='APPROVED'||row.fingerprint!==input.fingerprint)fail('SETTLEMENT_REVIEW_REQUIRED','Exact proposal approval is required');
   const review=(await c.query('SELECT * FROM marketing_settlement_reviews WHERE proposal_id=$1',[id])).rows[0];
   if(!review||review.decision!=='APPROVE'||review.reviewer_id===row.prepared_by||![row.prepared_by,review.reviewer_id].every(who=>this.options.operatorIds.includes(who))||(await c.query("SELECT id FROM users WHERE id=ANY($1::int[]) AND role='admin' FOR SHARE",[[row.prepared_by,review.reviewer_id]])).rows.length!==2)fail('SETTLEMENT_DUAL_CONTROL','Both independent financial administrators must retain current authority',403);
   const evidence=await this.validateEvidence(c,row.snapshot.input,binding);
   if(fingerprint(binding.snapshot)!==fingerprint(row.snapshot.binding)||fingerprint(evidence.documents)!==fingerprint(row.snapshot.documents))fail('SETTLEMENT_EVIDENCE_CHANGED','Evidence or provider operations changed since approval');
   const finalAt=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now.toISOString();
   if(observations.some(o=>Date.parse(finalAt)-Date.parse(o.observedAt)>300000))fail('SETTLEMENT_PROVIDER_OBSERVATION_STALE','Provider observation expired before accounting commit');
   const settlement:VerifiedCampaignSettlement={reservationId:row.reservation_id,evidenceId:`documentary-close:${id}`,evidenceHash:fingerprint({proposal:row.fingerprint,review:review.fingerprint,observations}),closedAuthorizations:binding.authorizations,costs:row.snapshot.input.allocations.map((a:any)=>({code:a.code,amountMinor:a.amountMinor})),remittanceTaxMinor:row.snapshot.input.remittanceTaxMinor,finalAt};
   const result=await new MarketingFinanceService(this.pool,{actorContext:actor}).reconcileInTransaction(c,settlement);
   for(const claim of evidence.claims)await c.query('INSERT INTO marketing_settlement_allocations(proposal_id,document_id,cost_code,amount_minor) VALUES($1,$2,$3,$4)',[id,claim.documentId,claim.code,claim.amountMinor]);
   const saved={...result,currency:binding.quote.currency,proposalId:id,accountingCloseSource:'DUAL_CONTROL_MANUAL_BILLING_EVIDENCE',providerAbsoluteFinality:false};await c.query("UPDATE marketing_settlement_proposals SET status='SETTLED',settlement_result=$2,commit_key=$3,committed_by=$4,updated_at=now() WHERE id=$1",[id,stableJson(saved),key,actor.id]);
   await event(c,binding.row,actor,'CAMPAIGN_FINANCIAL_SETTLEMENT',{proposalId:id,requestKey:key,proposalFingerprint:row.fingerprint,reviewerId:review.reviewer_id,observations,result:saved});return saved;
  });
 }
 async withdraw(actor:Actor,id:string,fingerprintValue:string,reason:string){
  if(typeof reason!=='string'||reason.trim().length<20||reason.length>3000)fail('SETTLEMENT_REASON_REQUIRED','Record a meaningful withdrawal reason',422);
  return this.tx(actor,async c=>{const initial=(await c.query('SELECT * FROM marketing_settlement_proposals WHERE id=$1',[id])).rows[0];if(!initial)fail('SETTLEMENT_NOT_FOUND','Proposal not found',404);const workflow=await lockWorkflow(c,initial.campaign_id,actor);const row=(await c.query('SELECT * FROM marketing_settlement_proposals WHERE id=$1 FOR UPDATE',[id])).rows[0];if(row.fingerprint!==fingerprintValue||!['PENDING_REVIEW','APPROVED'].includes(row.status))fail('SETTLEMENT_STATE','Only the exact unsettled proposal can be withdrawn');const updated=(await c.query("UPDATE marketing_settlement_proposals SET status='REJECTED',updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];await event(c,workflow,actor,'SETTLEMENT_WITHDRAWN',{proposalId:id,fingerprint:fingerprintValue,reason:reason.trim()});return this.projection(updated);});
 }
 async hostSummary(actor:Actor,campaignId:number){return inTransaction(this.pool,actor,async c=>{const row=(await c.query('SELECT campaign_id,host_id FROM marketing_campaign_workflows WHERE campaign_id=$1 AND ($2 OR host_id=$3)',[campaignId,actor.role==='admin',actor.id])).rows[0];if(!row)fail('CAMPAIGN_NOT_FOUND','Campaign not found',404);const latest=(await c.query('SELECT status,settlement_result,created_at FROM marketing_settlement_proposals WHERE campaign_id=$1 ORDER BY created_at DESC,id LIMIT 1',[campaignId])).rows[0];return latest?{status:latest.status,result:latest.status==='SETTLED'?latest.settlement_result:null,createdAt:latest.created_at}:{status:'AWAITING_BILLING_EVIDENCE',result:null};});}
}
