const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /if \(!META_API_TOKEN\) \{\s+console\.warn\("\[WHATSAPP\] META_API_TOKEN is missing\. Failing closed\."\);\s+return false;\s+\}\s+console\.log\(`\[WHATSAPP SANDBOX SIMULATOR\].*?`\);\s+console\.log\(`  - To: \+\$\{cleanedPhone\}`\);\s+console\.log\(`  - Text: "\$\{messageText\}"`\);\s+return true;\s+\}/g,
  `if (!META_API_TOKEN) {
      console.warn("[WHATSAPP] META_API_TOKEN is missing. Failing closed.");
      return false;
    }`
);

fs.writeFileSync('server.ts', code);
console.log("WhatsApp syntax fixed.");
