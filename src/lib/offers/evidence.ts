import {z} from 'zod';
import {fingerprint} from '../marketing/domain.js';
import {positiveMinorSchema} from '../../shared/adtech/contracts.js';
import {offerObservationContentSchema,roomOfferObservationSchema,roomOfferVersionContentSchema,roomOfferVersionSchema,type RoomOfferObservation,type RoomOfferVersion} from '../../shared/offers/contracts.js';

export type OfferEvidenceErrorCode='INPUT_INVALID'|'ACCOUNT_REQUIRED'|'OFFER_NOT_AVAILABLE'|'PRICE_AUTHORITY_INVALID'|'ROOM_AUTHORITY_INVALID'|'CATALOG_UNAVAILABLE'|'SNAPSHOT_INVALID'|'STRATEGY_RELEASE_UNAVAILABLE'|'STRATEGY_UNCLASSIFIED';
export class OfferEvidenceError extends Error{
  readonly status:number;
  constructor(readonly code:OfferEvidenceErrorCode,cause?:unknown){
    super(code,{cause});this.name='OfferEvidenceError';
    this.status=code==='ACCOUNT_REQUIRED'?403:code==='OFFER_NOT_AVAILABLE'?404:code==='CATALOG_UNAVAILABLE'||code==='STRATEGY_RELEASE_UNAVAILABLE'?503:code==='SNAPSHOT_INVALID'?409:422;
  }
}

/** NUMERIC text only. Trailing scale zeros are harmless; fractional paise are not. */
export function canonicalRoomPriceMinor(raw:unknown):string{
  if(typeof raw!=='string'||! /^(0|[1-9]\d{0,17})(\.\d+)?$/.test(raw)||raw.length>100)throw new OfferEvidenceError('PRICE_AUTHORITY_INVALID');
  const [whole,part='']=raw.split('.');
  if(/[1-9]/.test(part.slice(2)))throw new OfferEvidenceError('PRICE_AUTHORITY_INVALID');
  const minor=(BigInt(whole)*100n+BigInt(part.slice(0,2).padEnd(2,'0'))).toString();
  if(!positiveMinorSchema.safeParse(minor).success)throw new OfferEvidenceError('PRICE_AUTHORITY_INVALID');
  return minor;
}

/** Hashes are integrity identities, not signatures or proof of database provenance. */
function freeze<T>(value:T):T{
  if(value&&typeof value==='object'){
    Object.freeze(value);
    for(const nested of Object.values(value))freeze(nested);
  }
  return value;
}
function parse<T>(schema:z.ZodType<T>,input:unknown,code:OfferEvidenceErrorCode):T{
  const result=schema.safeParse(input);if(!result.success)throw new OfferEvidenceError(code);return result.data;
}
export function createRoomOfferVersion(input:unknown):RoomOfferVersion{
  const content=parse(roomOfferVersionContentSchema,input,'ROOM_AUTHORITY_INVALID');
  return freeze({...content,versionHash:fingerprint(content)});
}
export function verifyRoomOfferVersion(input:unknown):RoomOfferVersion{
  const parsed=parse(roomOfferVersionSchema,input,'SNAPSHOT_INVALID');const{versionHash,...content}=parsed;
  if(fingerprint(content)!==versionHash)throw new OfferEvidenceError('SNAPSHOT_INVALID');return freeze(parsed);
}
export function createRoomOfferObservation(input:unknown):RoomOfferObservation{
  const content=parse(offerObservationContentSchema,input,'ROOM_AUTHORITY_INVALID');verifyRoomOfferVersion(content.offer);
  return freeze({...content,snapshotHash:fingerprint(content)});
}
export function verifyRoomOfferObservation(input:unknown):RoomOfferObservation{
  const parsed=parse(roomOfferObservationSchema,input,'SNAPSHOT_INVALID');const{snapshotHash,...content}=parsed;
  verifyRoomOfferVersion(parsed.offer);
  if(fingerprint(content)!==snapshotHash)throw new OfferEvidenceError('SNAPSHOT_INVALID');return freeze(parsed);
}
