const fs = require('fs');
let code = fs.readFileSync('src/lib/imageProcessor.ts', 'utf8');
code = code.replace("fsSync.writeFileSync(path.join(publicDir, reelKey), reelBuffer);", "fsSync.writeFileSync(path.join(publicDir, reelKey), reelBuffer);");
console.log('Verified.');
