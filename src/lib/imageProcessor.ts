import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fsSync from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummy',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummy'
  }
});

export const processMarketingAssets = async (buffer: Buffer, mimeType: string, baseUrl: string = '') => {
  if (!buffer || !mimeType) return null;
  
  if (mimeType.startsWith('video/')) {
     return processVideoAsset(buffer, mimeType, baseUrl);
  }

  // Process Images into required Meta Aspect Ratios
  try {
    const baseImage = sharp(buffer);
    
    // 1. Reel / Story format (9:16)
    const reelBuffer = await baseImage.clone()
      .resize(1080, 1920, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 90 })
      .toBuffer();

    // 2. Feed / Carousel format (1:1)
    const feedBuffer = await baseImage.clone()
      .resize(1080, 1080, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 90 })
      .toBuffer();

    // 3. Landscape format (16:9)
    const landscapeBuffer = await baseImage.clone()
      .resize(1920, 1080, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 90 })
      .toBuffer();
      
    // 4. PMax Landscape (1.91:1)
    const pmaxLandscapeBuffer = await baseImage.clone()
      .resize(1200, 628, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 90 })
      .toBuffer();

    // 5. PMax Portrait (4:5)
    const pmaxPortraitBuffer = await baseImage.clone()
      .resize(1080, 1350, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Upload to S3
    const bucket = process.env.AWS_S3_BUCKET_NAME || 'encho-assets';
    const hashId = crypto.randomBytes(16).toString('hex');
    
    const reelKey = `marketing/reels/${hashId}.jpg`;
    const feedKey = `marketing/feed/${hashId}.jpg`;
    const landscapeKey = `marketing/landscape/${hashId}.jpg`;
    const pmaxLandKey = `marketing/pmax_land/${hashId}.jpg`;
    const pmaxPortKey = `marketing/pmax_port/${hashId}.jpg`;

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== 'dummy') {
        await Promise.all([
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: reelKey, Body: reelBuffer, ContentType: 'image/jpeg' })),
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: feedKey, Body: feedBuffer, ContentType: 'image/jpeg' })),
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: landscapeKey, Body: landscapeBuffer, ContentType: 'image/jpeg' })),
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: pmaxLandKey, Body: pmaxLandscapeBuffer, ContentType: 'image/jpeg' })),
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: pmaxPortKey, Body: pmaxPortraitBuffer, ContentType: 'image/jpeg' }))
        ]);
        return {
            reel_url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${reelKey}`,
            feed_url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${feedKey}`,
            landscape_url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${landscapeKey}`,
            pmax_landscape_url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${pmaxLandKey}`,
            pmax_portrait_url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${pmaxPortKey}`
        };
    } else {
        const publicDir = path.join(process.cwd(), 'public');
        const uploadDir = path.join(publicDir, 'marketing');
        fsSync.mkdirSync(path.join(uploadDir, 'reels'), { recursive: true });
        fsSync.mkdirSync(path.join(uploadDir, 'feed'), { recursive: true });
        fsSync.mkdirSync(path.join(uploadDir, 'landscape'), { recursive: true });
        fsSync.mkdirSync(path.join(uploadDir, 'pmax_land'), { recursive: true });
        fsSync.mkdirSync(path.join(uploadDir, 'pmax_port'), { recursive: true });
        
        fsSync.writeFileSync(path.join(publicDir, reelKey), reelBuffer);
        fsSync.writeFileSync(path.join(publicDir, feedKey), feedBuffer);
        fsSync.writeFileSync(path.join(publicDir, landscapeKey), landscapeBuffer);
        fsSync.writeFileSync(path.join(publicDir, pmaxLandKey), pmaxLandscapeBuffer);
        fsSync.writeFileSync(path.join(publicDir, pmaxPortKey), pmaxPortraitBuffer);

        const base = baseUrl.replace(/\/$/, '');
        return {
            reel_url: `${base}/${reelKey}`,
            feed_url: `${base}/${feedKey}`,
            landscape_url: `${base}/${landscapeKey}`,
            pmax_landscape_url: `${base}/${pmaxLandKey}`,
            pmax_portrait_url: `${base}/${pmaxPortKey}`
        };
    }
  } catch (e) {
      console.error('[IMAGE PROCESSOR] Failed to process image:', e);
      return null;
  }
};

const processVideoAsset = async (buffer: Buffer, mimeType: string, baseUrl: string = '') => {
    console.log('[VIDEO PROCESSOR] Starting video edge transcoding pipeline...');
    
    const hashId = crypto.randomBytes(16).toString('hex');
    const bucket = process.env.AWS_S3_BUCKET_NAME || 'encho-assets';
    const tmpInput = path.join('/tmp', `${hashId}_input.mp4`);
    const tmpReel = path.join('/tmp', `${hashId}_reel.mp4`);
    const tmpFeed = path.join('/tmp', `${hashId}_feed.mp4`);
    
    fsSync.writeFileSync(tmpInput, buffer);

    try {
        await new Promise((resolve, reject) => {
            // Transcode to 9:16 (Reel)
            ffmpeg(tmpInput)
                .size('1080x1920')
                .autopad()
                .videoCodec('libx264')
                .format('mp4')
                .on('end', resolve)
                .on('error', reject)
                .save(tmpReel);
        });

        await new Promise((resolve, reject) => {
            // Transcode to 1:1 (Feed)
            ffmpeg(tmpInput)
                .size('1080x1080')
                .autopad()
                .videoCodec('libx264')
                .format('mp4')
                .on('end', resolve)
                .on('error', reject)
                .save(tmpFeed);
        });

        const reelBuffer = fsSync.readFileSync(tmpReel);
        const feedBuffer = fsSync.readFileSync(tmpFeed);
        
        const reelKey = `marketing/reels/${hashId}.mp4`;
        const feedKey = `marketing/feed/${hashId}.mp4`;

        // Cleanup tmp files
        fsSync.unlinkSync(tmpInput);
        fsSync.unlinkSync(tmpReel);
        fsSync.unlinkSync(tmpFeed);

        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== 'dummy') {
            await Promise.all([
                s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: reelKey, Body: reelBuffer, ContentType: 'video/mp4' })),
                s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: feedKey, Body: feedBuffer, ContentType: 'video/mp4' }))
            ]);
            return {
                reel_url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${reelKey}`,
                feed_url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${feedKey}`,
                landscape_url: null
            };
        }
        
        const publicDir = path.join(process.cwd(), 'public');
        fsSync.mkdirSync(path.join(publicDir, 'marketing', 'reels'), { recursive: true });
        fsSync.mkdirSync(path.join(publicDir, 'marketing', 'feed'), { recursive: true });
        
        fsSync.writeFileSync(path.join(publicDir, reelKey), reelBuffer);
        fsSync.writeFileSync(path.join(publicDir, feedKey), feedBuffer);
        
        const base = baseUrl.replace(/\/$/, '');
        return {
            reel_url: `${base}/${reelKey}`,
            feed_url: `${base}/${feedKey}`,
            landscape_url: null
        };
    } catch (error) {
        console.error('[VIDEO PROCESSOR] Transcoding failed:', error);
        // Fallback to original buffer
        return {
            reel_url: null,
            feed_url: null,
            landscape_url: null
        };
    }
}
