import { hasAsciiControl } from '../intentionalText.js';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {MarketingError} from './domain.js';
import {fingerprint} from './financeQuote.js';

const MAX_BYTES=5*1024*1024;
const MONTHS=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'] as const;
const customer=z.string().regex(/^\d{10}$/);
export const googleInvoiceImportSchema=z.object({issueYear:z.number().int().min(2019).max(9999),issueMonth:z.number().int().min(1).max(12)}).strict();
export type GoogleInvoiceImportInput=z.infer<typeof googleInvoiceImportSchema>;
export interface GoogleInvoiceImporterOptions {
 servingCustomerId:string;billingSetup:string;payingManagerCustomerId:string;currency:'INR'|'USD';monthlyInvoicingReference:string;
 accessToken:()=>Promise<string>;developerToken:string;
}
export interface GoogleInvoiceEvidence {
 protocol:'HARVO_GOOGLE_INVOICE_OBSERVATION_V1';apiVersion:'v25';servingCustomerId:string;billingSetup:string;payingManagerCustomerId:string;
 monthlyInvoicingReference:string;invoiceResourceName:string;invoiceFingerprint:string;invoiceType:'INVOICE';amountBasis:'INVOICE_GROSS_TOTAL';
 amountsMicros:Record<string,string|null>;correctedInvoice:string|null;replacedInvoices:string[];
 coveredCustomerIds:string[];accountBudgets:string[];campaignAllocation:'INDEPENDENT_EVIDENCE_REQUIRED';
 automaticProviderFinality:false;responseSha256:string;requestId:string|null;observedAt:string;
 issueYear:number;issueMonth:number;issueDate:string;issuedAtPrecision:'DAY';
}
export interface GoogleInvoiceDocument {
 externalDocumentId:string;accountId:string;currency:'INR'|'USD';totalMinor:string;
 periodStart:string;periodEnd:string;issuedAt:string;evidence:GoogleInvoiceEvidence;
}
export interface GoogleInvoiceObservation {
 bytes:Buffer;sha256:string;sourceUrl:string;observedAt:string;invoices:GoogleInvoiceDocument[];
}
function fail(code:string,message:string,status=422):never{throw new MarketingError(code,message,status);}
const object=(value:unknown):value is Record<string,any>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const date=(value:unknown):string=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('GOOGLE_INVOICE_INVALID_RESPONSE','Invoice date evidence is invalid');
 return value as string;
};
const micros=(value:unknown,required=false):string|null=>{
 if(value===undefined&&!required)return null;
 if(typeof value!=='string'||! /^-?(0|[1-9]\d{0,18})$/.test(value)||value==='-0'||BigInt(value)<-9223372036854775808n||BigInt(value)>9223372036854775807n)fail('GOOGLE_INVOICE_INVALID_RESPONSE','Invoice amount must be an exact signed integer in micros');
 return value as string;
};
const list=(value:unknown,max=1000):any[]=>{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>max)fail('GOOGLE_INVOICE_INVALID_RESPONSE','Invoice list is malformed or exceeds its bounded import limit');
 return value as any[];
};
const amountFields=['subtotalAmountMicros','taxAmountMicros','totalAmountMicros','adjustmentsSubtotalAmountMicros','adjustmentsTaxAmountMicros','adjustmentsTotalAmountMicros','regulatoryCostsSubtotalAmountMicros','regulatoryCostsTaxAmountMicros','regulatoryCostsTotalAmountMicros','exportChargeSubtotalAmountMicros','exportChargeTaxAmountMicros','exportChargeTotalAmountMicros'] as const;

/** Read-only, explicitly configured monthly invoice transport. It never maps campaign descriptions to IDs. */
export class GoogleInvoiceImporter {
 private readonly options:GoogleInvoiceImporterOptions;
 private readonly transport:typeof fetch;
 private readonly timeoutMs:number;
 constructor(options:GoogleInvoiceImporterOptions,dependencies:{fetch?:typeof fetch;timeoutMs?:number}={}){
  if(!customer.safeParse(options.servingCustomerId).success||!customer.safeParse(options.payingManagerCustomerId).success||options.servingCustomerId===options.payingManagerCustomerId||
   !new RegExp(`^customers/${options.servingCustomerId}/billingSetups/[1-9]\\d{0,29}$`).test(options.billingSetup)||!['INR','USD'].includes(options.currency)||
   typeof options.monthlyInvoicingReference!=='string'||options.monthlyInvoicingReference.trim().length<10||options.monthlyInvoicingReference.length>255||hasAsciiControl(options.monthlyInvoicingReference, true)||
   typeof options.accessToken!=='function'||typeof options.developerToken!=='string'||!options.developerToken.trim()||options.developerToken.length>8192||/[\r\n]/.test(options.developerToken))
   fail('GOOGLE_INVOICE_CONFIGURATION_REQUIRED','Explicit monthly-invoicing, serving account, billing setup and paying-manager configuration is required',503);
  this.timeoutMs=dependencies.timeoutMs??30000;
  if(!Number.isInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>60000)fail('GOOGLE_INVOICE_CONFIGURATION_REQUIRED','Invoice timeout must be bounded',503);
  this.options={...options};this.transport=dependencies.fetch??globalThis.fetch.bind(globalThis);
 }
 binding(){const {servingCustomerId,billingSetup,payingManagerCustomerId,currency,monthlyInvoicingReference}=this.options;return {servingCustomerId,billingSetup,payingManagerCustomerId,currency,monthlyInvoicingReference};}
 async read(raw:unknown):Promise<GoogleInvoiceObservation>{
  const input=googleInvoiceImportSchema.parse(raw),today=new Date();
  if(input.issueYear>today.getUTCFullYear()||input.issueYear===today.getUTCFullYear()&&input.issueMonth>today.getUTCMonth()+1)fail('GOOGLE_INVOICE_PERIOD_INVALID','Future invoice issue months cannot be imported');
  const url=new URL(`https://googleads.googleapis.com/v25/customers/${this.options.servingCustomerId}/invoices`);
  url.search=new URLSearchParams({billingSetup:this.options.billingSetup,issueYear:String(input.issueYear),issueMonth:MONTHS[input.issueMonth-1],includeGranularLevelInvoiceDetails:'true'}).toString();
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([
   this.request(url,controller.signal).then(({bytes,requestId})=>this.parse(bytes,url.toString(),requestId,input)),
   new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new MarketingError('GOOGLE_INVOICE_TIMEOUT','Invoice observation timed out; no financial close was performed',503));},this.timeoutMs);}),
  ]);}finally{if(timer)clearTimeout(timer);}
 }
 private async request(url:URL,signal:AbortSignal){
  let token:string;
  try{token=await this.options.accessToken();}catch{fail('GOOGLE_INVOICE_AUTHENTICATION_REQUIRED','Invoice OAuth access could not be established',503);}
  if(signal.aborted)fail('GOOGLE_INVOICE_TIMEOUT','Invoice observation timed out',503);
  if(typeof token!=='string'||!token||token.length>16384||/[\r\n]/.test(token))fail('GOOGLE_INVOICE_AUTHENTICATION_REQUIRED','Invoice OAuth access could not be established',503);
  let response:Response;
  try{response=await this.transport(url.toString(),{method:'GET',redirect:'error',signal,headers:{Authorization:`Bearer ${token}`,'developer-token':this.options.developerToken,'login-customer-id':this.options.payingManagerCustomerId,Accept:'application/json'}});}catch{fail('GOOGLE_INVOICE_UNAVAILABLE','Invoice observation could not be completed',503);}
  if(response.redirected||response.url&&response.url!==url.toString())fail('GOOGLE_INVOICE_INVALID_RESPONSE','Invoice response came from an unexpected endpoint',502);
  if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))fail('GOOGLE_INVOICE_INVALID_RESPONSE','Invoice response must be JSON',502);
  const length=response.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||BigInt(length)>BigInt(MAX_BYTES)))fail('GOOGLE_INVOICE_RESPONSE_TOO_LARGE','Invoice evidence exceeds 5 MiB',502);
  if(!response.body)fail('GOOGLE_INVOICE_INVALID_RESPONSE','Invoice response body is missing',502);
  const reader=response.body.getReader(),chunks:Buffer[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_BYTES)fail('GOOGLE_INVOICE_RESPONSE_TOO_LARGE','Invoice evidence exceeds 5 MiB',502);chunks.push(Buffer.from(part.value));}}
  catch(error){if(error instanceof MarketingError)throw error;fail('GOOGLE_INVOICE_UNAVAILABLE','Invoice response bytes could not be read',503);}
  finally{void reader.cancel().catch(()=>undefined);}
  const bytes=Buffer.concat(chunks);
  if(!response.ok){
   let value:any;try{value=JSON.parse(bytes.toString('utf8'));}catch{ /* No provider body or credentials are exposed in errors. */ }
   const errors=Array.isArray(value?.error?.details)?value.error.details.flatMap((d:any)=>Array.isArray(d?.errors)?d.errors:[]):[];
   if(errors.some((e:any)=>e.errorCode?.invoiceError==='NOT_INVOICED_CUSTOMER'))fail('GOOGLE_INVOICE_MONTHLY_INVOICING_UNSUPPORTED','Google confirms this customer does not receive monthly invoices; use independently sourced billing documents',409);
   if(response.status===401||response.status===403)fail('GOOGLE_INVOICE_ACCESS_REQUIRED','The configured Google identity cannot read this billing setup; verify paying-manager and invoice permissions',403);
   fail('GOOGLE_INVOICE_UNAVAILABLE','Google could not supply this invoice observation',503);
  }
  const header=response.headers.get('request-id');return {bytes,requestId:header&&/^[A-Za-z0-9_.:-]{1,255}$/.test(header)?header:null};
 }
 private parse(bytes:Buffer,sourceUrl:string,requestId:string|null,input:GoogleInvoiceImportInput):GoogleInvoiceObservation{
  let data:any;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('GOOGLE_INVOICE_INVALID_RESPONSE','Invoice JSON is invalid',502);}
  if(!object(data)||data.error||Object.keys(data).some(k=>k!=='invoices'))fail('GOOGLE_INVOICE_INVALID_RESPONSE','Invoice response shape is invalid',502);
  const invoices=list(data.invoices,25);
  if(invoices.length*bytes.length>20*1024*1024)fail('GOOGLE_INVOICE_RESPONSE_TOO_LARGE','Retained invoice batch exceeds 20 MiB',502);
  const observedAt=new Date().toISOString(),sha256=createHash('sha256').update(bytes).digest('hex');
  const binding=this.binding(),resourcePrefix=`customers/${binding.servingCustomerId}/invoices/`,seen=new Set<string>();
  const invoiceResource=(value:unknown)=>typeof value==='string'&&value.startsWith(resourcePrefix)&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.slice(resourcePrefix.length));
  const documents=invoices.map((invoice):GoogleInvoiceDocument=>{
   if(!object(invoice)||!invoiceResource(invoice.resourceName)||invoice.id!==invoice.resourceName.slice(resourcePrefix.length)||seen.has(invoice.resourceName))fail('GOOGLE_INVOICE_IDENTITY_MISMATCH','Invoice identity is invalid, duplicated or belongs to another serving account');
   seen.add(invoice.resourceName);
   if(invoice.billingSetup!==binding.billingSetup)fail('GOOGLE_INVOICE_BILLING_SETUP_MISMATCH','Invoice billing setup differs from the explicit configured authority');
   if(invoice.currencyCode!==binding.currency)fail('GOOGLE_INVOICE_CURRENCY_UNSUPPORTED','Invoice currency differs from the configured accounting currency');
   if(invoice.type!=='INVOICE')fail('GOOGLE_INVOICE_CREDIT_REVIEW_REQUIRED','Credit memos and unknown invoice types require a separate signed correction review; no credit is posted');
   const issue=date(invoice.issueDate),start=date(invoice.serviceDateRange?.startDate),end=date(invoice.serviceDateRange?.endDate);
   if(issue.slice(0,7)!==`${input.issueYear}-${String(input.issueMonth).padStart(2,'0')}`||end<start||issue<end||issue>observedAt.slice(0,10))fail('GOOGLE_INVOICE_PERIOD_INVALID','Invoice issue and service dates do not match the requested completed period');
   const amounts=Object.fromEntries(amountFields.map(field=>[field,micros(invoice[field],['subtotalAmountMicros','taxAmountMicros','totalAmountMicros'].includes(field))]));
   const total=BigInt(amounts.totalAmountMicros!);
   if(total<=0n)fail('GOOGLE_INVOICE_CREDIT_REVIEW_REQUIRED','Non-positive invoice amounts require separate signed correction review');
   if(total%10000n!==0n)fail('GOOGLE_INVOICE_MINOR_UNIT_REVIEW_REQUIRED','Invoice gross micros cannot be represented exactly in the configured minor units; no rounding is inferred');
   const budgets=list(invoice.accountBudgetSummaries),accounts=list(invoice.accountSummaries);
   if(!budgets.length&&!accounts.length)fail('GOOGLE_INVOICE_ACCOUNT_COVERAGE_REQUIRED','Explicit invoice account coverage is required');
   if([...budgets,...accounts].some(summary=>!object(summary)||summary.customer!==`customers/${binding.servingCustomerId}`))fail('GOOGLE_INVOICE_CONSOLIDATED_REVIEW_REQUIRED','Consolidated other-account invoices require separate review and cannot be attributed to this serving account');
   const accountBudgets=budgets.map(summary=>{
    if(typeof summary.accountBudget!=='string'||!new RegExp(`^customers/${binding.servingCustomerId}/accountBudgets/[1-9]\\d{0,29}$`).test(summary.accountBudget))fail('GOOGLE_INVOICE_ACCOUNT_COVERAGE_REQUIRED','Invoice account-budget identity is invalid');
    const rangeStart=date(summary.billableActivityDateRange?.startDate),rangeEnd=date(summary.billableActivityDateRange?.endDate);
    if(rangeStart<start||rangeEnd>end||rangeEnd<rangeStart)fail('GOOGLE_INVOICE_PERIOD_INVALID','Account-budget dates extend outside invoice coverage');
    // Granular descriptions are retained in raw evidence, never matched to campaign IDs.
    list(summary.campaignSummaries);
    return summary.accountBudget as string;
   });
   const corrected=invoice.correctedInvoice||null,replaced=list(invoice.replacedInvoices,100);
   if(corrected&&!invoiceResource(corrected)||replaced.some(value=>!invoiceResource(value))||corrected&&replaced.length)fail('GOOGLE_INVOICE_IDENTITY_MISMATCH','Invoice correction links do not match this serving account');
   if(invoice.pdfUrl){let pdf:URL;try{pdf=new URL(invoice.pdfUrl);}catch{fail('GOOGLE_INVOICE_INVALID_RESPONSE','Invoice PDF provenance is invalid');}
    if(pdf!.protocol!=='https:'||pdf!.username||pdf!.password||pdf!.port||pdf!.hash||!(pdf!.hostname==='google.com'||pdf!.hostname.endsWith('.google.com'))||[...pdf!.searchParams.keys()].some(k=>/token|secret|password|signature|key/i.test(k)))fail('GOOGLE_INVOICE_INVALID_RESPONSE','Invoice PDF URL contains unsupported provenance or credentials');}
   return {externalDocumentId:invoice.id,accountId:binding.servingCustomerId,currency:binding.currency,totalMinor:(total/10000n).toString(),periodStart:start,periodEnd:end,issuedAt:`${issue}T00:00:00.000Z`,evidence:{protocol:'HARVO_GOOGLE_INVOICE_OBSERVATION_V1',apiVersion:'v25',...binding,invoiceResourceName:invoice.resourceName,invoiceFingerprint:fingerprint(invoice),invoiceType:'INVOICE',amountBasis:'INVOICE_GROSS_TOTAL',amountsMicros:amounts,correctedInvoice:corrected,replacedInvoices:replaced,coveredCustomerIds:[binding.servingCustomerId],accountBudgets:[...new Set(accountBudgets)],campaignAllocation:'INDEPENDENT_EVIDENCE_REQUIRED',automaticProviderFinality:false,responseSha256:sha256,requestId,observedAt,...input,issueDate:issue,issuedAtPrecision:'DAY'}};
  });
  return {bytes,sha256,sourceUrl,observedAt,invoices:documents};
 }
}
