import type pg from 'pg';
import {z} from 'zod';
import {profileSchema,hashSchema} from '../../shared/adtech/contracts.js';
import {roomOfferTierEvidenceSchema} from '../../shared/offers/contracts.js';
import {resolvePriceTier,validateTierIntervals} from '../marketing/adtech/contracts.js';
import {fingerprint} from '../marketing/domain.js';
import {OfferEvidenceError,verifyRoomOfferObservation} from './evidence.js';

const releaseContentSchema=z.object({releaseId:z.number().int().positive(),versions:z.array(z.object({profileVersionId:z.number().int().positive(),profileHash:hashSchema,profile:profileSchema}).strict()).length(3)}).strict();
const releaseSchema=releaseContentSchema.extend({releaseHash:hashSchema}).strict();
export type ReleasedOfferTierEvidence=z.infer<typeof releaseSchema>;

/** Requires an already authorized catalog connection; never elevates host RLS. */
export async function readCurrentOfferTierRelease(client:pg.PoolClient):Promise<ReleasedOfferTierEvidence>{
  try{
    const rows=(await client.query(`SELECT m.release_id,v.id AS profile_version_id,v.profile_hash,v.config,
      v.profile_hash=encode(sha256(convert_to(v.config::text,'UTF8')),'hex') AS hash_valid
      FROM marketing_adtech_current_release c JOIN marketing_adtech_release_members m ON m.release_id=c.release_id
      JOIN marketing_adtech_profile_versions v ON v.id=m.version_id AND v.profile_id=m.profile_id
      WHERE c.singleton ORDER BY v.min_price_minor`)).rows as Record<string,unknown>[];
    if(rows.length!==3||rows.some(row=>row.hash_valid!==true||row.release_id!==rows[0].release_id))throw new OfferEvidenceError('STRATEGY_RELEASE_UNAVAILABLE');
    const content=releaseContentSchema.parse({releaseId:rows[0].release_id,versions:rows.map(row=>({profileVersionId:row.profile_version_id,profileHash:row.profile_hash,profile:row.config}))});
    validateTierIntervals(content.versions.map(version=>version.profile));
    return {...content,releaseHash:fingerprint(content)};
  }catch(error){if(error instanceof OfferEvidenceError)throw error;throw new OfferEvidenceError('STRATEGY_RELEASE_UNAVAILABLE',error);}
}

/** Internal preparation helper. Release evidence must originate from the DB reader. */
export function classifyRoomOffer(input:unknown,rawRelease:unknown){
  const snapshot=verifyRoomOfferObservation(input);const parsed=releaseSchema.safeParse(rawRelease);
  if(!parsed.success)throw new OfferEvidenceError('STRATEGY_RELEASE_UNAVAILABLE');
  const{releaseHash,...content}=parsed.data;
  if(fingerprint(content)!==releaseHash||new Set(content.versions.map(v=>v.profileVersionId)).size!==3)throw new OfferEvidenceError('STRATEGY_RELEASE_UNAVAILABLE');
  const price={version:1,listingId:snapshot.offer.listingId,roomTypeId:snapshot.offer.roomTypeId,currency:snapshot.offer.price.currency,
    amountMinor:snapshot.offer.price.amountMinor,basis:'ROOM_TYPE_BASE_NIGHT',sourceHash:snapshot.offer.versionHash,observedAt:snapshot.observedAt};
  let selected:z.infer<typeof profileSchema>;
  try{selected=resolvePriceTier(price,content.versions.map(version=>version.profile)).profile;}
  catch(error){throw new OfferEvidenceError(error instanceof Error&&'code'in error&&error.code==='STRATEGY_UNCLASSIFIED'?'STRATEGY_UNCLASSIFIED':'STRATEGY_RELEASE_UNAVAILABLE',error);}
  const version=content.versions.find(v=>v.profile.tier===selected.tier)!;
  return Object.freeze(roomOfferTierEvidenceSchema.parse({contractVersion:1,kind:'ROOM_PRICE_TIER_PREFLIGHT',offerVersionHash:snapshot.offer.versionHash,snapshotHash:snapshot.snapshotHash,
    releaseId:content.releaseId,profileVersionId:version.profileVersionId,profileHash:version.profileHash,tier:selected.tier,amountMinor:price.amountMinor,currency:'INR',audienceIdentityInferred:false,campaignPublicationAllowed:false}));
}
