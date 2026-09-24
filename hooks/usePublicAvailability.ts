import {useEffect, useState} from 'react';
import {PUBLIC_AVAILABILITY_MAX_AGE_MS, readAvailabilityObservation, type PublicAvailabilityObservation} from '../src/shared/guest/publicAvailability';

/** Public, window-scoped observations. No private calendar read and no reservation authority. */
export function usePublicAvailability(listingId: string, from: string, to: string): PublicAvailabilityObservation | null {
  const key = `${listingId}:${from}:${to}`;
  const [state, setState] = useState<{key: string; observation: PublicAvailabilityObservation} | null>(null);
  useEffect(() => {
    setState(null);
    if (!/^[1-9]\d*$/.test(listingId) || !Number.isSafeInteger(Number(listingId)) || !from || to <= from) return;
    let disposed = false, generation = 0;
    let controller: AbortController | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const attempt = ++generation;
      controller?.abort();
      controller = new AbortController();
      if (document.visibilityState === 'hidden') { setState(null); return; }
      try {
        const response = await fetch(`/api/listings/${listingId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {cache: 'no-store', signal: controller.signal});
        if (!response.ok) throw new Error('Availability observation unavailable');
        const observation = readAvailabilityObservation(await response.json(), {listingId: Number(listingId), from, to});
        if (!disposed && attempt === generation) {
          clearTimeout(expiry);
          setState(observation ? {key, observation} : null);
          if (observation) expiry = setTimeout(() => setState(null), Math.max(0, PUBLIC_AVAILABILITY_MAX_AGE_MS - (Date.now() - Date.parse(observation.observedAt))));
        }
      } catch { if (!disposed && attempt === generation) setState(null); }
    };
    void load();
    const poll = setInterval(() => { void load(); }, 30_000);
    document.addEventListener('visibilitychange', load);
    return () => { disposed = true; ++generation; controller?.abort(); clearInterval(poll); clearTimeout(expiry); document.removeEventListener('visibilitychange', load); };
  }, [listingId, from, to, key]);
  return state?.key === key ? state.observation : null;
}
