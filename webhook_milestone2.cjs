const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const additionalWebhookLogic = `
          // Milestone 2: The Meta Async Webhook Sync (Ad Approval & Status)
          if (change.field === 'ad_status' || change.field === 'campaign_status') {
            const statusInfo = change.value;
            console.log(\`[META WEBHOOK] Status update for Campaign \${statusInfo.campaign_id}: \${statusInfo.status}\`);
            
            let ourStatus = 'PENDING';
            if (statusInfo.status === 'ACTIVE' || statusInfo.status === 'APPROVED') ourStatus = 'ACTIVE';
            else if (statusInfo.status === 'PAUSED') ourStatus = 'PAUSED';
            else if (statusInfo.status === 'REJECTED' || statusInfo.status === 'DISAPPROVED') ourStatus = 'REJECTED';
            
            await pool.query(
               "UPDATE host_marketing_campaigns SET meta_status = $1, status = CASE WHEN status != 'PAUSED' THEN $1 ELSE status END WHERE meta_campaign_id = $2 OR meta_ad_id = $2",
               [ourStatus, statusInfo.campaign_id]
            );
          }
          
          if (change.field === 'ad_insights' || change.field === 'spend_update') {
            const insightInfo = change.value;
            console.log(\`[META WEBHOOK] Spend update for Campaign \${insightInfo.campaign_id}: \${insightInfo.spend}\`);
            
            // Background sync updates the "Fuel Tank" metric
            await pool.query(
               "UPDATE host_marketing_campaigns SET spent_budget = COALESCE(spent_budget, 0) + $1 WHERE meta_campaign_id = $2 OR meta_ad_id = $2",
               [Number(insightInfo.spend) || 0, insightInfo.campaign_id]
            );
          }
`;

// Insert it right after the if (change.field === 'leadgen') { ... } block ends.
// A safe way is to replace the leadgen block closing brace.
// Let's use regex to find where leadgen block ends.
// Since the code was injected previously as:
/*
          if (change.field === 'leadgen') {
            ...
          }
*/
const searchStr = "if (change.field === 'leadgen') {";
if (code.includes(searchStr)) {
   const parts = code.split(searchStr);
   // parts[1] is the rest. We need to find the matching closing brace.
   let braceCount = 1;
   let i = 0;
   while(i < parts[1].length && braceCount > 0) {
      if(parts[1][i] === '{') braceCount++;
      if(parts[1][i] === '}') braceCount--;
      i++;
   }
   
   if (braceCount === 0) {
       const before = parts[0] + searchStr + parts[1].substring(0, i);
       const after = parts[1].substring(i);
       code = before + "\n" + additionalWebhookLogic + after;
       fs.writeFileSync('server.ts', code);
       console.log("Successfully injected Milestone 2 Webhook logic.");
   } else {
       console.log("Could not find matching brace.");
   }
} else {
   console.log("Could not find leadgen block.");
}
