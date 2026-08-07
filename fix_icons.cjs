const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');
code = code.replace(/<MessageSquare, Wand2 /g, '<MessageSquare ');
code = code.replace(/<CheckSquare, Wand2 /g, '<CheckSquare ');
code = code.replace(/<Square, Wand2 /g, '<Square ');
fs.writeFileSync('components/HostMarketing.tsx', code);
console.log("Fixed icons in HostMarketing.tsx");
