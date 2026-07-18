const fs = require('fs');
let content = fs.readFileSync('HOST_ABSOLUTE_BLUEPRINT.md', 'utf8');
content = content.replace(/- \[x\] Integrate "Featured Reels.*Page\./g, '- [x] Integrate "Featured Reels & Posts" carousel on Property View Page.');
fs.writeFileSync('HOST_ABSOLUTE_BLUEPRINT.md', content);
