const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Fix the webhook where I used spent_budget
code = code.replace(
  /UPDATE host_marketing_campaigns SET spent_budget = COALESCE\(spent_budget, 0\) \+ \$1 WHERE meta_campaign_id = \$2 OR meta_ad_id = \$2/g,
  "UPDATE host_marketing_campaigns SET accumulated_spent = COALESCE(accumulated_spent, 0) + $1 WHERE meta_campaign_id = $2 OR meta_ad_id = $2"
);

// Fix the circuit breaker query where I used 'spent'
code = code.replace(
  "SELECT id, budget, spent FROM host_marketing_campaigns WHERE listing_id = $1 AND status = 'active'",
  "SELECT id, budget, accumulated_spent as spent FROM host_marketing_campaigns WHERE listing_id = $1 AND status = 'active'"
);

fs.writeFileSync('server.ts', code);
console.log("Fixed spent columns.");
