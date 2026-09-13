import type {MarketingRuntimeConfig} from './config.js';

export interface ReadinessCheck {name:string;status:'PRESENT_UNVERIFIED'|'MISSING'|'DISABLED'|'CONFIGURED';}
/** Presence checks expose names only. They are not account, legal or delivery verification. */
export function marketingReadiness(config:MarketingRuntimeConfig,env:NodeJS.ProcessEnv):ReadinessCheck[]{
 const present=(key:string)=>typeof env[key]==='string'&&!!env[key]!.trim()&&!/^(?:dummy|placeholder|your[_ -]|replace[_ -])/i.test(env[key]!);
 const keys=['DATABASE_URL','JWT_SECRET','GEMINI_API_KEY','GEMINI_MARKETING_MODEL','GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_CUSTOMER_ID','META_ACCESS_TOKEN','META_APP_SECRET','META_MARKETING_WEBHOOK_VERIFY_TOKEN','META_AD_ACCOUNT_ID','META_PAGE_ID','META_PIXEL_ID',...(config.meta.placements.some(p=>p.startsWith('INSTAGRAM'))?['META_INSTAGRAM_ACCOUNT_ID']:[]),...(config.currency==='INR'?['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_ACCOUNT_ID','RAZORPAY_MARKETING_WEBHOOK_SECRET']:['STRIPE_SECRET_KEY','STRIPE_ACCOUNT_ID','STRIPE_MARKETING_WEBHOOK_SECRET'])];
 const checks:ReadinessCheck[]=keys.map(name=>({name,status:present(name)||(name==='META_ACCESS_TOKEN'&&present('META_API_TOKEN'))?'PRESENT_UNVERIFIED':'MISSING'}));
 for(const [name,value] of Object.entries({financialPolicy:!!config.financialPolicy,serviceActor:!!config.policyAdminId,checkoutAcceptance:!!config.checkoutAcceptanceReference,googleClearance:!!config.providerClearance.GOOGLE,metaClearance:!!config.providerClearance.META,settlementOperators:new Set(config.settlement?.operatorIds??[]).size>=2,settlementPolicy:!!config.settlement?.policyReference,googleConversionDestination:!!config.conversions?.google,metaConversionDestination:!!config.conversions?.meta,dataManagerRefreshGrant:present('HARVO_GOOGLE_DATA_MANAGER_REFRESH_TOKEN')}))checks.push({name,status:value?'PRESENT_UNVERIFIED':'MISSING'});
 // The default application runtime does not connect these accepted code-level ports.
 // Environment strings cannot certify a canonical captured booking or current consent.
 checks.push({name:'canonicalBookingVerifier',status:'MISSING'},{name:'canonicalAttributionConsentResolver',status:'MISSING'});
 for(const name of ['fundingEnabled','publishingEnabled','activationEnabled'] as const)checks.push({name,status:config[name]?'CONFIGURED':'DISABLED'});
 return checks;
}
