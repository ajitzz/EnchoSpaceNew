import { createHash } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import { z } from 'zod';
import { loadApprovedImage } from './assets.js';
import { fingerprint, MarketingError, type Actor, type ListingEvidence } from './domain.js';

export const CREATIVE_IMAGE_FORMATS = {
  SQUARE: { width: 1080, height: 1080 }, PORTRAIT: { width: 1080, height: 1350 },
  STORY: { width: 1080, height: 1920 }, LANDSCAPE: { width: 1200, height: 628 },
} as const;
export type CreativeImageFormat = keyof typeof CREATIVE_IMAGE_FORMATS;
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().int().positive().safe();
export const creativeImageManifestSchema = z.object({
  protocol: z.literal('HARVO_REVIEW_IMAGE_V1'), listingId: positive, hostId: positive, sourceAssetId: z.string().regex(/^[1-9]\d*$/),
  sourceUrl: z.string().url().max(2048), listingEvidenceHash: hash,
  normalizedInput: z.object({ sha256: hash, width: positive, height: positive, byteLength: positive, normalization: z.literal('APPROVED_IMAGE_LOADER_JPEG_V1') }).strict(),
  transform: z.object({ version: z.literal(1), format: z.enum(['SQUARE', 'PORTRAIT', 'STORY', 'LANDSCAPE']), fit: z.literal('CONTAIN_WITHOUT_ENLARGEMENT'), background: z.literal('#102d24'), sharpVersion: z.string().min(1), vipsVersion: z.string().min(1) }).strict(),
  output: z.object({ sha256: hash, width: positive, height: positive, byteLength: positive, mimeType: z.literal('image/jpeg'), placedWidth: positive, placedHeight: positive, left: z.number().int().nonnegative(), top: z.number().int().nonnegative() }).strict(),
  rightsConfirmed: z.literal(true), reviewRequired: z.literal(true), providerApproved: z.literal(false),
}).strict();
export type CreativeImageManifest = z.infer<typeof creativeImageManifestSchema>;
export type PreparedCreativeImage = { bytes: Buffer; manifest: CreativeImageManifest; manifestHash: string };
export class CampaignImagePreparer {
  constructor(private readonly options: { allowedOrigins: ReadonlySet<string>; loadImage?: typeof loadApprovedImage }) {}
  async prepare(listing: ListingEvidence, sourceAssetId: string, actor: Actor, rightsConfirmed: boolean, formats: readonly CreativeImageFormat[] = ['SQUARE', 'PORTRAIT', 'STORY', 'LANDSCAPE']): Promise<PreparedCreativeImage[]> {
    return (await this.prepareReview(listing, sourceAssetId, actor, rightsConfirmed, formats)).images;
  }
  async prepareReview(listing: ListingEvidence, sourceAssetId: string, actor: Actor, rightsConfirmed: boolean, formats: readonly CreativeImageFormat[]): Promise<{sourceBytes: Buffer; images: PreparedCreativeImage[]}> {
    if (!Number.isSafeInteger(actor.id) || actor.id < 1 || actor.id !== listing.hostId || !Number.isSafeInteger(listing.id) || listing.id < 1 || listing.publicationStatus !== 'published') throw new MarketingError('LISTING_NOT_AVAILABLE', 'Choose a published property owned by this account', 404);
    if (rightsConfirmed !== true) throw new MarketingError('MEDIA_RIGHTS_REQUIRED', 'Confirm permission to advertise this property image', 422);
    const asset = listing.media.find(item => item.id === sourceAssetId && item.approved);
    if (!asset || !/^[1-9]\d*$/.test(sourceAssetId)) throw new MarketingError('MEDIA_NOT_APPROVED', 'Select an approved image from this property', 422);
    if (asset.type !== 'IMAGE') throw new MarketingError('IMAGE_PREPARATION_ONLY', 'This preparation path accepts still images; it does not transcode video', 422);
    if (!Array.isArray(formats) || !formats.length || formats.length > 4 || new Set(formats).size !== formats.length || formats.some(format => !Object.hasOwn(CREATIVE_IMAGE_FORMATS, format))) throw new MarketingError('CREATIVE_FORMAT_INVALID', 'Choose distinct supported image formats', 422);
    const source = new URL(asset.url);
    if (source.protocol !== 'https:' || source.username || source.password || source.search || source.hash || source.port || !this.options.allowedOrigins.has(source.origin)) throw new MarketingError('MEDIA_ORIGIN_BLOCKED', 'An approved stable HTTPS image URL is required', 422);
    const loaded = await (this.options.loadImage ?? loadApprovedImage)(source.href, this.options.allowedOrigins);
    if (!Buffer.isBuffer(loaded.data) || !loaded.data.length || loaded.data.length > 8 * 1024 * 1024) throw new MarketingError('CREATIVE_IMAGE_INVALID', 'Image bytes exceed the preparation boundary', 422);
    let metadata: Metadata;
    try { metadata = await sharp(loaded.data, { limitInputPixels: 24_000_000, failOn: 'warning' }).metadata(); }
    catch { throw new MarketingError('CREATIVE_IMAGE_INVALID', 'The approved source could not be decoded as a bounded image', 422); }
    if (loaded.mimeType !== 'image/jpeg' || metadata.format !== 'jpeg' || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height || metadata.width < 600 || metadata.height < 600 || metadata.width * metadata.height > 24_000_000) throw new MarketingError('CREATIVE_IMAGE_INVALID', 'The approved-image loader must return one normalized JPEG at least 600 pixels on each side', 422);
    // The approved-image loader already normalizes orientation. Normalize injected
    // image inputs too and measure these actual pixels, never its source-dimension hint.
    const normalized = await sharp(loaded.data, { limitInputPixels: 24_000_000, failOn: 'warning' }).timeout({ seconds: 5 }).rotate().removeAlpha().png().toBuffer({ resolveWithObject: true });
    const normalizedInput = { sha256: sha256(loaded.data), width: normalized.info.width, height: normalized.info.height, byteLength: loaded.data.length, normalization: 'APPROVED_IMAGE_LOADER_JPEG_V1' as const };
    const result: PreparedCreativeImage[] = [];
    for (const format of formats as readonly CreativeImageFormat[]) {
      const size = CREATIVE_IMAGE_FORMATS[format];
      const resized = await sharp(normalized.data, { limitInputPixels: 24_000_000, failOn: 'warning' }).timeout({ seconds: 5 }).resize(size.width, size.height, { fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
      const left = Math.floor((size.width - resized.info.width) / 2), top = Math.floor((size.height - resized.info.height) / 2);
      const bytes = await sharp({ create: { ...size, channels: 3, background: '#102d24' } }).timeout({ seconds: 5 }).composite([{ input: resized.data, left, top }]).jpeg({ quality: 86, chromaSubsampling: '4:4:4' }).toBuffer();
      if (bytes.length > 8 * 1024 * 1024) throw new MarketingError('CREATIVE_OUTPUT_TOO_LARGE', 'Prepared image exceeds its output limit', 422);
      const manifest = creativeImageManifestSchema.parse({ protocol: 'HARVO_REVIEW_IMAGE_V1', listingId: listing.id, hostId: actor.id, sourceAssetId, sourceUrl: source.href, listingEvidenceHash: fingerprint(listing), normalizedInput,
        transform: { version: 1, format, fit: 'CONTAIN_WITHOUT_ENLARGEMENT', background: '#102d24', sharpVersion: sharp.versions.sharp, vipsVersion: sharp.versions.vips },
        output: { sha256: sha256(bytes), ...size, byteLength: bytes.length, mimeType: 'image/jpeg', placedWidth: resized.info.width, placedHeight: resized.info.height, left, top }, rightsConfirmed: true, reviewRequired: true, providerApproved: false });
      result.push({ bytes, manifest, manifestHash: fingerprint(manifest) });
    }
    return { sourceBytes: Buffer.from(loaded.data), images: result };
  }
}

/** Re-check buffers and manifest before an injected storage writer accepts them. */
export async function validatePreparedCreativeImage(value: PreparedCreativeImage) {
  const manifest = creativeImageManifestSchema.parse(value.manifest);
  if (!Buffer.isBuffer(value.bytes) || !value.bytes.length || value.bytes.length > 8 * 1024 * 1024 || value.bytes.length !== manifest.output.byteLength || sha256(value.bytes) !== manifest.output.sha256 || fingerprint(manifest) !== value.manifestHash) throw new MarketingError('CREATIVE_PROVENANCE_MISMATCH', 'Prepared bytes and provenance do not match', 422);
  const size = CREATIVE_IMAGE_FORMATS[manifest.transform.format];
  const image = await sharp(value.bytes, { limitInputPixels: 24_000_000, failOn: 'warning' }).metadata();
  const source = new URL(manifest.sourceUrl);
  if (source.protocol !== 'https:' || source.username || source.password || source.search || source.hash || source.port || image.format !== 'jpeg' || image.pages && image.pages !== 1 || image.exif || image.xmp || image.icc || image.width !== size.width || image.height !== size.height || manifest.output.width !== size.width || manifest.output.height !== size.height || manifest.output.placedWidth > Math.min(manifest.normalizedInput.width, size.width) || manifest.output.placedHeight > Math.min(manifest.normalizedInput.height, size.height) || manifest.output.left !== Math.floor((size.width - manifest.output.placedWidth) / 2) || manifest.output.top !== Math.floor((size.height - manifest.output.placedHeight) / 2)) throw new MarketingError('CREATIVE_PROVENANCE_MISMATCH', 'Prepared dimensions or source contract changed', 422);
  return manifest;
}
