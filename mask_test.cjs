const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regexAnchor = "function maskContactInfo(text: string): { sanitized: string; wasSanitized: boolean } {";

if (code.includes(regexAnchor)) {
    console.log("Masking function already exists in codebase.");
} else {
    console.log("Masking function MISSING.");
}
