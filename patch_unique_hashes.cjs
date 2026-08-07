const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const t = `
        const assetFeedImages = [];
        if (uploadedHashes.square) assetFeedImages.push({ hash: uploadedHashes.square });
        if (uploadedHashes.vertical) assetFeedImages.push({ hash: uploadedHashes.vertical });
        if (uploadedHashes.landscape) assetFeedImages.push({ hash: uploadedHashes.landscape });
`;

const r = `
        const assetFeedImagesMap = new Map();
        if (uploadedHashes.square) assetFeedImagesMap.set(uploadedHashes.square, { hash: uploadedHashes.square });
        if (uploadedHashes.vertical) assetFeedImagesMap.set(uploadedHashes.vertical, { hash: uploadedHashes.vertical });
        if (uploadedHashes.landscape) assetFeedImagesMap.set(uploadedHashes.landscape, { hash: uploadedHashes.landscape });
        const assetFeedImages = Array.from(assetFeedImagesMap.values());
`;

if (code.includes(t.trim())) {
    code = code.replace(t.trim(), r.trim());
    fs.writeFileSync('server.ts', code);
    console.log("Patched hashes successfully");
} else {
    console.log("Could not find hashes target");
}
