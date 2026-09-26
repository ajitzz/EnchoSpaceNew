/**
 * src/services/creativePackageService.ts
 *
 * FAANG L7/L8 Enterprise Creative Package Service (Sprint 2 / Domain 2).
 * Fulfills Decision 037-G & Blueprint Gap G-07.
 *
 * INVARIANTS:
 * 1. Zero Gallery Pollution: Standalone phone-shot Reels and ad creatives are stored in
 *    marketing_creative_packages and marketing_creative_assets. They NEVER touch listings.photos.
 * 2. Aspect Ratio & Duration Constraints:
 *    - Standalone Reels must be 9:16 vertical video.
 *    - Duration must not exceed 60.00 seconds.
 * 3. Mandatory Rights Attestation: Hosts must explicitly confirm advertising rights;
 *    a SHA-256 cryptographic attestation hash is recorded.
 * 4. AI Preflight Gatekeeper: Media & copy must score >= 8.0/10.0 to pass preflight.
 */

import crypto from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';

export type PackageType = 'STANDALONE_REEL' | 'CAROUSEL' | 'IMAGE_POST' | 'GALLERY_COLLECTION';
export type AssetRole = 'PRIMARY_VIDEO' | 'POST_IMAGE' | 'CAROUSEL_SLIDE' | 'THUMBNAIL';
export type AspectRatio = '9:16' | '1:1' | '16:9' | '4:5';
export type ModerationStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'QUARANTINED';

export const createCreativeAssetSchema = z.object({
  assetRole: z.enum(['PRIMARY_VIDEO', 'POST_IMAGE', 'CAROUSEL_SLIDE', 'THUMBNAIL']),
  originalUrl: z.string().url(),
  transcodedUrl: z.string().url().optional(),
  aspectRatio: z.enum(['9:16', '1:1', '16:9', '4:5']),
  durationSeconds: z.number().positive().max(60.00, 'Reel duration must not exceed 60 seconds').optional(),
  byteSize: z.number().int().positive().max(100 * 1024 * 1024, 'File size must not exceed 100MB'),
  mimeType: z.string().min(3),
  sha256Hash: z.string().length(64).optional(),
  ocrExtractedText: z.string().optional(),
  transcriptText: z.string().optional(),
});

export const createCreativePackageSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  roomTypeId: z.coerce.number().int().positive().optional(),
  packageType: z.enum(['STANDALONE_REEL', 'CAROUSEL', 'IMAGE_POST', 'GALLERY_COLLECTION']),
  title: z.string().min(3).max(200),
  headline: z.string().min(3).max(120),
  description: z.string().min(10).max(1000),
  destinationUrl: z.string().url(),
  rightsAttestationConfirmed: z.boolean(),
  asset: createCreativeAssetSchema,
});

export type CreateCreativePackageInput = z.infer<typeof createCreativePackageSchema>;

export interface CreativeAssetRecord {
  id: string;
  packageId: string;
  assetRole: AssetRole;
  originalUrl: string;
  transcodedUrl: string | null;
  aspectRatio: AspectRatio;
  durationSeconds: number | null;
  byteSize: number;
  mimeType: string;
  sha256Hash: string;
  ocrExtractedText: string | null;
  transcriptText: string | null;
  createdAt: string;
}

export interface CreativePackageRecord {
  id: string;
  hostUserId: number;
  listingId: number;
  roomTypeId: number | null;
  packageType: PackageType;
  title: string;
  headline: string;
  description: string;
  destinationUrl: string;
  aiPreflightScore: number | null;
  aiPreflightStatus: string;
  moderationStatus: ModerationStatus;
  rejectionReasons: string[];
  rightsAttestationConfirmed: boolean;
  rightsAttestationHash: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  assets?: CreativeAssetRecord[];
}

export class CreativePackageService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Evaluates creative package copy and media specs using heuristic / AI preflight rules.
   */
  evaluatePreflight(headline: string, description: string, asset: z.infer<typeof createCreativeAssetSchema>): {
    score: number;
    status: 'PASSED' | 'REQUIRES_REVISIONS';
    notes: string[];
  } {
    const notes: string[] = [];
    let score = 10.0;

    if (headline.length < 10) {
      score -= 1.0;
      notes.push('Headline is short; consider 10-50 characters for higher ad conversion.');
    }
    if (description.length < 30) {
      score -= 1.5;
      notes.push('Description is brief; provide at least 30 characters detailing the stay.');
    }

    if (asset.assetRole === 'PRIMARY_VIDEO') {
      if (asset.aspectRatio !== '9:16') {
        score -= 3.0;
        notes.push('Reels must be vertical (9:16 aspect ratio).');
      }
      if (asset.durationSeconds && asset.durationSeconds > 60) {
        score -= 4.0;
        notes.push('Reel duration exceeds maximum 60 seconds.');
      }
    }

    const finalScore = Math.max(1.0, Math.min(10.0, Math.round(score * 10) / 10));
    const status = finalScore >= 8.0 ? 'PASSED' : 'REQUIRES_REVISIONS';

    return { score: finalScore, status, notes };
  }

  /**
   * Creates a standalone creative package with atomic asset binding.
   * STRICT INVARIANT: Does NOT pollute listings.photos.
   */
  async createPackage(
    hostUserId: number,
    rawInput: unknown,
    isAdmin = false
  ): Promise<CreativePackageRecord> {
    const input = createCreativePackageSchema.parse(rawInput);

    // 1. Mandatory Rights Attestation
    if (!input.rightsAttestationConfirmed) {
      throw new Error('RIGHTS_ATTESTATION_REQUIRED: You must confirm rights to advertise this media.');
    }

    // 2. Format specific validation
    if (input.packageType === 'STANDALONE_REEL') {
      if (input.asset.aspectRatio !== '9:16') {
        throw new Error('INVALID_ASPECT_RATIO: Standalone Reels must have aspect ratio 9:16.');
      }
      if (!input.asset.mimeType.startsWith('video/')) {
        throw new Error('INVALID_MEDIA_TYPE: Standalone Reels require a video file.');
      }
      if (input.asset.durationSeconds && input.asset.durationSeconds > 60.00) {
        throw new Error('DURATION_EXCEEDED: Standalone Reels must not exceed 60.00 seconds.');
      }
    }

    // 3. Verify listing ownership
    const listingRes = await this.pool.query(
      'SELECT id, user_id, title FROM listings WHERE id = $1',
      [input.listingId]
    );
    if (listingRes.rows.length === 0) {
      throw new Error('LISTING_NOT_FOUND: Referenced property does not exist.');
    }

    const listing = listingRes.rows[0];
    if (listing.user_id !== hostUserId && !isAdmin) {
      throw new Error('PERMISSION_DENIED: You do not own this property listing.');
    }

    // 4. Verify roomTypeId if provided
    if (input.roomTypeId) {
      const roomRes = await this.pool.query(
        'SELECT id FROM room_types WHERE id = $1 AND listing_id = $2',
        [input.roomTypeId, input.listingId]
      );
      if (roomRes.rows.length === 0) {
        throw new Error('ROOM_TYPE_NOT_FOUND: Room type does not belong to this listing.');
      }
    }

    // 5. Compute cryptographic attestation hash
    const attestationPayload = `attest:${hostUserId}:${input.listingId}:${input.asset.originalUrl}:${input.rightsAttestationConfirmed}`;
    const attestationHash = crypto.createHash('sha256').update(attestationPayload).digest('hex');

    // 6. Compute or assign asset hash
    const assetSha256 = input.asset.sha256Hash || crypto.createHash('sha256').update(input.asset.originalUrl).digest('hex');

    // 7. Run AI Preflight assessment
    const preflight = this.evaluatePreflight(input.headline, input.description, input.asset);

    // 8. Atomic Database Insertion
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const packageId = crypto.randomUUID();
      const assetId = crypto.randomUUID();

      const insertPkgRes = await client.query(
        `INSERT INTO marketing_creative_packages (
          id, host_user_id, listing_id, room_type_id, package_type,
          title, headline, description, destination_url,
          ai_preflight_score, ai_preflight_status, moderation_status,
          rejection_reasons, rights_attestation_confirmed, rights_attestation_hash,
          version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'SUBMITTED', '[]'::jsonb, $12, $13, 1)
        RETURNING *`,
        [
          packageId,
          hostUserId,
          input.listingId,
          input.roomTypeId || null,
          input.packageType,
          input.title,
          input.headline,
          input.description,
          input.destinationUrl,
          preflight.score,
          preflight.status,
          input.rightsAttestationConfirmed,
          attestationHash,
        ]
      );

      const pkgRow = insertPkgRes.rows[0];

      const insertAssetRes = await client.query(
        `INSERT INTO marketing_creative_assets (
          id, package_id, asset_role, original_url, transcoded_url,
          aspect_ratio, duration_seconds, byte_size, mime_type,
          sha256_hash, ocr_extracted_text, transcript_text
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          assetId,
          packageId,
          input.asset.assetRole,
          input.asset.originalUrl,
          input.asset.transcodedUrl || null,
          input.asset.aspectRatio,
          input.asset.durationSeconds || null,
          input.asset.byteSize,
          input.asset.mimeType,
          assetSha256,
          input.asset.ocrExtractedText || null,
          input.asset.transcriptText || null,
        ]
      );

      const assetRow = insertAssetRes.rows[0];

      await client.query('COMMIT');

      return {
        id: pkgRow.id,
        hostUserId: pkgRow.host_user_id,
        listingId: pkgRow.listing_id,
        roomTypeId: pkgRow.room_type_id,
        packageType: pkgRow.package_type,
        title: pkgRow.title,
        headline: pkgRow.headline,
        description: pkgRow.description,
        destinationUrl: pkgRow.destination_url,
        aiPreflightScore: Number(pkgRow.ai_preflight_score),
        aiPreflightStatus: pkgRow.ai_preflight_status,
        moderationStatus: pkgRow.moderation_status,
        rejectionReasons: pkgRow.rejection_reasons || [],
        rightsAttestationConfirmed: pkgRow.rights_attestation_confirmed,
        rightsAttestationHash: pkgRow.rights_attestation_hash,
        version: pkgRow.version,
        createdAt: new Date(pkgRow.created_at).toISOString(),
        updatedAt: new Date(pkgRow.updated_at).toISOString(),
        assets: [
          {
            id: assetRow.id,
            packageId: assetRow.package_id,
            assetRole: assetRow.asset_role,
            originalUrl: assetRow.original_url,
            transcodedUrl: assetRow.transcoded_url,
            aspectRatio: assetRow.aspect_ratio,
            durationSeconds: assetRow.duration_seconds ? Number(assetRow.duration_seconds) : null,
            byteSize: assetRow.byte_size,
            mimeType: assetRow.mime_type,
            sha256Hash: assetRow.sha256_hash,
            ocrExtractedText: assetRow.ocr_extracted_text,
            transcriptText: assetRow.transcript_text,
            createdAt: new Date(assetRow.created_at).toISOString(),
          },
        ],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Lists creative packages with their associated assets.
   */
  async listPackages(params: {
    userId?: number;
    listingId?: number;
    status?: ModerationStatus;
    isAdmin?: boolean;
    limit?: number;
  }): Promise<CreativePackageRecord[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (!params.isAdmin && params.userId) {
      conditions.push(`host_user_id = $${idx++}`);
      values.push(params.userId);
    }
    if (params.listingId) {
      conditions.push(`listing_id = $${idx++}`);
      values.push(params.listingId);
    }
    if (params.status) {
      conditions.push(`moderation_status = $${idx++}`);
      values.push(params.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = `LIMIT ${Math.min(params.limit || 50, 100)}`;

    const res = await this.pool.query(
      `SELECT * FROM marketing_creative_packages ${whereClause} ORDER BY created_at DESC ${limitClause}`,
      values
    );

    const packages: CreativePackageRecord[] = [];
    for (const r of res.rows) {
      const assetsRes = await this.pool.query(
        'SELECT * FROM marketing_creative_assets WHERE package_id = $1 ORDER BY created_at ASC',
        [r.id]
      );

      packages.push({
        id: r.id,
        hostUserId: r.host_user_id,
        listingId: r.listing_id,
        roomTypeId: r.room_type_id,
        packageType: r.package_type,
        title: r.title,
        headline: r.headline,
        description: r.description,
        destinationUrl: r.destination_url,
        aiPreflightScore: r.ai_preflight_score ? Number(r.ai_preflight_score) : null,
        aiPreflightStatus: r.ai_preflight_status,
        moderationStatus: r.moderation_status,
        rejectionReasons: r.rejection_reasons || [],
        rightsAttestationConfirmed: r.rights_attestation_confirmed,
        rightsAttestationHash: r.rights_attestation_hash,
        version: r.version,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
        assets: assetsRes.rows.map((a: any) => ({
          id: a.id,
          packageId: a.package_id,
          assetRole: a.asset_role,
          originalUrl: a.original_url,
          transcodedUrl: a.transcoded_url,
          aspectRatio: a.aspect_ratio,
          durationSeconds: a.duration_seconds ? Number(a.duration_seconds) : null,
          byteSize: a.byte_size,
          mimeType: a.mime_type,
          sha256Hash: a.sha256_hash,
          ocrExtractedText: a.ocr_extracted_text,
          transcriptText: a.transcript_text,
          createdAt: new Date(a.created_at).toISOString(),
        })),
      });
    }

    return packages;
  }

  /**
   * Retrieves a single creative package by ID.
   */
  async getPackage(packageId: string, userId?: number, isAdmin = false): Promise<CreativePackageRecord | null> {
    const res = await this.pool.query(
      'SELECT * FROM marketing_creative_packages WHERE id = $1',
      [packageId]
    );
    if (res.rows.length === 0) return null;

    const r = res.rows[0];
    if (!isAdmin && userId && r.host_user_id !== userId) {
      throw new Error('PERMISSION_DENIED: Access to this creative package is restricted.');
    }

    const assetsRes = await this.pool.query(
      'SELECT * FROM marketing_creative_assets WHERE package_id = $1 ORDER BY created_at ASC',
      [packageId]
    );

    return {
      id: r.id,
      hostUserId: r.host_user_id,
      listingId: r.listing_id,
      roomTypeId: r.room_type_id,
      packageType: r.package_type,
      title: r.title,
      headline: r.headline,
      description: r.description,
      destinationUrl: r.destination_url,
      aiPreflightScore: r.ai_preflight_score ? Number(r.ai_preflight_score) : null,
      aiPreflightStatus: r.ai_preflight_status,
      moderationStatus: r.moderation_status,
      rejectionReasons: r.rejection_reasons || [],
      rightsAttestationConfirmed: r.rights_attestation_confirmed,
      rightsAttestationHash: r.rights_attestation_hash,
      version: r.version,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
      assets: assetsRes.rows.map((a: any) => ({
        id: a.id,
        packageId: a.package_id,
        assetRole: a.asset_role,
        originalUrl: a.original_url,
        transcodedUrl: a.transcoded_url,
        aspectRatio: a.aspect_ratio,
        durationSeconds: a.duration_seconds ? Number(a.duration_seconds) : null,
        byteSize: a.byte_size,
        mimeType: a.mime_type,
        sha256Hash: a.sha256_hash,
        ocrExtractedText: a.ocr_extracted_text,
        transcriptText: a.transcript_text,
        createdAt: new Date(a.created_at).toISOString(),
      })),
    };
  }

  /**
   * Admin moderation action: APPROVE or REJECT.
   */
  async moderatePackage(
    packageId: string,
    adminId: number,
    decision: 'APPROVE' | 'REJECT',
    rejectionReasons: string[] = []
  ): Promise<CreativePackageRecord> {
    const pkg = await this.getPackage(packageId, undefined, true);
    if (!pkg) {
      throw new Error('PACKAGE_NOT_FOUND: Creative package does not exist.');
    }

    const nextStatus: ModerationStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const reasonsJson = JSON.stringify(rejectionReasons);

    const updateRes = await this.pool.query(
      `UPDATE marketing_creative_packages
       SET moderation_status = $1,
           rejection_reasons = $2,
           version = version + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [nextStatus, reasonsJson, packageId]
    );

    const r = updateRes.rows[0];
    return {
      ...pkg,
      moderationStatus: r.moderation_status,
      rejectionReasons: r.rejection_reasons,
      version: r.version,
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }
}
