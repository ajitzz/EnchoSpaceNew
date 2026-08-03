const fs = require('fs');
const content = fs.readFileSync('components/AdminDashboard.tsx', 'utf8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('marketingSubTab === \\'organic_social\\' && ('));
if (start !== -1) {
  for(let i=start; i<start+100; i++) {
    console.log(i, lines[i]);
  }
}
