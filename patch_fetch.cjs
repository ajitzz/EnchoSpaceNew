const fs = require('fs');
const glob = require('glob');

const files = glob.sync('{components,src,.}/**/*.{tsx,ts}', { ignore: ['node_modules/**', 'dist/**'] });

let totalReplaced = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  let original = content;

  // regex to match: await res.json()
  // Replace with: res.headers.get('content-type')?.includes('application/json') ? await res.json() : { error: await res.text() }
  // Wait, if res is named something else, e.g. await response.json()
  content = content.replace(/await ([a-zA-Z0-9_]+)\.json\(\)/g, (match, varName) => {
    return `${varName}.headers.get('content-type')?.includes('json') ? await ${varName}.json() : { error: 'Server returned non-JSON response: ' + (await ${varName}.text()).slice(0, 150) }`;
  });

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf-8');
    totalReplaced++;
  }
}
console.log(`Replaced in ${totalReplaced} files`);
