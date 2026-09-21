import {CorridorInferenceWorker} from '../../lib/marketing/adtech/inference.js';
import {CampaignStrategyBindings} from '../../lib/marketing/adtech/bindings.js';
import {CampaignOutcomes} from '../../lib/marketing/portfolio/outcomes.js';
import {SpatialStories} from '../../lib/marketing/portfolio/spatialStories.js';
import {DestinationPools} from '../../lib/marketing/portfolio/pools.js';
import {MarketingTouchpoints} from '../../lib/marketing/portfolio/touchpoints.js';
import {MarketingAttributionLinks} from '../../lib/marketing/portfolio/attribution.js';
import {MarketingPreflight} from '../../lib/marketing/portfolio/preflight.js';
import {SearchPortfolioConflictAnalyzer} from '../../lib/marketing/portfolio/shadow.js';
import {KeywordResearchService} from '../../lib/marketing/portfolio/keywordResearch.js';
import {GoogleKeywordResearchAdapter} from '../../lib/providers/google/keywordResearch.js';
import {CanonicalMarketingFacts} from '../../lib/marketing/portfolio/facts.js';
import {MetaMarketingEvents} from '../../lib/marketing/metaEvents.js';
import type pg from 'pg';
import {readMarketingConfig} from '../../lib/marketing/config.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {CampaignRefundGateway} from '../../lib/marketing/refunds.js';
import {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {MarketingEngine} from '../../lib/marketing/engine.js';
import {actorPool} from '../../lib/marketing/database.js';
import {MarketingTargetingService} from '../../lib/marketing/targeting.js';
import {MarketingSettlementService} from '../../lib/marketing/settlementService.js';
import {settlementStopReader} from '../../lib/marketing/settlementProviderRead.js';
import {MarketingPauseRecovery} from '../../lib/marketing/pauseRecovery.js';
import {createConversionConsumer,type ConversionConsumerOptions} from '../../lib/marketing/conversions/consumer.js';
import {GoogleAdsClient} from '../../lib/providers/google/GoogleAdsClient.js';
import {CampaignDraftGuidance} from '../../lib/marketing/guidance.js';
import {GoogleInvoiceImporter} from '../../lib/marketing/googleInvoiceImport.js';
import {createMediaUploadS3Client} from '../../lib/immutableS3Upload.js';
import {CampaignImagePreparer} from '../../lib/marketing/creativeImages.js';
import {ImmutableCreativeStorage} from '../../lib/marketing/creativeStorage.js';
import {createCreativeCdnVerifier} from '../../lib/marketing/creativeCdn.js';
import {CreativeWorkflowService} from '../../lib/marketing/creativeWorkflow.js';
export function createMarketingRuntime(pool:pg.Pool,authorities:Pick<ConversionConsumerOptions,'verifyBooking'|'resolveAttribution'>={}){
 const config=readMarketingConfig();
 const scoped=config.policyAdminId?actorPool(pool,{id:config.policyAdminId,role:'system'}):pool;
 const payments=new CampaignPaymentGateway(scoped,{origin:config.origin,stripeKey:process.env.STRIPE_SECRET_KEY,stripeWebhookSecret:process.env.STRIPE_MARKETING_WEBHOOK_SECRET,stripeAccountId:process.env.STRIPE_ACCOUNT_ID,razorpayKey:process.env.RAZORPAY_KEY_ID,razorpaySecret:process.env.RAZORPAY_KEY_SECRET,razorpayWebhookSecret:process.env.RAZORPAY_MARKETING_WEBHOOK_SECRET,razorpayAccountId:process.env.RAZORPAY_ACCOUNT_ID});
 const refunds=config.policyAdminId?new CampaignRefundGateway(pool,{actorContext:{id:config.policyAdminId,role:'system'},stripeKey:process.env.STRIPE_SECRET_KEY,stripeAccountId:process.env.STRIPE_ACCOUNT_ID,razorpayKey:process.env.RAZORPAY_KEY_ID,razorpaySecret:process.env.RAZORPAY_KEY_SECRET,razorpayAccountId:process.env.RAZORPAY_ACCOUNT_ID}):undefined;
 const attribution=config.policyAdminId&&process.env.HARVO_ATTRIBUTION_KEYS?new MarketingAttributionLinks(pool,{id:config.policyAdminId,role:'system'},config.origin,JSON.parse(process.env.HARVO_ATTRIBUTION_KEYS)):undefined;
 const finance=new WorkflowFinance(pool,config,payments,(c,row)=>pools.executionQuoteProduct(c,row));
 const targeting=new MarketingTargetingService(undefined,config.meta.countries);
 const guidance=new CampaignDraftGuidance({apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MARKETING_MODEL});
 const googleAccount=process.env.GOOGLE_ADS_CUSTOMER_ID?.replaceAll('-','');
 const metaAccount=process.env.META_AD_ACCOUNT_ID?.replace(/^act_/,'');
 const metaToken=process.env.META_ACCESS_TOKEN||process.env.META_API_TOKEN;
 const invoiceConfig=config.settlement?.googleInvoices;
 const invoiceClient=new GoogleAdsClient();
 const googleInvoices=invoiceConfig&&googleAccount&&process.env.GOOGLE_ADS_DEVELOPER_TOKEN&&process.env.GOOGLE_ADS_REFRESH_TOKEN&&process.env.GOOGLE_ADS_CLIENT_ID&&process.env.GOOGLE_ADS_CLIENT_SECRET?new GoogleInvoiceImporter({...invoiceConfig,servingCustomerId:googleAccount,currency:config.currency,accessToken:()=>invoiceClient.getFreshAccessToken(),developerToken:process.env.GOOGLE_ADS_DEVELOPER_TOKEN}):undefined;
 const settlement=new MarketingSettlementService(pool,{operatorIds:config.settlement?.operatorIds??[],policyReference:config.settlement?.policyReference??'',providerAccounts:{...googleAccount?{GOOGLE:googleAccount}:{},...metaAccount?{META:metaAccount}:{}},additionalDocumentOrigins:config.settlement?.documentOrigins,verifyStopped:settlementStopReader(),googleInvoices});
 const dataManagerClient=new GoogleAdsClient({refreshToken:process.env.HARVO_GOOGLE_DATA_MANAGER_REFRESH_TOKEN??''});
 const googleConversionReady=config.conversions?.google&&googleAccount&&/^\d{10}$/.test(googleAccount)&&process.env.HARVO_GOOGLE_DATA_MANAGER_REFRESH_TOKEN&&process.env.GOOGLE_ADS_CLIENT_ID&&process.env.GOOGLE_ADS_CLIENT_SECRET;
 const conversions=createConversionConsumer(pool,{...authorities,actorContext:config.policyAdminId?{id:config.policyAdminId,role:'system'}:undefined,
  google:googleConversionReady?{...config.conversions!.google!,servingCustomerId:googleAccount!,loginCustomerId:process.env.GOOGLE_ADS_MCC_CUSTOMER_ID?.replaceAll('-',''),accessToken:()=>dataManagerClient.getFreshAccessToken(),developerToken:process.env.GOOGLE_ADS_DEVELOPER_TOKEN}:undefined,
  meta:config.conversions?.meta&&metaToken?{pixelId:config.conversions.meta.pixelId,accessToken:metaToken,allowedOrigins:[config.origin]}:undefined});
 const activationBlockers=(provider:'GOOGLE'|'META')=>{
  const readiness=conversions.readiness();
  if(!readiness.enabled||(provider==='GOOGLE'?readiness.google:readiness.meta)==='NOT_CONFIGURED')return ['Live spending requires accepted booking capture, current consent attribution and a configured conversion destination for this channel.'];
  if(provider==='META'&&config.conversions?.meta?.pixelId!==process.env.META_PIXEL_ID)return ['Meta advertising and canonical Purchase delivery must use the same verified pixel.'];
  return [];
 };
 const effectiveConfig={...config,activationEnabled:config.activationEnabled&&conversions.readiness().enabled};
 const reasons:string[]=[];if(!config.financialPolicy)reasons.push('Campaign cost and tax policy is not configured.');if(!config.publishingEnabled)reasons.push('Provider publishing is not enabled for this environment.');if(!config.checkoutAcceptanceReference)reasons.push('Verified booking checkout acceptance is required before live advertising.');
 const creativeCdnOrigin=process.env.HARVO_CREATIVE_CDN_ORIGIN?.trim();
 const creativeBucket=process.env.HARVO_CREATIVE_BUCKET?.trim()||process.env.AWS_S3_BUCKET_NAME?.trim();
 const creativeReady=!!(config.policyAdminId&&creativeCdnOrigin&&creativeBucket&&process.env.AWS_REGION&&process.env.AWS_ACCESS_KEY_ID&&process.env.AWS_SECRET_ACCESS_KEY&&process.env.AWS_ACCESS_KEY_ID!=='dummy'&&process.env.AWS_SECRET_ACCESS_KEY!=='dummy');
 const creative=creativeReady?new CreativeWorkflowService(pool,{serviceActor:{id:config.policyAdminId!,role:'system'},preparer:new CampaignImagePreparer({allowedOrigins:new Set(config.mediaOrigins)}),storage:new ImmutableCreativeStorage({client:createMediaUploadS3Client({region:process.env.AWS_REGION,credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID!,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY!}}),bucket:creativeBucket!,cdnOrigin:creativeCdnOrigin!}),verifyCdn:createCreativeCdnVerifier(creativeCdnOrigin!)}):undefined;
 const facts=new CanonicalMarketingFacts(pool,creative?((c,actor,input)=>creative.resolveForCampaign(c,actor,input)):undefined);
 const stories=new SpatialStories(pool,facts,creative,config.policyAdminId?{id:config.policyAdminId,role:"system"}:undefined);
 const pools=new DestinationPools(pool,config.policyAdminId?{id:config.policyAdminId,role:"system"}:undefined,facts,{GOOGLE:googleAccount,META:metaAccount});
 const strategies=config.policyAdminId?new CampaignStrategyBindings(pool,{id:config.policyAdminId,role:'system'},process.env.HARVO_ADTECH_ENABLED==='true'):undefined;
 const workflow=new MarketingWorkflowService(pool,{strategies,resolveStory:(c,actor,draft)=>stories.resolve(c,actor,draft.listingId,draft.spatialStoryId!,draft.spatialStoryHash!),guardDedicated:(c,row)=>pools.guardCampaign(c,row),bindProduct:(c,actor,listing)=>facts.bindDedicated(c,actor,listing),verifyProduct:(c,actor,product)=>facts.verifyProduct(c,actor,product),ai:new CampaignAiReviewer({apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MARKETING_MODEL,mediaOrigins:new Set(config.mediaOrigins)}),finance,publishingEnabled:config.publishingEnabled,activationEnabled:effectiveConfig.activationEnabled,activationBlockers,fundingEnabled:config.fundingEnabled&&payments.configured(config.currency),configurationReasons:reasons,validateTargeting:draft=>targeting.validateDraft(draft),metaCountries:config.meta.countries,
  resolveCreative:creative?((c,actor,draft)=>creative.resolveForCampaign(c,actor,{listingId:draft.listingId,sourceAssetId:draft.mediaIds[0],derivativeId:draft.creativeDerivativeId!,manifestHash:draft.creativeManifestHash!})):undefined,
  verifyCreativeForPublishing:creative? (async(row,actor)=>{await creative.verifyForPublishing(actor,{listingId:row.listing_id,sourceAssetId:row.draft.mediaIds[0],derivativeId:row.draft.creativeDerivativeId,manifestHash:row.draft.creativeManifestHash});}):undefined});
 const keywordResearch=googleAccount&&/^\d{10}$/.test(googleAccount)&&config.policyAdminId?new KeywordResearchService(pool,facts,new GoogleKeywordResearchAdapter(new GoogleAdsClient()),config.origin,{id:config.policyAdminId,role:'system'},(geos,languages)=>targeting.resolve(geos,languages)):undefined;
 const corridorInference=config.policyAdminId&&process.env.HARVO_ADTECH_ENABLED==='true'?new CorridorInferenceWorker(pool,{id:config.policyAdminId,role:'system'}):undefined;
 return {corridorInference,outcomes:new CampaignOutcomes(pool,config.policyAdminId?{id:config.policyAdminId,role:'system'}:undefined,!!attribution,conversions.readiness().enabled),stories,pools,touchpoints:attribution?new MarketingTouchpoints(pool,{id:config.policyAdminId!,role:'system'},attribution):undefined,attribution,preflight:new MarketingPreflight(pool,config.policyAdminId?{id:config.policyAdminId,role:'system'}:undefined),portfolio:googleAccount&&/^\d{10}$/.test(googleAccount)?new SearchPortfolioConflictAnalyzer(pool,googleAccount):undefined,config,payments,finance,workflow,targeting,guidance,settlement,conversions,creative,facts,keywordResearch,pauseRecovery:new MarketingPauseRecovery(pool,settlementStopReader()),metaEvents:new MetaMarketingEvents(scoped,process.env.META_APP_SECRET,process.env.META_MARKETING_WEBHOOK_VERIFY_TOKEN),engine:new MarketingEngine(scoped,workflow,effectiveConfig,payments,undefined,refunds,attribution,stories)};
}

/** Web and worker composition remains blocked until canonical checkout/consent adapters are accepted.
 * Operator configuration cannot manufacture these source authorities. */
export function createDeployedMarketingRuntime(pool:pg.Pool){
 return createMarketingRuntime(pool);
}
