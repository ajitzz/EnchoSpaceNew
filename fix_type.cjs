const fs = require('fs');
const glob = require('glob');

const files = glob.sync('{components,src,.}/**/*.{tsx,ts}', { ignore: ['node_modules/**', 'dist/**'] });
for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  if (content.includes("Server returned non-JSON response")) {
    content = content.replace(/slice\(0, 150\) \}(?!\s*as any)/g, "slice(0, 150) } as any");
    fs.writeFileSync(file, content, 'utf-8');
  }
}
