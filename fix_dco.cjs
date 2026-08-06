const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const startIndex = code.indexOf("// 3. Upload image and Create Creative/Ad");
const endIndex = code.indexOf("const finalCreativeId = metaCreativeId");

if (startIndex === -1 || endIndex === -1) {
    console.log("Could not find indices.");
    process.exit(1);
}

const newLogic = `// 3. Upload Dynamic Asset Pipeline Variants to Meta (DCO & Asset Prep)
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
          const linkDataSpec: any = {
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
        const creativeData = await creativeRes.json();
        syncLogs.steps.push({ step: 'creative_creation', status: creativeRes.status, response: creativeData });
        if (creativeRes.ok && creativeData.id) {
          metaCreativeId = creativeData.id;
          console.log(\`[META API SUCCESS] Creative created: \${metaCreativeId}\`);
        }
      } catch (creativeErr: any) {
        console.warn('[META API NOTICE] Creative pipeline note:', creativeErr.message);
        syncLogs.steps.push({ step: 'creative_creation', error: creativeErr.message });
      }
      
      `;

code = code.substring(0, startIndex) + newLogic + code.substring(endIndex);

fs.writeFileSync('server.ts', code);
console.log("DCO Injection successful");
