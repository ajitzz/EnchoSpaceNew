import type {GoogleAdsClient} from './GoogleAdsClient.js';
import {GoogleAdsError} from './googleErrors.js';
import {semanticFingerprint} from '../ProviderOperationStore.js';

export interface GooglePurchaseDestination {customerId:string;conversionActionId:string;}
const reject=()=>new GoogleAdsError('GOOGLE_PURCHASE_GOAL_MISMATCH','The campaign must bid only toward its configured canonical Purchase action. Verify the conversion owner, enabled action and campaign goals before spending.',{statusCode:409,errorClass:'VALIDATION'});
/** Authenticated observation, outside DB transactions. Does not change an account's goals. */
export async function verifyGooglePurchaseGoal(client:Pick<GoogleAdsClient,'getCustomerId'|'searchStream'>,campaignName:string,destination?:GooglePurchaseDestination){
 const serving=client.getCustomerId(),match=/^customers\/(\d{10})\/campaigns\/([1-9]\d*)$/.exec(campaignName);
 if(!destination||!/^\d{10}$/.test(destination.customerId)||!/^[1-9]\d{0,29}$/.test(destination.conversionActionId)||!match||match[1]!==serving)throw reject();
 const owner=`customers/${destination.customerId}`,actionName=`${owner}/conversionActions/${destination.conversionActionId}`;
 const [customers,actionRows,configRows,goalRows]=await Promise.all([
  client.searchStream(serving,'SELECT customer.resource_name,customer.conversion_tracking_setting.google_ads_conversion_customer FROM customer LIMIT 2'),
  client.searchStream(destination.customerId,"SELECT conversion_action.resource_name,conversion_action.owner_customer,conversion_action.category,conversion_action.type,conversion_action.origin,conversion_action.status,conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.status = 'ENABLED' LIMIT 501"),
  client.searchStream(serving,`SELECT conversion_goal_campaign_config.campaign,conversion_goal_campaign_config.goal_config_level,conversion_goal_campaign_config.custom_conversion_goal FROM conversion_goal_campaign_config WHERE campaign.id = ${match[2]} LIMIT 2`),
  client.searchStream(serving,`SELECT campaign_conversion_goal.campaign,campaign_conversion_goal.category,campaign_conversion_goal.origin,campaign_conversion_goal.biddable FROM campaign_conversion_goal WHERE campaign.id = ${match[2]} LIMIT 201`),
 ]);
 if(customers.length!==1||customers[0].customer?.resourceName!==`customers/${serving}`||customers[0].customer?.conversionTrackingSetting?.googleAdsConversionCustomer!==owner||configRows.length!==1||!actionRows.length||actionRows.length>500||goalRows.length>200)throw reject();
 const config=configRows[0].conversionGoalCampaignConfig,actions=actionRows.map(row=>row.conversionAction),goals=goalRows.map(row=>row.campaignConversionGoal);
 if(config?.campaign!==campaignName||!['CUSTOMER','CAMPAIGN'].includes(config.goalConfigLevel)||actions.some(a=>!a||a.status!=='ENABLED'||!a.resourceName||!a.category||!a.origin)||new Set(actions.map(a=>a.resourceName)).size!==actions.length||goals.some(g=>!g||g.campaign!==campaignName||!g.category||!g.origin||typeof g.biddable!=='boolean'))throw reject();
 const action=actions.find(a=>a.resourceName===actionName);
 if(!action||action.ownerCustomer!==owner||action.type!=='UPLOAD_CLICKS'||action.category!=='PURCHASE'||action.origin!=='WEBSITE')throw reject();
 const biddable=new Set<string>();
 for(const a of actions)if(a.primaryForGoal===true&&goals.some(g=>g.biddable&&g.category===a.category&&g.origin===a.origin))biddable.add(a.resourceName);
 let custom:any=null;
 if(config.goalConfigLevel==='CAMPAIGN'&&config.customConversionGoal){
  if(!new RegExp(`^customers/${destination.customerId}/customConversionGoals/[1-9]\\d*$`).test(config.customConversionGoal))throw reject();
  const rows=await client.searchStream(destination.customerId,`SELECT custom_conversion_goal.resource_name,custom_conversion_goal.status,custom_conversion_goal.conversion_actions FROM custom_conversion_goal WHERE custom_conversion_goal.resource_name = '${config.customConversionGoal}' LIMIT 2`);
  custom=rows.length===1?rows[0].customConversionGoal:null;
  if(!custom||custom.resourceName!==config.customConversionGoal||custom.status!=='ENABLED'||!Array.isArray(custom.conversionActions)||!custom.conversionActions.length)throw reject();
  for(const name of custom.conversionActions)biddable.add(name);
 }
 if(biddable.size!==1||!biddable.has(actionName))throw reject();
 return {action:actionName,servingCustomer:`customers/${serving}`,conversionOwner:owner,goalLevel:config.goalConfigLevel,observedAt:new Date().toISOString(),evidenceHash:semanticFingerprint({customer:customers[0],actions,config,goals,custom})};
}
