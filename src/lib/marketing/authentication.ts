import jwt from 'jsonwebtoken';
import {MarketingError} from './domain.js';
let cached:{expires:number;keys:Record<string,string>}|null=null;
let pending:Promise<Record<string,string>>|null=null;
async function signingKeys(){if(cached&&cached.expires>Date.now())return cached.keys;if(pending)return pending;
 pending=(async()=>{const r=await fetch('https://www.googleapis.com/oauth2/v1/certs',{signal:AbortSignal.timeout(8000),redirect:'error'});if(!r.ok)throw new MarketingError('IDENTITY_UNAVAILABLE','Google identity verification is unavailable',503);const body=await r.text();if(body.length>100000)throw new MarketingError('IDENTITY_UNAVAILABLE','Google signing key response is invalid',503);const keys=JSON.parse(body);if(!keys||typeof keys!=='object'||Object.values(keys).some(k=>typeof k!=='string'||!k.startsWith('-----BEGIN CERTIFICATE-----')))throw new MarketingError('IDENTITY_UNAVAILABLE','Google signing keys are invalid',503);const seconds=Math.min(3600,Number(/max-age=(\d+)/.exec(r.headers.get('cache-control')||'')?.[1]||300));cached={expires:Date.now()+seconds*1000,keys};return keys;})();try{return await pending;}finally{pending=null;}}
export async function verifyGoogleIdentity(credential:unknown,audience:string|undefined,keys:()=>Promise<Record<string,string>>=signingKeys){
 if(!audience)throw new MarketingError('IDENTITY_NOT_CONFIGURED','Google sign-in audience is not configured',503);
 if(typeof credential!=='string'||credential.length>16000)throw new MarketingError('IDENTITY_INVALID','A signed Google identity token is required',401);
 const decoded=jwt.decode(credential,{complete:true});if(!decoded||decoded.header.alg!=='RS256'||!decoded.header.kid)throw new MarketingError('IDENTITY_INVALID','Invalid Google identity token',401);
 const pem=(await keys())[decoded.header.kid];if(!pem)throw new MarketingError('IDENTITY_INVALID','Google token signing key is unknown',401);
 let payload:jwt.JwtPayload;try{payload=jwt.verify(credential,pem,{algorithms:['RS256'],audience,issuer:['https://accounts.google.com','accounts.google.com']}) as jwt.JwtPayload;}catch{throw new MarketingError('IDENTITY_INVALID','Google identity token could not be verified',401);}
 if(!payload.sub||typeof payload.sub!=='string'||typeof payload.email!=='string'||payload.email_verified!==true||typeof payload.exp!=='number'||typeof payload.iat!=='number'||payload.iat>Date.now()/1000+60)throw new MarketingError('IDENTITY_INVALID','Verified Google identity claims are incomplete',401);
 return {googleId:payload.sub,email:payload.email.toLowerCase(),name:typeof payload.name==='string'?payload.name:payload.email,authoritativeEmail:payload.email.toLowerCase().endsWith('@gmail.com')||typeof payload.hd==='string'};
}
