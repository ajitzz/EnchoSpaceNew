import { describe, expect, it, vi } from 'vitest';
import { readCurrentPublicCatalogue, readCurrentPublicCataloguePage } from '../../lib/publicCatalogueClient';

const card = {
  id: 'stay-1', title: 'Approved Stay', type: 'Villa', price: 5000,
  currency: 'INR', imageUrl: '', imageUrls: [], imageCount: 0,
  isVerified: false, rooms: [],
};

describe('current public catalogue reads', () => {
  it('accepts distinct canonical room IDs and null unverified prices, but rejects conflicting price evidence', async () => {
    const rooms = [
      {id: '101', name: 'Deluxe King', type: 'suite', price: null},
      {id: '102', name: 'Deluxe King', type: 'suite', price: null},
    ];
    const publicCard = {...card, price: null, priceState: 'VERIFIED_OFFER_UNAVAILABLE', roomState: 'CANONICAL', rooms};
    const valid = vi.fn().mockResolvedValue(Response.json([publicCard]));
    expect((await readCurrentPublicCatalogue('/api/listings', valid))[0].rooms?.map(room => room.id)).toEqual(['101', '102']);
    const invalid = vi.fn().mockResolvedValue(Response.json([{...publicCard, price: 999}]));
    await expect(readCurrentPublicCatalogue('/api/listings', invalid)).rejects.toThrow('PUBLIC_CATALOGUE_INVALID_RESPONSE');
    const duplicate = vi.fn().mockResolvedValue(Response.json([{...publicCard, rooms: [rooms[0], {...rooms[1], id: '101'}]}]));
    await expect(readCurrentPublicCatalogue('/api/listings', duplicate)).rejects.toThrow('PUBLIC_CATALOGUE_INVALID_RESPONSE');
    const orphanMedia = vi.fn().mockResolvedValue(Response.json([{...publicCard,
      photos: [{url: 'https://media.encho.test/orphan.jpg', category: 'bedroom', tier: 'suite', room_type_id: '103'}]}]));
    await expect(readCurrentPublicCatalogue('/api/listings', orphanMedia)).rejects.toThrow('PUBLIC_CATALOGUE_INVALID_RESPONSE');
  });
  it('rejects a 503 instead of treating an outage as an empty destination', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(readCurrentPublicCatalogue('/api/listings?city=Jaipur', fetcher))
      .rejects.toThrow('PUBLIC_CATALOGUE_UNAVAILABLE');
    expect(fetcher).toHaveBeenCalledWith('/api/listings?city=Jaipur', { cache: 'no-store' });
  });

  it('rejects a malformed success response before rendering cards', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json([{ ...card, imageUrls: 'raw-photo' }]));
    await expect(readCurrentPublicCatalogue('/api/listings', fetcher))
      .rejects.toThrow('PUBLIC_CATALOGUE_INVALID_RESPONSE');
  });

  it('distinguishes a valid empty result from a valid card response', async () => {
    const empty = vi.fn().mockResolvedValue(Response.json([]));
    expect(await readCurrentPublicCatalogue('/api/listings', empty)).toEqual([]);
    const populated = vi.fn().mockResolvedValue(Response.json([card]));
    expect(await readCurrentPublicCatalogue('/api/listings', populated)).toEqual([card]);
  });
  it('requires a next-page cursor to identify the last verified card', async () => {
    const publicCard = {...card, id: '101', price: null, priceState: 'VERIFIED_OFFER_UNAVAILABLE'};
    const good = vi.fn().mockResolvedValue(Response.json([publicCard], {headers: {'X-Next-Cursor': '101'}}));
    expect(await readCurrentPublicCataloguePage('/api/listings', good)).toMatchObject({nextCursor: '101', items: [publicCard]});
    const bad = vi.fn().mockResolvedValue(Response.json([publicCard], {headers: {'X-Next-Cursor': '999'}}));
    await expect(readCurrentPublicCataloguePage('/api/listings', bad)).rejects.toThrow('PUBLIC_CATALOGUE_INVALID_CURSOR');
  });
});
