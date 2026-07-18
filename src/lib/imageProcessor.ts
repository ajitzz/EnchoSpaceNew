import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummy',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummy'
  }
});

export const processMarketingAssets = async (buffer: Buffer, mimeType: string) => {
  if (!buffer || !mimeType) return null;
  
  // For video (reels/stories), we would ideally use ffmpeg via a Lambda or external service
  // Since we are in a container, we'll focus on image processing (carousels/story images) for now
  if (mimeType.startsWith('video/')) {
     return processVideoAsset(buffer, mimeType);
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

    // Upload to S3
    const bucket = process.env.AWS_S3_BUCKET_NAME || 'encho-assets';
    const hashId = crypto.randomBytes(16).toString('hex');
    
    const reelKey = `marketing/reels/${hashId}.jpg`;
    const feedKey = `marketing/feed/${hashId}.jpg`;

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== 'dummy') {
        await Promise.all([
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: reelKey, Body: reelBuffer, ContentType: 'image/jpeg' })),
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: feedKey, Body: feedBuffer, ContentType: 'image/jpeg' }))
        ]);
        return {
            reel_url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${reelKey}`,
            feed_url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${feedKey}`
        };
    } else {
        // Fallback for dev mode
        return {
            reel_url: `https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=1080&h=1920`,
            feed_url: `https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=1080&h=1080`
        };
    }
  } catch (e) {
      console.error('[IMAGE PROCESSOR] Failed to process image:', e);
      return null;
  }
};

const processVideoAsset = async (buffer: Buffer, mimeType: string) => {
    // In a real environment, you'd trigger an AWS MediaConvert job or send to a dedicated FFMPEG microservice.
    // For now, we simulate the upload process and return a placeholder if AWS isn't configured.
    console.log('[VIDEO PROCESSOR] Processing video asset (Simulation for FFMPEG pipeline)');
    const bucket = process.env.AWS_S3_BUCKET_NAME || 'encho-assets';
    const hashId = crypto.randomBytes(16).toString('hex');
    const ext = mimeType === 'video/mp4' ? 'mp4' : 'webm';
    const key = `marketing/reels/${hashId}.${ext}`;

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== 'dummy') {
        await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }));
        return {
            reel_url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
            feed_url: null // Videos are primarily reels
        };
    }
    return {
        reel_url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        feed_url: null
    };
}
