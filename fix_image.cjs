const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const target = `    let squareHash = 'mock_hash';
    try {
      const sqUpload`;

const replacement = `    let squareHash = 'mock_hash';
    try {
      let imgBase64 = 'mock_base64_img';
      if (campaign.listing_image || (campaign.media_urls && campaign.media_urls.length > 0)) {
         const imgUrl = campaign.listing_image || campaign.media_urls[0];
         const imgRes = await fetch(imgUrl);
         if (imgRes.ok) {
            const imgBuffer = await imgRes.arrayBuffer();
            imgBase64 = Buffer.from(imgBuffer).toString('base64');
         }
      }
      const sqUpload`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('server.ts', content);
    console.log('Successfully inserted image fetch logic.');
} else {
    console.log('Target not found.');
}
