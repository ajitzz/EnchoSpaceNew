const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const t = `
            asset_feed_spec: {
              bodies: assetFeedBodies,
              images: assetFeedImages,
              titles: assetFeedTitles,
              link_urls: [{ website_url: destinationUrl }],
              descriptions: assetFeedDescriptions,
              call_to_action_types: ['SIGN_UP', 'BOOK_TRAVEL', 'LEARN_MORE']
            },
`;

const r = `
            asset_feed_spec: {
              ad_formats: ['SINGLE_IMAGE'],
              bodies: assetFeedBodies,
              images: assetFeedImages,
              titles: assetFeedTitles,
              link_urls: [{ website_url: destinationUrl }],
              descriptions: assetFeedDescriptions,
              call_to_action_types: ['SIGN_UP', 'BOOK_TRAVEL', 'LEARN_MORE']
            },
`;

if (code.includes(t.trim())) {
    code = code.replace(t.trim(), r.trim());
    fs.writeFileSync('server.ts', code);
    console.log("Patched ad_formats successfully");
} else {
    console.log("Could not find ad_formats target");
}
