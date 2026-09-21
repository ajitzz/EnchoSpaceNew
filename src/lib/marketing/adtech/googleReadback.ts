import {MarketingError,fingerprint} from '../domain.js';
import {validateBoundStrategy} from './bindings.js';
import {googleStrategyCriteria} from './compiler.js';
import type {GoogleAdsClient} from '../../providers/google/GoogleAdsClient.js';

function criterion(c:any){return {negative:c.negative===true,...(c.location?{location:c.location.geoTargetConstant}:{}),...(c.proximity?{proximity:{lat:Number(c.proximity.geoPoint?.latitudeInMicroDegrees),lng:Number(c.proximity.geoPoint?.longitudeInMicroDegrees),radius:Number(c.proximity.radius),units:c.proximity.radiusUnits}}:{}),...(c.keyword?{keyword:{text:c.keyword.text,matchType:c.keyword.matchType}}:{})};}
export async function assertGoogleStrategyReadback(client:Pick<GoogleAdsClient,'searchStream'>,customerId:string,campaignId:string,input:unknown){
 if(!/^\d+$/.test(campaignId))throw new MarketingError('GOOGLE_STRATEGY_READBACK_MISMATCH','Invalid campaign identity.');
 const strategy=validateBoundStrategy(input,'GOOGLE');
 const rows=await client.searchStream(customerId,`SELECT campaign.resource_name,campaign.maximize_conversions.target_cpa_micros,campaign.geo_target_type_setting.positive_geo_target_type FROM campaign WHERE campaign.id = ${campaignId}`);
 const criteria=await client.searchStream(customerId,`SELECT campaign_criterion.negative,campaign_criterion.location.geo_target_constant,campaign_criterion.proximity.geo_point.latitude_in_micro_degrees,campaign_criterion.proximity.geo_point.longitude_in_micro_degrees,campaign_criterion.proximity.radius,campaign_criterion.proximity.radius_units,campaign_criterion.keyword.text,campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.status != 'REMOVED' AND campaign_criterion.type IN ('LOCATION','PROXIMITY','KEYWORD')`);
 const campaign=rows[0]?.campaign;
 const expected=googleStrategyCriteria(strategy,`customers/${customerId}/campaigns/${campaignId}`).map(c=>fingerprint(criterion(c))).sort();
 const observed=criteria.map(r=>fingerprint(criterion(r.campaignCriterion))).sort();
 const cpa=strategy.profile.google.targetCpaMinor===null?'0':(BigInt(strategy.profile.google.targetCpaMinor)*10000n).toString();
 if(rows.length!==1||campaign?.resourceName!==`customers/${customerId}/campaigns/${campaignId}`||campaign?.geoTargetTypeSetting?.positiveGeoTargetType!==strategy.profile.google.geoMode||String(campaign?.maximizeConversions?.targetCpaMicros??'0')!==cpa||fingerprint(expected)!==fingerprint(observed))
  throw new MarketingError('GOOGLE_STRATEGY_READBACK_MISMATCH','The observed audience or bidding differs from the approved strategy. Keep this campaign paused.');
}
