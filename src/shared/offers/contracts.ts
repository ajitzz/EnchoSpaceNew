import {z} from 'zod';
import {hashSchema,positiveMinorSchema,tierCodeSchema} from '../adtech/contracts.js';

const id=z.number().int().positive().max(2147483647);
export const offerDateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const parsed=new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===value;
},'A real calendar date is required');
export const roomOfferRequestSchema=z.object({
  listingId:id,roomTypeId:id,
  checkIn:offerDateSchema,checkOut:offerDateSchema,
  units:z.number().int().min(1).max(100),guestCount:z.number().int().min(1).max(1000),
}).strict().refine(value=>{
  const nights=(Date.parse(value.checkOut)-Date.parse(value.checkIn))/86400000;
  return Number.isInteger(nights)&&nights>=1&&nights<=90;
},'The stay must contain 1–90 nights, excluding checkout');
export type RoomOfferRequest=z.infer<typeof roomOfferRequestSchema>;

export const roomOfferVersionContentSchema=z.object({
  contractVersion:z.literal(1),kind:z.literal('ROOM_BASE_NIGHT_FACTS'),
  authority:z.literal('HOST_STORED_ROOM_CONFIGURATION'),
  listingId:id,hostAccountId:id,roomTypeId:id,
  canonicalPath:z.string().regex(/^\/stay\/([a-z0-9]+-)*[a-z0-9]+$/),
  roomName:z.string().trim().min(1).max(255),
  price:z.object({currency:z.literal('INR'),amountMinor:positiveMinorSchema,basis:z.literal('ROOM_TYPE_BASE_NIGHT'),source:z.literal('room_types.base_price'),occupancyPriceBasis:z.literal('UNSPECIFIED')}).strict(),
  maximumOccupancy:id,inventoryCount:id,minimumStayNights:id,
}).strict();
export const roomOfferVersionSchema=roomOfferVersionContentSchema.extend({versionHash:hashSchema}).strict();
export type RoomOfferVersion=z.infer<typeof roomOfferVersionSchema>;

export const roomInventoryNightSchema=z.object({
  date:offerDateSchema,totalUnits:z.number().int().nonnegative().max(2147483647),
  heldUnits:z.number().int().nonnegative().max(2147483647),bookedUnits:z.number().int().nonnegative().max(2147483647),
  blockedUnits:z.number().int().nonnegative().max(2147483647),availableUnits:z.number().int().nonnegative().max(2147483647),
}).strict().refine(v=>v.availableUnits===v.totalUnits-v.heldUnits-v.bookedUnits-v.blockedUnits,'Capacity counters must reconcile');
export const availabilityReasonSchema=z.enum(['INVENTORY_DAY_MISSING','INVENTORY_INCONSISTENT','LEGACY_BLOCK_UNRESOLVED','CALENDAR_BLOCKED','INSUFFICIENT_UNITS','MINIMUM_STAY_NOT_MET','OCCUPANCY_EXCEEDED']);
export const offerObservationContentSchema=z.object({
  contractVersion:z.literal(1),kind:z.literal('ROOM_OFFER_PREFLIGHT_OBSERVATION'),
  offer:roomOfferVersionSchema,request:roomOfferRequestSchema,observedAt:z.iso.datetime(),
  availability:z.object({
    source:z.literal('inventory_days'),state:z.enum(['OBSERVED_AVAILABLE','OBSERVED_UNAVAILABLE','AUTHORITY_MISSING']),
    reasons:z.array(availabilityReasonSchema).max(7),
    nights:z.array(roomInventoryNightSchema).max(90),minimumAvailableUnits:z.number().int().nonnegative().nullable(),
    allocationHeld:z.literal(false),
  }).strict(),
  execution:z.object({bookingAllowed:z.literal(false),campaignPublicationAllowed:z.literal(false),publicPriceClaimAllowed:z.literal(false),
    reason:z.literal('ACCEPTED_OFFER_RATE_AND_CONDITIONS_AUTHORITY_REQUIRED')}).strict(),
}).strict().superRefine((v,c)=>{
  if(v.request.listingId!==v.offer.listingId||v.request.roomTypeId!==v.offer.roomTypeId)c.addIssue({code:'custom',message:'Observation must bind the exact canonical room'});
  if(new Set(v.availability.reasons).size!==v.availability.reasons.length)c.addIssue({code:'custom',message:'Availability reasons must be distinct'});
  if(v.availability.state==='OBSERVED_AVAILABLE'&&v.availability.reasons.length)c.addIssue({code:'custom',message:'An available observation cannot contain blockers'});
  if(v.availability.state!=='OBSERVED_AVAILABLE'&&!v.availability.reasons.length)c.addIssue({code:'custom',message:'Unavailable observations require evidence'});
  const count=(Date.parse(v.request.checkOut)-Date.parse(v.request.checkIn))/86400000;
  const dates=v.availability.nights.map(n=>n.date);
  if(new Set(dates).size!==dates.length||dates.some((date,i)=>date<v.request.checkIn||date>=v.request.checkOut||(i>0&&date<=dates[i-1])))c.addIssue({code:'custom',message:'Inventory nights must be unique, ordered and within the requested window'});
  if(v.availability.state==='OBSERVED_AVAILABLE'&&(dates.length!==count||count<v.offer.minimumStayNights||v.request.guestCount>v.offer.maximumOccupancy*v.request.units
    ||v.availability.minimumAvailableUnits===null||v.availability.minimumAvailableUnits<v.request.units
    ||v.availability.nights.some(n=>n.totalUnits>v.offer.inventoryCount||n.availableUnits<v.request.units)
    ||v.availability.minimumAvailableUnits!==Math.min(...v.availability.nights.map(n=>n.availableUnits))))c.addIssue({code:'custom',message:'Available observations require complete reconciling capacity and occupancy evidence'});
});
export const roomOfferObservationSchema=offerObservationContentSchema.safeExtend({snapshotHash:hashSchema}).strict();
export type RoomOfferObservation=z.infer<typeof roomOfferObservationSchema>;
export const roomOfferTierEvidenceSchema=z.object({
  contractVersion:z.literal(1),kind:z.literal('ROOM_PRICE_TIER_PREFLIGHT'),
  offerVersionHash:hashSchema,snapshotHash:hashSchema,releaseId:id,profileVersionId:id,profileHash:hashSchema,
  tier:tierCodeSchema,amountMinor:positiveMinorSchema,currency:z.literal('INR'),
  audienceIdentityInferred:z.literal(false),campaignPublicationAllowed:z.literal(false),
}).strict();
