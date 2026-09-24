import {describe,it,expect,vi} from 'vitest';
import jwt from 'jsonwebtoken';
import {GoogleWorkforceIdentity,GoogleWorkforceSigningKeys} from '../lib/iam/googleWorkforceIdentity.js';
import {createGoogleWorkforceFixture,workforceAudience} from './harvo/helpers/googleWorkforceFixture.js';

describe('CR1 Google workforce identity cryptographic boundary',()=>{
  const f=createGoogleWorkforceFixture();
  const input=(claims:Record<string,unknown>={},header:Record<string,unknown>={})=>{
    const nonce=f.nonce();return {credential:f.credential(nonce,claims,header),nonceHash:f.digest(nonce),maximumAgeSeconds:300};
  };
  it('verifies RS256 and exact nonce while never converting Google amr into AAL2',async()=>{
    const value=input({amr:['mfa','hwk']});const verified=await f.identity.verify(value);
    expect(verified).toMatchObject({subject:'google-staff-90',email:'maker@gmail.com',assurance:'AAL1',source:'GOOGLE_OIDC',providerAuthenticatedAt:null});
    expect(verified.tokenHash).toBe(f.digest(value.credential));expect(JSON.stringify(verified)).not.toContain(value.credential);
  });
  it.each([
    ['issuer',{iss:'https://attacker.test'}],['audience',{aud:'consumer-client.apps.googleusercontent.com'}],
    ['authorized party',{azp:'consumer-client.apps.googleusercontent.com'}],['unverified email',{email_verified:false}],
    ['string verification',{email_verified:'true'}],['unowned external email',{email:'worker@external.test'}],
    ['expired',{iat:Math.floor(Date.now()/1000)-3700,exp:Math.floor(Date.now()/1000)-100}],
    ['stale',{iat:Math.floor(Date.now()/1000)-600,exp:Math.floor(Date.now()/1000)+1200}],
    ['future issuance',{iat:Math.floor(Date.now()/1000)+120,exp:Math.floor(Date.now()/1000)+3600}],
  ])('rejects %s claims',async(_name,claims)=>{await expect(f.identity.verify(input(claims as Record<string,unknown>))).rejects.toMatchObject({code:'IDENTITY_INVALID'});});
  it('rejects wrong nonce, unsigned/consumer tokens and attacker-selected key URLs',async()=>{
    await expect(f.identity.verify({...input(),nonceHash:'a'.repeat(64)})).rejects.toMatchObject({code:'IDENTITY_INVALID'});
    await expect(f.identity.verify({...input(),credential:jwt.sign({sub:'google-staff-90'},'consumer-secret',{algorithm:'HS256',keyid:f.kid})})).rejects.toMatchObject({code:'IDENTITY_INVALID'});
    await expect(f.identity.verify(input({}, {jku:'https://attacker.test/keys'}))).rejects.toMatchObject({code:'IDENTITY_INVALID'});
  });
  it('accepts verified Workspace identity with its exact domain and preserves only explicit auth_time',async()=>{
    const time=Math.floor(Date.now()/1000)-1800;
    expect(await f.identity.verify(input({email:'worker@encho.test',hd:'encho.test',auth_time:time}))).toMatchObject({hostedDomain:'encho.test',providerAuthenticatedAt:new Date(time*1000).toISOString(),assurance:'AAL1'});
    await expect(f.identity.verify(input({email:'worker@external.test',hd:'encho.test'}))).rejects.toMatchObject({code:'IDENTITY_INVALID'});
  });
  it('coalesces key fetches and bounds unknown-kid refresh pressure',async()=>{
    const fetcher=vi.fn(f.fetcher);const keys=new GoogleWorkforceSigningKeys(fetcher);await Promise.all(Array.from({length:12},()=>keys.key(f.kid)));
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(keys.key('unknown-key')).rejects.toMatchObject({code:'IDENTITY_INVALID'});expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://www.googleapis.com/oauth2/v3/certs');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({redirect:'error'});
  });
  it('refreshes rotated keys after the bounded cooldown and refuses expired cache on failure',async()=>{
    let now=Date.now();const other=createGoogleWorkforceFixture(()=>now);let outage=false,rotated=false;
    const fetcher:typeof fetch=async()=>{if(outage)throw new Error('private-upstream-details');return new Response(JSON.stringify({keys:[rotated?{...other.jwk,kid:'rotated-key'}:f.jwk]}),{headers:{'cache-control':'max-age=61'}});};
    const keys=new GoogleWorkforceSigningKeys(fetcher,()=>now);expect(await keys.key(f.kid)).toBeDefined();
    now+=62000;rotated=true;expect(await keys.key('rotated-key')).toBeDefined();
    now+=62000;outage=true;await expect(keys.key('rotated-key')).rejects.toMatchObject({code:'IDENTITY_KEYS_UNAVAILABLE',message:'IDENTITY_KEYS_UNAVAILABLE'});
  });
  it.each(['oversized','duplicate','invalid','expired'] as const)('rejects %s JWKS without fallback',async mode=>{
    const fetcher:typeof fetch=async()=>new Response(mode==='oversized'?'x'.repeat(65537):mode==='invalid'?'{}':JSON.stringify({keys:mode==='duplicate'?[f.jwk,f.jwk]:[f.jwk]}),{headers:{'cache-control':mode==='expired'?'max-age=0':'max-age=300'}});
    await expect(new GoogleWorkforceSigningKeys(fetcher).key(f.kid)).rejects.toMatchObject({code:'IDENTITY_KEYS_UNAVAILABLE'});
  });
  it('has no implicit consumer-client fallback',()=>{expect(()=>new GoogleWorkforceIdentity(undefined)).toThrow('IDENTITY_CONFIGURATION_UNAVAILABLE');});
});
