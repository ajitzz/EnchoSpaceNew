const fs = require('fs');
let code = fs.readFileSync('src/lib/imageProcessor.ts', 'utf8');

const target = `export const processMarketingAssets = async (buffer: Buffer, mimeType: string) => {`;
const replacement = `import path from 'path';
import fsSync from 'fs';

export const processMarketingAssets = async (buffer: Buffer, mimeType: string, baseUrl: string = '') => {`;

code = code.replace(target, replacement);

const fallbackTarget = `    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== 'dummy') {
        await Promise.all([
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: reelKey, Body: reelBuffer, ContentType: 'image/jpeg' })),
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: feedKey, Body: feedBuffer, ContentType: 'image/jpeg' })),
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: landscapeKey, Body: landscapeBuffer, ContentType: 'image/jpeg' }))
        ]);
        return {
            reel_url: \`https://\${bucket}.s3.\${process.env.AWS_REGION}.amazonaws.com/\${reelKey}\`,
            feed_url: \`https://\${bucket}.s3.\${process.env.AWS_REGION}.amazonaws.com/\${feedKey}\`,
            landscape_url: \`https://\${bucket}.s3.\${process.env.AWS_REGION}.amazonaws.com/\${landscapeKey}\`
        };
    } else {
        // Fallback for dev mode
        return {
            reel_url: \`https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=1080&h=1920\`,
            feed_url: \`https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=1080&h=1080\`,
            landscape_url: \`https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=1920&h=1080\`
        };
    }`;

const fallbackReplacement = `    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== 'dummy') {
        await Promise.all([
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: reelKey, Body: reelBuffer, ContentType: 'image/jpeg' })),
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: feedKey, Body: feedBuffer, ContentType: 'image/jpeg' })),
            s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: landscapeKey, Body: landscapeBuffer, ContentType: 'image/jpeg' }))
        ]);
        return {
            reel_url: \`https://\${bucket}.s3.\${process.env.AWS_REGION}.amazonaws.com/\${reelKey}\`,
            feed_url: \`https://\${bucket}.s3.\${process.env.AWS_REGION}.amazonaws.com/\${feedKey}\`,
            landscape_url: \`https://\${bucket}.s3.\${process.env.AWS_REGION}.amazonaws.com/\${landscapeKey}\`
        };
    } else {
        // Real Local Processing Fallback for 10/10 Gold Standard
        const publicDir = path.join(process.cwd(), 'public');
        const uploadDir = path.join(publicDir, 'marketing');
        fsSync.mkdirSync(path.join(uploadDir, 'reels'), { recursive: true });
        fsSync.mkdirSync(path.join(uploadDir, 'feed'), { recursive: true });
        fsSync.mkdirSync(path.join(uploadDir, 'landscape'), { recursive: true });
        
        fsSync.writeFileSync(path.join(publicDir, reelKey), reelBuffer);
        fsSync.writeFileSync(path.join(publicDir, feedKey), feedBuffer);
        fsSync.writeFileSync(path.join(publicDir, landscapeKey), landscapeBuffer);

        // Remove trailing slash from baseUrl if exists
        const base = baseUrl.replace(/\\/$/, '');
        return {
            reel_url: \`\${base}/\${reelKey}\`,
            feed_url: \`\${base}/\${feedKey}\`,
            landscape_url: \`\${base}/\${landscapeKey}\`
        };
    }`;

code = code.replace(fallbackTarget, fallbackReplacement);

const videoTarget = `const processVideoAsset = async (buffer: Buffer, mimeType: string) => {`;
const videoReplacement = `const processVideoAsset = async (buffer: Buffer, mimeType: string, baseUrl: string = '') => {`;
code = code.replace(videoTarget, videoReplacement);

const videoFallbackTarget = `    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== 'dummy') {
        await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }));
        return {
            reel_url: \`https://\${bucket}.s3.\${process.env.AWS_REGION}.amazonaws.com/\${key}\`,
            feed_url: null, // Videos are primarily reels
            landscape_url: null
        };
    }
    return {
        reel_url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        feed_url: null,
        landscape_url: null
    };`;

const videoFallbackReplacement = `    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== 'dummy') {
        await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }));
        return {
            reel_url: \`https://\${bucket}.s3.\${process.env.AWS_REGION}.amazonaws.com/\${key}\`,
            feed_url: null, // Videos are primarily reels
            landscape_url: null
        };
    }
    
    const publicDir = path.join(process.cwd(), 'public');
    const uploadDir = path.join(publicDir, 'marketing');
    fsSync.mkdirSync(path.join(uploadDir, 'reels'), { recursive: true });
    fsSync.writeFileSync(path.join(publicDir, key), buffer);
    const base = baseUrl.replace(/\\/$/, '');

    return {
        reel_url: \`\${base}/\${key}\`,
        feed_url: null,
        landscape_url: null
    };`;

code = code.replace(videoFallbackTarget, videoFallbackReplacement);

const videoCallTarget = `return processVideoAsset(buffer, mimeType);`;
const videoCallReplacement = `return processVideoAsset(buffer, mimeType, baseUrl);`;
code = code.replace(videoCallTarget, videoCallReplacement);

fs.writeFileSync('src/lib/imageProcessor.ts', code);
console.log('Done.');
