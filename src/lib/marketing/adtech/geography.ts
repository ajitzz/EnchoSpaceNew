import {z} from 'zod';
import {MarketingError,fingerprint} from '../domain.js';
import {geographyEvidenceSchema,type StrategyGeographyEvidence} from './contracts.js';
import {GoogleAdsClient} from '../../providers/google/GoogleAdsClient.js';
import {MetaAdsClient} from '../../providers/meta/MetaAdsClient.js';
import {GoogleGeographicAuthority,type GeographicAuthority} from './geocoding.js';

export const geoRequestSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('PROVIDER_CITY_RADIUS'),query:z.string().trim().min(2).max(120),providerKey:z.string().min(1).max(120),radiusKm:z.number().finite().positive().max(1000)}).strict(),
 z.object({kind:z.literal('COORDINATE_RADIUS'),label:z.string().trim().min(2).max(120),latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),radiusKm:z.number().finite().positive().max(1000)}).strict(),
 z.object({kind:z.literal('PROVIDER_REGION_EXCLUSION'),query:z.string().trim().min(2).max(120),providerKey:z.string().min(1).max(120)}).strict(),
]);
export type GeoRequest=z.infer<typeof geoRequestSchema>;
export interface GeoLookup {key:string;name:string;country:string;type:'CITY'|'DISTRICT';latitude?:number;longitude?:number;minRadiusKm?:number;maxRadiusKm?:number;}
export interface GeoResolverPort {
 search(query:string,kind:'CITY'|'DISTRICT'):Promise<GeoLookup[]>;
 resolve(input:GeoRequest,districtName:string):Promise<StrategyGeographyEvidence>;
}
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+district$/,'').trim();
type Unsealed<T> = T extends unknown ? Omit<T,'evidenceHash'> : never;
function seal(value:Unsealed<StrategyGeographyEvidence>):StrategyGeographyEvidence{return geographyEvidenceSchema.parse({...value,evidenceHash:fingerprint(value)});}

export class MetaGeoResolver implements GeoResolverPort {
 constructor(private client:Pick<MetaAdsClient,'get'|'identity'>=new MetaAdsClient(),private now=()=>new Date().toISOString(),private authority:GeographicAuthority=new GoogleGeographicAuthority()){}
 async search(query:string,kind:'CITY'|'DISTRICT'):Promise<GeoLookup[]>{
  const q=z.string().trim().min(2).max(120).parse(query);
  const response=await this.client.get('search',{type:'adgeolocation',q,location_types:[kind==='CITY'?'city':'region'],country_code:'IN',limit:30});
  if(!Array.isArray(response?.data)||response.data.length>30)throw new MarketingError('TARGETING_RESPONSE_INVALID','Meta returned invalid geography evidence.',502);
  return response.data.flatMap((r:any)=>{
   // REGION results are candidates only; resolve() independently verifies district identity.
   const actual=r.type==='city'?'CITY':r.type==='region'?'DISTRICT':null;
   if(actual!==kind||r.country_code!=='IN'||typeof r.key!=='string'||!/^\d+$/.test(r.key)||typeof r.name!=='string')return [];
   return [{key:r.key,name:r.name,country:r.country_code,type:actual} as GeoLookup];
  });
 }
 async resolve(raw:GeoRequest,districtName:string):Promise<StrategyGeographyEvidence>{
  const input=geoRequestSchema.parse(raw),base={provider:'META' as const,apiVersion:'v26.0' as const,country:'IN' as const,verifiedAt:this.now()};
  if(input.kind==='COORDINATE_RADIUS'){
   await this.authority.point(input.latitude,input.longitude);
   const response=await this.client.get(this.client.identity().accountId+'/delivery_estimate',{targeting_spec:{geo_locations:{custom_locations:[{latitude:input.latitude,longitude:input.longitude,radius:input.radiusKm,distance_unit:'kilometer'}]}}});
   if(!Array.isArray(response?.data)||response.data.length!==1||response.data[0]?.estimate_ready!==true)throw new MarketingError('TARGETING_CAPABILITY_UNSUPPORTED','Meta has not validated this targeting radius.',422);
   return seal({...base,...input});
  }
  const row=(await this.search(input.query,input.kind==='PROVIDER_CITY_RADIUS'?'CITY':'DISTRICT')).find(r=>r.key===input.providerKey);
  if(!row)throw new MarketingError(input.kind==='PROVIDER_REGION_EXCLUSION'?'EXCLUSION_UNRESOLVED':'FEEDERS_UNRESOLVED','The provider did not verify this location and administrative type.',422);
  if(input.kind==='PROVIDER_REGION_EXCLUSION'){
   if(normalize(row.name)!==normalize(districtName))throw new MarketingError('EXCLUSION_UNRESOLVED','The excluded provider district does not match the property destination.',422);
   await this.authority.district(row.name);
   return seal({...base,kind:input.kind,label:row.name,providerKey:row.key,administrativeLevel:'DISTRICT'});
  }
  const coordinates=await this.authority.city(row.name);
  const response=await this.client.get(this.client.identity().accountId+'/delivery_estimate',{targeting_spec:{geo_locations:{cities:[{key:row.key,radius:input.radiusKm,distance_unit:'kilometer'}]}}});
  if(!Array.isArray(response?.data)||response.data.length!==1||response.data[0]?.estimate_ready!==true)throw new MarketingError('TARGETING_CAPABILITY_UNSUPPORTED','Meta has not validated this city radius.',422);
  return seal({...base,kind:input.kind,label:row.name,providerKey:row.key,...coordinates,radiusKm:input.radiusKm});
 }
}

export class GoogleGeoResolver implements GeoResolverPort {
 constructor(private client:Pick<GoogleAdsClient,'suggestGeoTargets'>=new GoogleAdsClient(),private now=()=>new Date().toISOString(),private authority:GeographicAuthority=new GoogleGeographicAuthority()){}
 async search(query:string,kind:'CITY'|'DISTRICT'):Promise<GeoLookup[]>{
  const rows=await this.client.suggestGeoTargets({names:[z.string().trim().min(2).max(120).parse(query)],countryCode:'IN'});
  return rows.filter(r=>r.countryCode==='IN'&&(kind==='CITY'?r.targetType==='City':r.targetType==='District')).slice(0,30).map(r=>({key:r.resourceName,name:r.name,country:r.countryCode,type:kind}));
 }
 async resolve(raw:GeoRequest,districtName:string):Promise<StrategyGeographyEvidence>{
  const input=geoRequestSchema.parse(raw),base={provider:'GOOGLE' as const,apiVersion:'v25' as const,country:'IN' as const,verifiedAt:this.now()};
  if(input.kind==='COORDINATE_RADIUS'){await this.authority.point(input.latitude,input.longitude);return seal({...base,...input});}
  const row=(await this.search(input.query,input.kind==='PROVIDER_CITY_RADIUS'?'CITY':'DISTRICT')).find(r=>r.key===input.providerKey);
  if(!row)throw new MarketingError(input.kind==='PROVIDER_REGION_EXCLUSION'?'EXCLUSION_UNRESOLVED':'FEEDERS_UNRESOLVED','Google did not resolve this location with the required type.',422);
  if(input.kind==='PROVIDER_REGION_EXCLUSION'){
   if(normalize(row.name)!==normalize(districtName))throw new MarketingError('EXCLUSION_UNRESOLVED','The excluded district differs from the destination.',422);
   await this.authority.district(row.name);
   return seal({...base,kind:input.kind,label:row.name,providerKey:row.key,administrativeLevel:'DISTRICT'});
  }
  const coordinates=await this.authority.city(row.name);
  return seal({...base,kind:input.kind,label:row.name,providerKey:row.key,...coordinates,radiusKm:input.radiusKm});
 }
}
