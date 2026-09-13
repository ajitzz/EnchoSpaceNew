import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { isPublicIp } from './assets.js';
import { MarketingError, publicOrigin } from './domain.js';
export interface CreativeCdnExpectation { url: string; sha256: string; byteLength: number; }
export type CreativeCdnVerifier = (expected: CreativeCdnExpectation) => Promise<void>;
/** GET exact CDN bytes: a successful S3 HEAD does not prove CDN delivery. */
export function createCreativeCdnVerifier(origin: string, options: { timeoutMs?: number; fetchBytes?: (url: URL, signal: AbortSignal) => Promise<{ bytes: Buffer; contentType: string }> } = {}): CreativeCdnVerifier {
 const approved = publicOrigin(origin), timeoutMs = options.timeoutMs ?? 15000;
 if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000) throw new MarketingError('CREATIVE_CDN_CONFIG_INVALID', 'A bounded CDN deadline is required', 503);
 return async expected => {
  let u: URL;
  try { u = new URL(expected.url); } catch { throw new MarketingError('CREATIVE_CDN_INVALID', 'The prepared image URL is invalid'); }
  if (u.origin !== approved || u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || !/^\/harvo\/creatives\/v1\/[1-9]\d*\/[1-9]\d*\/[1-9]\d*\/[a-f0-9]{64}\.jpg$/.test(u.pathname) || !/^[a-f0-9]{64}$/.test(expected.sha256) || !Number.isSafeInteger(expected.byteLength) || expected.byteLength < 1 || expected.byteLength > 8388608) throw new MarketingError('CREATIVE_CDN_INVALID', 'Only the immutable configured CDN image is permitted');
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new MarketingError('CREATIVE_CDN_UNVERIFIED', 'The exact prepared image could not be verified from the CDN', 503)); }, timeoutMs); });
  const load = options.fetchBytes ?? (async (url: URL, signal: AbortSignal) => {
   const ips = await lookup(url.hostname, { all: true });
   if (signal.aborted || !ips.length || ips.some(ip => !isPublicIp(ip.address))) throw new Error('CDN address rejected');
   const selected = ips[0];
   return new Promise<{bytes: Buffer; contentType: string}>((resolve, reject) => {
    const request = https.get(url, { signal, headers: { Accept: 'image/jpeg', 'Accept-Encoding': 'identity' }, lookup: ((_h: unknown, _o: unknown, cb: Function) => cb(null, selected.address, selected.family)) as never }, response => {
     if (response.statusCode !== 200 || response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') { response.resume(); reject(new Error('CDN response rejected')); return; }
     const parts: Buffer[] = []; let size = 0;
     response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > expected.byteLength) { request.destroy(new Error('CDN byte limit')); return; } parts.push(chunk); });
     response.on('end', () => resolve({ bytes: Buffer.concat(parts), contentType: response.headers['content-type'] ?? '' })); response.on('error', reject);
    }); request.on('error', reject);
   });
  });
  try {
   const received = await Promise.race([load(u, controller.signal), deadline]);
   if (controller.signal.aborted || received.contentType.toLowerCase() !== 'image/jpeg' || !Buffer.isBuffer(received.bytes) || received.bytes.length !== expected.byteLength || createHash('sha256').update(received.bytes).digest('hex') !== expected.sha256) throw new Error('CDN bytes do not match approved output');
  } catch (error) { if (error instanceof MarketingError) throw error; throw new MarketingError('CREATIVE_CDN_UNVERIFIED', 'The CDN did not return the exact saved image bytes', 503); }
  finally { clearTimeout(timer!); controller.abort(); }
 };
}
