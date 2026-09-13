import { createHash } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { MarketingError, publicOrigin, stableJson } from './domain.js';
import { validatePreparedCreativeImage, type PreparedCreativeImage } from './creativeImages.js';

export interface CreativeStorageOptions { client: Pick<S3Client, 'send'>; bucket: string; cdnOrigin: string; timeoutMs?: number; }
export class ImmutableCreativeStorage {
  private readonly cdnOrigin: string; private readonly timeoutMs: number;
  constructor(private readonly options: CreativeStorageOptions) {
    this.cdnOrigin = publicOrigin(options.cdnOrigin); this.timeoutMs = options.timeoutMs ?? 20000;
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(options.bucket) || options.bucket.includes('..') || !options.client?.send || !Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 30000) throw new MarketingError('CREATIVE_STORAGE_CONFIG_INVALID', 'Explicit bounded S3 and CDN configuration is required', 503);
  }
  async put(value: PreparedCreativeImage) {
    if (!Buffer.isBuffer(value.bytes)) throw new MarketingError('CREATIVE_PROVENANCE_MISMATCH', 'Prepared image bytes are required', 422);
    value = { bytes: Buffer.from(value.bytes), manifest: structuredClone(value.manifest), manifestHash: value.manifestHash };
    const manifest = await validatePreparedCreativeImage(value);
    const prefix = `harvo/creatives/v1/${manifest.hostId}/${manifest.listingId}/${manifest.sourceAssetId}/${value.manifestHash}`;
    const imageKey = `${prefix}.jpg`, manifestKey = `${prefix}.json`;
    const metadata = { 'harvo-manifest': value.manifestHash, 'harvo-output': manifest.output.sha256, 'harvo-input': manifest.normalizedInput.sha256, 'harvo-host': String(manifest.hostId), 'harvo-listing': String(manifest.listingId), 'harvo-asset': manifest.sourceAssetId };
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new MarketingError('CREATIVE_STORAGE_UNKNOWN_OUTCOME', 'Storage exceeded its deadline; verify the same immutable keys before using any output', 503)); }, this.timeoutMs); });
    const store = async (key: string, bytes: Buffer, contentType: string) => {
      if (controller.signal.aborted) throw new Error('Storage deadline');
      const checksum = createHash('sha256').update(bytes).digest('base64');
      try { await this.options.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: key, Body: bytes, ContentType: contentType, ContentLength: bytes.length, CacheControl: 'public,max-age=31536000,immutable', IfNoneMatch: '*', ChecksumSHA256: checksum, Metadata: metadata }), { abortSignal: controller.signal }); }
      catch { /* An existing object or lost write response permits only exact read-back. */ }
      if (controller.signal.aborted) throw new Error('Storage deadline');
      const observed = await this.options.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key, ChecksumMode: 'ENABLED' }), { abortSignal: controller.signal });
      if (controller.signal.aborted || observed.$metadata?.httpStatusCode !== 200 || observed.ContentLength !== bytes.length || observed.ContentType !== contentType || observed.ChecksumSHA256 !== checksum || Object.entries(metadata).some(([name, expected]) => observed.Metadata?.[name] !== expected)) throw new Error('Storage provenance not verified');
      return { key, checksumSha256: checksum, versionId: observed.VersionId ?? null };
    };
    const work = async () => {
      const image = await store(imageKey, value.bytes, 'image/jpeg');
      const provenance = await store(manifestKey, Buffer.from(stableJson(manifest), 'utf8'), 'application/json');
      return { status: 'STORED' as const, image, provenance, manifest, manifestHash: value.manifestHash, url: `${this.cdnOrigin}/${imageKey}`, reviewRequired: true as const, providerApproved: false as const, cdnAccessibilityVerified: false as const };
    };
    try { return await Promise.race([work(), deadline]); }
    catch (error) { if (error instanceof MarketingError) throw error; throw new MarketingError('CREATIVE_STORAGE_UNKNOWN_OUTCOME', 'Immutable storage could not be verified; no derivative is approved or published', 503); }
    finally { if (timer) clearTimeout(timer); controller.abort(); }
  }
}
