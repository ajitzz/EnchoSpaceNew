const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

const target1 = `    // 3. Upload Images
    let squareHash = 'mock_hash';
    try {
      const sqUpload = await executeMetaRequest('adimage_upload_square', \`\${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/\${cleanAdAccountId}/adimages\`, { 
         access_token: accessToken, bytes: 'mock_base64_img' 
      });`;

const replacement1 = `    // 3. Upload Images
    let squareHash = 'mock_hash';
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
      const sqUpload = await executeMetaRequest('adimage_upload_square', \`\${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/\${cleanAdAccountId}/adimages\`, { 
         access_token: accessToken, bytes: imgBase64 
      });`;

const target2 = `          call_to_action: { type: 'BOOK_TRAVEL', value: { lead_gen_form_id: activeLeadFormId, link: destinationUrl } }
        }
      },
      degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enrollment_status: 'OPT_OUT' } } }
    };`;

const replacement2 = `          call_to_action: { type: 'BOOK_TRAVEL', value: { lead_gen_form_id: activeLeadFormId, link: destinationUrl } }
        }
      }
    };`;

if (content.includes(target1)) {
    content = content.replace(target1, replacement1);
    console.log('Replaced target1');
} else {
    console.log('Could not find target1.');
}

if (content.includes(target2)) {
    content = content.replace(target2, replacement2);
    console.log('Replaced target2');
} else {
    console.log('Could not find target2.');
}

fs.writeFileSync('server.ts', content);
