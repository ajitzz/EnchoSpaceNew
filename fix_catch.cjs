const fs = require('fs');
const glob = require('glob');

const files = glob.sync('{components,src,.}/**/*.{tsx,ts}', { ignore: ['node_modules/**', 'dist/**'] });
for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  if (content.includes('.catch(() => ({}))')) {
    // Regex for: res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) }.catch(() => ({}))
    content = content.replace(/res\.headers\.get\('content-type'\)\?\.includes\('json'\) \? await ([a-zA-Z0-9_]+)\.json\(\) : \{ error: 'Server returned non-JSON response: ' \+ \(await \1\.text\(\)\)\.slice\(0, 150\) \}\.catch\(\(\) => \(\{\}\)\)/g, (match, varName) => {
        return `(${varName}.headers.get('content-type')?.includes('json') ? await ${varName}.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await ${varName}.text().catch(() => '')).slice(0, 150) })`;
    });
    fs.writeFileSync(file, content, 'utf-8');
  }
}
