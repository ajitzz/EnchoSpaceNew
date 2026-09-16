import {z} from 'zod';
import {MarketingError,minorAmount,publicOrigin} from './domain.js';
import {validateCostPolicy,type CostPolicyV1} from './financeQuote.js';
export interface CampaignCostRule{code:string;label:string;base:'FIXED'|'MEDIA'|'CHARGE';fixedMinor:string;rateBps:number;}
export interface MarketingRuntimeConfig{
 origin:string;mediaOrigins:string[];currency:'INR'|'USD';markupBps:number;financialPolicy:CostPolicyV1|null;policyAdminId:number|null;
 costRules:CampaignCostRule[];remittanceTax:{base:'NONE'|'PROFIT'|'COST_PLUS_PROFIT';rateBps:number};
 fundingEnabled:boolean;publishingEnabled:boolean;activationEnabled:boolean;providerClearance:Partial<Record<'META'|'GOOGLE',string>>;checkoutAcceptanceReference:string|null;
 meta:{countries:string[];placements:string[];specialAdCategories:string[]};
 settlement?:{operatorIds:number[];policyReference:string;documentOrigins?:Partial<Record<'GOOGLE'|'META'|'STRIPE'|'RAZORPAY'|'ACCOUNTANT',string[]>>;googleInvoices?:{billingSetup:string;payingManagerCustomerId:string;monthlyInvoicingReference:string}};
 conversions?:{google?:{customerId:string;conversionActionId:string};meta?:{pixelId:string}};
}
const settlementConfig=z.object({operatorIds:z.array(z.number().int().positive().safe()).min(2).max(20).refine(ids=>new Set(ids).size===ids.length),policyReference:z.string().trim().min(10).max(255),documentOrigins:z.object({GOOGLE:z.array(z.string()).max(5).optional(),META:z.array(z.string()).max(5).optional(),STRIPE:z.array(z.string()).max(5).optional(),RAZORPAY:z.array(z.string()).max(5).optional(),ACCOUNTANT:z.array(z.string()).max(5).optional()}).strict().optional(),googleInvoices:z.object({billingSetup:z.string().regex(/^customers\/\d{10}\/billingSetups\/[1-9]\d{0,29}$/),payingManagerCustomerId:z.string().regex(/^\d{10}$/),monthlyInvoicingReference:z.string().trim().min(10).max(255)}).strict().optional()}).strict();
const conversionConfig=z.object({google:z.object({customerId:z.string().regex(/^\d{10}$/),conversionActionId:z.string().regex(/^[1-9]\d{0,29}$/)}).strict().optional(),meta:z.object({pixelId:z.string().regex(/^[1-9]\d{0,29}$/)}).strict().optional()}).strict();
const schema=z.object({origin:z.string(),mediaOrigins:z.array(z.string()).max(20),currency:z.enum(['INR','USD']),markupBps:z.number().int().min(300).max(500),financialPolicy:z.any(),policyAdminId:z.number().int().positive(),costRules:z.array(z.object({code:z.string().regex(/^[A-Z][A-Z0-9_]{0,49}$/),label:z.string().min(1).max(100),base:z.enum(['FIXED','MEDIA','CHARGE']),fixedMinor:minorAmount,rateBps:z.number().int().min(0).max(5000)}).strict()).max(50),remittanceTax:z.object({base:z.enum(['NONE','PROFIT','COST_PLUS_PROFIT']),rateBps:z.number().int().min(0).max(5000)}).strict(),fundingEnabled:z.boolean(),publishingEnabled:z.boolean(),activationEnabled:z.boolean(),providerClearance:z.object({META:z.string().min(10).optional(),GOOGLE:z.string().min(10).optional()}).strict(),checkoutAcceptanceReference:z.string().min(10).nullable(),meta:z.object({countries:z.array(z.string().regex(/^[A-Z]{2}$/)).max(20),placements:z.array(z.enum(['FACEBOOK_FEED','FACEBOOK_REELS','INSTAGRAM_FEED','INSTAGRAM_REELS'])).max(4),specialAdCategories:z.array(z.literal('HOUSING')).max(1)}).strict(),settlement:settlementConfig.optional(),conversions:conversionConfig.optional()}).strict();
const testingCostPolicy: CostPolicyV1 = {
  id: 'testing-policy-v1',
  version: 1,
  currency: 'INR',
  costCodes: [
    { code: 'META_MEDIA', kind: 'MEDIA', provider: 'META' },
    { code: 'GOOGLE_MEDIA', kind: 'MEDIA', provider: 'GOOGLE' },
    { code: 'PROCESSING', kind: 'SERVICE' },
    { code: 'COST_TAX', kind: 'NONRECOVERABLE_TAX' }
  ],
  accountingApprovalReference: 'testing-accounting',
  taxApprovalReference: 'testing-tax',
  costScopeReference: 'testing-scope',
  rounding: 'HALF_UP',
  varianceHandling: 'PLATFORM_ABSORBS_OVERRUN',
  markupMinBps: 300,
  markupMaxBps: 500
};

/** Explicit operator policy; a missing config supplies no permission to fund or spend. */
export function readMarketingConfig(raw=process.env.HARVO_MARKETING_CONFIG):MarketingRuntimeConfig{
 if(!raw)return {origin:process.env.GOOGLE_ADS_LANDING_ORIGIN||'',mediaOrigins:[],currency:'INR',markupBps:500,financialPolicy:testingCostPolicy,policyAdminId:1,costRules:[{code:'PROCESSING',label:'Processing Fee',base:'FIXED',fixedMinor:'0',rateBps:0},{code:'COST_TAX',label:'Taxes',base:'FIXED',fixedMinor:'0',rateBps:0}],remittanceTax:{base:'NONE',rateBps:0},fundingEnabled:true,publishingEnabled:true,activationEnabled:true,providerClearance:{META:'testing-clearance',GOOGLE:'testing-clearance'},checkoutAcceptanceReference:'testing-checkout',meta:{countries:['IN'],placements:[],specialAdCategories:[]}};
 try{const c=schema.parse(JSON.parse(raw));c.origin=publicOrigin(c.origin);c.mediaOrigins=c.mediaOrigins.map(x=>publicOrigin(x));if(c.settlement?.documentOrigins)for(const origins of Object.values(c.settlement.documentOrigins))if(origins)origins.forEach((origin,index)=>{origins[index]=publicOrigin(origin);});validateCostPolicy(c.financialPolicy);if(c.financialPolicy.currency!==c.currency)throw new Error();if(c.activationEnabled&&!c.checkoutAcceptanceReference)throw new Error();return c as MarketingRuntimeConfig;}catch{throw new MarketingError('MARKETING_CONFIG_INVALID','Marketing operator configuration is invalid. Check the documented schema without exposing credentials.',503);}
}
export function calculateCampaignCosts(config:MarketingRuntimeConfig,provider:'META'|'GOOGLE',mediaMinor:string,markupBps:number){
 const policy=config.financialPolicy;if(!policy)throw new MarketingError('COST_POLICY_REQUIRED','A registered, documented campaign cost and tax policy is required',503);
 const media=BigInt(mediaMinor);const round=(n:bigint,bps:number)=>(n*BigInt(bps)+5000n)/10000n;
 const categories=policy.costCodes;
 if(categories.filter(c=>c.kind==='MEDIA'&&c.provider===provider).length!==1)throw new MarketingError('COST_MEDIA_ALLOCATION_INVALID','Exactly one media cost category is required for this provider',503);
 const rules=new Map(config.costRules.map(r=>[r.code,r]));
 if(rules.size!==config.costRules.length||categories.filter(c=>c.kind!=='MEDIA').some(c=>!rules.has(c.code))||config.costRules.some(r=>!categories.some(c=>c.kind!=='MEDIA'&&c.code===r.code)))throw new MarketingError('COST_POLICY_INCOMPLETE','Every non-media cost category needs one explicit calculation rule',503);
 let charge=media;let costs:{code:string;amountMinor:string}[]=[];let tax=0n;
 for(let i=0;i<256;i++){
  costs=categories.map(c=>{if(c.kind==='MEDIA')return {code:c.code,amountMinor:c.provider===provider?media.toString():'0'};const r=rules.get(c.code)!;const amount=BigInt(r.fixedMinor)+round(r.base==='MEDIA'?media:r.base==='CHARGE'?charge:0n,r.rateBps);return {code:c.code,amountMinor:amount.toString()};});
  const cost=costs.reduce((a,c)=>a+BigInt(c.amountMinor),0n);const profit=round(cost,markupBps);tax=round(config.remittanceTax.base==='PROFIT'?profit:config.remittanceTax.base==='COST_PLUS_PROFIT'?cost+profit:0n,config.remittanceTax.rateBps);
  const next=cost+profit+tax;if(next>9007199254740991n)throw new MarketingError('COST_LIMIT','Campaign total exceeds supported checkout limits');if(next===charge)return {costs,remittanceTaxMinor:tax.toString()};charge=next;
 }
 throw new MarketingError('COST_POLICY_NONCONVERGENT','Charge-dependent cost rules do not converge to a supported quote',503);
}
