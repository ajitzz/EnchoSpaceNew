const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const regex = /\/\/ 3\. Upload Images[\s\S]*?console\.error\('\[META IMG UPLOAD IGN\]', e\);\n\s*\}/;

const replacement = `// 3. Upload Images
    let squareHash = '';
    let imgBase64 = '';
    if (campaign.listing_image || (campaign.media_urls && campaign.media_urls.length > 0)) {
       const imgUrl = campaign.listing_image || campaign.media_urls[0];
       const imgRes = await fetch(imgUrl);
       if (imgRes.ok) {
          const imgBuffer = await imgRes.arrayBuffer();
          imgBase64 = Buffer.from(imgBuffer).toString('base64');
       } else {
          throw new Error('Failed to fetch listing image from URL: ' + imgUrl);
       }
    } else {
       throw new Error('No listing image available for Meta Campaign');
    }
    
    const sqUpload = await executeMetaRequest('adimage_upload_square', \`\${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/\${cleanAdAccountId}/adimages\`, { 
       access_token: accessToken, bytes: imgBase64 
    });
    
    if (sqUpload && sqUpload.images) {
      squareHash = Object.values(sqUpload.images)[0].hash;
    } else {
      throw new Error('Meta Image Upload failed to return a valid hash');
    }`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('server.ts', content);
    console.log('Successfully replaced image fetch logic.');
} else {
    console.log('Target not found.');
}
