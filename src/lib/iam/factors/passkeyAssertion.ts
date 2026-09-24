import {createHash} from 'node:crypto';
import {verifyAuthenticationResponse} from '@simplewebauthn/server';
import {decodeCredentialPublicKey,cose} from '@simplewebauthn/server/helpers';
import {z} from 'zod';
import {workforceEnvironmentSchema} from '../../../shared/iam/contracts.js';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const timestamp=z.iso.datetime({offset:true});
const encoded=(maximum:number)=>z.string().min(1).max(maximum).regex(/^[A-Za-z0-9_-]+$/)
  .refine(value=>Buffer.from(value,'base64url').toString('base64url')===value);
const credentialId=encoded(1400);
export const passkeyPolicySchema=z.object({
  id:z.uuid(),hash:digest,environment:workforceEnvironmentSchema,
  approvalStatus:z.enum(['PENDING_FOUNDER_OPERATIONAL_APPROVAL','APPROVED']),
  rpId:z.string().min(1).max(253),origin:z.url().max(300),allowSyncedPasskeys:z.boolean(),
  challengeTtlSeconds:z.number().int().min(30).max(600),
}).strict().superRefine((value,context)=>{
  const url=new URL(value.origin);
  const loopback=['localhost','127.0.0.1'].includes(url.hostname);
  const local=value.environment==='LOCAL'&&loopback;
  if(url.origin!==value.origin || url.hostname!==value.rpId || (url.protocol!=='https:' && !(local&&url.protocol==='http:'))
    || url.username || url.password || (value.environment!=='LOCAL'&&loopback))context.addIssue({code:'custom',message:'Exact secure relying-party origin is required.'});
});
export type PasskeyPolicy=z.infer<typeof passkeyPolicySchema>;
/** Authoritative reviewed registration evidence, loaded by a trusted repository, never from request JSON. */
export const reviewedPasskeyCredentialSchema=z.object({
  recordId:z.uuid(),id:credentialId,organizationId:z.uuid(),membershipId:z.uuid(),environment:workforceEnvironmentSchema,
  status:z.literal('ACTIVE'),version:z.number().int().positive(),publicKey:encoded(4096),algorithm:z.literal(-7),
  userHandle:encoded(86),counter:z.number().int().min(0).max(0xffffffff),
  deviceType:z.enum(['singleDevice','multiDevice']),rpId:z.string().min(1).max(253),
  enrollmentReceiptHash:digest,identityReceiptHash:digest,
}).strict();
export type ReviewedPasskeyCredential=z.infer<typeof reviewedPasskeyCredentialSchema>;
export const passkeyCeremonySchema=z.object({
  id:z.uuid(),organizationId:z.uuid(),membershipId:z.uuid(),sessionId:z.uuid(),environment:workforceEnvironmentSchema,
  actionHash:digest,challengeHash:digest,policyHash:digest,credentialRecordId:z.uuid(),credentialVersion:z.number().int().positive(),
  createdAt:timestamp,expiresAt:timestamp,sessionExpiresAt:timestamp,
}).strict();
export type PasskeyCeremony=z.infer<typeof passkeyCeremonySchema>;
const assertionSchema=z.object({id:credentialId,rawId:credentialId,type:z.literal('public-key'),
  response:z.object({clientDataJSON:encoded(2800),authenticatorData:encoded(5500),signature:encoded(1400),userHandle:encoded(86).optional()}).strict(),
  authenticatorAttachment:z.enum(['platform','cross-platform']).optional(),clientExtensionResults:z.object({}).strict(),
}).strict();
const clientDataSchema=z.object({type:z.literal('webauthn.get'),challenge:encoded(86),origin:z.string().max(300),crossOrigin:z.literal(false).optional()}).strict();
export const passkeyAssertionProofSchema=z.object({
  ceremonyId:z.uuid(),organizationId:z.uuid(),membershipId:z.uuid(),sessionId:z.uuid(),environment:workforceEnvironmentSchema,
  actionHash:digest,policyHash:digest,credentialRecordId:z.uuid(),credentialVersion:z.number().int().positive(),
  oldCounter:z.number().int().min(0).max(0xffffffff),newCounter:z.number().int().min(0).max(0xffffffff),
  deviceType:z.enum(['singleDevice','multiDevice']),backedUp:z.boolean(),
  assertionHash:digest,enrollmentReceiptHash:digest,verifiedAt:timestamp,expiresAt:timestamp,
  assurance:z.literal('PHISHING_RESISTANT'),source:z.literal('WEBAUTHN_UV'),
}).strict();
export type PasskeyAssertionProof=z.infer<typeof passkeyAssertionProofSchema>;
export class PasskeyAssertionError extends Error {
  constructor(readonly code:'FACTOR_INVALID'|'FACTOR_POLICY_UNAVAILABLE'|'FACTOR_EXPIRED'){super(code);}
}

/**
 * Verification is not authorization. Caller must load all three context records
 * from reviewed authority and atomically commit proof/counter CAS/nonce use.
 * No public-key enrollment, recovery, session upgrade or role grant occurs here.
 */
export class PasskeyAssertionVerifier {
  constructor(private readonly now:()=>number=Date.now){}
  async verify(input:{response:unknown;policy:unknown;credential:unknown;ceremony:unknown}):Promise<PasskeyAssertionProof>{
    const parsedPolicy=passkeyPolicySchema.safeParse(input.policy);
    if(!parsedPolicy.success || parsedPolicy.data.environment==='PRODUCTION'&&parsedPolicy.data.approvalStatus!=='APPROVED')throw new PasskeyAssertionError('FACTOR_POLICY_UNAVAILABLE');
    const policy=parsedPolicy.data;
    const credential=reviewedPasskeyCredentialSchema.safeParse(input.credential),ceremony=passkeyCeremonySchema.safeParse(input.ceremony),response=assertionSchema.safeParse(input.response);
    if(!credential.success||!ceremony.success||!response.success)throw new PasskeyAssertionError('FACTOR_INVALID');
    const c=credential.data,b=ceremony.data,r=response.data,now=this.now();
    if(Date.parse(b.expiresAt)<=now || Date.parse(b.sessionExpiresAt)<=now)throw new PasskeyAssertionError('FACTOR_EXPIRED');
    try {
      if(c.environment!==policy.environment||b.environment!==policy.environment||c.organizationId!==b.organizationId||c.membershipId!==b.membershipId
        ||c.recordId!==b.credentialRecordId||c.version!==b.credentialVersion||b.policyHash!==policy.hash||c.rpId!==policy.rpId
        ||r.id!==c.id||r.rawId!==c.id||(r.response.userHandle!==undefined&&r.response.userHandle!==c.userHandle)
        ||Date.parse(b.createdAt)>now||Date.parse(b.expiresAt)<=Date.parse(b.createdAt)
        ||Date.parse(b.expiresAt)-Date.parse(b.createdAt)>policy.challengeTtlSeconds*1000
        ||Date.parse(b.expiresAt)>Date.parse(b.sessionExpiresAt))throw new Error('context');
      // Reject embedded/cross-origin Safari responses even when the underlying
      // library permits absent topOrigin for compatibility. This desk is same-origin.
      const client=clientDataSchema.parse(JSON.parse(Buffer.from(r.response.clientDataJSON,'base64url').toString('utf8')));
      if(client.origin!==policy.origin||hash(client.challenge)!==b.challengeHash)throw new Error('challenge');
      const bytes=new Uint8Array(Buffer.from(c.publicKey,'base64url'));
      const key=decodeCredentialPublicKey(bytes);
      if(!cose.isCOSEPublicKeyEC2(key)||key.get(cose.COSEKEYS.alg)!==cose.COSEALG.ES256||key.get(cose.COSEKEYS.crv)!==cose.COSECRV.P256)throw new Error('unsupported-key');
      const result=await verifyAuthenticationResponse({response:r,expectedChallenge:value=>hash(value)===b.challengeHash,
        expectedOrigin:policy.origin,expectedRPID:policy.rpId,expectedType:'webauthn.get',requireUserVerification:true,
        credential:{id:c.id,publicKey:bytes,counter:c.counter}});
      const info=result.authenticationInfo;
      if(!result.verified||!info.userVerified||info.credentialID!==c.id||info.origin!==policy.origin||info.rpID!==policy.rpId
        ||info.credentialDeviceType!==c.deviceType||(!policy.allowSyncedPasskeys&&info.credentialDeviceType!=='singleDevice')
        ||info.authenticatorExtensionResults&&Object.keys(info.authenticatorExtensionResults).length)throw new Error('invalid');
      return passkeyAssertionProofSchema.parse({ceremonyId:b.id,organizationId:b.organizationId,membershipId:b.membershipId,sessionId:b.sessionId,
        environment:b.environment,actionHash:b.actionHash,policyHash:b.policyHash,credentialRecordId:c.recordId,credentialVersion:c.version,
        oldCounter:c.counter,newCounter:info.newCounter,deviceType:info.credentialDeviceType,backedUp:info.credentialBackedUp,
        assertionHash:hash(JSON.stringify(r)),enrollmentReceiptHash:c.enrollmentReceiptHash,
        verifiedAt:new Date(now).toISOString(),expiresAt:b.expiresAt,assurance:'PHISHING_RESISTANT',source:'WEBAUTHN_UV'});
    } catch {throw new PasskeyAssertionError('FACTOR_INVALID');}
  }
}
