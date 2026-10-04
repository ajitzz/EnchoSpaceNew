import {z} from 'zod';
import {offerDateSchema} from './contracts.js';
import {MAX_PUBLIC_OFFER_AMOUNT_MINOR} from './publicPrice.js';

const positiveId=z.number().int().positive().max(2147483647);
const version=z.number().int().nonnegative().safe();
const uuid=z.string().uuid();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const amount=z.string().regex(/^[1-9]\d{0,18}$/).refine(value=>BigInt(value)<=MAX_PUBLIC_OFFER_AMOUNT_MINOR);
const instant=z.iso.datetime({offset:true});

export const offerDraftInputSchema=z.object({
  commandId:uuid,listingId:positiveId,roomTypeId:positiveId,offerId:uuid.optional(),
  amountMinor:amount,stayStart:offerDateSchema,stayEnd:offerDateSchema,
  effectiveFrom:instant,effectiveUntil:instant,maxGuests:positiveId,minNights:positiveId,
  expectedVersion:version.optional(),
}).strict().superRefine((value,ctx)=>{
  const nights=(Date.parse(value.stayEnd)-Date.parse(value.stayStart))/86400000;
  if(!Number.isSafeInteger(nights)||nights<1||value.minNights>nights)
    ctx.addIssue({code:'custom',path:['stayEnd'],message:'Stay scope must be ordered and satisfy minimum stay.'});
  if(Date.parse(value.effectiveUntil)<=Date.parse(value.effectiveFrom))
    ctx.addIssue({code:'custom',path:['effectiveUntil'],message:'Effective end must follow start.'});
  if((value.offerId===undefined)!==(value.expectedVersion===undefined))
    ctx.addIssue({code:'custom',path:['expectedVersion'],message:'Successor requires an exact offer version.'});
});
export type OfferDraftInput=z.infer<typeof offerDraftInputSchema>;

export const offerTransitionInputSchema=z.object({offerId:uuid,revision:positiveId,expectedVersion:version}).strict();
export type OfferTransitionInput=z.infer<typeof offerTransitionInputSchema>;

export const offerRevisionStatusSchema=z.enum(['DRAFT','SUBMITTED','ACCEPTED','SUPERSEDED','RETIRED']);
export type OfferRevisionStatus=z.infer<typeof offerRevisionStatusSchema>;
export const offerRevisionViewSchema=z.object({
  offerId:uuid,listingId:positiveId,roomTypeId:positiveId,hostAccountId:positiveId,
  revision:positiveId,status:offerRevisionStatusSchema,amountMinor:amount,currency:z.literal('INR'),
  priceBasis:z.literal('PER_ROOM_NIGHT'),stayStart:offerDateSchema,stayEnd:offerDateSchema,
  effectiveFrom:instant,effectiveUntil:instant,maxGuests:positiveId,minNights:positiveId,
  sourceHash:hash,mediaHash:hash,createdAt:instant,submittedAt:instant.nullable(),
  acceptedAt:instant.nullable(),retiredAt:instant.nullable(),version,
}).strict();
export type OfferRevisionView=z.infer<typeof offerRevisionViewSchema>;

export const eligiblePublicOfferSchema=z.object({
  listingId:positiveId,roomTypeId:positiveId,offerId:uuid,revision:positiveId,
  amountMinor:amount,currency:z.literal('INR'),priceBasis:z.literal('PER_ROOM_NIGHT'),
  stayStart:offerDateSchema,stayEnd:offerDateSchema,effectiveFrom:instant,effectiveUntil:instant,
  maxGuests:positiveId,minNights:positiveId,availableStartDate:offerDateSchema,observedAt:instant,
}).strict();
export type EligiblePublicOffer=z.infer<typeof eligiblePublicOfferSchema>;

export const publicOfferStateSchema=z.object({
  listingId:positiveId,roomTypeId:positiveId.nullable(),offerId:uuid.nullable(),
  state:z.enum(['VERIFIED_OFFER_AVAILABLE','NO_ACCEPTED_OFFER','OFFER_NOT_YET_EFFECTIVE','OFFER_EXPIRED','OFFER_RETIRED',
    'OFFER_STALE_REVIEW','ROOM_UNAVAILABLE','LEGACY_DATA_UNRECONCILED']),observedAt:instant,
}).strict();
export type PublicOfferState=z.infer<typeof publicOfferStateSchema>;
