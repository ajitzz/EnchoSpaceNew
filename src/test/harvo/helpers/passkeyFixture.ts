import {createHash,generateKeyPairSync,randomBytes,randomUUID,sign} from 'node:crypto';
import {isoCBOR} from '@simplewebauthn/server/helpers';
import {passkeyCeremonySchema,passkeyPolicySchema,reviewedPasskeyCredentialSchema} from '../../../lib/iam/factors/passkeyAssertion.js';

/** Disposable cryptographic authenticator; never an enrollment or runtime identity source. */
export function createPasskeyFixture(now:()=>number=Date.now){
  const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const jwk=key.publicKey.export({format:'jwk'});
  const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest();
  const organizationId=randomUUID(),membershipId=randomUUID(),sessionId=randomUUID(),challenge=randomBytes(32).toString('base64url');
  const publicKey=Buffer.from(isoCBOR.encode(new Map<number,number|Uint8Array>([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x!,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y!,'base64url'))]]))).toString('base64url');
  const policy=passkeyPolicySchema.parse({id:randomUUID(),hash:'a'.repeat(64),environment:'LOCAL',approvalStatus:'PENDING_FOUNDER_OPERATIONAL_APPROVAL',
    rpId:'localhost',origin:'http://localhost:3000',allowSyncedPasskeys:false,challengeTtlSeconds:120});
  const credential=reviewedPasskeyCredentialSchema.parse({recordId:randomUUID(),id:randomBytes(32).toString('base64url'),organizationId,membershipId,environment:'LOCAL',
    status:'ACTIVE',version:1,publicKey,algorithm:-7,userHandle:randomBytes(32).toString('base64url'),counter:4,deviceType:'singleDevice',rpId:'localhost',
    enrollmentReceiptHash:'b'.repeat(64),identityReceiptHash:'c'.repeat(64)});
  const createdAt=now();
  const ceremony=passkeyCeremonySchema.parse({id:randomUUID(),organizationId,membershipId,sessionId,environment:'LOCAL',actionHash:'d'.repeat(64),
    challengeHash:digest(challenge).toString('hex'),policyHash:policy.hash,credentialRecordId:credential.recordId,credentialVersion:credential.version,
    createdAt:new Date(createdAt-1000).toISOString(),expiresAt:new Date(createdAt+119000).toISOString(),sessionExpiresAt:new Date(createdAt+300000).toISOString()});
  function assertion(options:{client?:Record<string,unknown>;rpId?:string;flags?:number;counter?:number;wrongKey?:boolean}={}){
    const clientData=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin:policy.origin,crossOrigin:false,...options.client}));
    const authenticatorData=Buffer.alloc(37);digest(options.rpId??policy.rpId).copy(authenticatorData);authenticatorData[32]=options.flags??5;authenticatorData.writeUInt32BE(options.counter??5,33);
    const signature=sign('sha256',Buffer.concat([authenticatorData,digest(clientData)]),options.wrongKey?generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey:key.privateKey);
    return {id:credential.id,rawId:credential.id,type:'public-key',clientExtensionResults:{},
      response:{clientDataJSON:clientData.toString('base64url'),authenticatorData:authenticatorData.toString('base64url'),signature:signature.toString('base64url'),userHandle:credential.userHandle}};
  }
  return {policy,credential,ceremony,challenge,key,assertion,digest};
}
