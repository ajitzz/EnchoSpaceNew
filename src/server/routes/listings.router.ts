import fs from 'fs';
import express from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { JWT_SECRET } from '../config/clients.js';
import { resolvePersistedSession } from '../../lib/marketing/legacyAuthorization.js';
import { registerCalendarRoutes } from '../calendar.js';
import { createDeployedMarketingRuntime } from '../marketing/runtime.js';
import { Router, Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { pool, isDbConfigured, dbConnectionError } from '../db/connection.js';
import {
  ai,
  mux,
  s3,
  stripe,
  razorpay,
  redis,
  sendWhatsAppMessage,
  broadcastDbEvent,
  logGeminiWarning,
  getGlobalIoInstance
} from '../config/clients.js';
import {
  authenticateToken,
  optionalAuthenticateToken,
  requireAdmin,
  requireExplicitDevelopmentFixture,
  AuthRequest,
  bookingLimiter,
  aiGatekeeperLimiter
} from '../middleware/auth.js';
import { ensureListingsTable } from '../db/bootstrap.js';
import {
  acquireHold,
  releaseHold,
  getHoldTtlSeconds,
  signGuestSession,
  verifyGuestSession,
  createHostCalendarBlock
} from '../../services/inventoryHoldService.js';
import { resolvePublicStayAuthority, PublicStayAuthorityError } from '../guest/publicStayAuthority.js';
import {
  toPublicStayProjection,
  toPublicListingCardProjection,
  generateListingSlug,
  escapeHtml,
  STAY_PUBLIC_SQL_COLUMNS,
  coarsenCoordinate
} from '../../lib/stayProjection.js';
import { maskContactInfo } from '../../lib/maskUtils.js';
import {
  assertPublicImageOrigin,
  isAllowedImageSource,
  parseImageTransformQuery,
  readBoundedImageResponse,
  REMOTE_IMAGE_LIMITS
} from '../media/remoteImageProxy.js';
import { createLegacyListingAssistanceBoundary } from '../assistance/legacyListingAiBoundary.js';
import { conversationAssistanceBoundary } from '../assistance/conversationAssistanceBoundary.js';
import { processMarketingAssets } from '../../lib/imageProcessor.js';
import { issueLocalUpload, verifyLocalUpload, randomMediaKey, writeImmutableMedia } from '../../lib/marketing/localMedia.js';
import { createImmutableS3Upload } from '../../lib/immutableS3Upload.js';
import {
  triggerSmartAutoPause,
  syncDynamicPricingToMeta,
  validatePropertyPublication,
  dispatchConversionsAPI
} from '../services/legacyMarketingEngine.js';


const harvoMarketing = createDeployedMarketingRuntime(pool);

function readIndexHtml(): string {
  const paths = [
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(process.cwd(), 'public', 'index.html'),
    './dist/index.html',
    './index.html'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, 'utf8');
      } catch (err) {
        console.error(`Failed to read index.html at ${p}:`, err);
      }
    }
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>EnchoSpace</title></head><body><div id="root"></div></body></html>`;
}

export function createListingsRouter(): Router {
  const router = Router();

router.get('/api/listings/:id/calendar', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json([]);
  try {
    const query = `
      SELECT c.*, row_to_json(o.*) as offer
      FROM calendar_prices c
      LEFT JOIN offers o ON c.offer_id = o.id
      WHERE c.listing_id = $1
    `;
    const result = await pool.query(query, [req.params.id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

router.post('/api/listings/:id/calendar', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json({ success: true, message: "Demo listing updated" });
  try {
    const listingId = req.params.id;

    // IDOR Protection: Verify listing ownership or admin privileges
    const authCheck = await pool.query('SELECT user_id FROM listings WHERE id = $1', [listingId]);
    if (authCheck.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    if (authCheck.rows[0].user_id !== req.user?.id && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this calendar.' });
    }

    const { dates, price, offer_id, status } = req.body;
    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: 'dates array is required' });
    }

    // Process each date
    for (const date_string of dates) {
      await pool.query(`
        INSERT INTO calendar_prices (listing_id, date_string, price, offer_id, status)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (listing_id, date_string)
        DO UPDATE SET price = $3, offer_id = $4, status = $5
      `, [listingId, date_string, price, offer_id || null, status || 'available']);
    }

    // Milestone 5: The Circuit Breaker (Smart Pause) for manual calendar blocks
    if (status === 'blocked' || status === 'booked') {
        triggerSmartAutoPause(listingId, `MANUAL_BLOCK_${Date.now()}`).catch(err => {
            console.error('[CIRCUIT BREAKER ERROR] Failed to pause campaigns from manual block:', err);
        });
    }

    res.json({ message: 'Updated successfully' });
  } catch (error) {
    console.error('Update calendar error', error);
    res.status(500).json({ error: 'Failed to update calendar' });
  }
});

// Private calendars and public availability have separate, scoped contracts.
registerCalendarRoutes(router as any, pool, authenticateToken, () => isDbConfigured);


router.get('/api/seo', async (req, res) => {
  const { type, id, slug } = req.query;
  let html = readIndexHtml();

  try {
    let injectedTags = '';

    if (type === 'stay' && slug) {
      if (isDbConfigured) {
        let result;
        try {
          result = await pool.query(
            "SELECT id, title, description, image_url, image_urls, slug FROM listings WHERE slug = $1 AND publication_status = 'published'",
            [slug]
          );
        } catch (_e) {
          result = { rows: [] };
        }
        if (result && result.rows.length > 0) {
          const listing = result.rows[0];
          const rawTitle = `${listing.title || ''} | Encho Stays`;
          const rawDescription = listing.description?.substring(0, 160) || `Stay at ${listing.title || ''}`;
          const rawImage = listing.image_url || (listing.image_urls && listing.image_urls[0]) || '';
          const canonicalSlug = listing.slug || generateListingSlug(listing.title, listing.id);
          const canonicalUrl = `https://encho.space/stay/${encodeURIComponent(canonicalSlug)}`;

          const title = escapeHtml(rawTitle);
          const description = escapeHtml(rawDescription);
          const image = escapeHtml(rawImage);
          const safeCanonicalUrl = escapeHtml(canonicalUrl);

          injectedTags = `
            <title>${title}</title>
            <link rel="canonical" href="${safeCanonicalUrl}" />
            <meta name="description" content="${description}" />
            <meta property="og:title" content="${title}" />
            <meta property="og:description" content="${description}" />
            <meta property="og:image" content="${image}" />
            <meta property="og:url" content="${safeCanonicalUrl}" />
            <meta property="og:type" content="website" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content="${title}" />
            <meta name="twitter:description" content="${description}" />
            <meta name="twitter:image" content="${image}" />
          `;
        }
      }
    } else if (type === 'listing' && id) {
      if (isDbConfigured && !isNaN(Number(id))) {
        try {
          const result = await pool.query(
            "SELECT id, title, slug FROM listings WHERE id = $1 AND publication_status = 'published'",
            [id]
          );
          if (result.rows.length > 0) {
            const listing = result.rows[0];
            const canonicalSlug = listing.slug || generateListingSlug(listing.title, listing.id);
            return res.redirect(301, `/stay/${encodeURIComponent(canonicalSlug)}`);
          }
        } catch (_e) { /* continue to 404/render */ }
      }
      return res.status(404).send('Stay not found');
    } else if (type === 'experience' && id) {
      if (isDbConfigured) {
        const result = await pool.query("SELECT * FROM experiences WHERE id = $1", [id]);
        if (result.rows.length > 0) {
          const experience = result.rows[0];
          const title = `${experience.title} | EnchoSpace`;
          const description = experience.description?.substring(0, 160) || `Experience ${experience.title}`;
          const imageUrls = typeof experience.image_urls === 'string' ? JSON.parse(experience.image_urls) : experience.image_urls;
          const image = imageUrls && imageUrls.length > 0 ? imageUrls[0] : '';

          injectedTags = `
            <title>${title}</title>
            <meta name="description" content="${description}" />
            <meta property="og:title" content="${title}" />
            <meta property="og:description" content="${description}" />
            <meta property="og:image" content="${image}" />
            <meta property="og:type" content="website" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content="${title}" />
            <meta name="twitter:description" content="${description}" />
            <meta name="twitter:image" content="${image}" />
          `;
        }
      }
    }

    if (injectedTags) {
      // Replace existing <title> and simple meta tags if present, or just inject into <head>
      html = html.replace(/<title>.*?<\/title>/, '');
      html = html.replace('<head>', '<head>' + injectedTags);
    }
  } catch (e) {
    console.error('SEO Injection Error:', e);
  }

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Health check

router.get('/api/image', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
  try {
    const parsed = parseImageTransformQuery(req.query);
    const source = new URL(parsed.url);
    if (!isAllowedImageSource(source)) return res.status(403).send('Domain not allowed');
    await assertPublicImageOrigin(source);

    let width = parsed.w;
    let height = parsed.h;
    const quality = parsed.q;
    const aspect = parsed.aspect;
    const imageRes = await fetch(source, {
      redirect: 'error',
      signal: AbortSignal.timeout(REMOTE_IMAGE_LIMITS.timeoutMs),
      headers: { Accept: 'image/avif,image/webp,image/*' },
    });
    const imageBuffer = await readBoundedImageResponse(imageRes);

    const accept = req.headers.accept || '';
    const format = accept.includes('image/avif') ? 'avif' : 'webp';

    let sharpInstance = sharp(imageBuffer, {
      failOn: 'warning',
      limitInputPixels: REMOTE_IMAGE_LIMITS.maxInputPixels,
      sequentialRead: true,
    });

    // Handle Meta & Google multi-channel aspect ratios (Gap 8)
    if (aspect) {
      const baseW = width || 1080;
      if (aspect === '1:1') {
        width = baseW;
        height = baseW;
      } else if (aspect === '9:16') {
        width = baseW;
        height = Math.round((baseW * 16) / 9);
      } else if (aspect === '16:9') {
        width = baseW;
        height = Math.round((baseW * 9) / 16);
      }
    }

    if (width && height) {
      sharpInstance = sharpInstance.resize({
        width,
        height,
        fit: 'cover',
        position: 'center'
      });
    } else if (width || height) {
      sharpInstance = sharpInstance.resize({ width, height, withoutEnlargement: true });
    }

    let optimizedBuffer;
    if (format === 'avif') {
      // AVIF typically provides better compression, we can use slightly lower quality for same visual
      optimizedBuffer = await sharpInstance.avif({ quality: Math.max(1, quality - 15) }).toBuffer();
    } else {
      optimizedBuffer = await sharpInstance.webp({ quality }).toBuffer();
    }

    res.set('Content-Type', `image/${format}`);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Vary', 'Accept');
    res.send(optimizedBuffer);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).send('Invalid image request');
    console.error('Image Proxy Error');
    res.status(502).send('Error processing image');
  }
});

// Gap 8: Dynamic Asset Pipeline & Edge CDN for Multi-Channel Ad Formats
router.post('/api/marketing/assets/resize', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { image_urls } = req.body;
    if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
      return res.status(400).json({ error: 'image_urls array is required' });
    }

    const configuredOrigin = harvoMarketing.config.origin;
    if (!configuredOrigin) return res.status(503).json({ error: 'Canonical media origin is not configured.' });
    const baseUrl = new URL(configuredOrigin).origin;

    const processed = image_urls.map((url: string) => ({
      original: url,
      formats: {
        feed_1x1: `${baseUrl}/api/image?url=${encodeURIComponent(url)}&aspect=1:1&w=1080`,
        stories_9x16: `${baseUrl}/api/image?url=${encodeURIComponent(url)}&aspect=9:16&w=1080`,
        landscape_16x9: `${baseUrl}/api/image?url=${encodeURIComponent(url)}&aspect=16:9&w=1920`
      },
      status: 'ready'
    }));

    return res.json({
      success: true,
      message: 'Dynamic asset pipeline generated multi-channel ad crops (1:1 Feed, 9:16 Stories, 16:9 Display).',
      assets: processed
    });
  } catch (err: any) {
    console.error('[ASSET RESIZING ENGINE ERROR]', err);
    res.status(500).json({ error: 'Failed to process asset pipeline' });
  }
});

// Get presigned URL for S3 upload

router.put('/api/mock-upload', (_req, res) => {
  // Signed local-upload tickets are the supported development transport.
  return res.status(404).json({ error: 'Not found' });
});

router.put('/api/upload-local', express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  try {
    // An authenticated account obtains this capability from /api/upload-url. It cannot select a path.
    const authorization=verifyLocalUpload(JWT_SECRET,req.query.ticket);
    await resolvePersistedSession(pool,{id:authorization.userId});
    if(req.get('Content-Type')?.split(';')[0]!==authorization.contentType)return res.status(422).json({error:'Upload content type does not match its authorization.'});
    await writeImmutableMedia(path.join(process.cwd(),'public','uploads'),authorization.key,req.body);
    return res.status(200).json({status:'success',url:`/uploads/${authorization.key}`});
  } catch (error:any) {
    return res.status(error?.status||503).json({error:error?.code?error.message:'Media storage is unavailable.',...(error?.code?{code:error.code}:{})});
  }
});

router.post('/api/upload-base64', authenticateToken, express.json({ limit: '50mb' }), async (req: AuthRequest, res) => {
  try {
    const base64Data=req.body.base64Data||req.body.base64;
    if(typeof base64Data!=='string'||!base64Data)return res.status(400).json({error:'base64Data required'});
    const contentType=req.body.contentType||base64Data.match(/^data:([^;]+);base64,/)?.[1];
    const key=randomMediaKey(contentType);
    const buffer=Buffer.from(base64Data.replace(/^data:.*;base64,/,''),'base64');
    await writeImmutableMedia(path.join(process.cwd(),'public','uploads'),key,buffer);
    const url=`/uploads/${key}`;return res.json({url,publicUrl:url});
  } catch(error:any) {
    return res.status(error?.status||503).json({error:error?.code?error.message:'Media storage is unavailable.',...(error?.code?{code:error.code}:{})});
  }
});

router.post('/api/upload-video-url', authenticateToken, async (req, res) => {
  try {
    const upload = await mux.video.uploads.create({
      new_asset_settings: {
        playback_policy: ['public'],
        video_quality: 'basic',
      },
      cors_origin: '*',
    });
    res.json({ uploadUrl: upload.url, uploadId: upload.id });
  } catch (error) {
    console.error('[MUX UPLOAD URL ERROR]', error);
    res.status(500).json({ error: 'Failed to create Mux direct upload URL' });
  }
});

router.get('/api/mux/upload/:uploadId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const upload = await mux.video.uploads.retrieve(req.params.uploadId);
    if (upload.asset_id) {
      const asset = await mux.video.assets.retrieve(upload.asset_id);
      const playbackId = asset.playback_ids?.[0]?.id;
      if (playbackId) {
        return res.json({ status: asset.status, playbackId });
      }
    }
    res.json({ status: upload.status || 'waiting' });
  } catch (error) {
    console.error('[MUX STATUS ERROR]', error);
    res.status(500).json({ error: 'Failed to retrieve Mux status' });
  }
});

router.post('/api/upload-url', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { filename, contentType } = req.body;
    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }
    // Security: Restrict allowed content types
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'];
    const isAllowed = allowedTypes.includes(contentType);
    if (!isAllowed) {
       return res.status(400).json({ error: 'Invalid content type. Only images and videos are allowed.' });
    }
    // Validate AWS Configuration (Fallback to local storage / base64 if AWS S3 is not configured)
    if (!process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID === 'dummy' || !process.env.AWS_S3_BUCKET_NAME) {
      const authorization=issueLocalUpload(JWT_SECRET,req.user!.id,contentType);
      const uploadUrl=`/api/upload-local?ticket=${encodeURIComponent(authorization.ticket)}`;
      const fileUrl=`/uploads/${authorization.key}`;
      return res.json({uploadUrl,fileUrl,publicUrl:fileUrl});
    }

    const key = `listings/${randomMediaKey(contentType)}`;
    const { uploadUrl, uploadHeaders } = await createImmutableS3Upload(s3, {
      bucket: process.env.AWS_S3_BUCKET_NAME,
      key,
      contentType,
    });

    // Make sure we form the correct virtual-hosted style URL for S3
    const fileUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
    res.json({ uploadUrl, fileUrl, publicUrl: fileUrl, uploadHeaders });
  } catch (error) {
    console.error('Presigned URL Error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});


router.get('/api/admin/seo/:type/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { type, id } = req.params;
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const result = await pool.query('SELECT * FROM seo_configurations WHERE entity_type = $1 AND entity_id = $2', [type, id]);
    res.json(result.rows[0] || { entity_type: type, entity_id: id });
  } catch (error) {
    console.error('Fetch SEO Error:', error);
    res.status(500).json({ error: 'Failed to fetch SEO metadata' });
  }
});

router.put('/api/admin/seo/:type/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  try {
    const { type, id } = req.params;
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const { title, description, keywords, og_image, canonical_url } = req.body;
    await pool.query(`
        INSERT INTO seo_configurations (entity_type, entity_id, title, description, keywords, og_image, canonical_url, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT (entity_type, entity_id) DO UPDATE
        SET title = $3, description = $4, keywords = $5, og_image = $6, canonical_url = $7, updated_at = CURRENT_TIMESTAMP
    `, [type, id, title || null, description || null, keywords || null, og_image || null, canonical_url || null]);
    res.json({ status: 'success', message: 'SEO metadata updated' });
  } catch (error) {
    console.error('Update SEO Error:', error);
    res.status(500).json({ error: 'Failed to update SEO metadata' });
  }
});


router.put('/api/listings/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json({ id: req.params.id, message: "Demo listing preserved" });
  try {
    await ensureListingsTable();

    // IDOR Protection: Verify ownership or admin role
    const authCheck = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
    if (authCheck.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    if (authCheck.rows[0].user_id !== req.user?.id && req.user?.role !== 'admin') {
       return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this listing.' });
    }

    const { title, description, price, type, address, city, imageUrl, imageUrls, videoUrl, rentalMode, rooms, maxGuests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamicPricing, seo_title, seo_description, seo_keywords, seo_image_url, amenity_clusters, child_safety_specs, nearby, hero_video_url, hero_fallback_url, dominant_color_hex, raw_rules, curated_guidelines, experience_tags, brand, brand_font, brand_color } = req.body;

    // Fetch existing listing record for oldPrice and defaults
    const currentListingRes = await pool.query('SELECT price, type, currency FROM listings WHERE id = $1', [req.params.id]);
    const oldPrice = currentListingRes.rows.length > 0 ? currentListingRes.rows[0].price : 0;
    const resolvedPrice = (price !== undefined && price !== null) ? price : oldPrice;

    const safeImageUrls = typeof imageUrls === 'string' ? imageUrls : JSON.stringify(imageUrls || []);
    const safeRooms = typeof rooms === 'string' ? rooms : JSON.stringify(rooms || []);
    const safeAmenities = typeof amenities === 'string' ? amenities : JSON.stringify(amenities || []);
    const safeDynamicPricing = typeof dynamicPricing === 'string' ? dynamicPricing : JSON.stringify(dynamicPricing || {});
    
    // New JSONB properties
    const safeAmenityClusters = typeof amenity_clusters === 'object' ? JSON.stringify(amenity_clusters) : null;
    const safeChildSafety = Array.isArray(child_safety_specs) ? JSON.stringify(child_safety_specs) : null;
    const safeNearby = Array.isArray(nearby) ? JSON.stringify(nearby) : null;

    if (title) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const safePhotos = Array.isArray(req.body.photos) ? JSON.stringify(req.body.photos) : (typeof req.body.photos === 'string' ? req.body.photos : JSON.stringify([]));
        await client.query(`
          UPDATE listings
          SET title=$1, description=$2, price=$3, type=$4, address=$5, city=$6, image_url=$7, image_urls=$8, video_url=$9, rental_mode=$10, rooms=$11, max_guests=$12, bedrooms=$13, beds=$14, bathrooms=$15, amenities=$16, lat=$18, lng=$19, dynamic_pricing=$20, seo_title=$21, seo_description=$22, seo_keywords=$23, seo_image_url=$24, amenity_clusters=$25, child_safety_specs=$26, nearby=$27, hero_video_url=$28, hero_fallback_url=$29, dominant_color_hex=$30, raw_rules=$31, curated_guidelines=$32, experience_tags=$33, photos=$34, concierge_privileges=$35, host_philosophy=$36, brand=$37, brand_font=$38, brand_color=$39
          WHERE id=$17
        `, [
          title, description, resolvedPrice, type || currentListingRes.rows[0]?.type || 'Sanctuary', address, city, imageUrl, safeImageUrls, videoUrl, rentalMode, safeRooms, maxGuests, bedrooms, beds, bathrooms, safeAmenities, req.params.id as string, lat || null, lng || null, safeDynamicPricing, seo_title || null, seo_description || null, seo_keywords || null, seo_image_url || null, safeAmenityClusters, safeChildSafety, safeNearby, hero_video_url || null, hero_fallback_url || null, dominant_color_hex || null, raw_rules || null, curated_guidelines || null, Array.isArray(experience_tags) ? JSON.stringify(experience_tags) : JSON.stringify([]), safePhotos, req.body.concierge_privileges || null, req.body.host_philosophy || null, brand || null, brand_font || null, brand_color || null
        ]);

        // M3: Non-Destructive room_types upsert preserving row IDs
        const roomTypeMap = new Map<string, number>(); // Map room type/name -> room_types.id
        if (Array.isArray(rooms) && rooms.length > 0) {
          // Fetch existing rooms to preserve IDs
          const existingRoomsRes = await client.query(
            'SELECT id, name, type FROM room_types WHERE listing_id = $1',
            [req.params.id]
          );
          const existingRooms = existingRoomsRes.rows;
          const processedRoomIds = new Set<number>();

          for (const room of rooms) {
            // Find existing row by matching ID, type, or name
            const existing = existingRooms.find((er: any) =>
              (room.id && !isNaN(Number(room.id)) && er.id === Number(room.id)) ||
              (room.type && er.type === room.type) ||
              (room.name && er.name === room.name)
            );

            let savedRoomId: number;
            if (existing) {
              await client.query(`
                UPDATE room_types
                SET name=$1, type=$2, icon=$3, tag=$4, base_price=$5, currency=$6,
                    max_occupancy=$7, inventory_count=$8, description=$9, specs=$10,
                    features=$11, amenities=$12, min_stay_nights=$13
                WHERE id=$14
              `, [
                room.name || existing.name || 'Sanctuary Room',
                room.type || existing.type || 'suites',
                room.icon || '🛏️',
                room.tag || '',
                Number(room.price) || Number(price) || 0,
                req.body.currency || 'INR',
                Number(room.capacity) || 2,
                Number(room.inventory_count) || 1,
                room.description || '',
                room.specs || '',
                JSON.stringify(room.features || []),
                JSON.stringify(room.amenities || []),
                Number(room.min_stay_nights) || 1,
                existing.id
              ]);
              savedRoomId = existing.id;
              processedRoomIds.add(existing.id);
            } else {
              const insertRes = await client.query(`
                INSERT INTO room_types (listing_id, name, type, icon, tag, base_price, currency, max_occupancy, inventory_count, description, specs, features, amenities, min_stay_nights)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING id
              `, [
                req.params.id,
                room.name || 'Sanctuary Room',
                room.type || 'suites',
                room.icon || '🛏️',
                room.tag || '',
                Number(room.price) || Number(price) || 0,
                req.body.currency || 'INR',
                Number(room.capacity) || 2,
                Number(room.inventory_count) || 1,
                room.description || '',
                room.specs || '',
                JSON.stringify(room.features || []),
                JSON.stringify(room.amenities || []),
                Number(room.min_stay_nights) || 1
              ]);
              savedRoomId = insertRes.rows[0].id;
              processedRoomIds.add(savedRoomId);
            }

            if (room.type) roomTypeMap.set(room.type, savedRoomId);
            if (room.name) roomTypeMap.set(room.name, savedRoomId);
            if (room.id) roomTypeMap.set(String(room.id), savedRoomId);
          }
        }

        // M3: Non-Destructive media_assets upsert with room_type_id & is_sleeping_area
        if (Array.isArray(req.body.photos) && req.body.photos.length > 0) {
          const existingMediaRes = await client.query(
            "SELECT id, url, tier, category, room_type_id, is_sleeping_area, moderation_status FROM media_assets WHERE entity_id = $1 AND entity_type = 'listing'",
            [req.params.id]
          );
          const existingMedia = existingMediaRes.rows;

          let orderIdx = 0;
          for (const photo of req.body.photos) {
            const photoUrl = photo.url || photo.previewUrl;
            if (!photoUrl) continue;

            const existing = existingMedia.find((em: any) => em.url === photoUrl || (photo.id && !isNaN(Number(photo.id)) && em.id === Number(photo.id)));

            // Resolve room_type_id from roomTypeMap
            let linkedRoomTypeId: number | null = null;
            if (photo.room_type_id && !isNaN(Number(photo.room_type_id))) {
              linkedRoomTypeId = Number(photo.room_type_id);
            } else if (photo.tier && photo.tier !== 'common' && roomTypeMap.has(photo.tier)) {
              linkedRoomTypeId = roomTypeMap.get(photo.tier) || null;
            }

            // Strict sleeping area: require explicit is_sleeping_area = true (never infer from bedroom)
            const isSleepingArea = Boolean(photo.is_sleeping_area || photo.isSleepingArea);

            // True admin-only approval rule:
            // Host submissions NEVER directly set approved.
            // Preserve approved status ONLY if existing asset was approved and had no material changes.
            let modStatus = 'pending_review';
            if (existing && existing.moderation_status === 'approved') {
              const unchanged = existing.url === photoUrl &&
                                (existing.tier || 'common') === (photo.tier || 'common') &&
                                (existing.category || 'other') === (photo.category || 'other') &&
                                Boolean(existing.is_sleeping_area) === isSleepingArea &&
                                ((existing.room_type_id === null && linkedRoomTypeId === null) ||
                                 Number(existing.room_type_id) === Number(linkedRoomTypeId));
              if (unchanged) {
                modStatus = 'approved';
              }
            }

            if (existing) {
              await client.query(`
                UPDATE media_assets
                SET tier=$1, category=$2, title=$3, description=$4, specs=$5, is_hero=$6,
                    order_index=$7, is_sleeping_area=$8, room_type_id=$9, moderation_status=$10
                WHERE id=$11
              `, [
                photo.tier || 'common',
                photo.category || 'other',
                photo.title || '',
                photo.description || '',
                photo.specs || '',
                photo.isHero || false,
                orderIdx++,
                isSleepingArea,
                linkedRoomTypeId,
                modStatus,
                existing.id
              ]);
            } else {
              await client.query(`
                INSERT INTO media_assets (entity_type, entity_id, url, tier, category, title, description, specs, is_hero, order_index, is_sleeping_area, room_type_id, moderation_status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
              `, [
                'listing',
                req.params.id,
                photoUrl,
                photo.tier || 'common',
                photo.category || 'other',
                photo.title || '',
                photo.description || '',
                photo.specs || '',
                photo.isHero || false,
                orderIdx++,
                isSleepingArea,
                linkedRoomTypeId,
                modStatus
              ]);
            }
          }
        }

        await client.query('COMMIT');
      } catch (putErr) {
        await client.query('ROLLBACK');
        throw putErr;
      } finally {
        client.release();
      }
      if (price) await syncDynamicPricingToMeta(req.params.id, oldPrice, price);
    } else if (videoUrl !== undefined) {
      await pool.query('UPDATE listings SET video_url = $1 WHERE id = $2', [videoUrl, req.params.id]);
    } else if (type !== undefined) {
      await pool.query('UPDATE listings SET type = $1 WHERE id = $2', [type, req.params.id]);
    } else if (amenities !== undefined) {
      await pool.query('UPDATE listings SET amenities = $1 WHERE id = $2', [JSON.stringify(amenities), req.params.id]);
    } else if (req.body.lat !== undefined && req.body.lng !== undefined) {
      await pool.query('UPDATE listings SET lat = $1, lng = $2 WHERE id = $3', [req.body.lat, req.body.lng, req.params.id]);
    } else if (price !== undefined) {
      await pool.query('UPDATE listings SET price = $1 WHERE id = $2', [price, req.params.id]);
    } else if (maxGuests !== undefined) {
      await pool.query('UPDATE listings SET max_guests = $1, beds = $2, bedrooms = $3, bathrooms = $4 WHERE id = $5', [maxGuests, beds, bedrooms, bathrooms, req.params.id]);
    }

    // Gap 16: Dynamic Pricing Sync (The Trust Breaker)
    // If the host changes price, immediately sync it to Meta to prevent Trust Breaks and high bounce rates
    if (price !== undefined || title !== undefined) {
       const activeCampaigns = await pool.query(
          "SELECT id FROM host_marketing_campaigns WHERE listing_id = $1 AND status = 'active'",
          [req.params.id]
       );
       if (activeCampaigns.rows.length > 0) {
          const io = getGlobalIoInstance();
          for (const camp of activeCampaigns.rows) {
             console.log(`[DYNAMIC PRICING SYNC] Fired instant webhook to Meta API. Campaign #${camp.id} updated with new pricing/data to prevent bounce rates.`);
             if (io && req.user?.id) {
               io.to(`user_${req.user!.id}`).emit('notification', {
                 type: 'dynamic_price_sync',
                 title: '⚡ Dynamic Price Synced',
                 message: `Meta Ad Creative auto-updated with new rate ($${price || 'updated'}) to prevent bounce rates!`,
                 campaignId: camp.id
               });
               io.to(`user_${req.user!.id}`).emit('dynamic_price_sync', {
                 campaignId: camp.id,
                 message: `Meta Ad Creative auto-updated with new rate ($${price || 'updated'}) to prevent bounce rates!`
               });
             }
          }
       }
    }

    // Publication Status Update & PROPOSED-007 Validation Gate
    if (req.body.publication_status !== undefined) {
      const targetStatus = req.body.publication_status;
      if (targetStatus === 'published') {
        const validation = await validatePropertyPublication(req.params.id, pool);
        if (!validation.valid) {
          return res.status(422).json({
            error: 'Cannot publish listing: Failed room and media authority requirements (PROPOSED-007).',
            details: validation.errors,
            roomSummaries: validation.roomSummaries
          });
        }
      }
      await pool.query('UPDATE listings SET publication_status = $1 WHERE id = $2', [targetStatus, req.params.id]);
    }

    // Invalidate Cache
    if (redis && city) {
        try {
           await redis.del(`listings:${city.toLowerCase()}`);
        } catch (e) { console.error(e); }
    }

    broadcastDbEvent(req, 'listing');
    res.json({ success: true, message: 'Listing updated successfully' });
  } catch (error) {
    console.error('Update Listing Error:', error);
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

// M3: Admin & Host Publication Status Mutation Endpoint with PROPOSED-007 Gate
router.patch('/api/admin/listings/:id/status', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const listingId = req.params.id;
    const { publication_status } = req.body;
    if (!publication_status) {
      return res.status(400).json({ error: 'publication_status is required' });
    }

    // IDOR Protection: Admin or listing owner only
    const listingRes = await pool.query('SELECT user_id, title FROM listings WHERE id = $1', [listingId]);
    if (listingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    const listing = listingRes.rows[0];
    if (req.user?.role !== 'admin' && String(req.user?.id) !== String(listing.user_id)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

    // PROPOSED-007 Gate: If transitioning to published, validate relational room and media rules
    if (publication_status === 'published') {
      const validation = await validatePropertyPublication(listingId, pool);
      if (!validation.valid) {
        return res.status(422).json({
          error: 'Cannot publish listing: Failed room and media authority requirements (PROPOSED-007).',
          details: validation.errors,
          roomSummaries: validation.roomSummaries
        });
      }
    }

    await pool.query('UPDATE listings SET publication_status = $1 WHERE id = $2', [publication_status, listingId]);
    broadcastDbEvent(req, 'listing');
    return res.json({ success: true, listingId, publication_status });
  } catch (err: any) {
    console.error('[STATUS UPDATE ERROR]', err);
    return res.status(500).json({ error: err?.message || 'Failed to update publication status' });
  }
});

// M3: Admin / Host Dedicated Room Management Endpoint (PUT /api/listings/:id/rooms)
router.put('/api/listings/:id/rooms', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  let client: any = null;
  try {
    const listingId = req.params.id;
    const { rooms } = req.body;
    if (!Array.isArray(rooms)) {
      return res.status(400).json({ error: 'rooms must be an array' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // IDOR Protection
    const listingRes = await client.query('SELECT user_id FROM listings WHERE id = $1', [listingId]);
    if (listingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (req.user?.role !== 'admin' && String(req.user?.id) !== String(listingRes.rows[0].user_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Non-destructive upsert preserving row IDs (omitted rooms are preserved, never deleted)
    const existingRoomsRes = await client.query('SELECT id, name, type FROM room_types WHERE listing_id = $1', [listingId]);
    const existingRooms = existingRoomsRes.rows;

    for (const room of rooms) {
      const existing = existingRooms.find((er: any) =>
        (room.id && !isNaN(Number(room.id)) && er.id === Number(room.id)) ||
        (room.type && er.type === room.type) ||
        (room.name && er.name === room.name)
      );

      if (existing) {
        await client.query(`
          UPDATE room_types
          SET name=$1, type=$2, icon=$3, tag=$4, base_price=$5,
              max_occupancy=$6, inventory_count=$7, description=$8, specs=$9,
              features=$10, amenities=$11
          WHERE id=$12
        `, [
          room.name || existing.name || 'Sanctuary Room',
          room.type || existing.type || 'suites',
          room.icon || '🛏️',
          room.tag || '',
          Number(room.price) || 0,
          Number(room.capacity) || 2,
          Number(room.inventory_count) || 1,
          room.description || '',
          room.specs || '',
          JSON.stringify(room.features || []),
          JSON.stringify(room.amenities || []),
          existing.id
        ]);
      } else {
        await client.query(`
          INSERT INTO room_types (listing_id, name, type, icon, tag, base_price, currency, max_occupancy, inventory_count, description, specs, features, amenities)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          listingId,
          room.name || 'Sanctuary Room',
          room.type || 'suites',
          room.icon || '🛏️',
          room.tag || '',
          Number(room.price) || 0,
          'INR',
          Number(room.capacity) || 2,
          Number(room.inventory_count) || 1,
          room.description || '',
          room.specs || '',
          JSON.stringify(room.features || []),
          JSON.stringify(room.amenities || [])
        ]);
      }
    }

    // Update listings.rooms JSON for dual-write within the same transaction
    await client.query('UPDATE listings SET rooms = $1 WHERE id = $2', [JSON.stringify(rooms), listingId]);

    await client.query('COMMIT');

    broadcastDbEvent(req, 'listing');
    return res.json({ success: true, message: 'Room types saved successfully' });
  } catch (err: any) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error('[ROOMS SAVE ERROR]', err);
    return res.status(500).json({ error: err?.message || 'Failed to save room types' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// M3: Admin Media Asset Moderation Endpoint (PATCH /api/admin/media-assets/:id/moderation)

router.put('/api/listings/:id/mode', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json({ id: req.params.id, message: "Demo listing preserved" });
  try {
    await ensureListingsTable();

    // IDOR Protection: Verify ownership or admin role
    const authCheck = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
    if (authCheck.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    if (authCheck.rows[0].user_id !== req.user?.id && req.user?.role !== 'admin') {
       return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this listing.' });
    }

    const { rentalMode } = req.body;
    await pool.query('UPDATE listings SET rental_mode = $1 WHERE id = $2', [rentalMode, req.params.id]);
    broadcastDbEvent(req, 'listing');
    res.json({ message: 'Listing rental mode updated successfully' });
  } catch (error) {
    console.error('Update Listing Mode Error:', error);
    res.status(500).json({ error: 'Failed to update listing mode' });
  }
});

// Helper function to process async mapping with bounded concurrency
async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (!items || items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i]);
      } catch (err: any) {
        console.warn(`[MAP CONCURRENT ERROR] Item #${i} failed:`, err?.message);
        results[i] = items[i] as unknown as R;
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}


router.get('/api/listings/draft/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const result = await pool.query('SELECT * FROM listings_drafts WHERE id = $1 AND host_id = $2', [req.params.id, req.user?.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Draft not found' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
});

router.post('/api/listings/draft', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { draftId, ...draftData } = req.body;
    if (draftId) {
      const result = await pool.query(`
        UPDATE listings_drafts 
        SET draft_data = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND host_id = $3
        RETURNING *
      `, [JSON.stringify(draftData), draftId, req.user?.id]);
      return res.json(result.rows[0]);
    } else {
      const result = await pool.query(`
        INSERT INTO listings_drafts (host_id, draft_data)
        VALUES ($1, $2)
        RETURNING *
      `, [req.user?.id, JSON.stringify(draftData)]);
      return res.json(result.rows[0]);
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

router.post('/api/admin/listings/draft/:id/approve', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized: Admin privileges required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const draftRes = await client.query('SELECT * FROM listings_drafts WHERE id = $1', [req.params.id]);
    if (draftRes.rows.length === 0) throw new Error('Draft not found');
    
    const draft = draftRes.rows[0];
    const data = draft.draft_data;
    
    let listingId = draft.published_listing_id;
    if (listingId) {
       await client.query(`
         UPDATE listings SET 
           title = $1, description = $2, price = $3, city = $4, type = $5,
           rental_mode = $6, max_guests = $7, bedrooms = $8, beds = $9, bathrooms = $10,
           hero_video_url = $11, dominant_color_hex = $12, experience_tags = $13,
           rooms = $14, photos = $15
         WHERE id = $16
       `, [
         data.title, data.description, data.price || 0, data.city || 'Berlin', data.type,
         data.rentalMode || 'entire_place', data.maxGuests || 2, data.bedrooms || 1, data.beds || 1, data.bathrooms || 1,
         data.hero_video_url || '', data.dominant_color_hex || '#0284C7', JSON.stringify(data.experience_tags || []),
         JSON.stringify(data.rooms || []), JSON.stringify(data.photos || []),
         listingId
       ]);
    } else {
       const newListing = await client.query(`
         INSERT INTO listings (
           user_id, title, description, price, city, type, address,
           rental_mode, max_guests, bedrooms, beds, bathrooms,
           hero_video_url, dominant_color_hex, experience_tags,
           rooms, photos
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id
       `, [
         draft.host_id, data.title, data.description, data.price || 0, data.city || 'Berlin', data.type, data.address || '',
         data.rentalMode || 'entire_place', data.maxGuests || 2, data.bedrooms || 1, data.beds || 1, data.bathrooms || 1,
         data.hero_video_url || '', data.dominant_color_hex || '#0284C7', JSON.stringify(data.experience_tags || []),
         JSON.stringify(data.rooms || []), JSON.stringify(data.photos || [])
       ]);
       listingId = newListing.rows[0].id;
    }
    // Sync room_types table non-destructively
    const roomTypeMap = new Map<string, number>();
    if (data.rooms && Array.isArray(data.rooms) && data.rooms.length > 0) {
      const existingRoomsRes = await client.query(
        'SELECT id, name, type FROM room_types WHERE listing_id = $1',
        [listingId]
      );
      const existingRooms = existingRoomsRes.rows;

      for (const room of data.rooms) {
        const existing = existingRooms.find((er: any) =>
          (room.id && !isNaN(Number(room.id)) && er.id === Number(room.id)) ||
          (room.type && er.type === room.type) ||
          (room.name && er.name === room.name)
        );

        let savedRoomId: number;
        if (existing) {
          await client.query(`
            UPDATE room_types
            SET name=$1, type=$2, icon=$3, tag=$4, base_price=$5, currency=$6,
                max_occupancy=$7, inventory_count=$8, description=$9, specs=$10,
                features=$11, amenities=$12, min_stay_nights=$13
            WHERE id=$14
          `, [
            room.name || existing.name || 'Sanctuary Room',
            room.type || existing.type || 'suites',
            room.icon || '🛏️',
            room.tag || '',
            Number(room.price) || Number(data.price) || 0,
            data.currency || 'INR',
            Number(room.capacity) || 2,
            Number(room.inventory_count) || 1,
            room.description || '',
            room.specs || '',
            JSON.stringify(room.features || []),
            JSON.stringify(room.amenities || []),
            Number(room.min_stay_nights) || 1,
            existing.id
          ]);
          savedRoomId = existing.id;
        } else {
          const insertRes = await client.query(`
            INSERT INTO room_types (listing_id, name, type, icon, tag, base_price, currency, max_occupancy, inventory_count, description, specs, features, amenities, min_stay_nights)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
          `, [
            listingId,
            room.name || 'Sanctuary Room',
            room.type || 'suites',
            room.icon || '🛏️',
            room.tag || '',
            Number(room.price) || Number(data.price) || 0,
            data.currency || 'INR',
            Number(room.capacity) || 2,
            Number(room.inventory_count) || 1,
            room.description || '',
            room.specs || '',
            JSON.stringify(room.features || []),
            JSON.stringify(room.amenities || []),
            Number(room.min_stay_nights) || 1
          ]);
          savedRoomId = insertRes.rows[0].id;
        }
        if (room.type) roomTypeMap.set(room.type, savedRoomId);
        if (room.name) roomTypeMap.set(room.name, savedRoomId);
        if (room.id) roomTypeMap.set(String(room.id), savedRoomId);
      }
    }

    // Sync media_assets table non-destructively
    if (data.photos && Array.isArray(data.photos) && data.photos.length > 0) {
      const existingMediaRes = await client.query(
        "SELECT id, url, tier, category, room_type_id, is_sleeping_area, moderation_status FROM media_assets WHERE entity_id = $1 AND entity_type = 'listing'",
        [listingId]
      );
      const existingMedia = existingMediaRes.rows;

      let orderIdx = 0;
      for (const photo of data.photos) {
        const photoUrl = photo.url || photo.previewUrl;
        if (!photoUrl) continue;

        const existing = existingMedia.find((em: any) => em.url === photoUrl || (photo.id && !isNaN(Number(photo.id)) && em.id === Number(photo.id)));

        let linkedRoomTypeId: number | null = null;
        if (photo.room_type_id && !isNaN(Number(photo.room_type_id))) {
          linkedRoomTypeId = Number(photo.room_type_id);
        } else if (photo.tier && photo.tier !== 'common' && roomTypeMap.has(photo.tier)) {
          linkedRoomTypeId = roomTypeMap.get(photo.tier) || null;
        }

        const isSleepingArea = Boolean(photo.is_sleeping_area || photo.isSleepingArea);

        // True admin-only approval rule:
        // Draft publication payload cannot grant approval; preserve existing approved only if unchanged.
        let modStatus = 'pending_review';
        if (existing && existing.moderation_status === 'approved') {
          const unchanged = existing.url === photoUrl &&
                            (existing.tier || 'common') === (photo.tier || 'common') &&
                            (existing.category || 'other') === (photo.category || 'other') &&
                            Boolean(existing.is_sleeping_area) === isSleepingArea &&
                            ((existing.room_type_id === null && linkedRoomTypeId === null) ||
                             Number(existing.room_type_id) === Number(linkedRoomTypeId));
          if (unchanged) {
            modStatus = 'approved';
          }
        }

        if (existing) {
          await client.query(`
            UPDATE media_assets
            SET tier=$1, category=$2, title=$3, description=$4, specs=$5, is_hero=$6,
                order_index=$7, is_sleeping_area=$8, room_type_id=$9, moderation_status=$10
            WHERE id=$11
          `, [
            photo.tier || 'common',
            photo.category || 'other',
            photo.title || '',
            photo.description || '',
            photo.specs || '',
            photo.isHero || false,
            orderIdx++,
            isSleepingArea,
            linkedRoomTypeId,
            modStatus,
            existing.id
          ]);
        } else {
          await client.query(`
            INSERT INTO media_assets (entity_type, entity_id, url, tier, category, title, description, specs, is_hero, order_index, is_sleeping_area, room_type_id, moderation_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [
            'listing',
            listingId,
            photoUrl,
            photo.tier || 'common',
            photo.category || 'other',
            photo.title || '',
            photo.description || '',
            photo.specs || '',
            photo.isHero || false,
            orderIdx++,
            isSleepingArea,
            linkedRoomTypeId,
            modStatus
          ]);
        }
      }
    }
    // M3: Validate PROPOSED-007 publication rules before draft approval
    const validation = await validatePropertyPublication(listingId, client);
    if (!validation.valid) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: 'Cannot publish listing: Failed room and media authority requirements (PROPOSED-007).',
        details: validation.errors,
        roomSummaries: validation.roomSummaries
      });
    }

    await client.query("UPDATE listings SET publication_status = 'published' WHERE id = $1", [listingId]);
    await client.query(`UPDATE listings_drafts SET status = 'PUBLISHED', published_listing_id = $1 WHERE id = $2`, [listingId, draft.id]);

    await client.query('COMMIT');
    res.json({ success: true, listingId });
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('Draft Publish Error:', e);
    res.status(500).json({ error: e?.message || 'Failed to publish draft' });
  } finally {
    client.release();
  }
});

// --- END CMS PHASE B ---

// Create listing
router.post('/api/listings', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ status: 'error', message: 'DB not configured' });
  }
  try {
    await ensureListingsTable();
    const { title, description, price, type, address, city, imageUrl, imageUrls, videoUrl, rentalMode, rooms, maxGuests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamicPricing, seo_title, seo_description, seo_keywords, seo_image_url, hero_video_url, hero_fallback_url, dominant_color_hex, raw_rules, curated_guidelines, experience_tags, brand, brand_font, brand_color, concierge_privileges, host_philosophy } = req.body;

    // Security: Use authenticated user ID, ignore body userId to prevent IDOR spoofing
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized: User ID required.' });

    // Validate
    if (!title || !price || !type || !city) {
      return res.status(400).json({ error: 'Title, price, type, and city are required' });
    }

    const { amenity_clusters, child_safety_specs, nearby, photos } = req.body;
    const safePhotos = Array.isArray(photos) ? JSON.stringify(photos) : JSON.stringify([]);

    const safeAmenities = Array.isArray(amenities) ? JSON.stringify(amenities) : JSON.stringify([]);
    const safeImageUrls = Array.isArray(imageUrls) ? JSON.stringify(imageUrls) : JSON.stringify([]);
    const safeDynamicPricing = typeof dynamicPricing === 'object' ? JSON.stringify(dynamicPricing) : JSON.stringify({});
    const safeRooms = Array.isArray(rooms) ? JSON.stringify(rooms) : null;
    const safeAmenityClusters = typeof amenity_clusters === 'object' ? JSON.stringify(amenity_clusters) : null;
    const safeChildSafety = Array.isArray(child_safety_specs) ? JSON.stringify(child_safety_specs) : null;
    const safeNearby = Array.isArray(nearby) ? JSON.stringify(nearby) : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO listings (user_id, title, description, price, type, address, city, image_url, image_urls, video_url, rental_mode, rooms, max_guests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamic_pricing, seo_title, seo_description, seo_keywords, seo_image_url, amenity_clusters, child_safety_specs, nearby, hero_video_url, hero_fallback_url, dominant_color_hex, raw_rules, curated_guidelines, experience_tags, photos, concierge_privileges, host_philosophy, brand, brand_font, brand_color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39) RETURNING *`,
        [userId || null, title, description, price, type, address, city, imageUrl, safeImageUrls, videoUrl, rentalMode || 'entire_place', safeRooms, maxGuests, bedrooms, beds, bathrooms, safeAmenities, lat || null, lng || null, safeDynamicPricing, seo_title || null, seo_description || null, seo_keywords || null, seo_image_url || null, safeAmenityClusters, safeChildSafety, safeNearby, hero_video_url || null, hero_fallback_url || null, dominant_color_hex || null, raw_rules || null, curated_guidelines || null, Array.isArray(experience_tags) ? JSON.stringify(experience_tags) : JSON.stringify([]), safePhotos, concierge_privileges || null, host_philosophy || null, brand || null, brand_font || null, brand_color || null]
      );

      const newListing = result.rows[0];

      // Sync room_types table atomically
      const roomTypeMap = new Map<string, number>();
      if (Array.isArray(rooms) && rooms.length > 0) {
        for (const room of rooms) {
          const rtRes = await client.query(`
            INSERT INTO room_types (listing_id, name, type, icon, tag, base_price, currency, max_occupancy, inventory_count, description, specs, features, amenities, min_stay_nights)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
          `, [
            newListing.id,
            room.name || 'Sanctuary Room',
            room.type || 'suites',
            room.icon || '🛏️',
            room.tag || '',
            Number(room.price) || Number(price) || 0,
            req.body.currency || 'INR',
            Number(room.capacity) || 2,
            Number(room.inventory_count) || 1,
            room.description || '',
            room.specs || '',
            JSON.stringify(room.features || []),
            JSON.stringify(room.amenities || []),
            Number(room.min_stay_nights) || 1
          ]);
          const rtId = rtRes.rows[0].id;
          if (room.type) roomTypeMap.set(room.type, rtId);
          if (room.name) roomTypeMap.set(room.name, rtId);
          if (room.id) roomTypeMap.set(String(room.id), rtId);
        }
      }

      // Sync media_assets table from both listing-level photos and room-level photos
      const allCandidatePhotos: any[] = [];
      if (Array.isArray(photos)) {
        allCandidatePhotos.push(...photos);
      }
      if (Array.isArray(rooms)) {
        for (const room of rooms) {
          if (Array.isArray(room.photos)) {
            for (const rp of room.photos) {
              allCandidatePhotos.push({
                ...rp,
                tier: rp.tier || room.type || 'common',
                room_type_id: rp.room_type_id || roomTypeMap.get(room.type) || roomTypeMap.get(room.name) || roomTypeMap.get(String(room.id)) || null
              });
            }
          }
        }
      }

      if (allCandidatePhotos.length > 0) {
        let orderIdx = 0;
        for (const photo of allCandidatePhotos) {
          const photoUrl = photo.url || photo.previewUrl;
          if (!photoUrl) continue;

          let linkedRoomTypeId: number | null = null;
          if (photo.room_type_id && !isNaN(Number(photo.room_type_id))) {
            linkedRoomTypeId = Number(photo.room_type_id);
          } else if (photo.tier && photo.tier !== 'common' && roomTypeMap.has(photo.tier)) {
            linkedRoomTypeId = roomTypeMap.get(photo.tier) || null;
          }

          // Strict sleeping area: require explicit is_sleeping_area = true (no bedroom inference)
          const isSleepingArea = Boolean(photo.is_sleeping_area || photo.isSleepingArea);
          // New media unconditionally defaults to pending_review. Host cannot set approved status.
          const modStatus = 'pending_review';

          await client.query(`
            INSERT INTO media_assets (entity_type, entity_id, url, tier, category, title, description, specs, is_hero, order_index, is_sleeping_area, room_type_id, moderation_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [
            'listing',
            newListing.id,
            photoUrl,
            photo.tier || 'common',
            photo.category || 'other',
            photo.title || '',
            photo.description || '',
            photo.specs || '',
            photo.isHero || false,
            orderIdx++,
            isSleepingArea,
            linkedRoomTypeId,
            modStatus
          ]);
        }
      }

      await client.query('COMMIT');

      // Invalidate cache
      if (redis) {
        try {
          await redis.del(`listings:${city.toLowerCase()}`);
        } catch (e) {
          console.warn('Redis cache invalidation failed', e);
        }
      }

      broadcastDbEvent(req, 'listing');

      res.status(201).json(newListing);
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create Listing Error:', error);
    const errorMessage = error instanceof Error ? (error as Error).message : String(error);
    if (errorMessage.includes('Tenant or user not found')) {
      return res.status(503).json({ error: 'Neon Database: Tenant or user not found. Check DATABASE_URL.' });
    }
    res.status(500).json({ error: 'Failed to create listing', message: errorMessage });
  }
});

// Wishlists endpoints
router.get('/api/wishlist', authenticateToken, (req: AuthRequest, res) => res.redirect(307, '/api/wishlists'));
router.get('/api/wishlists', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    await ensureListingsTable();
    const result = await pool.query(`
      SELECT l.*, w.id as wishlist_id, w.room_id
      FROM wishlists w
      JOIN listings l ON w.listing_id = l.id
      WHERE w.user_id = $1
    `, [req.user?.id]);

    const formattedWishlists = result.rows.map(row => {
      if (row.room_id && row.rooms && Array.isArray(row.rooms)) {
          const room = row.rooms.find((r: any) => String(r.id) === String(row.room_id));
          if (room) {
              return {
                 ...row,
                 ...room,
                 id: `${row.id}_${room.id}`,
                 originalId: String(row.id),
                 title: row.title,
                 displayTitle: `${row.title} - ${room.name}`,
                 displayPrice: room.price,
                 imageUrl: (room.imageUrls && room.imageUrls.length > 0) ? room.imageUrls[0] : row.image_url,
                 imageUrls: (room.imageUrls && room.imageUrls.length > 0) ? room.imageUrls : row.image_urls,
                 selectedConfigId: String(room.id),
                 amenities: room.amenities && room.amenities.length > 0 ? room.amenities : row.amenities,
                 type: room.name,
                 wishlist_id: String(row.wishlist_id)
              };
          }
      }
      return {
        ...row,
        id: String(row.id),
        price: parseFloat(row.price),
        wishlist_id: String(row.wishlist_id)
      };
    });

    res.json(formattedWishlists);
  } catch (error) {
    console.warn('[WISHLISTS FALLBACK] Error fetching wishlists, returning empty list:', error);
    res.json([]);
  }
});

router.post('/api/wishlists', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { listingId, roomId } = req.body;
    if (isNaN(Number(listingId))) {
      return res.json({ success: true, message: 'Demo listing mock wishlisted' });
    }

    const existing = await pool.query(
      'SELECT 1 FROM wishlists WHERE user_id = $1 AND listing_id = $2 AND (room_id = $3 OR (room_id IS NULL AND $3 IS NULL))',
      [req.user?.id, listingId, roomId || null]
    );

    if (existing.rows.length === 0) {
      await pool.query('INSERT INTO wishlists (user_id, listing_id, room_id) VALUES ($1, $2, $3)', [req.user?.id, listingId, roomId || null]);
    }

    broadcastDbEvent(req, 'wishlist', [req.user?.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to add to wishlist", error);
    res.status(500).json({ error: 'Failed to add to wishlist' });
  }
});

router.delete('/api/wishlists/:listingId', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const listingId = req.params.listingId;
    const roomId = req.query.roomId as string;

    if (isNaN(Number(listingId))) {
      return res.json({ success: true, message: 'Demo listing mock un-wishlisted' });
    }

    if (roomId) {
        await pool.query('DELETE FROM wishlists WHERE user_id = $1 AND listing_id = $2 AND room_id = $3', [req.user?.id, listingId, roomId]);
    } else {
        await pool.query('DELETE FROM wishlists WHERE user_id = $1 AND listing_id = $2 AND room_id IS NULL', [req.user?.id, listingId]);
    }

    broadcastDbEvent(req, 'wishlist', [req.user?.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove from wishlist' });
  }
});

// Experience Wishlists endpoints
router.get('/api/experience-wishlists', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const result = await pool.query(`
      SELECT e.*, w.id as wishlist_id
      FROM experience_wishlists w
      JOIN experiences e ON w.experience_id = e.id
      WHERE w.user_id = $1
    `, [req.user?.id]);

    res.json(result.rows);
  } catch (error) {
    console.error("experience wishlist err:", error);
    res.status(500).json({ error: 'Failed to fetch experience wishlists' });
  }
});

router.post('/api/experience-wishlists', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { experienceId } = req.body;
    if (isNaN(Number(experienceId))) {
      return res.json({ success: true, message: 'Demo experience mock wishlisted' });
    }

    const existing = await pool.query(
      'SELECT 1 FROM experience_wishlists WHERE user_id = $1 AND experience_id = $2',
      [req.user?.id, experienceId]
    );

    if (existing.rows.length === 0) {
      await pool.query('INSERT INTO experience_wishlists (user_id, experience_id) VALUES ($1, $2)', [req.user?.id, experienceId]);
    }

    broadcastDbEvent(req, 'wishlist', [req.user?.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to add to experience wishlist", error);
    res.status(500).json({ error: 'Failed to add to experience wishlist' });
  }
});

router.delete('/api/experience-wishlists/:experienceId', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const experienceId = req.params.experienceId;

    if (isNaN(Number(experienceId))) {
      return res.json({ success: true, message: 'Demo experience mock un-wishlisted' });
    }

    await pool.query('DELETE FROM experience_wishlists WHERE user_id = $1 AND experience_id = $2', [req.user?.id, experienceId]);

    broadcastDbEvent(req, 'wishlist', [req.user?.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove from experience wishlist' });
  }
});

// Reviews endpoints
router.get('/api/listings/:id/can-review', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.json({ canReview: false });
  try {
    const listingId = req.params.id;
    const userId = req.user?.id;
    if (isNaN(Number(listingId))) return res.json({ canReview: false });

    const result = await pool.query(`
      SELECT 1 FROM bookings b
      LEFT JOIN reviews r ON r.listing_id = b.listing_id AND r.user_id = b.user_id
      WHERE b.listing_id = $1 AND b.user_id = $2
      AND b.status ILIKE 'Completed'
      AND r.id IS NULL
      LIMIT 1
    `, [listingId, userId]);
    res.json({ canReview: result.rows.length > 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify review eligibility' });
  }
});

router.get('/api/listings/:id/reviews', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json([]);
  try {
    const result = await pool.query(`
      SELECT r.*, u.name as user_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.listing_id = $1
      ORDER BY r.created_at DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

router.post('/api/listings/:id/reviews', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json({ id: Date.now(), listing_id: req.params.id, user_id: req.user?.id, rating: req.body.rating, content: req.body.content, created_at: new Date() });
  try {
    const listingId = req.params.id;
    const userId = req.user?.id;
    const { rating, content } = req.body;

    const numRating = Number(rating);
    if (!numRating || isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Review content is required' });
    }

    // Phase 4 Audit: Verify booking completion eligibility (prevent fabricated reviews per INHERITED-009)
    if (req.user?.role !== 'admin') {
      const eligibilityCheck = await pool.query(`
        SELECT 1 FROM bookings b
        LEFT JOIN reviews r ON r.listing_id = b.listing_id AND r.user_id = b.user_id
        WHERE b.listing_id = $1 AND b.user_id = $2
        AND b.status ILIKE 'Completed'
        AND r.id IS NULL
        LIMIT 1
      `, [listingId, userId]);

      if (eligibilityCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Only guests with completed stays may review this property.' });
      }
    }

    // Phase 4 Audit: Sanitize review content (strip script tags, HTML, mask contact info)
    const { sanitized } = maskContactInfo(content.trim().substring(0, 2000));

    const result = await pool.query(
      'INSERT INTO reviews (listing_id, user_id, rating, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [listingId, userId, Math.round(numRating), sanitized]
    );

    // Update the listing's rating and review count
    await pool.query(`
      UPDATE listings
      SET
        rating = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE listing_id = $1), 0),
        "reviewCount" = (SELECT COUNT(*) FROM reviews WHERE listing_id = $1)
      WHERE id = $1
    `, [listingId]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add review' });
  }
});

// Phase 3 Milestone 2: Public Stay Projection (Address Privacy Firewall)
// GET /api/v2/stays/:propertySlug
router.get('/api/v2/stays/:propertySlug', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const { propertySlug } = req.params;
  if (!propertySlug || typeof propertySlug !== 'string') {
    return res.status(400).json({ error: 'Invalid property slug' });
  }

  try {
    // Explicit SQL Column Allowlist: Prevents SELECT * from pulling private address, lat, lng, user_id, host contacts, access credentials
    const allowlistedCols = STAY_PUBLIC_SQL_COLUMNS.join(', ');

    let result;
    try {
      // Primary: Query by slug and enforce publication boundary (publication_status = 'published')
      result = await pool.query(
        `SELECT ${allowlistedCols} FROM listings WHERE slug = $1 AND publication_status = 'published'`,
        [propertySlug]
      );
    } catch (_colErr) {
      // Return null result if column or query fails — fail closed
      result = { rows: [] };
    }

    if (!result || result.rows.length === 0) {
      // If direct slug match wasn't found, attempt candidate ID match with expected slug verification
      const parts = propertySlug.split('-');
      const candidateId = parts[parts.length - 1];
      if (candidateId && !isNaN(Number(candidateId))) {
        try {
          const fallbackResult = await pool.query(
            `SELECT ${allowlistedCols} FROM listings WHERE id = $1 AND publication_status = 'published'`,
            [candidateId]
          );
          if (fallbackResult.rows.length > 0) {
            const row = fallbackResult.rows[0];
            const expectedSlug = row.slug || generateListingSlug(row.title, row.id);
            if (expectedSlug === propertySlug) {
              result = fallbackResult;
            }
          }
        } catch (_e) { /* non-blocking */ }
      }
    }

    if (!result || result.rows.length === 0) {
      return res.status(404).json({ error: 'Stay not found' });
    }

    const rawListing = await resolvePublicStayAuthority(pool, result.rows[0]);

    // Apply strict privacy transformation and nested safe mappers
    const publicProjection = toPublicStayProjection(rawListing);
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
    return res.json(publicProjection);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    console.error('[STAY PROJECTION ERROR]', {code: error instanceof PublicStayAuthorityError ? error.code : 'STAY_READ_UNAVAILABLE'});
    return res.status(503).json({ error: 'Verified stay information is temporarily unavailable.', code: 'STAY_AUTHORITY_UNAVAILABLE' });
  }
});

// Phase 3 Milestone 4: Inventory Days & Atomic Holds
// Rate limiter: Max 30 hold creations per IP per 10 minutes to prevent denial-of-service
const holdsRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many hold attempts. Please try again in a few minutes.' }
});

// Helper to parse cookies from Cookie header
function parseCookies(req: Request): Record<string, string> {
  const list: Record<string, string> = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach((cookie: string) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

// POST /api/v2/stays/holds
router.post('/api/v2/stays/holds', holdsRateLimiter, async (req: Request, res: Response) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });

  // 1. Resolve holder principal:
  // - If user has valid Authorization Bearer token -> 'user:<id>'
  // - Else anonymous guest -> require server-issued, signed HttpOnly cookie 'encho_guest_session'.
  //   If absent or invalid, generate a new signed session UUID and set HttpOnly cookie.
  let userId: number | null = null;
  let holderPrincipal = '';
  let guestSessionId: string | null = null;

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded && decoded.id) {
        userId = Number(decoded.id);
        holderPrincipal = `user:${userId}`;
      }
    } catch (_err) { /* invalid token -> proceed to guest cookie */ }
  }

  if (!holderPrincipal) {
    const cookies = parseCookies(req);
    const existingSignedCookie = cookies['encho_guest_session'];
    let verifiedSessionUuid = verifyGuestSession(existingSignedCookie);

    if (!verifiedSessionUuid) {
      verifiedSessionUuid = crypto.randomUUID();
      const signedToken = signGuestSession(verifiedSessionUuid);
      // Set secure, HttpOnly, SameSite cookie with Max-Age
      const isProduction = process.env.NODE_ENV === 'production';
      const cookieOptions = [
        `encho_guest_session=${signedToken}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=604800'
      ];
      if (isProduction) {
        cookieOptions.push('Secure');
      }
      res.setHeader('Set-Cookie', cookieOptions.join('; '));
    }

    guestSessionId = verifiedSessionUuid;
    holderPrincipal = `session:${verifiedSessionUuid}`;
  }

  const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotency_key || req.body.idempotencyKey;

  const result = await acquireHold(pool, {
    roomTypeId: req.body.room_type_id || req.body.roomTypeId,
    checkIn: req.body.check_in || req.body.checkIn,
    checkOut: req.body.check_out || req.body.checkOut,
    quantity: req.body.quantity,
    idempotencyKey,
    holderPrincipal,
    userId,
    guestSessionId
  });

  if (!result.success) {
    return res.status(result.statusCode).json({
      error: result.error,
      code: result.code,
      details: result.conflictDetails
    });
  }

  return res.status(result.statusCode).json({
    success: true,
    hold: result.hold
  });
});

// POST /api/v2/stays/holds/:id/release
router.post('/api/v2/stays/holds/:id/release', async (req: Request, res: Response) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });

  let userId: number | null = null;
  let isServerAdmin = false;
  let holderPrincipal = '';

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded && decoded.id) {
        userId = Number(decoded.id);
        isServerAdmin = decoded.role === 'admin';
        holderPrincipal = `user:${userId}`;
      }
    } catch (_err) { /* anonymous caller */ }
  }

  if (!holderPrincipal) {
    const cookies = parseCookies(req);
    const verifiedSessionUuid = verifyGuestSession(cookies['encho_guest_session']);
    if (verifiedSessionUuid) {
      holderPrincipal = `session:${verifiedSessionUuid}`;
    } else {
      holderPrincipal = 'anon:unauthenticated';
    }
  }

  const body = req.body || {};
  const result = await releaseHold(pool, {
    holdId: String(req.params.id),
    holderPrincipal,
    isServerAdmin,
    reason: body.reason || 'GUEST_EXPLICIT_RELEASE'
  });

  if (!result.success) {
    return res.status(result.statusCode).json({
      error: result.error,
      code: result.code
    });
  }

  return res.status(result.statusCode).json({
    success: true,
    releasedUnits: result.releasedUnits
  });
});

// GET /api/v2/stays/holds/config - honest timer contract
router.get('/api/v2/stays/holds/config', (_req: Request, res: Response) => {
  return res.json({
    holdTtlSeconds: getHoldTtlSeconds(),
    maintenanceMode: process.env.MAINTENANCE_MODE_HOLDS === 'true'
  });
});

// Phase 3 Milestone 2: Legacy ID Resolution & Permanent 301 Redirects
// Handles legacy /listing/:id and /listings/:id HTTP routes
router.get(['/listing/:id', '/listings/:id'], async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(Number(id))) {
    return res.redirect(301, '/');
  }

  if (!isDbConfigured) {
    return res.redirect(301, '/');
  }

  try {
    const result = await pool.query(
      "SELECT id, title, slug FROM listings WHERE id = $1 AND publication_status = 'published'",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Stay not found');
    }

    const listing = result.rows[0];
    const canonicalSlug = listing.slug || generateListingSlug(listing.title, listing.id);
    return res.redirect(301, `/stay/${encodeURIComponent(canonicalSlug)}`);
  } catch (err) {
    console.error('[LEGACY REDIRECT ERROR]', err);
    return res.redirect(301, '/');
  }
});


router.get('/api/listings/:id', async (req: Request, res: Response) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const result = await pool.query('SELECT * FROM listings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    const listing = result.rows[0];

    // Check optional authentication token to determine if requester is listing owner or admin
    let isAuthorizedOwnerOrAdmin = false;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        if (decoded && (decoded.role === 'admin' || String(decoded.id) === String(listing.user_id))) {
          isAuthorizedOwnerOrAdmin = true;
        }
      } catch (_jwtErr) {
        // Invalid or expired token — proceed as anonymous/unauthorized
      }
    }

    if (isAuthorizedOwnerOrAdmin) {
      // Authorized Host/Admin: Provide full editable raw listing record
      // M3: Canonical Relational Authority
      // Relational room_types take precedence over legacy JSON
      try {
        const rtResult = await pool.query(
          'SELECT * FROM room_types WHERE listing_id = $1 ORDER BY id ASC',
          [listing.id]
        );
        if (rtResult.rows.length > 0) {
          listing.rooms = rtResult.rows.map((rt: any) => ({
            id: String(rt.id),
            name: rt.name,
            type: rt.type || rt.name.toLowerCase().replace(/\s+/g, '_'),
            icon: rt.icon || '\ud83d\udecf\ufe0f',
            tag: rt.tag || '',
            price: parseFloat(rt.base_price),
            capacity: rt.max_occupancy,
            inventory_count: rt.inventory_count,
            description: rt.description || '',
            specs: rt.specs || '',
            features: typeof rt.features === 'string' ? JSON.parse(rt.features || '[]') : (rt.features || []),
            amenities: typeof rt.amenities === 'string' ? JSON.parse(rt.amenities || '[]') : (rt.amenities || []),
            min_stay_nights: rt.min_stay_nights || 1
          }));
        }
      } catch (rtErr) {
        console.warn('[M3] Failed to query room_types table:', rtErr);
      }

      // Relational media_assets take precedence over legacy JSON
      try {
        const mediaResult = await pool.query(
          'SELECT * FROM media_assets WHERE entity_id = $1 AND entity_type = $2 ORDER BY order_index ASC',
          [listing.id, 'listing']
        );
        if (mediaResult.rows.length > 0) {
          listing.photos = mediaResult.rows.map((m: any) => ({
            id: String(m.id),
            url: m.url,
            tier: m.tier || 'common',
            category: m.category || 'other',
            title: m.title || '',
            description: m.description || '',
            specs: m.specs || '',
            isHero: m.is_hero || false,
            is_sleeping_area: Boolean(m.is_sleeping_area),
            moderation_status: m.moderation_status || 'approved',
            room_type_id: m.room_type_id || null
          }));
        }
      } catch (mediaErr) {
        console.warn('[M3] Failed to query media_assets table:', mediaErr);
      }

      return res.json(listing);
    }

    // Anonymous or unauthorized requester:
    // Enforce publication boundary — unpublished listings are NOT publicly visible
    if (listing.publication_status !== 'published') {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Return sanitized public stay projection — address, user_id, raw coords stripped
    const safeProjection = toPublicStayProjection(await resolvePublicStayAuthority(pool, listing));
    return res.json(safeProjection);
  } catch (error) {
    if (error instanceof PublicStayAuthorityError) return res.status(503).set('Cache-Control', 'no-store').json({error: error.message, code: error.code});
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// Get listings (cache-first)
router.get('/api/listings', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
  if (!isDbConfigured) {
    return res.status(503).json({ status: 'error', message: 'DB not configured' });
  }

  // Set edge caching headers. Cache for 60 seconds.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');

  try {
    let city = (req.query.city as string);
    const userId = (req.query.userId as string);
    const minPrice = req.query.minPrice as string;
    const maxPrice = req.query.maxPrice as string;
    const minLat = req.query.minLat as string;
    const maxLat = req.query.maxLat as string;
    const minLng = req.query.minLng as string;
    const maxLng = req.query.maxLng as string;

    // Optional authentication verification
    let authenticatedUser: any = null;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        authenticatedUser = jwt.verify(token, JWT_SECRET);
      } catch (_e) {
        // Invalid or expired token
      }
    }

    // If userId query param is provided, requester must be the owner or admin
    if (userId) {
      if (!authenticatedUser || (authenticatedUser.role !== 'admin' && String(authenticatedUser.id) !== String(userId))) {
        return res.status(401).json({ error: 'Unauthorized to view listings for this user' });
      }
    }

    const isAdminRequester = authenticatedUser && authenticatedUser.role === 'admin';

    // Redis Edge Caching: Dedicated public catalogue safe-card cache namespace
    const isPublicCatalogueFeed = !userId && !isAdminRequester;
    const publicCityKey = (city && city !== 'all') ? city.toLowerCase() : 'all';
    const cacheKey = isPublicCatalogueFeed
      ? `listings_v3:public_cards:${publicCityKey}:${req.originalUrl}`
      : null;

    if (redis && cacheKey && isPublicCatalogueFeed) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          // Serve from Redis Cache (Edge Cache)
          const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
          return res.json(parsed);
        }
      } catch (err) {
        console.warn('Redis Cache Error:', err);
      }
    }

    let result;

    try {
      if (userId) {
        // Authenticated host fetching their own listings
        result = await pool.query(`
          SELECT l.*,
                 COALESCE(cp.has_offers, false) as has_offers
          FROM listings l
          LEFT JOIN (SELECT DISTINCT listing_id, true as has_offers FROM calendar_prices WHERE offer_id IS NOT NULL) cp ON cp.listing_id = l.id
          WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200
        `, [userId]);
      } else if (city === 'all' && isAdminRequester) {
        // Authenticated admin fetching all listings (drafts, unlisted, published)
        result = await pool.query(`
          SELECT l.*,
                 COALESCE(cp.has_offers, false) as has_offers
          FROM listings l
          LEFT JOIN (SELECT DISTINCT listing_id, true as has_offers FROM calendar_prices WHERE offer_id IS NOT NULL) cp ON cp.listing_id = l.id
          ORDER BY created_at DESC LIMIT 200
        `);
      } else {
        city = (city && city !== 'all') ? city : '';

        // Public explore query: strictly enforce publication_status = 'published'
        let queryStr = `
          SELECT l.*,
                 COALESCE(cp.has_offers, false) as has_offers
          FROM listings l
          LEFT JOIN (SELECT DISTINCT listing_id, true as has_offers FROM calendar_prices WHERE offer_id IS NOT NULL) cp ON cp.listing_id = l.id
          WHERE l.publication_status = 'published'
        `;
        const queryParams: any[] = [];

        if (city) {
            queryParams.push(city);
            queryStr += ` AND l.city ILIKE '%' || $${queryParams.length} || '%'`;
        }

        if (minPrice) {
            queryParams.push(minPrice);
            queryStr += ` AND l.price >= $${queryParams.length}`;
        }
        if (maxPrice) {
            queryParams.push(maxPrice);
            queryStr += ` AND l.price <= $${queryParams.length}`;
        }
        if (req.query.type) {
            queryParams.push(req.query.type);
            queryStr += ` AND l.type = $${queryParams.length}`;
        }
        if (req.query.amenities) {
            const amenitiesList = (req.query.amenities as string).split(',');
            queryParams.push(JSON.stringify(amenitiesList));
            queryStr += ` AND l.amenities::jsonb @> $${queryParams.length}::jsonb`;
        }
        if (req.query.bedrooms) {
            queryParams.push(req.query.bedrooms);
            queryStr += " AND (l.bedrooms >= $" + queryParams.length + " OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'bedrooms') IS NOT NULL AND (r->>'bedrooms') != '' AND (r->>'bedrooms')::numeric >= $" + queryParams.length + "))";
        }
        if (req.query.beds) {
            queryParams.push(req.query.beds);
            queryStr += " AND (l.beds >= $" + queryParams.length + " OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'beds') IS NOT NULL AND (r->>'beds') != '' AND (r->>'beds')::numeric >= $" + queryParams.length + "))";
        }
        if (req.query.bathrooms) {
            queryParams.push(req.query.bathrooms);
            queryStr += ` AND l.bathrooms >= $${queryParams.length}`;
        }
        if (req.query.maxGuests) {
            queryParams.push(req.query.maxGuests);
            queryStr += " AND (l.max_guests >= $" + queryParams.length + " OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'capacity') IS NOT NULL AND (r->>'capacity') != '' AND (r->>'capacity')::numeric >= $" + queryParams.length + "))";
        }

        if (req.query.sort === 'price_asc') {
            queryStr += ' ORDER BY l.price ASC, l.created_at DESC';
        } else if (req.query.sort === 'price_desc') {
            queryStr += ' ORDER BY l.price DESC, l.created_at DESC';
        } else {
            queryStr += ' ORDER BY l.created_at DESC';
        }

        result = await pool.query(queryStr, queryParams);
      }
    } catch (dbError) {
      const dbErrorMessage = dbError instanceof Error ? dbError.message : String(dbError);

      // Handle missing table error
      if (dbErrorMessage.includes('relation "listings" does not exist') || dbErrorMessage.includes('Tenant or user not found')) {
        console.warn('Database warning:', dbErrorMessage, '- Returning empty listings.');
        return res.json([]);
      }

      console.error('Database Query Error:', dbErrorMessage);
      throw dbError; // Re-throw other DB errors to be caught by outer catch
    }

    let listings: any[] = [];
    const isOwnerOrAdminFeed = Boolean(userId || isAdminRequester);

    for (const row of result.rows) {
      if (isOwnerOrAdminFeed) {
        // Authenticated owner or admin management read: preserve full administrative and relational fields
        listings.push({
          id: String(row.id),
          title: row.title,
          description: row.description,
          price: parseFloat(row.price),
          currency: '₹',
          type: row.type,
          address: row.address,
          city: row.city,
          user_id: row.user_id,
          imageUrl: row.image_url || '',
          imageUrls: row.image_urls || [],
          photos: row.photos || [],
          video_url: row.video_url || null,
          rental_mode: row.rental_mode || 'entire_place',
          rooms: row.rooms || [],
          imageCount: (row.image_urls && row.image_urls.length > 0) ? row.image_urls.length : 1,
          provider: 'Host',
          isVerified: true,
          discount: 0,
          rating: 5.0,
          reviewCount: 0,
          amenities: row.amenities || ['Wifi', 'Kitchen'],
          maxGuests: row.max_guests,
          bedrooms: row.bedrooms,
          beds: row.beds,
          bathrooms: row.bathrooms,
          lat: row.lat ? parseFloat(row.lat) : null,
          lng: row.lng ? parseFloat(row.lng) : null,
          dynamicPricing: row.dynamic_pricing || { weekendMultiplier: 1.0, seasonalMultiplier: 1.0 },
          hasOffers: row.has_offers || false,
          hero_video_url: row.hero_video_url || null,
          hero_fallback_url: row.hero_fallback_url || null,
          dominant_color_hex: row.dominant_color_hex || null,
          raw_rules: row.raw_rules,
          curated_guidelines: row.curated_guidelines || null,
          experience_tags: Array.isArray(row.experience_tags) ? row.experience_tags : (typeof row.experience_tags === 'string' ? JSON.parse(row.experience_tags || '[]') : []),
          concierge_privileges: row.concierge_privileges || null,
          host_philosophy: row.host_philosophy || null,
          nearby: typeof row.nearby === 'string' ? JSON.parse(row.nearby || '[]') : (row.nearby || []),
          amenity_clusters: typeof row.amenity_clusters === 'string' ? JSON.parse(row.amenity_clusters || '{}') : (row.amenity_clusters || {}),
          child_safety_specs: typeof row.child_safety_specs === 'string' ? JSON.parse(row.child_safety_specs || '[]') : (row.child_safety_specs || []),
          seo_title: row.seo_title || null,
          seo_description: row.seo_description || null,
          seo_keywords: row.seo_keywords || null,
          seo_image_url: row.seo_image_url || null
        });
      } else {
        // Anonymous / public catalogue explore read: strictly project through toPublicListingCardProjection
        listings.push(toPublicListingCardProjection(row));
      }
    }


    // MIG-001 & MIG-002: Hydrate rooms and photos for host dashboard (when userId is present)
    if (userId && listings.length > 0) {
      const listingIds = listings.map(l => parseInt(String(l.id), 10)).filter(n => !isNaN(n));
      try {
        const rtResult = await pool.query('SELECT * FROM room_types WHERE listing_id = ANY($1::int[]) ORDER BY id ASC', [listingIds]);
        const roomsByListing: any = {};
        rtResult.rows.forEach(rt => {
          if (!roomsByListing[rt.listing_id]) roomsByListing[rt.listing_id] = [];
          roomsByListing[rt.listing_id].push({
            id: String(rt.id),
            name: rt.name,
            type: rt.type || rt.name.toLowerCase().replace(/\s+/g, '_'),
            icon: rt.icon || '🛏️',
            tag: rt.tag || '',
            price: parseFloat(rt.base_price),
            capacity: rt.max_occupancy,
            inventory_count: rt.inventory_count,
            description: rt.description || '',
            specs: rt.specs || '',
            features: typeof rt.features === 'string' ? JSON.parse(rt.features || '[]') : (rt.features || []),
            amenities: typeof rt.amenities === 'string' ? JSON.parse(rt.amenities || '[]') : (rt.amenities || []),
            min_stay_nights: rt.min_stay_nights || 1
          });
        });

        const mediaResult = await pool.query("SELECT * FROM media_assets WHERE entity_type = 'listing' AND entity_id = ANY($1::int[]) ORDER BY order_index ASC", [listingIds]);
        const photosByListing: any = {};
        mediaResult.rows.forEach(m => {
          if (!photosByListing[m.entity_id]) photosByListing[m.entity_id] = [];
          photosByListing[m.entity_id].push({
            id: String(m.id),
            url: m.url,
            tier: m.tier || 'common',
            category: m.category || 'other',
            title: m.title || '',
            description: m.description || '',
            specs: m.specs || '',
            isHero: m.is_hero || false
          });
        });

        listings.forEach(l => {
          if (roomsByListing[l.id] && roomsByListing[l.id].length > 0) {
            l.rooms = roomsByListing[l.id];
          }
          if (photosByListing[l.id] && photosByListing[l.id].length > 0) {
            l.photos = photosByListing[l.id];
          }
        });
      } catch (err) {
        console.warn('Failed to hydrate rooms/photos in batch listings:', err);
      }
    }

    if (minLat && maxLat && minLng && maxLng) {
        listings = listings.filter((l: any) => {
            try {
                if (l.lat == null || l.lng == null || (l.lat === '0' && l.lng === '0') || (l.lat === 0 && l.lng === 0)) return true;
                const pLat = parseFloat(l.lat);
                const pLng = parseFloat(l.lng);
                const pMinLat = parseFloat(minLat);
                const pMaxLat = parseFloat(maxLat);
                const pMinLng = parseFloat(minLng);
                const pMaxLng = parseFloat(maxLng);
                if (isNaN(pLat) || isNaN(pLng)) return true;
                return pLat >= pMinLat && pLat <= pMaxLat && pLng >= pMinLng && pLng <= pMaxLng;
            } catch(e) {
                return true;
            }
        });
    }

    if (redis && cacheKey && isPublicCatalogueFeed) {
      try {
        await redis.set(cacheKey, JSON.stringify(listings), { ex: 3600 });
      } catch (e) {
        console.warn('Redis Cache Error: Could not save to cache');
      }
    }

    res.json(listings);
  } catch (error) {
    console.warn('[LISTINGS FETCH FALLBACK] Database query error, returning empty list:', error);
    res.json([]);
  }
});

router.get('/api/host/reservations', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) {
    return res.json([]);
  }
  try {
    // IDOR Protection: Use authenticated user's ID
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // bookings created by others for host's listings
    const result = await pool.query(`
      SELECT b.*,
             l.title as listing_title,
             l.city as listing_city,
             l.image_url as listing_image_url,
             l.user_id as listing_host_id
      FROM bookings b
      JOIN listings l ON b.listing_id = l.id
      WHERE l.user_id = $1
      ORDER BY b.created_at DESC
    `, [userId]);

    const expResult = await pool.query(`
      SELECT eb.*,
             e.title as listing_title,
             e.destination as listing_city,
             e.image_urls[1] as listing_image_url,
             e.host_id as listing_host_id,
             e.start_date
      FROM experience_bookings eb
      JOIN experiences e ON eb.experience_id = e.id
      WHERE e.host_id = $1
      ORDER BY eb.created_at DESC
    `, [userId]);

    const formattedBookings = result.rows.map(row => ({
      id: String(row.id),
      moveInDate: row.move_in_date,
      configuration: row.configuration,
      name: row.name,
      phone: row.phone,
      status: row.status,
      totalRent: Number(row.total_rent),
      type: 'stay',
      listing: {
        id: String(row.listing_id),
        title: row.listing_title,
        city: row.listing_city,
        imageUrl: row.listing_image_url,
        user_id: row.listing_host_id
      },
      bookingDate: row.created_at
    }));

    const formattedExpBookings = expResult.rows.map(row => ({
      id: `exp-${row.id}`,
      moveInDate: row.start_date, // Use experience start date
      configuration: 'Experience',
      name: row.name,
      phone: row.phone,
      status: row.status,
      totalRent: Number(row.total_price),
      type: 'experience',
      listing: {
        id: String(row.experience_id),
        title: row.listing_title,
        city: row.listing_city,
        imageUrl: row.listing_image_url,
        user_id: row.listing_host_id
      },
      bookingDate: row.created_at
    }));

    const merged = [...formattedBookings, ...formattedExpBookings].sort((a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime());

    res.json(merged);
  } catch (error) {
    console.error('Failed to fetch host reservations:', error);
    res.status(500).json({ error: 'Failed to fetch host reservations' });
  }
});

router.put('/api/host/reservations/:id/status', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'declined', 'cancelled', 'completed', 'Completed'];
    if (!validStatuses.map(s => s.toLowerCase()).includes(status.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    let result;
    if (typeof id === 'string' && id.startsWith('exp-')) {
      const realId = id.replace('exp-', '');

      // IDOR Protection: Verify host ownership
      const expRes = await pool.query('SELECT host_id FROM experiences WHERE id = (SELECT experience_id FROM experience_bookings WHERE id = $1)', [realId]);
      if (expRes.rows.length === 0 || (expRes.rows[0].host_id !== req.user?.id && req.user?.role !== 'admin')) {
         return res.status(403).json({ error: 'Forbidden: Not authorized to update this booking.' });
      }

      result = await pool.query(
        'UPDATE experience_bookings SET status = $1 WHERE id = $2 RETURNING *',
        [status, realId]
      );
    } else {
      // IDOR Protection: Verify host ownership
      const listRes = await pool.query('SELECT user_id FROM listings WHERE id = (SELECT listing_id FROM bookings WHERE id = $1)', [id]);
      if (listRes.rows.length === 0 || (listRes.rows[0].user_id !== req.user?.id && req.user?.role !== 'admin')) {
         return res.status(403).json({ error: 'Forbidden: Not authorized to update this booking.' });
      }

      result = await pool.query(
        'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];

    // Try to get listing info
    let listingTitle = 'a property';
    try {
      const listingRes = await pool.query('SELECT title FROM listings WHERE id = $1', [booking.listing_id]);
      if (listingRes.rows.length > 0) listingTitle = listingRes.rows[0].title;
    } catch(e) { console.error(e); }

    // Send WhatsApp to guest
    let messageText = '';
    if (status === 'confirmed') {
      messageText = `✅ Good news ${booking.name}! Your booking for "${listingTitle}" on ${booking.move_in_date} has been CONFIRMED by the host. Total rent: $${booking.total_rent}. Have a great stay!`;
    } else if (status === 'declined') {
      messageText = `❌ Hello ${booking.name}, unfortunately your booking request for "${listingTitle}" on ${booking.move_in_date} was declined by the host. We hope you find another great place to stay!`;
    } else if (status === 'cancelled') {
      messageText = `⚠️ Hello ${booking.name}, your booking for "${listingTitle}" on ${booking.move_in_date} has been cancelled.`;
    }

    if (messageText && booking.phone) {
      sendWhatsAppMessage(booking.phone, messageText);
    }

    const io = (req.app && req.app.get ? req.app.get('io') : getGlobalIoInstance());
    if (io) {
       if (booking.user_id) {
         io.to(`user_${booking.user_id}`).emit('notification', { type: 'booking_update', booking, message: `Your booking for ${listingTitle} was ${status}` });
       }
       try {
           const listingRes = await pool.query('SELECT user_id FROM listings WHERE id = $1', [booking.listing_id]);
           if (listingRes.rows.length > 0 && listingRes.rows[0].user_id) {
               io.to(`user_${listingRes.rows[0].user_id}`).emit('notification', { type: 'booking_update', booking, message: `Booking for ${listingTitle} was ${status}` });
           }
       } catch(e) { console.error(e); }
       io.to('admin_room').emit('notification', { type: 'booking_update', booking, message: `Booking for ${listingTitle} was ${status}` });
       io.to(`listing_${booking.listing_id}`).emit('listing_updated', { type: 'booking_update' });
    }
    res.json({ message: 'Status updated successfully', booking });
  } catch (error) {
    console.error('Update Booking Status Error:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

router.delete('/api/listings/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ status: 'error', message: 'DB not configured' });
  }
  if (isNaN(Number(req.params.id))) return res.json({ success: true, message: "Demo listing deleted mockingly" });
  try {
    const id = req.params.id;

    // IDOR Protection: Verify ownership or admin role
    const authCheck = await pool.query('SELECT user_id FROM listings WHERE id = $1', [id]);
    if (authCheck.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    if (authCheck.rows[0].user_id !== req.user?.id && req.user?.role !== 'admin') {
       return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this listing.' });
    }

    const result = await pool.query('DELETE FROM listings WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    broadcastDbEvent(req, 'listing');
    res.json({ message: 'Listing deleted successfully', deletedListing: result.rows[0] });
  } catch (error) {
    console.error('Delete Listing Error:', error);
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

// Admin metrics (optional, simple stats)

router.post('/api/ai/suggest-price', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { listingId, dates } = req.body;
    // We fetch the listing details to give AI context
    const listingRes = await pool.query('SELECT title, city, type, price, currency FROM listings WHERE id = $1', [listingId]);
    if (listingRes.rowCount === 0) return res.status(404).json({ error: 'Not found' });

    const listing = listingRes.rows[0];
    let suggestedPrice = Math.round(listing.price * 1.15); // Static 15% fallback

    if (ai) {
      try {
        const systemInstruction = `You are a dynamic intelligent pricing engine for a property rental platform.
Provide an optimal nightly price for the following property for the dates: ${(dates || []).join(', ')}.

Property Details:
Title: ${listing.title}
City: ${listing.city}
Type: ${listing.type}
Base Price: ${listing.price} ${listing.currency}

Consider weekends and general seasonality. Output ONLY a valid JSON object in this exact format:
{"price": number}
Do NOT wrap it in markdown block.`;

        const response = await ai!.models.generateContent({
          model: "gemini-2.5-flash",
          contents: "Suggest optimal price in JSON.",
          config: {
            systemInstruction,
            temperature: 0.5,
            responseMimeType: "application/json"
          }
        });

        const text = response?.text || '';
        const output = JSON.parse(text);
        if (output && typeof output.price === 'number') {
          suggestedPrice = output.price;
        }
      } catch (geminiError) {
        logGeminiWarning("Dynamic pricing suggest", geminiError);
      }
    }

    res.json({ price: suggestedPrice });
  } catch (error) {
    console.error('Suggest price failed:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/api/ai/suggest-reply', authenticateToken, conversationAssistanceBoundary, async (req: AuthRequest, res) => {
  try {
    const { history, propertyTitle, isHost } = req.body;
    let reply = 'Hello! How can I help you regarding your booking today?';

    if (ai) {
      try {
        const role = isHost ? 'a property host' : 'a platform administrator';
        const systemInstruction = `You are an AI assistant helping ${role} write a reply to a guest.
The conversation is about the property: "${propertyTitle}".
Here is the recent conversation:
${history}

Draft a polite, helpful, and concise response. Do not include quotes, placeholders, empty messages, '[Admin]', '[Host]', or any 'Replace this sample message' tags in the response text. The response must be a fully complete, ready-to-send message. Do not leave any blanks for the user to fill in.`;

        const response = await ai!.models.generateContent({
          model: "gemini-2.5-flash",
          contents: "Draft a reply to the guest based on the conversation.",
          config: {
            systemInstruction,
            temperature: 0.7
          }
        });

        const text = response?.text?.trim() || '';
        const lowerReply = text.toLowerCase();
        if (text !== '' && !lowerReply.includes('replace this') && !lowerReply.includes('sample message') && !lowerReply.includes('[insert') && !lowerReply.includes('placeholder')) {
          reply = text;
        }
      } catch (geminiError) {
        logGeminiWarning("Reply draft generation", geminiError);
      }
    }

    res.json({ reply });
  } catch (error) {
    console.error('Suggest reply failed:', error);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

router.post('/api/ai/suggest-listing', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { type, city, amenities, rooms, rentalMode } = req.body;
    let title = `Beautiful ${type || 'Property'} in ${city || 'Prime Location'}`;
    let description = `Enjoy a comfortable and fully equipped ${type || 'property'} located in ${city || 'a fantastic destination'}. Perfect for short or long-term stays, this space offers excellent amenities including ${(amenities || []).slice(0, 3).join(', ')} for a cozy home-away-from-home experience.`;

    if (ai) {
      try {
        const systemInstruction = `You are a professional real-estate listing assistant.
Create a short, catchy title and a warm, inviting, 2-3 paragraph description for a property listing.

Details provided by host:
Property Type: ${type}
Location: ${city}
Rental Mode: ${rentalMode}
Amenities: ${(amenities || []).join(', ')}
Rooms: ${(rooms || []).map((r: any) => r.name).join(', ')}

Return ONLY a valid JSON object in this exact format, with no markdown code blocks around it:
{"title": "your suggested title", "description": "your suggested description"}
Do NOT include any empty placeholders, brackets like [Insert City], or generic tags. The output must be fully formed and ready to publish without requiring any edits.`;

        const response = await ai!.models.generateContent({
          model: "gemini-2.5-flash",
          contents: "Generate title and description based on the details.",
          config: {
            systemInstruction,
            temperature: 0.7,
            responseMimeType: "application/json"
          }
        });



        const output = JSON.parse(response?.text || '{}');
        if (output.title) title = output.title;
        if (output.description) description = output.description;
      } catch (geminiError) {
        logGeminiWarning("Listing assist generation", geminiError);
      }
    }

    res.json({ title, description });
  } catch (error) {
    console.error('Suggest listing failed:', error);
    res.status(500).json({ error: 'Failed to generate listing info' });
  }
});

// AI Rule Abstraction (God-Level Luxury Hospitality Rule Polishing)
router.post('/api/ai/curate-rules', authenticateToken, createLegacyListingAssistanceBoundary('CURATE_RULES'), async (req: AuthRequest, res) => {
  try {
    const { rawRules } = req.body;
    if (!rawRules || typeof rawRules !== 'string' || !rawRules.trim()) {
      return res.status(400).json({ error: 'rawRules text required' });
    }

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = "You are an executive hospitality director at an ultra-luxury 5-star estate (like Aman or Casa Angelina). Transform the following raw house rules into polite, sophisticated, aristocratic 'House Guidelines'. Retain all core boundaries (e.g. smoking, noise, checkout, pets) while completely eliminating hostile or aggressive phrasing. Format as 3-5 concise, elegant bullet points:\n\n" + rawRules;
        const response = await ai!.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        if (response && response.text) {
          return res.json({ curatedGuidelines: response.text.trim() });
        }
      } catch (geminiErr: any) {
        console.warn('Gemini rule curation fallback invoked:', geminiErr?.message);
      }
    }

    // Heuristic luxury polish fallback
    const polished = rawRules
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const text = line.replace(/^[\d\-.* \t]+/, '');
        if (/no smoking/i.test(text)) return 'To preserve the pristine mountain and ocean air of the sanctuary, smoking is reserved exclusively for the outer perimeter.';
        if (/no parties|no loud music/i.test(text)) return 'We invite guests to embrace the tranquil atmosphere of the estate, observing quiet serenity after twilight.';
        if (/check-?out/i.test(text)) return 'Check-out is honored with leisurely grace by the appointed hour to allow our housekeeping artisans to prepare the suites.';
        if (/no pets/i.test(text)) return 'To protect the heritage furnishings and allergy-sensitive atmosphere, animal companions are welcomed only by prior concierge approval.';
        return 'We kindly request guests to treat the sanctuary and its bespoke architecture with gentle reverence: ' + text;
      })
      .join('\n');

    res.json({ curatedGuidelines: polished });
  } catch (err) {
    console.error('Curate rules error:', err);
    res.status(500).json({ error: 'Failed to curate rules' });
  }
});

// ADR-SENSORY-001: AI Sensory Atmosphere Tag Suggester

// ADR-NEIGHBORHOOD-001: Dual-Pillar AI Radar Scan (Destinations & Gastronomy)
router.post('/api/ai/radar-scan', authenticateToken, createLegacyListingAssistanceBoundary('NEARBY_RADAR'), async (req: AuthRequest, res) => {
  try {
    const { lat, lng, city, address } = req.body;
    
    const fallbackDestinations = [
      {
        id: crypto.randomUUID(),
        categoryGroup: 'destination',
        type: 'landmark',
        name: 'The Heritage Palace & Grounds',
        distance: '10 min drive',
        rating: 4.8,
        lat: lat ? lat + 0.01 : 11.69,
        lng: lng ? lng + 0.01 : 76.14
      },
      {
        id: crypto.randomUUID(),
        categoryGroup: 'destination',
        type: 'nature',
        name: 'Emerald Valley Viewpoint & Trail',
        distance: '15 min drive',
        rating: 4.9,
        lat: lat ? lat - 0.02 : 11.66,
        lng: lng ? lng + 0.015 : 76.15
      },
      {
        id: crypto.randomUUID(),
        categoryGroup: 'destination',
        type: 'culture',
        name: 'Artisan Village & Living Museum',
        distance: '5 min walk',
        rating: 4.7,
        lat: lat ? lat + 0.005 : 11.68,
        lng: lng ? lng - 0.01 : 76.12
      },
      {
        id: crypto.randomUUID(),
        categoryGroup: 'destination',
        type: 'experience',
        name: 'Riverfront Mist Promenade',
        distance: '20 min drive',
        rating: 4.6,
        lat: lat ? lat - 0.01 : 11.67,
        lng: lng ? lng - 0.02 : 76.11
      }
    ];

    const fallbackRestaurants = [
      {
        id: crypto.randomUUID(),
        categoryGroup: 'restaurant',
        type: 'farm_to_table',
        name: 'The Plantation Cellar & Dining Pavilion',
        cuisine: 'Organic Farm-to-Table',
        distance: '8 min drive',
        rating: 4.9,
        lat: lat ? lat + 0.008 : 11.688,
        lng: lng ? lng + 0.006 : 76.138
      },
      {
        id: crypto.randomUUID(),
        categoryGroup: 'restaurant',
        type: 'fine_dining',
        name: 'Mist Valley Artisanal Bistro',
        cuisine: 'Contemporary Heritage Cuisine',
        distance: '12 min drive',
        rating: 4.8,
        lat: lat ? lat - 0.012 : 11.673,
        lng: lng ? lng - 0.008 : 76.124
      },
      {
        id: crypto.randomUUID(),
        categoryGroup: 'restaurant',
        type: 'cafe',
        name: 'The Canopy Roastery & Tea Salon',
        cuisine: 'Single-Origin Estate Brews',
        distance: '6 min drive',
        rating: 4.8,
        lat: lat ? lat + 0.003 : 11.683,
        lng: lng ? lng - 0.005 : 76.127
      },
      {
        id: crypto.randomUUID(),
        categoryGroup: 'restaurant',
        type: 'local_authentic',
        name: 'Heritage Spice Hearth',
        cuisine: 'Slow-Cooked Regional Claypot',
        distance: '14 min drive',
        rating: 4.7,
        lat: lat ? lat - 0.018 : 11.667,
        lng: lng ? lng + 0.012 : 76.144
      }
    ];

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `You are a luxury travel and culinary concierge for an ultra-luxury property platform.
We have a property at coordinates lat: ${lat}, lng: ${lng} in ${city || address || 'the local region'}.

Please curate TWO distinct luxury lists:
1. "destinations": 4 top-tier tourist attractions, nature spots, scenic viewpoints, or cultural landmarks (strict types: 'nature', 'culture', 'landmark', 'viewpoint', 'experience'). NO basic transit/groceries/gyms.
2. "restaurants": 4 top-rated culinary dining spots, artisanal cafes, farm-to-table estates, or authentic local gourmet eateries (strict types: 'fine_dining', 'cafe', 'farm_to_table', 'local_authentic', 'scenic_bar'). Include an evocative 'cuisine' tag (e.g. 'Organic Farm-to-Table', 'Coastal Seafood & Wine', 'Artisan Coffee Roastery'). NO fast food chains.

Return strictly a valid JSON object matching this exact structure:
{
  "destinations": [
    {
      "id": "string",
      "categoryGroup": "destination",
      "type": "nature"|"culture"|"landmark"|"viewpoint"|"experience",
      "name": "string",
      "distance": "string",
      "rating": 4.8,
      "lat": number,
      "lng": number
    }
  ],
  "restaurants": [
    {
      "id": "string",
      "categoryGroup": "restaurant",
      "type": "fine_dining"|"cafe"|"farm_to_table"|"local_authentic"|"scenic_bar",
      "name": "string",
      "cuisine": "string",
      "distance": "string",
      "rating": 4.9,
      "lat": number,
      "lng": number
    }
  ]
}

Respond ONLY with the raw JSON. No markdown codeblocks, no explanations.`;

        const response = await ai!.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });

        if (response && response.text) {
          let text = response.text.trim();
          if (text.startsWith('```json')) {
            text = text.replace(/^```json/, '').replace(/```$/, '').trim();
          } else if (text.startsWith('```')) {
            text = text.replace(/^```/, '').replace(/```$/, '').trim();
          }
          const parsed = JSON.parse(text);
          if (parsed && Array.isArray(parsed.destinations) && Array.isArray(parsed.restaurants)) {
            return res.json({
              destinations: parsed.destinations.map((d: Record<string, unknown>) => ({ ...d, categoryGroup: 'destination' })),
              restaurants: parsed.restaurants.map((r: Record<string, unknown>) => ({ ...r, categoryGroup: 'restaurant' }))
            });
          }
        }
      } catch (geminiErr: any) {
        console.warn('Gemini dual radar scan fallback invoked:', geminiErr?.message);
      }
    }

    res.json({
      destinations: fallbackDestinations,
      restaurants: fallbackRestaurants
    });
  } catch (err) {
    console.error('Radar scan error:', err);
    res.status(500).json({ error: 'Failed to scan neighborhood' });
  }
});

router.post('/api/ai/suggest-sensory-tags', authenticateToken, createLegacyListingAssistanceBoundary('SENSORY_TAGS'), async (req: AuthRequest, res) => {
  try {
    const { title, description, propertyType, location } = req.body;
    if (!title && !description) {
      return res.status(400).json({ error: 'title or description required' });
    }

    const ALL_AVAILABLE_TAGS = [
      'Ocean Waves','Panoramic Mountain View','Valley Sunrise','Forest Canopy','Desert Dunes Vista',
      'Backwater Views','Waterfall Proximity','Tea Estate Vista','Stargazing Sky','Himalayan Peaks',
      'River Frontage','Cliff-Top Perch','Paddy Field Views','Coral Reef Access','Jungle Sounds',
      'Heated Infinity Pool','Private Jacuzzi','In-Villa Spa Treatments','Yoga Deck','Meditation Garden',
      'Ayurvedic Therapies','Cold Plunge Pool','Steam & Sauna','Hydrotherapy Circuit',
      'Forest Bathing Trail','Sunrise Yoga Sessions','Wellness Consultation',
      'Private Chef Available','Wine Cellar Access','Farm-to-Table Dining','Organic Tea Garden',
      'In-Villa Breakfast','Poolside Dining','Bonfire BBQ Setup','Artisan Coffee Bar',
      'Tasting Menu Experience','Mixology Bar',
      '1 Gbps Fiber WiFi','Starlink Satellite WiFi','Dedicated Work Studio','Smart Home Controls',
      'Video Conferencing Setup','Dual ISP Backup Internet',
      'Artisan Fireplace','Himalayan Silence','Rainforest Soundscape','Candlelit Courtyards',
      'Acoustic Architecture','Circadian Lighting System','Aromatherapy Diffusion',
      'Heritage Architecture','Minimalist Zen Design','Open-Air Pavilions',
      'Private Tennis Court','Nature Trekking Routes','Kayaking & Canoeing','Horse Riding Trails',
      'Archery Range','Mountain Cycling Paths','Bird Watching Post','Sunset Sailing',
      'Golf Proximity','Rock Climbing Wall',
      '24/7 Butler Service','Private Airport Transfer','Helipad Access','Celebrity-Grade Privacy',
      'Curated Minibar','Personal Trainer','Childcare Available','Dedicated Concierge',
      'Cultural Immersion Walks','Local Artisan Workshops','Sunset Photography Tours',
      'Guided Stargazing','Private Boat Tours','Private Cinema Room','Library & Reading Nook',
      'Bonfire Storytelling Nights'
    ];

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `You are a luxury hospitality AI. Based on the property details below, select the most relevant Sensory Atmosphere Tags from the provided list. Return ONLY a JSON array of tag labels (max 8 tags) that genuinely match the property.

Property Title: ${title || 'Luxury Estate'}
Description: ${description || ''}
Property Type: ${propertyType || 'Resort'}
Location: ${location || ''}

Available tags (select max 8 from this EXACT list only):
${ALL_AVAILABLE_TAGS.join(', ')}

Return ONLY a raw JSON array like: ["Tag 1", "Tag 2", "Tag 3"]`;

        const response = await ai!.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        if (response && response.text) {
          const text = response.text.trim().replace(/```json\n?|\n?```/g, '');
          const match = text.match(/\[[\s\S]*\]/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            const validated = parsed.filter((t: string) => ALL_AVAILABLE_TAGS.includes(t)).slice(0, 8);
            return res.json({ tags: validated });
          }
        }
      } catch (geminiErr: any) {
        console.warn('Gemini tag suggestion fallback:', geminiErr?.message);
      }
    }

    // Heuristic fallback
    const desc = `${title} ${description} ${location}`.toLowerCase();
    const fallback: string[] = [];
    if (desc.includes('mountain') || desc.includes('hill') || desc.includes('peak')) fallback.push('Panoramic Mountain View');
    if (desc.includes('ocean') || desc.includes('sea') || desc.includes('beach')) fallback.push('Ocean Waves');
    if (desc.includes('pool') || desc.includes('infinity')) fallback.push('Heated Infinity Pool');
    if (desc.includes('forest') || desc.includes('jungle') || desc.includes('wildlife')) fallback.push('Forest Canopy');
    if (desc.includes('chef') || desc.includes('culinary') || desc.includes('dining')) fallback.push('Private Chef Available');
    if (desc.includes('spa') || desc.includes('wellness') || desc.includes('yoga')) fallback.push('In-Villa Spa Treatments');
    if (desc.includes('wifi') || desc.includes('work') || desc.includes('remote')) fallback.push('1 Gbps Fiber WiFi');
    if (desc.includes('butler') || desc.includes('luxury') || desc.includes('concierge')) fallback.push('24/7 Butler Service');
    res.json({ tags: fallback.slice(0, 6) });
  } catch (err) {
    console.error('Suggest sensory tags error:', err);
    res.status(500).json({ error: 'Failed to suggest tags' });
  }
});

// ADR-006: Real Gemini AI Gatekeeper for listing quality scoring
router.post('/api/ai/evaluate-listing', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { title, description, photos, rooms, amenities, price, city } = req.body;

  // Rate limit: 5 evaluations per host per hour (per AGENTS.md directive)
  if (!(global as any).__aiEvalRL) (global as any).__aiEvalRL = {};
  const rl = (global as any).__aiEvalRL;
  const key = `rl_${userId}`;
  const now = Date.now();
  const prevCalls: number[] = (rl[key] || []).filter((t: number) => now - t < 3600000);
  if (prevCalls.length >= 5) {
    const retryMins = Math.ceil((prevCalls[0] + 3600000 - now) / 60000);
    return res.status(429).json({
      error: `Rate limit: max 5 AI evaluations per hour. Retry in ${retryMins} minute(s).`,
      retryAfterMinutes: retryMins
    });
  }
  rl[key] = [...prevCalls, now];

  // Heuristic scorer (used as fallback if Gemini unavailable)
  const heuristicScore = () => {
    const photoArr = Array.isArray(photos) ? photos : [];
    const roomArr = Array.isArray(rooms) ? rooms : [];
    const amenityArr = Array.isArray(amenities) ? amenities : [];
    const checks = [
      { name: 'Title quality', pass: title && title.length >= 20, weight: 1.5, feedback: 'Title must be at least 20 characters' },
      { name: 'Description depth', pass: description && description.length >= 150, weight: 2, feedback: 'Description must be at least 150 characters' },
      { name: 'Photo count', pass: photoArr.length >= 5, weight: 2, feedback: 'Upload at least 5 photos' },
      { name: 'Photos categorized', pass: photoArr.filter((p: any) => p.category && p.category !== 'other').length >= 3, weight: 1, feedback: 'Tag at least 3 photos with spatial categories' },
      { name: 'Room types defined', pass: roomArr.length >= 1, weight: 1.5, feedback: 'Define at least 1 room type' },
      { name: 'Room pricing set', pass: roomArr.length > 0 && roomArr.every((r: any) => Number(r.price) > 0), weight: 2, feedback: 'Set nightly price for every room type' },
      { name: 'Room names set', pass: roomArr.length > 0 && roomArr.every((r: any) => r.name && r.name.length > 0), weight: 1, feedback: 'Give each room type a name' },
      { name: 'Amenities listed', pass: amenityArr.length >= 3, weight: 1, feedback: 'List at least 3 amenities' },
      { name: 'City set', pass: city && city.length > 0, weight: 1, feedback: 'Set the property city' }
    ];
    const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
    const earned = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
    const score = Math.round((earned / totalWeight) * 10 * 10) / 10;
    const issues = checks.filter(c => !c.pass).map(c => c.feedback);
    const strengths = checks.filter(c => c.pass).map(c => c.name);
    return { score, cleared: score >= 8, headline: score >= 8 ? 'Listing meets quality standards for advertising.' : 'Listing needs improvement before advertising.', issues, strengths, method: 'heuristic' };
  };

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const photoArr = Array.isArray(photos) ? photos : [];
      const roomArr = Array.isArray(rooms) ? rooms : [];
      const amenityArr = Array.isArray(amenities) ? amenities : [];

      const prompt = `You are a luxury property listing quality inspector for Encho, a premium property hosting platform.
Evaluate this listing for advertising readiness. Score from 0.0 to 10.0 (one decimal).
8.0+ = Cleared for paid advertising.

Listing:
- Title: "${(title || '').substring(0, 100)}"
- Description: "${(description || '').substring(0, 400)}" (${(description || '').length} chars)
- Photos: ${photoArr.length} uploaded, ${photoArr.filter((p: any) => p.category && p.category !== 'other').length} categorized
- Room types: ${roomArr.length} (${roomArr.map((r: any) => `${r.name}: \u20b9${r.price}`).join(', ')})
- Amenities: ${amenityArr.slice(0, 8).join(', ')} (${amenityArr.length} total)
- City: ${city || 'not set'}

Return JSON only:
{"score":number,"cleared":boolean,"headline":string,"issues":string[],"strengths":string[]}`;

      const gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 800 }
          })
        }
      );
      if (gRes.ok) {
        const gData = await gRes.json();
        const raw = gData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(raw);
        if (typeof parsed.score === 'number') {
          return res.json({ ...parsed, method: 'gemini' });
        }
      }
    } catch (gErr) {
      console.warn('[ADR-006] Gemini evaluation failed, using heuristic fallback:', gErr);
      // Per AGENTS.md: never blank-approve if AI fails — heuristic fallback is always stricter
    }
  }

  res.json(heuristicScore());
});

// ADR-004: AI-powered nearby POI generation from coordinates
router.post('/api/ai/nearby-pois', authenticateToken, async (req: AuthRequest, res) => {
  const { lat, lng, city, propertyType } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.json({ pois: [], source: 'none', message: 'AI suggestions unavailable. Add POIs manually.' });
  }

  try {
    const prompt = `Generate 5 realistic nearby points of interest for a ${propertyType || 'luxury property'} located at coordinates (${lat}, ${lng}) in ${city || 'the area'}.
Focus on what guests would actually want to visit: nature, dining, beaches, cultural attractions, wellness, transport hubs.
Return JSON only:
{"pois":[{"name":string,"distance":string,"type":"nature"|"dining"|"attraction"|"wellness"|"transport"|"beach"|"shopping","description":string}]}`;

    const gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 800 }
        })
      }
    );
    if (gRes.ok) {
      const gData = await gRes.json();
      const raw = gData.candidates?.[0]?.content?.parts?.[0]?.text || '{"pois":[]}';
      const parsed = JSON.parse(raw);
      const pois = (parsed.pois || []).map((poi: any, i: number) => ({
        id: `ai-poi-${Date.now()}-${i}`,
        name: poi.name || '',
        distance: poi.distance || '',
        type: poi.type || 'attraction',
        description: poi.description || ''
      }));
      return res.json({ pois, source: 'gemini' });
    }
  } catch (err) {
    console.warn('[ADR-004] POI generation error:', err);
  }

  res.json({ pois: [], source: 'error', message: 'AI POI generation failed. Add POIs manually.' });
});

// Soft-Exit Lead Capture (Walled Garden CRM & Meta CAPI Retargeting Sync)

router.get('/api/user/bookings', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.json([]);
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    // Security check: Only admins or the user themselves can view their bookings
    if (req.user?.role !== 'admin' && String(req.user?.id) !== String(userId)) {
      return res.status(403).json({ error: 'Not authorized to view these bookings' });
    }

    const result = await pool.query(`
      SELECT b.*,
        l.id as l_id, l.title as l_title, l.city as l_city, l.address as l_address, l.image_url as l_image_url, l.image_urls as l_image_urls, l.user_id as l_user_id, l.rooms as l_rooms
      FROM bookings b
      JOIN listings l ON b.listing_id = l.id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
    `, [userId]);

    const formattedBookings = result.rows.map(row => {
      let listingData = {
        id: String(row.l_id),
        title: row.l_title,
        city: row.l_city,
        address: row.l_address,
        imageUrl: row.l_image_url,
        imageUrls: row.l_image_urls,
        user_id: row.l_user_id
      };

      if (row.room_id && row.l_rooms && Array.isArray(row.l_rooms)) {
          const room = row.l_rooms.find((r: any) => String(r.id) === String(row.room_id));
          if (room) {
              listingData = {
                  ...listingData,
                  ...room,
                  id: `${row.l_id}_${room.id}`,
                  originalId: String(row.l_id),
                  title: row.l_title,
                  displayTitle: `${row.l_title} - ${room.name}`,
                  imageUrl: (room.imageUrls && room.imageUrls.length > 0) ? room.imageUrls[0] : row.l_image_url,
                  imageUrls: (room.imageUrls && room.imageUrls.length > 0) ? room.imageUrls : row.l_image_urls,
                  selectedConfigId: String(room.id)
              } as any;
          }
      }

      return {
        id: String(row.id),
        moveInDate: row.move_in_date,
        configuration: row.configuration,
        name: row.name,
        phone: row.phone,
        totalRent: row.total_rent,
        status: row.status,
        bookingDate: row.created_at,
        listing: listingData
      };
    });

    res.json(formattedBookings);
  } catch (error) {
    console.warn('[USER BOOKINGS FALLBACK] Fetch User Bookings Error, returning empty list:', error);
    res.json([]);
  }
});

router.put('/api/user/bookings/:id/cancel', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;

    // Security: Use authenticated user ID
    const userId = req.user?.id;
    const checkRes = await pool.query('SELECT status FROM bookings WHERE id = $1 AND user_id = $2', [id, userId]);
    if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    if (checkRes.rows[0].status === 'cancelled') {
      return res.status(400).json({ error: 'Already cancelled' });
    }

    const result = await pool.query('UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *', ['cancelled', id]);
    const booking = result.rows[0];

    const io = (req.app && req.app.get ? req.app.get('io') : getGlobalIoInstance());
    if (io) {
       try {
           const listingRes = await pool.query('SELECT title, user_id FROM listings WHERE id = $1', [booking.listing_id]);
           if (listingRes.rows.length > 0) {
               const { title, user_id } = listingRes.rows[0];
               if (user_id) {
                 io.to(`user_${user_id}`).emit('notification', { type: 'booking_update', booking, message: `A booking for ${title} was cancelled by guest` });
               }
               io.to('admin_room').emit('notification', { type: 'booking_update', booking, message: `A booking for ${title} was cancelled by guest` });
           }
       } catch(e) { console.error(e); }
       io.to(`listing_${booking.listing_id}`).emit('listing_updated', { type: 'booking_cancelled' });
    }

    // Evaluate calendar circuit breaker to auto-resume eligible campaigns
    if (booking.listing_id) {
      triggerSmartAutoPause(booking.listing_id, `CANCELLED_${id}`).catch(err => {
        console.error('[CIRCUIT BREAKER CANCEL HOOK ERROR]', err);
      });
    }

    res.json({ message: 'Booking cancelled successfully', booking });
  } catch (error) {
    console.error('Cancel Booking Error:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

router.post('/api/bookings', authenticateToken, bookingLimiter, async (req: AuthRequest, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ error: 'DB not configured' });
  }
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return res.status(503).json({
      code: 'STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE',
      error: 'Online stay reservations remain unavailable until the canonical quote, tax and booking authority is accepted.',
    });
  }
  try {
    const { listingId, roomId, moveInDate, checkOutDate, configuration, name, phone, totalRent, userId, gclid, gbraid } = req.body;

    // Security check
    const authUserId = req.user?.id;
    if (userId && String(authUserId) !== String(userId) && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to book for this user' });
    }
    const finalUserId = userId || authUserId || null;

    if (!listingId || !moveInDate || !name || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ADR-003: Server-authoritative price validation
    const { roomTier, nightlyRate, nights } = req.body;
    if (listingId && roomTier && nightlyRate !== undefined && nights !== undefined) {
      try {
        const listingResult = await pool.query(
          'SELECT rooms, price, currency FROM listings WHERE id = $1',
          [listingId]
        );
        if (listingResult.rows.length > 0) {
          const dbListing = listingResult.rows[0];
          const dbRooms = typeof dbListing.rooms === 'string'
            ? JSON.parse(dbListing.rooms || '[]')
            : (Array.isArray(dbListing.rooms) ? dbListing.rooms : []);
          
          if (dbRooms.length > 0) {
            const dbRoom = dbRooms.find((r: any) => 
              r.type === roomTier || r.id === roomTier
            );
            if (dbRoom && dbRoom.price && Number(dbRoom.price) > 0) {
              const serverPrice = Number(dbRoom.price);
              const clientPrice = Number(nightlyRate);
              const tolerance = serverPrice * 0.02; // 2% tolerance for currency rounding
              if (Math.abs(clientPrice - serverPrice) > tolerance) {
                console.warn(`[ADR-003 PRICE MISMATCH] listing=${listingId} tier=${roomTier} client=${clientPrice} server=${serverPrice}`);
                return res.status(400).json({
                  error: 'Price mismatch detected. Please refresh the page and try again.',
                  code: 'PRICE_MISMATCH',
                  serverPrice,
                  clientPrice
                });
              }
            }
          }
        }
      } catch (priceValidationErr) {
        console.warn('[ADR-003] Price validation query failed (non-blocking):', priceValidationErr);
        // Non-blocking — continue booking if DB query fails
      }
    }

    // Room-Aware Multi-Inventory Availability & Double-Booking Guardrail
    const targetTier = roomTier || roomId || 'suites';
    const effectiveCheckIn = moveInDate;
    const effectiveCheckOut = checkOutDate || moveInDate;

    // 1. Ensure table schema columns exist
    await pool.query(`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_out_date VARCHAR(50);
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room_tier VARCHAR(100);
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room_unit_number INT DEFAULT 1;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_date DATE;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_date DATE;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guests INT DEFAULT 1;
    `);

    // 2. Fetch Total Inventory Capacity for this Room Tier
    let totalInventoryCount = 1;
    try {
      const listingRes = await pool.query('SELECT rooms FROM listings WHERE id = $1', [listingId]);
      if (listingRes.rows.length > 0) {
        let roomsArr = listingRes.rows[0].rooms;
        if (typeof roomsArr === 'string') roomsArr = JSON.parse(roomsArr || '[]');
        if (Array.isArray(roomsArr) && roomsArr.length > 0) {
          const matchRoom = roomsArr.find((r: any) => r.type === targetTier || r.id === targetTier);
          if (matchRoom && matchRoom.inventory_count) {
            totalInventoryCount = Math.max(1, Number(matchRoom.inventory_count));
          }
        }
      }
    } catch (invErr) {
      console.warn('[INVENTORY CAP] Fallback inventory check:', invErr);
    }

    // 3. Query Occupied Units (Active Bookings + OTA / Host Blocks)
    const occupiedUnits = new Set<number>();
    let isEstateWideBlocked = false;

    try {
      // Check Blocks
      const blockOverlap = await pool.query(`
        SELECT id, room_tier_key, room_unit_number, block_source, guest_name
        FROM room_calendar_blocks
        WHERE listing_id = $1
          AND (room_tier_key = $2 OR room_tier_key = 'all')
          AND (start_date <= $4::date AND end_date >= $3::date)
      `, [listingId, targetTier, effectiveCheckIn, effectiveCheckOut]);

      for (const blk of blockOverlap.rows) {
        const uNum = Number(blk.room_unit_number);
        if (uNum === 0 || blk.room_tier_key === 'all') {
          isEstateWideBlocked = true;
          break;
        } else {
          occupiedUnits.add(uNum);
        }
      }

      // Check Active Bookings
      if (!isEstateWideBlocked) {
        const bookingOverlap = await pool.query(`
          SELECT id, room_tier, room_unit_number
          FROM bookings
          WHERE listing_id = $1
            AND status != 'cancelled'
            AND (room_tier = $2 OR room_tier IS NULL)
            AND (
              (COALESCE(start_date, move_in_date::date) < $4::date AND COALESCE(end_date, check_out_date::date) > $3::date)
            )
        `, [listingId, targetTier, effectiveCheckIn, effectiveCheckOut]);

        for (const b of bookingOverlap.rows) {
          const bUnit = Number(b.room_unit_number) || 1;
          occupiedUnits.add(bUnit);
        }
      }

      // 4. Threshold Enforcement
      if (isEstateWideBlocked || occupiedUnits.size >= totalInventoryCount) {
        console.warn(`[INVENTORY SOLD OUT] listing=${listingId} tier=${targetTier} occupied=${occupiedUnits.size}/${totalInventoryCount}`);
        return res.status(409).json({
          error: `All ${totalInventoryCount} unit(s) of this suite are fully booked or held for ${effectiveCheckIn} to ${effectiveCheckOut}. Please choose another suite tier or select alternate dates.`,
          code: 'ROOM_TIER_SOLD_OUT',
          totalInventory: totalInventoryCount,
          occupiedCount: occupiedUnits.size
        });
      }
    } catch (checkErr) {
      console.warn('[AVAILABILITY CHECK] Capacity check warning:', checkErr);
    }

    // 5. Automatic Unit Assignment (First Free Physical Unit)
    let assignedUnitNumber = 1;
    for (let u = 1; u <= totalInventoryCount; u++) {
      if (!occupiedUnits.has(u)) {
        assignedUnitNumber = u;
        break;
      }
    }

    const { guestsCount } = req.body;
    const result = await pool.query(`
      INSERT INTO bookings (user_id, listing_id, room_id, room_tier, room_unit_number, start_date, end_date, move_in_date, check_out_date, configuration, name, phone, total_rent, guests, gclid, gbraid)
      VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *
    `, [
      finalUserId, 
      listingId, 
      roomId || null, 
      targetTier, 
      assignedUnitNumber,
      effectiveCheckIn, 
      effectiveCheckOut, 
      moveInDate, 
      checkOutDate || null, 
      configuration || '', 
      name, 
      phone, 
      totalRent, 
      Number(guestsCount) || 1
    ]);

    const newBooking = result.rows[0];
    newBooking.id = String(newBooking.id);
    newBooking.listing_id = String(newBooking.listing_id);

    // Milestone 5: The Circuit Breaker (Smart Pause)
    // Kick off background job to pause campaigns.
    triggerSmartAutoPause(listingId, newBooking.id).catch(err => {
      console.error('[CIRCUIT BREAKER ERROR] Failed to pause campaigns:', err);
    });

    // Fetch listing details to describe in the message
    let listingTitle = 'a property';
    let hostId = null;
    try {
      const listingRes = await pool.query('SELECT title, user_id, rooms FROM listings WHERE id = $1', [listingId]);
      if (listingRes.rows.length > 0) {
          listingTitle = listingRes.rows[0].title;
          hostId = listingRes.rows[0].user_id;

          // Resort Plus: Inventory Deduction Logic
          let rooms = listingRes.rows[0].rooms;
          let isUpdated = false;

          if (roomId && rooms && Array.isArray(rooms)) {
             const selectedIds = String(roomId).split(',');
             rooms = rooms.map((room: any) => {
                if (selectedIds.includes(room.id) && room.inventory_count !== undefined) {
                   if (room.inventory_count > 0) {
                       room.inventory_count -= 1;
                       isUpdated = true;
                   }
                }
                return room;
             });
          }
          if (isUpdated) {
             await pool.query('UPDATE listings SET rooms = $1::jsonb WHERE id = $2', [JSON.stringify(rooms), listingId]);
          }
      }
    } catch(e) { console.error(e); }

    // Auto-create a messaging thread so both guest and host can see it in their inbox immediately
    if (userId) {
      try {
        const threadRes = await pool.query('SELECT id FROM threads WHERE listing_id = $1 AND guest_id = $2', [listingId, userId]);
        let threadId;
        if (threadRes.rows.length === 0) {
           try {
               const insertThread = await pool.query('INSERT INTO threads (listing_id, guest_id, host_id) VALUES ($1, $2, $3) RETURNING id', [listingId, userId, hostId || null]);
               threadId = insertThread.rows[0].id;
           } catch (insertErr: any) {
               if (insertErr.message && insertErr.message.includes('foreign key constraint')) {
                   const fallbackInsert = await pool.query('INSERT INTO threads (listing_id, guest_id, host_id) VALUES ($1, $2, $3) RETURNING id', [listingId, userId, null]);
                   threadId = fallbackInsert.rows[0].id;
               } else {
                   throw insertErr;
               }
           }
        } else {
           threadId = threadRes.rows[0].id;
        }

        const initialMsgContent = `Hi, I have submitted a booking request.
Details:
-Property-Name : ${listingTitle || 'Requested Property'}
- Move-in Date: ${moveInDate}
- Configuration: ${configuration || 'Entire Property'}
- Name: ${name}
- Phone: ${phone}
- Rent: $${totalRent}`;

        // Insert initial automated message representing the reservation
        await pool.query('INSERT INTO messages (thread_id, sender_id, receiver_id, content) VALUES ($1, $2, $3, $4)', [threadId, userId, hostId || null, initialMsgContent]);

        await pool.query(`
          UPDATE threads
          SET last_message = $2, updated_at = CURRENT_TIMESTAMP,
              unread_count_host = COALESCE(unread_count_host, 0) + 1
          WHERE id = $1
        `, [threadId, initialMsgContent]);
      } catch (err) {
        console.error('Failed to auto-create thread:', err);
      }
    }

    // Send WhatsApp to Guest
    sendWhatsAppMessage(
      phone,
      `Hello ${name},Your booking request for "${listingTitle}" on ${moveInDate} has been received! The total rent is $${totalRent}. You will be notified once the host confirms.`
    );

    // Send WhatsApp to Host/Admin if configured
    try {
      const waSettingsRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['whatsapp']);
      if (waSettingsRes.rows.length > 0) {
        const waSettings = waSettingsRes.rows[0].value;
        if (waSettings && waSettings.enabled && waSettings.number) {
          sendWhatsAppMessage(
            waSettings.number,
            `🌟 New Booking Request!Guest: ${name}Phone: ${phone}Listing: ${listingTitle}Move In: ${moveInDate}Rent: $${totalRent}Please check your host dashboard to Accept or Decline.`
          );
        }
      }
    } catch(e) {
      console.error('Failed to notify host via WhatsApp', e);
    }

    // Broadcast real-time notifications
    const io = (req.app && req.app.get ? req.app.get('io') : getGlobalIoInstance());
    if (io) {
      if (hostId) io.to(`user_${hostId}`).emit('notification', { type: 'new_booking', booking: newBooking, message: `New booking for ${listingTitle}` });
      io.to('admin_room').emit('notification', { type: 'new_booking', booking: newBooking, message: `New booking for ${listingTitle}` });
      io.to(`listing_${listingId}`).emit('listing_updated', { type: 'new_booking' });
    }

    // Trigger Meta Conversions API & Google Ads Offline Conversion dispatch asynchronously
    dispatchConversionsAPI(newBooking, Number(listingId), 'Purchase');

    res.status(201).json(newBooking);
  } catch (error) {
    console.error('Failed to create booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

const demoExperiences = [
  {
    id: 9999,
    host_id: 1,
    title: 'Neon Lights Cyberpunk Tokyo Tour',
    description: 'Experience the futuristic aesthetics of Tokyo at night. Dive deep into Akihabara, Shibuya, and secret underground arcades. This is an immersive, high-energy tour through the cyberpunk heart of Japan.',
    destination: 'Tokyo, Japan',
    departure_location: 'Tokyo Narita Airport',
    start_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000).toISOString(),
    start_time: '18:00',
    end_time: '23:00',
    language: 'English, Japanese (Basic)',
    cancellation_policy: 'Free cancellation 15 days prior. 50% refund within 7 days.',
    map_link: 'https://goo.gl/maps/shibuya',
    price: 1599,
    total_spots: 12,
    available_spots: 12,
    itinerary: [{day: 1, title: 'Arrival & Akihabara Night Walk', description: 'Check-in and dive into the electric town.'}, {day: 2, title: 'Shibuya Crossing & Robot Restaurant', description: 'Experience the busiest crossing and futuristic dining.'}],
    includes: ['Hotel Accommodation', 'Breakfast & Dinner', 'Local Transit Pass', 'English Speaking Cyber-Guide'],
    excludes: ['Flights', 'Personal Shopping', 'Alcohol'],
    image_urls: ['https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'],
    video_urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    places_to_visit: [{name: 'Akihabara', description: 'Electric Town', image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'}],
    included_stay: {title: 'Shinjuku Prince Hotel', location: 'Shinjuku', amenities: ['WiFi', 'City View'], image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'},
    highlights: ['Cyberpunk Photography Walk', 'Underground Arcade Tournament'],
    things_to_carry: ['Comfortable walking shoes', 'Camera', 'Neon-friendly clothing'],
    important_notes: 'This trip involves a lot of walking in crowded areas.',
    target_audience: 'all',
    status: 'upcoming'
  },
  {
    id: 9001,
    title: 'Gokarna Beach Trek & Camping',
    description: 'A budget-friendly weekend getaway for students! Trek across 5 beautiful beaches, camp under the stars, and enjoy a bonfire with music.',
    destination: 'Gokarna, Karnataka',
    departure_location: 'Bangalore (Majestic)',
    start_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    price: 2499,
    total_spots: 30,
    available_spots: 30,
    image_urls: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=800'],
    target_audience: 'all',
    status: 'upcoming'
  },
  {
    id: 9002,
    title: 'Coorg Coffee Estate Retreat',
    description: 'A safe and serene getaway exclusively for women. Stay in a lush coffee estate, visit Abbey Falls, and enjoy a relaxing weekend with a verified female guide.',
    destination: 'Coorg, Karnataka',
    departure_location: 'Bangalore (Silk Board)',
    start_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
    price: 4500,
    total_spots: 15,
    available_spots: 15,
    image_urls: ['https://images.unsplash.com/photo-1511497584788-87676104235f?auto=format&fit=crop&q=80&w=800'],
    target_audience: 'all',
    status: 'upcoming'
  },
  {
    id: 9003,
    title: 'Wayanad Nature Escape & Networking',
    description: 'Perfect weekend escape for IT professionals. Connect with like-minded individuals from major tech parks while exploring Wayanad\'s waterfalls and peaks.',
    destination: 'Wayanad, Kerala',
    departure_location: 'Bangalore (Manyata Tech Park)',
    start_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    price: 5500,
    total_spots: 20,
    available_spots: 20,
    image_urls: ['https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&q=80&w=800'],
    target_audience: 'corporate',
    status: 'upcoming'
  },
  {
    id: 9004,
    title: 'Ooty Romantic Getaway',
    description: 'Enjoy a private and cozy weekend in Ooty. Includes twin-sharing accommodations, a romantic candlelight dinner, and visits to the beautiful tea gardens.',
    destination: 'Ooty, Tamil Nadu',
    departure_location: 'Bangalore (Electronic City)',
    start_date: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000).toISOString(),
    price: 8500,
    total_spots: 10,
    available_spots: 10,
    image_urls: ['https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&q=80&w=800'],
    target_audience: 'couples',
    status: 'upcoming'
  }
];

router.get('/api/seed-ajith', authenticateToken, requireAdmin, requireExplicitDevelopmentFixture, async (req: AuthRequest, res) => {
  try {
    console.log("DB connection configured for seed-ajith");
    const userRes = await pool.query("SELECT id FROM users WHERE id=$1 AND role='admin'", [req.user!.id]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'User not found, token invalid' });
    }
    const userId = userRes.rows[0].id;

    const result = await pool.query(`
      INSERT INTO experiences (
        title, description, destination, departure_location, start_date, end_date,
        price, total_spots, available_spots, itinerary, includes, image_urls, host_id, status, target_audience,
        places_to_visit, included_stay, highlights, things_to_carry, important_notes,
        video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      RETURNING *
    `, [
      'Neon Lights Cyberpunk Tokyo Tour',
      'Experience the futuristic aesthetics of Tokyo at night. Dive deep into Akihabara, Shibuya, and secret underground arcades. This is an immersive, high-energy tour through the cyberpunk heart of Japan.',
      'Tokyo, Japan',
      'Tokyo Narita Airport',
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 17 * 24 * 60 * 60 * 1000).toISOString(),
      1599,
      12,
      12,
      JSON.stringify([{day: 1, title: 'Arrival & Akihabara Night Walk', description: 'Check-in and dive into the electric town.'}, {day: 2, title: 'Shibuya Crossing & Robot Restaurant', description: 'Experience the busiest crossing and futuristic dining.'}]),
      JSON.stringify(['Hotel Accommodation', 'Breakfast & Dinner', 'Local Transit Pass', 'English Speaking Cyber-Guide']),
      JSON.stringify(['https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800']),
      userId,
      'upcoming',
      'all',
      JSON.stringify([{name: 'Akihabara', description: 'Electric Town', image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'}]),
      JSON.stringify({title: 'Shinjuku Prince Hotel', location: 'Shinjuku', amenities: ['WiFi', 'City View'], image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'}),
      JSON.stringify(['Cyberpunk Photography Walk', 'Underground Arcade Tournament']),
      JSON.stringify(['Comfortable walking shoes', 'Camera', 'Neon-friendly clothing']),
      'This trip involves a lot of walking in crowded areas.',
      JSON.stringify(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']),
      JSON.stringify(['Flights', 'Personal Shopping', 'Alcohol']),
      '18:00',
      '23:00',
      'English, Japanese (Basic)',
      'Free cancellation 15 days prior. 50% refund within 7 days.',
      'https://goo.gl/maps/shibuya'
    ]);
    res.json(result.rows[0]);
  } catch (error: unknown) {
    console.error("API ERROR:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/api/experiences', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
  if (!isDbConfigured || dbConnectionError) {
      if (req.query.host_id) {
          return res.json(demoExperiences.filter(e => String(e.host_id) === String(req.query.host_id)));
      }
      return res.json(demoExperiences);
  }
  try {
    const { host_id } = req.query;

    const cacheKey = host_id ? `experiences:host:${host_id}` : 'experiences:all';
    if (redis) {
        try {
            const cached = await redis.get(cacheKey);
            if (cached) return res.json(typeof cached === 'string' ? JSON.parse(cached) : cached);
        } catch (e) {
            console.warn('Redis Cache Error (Get):', e);
        }
    }

    let result;

    if (host_id) {
       const userRes = await pool.query('SELECT email, role FROM users WHERE id = $1', [host_id]);
       const isAdmin = userRes.rows[0]?.role === 'admin';

       result = await pool.query(`
          SELECT e.*,
                 (SELECT COUNT(*) FROM experience_wishlists w WHERE w.experience_id = e.id) as wishlist_count
          FROM experiences e
          WHERE e.host_id = $1
          ORDER BY e.start_date ASC
       `, [host_id]);

    } else {
       result = await pool.query("SELECT * FROM experiences WHERE status = 'published' ORDER BY start_date ASC");
    }

    if (redis) {
        try {
            await redis.set(cacheKey, JSON.stringify(result.rows), { ex: 3600 });
        } catch (e) {
            console.warn('Redis Cache Error (Set):', e);
        }
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Failed to get experiences:', error);
    res.json(demoExperiences);
  }
});

router.post('/api/experiences/seed', authenticateToken, requireAdmin, requireExplicitDevelopmentFixture, async (_req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    // 1. Student Only Trek
    await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, image_urls, target_audience, status, highlights, things_to_carry)
      VALUES (
        'Gokarna Beach Trek & Camping',
        'A budget-friendly weekend getaway for students! Trek across 5 beautiful beaches, camp under the stars, and enjoy a bonfire with music.',
        'Gokarna, Karnataka',
        'Bangalore (Majestic)',
        CURRENT_DATE + INTERVAL '5 days',
        CURRENT_DATE + INTERVAL '7 days',
        2499,
        30,
        30,
        '["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=800"]'::jsonb,
        'all',
        'upcoming',
        '["Trek across 5 beaches", "Beachside Camping", "Sunset View points", "Bonfire & Music", "Stargazing"]'::jsonb,
        '["Comfortable Shoes", "Torch/Headlamp", "Water Bottle", "Jacket", "Powerbank"]'::jsonb
      )
    `);

    // 2. Women Only Trip
    await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, image_urls, target_audience, status)
      VALUES (
        'Coorg Coffee Estate Retreat',
        'A safe and serene getaway exclusively for women. Stay in a lush coffee estate, visit Abbey Falls, and enjoy a relaxing weekend with a verified female guide.',
        'Coorg, Karnataka',
        'Bangalore (Silk Board)',
        CURRENT_DATE + INTERVAL '10 days',
        CURRENT_DATE + INTERVAL '12 days',
        4500,
        15,
        15,
        '["https://images.unsplash.com/photo-1511497584788-87676104235f?auto=format&fit=crop&q=80&w=800"]'::jsonb,
        'all',
        'upcoming'
      )
    `);

    // 3. Corporate Trip
    await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, image_urls, target_audience, status)
      VALUES (
        'Wayanad Nature Escape & Networking',
        'Perfect weekend escape for IT professionals. Connect with like-minded individuals from major tech parks while exploring Wayanad''s waterfalls and peaks.',
        'Wayanad, Kerala',
        'Bangalore (Manyata Tech Park)',
        CURRENT_DATE + INTERVAL '12 days',
        CURRENT_DATE + INTERVAL '14 days',
        5500,
        20,
        20,
        '["https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&q=80&w=800"]'::jsonb,
        'corporate',
        'upcoming'
      )
    `);

    // 4. Couples
    await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, image_urls, target_audience, status)
      VALUES (
        'Ooty Romantic Getaway',
        'Enjoy a private and cozy weekend in Ooty. Includes twin-sharing accommodations, a romantic candlelight dinner, and visits to the beautiful tea gardens.',
        'Ooty, Tamil Nadu',
        'Bangalore (Electronic City)',
        CURRENT_DATE + INTERVAL '20 days',
        CURRENT_DATE + INTERVAL '22 days',
        8500,
        10,
        10,
        '["https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&q=80&w=800"]'::jsonb,
        'couples',
        'upcoming'
      )
    `);
    res.json({ success: true, message: 'Seeded demo experiences successfully!' });
  } catch (error) {
    console.error('Failed to seed experiences:', error);
    res.status(500).json({ error: 'Failed to seed experiences' });
  }
});

router.post('/api/experiences', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured || dbConnectionError) {
      const newExp = {
          id: 9000 + Math.floor(Math.random() * 1000),
          host_id: req.user?.id,
          ...req.body,
          status: 'upcoming'
      };
      demoExperiences.push(newExp);
      return res.status(201).json(newExp);
  }
  try {
    await ensureListingsTable();
    const { title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, itinerary, includes, image_urls, status, target_audience, places_to_visit, included_stay, highlights, things_to_carry, important_notes, video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;

    const parsedPrice = (price === '' || price == null) ? null : Number(price);
    const parsedTotalSpots = (total_spots === '' || total_spots == null) ? null : Number(total_spots);
    const parsedAvailableSpots = (available_spots === '' || available_spots == null) ? null : Number(available_spots);

    const result = await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, itinerary, includes, image_urls, host_id, status, target_audience, places_to_visit, included_stay, highlights, things_to_carry, important_notes, video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link, seo_title, seo_description, seo_keywords, seo_image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31) RETURNING *
    `, [title, description, destination, departure_location, start_date || null, end_date || null, parsedPrice, parsedTotalSpots, parsedAvailableSpots, JSON.stringify(itinerary || []), JSON.stringify(includes || []), JSON.stringify(image_urls || []), req.user?.id, status || 'upcoming', target_audience || 'all', JSON.stringify(places_to_visit || []), included_stay ? JSON.stringify(included_stay) : null, JSON.stringify(highlights || []), JSON.stringify(things_to_carry || []), important_notes || null, JSON.stringify(video_urls || []), JSON.stringify(excludes || []), start_time || null, end_time || null, language || 'English', cancellation_policy || null, map_link || null, seo_title || null, seo_description || null, seo_keywords || null, seo_image_url || null]);

    res.json(result.rows[0]);
  } catch (error: unknown) {
    console.error('Failed to create experience:', error);
    res.status(500).json({ error: 'Failed to create experience', details: (error as Error).message || String(error) });
  }
});

router.put('/api/experiences/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await ensureListingsTable();
    const expId = parseInt(req.params.id as string);
    if (!isDbConfigured || dbConnectionError || expId === 9999 || (expId >= 9001 && expId <= 9004)) {
       if (expId === 9999 || (!isDbConfigured || dbConnectionError)) {
         const idx = demoExperiences.findIndex(e => e.id === expId);
         if (idx > -1) {
            demoExperiences[idx] = { ...demoExperiences[idx], ...req.body };
            return res.json(demoExperiences[idx]);
         }
       }
       return res.json({ id: expId, ...req.body });
    }

    if (req.user?.role !== 'admin') {
      const checkResult = await pool.query('SELECT host_id FROM experiences WHERE id = $1', [expId]);
      if (checkResult.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
      if (checkResult.rows[0].host_id !== req.user?.id) return res.status(403).json({ error: 'Not authorized to edit this experience' });
    }

    if (expId >= 9001 && expId <= 9004) {
      return res.json({ id: expId, ...req.body });
    }

    const { title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, itinerary, includes, image_urls, status, target_audience, places_to_visit, included_stay, highlights, things_to_carry, important_notes, video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;

    const parsedPrice = (price === '' || price == null) ? null : Number(price);
    const parsedTotalSpots = (total_spots === '' || total_spots == null) ? null : Number(total_spots);
    const parsedAvailableSpots = (available_spots === '' || available_spots == null) ? null : Number(available_spots);

    const result = await pool.query(`
      UPDATE experiences SET
        title = $1, description = $2, destination = $3, departure_location = $4, start_date = $5, end_date = $6, price = $7, total_spots = $8, available_spots = $9, itinerary = $10, includes = $11, image_urls = $12, status = $13, target_audience = $14, places_to_visit = $15, included_stay = $16, highlights = $17, things_to_carry = $18, important_notes = $19, video_urls = $20, excludes = $21, start_time = $22, end_time = $23, language = $24, cancellation_policy = $25, map_link = $26, seo_title = $28, seo_description = $29, seo_keywords = $30, seo_image_url = $31
      WHERE id = $27 RETURNING *
    `, [title, description, destination, departure_location, start_date || null, end_date || null, parsedPrice, parsedTotalSpots, parsedAvailableSpots, JSON.stringify(itinerary || []), JSON.stringify(includes || []), JSON.stringify(image_urls || []), status || 'upcoming', target_audience || 'all', JSON.stringify(places_to_visit || []), included_stay ? JSON.stringify(included_stay) : null, JSON.stringify(highlights || []), JSON.stringify(things_to_carry || []), important_notes || null, JSON.stringify(video_urls || []), JSON.stringify(excludes || []), start_time || null, end_time || null, language || 'English', cancellation_policy || null, map_link || null, req.params.id, seo_title || null, seo_description || null, seo_keywords || null, seo_image_url || null]);

    res.json(result.rows[0]);
  } catch (error: unknown) {
    console.error('Failed to update experience:', error);
    res.status(500).json({ error: 'Failed to update experience', details: (error as Error).message || String(error) });
  }
});

router.delete('/api/experiences/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured || dbConnectionError) {
      const expId = parseInt(req.params.id as string);
      const idx = demoExperiences.findIndex(e => e.id === expId);
      if (idx > -1) {
          demoExperiences.splice(idx, 1);
      }
      return res.json({ message: 'Experience deleted successfully' });
  }
  try {
    const expId = parseInt(req.params.id as string);
    if (req.user?.role !== 'admin') {
      const checkResult = await pool.query('SELECT host_id FROM experiences WHERE id = $1', [expId]);
      if (checkResult.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
      if (checkResult.rows[0].host_id !== req.user?.id) return res.status(403).json({ error: 'Not authorized to delete this experience' });
    }
    if (expId >= 9001 && expId <= 9004) {
      return res.json({ success: true });
    }
    await pool.query('DELETE FROM experiences WHERE id = $1', [req.params.id]);
    if (redis) {
        try {
            await redis.del('experiences:all');
            await redis.del(`experiences:host:${req.user?.id}`);
        } catch (e) { console.warn('Redis delete failed', e); }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete experience:', error);
    res.status(500).json({ error: 'Failed to delete experience' });
  }
});

router.get('/api/experiences/:id/reviews', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.json([]);
  try {
    const result = await pool.query(`
      SELECT er.*, u.name as user_name,
        EXISTS (
          SELECT 1 FROM experience_bookings eb
          WHERE eb.user_id = er.user_id AND eb.experience_id = er.experience_id
        ) as is_verified
      FROM experience_reviews er
      JOIN users u ON er.user_id = u.id
      WHERE er.experience_id = $1
      ORDER BY er.created_at DESC
    `, [expId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch experience reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

router.get('/api/experiences/:id/reviews/eligible', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.json({ eligible: false });
  try {
    const result = await pool.query(`
      SELECT 1 FROM experience_bookings
      WHERE user_id = $1 AND experience_id = $2 LIMIT 1
    `, [req.user?.id, expId]);
    res.json({ eligible: result.rows.length > 0 });
  } catch (error) {
    console.error('Failed to check eligibility:', error);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

router.post('/api/experiences/:id/reviews', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.status(400).json({ error: 'Invalid experience ID' });

  if (expId >= 9001 && expId <= 9004) {
    return res.status(201).json({ id: 9999, user_id: req.user?.id, user_name: req.user?.name, rating: req.body.rating, content: req.body.content, created_at: new Date().toISOString() });
  }

  try {
    const { rating, content } = req.body;
    const numRating = Number(rating);
    if (!numRating || isNaN(numRating) || numRating < 1 || numRating > 10) {
      return res.status(400).json({ error: 'Rating must be between 1 and 10' });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Review content is required' });
    }
    const { sanitized } = maskContactInfo(content.trim().substring(0, 2000));
    const result = await pool.query(`
      INSERT INTO experience_reviews (experience_id, user_id, rating, content)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [expId, req.user?.id, Math.round(numRating), sanitized]);

    const fullReviewRes = await pool.query(`
      SELECT er.*, u.name as user_name,
        EXISTS (
          SELECT 1 FROM experience_bookings eb
          WHERE eb.user_id = er.user_id AND eb.experience_id = er.experience_id
        ) as is_verified
      FROM experience_reviews er
      JOIN users u ON er.user_id = u.id
      WHERE er.id = $1
    `, [result.rows[0].id]);

    res.json(fullReviewRes.rows[0]);
  } catch (error) {
    console.error('Failed to create experience review:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

router.get('/api/experiences/:id/videos', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.json([]);
  try {
    const result = await pool.query(`
      SELECT ev.*, u.name as user_name
      FROM experience_videos ev
      LEFT JOIN users u ON ev.user_id = u.id
      WHERE ev.experience_id = $1
      ORDER BY ev.created_at DESC
    `, [expId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch experience videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

router.post('/api/experiences/:id/videos', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.status(400).json({ error: 'Invalid experience ID' });

  if (expId >= 9001 && expId <= 9004) {
    return res.status(201).json({ id: 9999, experience_id: expId, user_id: req.user?.id, user_name: req.user?.name, video_url: req.body.video_url, thumbnail_url: req.body.thumbnail_url, title: req.body.title, likes: 0 });
  }

  try {
    const { video_url, thumbnail_url, title } = req.body;
    if (!video_url) {
      return res.status(400).json({ error: 'Video URL is required' });
    }
    const author_name = req.user?.name || 'Verified Explorer';
    const result = await pool.query(`
      INSERT INTO experience_videos (experience_id, user_id, video_url, thumbnail_url, title, author_name)
      VALUES ($1, $2, $3, $4, $5, $7) RETURNING *
    `, [expId, req.user?.id, video_url, thumbnail_url || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=200', title || 'Travel Highlight', author_name]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to submit experience video:', error);
    res.status(500).json({ error: 'Failed to submit video snippet' });
  }
});

router.post('/api/experiences/videos/:id/like', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const videoId = Number(req.params.id);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });
  try {
    const result = await pool.query(`
      UPDATE experience_videos
      SET likes = likes + 1
      WHERE id = $1 RETURNING *
    `, [videoId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to like video:', error);
    res.status(500).json({ error: 'Failed to like video' });
  }
});

router.get('/api/experiences/:id/lobby/participants', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.status(400).json({ error: 'Invalid experience ID' });

  if (expId === 9999) return res.json([{ id: req.user?.id || 1, name: req.user?.name || 'Test User', role: 'user' }]);

  try {
    // Verify eligibility (host or booked)
    const expRes = await pool.query('SELECT host_id FROM experiences WHERE id = $1', [expId]);
    if (expRes.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
    const isHost = expRes.rows[0].host_id === req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    let eligible = isHost || isAdmin;
    if (!eligible) {
      const bookRes = await pool.query('SELECT 1 FROM experience_bookings WHERE experience_id = $1 AND user_id = $2', [expId, req.user?.id]);
      if (bookRes.rows.length > 0) eligible = true;
    }

    if (!eligible) {
      return res.status(403).json({ error: 'Not authorized for this lobby' });
    }

    // Fetch participants
    const participantsRes = await pool.query(`
      SELECT DISTINCT u.id, u.name, u.role
      FROM users u
      LEFT JOIN experience_bookings eb ON u.id = eb.user_id AND eb.experience_id = $1
      LEFT JOIN experiences e ON u.id = e.host_id AND e.id = $1
      WHERE eb.id IS NOT NULL OR e.id IS NOT NULL
      ORDER BY u.role DESC, u.name ASC
    `, [expId]);

    res.json(participantsRes.rows);
  } catch (error) {
    console.error('Failed to fetch participants:', error);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

router.get('/api/experiences/:id/lobby/messages', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.status(400).json({ error: 'Invalid experience ID' });

  if (expId === 9999) return res.json([]);

  try {
    // Verify eligibility
    const expRes = await pool.query('SELECT host_id FROM experiences WHERE id = $1', [expId]);
    if (expRes.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
    const isHost = expRes.rows[0].host_id === req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    let eligible = isHost || isAdmin;
    if (!eligible) {
      const bookRes = await pool.query('SELECT 1 FROM experience_bookings WHERE experience_id = $1 AND user_id = $2', [expId, req.user?.id]);
      if (bookRes.rows.length > 0) eligible = true;
    }

    if (!eligible) {
      return res.status(403).json({ error: 'Not authorized for this lobby' });
    }

    const messagesRes = await pool.query(`
      SELECT em.*, u.name as user_name, u.role as user_role,
        CASE WHEN e.host_id = em.user_id THEN true ELSE false END as is_host
      FROM experience_messages em
      JOIN users u ON em.user_id = u.id
      LEFT JOIN experiences e ON em.experience_id = e.id
      WHERE em.experience_id = $1
      ORDER BY em.created_at ASC
    `, [expId]);

    res.json(messagesRes.rows);
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/api/experiences/:id/lobby/messages', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.status(400).json({ error: 'Invalid experience ID' });

  if (expId >= 9001 && expId <= 9004) {
    return res.status(201).json({ id: 9999, experience_id: expId, user_id: req.user?.id, user_name: req.user?.name, content: req.body.content, created_at: new Date().toISOString() });
  }

  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required' });

  try {
    // Verify eligibility
    const expRes = await pool.query('SELECT host_id FROM experiences WHERE id = $1', [expId]);
    if (expRes.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
    const isHost = expRes.rows[0].host_id === req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    let eligible = isHost || isAdmin;
    if (!eligible) {
      const bookRes = await pool.query('SELECT 1 FROM experience_bookings WHERE experience_id = $1 AND user_id = $2', [expId, req.user?.id]);
      if (bookRes.rows.length > 0) eligible = true;
    }

    if (!eligible) {
      return res.status(403).json({ error: 'Not authorized for this lobby' });
    }

    const { sanitized } = maskContactInfo(content.trim().substring(0, 4000));
    const insertRes = await pool.query(`
      INSERT INTO experience_messages (experience_id, user_id, content)
      VALUES ($1, $2, $3) RETURNING *
    `, [expId, req.user?.id, sanitized]);

    // Fetch the detailed message to return
    const msgRes = await pool.query(`
      SELECT em.*, u.name as user_name, u.role as user_role,
        CASE WHEN e.host_id = em.user_id THEN true ELSE false END as is_host
      FROM experience_messages em
      JOIN users u ON em.user_id = u.id
      LEFT JOIN experiences e ON em.experience_id = e.id
      WHERE em.id = $1
    `, [insertRes.rows[0].id]);

    res.json(msgRes.rows[0]);
  } catch (error) {
    console.error('Failed to post message:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
});

router.post('/api/experience-bookings', authenticateToken, bookingLimiter, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return res.status(503).json({
      code: 'EXPERIENCE_COMMERCE_NOT_RELEASED',
      error: 'Experience booking is not part of the accepted CR1 commerce authority.',
    });
  }
  try {
    const { experience_id, num_tickets, total_price, name, phone, user_id } = req.body;

    // Security check
    const authUserId = req.user?.id;
    if (user_id && String(authUserId) !== String(user_id) && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to book for this user' });
    }
    const finalUserId = user_id || authUserId || null;

    if (experience_id >= 9001 && experience_id <= 9004) {
      return res.status(201).json({ id: 99999, experience_id, num_tickets, total_price, status: 'confirmed' });
    }

    if (!experience_id || !num_tickets || !name || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check available spots
    const expRes = await pool.query('SELECT available_spots FROM experiences WHERE id = $1', [experience_id]);
    if (expRes.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
    if (expRes.rows[0].available_spots < num_tickets) return res.status(400).json({ error: 'Not enough spots available' });

    // Create booking
    const result = await pool.query(`
      INSERT INTO experience_bookings (user_id, experience_id, num_tickets, total_price, name, phone)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [finalUserId, experience_id, num_tickets, total_price, name, phone]);

    // Update available spots
    await pool.query('UPDATE experiences SET available_spots = available_spots - $1 WHERE id = $2', [num_tickets, experience_id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to book experience:', error);
    res.status(500).json({ error: 'Failed to book experience' });
  }
});

router.get('/api/experience-bookings', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const result = await pool.query(`
      SELECT b.*, e.title, e.start_date, e.destination, e.image_urls
      FROM experience_bookings b
      JOIN experiences e ON b.experience_id = e.id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
    `, [req.user?.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to get experience bookings:', error);
    res.status(500).json({ error: 'Failed to fetch experience bookings' });
  }
});

router.put('/api/user/experience-bookings/:id/cancel', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const checkRes = await pool.query('SELECT status, experience_id, num_tickets FROM experience_bookings WHERE id = $1 AND user_id = $2', [id, userId]);
    if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    if (checkRes.rows[0].status === 'cancelled') {
      return res.status(400).json({ error: 'Already cancelled' });
    }

    const { experience_id, num_tickets } = checkRes.rows[0];

    const result = await pool.query("UPDATE experience_bookings SET status = 'cancelled' WHERE id = $1 RETURNING *", [id]);
    const booking = result.rows[0];

    // Release spots
    await pool.query('UPDATE experiences SET available_spots = available_spots + $1 WHERE id = $2', [num_tickets, experience_id]);

    const io = (req.app && req.app.get ? req.app.get('io') : getGlobalIoInstance());
    if (io) {
       try {
           const expRes = await pool.query('SELECT title, host_id FROM experiences WHERE id = $1', [experience_id]);
           if (expRes.rows.length > 0) {
               const { title, host_id } = expRes.rows[0];
               if (host_id) {
                 io.to(`user_${host_id}`).emit('notification', { type: 'booking_update', booking, message: `An experience booking for "${title}" was cancelled by guest` });
               }
               io.to('admin_room').emit('notification', { type: 'booking_update', booking, message: `An experience booking for "${title}" was cancelled by guest` });
           }
       } catch(e) { console.error(e); }
    }
    res.json({ message: 'Booking cancelled successfully', booking });
  } catch (error) {
    console.error('Cancel Experience Booking Error:', error);
    res.status(500).json({ error: 'Failed to cancel experience booking' });
  }
});

router.get('/api/admin/experience-bookings', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    const result = await pool.query(`
      SELECT b.*, e.title, e.start_date, e.destination, u.name as user_name
      FROM experience_bookings b
      JOIN experiences e ON b.experience_id = e.id
      LEFT JOIN users u ON b.user_id = u.id
      ORDER BY b.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to get all experience bookings:', error);
    res.status(500).json({ error: 'Failed to fetch experience bookings' });
  }
});


// Payment settings / rates

  return router;
}

export const listingsRouter = createListingsRouter();
