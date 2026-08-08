const fs = require('fs');
const code = fs.readFileSync('server.ts', 'utf8');

const lines = code.split('\n');
let inFunc = false;
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('const executeMetaRequest = async (stepName: string, endpoint: string, payload: any, maxRetries = 3) => {')) {
     inFunc = true;
  }
  if (inFunc) {
     console.log(lines[i]);
  }
  if (inFunc && lines[i].includes('};') && lines[i-1].includes('}')) {
     break;
  }
}
