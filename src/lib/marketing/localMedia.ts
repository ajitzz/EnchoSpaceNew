import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {MarketingError} from './domain.js';

const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm'};
const capabilitySchema=z.object({userId:z.number().int().positive(),key:z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|mov|webm)$/),contentType:z.string(),expiresAt:z.number().int().positive()}).strict();
export function randomMediaKey(contentType:string):string{const extension=extensions[contentType];if(!extension)throw new MarketingError('MEDIA_TYPE_UNSUPPORTED','Only supported image and video formats can be uploaded',422);return `${randomUUID()}.${extension}`;}
export function issueLocalUpload(secret:string,userId:number,contentType:string,now=Date.now()){
 const value=capabilitySchema.parse({userId,key:randomMediaKey(contentType),contentType,expiresAt:now+10*60000});
 const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
 const signature=createHmac('sha256',secret).update(`HARVO_LOCAL_UPLOAD:${payload}`).digest('base64url');
 return {key:value.key,ticket:`${payload}.${signature}`};
}
export function verifyLocalUpload(secret:string,ticket:unknown,now=Date.now()){
 try{
  if(typeof ticket!=='string'||ticket.length>1500)throw new Error();
  const pieces=ticket.split('.');if(pieces.length!==2)throw new Error();
  const expected=createHmac('sha256',secret).update(`HARVO_LOCAL_UPLOAD:${pieces[0]}`).digest();const actual=Buffer.from(pieces[1],'base64url');
  // Buffer decoding tolerates padding and unused-bit aliases. Require the exact
  // canonical signature spelling issued by this service before authenticating.
  if(actual.toString('base64url')!==pieces[1]||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error();
  const value=capabilitySchema.parse(JSON.parse(Buffer.from(pieces[0],'base64url').toString('utf8')));
  if(value.expiresAt<=now||value.expiresAt>now+10*60000||!extensions[value.contentType]||!value.key.endsWith(`.${extensions[value.contentType]}`))throw new Error();
  return value;
 }catch{throw new MarketingError('UPLOAD_AUTH_REQUIRED','A valid unexpired upload authorization is required',401);}
}
export async function writeImmutableMedia(directory:string,key:string,data:unknown){
 if(!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|mov|webm)$/.test(key)||!Buffer.isBuffer(data)||data.length===0||data.length>50*1024*1024)throw new MarketingError('MEDIA_UPLOAD_INVALID','A supported nonempty media file below 50 MiB is required',422);
 await mkdir(directory,{recursive:true});
 try{await writeFile(join(directory,key),data,{flag:'wx',mode:0o644});}
 catch(error:any){if(error.code==='EEXIST')throw new MarketingError('UPLOAD_ALREADY_USED','This immutable upload authorization was already used',409);throw error;}
}
