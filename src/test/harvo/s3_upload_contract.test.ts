import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import { createImmutableS3Upload, createMediaUploadS3Client } from '../../lib/immutableS3Upload.js';
import { mediaUploadHeaders } from '../../../lib/mediaUploadHeaders.js';

// Explicit offline fixtures; signing never resolves the real credential chain.
const credentials = { accessKeyId: 'HARVO_OFFLINE_KEY', secretAccessKey: 'harvo-offline-not-a-secret' };
const clients: S3Client[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.destroy()));

function fixtureClient() {
  const handle = vi.fn(async () => { throw new Error('Network is forbidden in this suite'); });
  const client = createMediaUploadS3Client({
    region: 'us-east-1',
    credentials,
    requestHandler: { handle },
  });
  clients.push(client);
  return { client, handle };
}

const input = { bucket: 'harvo-offline-media', key: 'listings/fixture.webp', contentType: 'image/webp' };
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest();

/** Independently reconstruct SigV4 to detect removal/change of the required condition. */
async function validSignature(urlText: string, headers: Record<string, string>): Promise<boolean> {
  const { createHash } = await import('node:crypto');
  const url = new URL(urlText);
  const query = url.searchParams;
  const signed = query.get('X-Amz-SignedHeaders')!;
  const names = signed.split(';');
  const canonicalHeaders = names.map((name) => `${name}:${name === 'host' ? url.host : (headers[name] ?? '').trim()}\n`).join('');
  const canonicalQuery = Array.from(query.entries())
    .filter(([key]) => key !== 'X-Amz-Signature')
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([ak, av], [bk, bv]) => ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('&');
  const request = ['PUT', url.pathname, canonicalQuery, canonicalHeaders, signed, 'UNSIGNED-PAYLOAD'].join('\n');
  const scope = query.get('X-Amz-Credential')!.split('/').slice(1);
  const toSign = ['AWS4-HMAC-SHA256', query.get('X-Amz-Date'), scope.join('/'), createHash('sha256').update(request).digest('hex')].join('\n');
  let key = hmac(`AWS4${credentials.secretAccessKey}`, scope[0]);
  for (const part of scope.slice(1)) key = hmac(key, part);
  return hmac(key, toSign).toString('hex') === query.get('X-Amz-Signature');
}

describe('create-only S3 presigned upload contract (no network)', () => {
  it('signs a ten-minute create-only capability and the browser content type', async () => {
    const { client, handle } = fixtureClient();
    const result = await createImmutableS3Upload(client, input);
    const url = new URL(result.uploadUrl);
    expect(result.uploadHeaders).toEqual({ 'If-None-Match': '*' });
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host;if-none-match');
    expect(url.pathname).toBe('/listings/fixture.webp');
    expect(url.hostname).toBe('harvo-offline-media.s3.us-east-1.amazonaws.com');
    expect(url.protocol).toBe('https:');
    const headers = mediaUploadHeaders(input.contentType, result.uploadHeaders);
    expect(await validSignature(result.uploadUrl, Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])))).toBe(true);
    expect(handle).not.toHaveBeenCalled();
  });

  it.each([
    [{ 'content-type': 'image/webp' }, 'missing create-only condition'],
    [{ 'content-type': 'image/webp', 'if-none-match': 'some-other-etag' }, 'changed condition'],
    [{ 'content-type': 'text/html', 'if-none-match': '*' }, 'changed content type'],
  ])('rejects a signature with %j (%s)', async (headers, _case) => {
    const { client } = fixtureClient();
    const result = await createImmutableS3Upload(client, input);
    expect(await validSignature(result.uploadUrl, headers)).toBe(false);
  });

  it('does not sign an empty-body checksum for media bytes supplied later by the browser', async () => {
    const { client } = fixtureClient();
    expect(await client.config.requestChecksumCalculation()).toBe('WHEN_REQUIRED');
    const { uploadUrl } = await createImmutableS3Upload(client, input);
    const keys = Array.from(new URL(uploadUrl).searchParams.keys());
    expect(keys.some((key) => key.toLowerCase().includes('checksum'))).toBe(false);
  });

  it('does not permit the capability to be moved to an existing key', async () => {
    const { client } = fixtureClient();
    const { uploadUrl } = await createImmutableS3Upload(client, input);
    const changed = new URL(uploadUrl);
    changed.pathname = '/listings/previously-approved.webp';
    expect(await validSignature(changed.toString(), { 'content-type': 'image/webp', 'if-none-match': '*' })).toBe(false);
  });
});

describe('browser upload header boundary', () => {
  it('preserves the signed local-upload response that has no S3 header directive', () => {
    expect(mediaUploadHeaders('image/webp', undefined)).toEqual({ 'Content-Type': 'image/webp' });
  });

  it('accepts only the exact supported precondition value, case-insensitive header name', () => {
    expect(mediaUploadHeaders('video/mp4', { 'if-none-match': '*' })).toEqual({ 'Content-Type': 'video/mp4', 'If-None-Match': '*' });
  });

  it.each([
    null, [], '*', {}, { 'If-None-Match': true }, { 'If-None-Match': 'etag' },
    { Authorization: 'Bearer must-never-reach-storage' }, { Cookie: 'session=never-forward' },
    { 'If-None-Match': '*', Authorization: 'secret' },
    { 'If-None-Match': '*', 'Content-Type': 'text/html' },
    { 'If-None-Match': '*', 'if-none-match': '*' },
  ])('fails closed for unsupported header directives %j', (headers) => {
    expect(() => mediaUploadHeaders('image/webp', headers)).toThrow(/upload header contract/);
  });
});

describe('application caller contract wiring (source-only, no server import)', () => {
  it.each([
    ['components/HostForm.tsx', 'data.uploadHeaders'],
    ['components/HostExperienceForm.tsx', 'uploadHeaders'],
    ['components/AdminExperiences.tsx', 'uploadHeaders'],
    ['components/HostMarketing.tsx', 'uploadHeaders'],
    ['lib/syncHandlers.ts', 'uploadHeaders'],
  ])('%s applies the supported server upload header contract', (path, argument) => {
    const source = readFileSync(path, 'utf8');
    const upload = source.slice(source.indexOf("fetch('/api/upload-url'"));
    const put = upload.slice(upload.indexOf('fetch(uploadUrl'), upload.indexOf('body: file', upload.indexOf('fetch(uploadUrl')));
    expect(put).toContain('headers: mediaUploadHeaders(');
    expect(put).toContain(argument);
  });

  it('wires the actual presign route and preserves the separate Mux upload path', () => {
    const server = readFileSync('server.ts', 'utf8');
    const start = server.indexOf("app.post('/api/upload-url'");
    const route = server.slice(start, server.indexOf("app.get('/api/admin/seo/", start));
    expect(server).toContain('const s3 = createMediaUploadS3Client(');
    expect(route).toContain('createImmutableS3Upload(s3,');
    expect(route).toContain('publicUrl: fileUrl, uploadHeaders');
    expect(route).toMatch(/issueLocalUpload\(JWT_SECRET,\s*req\.user!?\.id,\s*contentType\)/);
    const host = readFileSync('components/HostForm.tsx', 'utf8');
    const mux = host.slice(host.indexOf("fetch('/api/upload-video-url'"), host.indexOf("fetch('/api/upload-video-url'") + 650);
    expect(mux).toContain("headers: { 'Content-Type': file.type }");
    expect(mux).not.toContain('mediaUploadHeaders');
  });
});
