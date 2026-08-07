const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

// Line 11 fix
code = code.replace('CheckSquare, Wand2, Square, Wand2', 'CheckSquare, Square');
// Line 2988 fix
code = code.replace('1:1 Square, Wand2 (Feed)', '1:1 Square (Feed)');

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log("Fixed Wand2 duplicates");
