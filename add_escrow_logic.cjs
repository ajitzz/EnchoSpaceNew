const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `    const campaign = campaignResult.rows[0];
    
    console.log(\`[META API DISPATCH] Initiating Meta Ads API call for Campaign #\${campaign.id}...\`);`;

const replacement = `    const campaign = campaignResult.rows[0];
    
    // Gap 6: Master Account Fraud Liability & Chargeback Escrow
    const userRes = await pool.query('SELECT created_at FROM users WHERE id = $1', [campaign.host_id]);
    const user = userRes.rows[0];
    // Treat as "new" if created within the last 30 days
    const isNewHost = user && new Date(user.created_at).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000;
    
    // If it's a new host and we haven't already marked it as escrow, do so.
    if (isNewHost && campaign.status !== 'escrow') {
      console.log(\`[ESCROW DELAY] Host \${campaign.host_id} is new. Holding Campaign #\${campaignId} in 24-hour Escrow to prevent fraud.\`);
      await pool.query(
        \`UPDATE host_marketing_campaigns 
         SET status = 'escrow', 
             admin_feedback = 'Your campaign is in a mandatory 24-hour security escrow. This is standard for new hosts to protect the platform from fraud.',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1\`, 
        [campaignId]
      );
      if (req && typeof broadcastDbEvent === 'function') {
         broadcastDbEvent(req, 'marketing');
      }
      return false;
    }

    console.log(\`[META API DISPATCH] Initiating Meta Ads API call for Campaign #\${campaign.id}...\`);`;

code = code.replace(target, replacement);
fs.writeFileSync('server.ts', code);
console.log('Escrow logic added');
