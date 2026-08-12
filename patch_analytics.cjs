const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Patch 1: host_social_posts likes, comments, shares update
code = code.replace(
  /\/\/ Seed mock visual metrics\s+await pool\.query\(`\s+UPDATE host_social_posts\s+SET likes = \$1, comments = \$2, shares = \$3\s+WHERE id = \$4\s+`, \[\s+Math\.floor\(Math\.random\(\) \* 250\) \+ 50,\s+Math\.floor\(Math\.random\(\) \* 40\) \+ 10,\s+Math\.floor\(Math\.random\(\) \* 20\) \+ 5,\s+id\s+\]\);/g,
  `// Removed mock visual metric seeding per Phase 1.`
);

// Patch 2: dashboard analytics chart data
// This is inside a route that returns JSON
// We'll replace the fallback mock array with just an empty array if chartData is empty.
// We need to look at the exact block around 10090.
