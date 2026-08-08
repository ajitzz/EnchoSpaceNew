const fs = require('fs');
const code = fs.readFileSync('server.ts', 'utf8');

const lines = code.split('\n');
let inDispatch = false;
let foundStart = false;
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('async function dispatchMetaCampaign')) {
     inDispatch = true;
     foundStart = true;
  }
  if (foundStart && lines[i].includes('} catch (error: any) {')) {
     for(let j=i; j<i+100 && j<lines.length; j++) {
         console.log(lines[j]);
         if (lines[j].includes('} // End dispatchMetaCampaign')) break;
     }
     break;
  }
}
