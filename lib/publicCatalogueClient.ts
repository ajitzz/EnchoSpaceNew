import { z } from 'zod';
import type { Listing } from '../types';
import {MAX_PUBLIC_OFFER_AMOUNT_MINOR} from '../src/shared/offers/publicPrice';

// This validates the fields required by the existing search/card renderer.
// Published rooms carry canonical relational identity. A public price may be
// absent until a verified offer exists; null is never treated as zero rupees.
const offerStateSchema = z.enum(['VERIFIED_OFFER_AVAILABLE', 'NO_ACCEPTED_OFFER',
  'OFFER_EXPIRED', 'OFFER_NOT_YET_EFFECTIVE', 'OFFER_RETIRED', 'OFFER_STALE_REVIEW', 'ROOM_UNAVAILABLE',
  'OFFER_AUTHORITY_UNAVAILABLE', 'LEGACY_DATA_UNRECONCILED']);
const acceptedOfferSchema = z.object({
  offerId: z.string().uuid(), revision: z.number().int().positive(),
  roomTypeId: z.string().regex(/^[1-9]\d*$/), priceBasis: z.literal('PER_ROOM_NIGHT'),
  amountMinor: z.string().regex(/^[1-9]\d*$/)
    .refine(value => BigInt(value) <= MAX_PUBLIC_OFFER_AMOUNT_MINOR), currency: z.literal('INR'),
  maxGuests: z.number().int().positive(), minNights: z.number().int().positive(),
  stayStart: z.string(), stayEnd: z.string(), effectiveFrom: z.string(),
  effectiveUntil: z.string(), availableStartDate: z.string(), observedAt: z.string(),
}).strict();
const publicCardSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  type: z.string(),
  price: z.number().finite().positive().nullable(),
  priceState: z.enum(['VERIFIED_OFFER_UNAVAILABLE', 'VERIFIED_OFFER_AVAILABLE']),
  offerState: offerStateSchema,
  fromOffer: acceptedOfferSchema.nullable(),
  roomState: z.enum(['CANONICAL', 'NO_ROOM', 'LEGACY_DATA_UNRECONCILED']).optional(),
  currency: z.string().min(1),
  imageUrl: z.string(),
  imageUrls: z.array(z.string()),
  imageCount: z.number().int().nonnegative(),
  isVerified: z.boolean(),
  rooms: z.array(z.object({
    name: z.string(),
    type: z.string(),
    id: z.string().regex(/^[1-9]\d*$/).optional(),
    price: z.number().finite().positive().nullable(),
    priceState: z.enum(['VERIFIED_OFFER_UNAVAILABLE', 'VERIFIED_OFFER_AVAILABLE']),
    offerState: offerStateSchema,
    offer: acceptedOfferSchema.nullable(),
  }).passthrough()),
  photos: z.array(z.object({
    url: z.string().min(1),
    category: z.string(),
    tier: z.string(),
    room_type_id: z.string().regex(/^[1-9]\d*$/).nullable().optional(),
  }).passthrough()).optional(),
}).passthrough().superRefine((card, context) => {
  const verified = card.priceState === 'VERIFIED_OFFER_AVAILABLE';
  if (verified !== Boolean(card.fromOffer) || verified !== (card.price !== null) ||
    (verified && (card.offerState !== 'VERIFIED_OFFER_AVAILABLE' ||
      card.currency !== card.fromOffer?.currency ||
      card.price !== Number(card.fromOffer?.amountMinor) / 100))) {
    context.addIssue({code: 'custom', message: 'Property price must match its accepted offer'});
  }
  for (const room of card.rooms) {
    const available = room.priceState === 'VERIFIED_OFFER_AVAILABLE';
    if (available !== Boolean(room.offer) || available !== (room.price !== null) ||
      (available && (room.offerState !== 'VERIFIED_OFFER_AVAILABLE' ||
        room.id !== room.offer?.roomTypeId || room.price !== Number(room.offer?.amountMinor) / 100))) {
      context.addIssue({code: 'custom', message: 'Room price must match its accepted offer'});
    }
  }
  if (card.fromOffer && !card.rooms.some(room => room.id === card.fromOffer?.roomTypeId &&
    room.offer?.offerId === card.fromOffer?.offerId && room.offer.revision === card.fromOffer.revision)) {
    context.addIssue({code: 'custom', message: 'Property from price must name a published room offer'});
  }
  if (card.roomState === 'CANONICAL') {
    const ids = card.rooms.map(room => room.id);
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
      context.addIssue({code: 'custom', message: 'Canonical rooms need distinct identities'});
    }
    if (card.photos?.some(photo => photo.room_type_id != null && !ids.includes(photo.room_type_id))) {
      context.addIssue({code: 'custom', message: 'Room media must reference a published canonical room'});
    }
  }
});

const publicCatalogueSchema = z.array(publicCardSchema);

export type PublicCataloguePage = {items: Listing[]; nextCursor: string | null};

export async function readCurrentPublicCataloguePage(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<PublicCataloguePage> {
  const response = await fetcher(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('PUBLIC_CATALOGUE_UNAVAILABLE');
  const payload: unknown = await response.json();
  const parsed = publicCatalogueSchema.safeParse(payload);
  if (!parsed.success) throw new Error('PUBLIC_CATALOGUE_INVALID_RESPONSE');
  const cursor = response.headers.get('X-Next-Cursor');
  if (cursor !== null && (!/^[1-9]\d*$/.test(cursor) || parsed.data.at(-1)?.id !== cursor)) {
    throw new Error('PUBLIC_CATALOGUE_INVALID_CURSOR');
  }
  return {items: parsed.data as unknown as Listing[], nextCursor: cursor};
}

export async function readCurrentPublicCatalogue(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<Listing[]> {
  return (await readCurrentPublicCataloguePage(url, fetcher)).items;
}
