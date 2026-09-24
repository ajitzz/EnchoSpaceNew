import {createHash,createPublicKey,type KeyObject} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {z} from 'zod';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const workforceGoogleClientIdSchema=z.string().regex(/^[A-Za-z0-9_-]{8,200}\.apps\.googleusercontent\.com$/);
const keyId=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const jwkSchema=z.object({kty:z.literal('RSA'),use:z.literal('sig'),alg:z.literal('RS256'),kid:keyId,
  n:z.string().regex(/^[A-Za-z0-9_-]{342,1366}$/),e:z.string().regex(/^[A-Za-z0-9_-]{2,12}$/)}).strict();
const keysSchema=z.object({keys:z.array(jwkSchema).min(1).max(10)}).strict();
const headerSchema=z.object({alg:z.literal('RS256'),kid:keyId,typ:z.literal('JWT').optional()}).strict();
const inputSchema=z.object({credential:z.string().min(100).max(16000),nonceHash:z.string().regex(/^[a-f0-9]{64}$/),
  maximumAgeSeconds:z.number().int().min(60).max(600)}).strict();
const claimsSchema=z.object({iss:z.enum(['https://accounts.google.com','accounts.google.com']),
  aud:workforceGoogleClientIdSchema,azp:workforceGoogleClientIdSchema.optional(),
  sub:z.string().regex(/^[\x21-\x7e]{1,255}$/),email:z.email().max(254),email_verified:z.literal(true),
  nonce:z.string().regex(/^[A-Za-z0-9_-]{43}$/),iat:z.number().int().positive(),exp:z.number().int().positive(),
  hd:z.string().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/).optional(),
  auth_time:z.number().int().positive().optional(),
}).passthrough();

export const verifiedGoogleWorkforceIdentitySchema=z.object({
  subject:z.string().regex(/^[\x21-\x7e]{1,255}$/),email:z.email().max(254),hostedDomain:z.string().max(253).nullable(),
  audience:workforceGoogleClientIdSchema,nonceHash:z.string().regex(/^[a-f0-9]{64}$/),
  tokenHash:z.string().regex(/^[a-f0-9]{64}$/),issuedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),
  verifiedAt:z.iso.datetime(),providerAuthenticatedAt:z.iso.datetime().nullable(),
  assurance:z.literal('AAL1'),source:z.literal('GOOGLE_OIDC'),
}).strict();
export type VerifiedGoogleWorkforceIdentity=z.infer<typeof verifiedGoogleWorkforceIdentitySchema>;
export interface GoogleWorkforceIdentityPort {
  verify(input:z.infer<typeof inputSchema>):Promise<VerifiedGoogleWorkforceIdentity>;
}
export class GoogleWorkforceIdentityError extends Error {
  constructor(readonly code:'IDENTITY_INVALID'|'IDENTITY_KEYS_UNAVAILABLE'|'IDENTITY_CONFIGURATION_UNAVAILABLE') {super(code);}
}

const GOOGLE_JWKS='https://www.googleapis.com/oauth2/v3/certs';
/** Fixed Google endpoint, bounded body/key count/TTL, coalesced refresh and no stale-key fallback. */
export class GoogleWorkforceSigningKeys {
  private cache:{until:number;keys:Map<string,KeyObject>}|null=null;
  private pending:Promise<void>|null=null;
  private nextRefresh=0;
  constructor(private readonly fetcher:typeof fetch=fetch,private readonly now:()=>number=Date.now) {}
  async key(kid:string):Promise<KeyObject> {
    if (!keyId.safeParse(kid).success) throw new GoogleWorkforceIdentityError('IDENTITY_INVALID');
    const current=this.cache;
    if (current && current.until>this.now() && current.keys.has(kid)) return current.keys.get(kid)!;
    if (this.pending) await this.pending;
    else if (this.now()>=this.nextRefresh) {
      this.nextRefresh=this.now()+60000; // Unknown-kid spray cannot generate one network request per token.
      this.pending=this.refresh();
      try {await this.pending;} finally {this.pending=null;}
    }
    const key=this.cache && this.cache.until>this.now()?this.cache.keys.get(kid):null;
    if (!key) throw new GoogleWorkforceIdentityError(this.cache?.until && this.cache.until>this.now()?'IDENTITY_INVALID':'IDENTITY_KEYS_UNAVAILABLE');
    return key;
  }
  private async refresh():Promise<void> {
    try {
      const response=await this.fetcher(GOOGLE_JWKS,{redirect:'error',signal:AbortSignal.timeout(5000),headers:{Accept:'application/json'}});
      if (!response.ok || !response.body || Number(response.headers.get('content-length')??0)>65536) throw new Error('unavailable');
      const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
      try {
        for (;;) {
          const next=await reader.read();if(next.done)break;
          size+=next.value.byteLength;if(size>65536){await reader.cancel();throw new Error('oversized');}chunks.push(next.value);
        }
      } finally {reader.releaseLock();}
      const parsed=keysSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const keys=new Map<string,KeyObject>();
      for (const jwk of parsed.keys) {
        if(keys.has(jwk.kid))throw new Error('duplicate');
        const publicKey=createPublicKey({key:jwk,format:'jwk'});
        const bits=publicKey.asymmetricKeyDetails?.modulusLength;
        if(publicKey.asymmetricKeyType!=='rsa' || !bits || bits<2048 || bits>8192)throw new Error('unsupported');
        keys.set(jwk.kid,publicKey);
      }
      const age=Number(response.headers.get('age')??0);
      const directive=response.headers.get('cache-control')??'';
      const maxAge=Number(/(?:^|,)\s*max-age=(\d+)(?:,|$)/i.exec(directive)?.[1]??0);
      if(!Number.isFinite(age)||age<0 || !maxAge || /(?:^|,)\s*(?:no-store|no-cache)(?:,|$)/i.test(directive))throw new Error('uncacheable');
      const ttl=Math.max(0,Math.min(3600,maxAge-age));if(!ttl)throw new Error('expired');
      this.cache={until:this.now()+ttl*1000,keys};
    } catch {throw new GoogleWorkforceIdentityError('IDENTITY_KEYS_UNAVAILABLE');}
  }
}

/** Does not trust consumer JWTs, browser claims, hosted-domain hints, or provider amr as MFA. */
export class GoogleWorkforceIdentity implements GoogleWorkforceIdentityPort {
  private readonly audience:string;
  constructor(audience:unknown,private readonly keys=new GoogleWorkforceSigningKeys(),private readonly now:()=>number=Date.now) {
    const parsed=workforceGoogleClientIdSchema.safeParse(audience);
    if(!parsed.success)throw new GoogleWorkforceIdentityError('IDENTITY_CONFIGURATION_UNAVAILABLE');this.audience=parsed.data;
  }
  async verify(rawInput:z.infer<typeof inputSchema>):Promise<VerifiedGoogleWorkforceIdentity> {
    const input=inputSchema.safeParse(rawInput);if(!input.success)throw new GoogleWorkforceIdentityError('IDENTITY_INVALID');
    const decoded=jwt.decode(input.data.credential,{complete:true});
    const header=headerSchema.safeParse(decoded?.header);if(!header.success)throw new GoogleWorkforceIdentityError('IDENTITY_INVALID');
    const key=await this.keys.key(header.data.kid);
    try {
      const nowSeconds=Math.floor(this.now()/1000);
      const raw=jwt.verify(input.data.credential,key,{algorithms:['RS256'],audience:this.audience,
        issuer:['https://accounts.google.com','accounts.google.com'],clockTimestamp:nowSeconds,clockTolerance:0});
      const claims=claimsSchema.parse(raw);const email=claims.email.toLowerCase();
      if(claims.aud!==this.audience || (claims.azp && claims.azp!==this.audience) || hash(claims.nonce)!==input.data.nonceHash
        || claims.iat>nowSeconds+30 || claims.iat<nowSeconds-input.data.maximumAgeSeconds || claims.exp<=nowSeconds || claims.exp<=claims.iat
        || claims.exp-claims.iat>3600 || (claims.auth_time && claims.auth_time>nowSeconds+30)
        || (!email.endsWith('@gmail.com') && (!claims.hd || email.split('@')[1]!==claims.hd)))throw new Error('invalid');
      return verifiedGoogleWorkforceIdentitySchema.parse({subject:claims.sub,email,hostedDomain:claims.hd??null,
        audience:this.audience,nonceHash:input.data.nonceHash,tokenHash:hash(input.data.credential),issuedAt:new Date(claims.iat*1000).toISOString(),
        expiresAt:new Date(claims.exp*1000).toISOString(),verifiedAt:new Date(this.now()).toISOString(),
        providerAuthenticatedAt:claims.auth_time?new Date(claims.auth_time*1000).toISOString():null,assurance:'AAL1',source:'GOOGLE_OIDC'});
    } catch {throw new GoogleWorkforceIdentityError('IDENTITY_INVALID');}
  }
}
