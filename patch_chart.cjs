const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /if \(chartData\.length === 0\) \{\s+const months = \['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'\];\s+months\.forEach\(\(m, i\) => \{\s+chartData\.push\(\{\s+name: m,\s+revenue: Math\.floor\(Math\.random\(\) \* 2000\) \+ 500 \* \(i \+ 1\),\s+bookings: Math\.floor\(Math\.random\(\) \* 5\) \+ i\s+\}\);\s+\}\);\s+\}/g,
  ''
);

fs.writeFileSync('server.ts', code);
console.log("Chart patched.");
