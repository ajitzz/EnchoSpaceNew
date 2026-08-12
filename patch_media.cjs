const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /return \{\s+url,\s+resolution: '1080x1080',\s+blurScore: Math\.random\(\) \* 0\.2,\s+textPercentage: Math\.floor\(Math\.random\(\) \* 15\),\s+hasHumanFaces: Math\.random\(\) > 0\.5,\s+aspectRatio: '1:1',\s+status: 'pass'\s+\};/g,
  `return {
              url,
              status: 'pass',
              message: 'Media intelligence checks pending future implementation.'
           };`
);

fs.writeFileSync('server.ts', code);
console.log("Media intelligence mock patched.");
