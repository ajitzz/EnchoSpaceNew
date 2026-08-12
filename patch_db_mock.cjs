const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// There are several places with `if (!isDbConfigured || dbConnectionError)` that push to `demoExperiences` or `demoListings`.
// We'll replace them with failing closed. Let's find them first.
