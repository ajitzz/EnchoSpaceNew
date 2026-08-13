const fs = require('fs');
const glob = require('glob');

const files = glob.sync('{components,src,.}/**/*.{tsx,ts}', { ignore: ['node_modules/**', 'dist/**'] });
for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  if (content.includes('}.catch(() => ({}))')) {
    content = content.replace(/\}\.catch\(\(\) => \(\{\}\)\)/g, '}');
    content = content.replace(/await ([a-zA-Z0-9_]+)\.json\(\) : \{/g, 'await $1.json().catch(() => ({})) : {');
    fs.writeFileSync(file, content, 'utf-8');
  }
}
