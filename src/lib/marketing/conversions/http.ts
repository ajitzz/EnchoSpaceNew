/** Fixed-provider transport with one deadline through body consumption and no write retries. */
export async function conversionJson(fetcher: typeof fetch, url: string, init: RequestInit, timeoutMs: number) {
  const target = new URL(url);
  if (!['https://datamanager.googleapis.com', 'https://googleads.googleapis.com', 'https://graph.facebook.com'].includes(target.origin) || target.username || target.password) throw new Error('INVALID_PROVIDER_ORIGIN');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('PROVIDER_DEADLINE')); }, timeoutMs); });
  const work = async () => {
    const response = await fetcher(target, { ...init, redirect: 'error', signal: controller.signal });
    const reader = response.body?.getReader();
    if (!reader) throw new Error('PROVIDER_EMPTY_RESPONSE');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const next = await reader.read(); if (next.done) break; if (controller.signal.aborted) { void reader.cancel(); throw new Error('PROVIDER_DEADLINE'); }
      size += next.value.byteLength; if (size > 131072) { void reader.cancel(); throw new Error('PROVIDER_RESPONSE_TOO_LARGE'); } chunks.push(next.value); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return { status: response.status, ok: response.ok, data, requestId: response.headers.get('request-id') || response.headers.get('x-fb-trace-id') };
  };
  try { return await Promise.race([work(), deadline]); } finally { if (timer) clearTimeout(timer); }
}
