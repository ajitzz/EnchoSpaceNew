const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const dynamicAssetsReplacement = `
    const imageUrl = campaign.listing_image || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6';

    let squareUrl = imageUrl;
    let verticalUrl = imageUrl;
    let landscapeUrl = imageUrl;
    let dynamicProcessingSuccess = false;

    try {
        console.log(\`[ASSET PREP] Milestone 2 pipeline initiating for \${imageUrl}\`);
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
            const buffer = await imgRes.arrayBuffer();
            const processed = await processMarketingAssets(Buffer.from(buffer), imgRes.headers.get('content-type') || 'image/jpeg');
            if (processed) {
                squareUrl = processed.feed_url || squareUrl;
                verticalUrl = processed.reel_url || verticalUrl;
                landscapeUrl = processed.landscape_url || landscapeUrl;
                dynamicProcessingSuccess = true;
                console.log(\`[ASSET PREP] Successfully generated 1:1, 9:16, 16:9 variants via dynamic pipeline.\`);
            }
        }
    } catch (e) {
        console.warn(\`[ASSET PREP] Dynamic pipeline failed, falling back to raw image. \${e}\`);
    }

    const destinationUrl = \`https://encho-space-chi.vercel.app/listings/\${campaign.listing_id || ''}\`;
    const adHeadline = campaign.title || campaign.listing_title || 'Exclusive Resort Stay';
    const adMessage = campaign.description || campaign.listing_desc || 'Book your luxury getaway stay with Encho Space.';
    const feedDescription = campaign.feed_description || \`Experience high-end luxury living at \${adHeadline}.\`;

    // Multi-Format Asset Pipeline (Gap 8) - 1:1, 9:16, 16:9 aspect ratio specifications
    const adMedias = [
      {
        format: '1:1 Square (Feed)',
        aspect_ratio: '1:1',
        dimensions: '1080x1080',
        placement: 'Meta & Instagram Main Feed',
        url: squareUrl,
        hash: dynamicProcessingSuccess ? 'img_hash_1x1_feed_sac998311' : 'raw_fallback_1x1'
      },
      {
        format: '9:16 Vertical (Stories & Reels)',
        aspect_ratio: '9:16',
        dimensions: '1080x1920',
        placement: 'Instagram Reels & Meta Stories',
        url: verticalUrl,
        hash: dynamicProcessingSuccess ? 'img_hash_9x16_reels_sac998311' : 'raw_fallback_9x16'
      },
      {
        format: '16:9 Landscape (In-Stream & Display)',
        aspect_ratio: '16:9',
        dimensions: '1920x1080',
        placement: 'Meta In-Stream Video & Google Display',
        url: landscapeUrl,
        hash: dynamicProcessingSuccess ? 'img_hash_16x9_instream_sac998311' : 'raw_fallback_16x9'
      }
    ];
`;

code = code.replace(
  `    const imageUrl = campaign.listing_image || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6';
    const destinationUrl = \`https://encho-space-chi.vercel.app/listings/\${campaign.listing_id || ''}\`;
    const adHeadline = campaign.title || campaign.listing_title || 'Exclusive Resort Stay';
    const adMessage = campaign.description || campaign.listing_desc || 'Book your luxury getaway stay with Encho Space.';
    const feedDescription = campaign.feed_description || \`Experience high-end luxury living at \${adHeadline}.\`;

    // Multi-Format Asset Pipeline (Gap 8) - 1:1, 9:16, 16:9 aspect ratio specifications
    const adMedias = [
      {
        format: '1:1 Square (Feed)',
        aspect_ratio: '1:1',
        dimensions: '1080x1080',
        placement: 'Meta & Instagram Main Feed',
        url: imageUrl,
        hash: 'img_hash_1x1_feed_sac998311'
      },
      {
        format: '9:16 Vertical (Stories & Reels)',
        aspect_ratio: '9:16',
        dimensions: '1080x1920',
        placement: 'Instagram Reels & Meta Stories',
        url: imageUrl,
        hash: 'img_hash_9x16_reels_sac998311'
      },
      {
        format: '16:9 Landscape (In-Stream & Display)',
        aspect_ratio: '16:9',
        dimensions: '1920x1080',
        placement: 'Meta In-Stream Video & Google Display',
        url: imageUrl,
        hash: 'img_hash_16x9_instream_sac998311'
      }
    ];`,
    dynamicAssetsReplacement
);

fs.writeFileSync('server.ts', code);
console.log("Fixed adMedias asset pipeline in dispatchMetaCampaign.");
