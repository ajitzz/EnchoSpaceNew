const fs = require('fs');

if (fs.existsSync('src/lib/cryptoUtils.ts')) {
  let cryptoCode = fs.readFileSync('src/lib/cryptoUtils.ts', 'utf8');
  cryptoCode = cryptoCode.replace(/import crypto from 'crypto';/, "import * as crypto from 'crypto';");
  fs.writeFileSync('src/lib/cryptoUtils.ts', cryptoCode);
}

if (fs.existsSync('src/lib/imageProcessor.ts')) {
  let imgCode = fs.readFileSync('src/lib/imageProcessor.ts', 'utf8');
  imgCode = imgCode.replace(/import crypto from 'crypto';/, "import * as crypto from 'crypto';");
  imgCode = imgCode.replace(/import path from 'path';/, "import * as path from 'path';");
  imgCode = imgCode.replace(/import fs from 'fs';/, "import * as fs from 'fs';");
  fs.writeFileSync('src/lib/imageProcessor.ts', imgCode);
}

if (fs.existsSync('src/lib/integrationInspector.ts')) {
  let iiCode = fs.readFileSync('src/lib/integrationInspector.ts', 'utf8');
  iiCode = iiCode.replace(/providers\.entries\(\)/g, "Array.from(providers.entries())");
  fs.writeFileSync('src/lib/integrationInspector.ts', iiCode);
}

console.log('Fixed TS imports');
