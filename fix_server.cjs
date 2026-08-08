const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const startMarker = "export interface MetaErrorClassification {";
const endMarker = "  return { success: allSucceeded, details };\n}";
const gate14Marker = "  // Gate 14:";

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker, startIndex) + endMarker.length;
const gate14Index = code.indexOf(gate14Marker, endIndex);

if (startIndex === -1 || endIndex === -1 || gate14Index === -1) {
  console.log("Could not find markers.");
  process.exit(1);
}

const extractedCode = code.substring(startIndex, endIndex);

let newCode = code.substring(0, startIndex) + code.substring(endIndex);

const evalEndMarker = "  };\n}";
const evalEndIndex = newCode.indexOf(evalEndMarker, startIndex);
if (evalEndIndex === -1) {
  console.log("Could not find eval function end.");
  process.exit(1);
}

// Insert extracted code right after evalEndMarker
newCode = newCode.substring(0, evalEndIndex + evalEndMarker.length) + "\n\n" + extractedCode + "\n" + newCode.substring(evalEndIndex + evalEndMarker.length);

fs.writeFileSync('server.ts', newCode);
console.log("Fixed server.ts!");
