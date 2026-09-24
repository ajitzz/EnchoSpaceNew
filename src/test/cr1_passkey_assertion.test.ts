import {describe,it,expect} from 'vitest';
import {PasskeyAssertionVerifier} from '../lib/iam/factors/passkeyAssertion.js';
import {createPasskeyFixture} from './harvo/helpers/passkeyFixture.js';

describe('CR1 independently verified workforce passkey assertions',()=>{
  const verifier=new PasskeyAssertionVerifier();
  const setup=()=>{const f=createPasskeyFixture();return {...f,input:{policy:f.policy,credential:f.credential,ceremony:f.ceremony,response:f.assertion()}};};
  it('verifies a real ES256 signature and binds evidence to exact server command/session without creating authority',async()=>{
    const f=setup();const proof=await verifier.verify(f.input);
    expect(proof).toMatchObject({actionHash:f.ceremony.actionHash,sessionId:f.ceremony.sessionId,membershipId:f.ceremony.membershipId,
      credentialRecordId:f.credential.recordId,oldCounter:4,newCounter:5,assurance:'PHISHING_RESISTANT',source:'WEBAUTHN_UV'});
    expect(JSON.stringify(proof)).not.toContain(f.input.response.response.signature);expect(JSON.stringify(proof)).not.toContain(f.credential.publicKey);
  });
  it.each([
    ['wrong signature',{wrongKey:true}],['wrong RP',{rpId:'attacker.test'}],['missing UP',{flags:4}],['missing UV',{flags:1}],
    ['replayed counter',{counter:4}],['rolled-back counter',{counter:3}],['wrong challenge',{client:{challenge:'a'.repeat(43)}}],
    ['wrong origin',{client:{origin:'https://attacker.test'}}],['cross origin',{client:{crossOrigin:true}}],
    ['unexpected top origin',{client:{topOrigin:'https://attacker.test'}}],['wrong ceremony type',{client:{type:'webauthn.create'}}],
  ])('rejects %s',async(_label,options)=>{const f=setup();await expect(verifier.verify({...f.input,response:f.assertion(options)})).rejects.toMatchObject({code:'FACTOR_INVALID'});});
  it('requires exact owned credential and optional returned user handle',async()=>{
    const f=setup();await expect(verifier.verify({...f.input,response:{...f.input.response,id:'b'.repeat(43),rawId:'b'.repeat(43)}})).rejects.toMatchObject({code:'FACTOR_INVALID'});
    await expect(verifier.verify({...f.input,response:{...f.input.response,response:{...f.input.response.response,userHandle:'a'.repeat(43)}}})).rejects.toMatchObject({code:'FACTOR_INVALID'});
  });
  it('rejects revoked/unreviewed enrollment, changed policy, environment or credential version',async()=>{
    const f=setup();for(const credential of [{...f.credential,status:'PENDING'},{...f.credential,identityReceiptHash:undefined},{...f.credential,environment:'PRODUCTION'},{...f.credential,version:2}]){
      await expect(verifier.verify({...f.input,credential})).rejects.toMatchObject({code:'FACTOR_INVALID'});
    }
    await expect(verifier.verify({...f.input,policy:{...f.policy,hash:'e'.repeat(64)}})).rejects.toMatchObject({code:'FACTOR_INVALID'});
  });
  it('rejects expired challenge/session and unbounded or future ceremony evidence',async()=>{
    const f=setup();for(const ceremony of [{...f.ceremony,expiresAt:new Date(Date.now()-1).toISOString()},{...f.ceremony,sessionExpiresAt:new Date(Date.now()-1).toISOString()}]){
      await expect(verifier.verify({...f.input,ceremony})).rejects.toMatchObject({code:'FACTOR_EXPIRED'});
    }
    await expect(verifier.verify({...f.input,ceremony:{...f.ceremony,createdAt:new Date(Date.now()+5000).toISOString()}})).rejects.toMatchObject({code:'FACTOR_INVALID'});
    await expect(verifier.verify({...f.input,ceremony:{...f.ceremony,createdAt:new Date(Date.now()-1000000).toISOString()}})).rejects.toMatchObject({code:'FACTOR_INVALID'});
  });
  it('requires explicit approval for production and exact secure relying-party origin',async()=>{
    const f=setup();for(const policy of [{...f.policy,environment:'PRODUCTION'},{...f.policy,environment:'PRODUCTION',approvalStatus:'APPROVED',origin:'https://localhost'},{...f.policy,rpId:'other.test'},{...f.policy,origin:'http://unsafe.test',rpId:'unsafe.test'}]){
      await expect(verifier.verify({...f.input,policy})).rejects.toMatchObject({code:'FACTOR_POLICY_UNAVAILABLE'});
    }
  });
  it('makes synced passkeys an explicit policy and validates backup eligibility flags',async()=>{
    const f=setup();const response=f.assertion({flags:29});const credential={...f.credential,deviceType:'multiDevice'};
    await expect(verifier.verify({...f.input,response,credential})).rejects.toMatchObject({code:'FACTOR_INVALID'});
    expect(await verifier.verify({...f.input,response,credential,policy:{...f.policy,allowSyncedPasskeys:true}})).toMatchObject({deviceType:'multiDevice',backedUp:true});
    await expect(verifier.verify({...f.input,response:f.assertion({flags:21})})).rejects.toMatchObject({code:'FACTOR_INVALID'});
  });
  it('accepts authenticators with no signature counter only with a valid one-use server challenge',async()=>{
    const f=setup();expect(await verifier.verify({...f.input,credential:{...f.credential,counter:0},response:f.assertion({counter:0})})).toMatchObject({oldCounter:0,newCounter:0});
  });
  it('bounds browser data and masks malformed credential/parser errors',async()=>{
    const f=setup();for(const response of [{...f.input.response,assurance:'PHISHING_RESISTANT'},{...f.input.response,response:{...f.input.response.response,clientDataJSON:'a'.repeat(3000)}}]){
      await expect(verifier.verify({...f.input,response})).rejects.toMatchObject({code:'FACTOR_INVALID',message:'FACTOR_INVALID'});
    }
    await expect(verifier.verify({...f.input,credential:{...f.credential,publicKey:'e30'}})).rejects.toMatchObject({code:'FACTOR_INVALID'});
  });
});
