const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

function getUnmatchedBraces(str) {
  const stack = [];
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let inTemplate = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const next = str[i+1];

    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false;
      }
      continue;
    }
    if (inString) {
      if (c === '\\') {
        i++; // skip escaped char
        continue;
      }
      if (c === stringChar) {
        inString = false;
      }
      continue;
    }
    if (inTemplate) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === '$' && next === '{') {
        // template expression start
        stack.push('${');
        i++;
        continue;
      }
      if (c === '`') {
        inTemplate = false;
      }
      continue;
    }

    if (c === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === '`') {
      inTemplate = true;
      continue;
    }

    if (c === '{') {
      stack.push(i);
    } else if (c === '}') {
      if (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top === '${') {
          stack.pop();
        } else {
          stack.pop();
        }
      }
    }
  }
  return stack;
}

const unclosed = getUnmatchedBraces(code);
console.log("Unclosed brace count:", unclosed.length);
if (unclosed.length > 0) {
  console.log("Lines of unclosed braces:");
  unclosed.forEach(idx => {
    if (idx !== '${') {
      const line = code.slice(0, idx).split('\n').length;
      console.log("Line", line);
    }
  });
}
