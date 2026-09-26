/**
 * src/test/harvo/sprint2_creative_pipeline.test.ts
 *
 * FAANG L7/L8 Zero-Trust Adversarial Test Suite for Standalone Reel & Creative Package Pipeline (Sprint 2).
 * Fulfills Decision 037-G & Blueprint Gap G-07.
 *
 * Verifies:
 * 1. Zero Gallery Pollution Invariant: Standalone phone reels NEVER touch listings.photos.
 * 2. Strict Aspect Ratio (9:16) & Duration (<=60s) validation gates fail closed.
 * 3. Mandatory Rights Attestation with SHA-256 cryptographic hash verification.
 * 4. AI Preflight Gatekeeper (>= 8.0/10.0 pass score) evaluation rules.
 * 5. Cross-Tenant Security: Strict host-listing ownership authorization and isolation.
 * 6. Admin Moderation State Machine: SUBMITTED -> APPROVED / REJECTED with monotonic version bumping.
 * 7. End-to-End Express Router Contract over HTTP with role-based access control.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createLocalPostgresFixture } from './postgres.js';
import { CreativePackageService } from '../../services/creativePackageService.js';
import { createCreativePackageRouter } from '../../server/marketing/creativePackageRouter.js';

describe('Sprint 2: Standalone Reel & Creative Package Pipeline Adversarial Suite', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let service: CreativePackageService;
  let app: express.Express;

  // Test identities
  const HOST_A_ID = 101;
  const HOST_B_ID = 102;
  const ADMIN_ID = 999;
  let listingAId: number;
  let listingBId: number;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });

    // 1. Deploy base tables required by foreign keys
    await fixture.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user'
      );

      CREATE TABLE IF NOT EXISTS listings (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        photos JSONB DEFAULT '[]'::jsonb,
        price NUMERIC NOT NULL DEFAULT 5000,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR'
      );

      CREATE TABLE IF NOT EXISTS room_types (
        id SERIAL PRIMARY KEY,
        listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        base_price NUMERIC NOT NULL DEFAULT 5000
      );

      -- Deploy Sprint 2 Creative Package tables
      CREATE TABLE IF NOT EXISTS marketing_creative_packages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        host_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        room_type_id INT REFERENCES room_types(id) ON DELETE SET NULL,
        package_type VARCHAR(50) NOT NULL CHECK (package_type IN ('STANDALONE_REEL', 'CAROUSEL', 'IMAGE_POST', 'GALLERY_COLLECTION')),
        title VARCHAR(200) NOT NULL,
        headline VARCHAR(120) NOT NULL,
        description TEXT NOT NULL,
        destination_url TEXT NOT NULL,
        ai_preflight_score DECIMAL(3, 1),
        ai_preflight_status VARCHAR(50) DEFAULT 'PENDING_SCAN',
        moderation_status VARCHAR(50) DEFAULT 'SUBMITTED' CHECK (moderation_status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'QUARANTINED')),
        rejection_reasons JSONB DEFAULT '[]'::jsonb,
        rights_attestation_confirmed BOOLEAN DEFAULT false,
        rights_attestation_hash VARCHAR(64),
        version INT DEFAULT 1 CHECK (version >= 1),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS marketing_creative_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id UUID NOT NULL REFERENCES marketing_creative_packages(id) ON DELETE CASCADE,
        asset_role VARCHAR(50) NOT NULL CHECK (asset_role IN ('PRIMARY_VIDEO', 'POST_IMAGE', 'CAROUSEL_SLIDE', 'THUMBNAIL')),
        original_url TEXT NOT NULL,
        transcoded_url TEXT,
        aspect_ratio VARCHAR(20) NOT NULL CHECK (aspect_ratio IN ('9:16', '1:1', '16:9', '4:5')),
        duration_seconds DECIMAL(5, 2) CHECK (duration_seconds IS NULL OR duration_seconds <= 60.00),
        byte_size INT NOT NULL CHECK (byte_size > 0),
        mime_type VARCHAR(100) NOT NULL,
        sha256_hash VARCHAR(64) NOT NULL,
        ocr_extracted_text TEXT,
        transcript_text TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed test users
    await fixture.pool.query(`
      INSERT INTO users (id, email, name, role) VALUES
      (${HOST_A_ID}, 'host_a@encho.in', 'Host Alice', 'host'),
      (${HOST_B_ID}, 'host_b@encho.in', 'Host Bob', 'host'),
      (${ADMIN_ID}, 'admin@encho.in', 'Admin Mallory', 'admin')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed architectural listings with initial gallery photos
    const listARes = await fixture.pool.query(`
      INSERT INTO listings (user_id, title, photos, price)
      VALUES (
        ${HOST_A_ID},
        'Wayanad Mist Plantation Villa',
        '[
          {"url": "https://img.encho.in/p1.jpg", "category": "exterior", "tier": "common"},
          {"url": "https://img.encho.in/p2.jpg", "category": "living_room", "tier": "common"},
          {"url": "https://img.encho.in/p3.jpg", "category": "bedroom", "tier": "deluxe"}
        ]'::jsonb,
        14500
      ) RETURNING id;
    `);
    listingAId = listARes.rows[0].id;

    const listBRes = await fixture.pool.query(`
      INSERT INTO listings (user_id, title, photos, price)
      VALUES (
        ${HOST_B_ID},
        'Munnar Tea Estate Cottage',
        '[
          {"url": "https://img.encho.in/b1.jpg", "category": "exterior", "tier": "common"}
        ]'::jsonb,
        8000
      ) RETURNING id;
    `);
    listingBId = listBRes.rows[0].id;

    service = new CreativePackageService(fixture.pool);

    // Initialize express app with simulated auth middleware
    app = express();
    app.use(express.json());

    // Middleware to simulate authenticated user via headers:
    // x-test-user-id and x-test-user-role
    app.use((req, _res, next) => {
      const uid = req.headers['x-test-user-id'];
      const role = req.headers['x-test-user-role'] || 'host';
      if (uid) {
        (req as any).user = { id: Number(uid), role: String(role) };
      }
      next();
    });

    const router = createCreativePackageRouter(fixture.pool);
    app.use('/api/marketing/v2/creatives/packages', router);
  });

  afterAll(async () => {
    await fixture.close();
  });

  // TEST 1: Creation of 9:16 Standalone Reel Package
  it('Test 1: Upload 9:16 Standalone Reel -> Creates Package and Asset with SHA-256 and SUBMITTED status', async () => {
    const reelInput = {
      listingId: listingAId,
      packageType: 'STANDALONE_REEL' as const,
      title: 'Morning Mist Villa Walkthrough',
      headline: 'Awaken in Cloud-Kissed Solitude',
      description: 'Experience panoramic tea estate views from your private infinity plunge pool in Wayanad.',
      destinationUrl: 'https://encho.in/stays/wayanad-mist-villa',
      rightsAttestationConfirmed: true,
      asset: {
        assetRole: 'PRIMARY_VIDEO' as const,
        originalUrl: 'https://video.encho.in/reels/mist_walkthrough_916.mp4',
        aspectRatio: '9:16' as const,
        durationSeconds: 28.5,
        byteSize: 14500000,
        mimeType: 'video/mp4',
        sha256Hash: crypto.createHash('sha256').update('reel_video_bytes_payload').digest('hex'),
      },
    };

    const pkg = await service.createPackage(HOST_A_ID, reelInput);

    expect(pkg).toBeDefined();
    expect(pkg.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(pkg.hostUserId).toBe(HOST_A_ID);
    expect(pkg.listingId).toBe(listingAId);
    expect(pkg.packageType).toBe('STANDALONE_REEL');
    expect(pkg.moderationStatus).toBe('SUBMITTED');
    expect(pkg.rightsAttestationConfirmed).toBe(true);
    expect(pkg.rightsAttestationHash).toHaveLength(64);
    expect(pkg.aiPreflightScore).toBeGreaterThanOrEqual(8.0);
    expect(pkg.aiPreflightStatus).toBe('PASSED');
    expect(pkg.version).toBe(1);

    expect(pkg.assets).toHaveLength(1);
    const asset = pkg.assets![0];
    expect(asset.assetRole).toBe('PRIMARY_VIDEO');
    expect(asset.aspectRatio).toBe('9:16');
    expect(asset.durationSeconds).toBe(28.5);
    expect(asset.byteSize).toBe(14500000);
    expect(asset.mimeType).toBe('video/mp4');
    expect(asset.sha256Hash).toBe(reelInput.asset.sha256Hash);
  });

  // TEST 2: Invariant Check — Zero Gallery Pollution
  it('Test 2: Zero Gallery Pollution Invariant — Standalone Reel NEVER mutates listings.photos', async () => {
    // Read photos before reel creation
    const beforeRes = await fixture.pool.query('SELECT photos FROM listings WHERE id = $1', [listingAId]);
    const photosBefore = beforeRes.rows[0].photos;
    expect(photosBefore).toHaveLength(3);

    // Create another standalone reel
    await service.createPackage(HOST_A_ID, {
      listingId: listingAId,
      packageType: 'STANDALONE_REEL',
      title: 'Sunset Terrace Reel',
      headline: 'Golden Hour Over Wayanad Valley',
      description: 'Watch the valley turn golden from your private deck with local estate coffee in hand.',
      destinationUrl: 'https://encho.in/stays/wayanad-mist-villa',
      rightsAttestationConfirmed: true,
      asset: {
        assetRole: 'PRIMARY_VIDEO',
        originalUrl: 'https://video.encho.in/reels/sunset_916.mp4',
        aspectRatio: '9:16',
        durationSeconds: 15.0,
        byteSize: 8500000,
        mimeType: 'video/mp4',
      },
    });

    // Read photos after reel creation
    const afterRes = await fixture.pool.query('SELECT photos FROM listings WHERE id = $1', [listingAId]);
    const photosAfter = afterRes.rows[0].photos;

    // Photos must be 100% byte-for-byte and length identical (ZERO POLLUTION)
    expect(photosAfter).toEqual(photosBefore);
    expect(photosAfter).toHaveLength(3);
    const hasReelInGallery = JSON.stringify(photosAfter).includes('sunset_916.mp4');
    expect(hasReelInGallery).toBe(false);
  });

  // TEST 3: Aspect Ratio, Duration & MIME Type Gates
  it('Test 3: Format & Duration Validation Gates fail closed', async () => {
    // 3a. Invalid aspect ratio (16:9 widescreen for a Standalone Reel)
    await expect(
      service.createPackage(HOST_A_ID, {
        listingId: listingAId,
        packageType: 'STANDALONE_REEL',
        title: 'Horizontal Landscape Video',
        headline: 'Beautiful Landscape Views Here',
        description: 'Detailed description of the landscape views from the property balcony.',
        destinationUrl: 'https://encho.in/stays/wayanad-mist-villa',
        rightsAttestationConfirmed: true,
        asset: {
          assetRole: 'PRIMARY_VIDEO',
          originalUrl: 'https://video.encho.in/horizontal.mp4',
          aspectRatio: '16:9', // INVALID for Standalone Reel
          durationSeconds: 30.0,
          byteSize: 12000000,
          mimeType: 'video/mp4',
        },
      })
    ).rejects.toThrow('INVALID_ASPECT_RATIO: Standalone Reels must have aspect ratio 9:16.');

    // 3b. Duration exceeding 60.00 seconds
    await expect(
      service.createPackage(HOST_A_ID, {
        listingId: listingAId,
        packageType: 'STANDALONE_REEL',
        title: 'Overlong Documentary Reel',
        headline: 'A 90-Second Deep Journey',
        description: 'Comprehensive long tour of the property and its surrounding mountain ridges.',
        destinationUrl: 'https://encho.in/stays/wayanad-mist-villa',
        rightsAttestationConfirmed: true,
        asset: {
          assetRole: 'PRIMARY_VIDEO',
          originalUrl: 'https://video.encho.in/long_tour.mp4',
          aspectRatio: '9:16',
          durationSeconds: 75.0, // EXCEEDS 60s
          byteSize: 45000000,
          mimeType: 'video/mp4',
        },
      })
    ).rejects.toThrow();

    // 3c. Non-video MIME type for a Reel
    await expect(
      service.createPackage(HOST_A_ID, {
        listingId: listingAId,
        packageType: 'STANDALONE_REEL',
        title: 'Static Image As Reel',
        headline: 'High Resolution Photo Ad',
        description: 'A static photo mistakenly submitted as a standalone mobile video reel.',
        destinationUrl: 'https://encho.in/stays/wayanad-mist-villa',
        rightsAttestationConfirmed: true,
        asset: {
          assetRole: 'PRIMARY_VIDEO',
          originalUrl: 'https://img.encho.in/photo.png',
          aspectRatio: '9:16',
          durationSeconds: 10.0,
          byteSize: 2000000,
          mimeType: 'image/png', // NOT video/
        },
      })
    ).rejects.toThrow('INVALID_MEDIA_TYPE: Standalone Reels require a video file.');
  });

  // TEST 4: Mandatory Rights Attestation Gate
  it('Test 4: Mandatory Rights Attestation fails closed when unconfirmed', async () => {
    // Attempting without confirming rights
    await expect(
      service.createPackage(HOST_A_ID, {
        listingId: listingAId,
        packageType: 'STANDALONE_REEL',
        title: 'Unlicensed Music Video Reel',
        headline: 'Stunning Morning Mist Views',
        description: 'Watch the valley awaken in complete peaceful serenity above the clouds.',
        destinationUrl: 'https://encho.in/stays/wayanad-mist-villa',
        rightsAttestationConfirmed: false, // UNCONFIRMED
        asset: {
          assetRole: 'PRIMARY_VIDEO',
          originalUrl: 'https://video.encho.in/unlicensed.mp4',
          aspectRatio: '9:16',
          durationSeconds: 20.0,
          byteSize: 10000000,
          mimeType: 'video/mp4',
        },
      })
    ).rejects.toThrow('RIGHTS_ATTESTATION_REQUIRED');
  });

  // TEST 5: AI Preflight Gatekeeper Scoring
  it('Test 5: AI Preflight Gatekeeper differentiates high vs low conversion copy', () => {
    // High-converting copy
    const highResult = service.evaluatePreflight(
      'Exclusive Forest Solitude in Munnar',
      'Nestled within 50 acres of private cardamom plantations, featuring heated cedar jacuzzis and personal butler dining.',
      {
        assetRole: 'PRIMARY_VIDEO',
        originalUrl: 'https://video.encho.in/luxury.mp4',
        aspectRatio: '9:16',
        durationSeconds: 30.0,
        byteSize: 15000000,
        mimeType: 'video/mp4',
      }
    );
    expect(highResult.score).toBe(10.0);
    expect(highResult.status).toBe('PASSED');
    expect(highResult.notes).toHaveLength(0);

    // Low-converting copy: very short headline and brief description
    const lowResult = service.evaluatePreflight(
      'Nice Stay', // < 10 chars
      'Good room here', // < 30 chars
      {
        assetRole: 'PRIMARY_VIDEO',
        originalUrl: 'https://video.encho.in/poor.mp4',
        aspectRatio: '9:16',
        durationSeconds: 25.0,
        byteSize: 5000000,
        mimeType: 'video/mp4',
      }
    );
    expect(lowResult.score).toBeLessThan(8.0);
    expect(lowResult.status).toBe('REQUIRES_REVISIONS');
    expect(lowResult.notes.length).toBeGreaterThan(0);
  });

  // TEST 6: Tenant Isolation & Ownership Authorization
  it('Test 6: Cross-Tenant Isolation prevents Host B from targeting Host A listing or accessing packages', async () => {
    // 6a. Host B cannot create a package for Host A's listing
    await expect(
      service.createPackage(HOST_B_ID, {
        listingId: listingAId, // Listing A is owned by Host A
        packageType: 'STANDALONE_REEL',
        title: 'Host B Hijack Attempt',
        headline: 'Unauthorized Ad Package',
        description: 'Attempting to run unauthorized ads against a competitor host listing.',
        destinationUrl: 'https://encho.in/stays/wayanad-mist-villa',
        rightsAttestationConfirmed: true,
        asset: {
          assetRole: 'PRIMARY_VIDEO',
          originalUrl: 'https://video.encho.in/hijack.mp4',
          aspectRatio: '9:16',
          durationSeconds: 20.0,
          byteSize: 8000000,
          mimeType: 'video/mp4',
        },
      })
    ).rejects.toThrow('PERMISSION_DENIED: You do not own this property listing.');

    // 6b. Non-existent listing fails closed
    await expect(
      service.createPackage(HOST_A_ID, {
        listingId: 999999, // Does not exist
        packageType: 'STANDALONE_REEL',
        title: 'Ghost Listing Reel',
        headline: 'No Property Exists',
        description: 'Attempting to attach a reel to an unallocated listing identifier.',
        destinationUrl: 'https://encho.in/stays/ghost',
        rightsAttestationConfirmed: true,
        asset: {
          assetRole: 'PRIMARY_VIDEO',
          originalUrl: 'https://video.encho.in/ghost.mp4',
          aspectRatio: '9:16',
          durationSeconds: 15.0,
          byteSize: 5000000,
          mimeType: 'video/mp4',
        },
      })
    ).rejects.toThrow('LISTING_NOT_FOUND: Referenced property does not exist.');

    // 6c. Host B cannot view Host A's package
    const hostAPkg = await service.createPackage(HOST_A_ID, {
      listingId: listingAId,
      packageType: 'STANDALONE_REEL',
      title: 'Host A Private Creative',
      headline: 'Private Ad Campaign Creative',
      description: 'Confidential marketing creative package owned exclusively by Host A.',
      destinationUrl: 'https://encho.in/stays/wayanad-mist-villa',
      rightsAttestationConfirmed: true,
      asset: {
        assetRole: 'PRIMARY_VIDEO',
        originalUrl: 'https://video.encho.in/private_a.mp4',
        aspectRatio: '9:16',
        durationSeconds: 22.0,
        byteSize: 9000000,
        mimeType: 'video/mp4',
      },
    });

    await expect(
      service.getPackage(hostAPkg.id, HOST_B_ID, false)
    ).rejects.toThrow('PERMISSION_DENIED: Access to this creative package is restricted.');

    // Admin can view Host A's package
    const adminView = await service.getPackage(hostAPkg.id, ADMIN_ID, true);
    expect(adminView).toBeDefined();
    expect(adminView?.id).toBe(hostAPkg.id);
  });

  // TEST 7: Admin Moderation State Machine
  it('Test 7: Admin Moderation transitions states and increments version monotonically', async () => {
    const pkg = await service.createPackage(HOST_A_ID, {
      listingId: listingAId,
      packageType: 'STANDALONE_REEL',
      title: 'Moderation Lifecycle Test Reel',
      headline: 'Exclusive Wayanad Sanctuary Stay',
      description: 'Detailed description for testing admin moderation lifecycle transitions and version incrementing.',
      destinationUrl: 'https://encho.in/stays/wayanad-mist-villa',
      rightsAttestationConfirmed: true,
      asset: {
        assetRole: 'PRIMARY_VIDEO',
        originalUrl: 'https://video.encho.in/moderation_test.mp4',
        aspectRatio: '9:16',
        durationSeconds: 25.0,
        byteSize: 11000000,
        mimeType: 'video/mp4',
      },
    });

    expect(pkg.moderationStatus).toBe('SUBMITTED');
    expect(pkg.version).toBe(1);

    // Admin approves package
    const approvedPkg = await service.moderatePackage(pkg.id, ADMIN_ID, 'APPROVE');
    expect(approvedPkg.moderationStatus).toBe('APPROVED');
    expect(approvedPkg.version).toBe(2);
    expect(approvedPkg.rejectionReasons).toEqual([]);

    // Admin later rejects package with specific feedback
    const rejectedPkg = await service.moderatePackage(pkg.id, ADMIN_ID, 'REJECT', [
      'Music track contains unverified copyrighted audio',
      'Video contains blurred watermarked logo',
    ]);
    expect(rejectedPkg.moderationStatus).toBe('REJECTED');
    expect(rejectedPkg.version).toBe(3);
    expect(rejectedPkg.rejectionReasons).toHaveLength(2);
    expect(rejectedPkg.rejectionReasons[0]).toContain('copyrighted audio');
  });

  // TEST 8: Full HTTP Express Router RBAC Contract
  it('Test 8: HTTP Router Integration enforces authentication and role-based permissions', async () => {
    // 8a. Unauthenticated POST fails with 401
    const unauthRes = await request(app)
      .post('/api/marketing/v2/creatives/packages')
      .send({});
    expect(unauthRes.status).toBe(401);

    // 8b. Host A successfully creates a package via HTTP POST
    const createRes = await request(app)
      .post('/api/marketing/v2/creatives/packages')
      .set('x-test-user-id', String(HOST_A_ID))
      .set('x-test-user-role', 'host')
      .send({
        listingId: listingAId,
        packageType: 'STANDALONE_REEL',
        title: 'HTTP API Pipeline Reel',
        headline: 'Live Verified Sunset Escape',
        description: 'Created through the authenticated Express HTTP router with complete telemetry verification.',
        destinationUrl: 'https://encho.in/stays/wayanad-mist-villa',
        rightsAttestationConfirmed: true,
        asset: {
          assetRole: 'PRIMARY_VIDEO',
          originalUrl: 'https://video.encho.in/http_reel.mp4',
          aspectRatio: '9:16',
          durationSeconds: 32.0,
          byteSize: 16000000,
          mimeType: 'video/mp4',
        },
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const createdId = createRes.body.package.id;
    expect(createdId).toBeDefined();

    // 8c. Host A lists packages -> contains the created package
    const listRes = await request(app)
      .get('/api/marketing/v2/creatives/packages')
      .set('x-test-user-id', String(HOST_A_ID))
      .set('x-test-user-role', 'host');

    expect(listRes.status).toBe(200);
    expect(listRes.body.packages.some((p: any) => p.id === createdId)).toBe(true);

    // 8d. Host B attempts to view Host A's package -> 403 Forbidden
    const crossTenantGet = await request(app)
      .get(`/api/marketing/v2/creatives/packages/${createdId}`)
      .set('x-test-user-id', String(HOST_B_ID))
      .set('x-test-user-role', 'host');

    expect(crossTenantGet.status).toBe(403);

    // 8e. Host A attempts to moderate package -> 403 Forbidden (requires admin role)
    const hostModerateRes = await request(app)
      .post(`/api/marketing/v2/creatives/packages/${createdId}/moderate`)
      .set('x-test-user-id', String(HOST_A_ID))
      .set('x-test-user-role', 'host')
      .send({ decision: 'APPROVE' });

    expect(hostModerateRes.status).toBe(403);

    // 8f. Admin moderates package -> 200 OK with APPROVED status
    const adminModerateRes = await request(app)
      .post(`/api/marketing/v2/creatives/packages/${createdId}/moderate`)
      .set('x-test-user-id', String(ADMIN_ID))
      .set('x-test-user-role', 'admin')
      .send({ decision: 'APPROVE' });

    expect(adminModerateRes.status).toBe(200);
    expect(adminModerateRes.body.success).toBe(true);
    expect(adminModerateRes.body.package.moderationStatus).toBe('APPROVED');
    expect(adminModerateRes.body.package.version).toBe(2);
  });
});
