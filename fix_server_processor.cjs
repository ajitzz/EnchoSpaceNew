const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// First instance inside /api/marketing/assets/upload
const t1 = `      const processed = await processMarketingAssets(req.file.buffer, req.file.mimetype);`;
const r1 = `      const baseUrl = req.protocol + '://' + req.get('host');
      const processed = await processMarketingAssets(req.file.buffer, req.file.mimetype, baseUrl);`;
code = code.replace(t1, r1);

// Second instance inside campaign launch sequence
const t2 = `            const processed = await processMarketingAssets(Buffer.from(buffer), imgRes.headers.get('content-type') || 'image/jpeg');`;
const r2 = `            const baseUrl = req.protocol + '://' + req.get('host');
            const processed = await processMarketingAssets(Buffer.from(buffer), imgRes.headers.get('content-type') || 'image/jpeg', baseUrl);`;
code = code.replace(t2, r2);

fs.writeFileSync('server.ts', code);
console.log('Fixed server.ts calls');
