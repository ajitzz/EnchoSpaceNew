const fs = require('fs');
let code = fs.readFileSync('src/lib/integrationInspector.ts', 'utf8');

code = code.replace(/for \(const \[service, data\] of serviceMap.entries\(\)\) {/, "for (const [service, data] of Array.from(serviceMap.entries())) {");
fs.writeFileSync('src/lib/integrationInspector.ts', code);
console.log('Fixed serviceMap.entries()');
