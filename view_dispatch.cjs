const fs = require('fs');
const code = fs.readFileSync('server.ts', 'utf8');

const lines = code.split('\n');
let inDispatch = false;
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('async function dispatchMetaCampaign')) {
     inDispatch = true;
  }
  if (inDispatch) {
     console.log(i+1 + ": " + lines[i]);
  }
  if (inDispatch && lines[i].includes('} // End dispatchMetaCampaign') || (inDispatch && i > 5850)) {
     break;
  }
}
