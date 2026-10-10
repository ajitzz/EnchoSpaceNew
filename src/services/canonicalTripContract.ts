import {z} from 'zod';

const id = z.number().int().positive().max(2147483647);
const date = z.iso.date();
const instant = z.iso.datetime({precision: 6});

/** Only snapshot facts and qualified dispositions cross this boundary. No raw
 * provider, IAM, authorization packet, hold, quote or inventory-row identities. */
export const canonicalTripSchema = z.object({
  schemaVersion: z.literal('ENCHO_TRIP_V1'),
  reservationId: z.uuid(),
  origin: z.literal('ENCHO_DIRECT'),
  reservedAt: instant,
  inventoryCommitment: z.literal('INVENTORY_COMMITTED'),
  stay: z.object({
    version: z.number().int().positive(),
    authority: z.enum(['ORIGINAL_COMMITTED', 'SEALED_SUCCESSOR_SNAPSHOT']),
    listingId: id,
    roomTypeId: id,
    offerId: z.uuid(),
    offerRevision: z.number().int().positive(),
    checkIn: date,
    checkOut: date,
    nights: z.number().int().min(1).max(366),
    guestCount: z.number().int().positive(),
    roomSubtotalMinor: z.string().regex(/^[1-9][0-9]{0,18}$/),
    currency: z.literal('INR'),
    allocation: z.array(z.object({date, units: z.number().int().positive()}).strict()).min(1).max(366),
  }).strict(),
  payment: z.object({
    composition: z.enum(['VERIFIED_ORIGINAL_BOOKING', 'NOT_ESTABLISHED']),
    compositionVersion: z.literal(1).nullable(),
    currentCondition: z.enum(['NO_ATTEMPT', 'INITIATED', 'AUTHORIZED', 'EVIDENCE_CAPTURED',
      'MATCHED_CAPTURE', 'FAILED', 'UNKNOWN', 'RECONCILIATION_REQUIRED']),
    effectiveRevisionClearance: z.enum(['ORIGINAL_COMPOSITION', 'NOT_ESTABLISHED']),
  }).strict(),
  lifecycle: z.object({
    state: z.enum(['ACTIVE', 'CANCELLATION_REQUESTED', 'CANCELLED']),
    inventoryRelease: z.enum(['NOT_RECORDED', 'VERIFIED_EFFECTIVE_ALLOCATION']),
  }).strict(),
  refund: z.object({
    decision: z.enum(['NONE_RECORDED', 'LOCAL_TEST_EVIDENCE', 'AUTHENTICATED_ADMISSION']),
    authorization: z.enum(['NONE_RECORDED', 'RECORDED_ONLY']),
    execution: z.literal('NOT_ESTABLISHED'),
    settlement: z.literal('NOT_ESTABLISHED'),
    remainingBalance: z.literal('UNSUPPORTED'),
    externalHistory: z.literal('UNKNOWN'),
  }).strict(),
  checkIn: z.literal('UNSUPPORTED'),
  fulfillment: z.literal('UNSUPPORTED'),
  dispute: z.literal('UNSUPPORTED'),
}).strict().superRefine((trip, ctx) => {
  const stay = trip.stay;
  if (Date.parse(stay.checkOut) - Date.parse(stay.checkIn) !== stay.nights * 86400000 ||
    stay.allocation.length !== stay.nights ||
    stay.allocation.some((night, index) => Date.parse(night.date) !== Date.parse(stay.checkIn) + index * 86400000) ||
    (stay.version === 1) !== (stay.authority === 'ORIGINAL_COMMITTED') ||
    (trip.payment.composition === 'VERIFIED_ORIGINAL_BOOKING') !== (trip.payment.compositionVersion === 1) ||
    (trip.payment.effectiveRevisionClearance === 'ORIGINAL_COMPOSITION' &&
      (stay.version !== 1 || trip.payment.composition !== 'VERIFIED_ORIGINAL_BOOKING')) ||
    (trip.lifecycle.state === 'CANCELLED') !== (trip.lifecycle.inventoryRelease === 'VERIFIED_EFFECTIVE_ALLOCATION')) {
    ctx.addIssue({code: 'custom', message: 'TRIP_SOURCE_INTEGRITY'});
  }
});

export type CanonicalTrip = z.infer<typeof canonicalTripSchema>;
export type CanonicalTripPage = {
  schemaVersion: 'ENCHO_TRIP_PAGE_V1'; trips: CanonicalTrip[]; nextCursor: string | null;
};

/** A bearer proof issued ONLY after the injected trusted authentication port
 * establishes an account. It is authenticated again by PostgreSQL. This is a
 * read capability, not consumer-session authentication/revocation (R1-03). */
export const tripReadProofSchema = z.object({
  keyId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  accountId: id,
  expiresAtSeconds: z.number().int().positive().safe(),
  nonce: z.uuid(),
  mac: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type TripReadProof = z.infer<typeof tripReadProofSchema>;
export interface TripAuthenticationPort<Context> {
  authenticate(context: Context): Promise<TripReadProof | null>;
}
