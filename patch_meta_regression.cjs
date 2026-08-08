const fs = require('fs');
let code = fs.readFileSync('scripts/meta_regression.ts', 'utf8');

const target = `    const safeJsonFormat = (str: string) => {`;
const replacement = `    const safeJsonFormat = (str: any) => {`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('scripts/meta_regression.ts', code);
  console.log('Patched meta_regression.ts');
} else {
  console.log('target not found');
}
