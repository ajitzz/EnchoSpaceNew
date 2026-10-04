import { z } from 'zod';
import type { Listing } from '../types';

// This validates the fields required by the existing search/card renderer.
// Published rooms carry canonical relational identity. A public price may be
// absent until a verified offer exists; null is never treated as zero rupees.
const publicCardSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  type: z.string(),
  price: z.number().finite().nonnegative().nullable(),
  priceState: z.enum(['VERIFIED_OFFER_UNAVAILABLE']).optional(),
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
    price: z.number().finite().nonnegative().nullable(),
  }).passthrough()),
  photos: z.array(z.object({
    url: z.string().min(1),
    category: z.string(),
    tier: z.string(),
    room_type_id: z.string().regex(/^[1-9]\d*$/).nullable().optional(),
  }).passthrough()).optional(),
}).passthrough().superRefine((card, context) => {
  if (card.priceState === 'VERIFIED_OFFER_UNAVAILABLE' && card.price !== null) {
    context.addIssue({code: 'custom', message: 'Unavailable offer cannot publish a price'});
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
