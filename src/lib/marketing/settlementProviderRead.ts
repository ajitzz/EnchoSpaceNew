import {GoogleAdsClient} from '../providers/google/GoogleAdsClient.js';
import {MetaAdsClient} from '../providers/meta/MetaAdsClient.js';
import {fingerprint,MarketingError} from './domain.js';
import type {SettlementProviderBinding,SettlementStopObservation} from './settlementService.js';

/** Authenticated containment evidence only. It is never represented as a final bill. */
export function settlementStopReader(google=new GoogleAdsClient(),meta=new MetaAdsClient()){
 return async(binding:SettlementProviderBinding):Promise<SettlementStopObservation>=>{
  let evidence:unknown,status:string;
  if(binding.provider==='GOOGLE'){
   const customer=google.getCustomerId();
   const match=new RegExp(`^customers/${customer}/campaigns/([1-9][0-9]*)$`).exec(binding.externalCampaignId);
   if(customer!==binding.accountId||!match)throw new MarketingError('SETTLEMENT_ACCOUNT_MISMATCH','Google billing account and campaign identity must match.');
   const rows=await google.searchStream(customer,`SELECT campaign.resource_name,campaign.status FROM campaign WHERE campaign.id = ${match[1]}`);
   if(rows.length!==1||rows[0]?.campaign?.resourceName!==binding.externalCampaignId)throw new MarketingError('SETTLEMENT_PROVIDER_NOT_STOPPED','Google campaign identity could not be verified.');
   evidence=rows[0].campaign;status=rows[0].campaign.status;
  }else{
   const identity=meta.identity();
   if(identity.accountId.slice(4)!==binding.accountId||!(/^[1-9]\d*$/).test(binding.externalCampaignId))throw new MarketingError('SETTLEMENT_ACCOUNT_MISMATCH','Meta billing account and campaign identity must match.');
   const row=await meta.get(binding.externalCampaignId,{fields:'id,account_id,status'});
   if(row.id!==binding.externalCampaignId||String(row.account_id)!==binding.accountId)throw new MarketingError('SETTLEMENT_ACCOUNT_MISMATCH','Meta returned a different billing account or campaign.');
   evidence=row;status=row.status;
  }
  if(!['PAUSED','REMOVED','ARCHIVED'].includes(status))throw new MarketingError('SETTLEMENT_PROVIDER_NOT_STOPPED','Provider campaign must be stopped before settlement.');
  return {...binding,configuredStatus:status as SettlementStopObservation['configuredStatus'],observedAt:new Date().toISOString(),evidenceHash:fingerprint({binding,evidence})};
 };
}
