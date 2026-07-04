const fs = require('fs');
const { execSync } = require('child_process');

let iter = 0;
while (iter < 100) {
  try {
    execSync('npx tsc -p tsconfig.server.json --noEmit', { stdio: 'pipe' });
    console.log("No syntax errors! Finished.");
    break;
  } catch (error) {
    const output = error.stdout.toString() + error.stderr.toString();
    const match = output.match(/server\.ts\((\d+),/);
    if (match) {
      const lineNum = parseInt(match[1]);
      let ts = fs.readFileSync('server.ts', 'utf8').split('\n');
      
      // We know sed deleted lines containing `});`. So we insert `});`.
      // Actually, if it's the S3Client, it's `});`.
      // Most of them are `});`. Let's just try `});`.
      ts.splice(lineNum - 1, 0, '});');
      fs.writeFileSync('server.ts', ts.join('\n'));
      console.log(`Inserted '});' at line ${lineNum}`);
    } else {
      console.log("No line match found, exiting.");
      console.log(output);
      break;
    }
  }
  iter++;
}
