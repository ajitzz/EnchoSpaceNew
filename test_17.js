import fs from 'fs';
const serverTs = fs.readFileSync('server.ts', 'utf8');
const regex = /pool\.query\(\`([\s\S]*?)\`\)/g;
let match;
let queries = [];
while ((match = regex.exec(serverTs)) !== null) {
  if (match[1].includes('CREATE TABLE')) {
    queries.push(match[1]);
  }
}
console.log(queries[17]);
