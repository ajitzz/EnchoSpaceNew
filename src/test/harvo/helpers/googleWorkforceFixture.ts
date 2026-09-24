import {generateKeyPairSync,randomBytes,createHash} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {GoogleWorkforceSigningKeys,GoogleWorkforceIdentity} from '../../../lib/iam/googleWorkforceIdentity.js';

export const workforceAudience='cr1-workforce-test.apps.googleusercontent.com';
export function createGoogleWorkforceFixture(now:()=>number=Date.now){
  const key=generateKeyPairSync('rsa',{modulusLength:2048});
  const kid='isolated-workforce-key';
  const jwk={...key.publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'};
  const fetcher:typeof fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'cache-control':'public, max-age=300'}});
  const keys=new GoogleWorkforceSigningKeys(fetcher,now);
  const identity=new GoogleWorkforceIdentity(workforceAudience,keys,now);
  const nonce=()=>randomBytes(32).toString('base64url');
  function credential(nonceValue:string,claims:Record<string,unknown>={},header:Record<string,unknown>={}){
    const seconds=Math.floor(now()/1000);
    return jwt.sign({iss:'https://accounts.google.com',aud:workforceAudience,sub:'google-staff-90',email:'maker@gmail.com',
      email_verified:true,iat:seconds,exp:seconds+3600,nonce:nonceValue,...claims},key.privateKey,{algorithm:'RS256',keyid:kid,header:{alg:'RS256',...header}});
  }
  return {key,kid,jwk,identity,keys,fetcher,nonce,credential,digest:(value:string)=>createHash('sha256').update(value).digest('hex')};
}
