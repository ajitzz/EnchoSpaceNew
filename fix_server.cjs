const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// I need to remove the broken leftover of pre-flight check.
// It starts right after the new pre-flight check ends.
// Let's find "app.post('/api/marketing/pre-flight-check'"
const preflightStart = code.indexOf("app.post('/api/marketing/pre-flight-check'");
// Find the end of my NEW preflight function
const myNewEnd = code.indexOf("});", code.indexOf("res.status(500).json({ error: 'Failed pre-flight check' });")) + 3;

// Now from myNewEnd, the code has:
//   try {
//     const { listing_id, title, description, budget } = req.body;
// ... until
//     res.status(500).json({ error: error.message || 'Pre-flight check failed' });
//   }
// });

const oldEnd = code.indexOf("});", code.indexOf("res.status(500).json({ error: error.message || 'Pre-flight check failed' });")) + 3;

if (preflightStart > -1 && myNewEnd > -1 && oldEnd > -1 && oldEnd > myNewEnd) {
  code = code.slice(0, myNewEnd) + code.slice(oldEnd);
  console.log("Fixed preflight");
} else {
  console.log("Could not fix preflight");
}

fs.writeFileSync('server.ts', code);
