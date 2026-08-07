const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const myNewCopilotEnd = code.indexOf("});", code.indexOf("res.status(500).json({ error: 'Failed to analyze campaign' });")) + 3;

// Find the end of the leftover code which ends with `res.status(500).json({ error: 'Failed to analyze campaign' });\n  }\n});`
// We'll search from myNewCopilotEnd
const oldCopilotEndString = "res.status(500).json({ error: 'Failed to analyze campaign' });\n  }\n});";
const oldCopilotEndIndex = code.indexOf(oldCopilotEndString, myNewCopilotEnd);

if (oldCopilotEndIndex > -1) {
  const absoluteEnd = oldCopilotEndIndex + oldCopilotEndString.length;
  code = code.slice(0, myNewCopilotEnd) + "\n" + code.slice(absoluteEnd);
  fs.writeFileSync('server.ts', code);
  console.log("Fixed copilot");
} else {
  console.log("Could not fix copilot");
}
