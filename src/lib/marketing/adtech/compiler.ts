import {MarketingError,fingerprint} from '../domain.js';
import type {ResolvedCampaignStrategy} from './contracts.js';
import {validateBoundStrategy} from './bindings.js';

const placementNames={FB_FEED:'FACEBOOK_FEED',FB_STORIES:'FACEBOOK_STORIES',FB_REELS:'FACEBOOK_REELS',IG_FEED:'INSTAGRAM_FEED',IG_STORIES:'INSTAGRAM_STORIES',IG_REELS:'INSTAGRAM_REELS'} as const;
export function metaLegacyEnvelope(strategy:ResolvedCampaignStrategy){return {placements:strategy.profile.meta.placements.map(p=>placementNames[p]),specialAdCategories:strategy.profile.meta.specialAdCategories};}
export function compileMetaStrategy(input:unknown){
 const strategy=validateBoundStrategy(input,'META'),profile=strategy.profile.meta;
 const cities=strategy.geography.filter(g=>g.kind==='PROVIDER_CITY_RADIUS').map(g=>({key:g.providerKey,radius:g.radiusKm,distance_unit:'kilometer'}));
 const custom=strategy.geography.filter(g=>g.kind==='COORDINATE_RADIUS').map(g=>({latitude:g.latitude,longitude:g.longitude,radius:g.radiusKm,distance_unit:'kilometer'}));
 const regions=strategy.geography.filter(g=>g.kind==='PROVIDER_REGION_EXCLUSION').map(g=>({key:g.providerKey}));
 const positions=(prefix:'FB'|'IG')=>profile.placements.filter(p=>p.startsWith(prefix)).map(p=>p.endsWith('STORIES')?'story':p.endsWith('REELS')?(prefix==='FB'?'facebook_reels':'reels'):(prefix==='FB'?'feed':'stream'));
 const fb=positions('FB'),ig=positions('IG');
 return {objective:profile.objective,special_ad_categories:profile.specialAdCategories,
  targeting:{geo_locations:{...(cities.length?{cities}:{}),...(custom.length?{custom_locations:custom}:{})},excluded_geo_locations:{regions},
   age_min:profile.ageMin,age_max:profile.ageMax,...(profile.genders.length?{genders:profile.genders}:{}),
   publisher_platforms:[...(fb.length?['facebook']:[]),...(ig.length?['instagram']:[])],...(fb.length?{facebook_positions:fb}:{}),...(ig.length?{instagram_positions:ig}:{})},
  optimization_goal:profile.optimizationGoal,bid_strategy:profile.bidStrategy,...(profile.bidCapMinor?{bid_amount:profile.bidCapMinor}:{}),
  attribution_spec:[{event_type:'CLICK_THROUGH',window_days:profile.attribution.startsWith('7d')?7:1},...(profile.attribution.includes('1d_view')?[{event_type:'VIEW_THROUGH',window_days:1}]:[])],conversionEvent:profile.conversionEvent};
}
function sorted(values:unknown[]){return values.map(v=>fingerprint(v)).sort();}
function metaGeo(value:any){return {countries:sorted(value?.countries??[]),regions:sorted((value?.regions??[]).map((v:any)=>String(v.key))),cities:sorted((value?.cities??[]).map((v:any)=>({key:String(v.key),radius:Number(v.radius),unit:v.distance_unit}))),custom:sorted((value?.custom_locations??[]).map((v:any)=>({lat:Number(v.latitude),lng:Number(v.longitude),radius:Number(v.radius),unit:v.distance_unit}))),zips:sorted(value?.zips??[]),locationTypes:sorted(value?.location_types??[])};}
function metaTarget(value:any){return {geo:metaGeo(value?.geo_locations),exclusion:metaGeo(value?.excluded_geo_locations),ageMin:value?.age_min,ageMax:value?.age_max,genders:sorted(value?.genders??[]),platforms:sorted(value?.publisher_platforms??[]),fb:sorted(value?.facebook_positions??[]),ig:sorted(value?.instagram_positions??[])};}
export function assertMetaStrategyReadback(input:unknown,campaign:any,adset:any){
 const expected=compileMetaStrategy(input);
 if(campaign.objective!==expected.objective||fingerprint(sorted(campaign.special_ad_categories??[]))!==fingerprint(sorted(expected.special_ad_categories))||
  fingerprint(metaTarget(adset.targeting))!==fingerprint(metaTarget(expected.targeting))||adset.optimization_goal!==expected.optimization_goal||adset.bid_strategy!==expected.bid_strategy||
  String(adset.bid_amount??'')!==String(expected.bid_amount??'')||fingerprint(sorted(adset.attribution_spec??[]))!==fingerprint(sorted(expected.attribution_spec))||
  adset.targeting?.targeting_automation?.advantage_audience===1)
  throw new MarketingError('META_STRATEGY_READBACK_MISMATCH','The observed audience, attribution or bidding differs from the approved strategy. Keep this campaign paused.');
}
export function googleStrategyCriteria(input:unknown,campaign:string){
 const strategy=validateBoundStrategy(input,'GOOGLE');
 return [...strategy.geography.map(g=>({campaign,negative:g.kind==='PROVIDER_REGION_EXCLUSION',...(g.kind==='PROVIDER_REGION_EXCLUSION'?{location:{geoTargetConstant:g.providerKey}}:{proximity:{geoPoint:{latitudeInMicroDegrees:Math.round(g.latitude*1e6),longitudeInMicroDegrees:Math.round(g.longitude*1e6)},radius:g.radiusKm,radiusUnits:'KILOMETERS'}})})),
  ...strategy.profile.google.negativeKeywords.map(keyword=>({campaign,negative:true,keyword}))];
}
