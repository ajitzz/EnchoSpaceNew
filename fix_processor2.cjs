const fs = require('fs');
let code = fs.readFileSync('src/lib/imageProcessor.ts', 'utf8');

code = code.replace(
  "            feed_url: null,\n        landscape_url: null, // Videos are primarily reels\n            landscape_url: null",
  "            feed_url: null, // Videos are primarily reels\n            landscape_url: null"
);

code = code.replace(
  "        feed_url: null\n    };",
  "        feed_url: null,\n        landscape_url: null\n    };"
);

fs.writeFileSync('src/lib/imageProcessor.ts', code);
console.log("Fixed duplicate property error.");
