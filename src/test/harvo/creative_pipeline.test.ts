import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CampaignImagePreparer, CREATIVE_IMAGE_FORMATS, validatePreparedCreativeImage, type PreparedCreativeImage } from '../../lib/marketing/creativeImages.js';
import { ImmutableCreativeStorage } from '../../lib/marketing/creativeStorage.js';
import { fingerprint, type ListingEvidence } from '../../lib/marketing/domain.js';

const origins = new Set(['https://media.example.org']);
const actor = { id: 10, role: 'host' as const };
const listing: ListingEvidence = { id: 20, hostId: 10, title: 'Actual property', description: 'Actual rooms', city: 'Munnar', slug: 'actual-property', publicationStatus: 'published', currency: 'INR', price: '1000', media: [{ id: '30', type: 'IMAGE', url: 'https://media.example.org/original.jpg', approved: true }] };
let source: Buffer, prepared: PreparedCreativeImage;
const loadImage = (bytes: Buffer = source) => vi.fn(async () => ({ data: bytes, mimeType: 'image/jpeg', width: 9999, height: 9999 }));
const pipeline = (bytes: Buffer = source) => new CampaignImagePreparer({ allowedOrigins: origins, loadImage: loadImage(bytes) });
beforeAll(async () => {
  source = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#ffffff' } }).composite([
    { input: await sharp({ create: { width: 50, height: 50, channels: 3, background: '#ff0000' } }).png().toBuffer(), left: 0, top: 0 },
    { input: await sharp({ create: { width: 50, height: 50, channels: 3, background: '#0000ff' } }).png().toBuffer(), left: 550, top: 550 },
  ]).jpeg({ quality: 95 }).withMetadata({ exif: { IFD0: { Copyright: 'Private fixture metadata' } } }).toBuffer();
  [prepared] = await pipeline().prepare(listing, '30', actor, true, ['SQUARE']);
});
describe('actual deterministic image preparation', () => {
  it('emits all exact canvases with measured hashes and review-required provenance', async () => {
    const items = await pipeline().prepare(listing, '30', actor, true);
    expect(items).toHaveLength(4);
    for (const item of items) {
      const size = CREATIVE_IMAGE_FORMATS[item.manifest.transform.format], metadata = await sharp(item.bytes).metadata();
      expect(metadata).toMatchObject({ ...size, format: 'jpeg' }); expect(item.manifest.output).toMatchObject({ ...size, placedWidth: 600, placedHeight: 600, sha256: createHash('sha256').update(item.bytes).digest('hex') });
      expect(item.manifest).toMatchObject({ hostId: 10, listingId: 20, sourceAssetId: '30', rightsConfirmed: true, reviewRequired: true, providerApproved: false, normalizedInput: { width: 600, height: 600 } });
      expect(item.manifestHash).toBe(fingerprint(item.manifest)); await expect(validatePreparedCreativeImage(item)).resolves.toEqual(item.manifest);
    }
  });
  it('never enlarges source pixels and preserves both opposite source corners', async () => {
    const raw = await sharp(prepared.bytes).raw().toBuffer({ resolveWithObject: true }), { left, top, placedWidth, placedHeight } = prepared.manifest.output;
    const pixel = (x: number, y: number) => Array.from(raw.data.subarray((y * raw.info.width + x) * raw.info.channels, (y * raw.info.width + x) * raw.info.channels + 3));
    expect(placedWidth).toBe(600); expect(placedHeight).toBe(600);
    const first = pixel(left + 20, top + 20), last = pixel(left + 580, top + 580), background = pixel(10, 10);
    expect(first[0]).toBeGreaterThan(230); expect(first[2]).toBeLessThan(30); expect(last[2]).toBeGreaterThan(230); expect(last[0]).toBeLessThan(30); expect(background.every((n, i) => Math.abs(n - [16, 45, 36][i]) < 5)).toBe(true);
  });
  it('strips private metadata and repeats the same output bytes under the same library versions', async () => {
    const [again] = await pipeline().prepare(listing, '30', actor, true, ['SQUARE']);
    expect(again.bytes.equals(prepared.bytes)).toBe(true); expect(again.manifestHash).toBe(prepared.manifestHash);
    const metadata = await sharp(again.bytes).metadata(); expect(metadata.exif).toBeUndefined(); expect(metadata.icc).toBeUndefined(); expect(metadata.xmp).toBeUndefined(); expect(again.bytes.includes(Buffer.from('Private fixture'))).toBe(false);
  });
  it.each([{ ...actor, id: 11 }, { ...actor, id: 0 }, { id: 11, role: 'admin' as const }])('requires actual property ownership before loading pixels', async invalidActor => {
    const loader = loadImage(); const ai = new CampaignImagePreparer({ allowedOrigins: origins, loadImage: loader });
    await expect(ai.prepare(listing, '30', invalidActor, true)).rejects.toMatchObject({ code: 'LISTING_NOT_AVAILABLE' }); expect(loader).not.toHaveBeenCalled();
  });
  it('requires current publication, approved selected source and explicit rights', async () => {
    await expect(pipeline().prepare({ ...listing, publicationStatus: 'draft' }, '30', actor, true)).rejects.toMatchObject({ code: 'LISTING_NOT_AVAILABLE' });
    await expect(pipeline().prepare(listing, '30', actor, false)).rejects.toMatchObject({ code: 'MEDIA_RIGHTS_REQUIRED' });
    await expect(pipeline().prepare(listing, '999', actor, true)).rejects.toMatchObject({ code: 'MEDIA_NOT_APPROVED' });
    await expect(pipeline().prepare({ ...listing, media: [{ ...listing.media[0], approved: false }] }, '30', actor, true)).rejects.toMatchObject({ code: 'MEDIA_NOT_APPROVED' });
  });
  it('does not pretend a video is a prepared reel', async () => { await expect(pipeline().prepare({ ...listing, media: [{ ...listing.media[0], type: 'VIDEO' }] }, '30', actor, true)).rejects.toMatchObject({ code: 'IMAGE_PREPARATION_ONLY' }); });
  it.each(['http://media.example.org/a.jpg', 'https://other.example.org/a.jpg', 'https://user:secret@media.example.org/a.jpg', 'https://media.example.org/a.jpg?token=secret', 'https://media.example.org/a.jpg#fragment'])('rejects unstable or unauthorized source %s', async url => {
    const loader = loadImage(); await expect(new CampaignImagePreparer({ allowedOrigins: origins, loadImage: loader }).prepare({ ...listing, media: [{ ...listing.media[0], url }] }, '30', actor, true)).rejects.toMatchObject({ code: 'MEDIA_ORIGIN_BLOCKED' }); expect(loader).not.toHaveBeenCalled();
  });
  it.each([{ formats: [] }, { formats: ['SQUARE', 'SQUARE'] }, { formats: ['REELS'] }])('refuses invalid transform set', async ({ formats }) => { await expect(pipeline().prepare(listing, '30', actor, true, formats as any)).rejects.toMatchObject({ code: 'CREATIVE_FORMAT_INVALID' }); });
  it('refuses malformed, oversized, wrong-format and too-small working images', async () => {
    for (const bytes of [Buffer.from('not an image'), Buffer.alloc(8 * 1024 * 1024 + 1), await sharp({ create: { width: 600, height: 600, channels: 3, background: '#fff' } }).png().toBuffer(), await sharp({ create: { width: 599, height: 600, channels: 3, background: '#fff' } }).jpeg().toBuffer()]) await expect(pipeline(bytes).prepare(listing, '30', actor, true, ['SQUARE'])).rejects.toMatchObject({ code: 'CREATIVE_IMAGE_INVALID' });
  });
  it('normalizes orientation and records actual decoded dimensions instead of loader hints', async () => {
    const rotated = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#fff' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const [image] = await pipeline(rotated).prepare(listing, '30', actor, true, ['PORTRAIT']); expect(image.manifest.normalizedInput).toMatchObject({ width: 800, height: 600 }); expect(image.manifest.output).toMatchObject({ placedWidth: 800, placedHeight: 600 });
  });
  it('rejects changed bytes or invented approval before storage', async () => {
    await expect(validatePreparedCreativeImage({ ...prepared, bytes: Buffer.from('changed') })).rejects.toMatchObject({ code: 'CREATIVE_PROVENANCE_MISMATCH' });
    await expect(validatePreparedCreativeImage({ ...prepared, manifest: { ...prepared.manifest, providerApproved: true } as any })).rejects.toThrow();
  });
});

function fakeS3() {
  const objects = new Map<string, any>(), commands: any[] = [];
  const send = vi.fn(async (command: any, options?: any) => {
    commands.push(command); expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    const input = command.input;
    if (command instanceof PutObjectCommand) {
      if (objects.has(input.Key)) throw Object.assign(new Error('precondition'), { $metadata: { httpStatusCode: 412 } });
      objects.set(input.Key, { $metadata: { httpStatusCode: 200 }, ContentLength: input.Body.length, ContentType: input.ContentType, ChecksumSHA256: createHash('sha256').update(input.Body).digest('base64'), Metadata: { ...input.Metadata }, VersionId: 'fixture-version' }); return { $metadata: { httpStatusCode: 200 } };
    }
    if (command instanceof HeadObjectCommand) { if (!objects.has(input.Key)) throw new Error('NotFound'); return objects.get(input.Key); }
    throw new Error('Unsupported fixture command');
  });
  return { objects, commands, send, storage: new ImmutableCreativeStorage({ client: { send } as any, bucket: 'fixture-creative-bucket', cdnOrigin: 'https://cdn.example.org' }) };
}
describe('immutable real S3 command and provenance contract', () => {
  it('writes checksum-bound image and full manifest sidecar then verifies both by HEAD', async () => {
    const s3 = fakeS3(), result = await s3.storage.put(prepared);
    expect(s3.commands.map(c => c.constructor.name)).toEqual(['PutObjectCommand', 'HeadObjectCommand', 'PutObjectCommand', 'HeadObjectCommand']);
    for (const c of s3.commands.filter(c => c instanceof PutObjectCommand)) { expect(c.input.IfNoneMatch).toBe('*'); expect(c.input.Bucket).toBe('fixture-creative-bucket'); expect(c.input.ChecksumSHA256).toBe(createHash('sha256').update(c.input.Body as Buffer).digest('base64')); expect(c.input.Key).toMatch(/^harvo\/creatives\/v1\/10\/20\/30\/[a-f0-9]{64}\.(jpg|json)$/); }
    for (const c of s3.commands.filter(c => c instanceof HeadObjectCommand)) expect(c.input.ChecksumMode).toBe('ENABLED');
    const sidecar = s3.commands.find(c => c instanceof PutObjectCommand && c.input.Key?.endsWith('.json')); expect(JSON.parse(sidecar.input.Body.toString())).toEqual(prepared.manifest);
    expect(result).toMatchObject({ status: 'STORED', reviewRequired: true, providerApproved: false, cdnAccessibilityVerified: false }); expect(result.url).toBe(`https://cdn.example.org/${result.image.key}`);
  });
  it('duplicate calls verify the same immutable objects without overwriting', async () => {
    const s3 = fakeS3(), first = await s3.storage.put(prepared), second = await s3.storage.put(prepared);
    expect(second.url).toBe(first.url); expect(s3.objects.size).toBe(2); expect(s3.commands.filter(c => c instanceof PutObjectCommand).every(c => c.input.IfNoneMatch === '*')).toBe(true);
  });
  it('lost put responses recover only through exact read-back', async () => {
    const s3 = fakeS3(), send = async (command: any, options: any) => { const result = await s3.send(command, options); if (command instanceof PutObjectCommand) throw new Error('lost response'); return result; };
    const storage = new ImmutableCreativeStorage({ client: { send } as any, bucket: 'fixture-creative-bucket', cdnOrigin: 'https://cdn.example.org' });
    expect((await storage.put(prepared)).status).toBe('STORED'); expect(s3.objects.size).toBe(2);
  });
  it.each(['ChecksumSHA256', 'ContentLength', 'ContentType', 'Metadata'])('does not accept mismatched %s', async field => {
    const s3 = fakeS3(), original = s3.send;
    const send = async (command: any, options: any) => { const result = await original(command, options); return command instanceof HeadObjectCommand ? { ...result, [field]: field === 'Metadata' ? {} : 'wrong' } : result; };
    await expect(new ImmutableCreativeStorage({ client: { send } as any, bucket: 'fixture-creative-bucket', cdnOrigin: 'https://cdn.example.org' }).put(prepared)).rejects.toMatchObject({ code: 'CREATIVE_STORAGE_UNKNOWN_OUTCOME' }); expect(s3.commands.filter(c => c instanceof PutObjectCommand)).toHaveLength(1);
  });
  it('an unverified first object never creates the manifest or claims successful storage', async () => {
    const send = vi.fn(async () => { throw new Error('private credential must not escape'); });
    const storage = new ImmutableCreativeStorage({ client: { send } as any, bucket: 'fixture-creative-bucket', cdnOrigin: 'https://cdn.example.org' });
    await expect(storage.put(prepared)).rejects.toMatchObject({ code: 'CREATIVE_STORAGE_UNKNOWN_OUTCOME' }); expect(send).toHaveBeenCalledTimes(2);
  });
  it('bounds a hung storage SDK and does not start a later sidecar write', async () => {
    let finish!: (result: any) => void; const send = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const storage = new ImmutableCreativeStorage({ client: { send } as any, bucket: 'fixture-creative-bucket', cdnOrigin: 'https://cdn.example.org', timeoutMs: 5 });
    await expect(storage.put(prepared)).rejects.toMatchObject({ code: 'CREATIVE_STORAGE_UNKNOWN_OUTCOME' }); finish({ $metadata: { httpStatusCode: 200 } }); await Promise.resolve(); expect(send).toHaveBeenCalledTimes(1);
  });
  it('rejects a tampered manifest before calling S3', async () => {
    const s3 = fakeS3(); await expect(s3.storage.put({ ...prepared, manifestHash: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'CREATIVE_PROVENANCE_MISMATCH' }); expect(s3.send).not.toHaveBeenCalled();
  });
  it.each(['http://cdn.example.org', 'https://user:password@cdn.example.org', 'https://cdn.example.org/base', 'https://127.0.0.1'])('requires explicit public CDN addressing %s', cdnOrigin => { expect(() => new ImmutableCreativeStorage({ client: { send: vi.fn() } as any, bucket: 'fixture-creative-bucket', cdnOrigin })).toThrow(); });
});
