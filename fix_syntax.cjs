const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Fix the join at line 427
code = code.replace(".join('\\')", ".join('\\n')");

// Fix the index line that caused the error originally (line 962)
// it was:
//   await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON host_marketing_campaigns(status);`);  // Milestone 4.5: Database Query Optimization (Indexes)  await pool.query(`CREATE INDEX IF NOT EXISTS idx_async_webhook_status ON async_webhook_queue(status);`);
// Wait, if \n was removed, they got squashed.

fs.writeFileSync('server.ts', code);
console.log('Fixed join');
