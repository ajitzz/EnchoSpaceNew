const fs = require('fs');
const code = fs.readFileSync('server.ts', 'utf8');
if (code.includes('META_HUMAN_VERIFIED_APP_MODE_LIVE')) {
  console.log('Patch successfully verified!');
} else {
  console.log('Patch verification failed.');
}
