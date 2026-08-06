const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const newLogic = `
      // 3. Upload Dynamic Asset Pipeline Variants to Meta (DCO & Asset Prep)
      let uploadedHashes = { square: '', vertical: '', landscape: '' };
      try {
        console.log(\`[META API DISPATCH] Uploading 1:1, 9:16, 16:9 image variants to Meta...\`);
        const uploadVariant = async (url) => {
           if (!url || url.includes('unsplash.com')) return null; // Skip placeholder uploads in sandbox
           const imgFetch = await fetch(url);
           if (!imgFetch.ok) return null;
           const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());
           const uploadRes = await fetch(\`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/adimages\`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ access_token: accessToken, bytes: imgBuffer.toString('base64') })
           });
           const uploadData = await uploadRes.json();
           if (uploadData.images) {
              return (Object.values(uploadData.images)[0])?.hash || null;
           }
           return null;
        };

        const [sqHash, vHash, lHash] = await Promise.all([
           uploadVariant(squareUrl),
           uploadVariant(verticalUrl),
           uploadVariant(landscapeUrl)
        ]);

        if (sqHash) uploadedHashes.square = sqHash;
        if (vHash) uploadedHashes.vertical = vHash;
        if (lHash) uploadedHashes.landscape = lHash;
        syncLogs.steps.push({ step: 'adimage_upload_pipeline', response: uploadedHashes });
      } catch (imgErr) {
        console.warn('[META API NOTICE] AdImage upload pipeline note:', imgErr.message);
      }

      // We'll use Asset Feed Spec for Dynamic Creative Optimization (DCO) to map 1:1 to feed, 9:16 to stories, 16:9 to instream
      const assetFeedImages = [];
      if (uploadedHashes.square) assetFeedImages.push({ hash: uploadedHashes.square });
      if (uploadedHashes.vertical) assetFeedImages.push({ hash: uploadedHashes.vertical });
      if (uploadedHashes.landscape) assetFeedImages.push({ hash: uploadedHashes.landscape });

      let creativePayload;
      if (assetFeedImages.length > 0) {
          // Dynamic Creative Optimization (DCO) Payload
          creativePayload = {
            access_token: accessToken,
            name: \`Encho Dynamic Creative - \${adHeadline}\`,
            object_story_spec: { page_id: pageId },
            asset_feed_spec: {
              images: assetFeedImages,
              bodies: [{ text: adMessage }],
              titles: [{ text: adHeadline }],
              descriptions: [{ text: feedDescription }],
              call_to_action_types: ['BOOK_NOW'],
              link_urls: [{ website_url: destinationUrl }]
            }
          };
          if (igAccountId && igAccountId !== 'your_instagram_account_id_here') {
              creativePayload.object_story_spec.instagram_actor_id = igAccountId;
          }
      } else {
          // Fallback Standard Creative Payload
          const linkDataSpec = {
            link: destinationUrl,
            message: adMessage,
            name: adHeadline,
            call_to_action: { type: 'BOOK_NOW', value: { link: destinationUrl } },
            picture: imageUrl
          };
          creativePayload = {
            access_token: accessToken,
            name: \`Encho Creative - \${adHeadline}\`,
            object_story_spec: { page_id: pageId, link_data: linkDataSpec }
          };
          if (igAccountId && igAccountId !== 'your_instagram_account_id_here') {
              creativePayload.object_story_spec.instagram_actor_id = igAccountId;
          }
      }

      try {
        const creativeRes = await fetch(\`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/adcreatives\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creativePayload)
        });
`;

code = code.replace(
  `      // 3. Upload image and Create Creative/Ad
      let imageHash = '';
      try {
        const imgFetch = await fetch(imageUrl);
        if (imgFetch.ok) {
          const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());
          const uploadRes = await fetch(\`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/adimages\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken, bytes: imgBuffer.toString('base64') })
          });
          const uploadData = await uploadRes.json();
          syncLogs.steps.push({ step: 'adimage_upload', response: uploadData });
          if (uploadData.images) {
            imageHash = (Object.values(uploadData.images)[0] as any)?.hash || '';
          }
        }
      } catch (imgErr: any) {
        console.warn('[META API NOTICE] AdImage upload note:', imgErr.message);
      }

      const linkDataSpec: any = {
        link: destinationUrl,
        message: adMessage,
        name: adHeadline,
        call_to_action: {
          type: 'BOOK_NOW',
          value: { link: destinationUrl }
        }
      };
      if (imageHash) linkDataSpec.image_hash = imageHash;
      else linkDataSpec.picture = imageUrl;

      const objectStorySpec: any = {
        page_id: pageId,
        link_data: linkDataSpec
      };

      if (igAccountId && igAccountId !== 'your_instagram_account_id_here') {
        objectStorySpec.instagram_actor_id = igAccountId;
      }

      try {
        const creativeRes = await fetch(\`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/adcreatives\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            name: \`Encho Creative - \${adHeadline}\`,
            object_story_spec: objectStorySpec
          })
        });`,
  newLogic
);

fs.writeFileSync('server.ts', code);
console.log("Updated to upload 1:1, 9:16, 16:9 images and use Dynamic Creative Optimization (DCO)!");
