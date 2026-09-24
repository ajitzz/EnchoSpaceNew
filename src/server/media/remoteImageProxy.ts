import dns from 'node:dns/promises';
import net from 'node:net';
import { z } from 'zod';

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_OUTPUT_EDGE = 4096;

const transformQuerySchema = z.object({
  url: z.string().url().max(2_048).refine((value) => new URL(value).protocol === 'https:', 'HTTPS image URL required'),
  w: z.coerce.number().int().min(1).max(MAX_OUTPUT_EDGE).optional(),
  h: z.coerce.number().int().min(1).max(MAX_OUTPUT_EDGE).optional(),
  q: z.coerce.number().int().min(1).max(100).default(80),
  aspect: z.enum(['1:1', '9:16', '16:9']).optional(),
}).strict().superRefine((value, context) => {
  const width = value.w ?? 1080;
  const height = value.aspect === '9:16' ? Math.round(width * 16 / 9) : width;
  if (value.aspect && height > MAX_OUTPUT_EDGE) {
    context.addIssue({ code: 'custom', path: ['w'], message: 'The requested aspect ratio exceeds the output dimension limit.' });
  }
});

export type ImageTransformQuery = z.infer<typeof transformQuerySchema>;

export function parseImageTransformQuery(input: unknown): ImageTransformQuery {
  return transformQuerySchema.parse(input);
}

function normalizeHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
    return parsed.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

export function isPrivateImageAddress(address: string): boolean {
  if (net.isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    return parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || parts[0] === 0
      || parts[0] >= 224
      || (parts[0] === 192 && parts[1] === 0)
      || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19));
  }
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    // IPv4-mapped and transition addresses must not tunnel a private address
    // past the IPv4 check. Trusted media origins do not require these ranges.
    return normalized.startsWith('::')
      || normalized.startsWith('2001:0:')
      || normalized.startsWith('2001::')
      || normalized.startsWith('2001:db8:')
      || normalized.startsWith('2002:')
      || normalized.startsWith('ff')
      || normalized === '::1'
      || normalized === '::'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe8')
      || normalized.startsWith('fe9')
      || normalized.startsWith('fea')
      || normalized.startsWith('feb');
  }
  return true;
}

/** Exact provider-host checks avoid the `evil-s3.amazonaws.com` substring flaw. */
export function isAllowedImageSource(source: URL, env: NodeJS.ProcessEnv = process.env): boolean {
  if (source.protocol !== 'https:' || source.username || source.password || source.port) return false;
  const host = source.hostname.toLowerCase().replace(/\.$/, '');
  if (net.isIP(host)) return false;

  const configuredCdnHost = normalizeHost(env.AWS_CDN_HOST || env.AWS_S3_PUBLIC_HOST);
  if (configuredCdnHost && host === configuredCdnHost) return true;
  if (host === 'images.unsplash.com') return true;

  const bucket = env.AWS_S3_BUCKET_NAME?.trim().toLowerCase();
  if (!bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return false;
  if (host === 's3.amazonaws.com') return source.pathname.startsWith(`/${bucket}/`);
  if (host === `${bucket}.s3.amazonaws.com`) return true;
  if (!host.startsWith(`${bucket}.s3.`)) return false;
  const region = host.slice(`${bucket}.s3.`.length);
  return /^(?:af|ap|ca|eu|il|me|mx|sa|us)-(?:central|east|west|north|south|northeast|northwest|southeast|southwest)-\d\.amazonaws\.com$/.test(region);
}

export async function assertPublicImageOrigin(source: URL): Promise<void> {
  const addresses = await dns.lookup(source.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateImageAddress(address))) {
    throw new Error('IMAGE_ORIGIN_NOT_PUBLIC');
  }
}

export async function readBoundedImageResponse(response: Response): Promise<Buffer> {
  if (!response.ok) throw new Error('IMAGE_ORIGIN_FAILED');
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
    throw new Error('IMAGE_CONTENT_TYPE_INVALID');
  }
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_SOURCE_BYTES) throw new Error('IMAGE_TOO_LARGE');
  if (!response.body) throw new Error('IMAGE_BODY_MISSING');

  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    received += chunk.byteLength;
    if (received > MAX_SOURCE_BYTES) throw new Error('IMAGE_TOO_LARGE');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, received);
}

export const REMOTE_IMAGE_LIMITS = Object.freeze({
  maxSourceBytes: MAX_SOURCE_BYTES,
  maxOutputEdge: MAX_OUTPUT_EDGE,
  maxInputPixels: 40_000_000,
  timeoutMs: 8_000,
});
