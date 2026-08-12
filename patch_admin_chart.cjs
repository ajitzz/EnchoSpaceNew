const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /\/\/ If no real bookings exist yet, populate with some dummy data for the chart's aesthetics\s+if \(chartData\.length === 0\) \{\s+const months = \['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'\];\s+months\.forEach\(\(m, i\) => \{\s+chartData\.push\(\{\s+name: m,\s+revenue: Math\.floor\(Math\.random\(\) \* 5000\) \+ 1000 \* \(i \+ 1\),\s+bookings: Math\.floor\(Math\.random\(\) \* 10\) \+ i\s+\}\);\s+\}\);\s+\}/g,
  ''
);

fs.writeFileSync('server.ts', code);
console.log("Admin chart patched.");
