import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import sharp from 'sharp';
import {MarketingError} from './domain.js';
export function isPublicIp(ip:string){
 if(isIP(ip)===4){const a=ip.split('.').map(Number);return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||(a[0]===169&&a[1]===254)||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&(a[1]===168||a[1]===0))||(a[0]===100&&a[1]>=64&&a[1]<=127)||(a[0]===198&&(a[1]===18||a[1]===19)));}
 // Only globally routed IPv6 2000::/3. Mapped IPv4 and transition addresses fail closed.
 return isIP(ip)===6&&/^[23][0-9a-f]{3}:/i.test(ip)&&!/^200[12]:/i.test(ip);
}
export async function loadApprovedImage(rawUrl:string,allowedOrigins:ReadonlySet<string>):Promise<{data:Buffer;mimeType:string;width:number;height:number}>{
 const u=new URL(rawUrl);
 if(u.protocol!=='https:'||u.username||u.password||u.port||!allowedOrigins.has(u.origin))throw new MarketingError('MEDIA_ORIGIN_BLOCKED','This media origin has not been approved for advertising');
 const deadline=AbortSignal.timeout(15000);
 const ips=await Promise.race([lookup(u.hostname,{all:true}),new Promise<never>((_resolve,reject)=>deadline.addEventListener('abort',()=>reject(new MarketingError('MEDIA_TIMEOUT','Media retrieval exceeded its deadline')),{once:true}))]);if(!ips.length||ips.some(v=>!isPublicIp(v.address)))throw new MarketingError('MEDIA_ORIGIN_BLOCKED','Media must resolve to an approved public origin');
 const selected=ips[0];
 const bytes=await new Promise<Buffer>((resolve,reject)=>{
  const request=https.get(u,{signal:deadline,lookup:((_h:unknown,_o:unknown,cb:(error:Error|null,address:string,family:number)=>void)=>cb(null,selected.address,selected.family)) as never,timeout:10000,headers:{Accept:'image/jpeg,image/png,image/webp'}},response=>{
   if(response.statusCode!==200){response.resume();reject(new MarketingError('MEDIA_FETCH_FAILED','The approved image could not be retrieved'));return;}
   const parts:Buffer[]=[];let size=0;
   response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>8*1024*1024){request.destroy(new Error('MEDIA_SIZE_LIMIT'));return;}parts.push(chunk);});
   response.on('end',()=>resolve(Buffer.concat(parts)));response.on('error',reject);
  });request.on('timeout',()=>request.destroy(new Error('MEDIA_TIMEOUT')));request.on('error',reject);
 });
 const source=sharp(bytes,{limitInputPixels:24_000_000,failOn:'warning'});const m=await source.metadata();
 if(!m.width||!m.height||m.width<600||m.height<600)throw new MarketingError('MEDIA_RESOLUTION','Choose an image at least 600 pixels on each side');
 const data=await source.rotate().resize(1200,1200,{fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();
 return {data,mimeType:'image/jpeg',width:m.width,height:m.height};
}
/** Generate deterministic truthful crops; caller stores outputs under approved CDN before publication. */
export async function generateAdCrops(bytes:Buffer){
 const ratios=[{name:'square',width:1080,height:1080},{name:'story',width:1080,height:1920},{name:'landscape',width:1200,height:628}] as const;
 return Promise.all(ratios.map(async r=>({...r,data:await sharp(bytes,{limitInputPixels:24_000_000}).rotate().resize(r.width,r.height,{fit:'cover',position:'attention'}).jpeg({quality:86}).toBuffer()})));
}
