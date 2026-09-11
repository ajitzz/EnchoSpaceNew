import { z } from 'zod';
import { createHash } from 'node:crypto';

/** Read-only STAGING identity probe. Not an ARI/booking adapter or ownership proof.
 * https://docs.channex.io/api-v.1-documentation/room-types-collection */
export function createChannexStagingBindingReader(apiKey: string, request: typeof fetch = fetch) {
  if (!apiKey.trim() || /[\r\n]/.test(apiKey)) throw new Error('Channex staging credentials are unavailable');
  return {
    provider: 'channex_staging',
    async read(propertyId: string, roomId: string, signal: AbortSignal) {
      z.string().uuid().parse(propertyId); z.string().uuid().parse(roomId);
      let response: Response;
      try {
        response = await request(`https://staging.channex.io/api/v1/room_types/${encodeURIComponent(roomId)}`, {
          method: 'GET', headers: { 'user-api-key': apiKey, Accept: 'application/json' },
          redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        });
      } catch { throw new Error('Channex staging identity request failed'); }
      if (!response.ok) throw new Error(`Channex staging identity request rejected (${response.status})`);
      // Bound streamed response size; never persist or log a provider payload or API key.
      const reader = response.body?.getReader(); if (!reader) throw new Error('Channex identity response is empty');
      const decoder = new TextDecoder(); let text = '', size = 0;
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 512 * 1024) { await reader.cancel(); throw new Error('Channex identity response exceeds size limit'); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
      const schema = z.object({ data: z.object({ id: z.literal(roomId), type: z.literal('room_type'), relationships: z.object({ property: z.object({ data: z.object({ id: z.literal(propertyId), type: z.literal('property') }) }) }) }) });
      let parsed: unknown; try { parsed = JSON.parse(text); } catch { throw new Error('Invalid Channex identity response'); }
      if (!schema.safeParse(parsed).success) throw new Error('Channex room/property identity mismatch');
      return { propertyId, roomId, evidenceHash: createHash('sha256').update(text).digest('hex') };
    },
  };
}
