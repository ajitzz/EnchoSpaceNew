const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// The strategy is to replace standard pool.query UPDATE host_marketing_campaigns SET status = ...
// with our transitionCampaignState function if possible. However, the function needs a client.
// Since most of these don't use a client block, we can use the pool.

const replacementFunction = `
async function transitionCampaignState({
  client,
  campaignId,
  from,
  to,
  reason,
  actorType = 'system',
  actorId = 'system',
  correlationId = null,
  transactionId = null
}: any) {
  // If no client provided, use pool
  const db = client || pool;
  
  // Validate transitions
  const invalidTransitions = [
    { from: 'draft', to: 'active' },
    { from: 'failed', to: 'active' },
    { from: 'failed_publish', to: 'active' },
    { from: 'pending', to: 'active' },
    { from: 'cancelled', to: 'active' },
    { from: 'killed', to: 'active' } // Cannot revive killed
  ];

  for (const rule of invalidTransitions) {
    if ((from && from === rule.from) && to === rule.to) {
      throw new Error(\`INVALID_STATE_TRANSITION: Cannot transition from \${from} to \${to}\`);
    }
  }

  // Update Campaign
  await db.query(
    "UPDATE host_marketing_campaigns SET status = $1, admin_feedback = COALESCE($2, admin_feedback), updated_at = CURRENT_TIMESTAMP WHERE id = $3",
    [to, reason || null, campaignId]
  );

  // Append Event
  await db.query(\`
    INSERT INTO meta_publishing_events (
      transaction_id, campaign_id, event_type, from_state, to_state, actor_type, actor_id, reason, correlation_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  \`, [
    transactionId, campaignId, \`STATE_TRANSITION_\${to.toUpperCase()}\`, from, to, actorType, actorId, reason, correlationId
  ]);
}
`;

// Now replace the function in server.ts
code = code.replace(/async function transitionCampaignState\([\s\S]*?\n\}\n/, replacementFunction + "\n");

// Write it back
fs.writeFileSync('server.ts', code);
console.log("transition function updated.");
