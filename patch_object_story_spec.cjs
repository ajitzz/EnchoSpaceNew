const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const t = `
          const creativePayload: any = {
            name: \`Encho DCO Master Engine - \${adHeadline}\`,
            access_token: process.env.META_ACCESS_TOKEN,
            asset_feed_spec: {
              ad_formats: ['SINGLE_IMAGE'],
              bodies: assetFeedBodies,
              images: assetFeedImages,
              titles: assetFeedTitles,
              link_urls: [{ website_url: destinationUrl }],
              descriptions: assetFeedDescriptions,
              call_to_action_types: ['SIGN_UP', 'BOOK_TRAVEL', 'LEARN_MORE']
            },
            object_story_spec: {
              page_id: process.env.META_PAGE_ID,
              link_data: {
                link: destinationUrl,
                name: adHeadline,
                message: adMessage,
                call_to_action: { type: 'LEARN_MORE', value: { link: destinationUrl } }
              }
            }
          };
`;

const r = `
          const creativePayload: any = {
            name: \`Encho DCO Master Engine - \${adHeadline}\`,
            access_token: process.env.META_ACCESS_TOKEN,
            asset_feed_spec: {
              ad_formats: ['SINGLE_IMAGE'],
              bodies: assetFeedBodies,
              images: assetFeedImages,
              titles: assetFeedTitles,
              link_urls: [{ website_url: destinationUrl }],
              descriptions: assetFeedDescriptions,
              call_to_action_types: ['SIGN_UP', 'BOOK_TRAVEL', 'LEARN_MORE']
            },
            object_story_spec: {
              page_id: process.env.META_PAGE_ID
            }
          };
`;

if (code.includes(t.trim())) {
    code = code.replace(t.trim(), r.trim());
    fs.writeFileSync('server.ts', code);
    console.log("Patched creativePayload successfully");
} else {
    console.log("Could not find creativePayload target");
}
