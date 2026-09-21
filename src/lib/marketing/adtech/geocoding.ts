import {MarketingError} from '../domain.js';

export interface GeographicAuthority {
 city(name:string):Promise<{latitude:number;longitude:number}>;
 district(name:string):Promise<void>;
 point(latitude:number,longitude:number):Promise<void>;
}
const normalized=(value:string)=>value.toLowerCase().replace(/\s+district$/,'').trim();

/** Server-only geographic authority. Never exposes keys or private listing points. */
export class GoogleGeographicAuthority implements GeographicAuthority {
 constructor(private key=process.env.HARVO_GEOCODING_API_KEY??'',private transport:typeof fetch=globalThis.fetch.bind(globalThis)){}
 private async lookup(parameters:Record<string,string>){
  if(!this.key)throw new MarketingError('GEOGRAPHIC_AUTHORITY_REQUIRED','Geographic verification is not configured. Ask an administrator to configure the server geocoder.',503);
  const url=new URL('https://maps.googleapis.com/maps/api/geocode/json');
  for(const [key,value]of Object.entries({...parameters,key:this.key,language:'en'}))url.searchParams.set(key,value);
  let value:any;
  try{
   const response=await this.transport(url,{signal:AbortSignal.timeout(10000),redirect:'error'});
   if(!response.ok||!response.body)throw new Error('response');
   const reader=response.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
   for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1000000){await reader.cancel();throw new Error('limit');}chunks.push(part.value);}
   value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{throw new MarketingError('GEOGRAPHIC_LOOKUP_UNAVAILABLE','Geographic evidence could not be retrieved. No targeting was accepted.',503);}
  if(value.status!=='OK'||!Array.isArray(value.results)||value.results.length>30)throw new MarketingError('GEOGRAPHY_UNRESOLVED','The geographic authority did not return an unambiguous result.',422);
  return value.results.filter((r:any)=>!r.partial_match&&Array.isArray(r.address_components)&&r.address_components.some((c:any)=>Array.isArray(c.types)&&c.types.includes('country')&&c.short_name==='IN'));
 }
 async city(name:string){
  const rows=await this.lookup({address:name,components:'country:IN'});
  const matches=rows.filter((r:any)=>r.types?.includes('locality')&&r.address_components.some((c:any)=>c.types.includes('locality')&&normalized(c.long_name)===normalized(name)));
  const row=matches.length===1?matches[0]:null;
  const point=row?.geometry?.location;
  if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||Math.abs(point.lat)>90||Math.abs(point.lng)>180)throw new MarketingError('GEOGRAPHY_UNRESOLVED','Verified city coordinates are unavailable.',422);
  return {latitude:point.lat,longitude:point.lng};
 }
 async district(name:string){
  const rows=await this.lookup({address:`${name} district`,components:'country:IN'});
  if(rows.filter((r:any)=>r.types?.includes('administrative_area_level_2')&&r.address_components.some((c:any)=>c.types.includes('administrative_area_level_2')&&normalized(c.long_name)===normalized(name))).length!==1)throw new MarketingError('EXCLUSION_UNRESOLVED','This provider region was not independently resolved as the destination district.',422);
 }
 async destination(name:string):Promise<{name:string;districtName:string;latitude:number;longitude:number}>{
  const rows=(await this.lookup({address:name,components:'country:IN'})).filter((r:any)=>r.address_components.some((c:any)=>c.types.some((t:string)=>['locality','administrative_area_level_2'].includes(t))&&normalized(c.long_name)===normalized(name)));
  const row=rows.length===1?rows[0]:null,district=row?.address_components.find((c:any)=>c.types.includes('administrative_area_level_2')),point=row?.geometry?.location;
  if(!district||!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng))throw new MarketingError('EXCLUSION_UNRESOLVED','A unique public destination and district are required before inference.',422);
  return {name,districtName:district.long_name,latitude:point.lat,longitude:point.lng};
 }
 async point(latitude:number,longitude:number){
  const rows=await this.lookup({latlng:`${latitude},${longitude}`,result_type:'country'});
  if(rows.length!==1||!rows[0].types?.includes('country'))throw new MarketingError('GEOGRAPHY_UNRESOLVED','The coordinate has not been verified inside India.',422);
 }
}
