const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// 1. Line ~4522 AI Gatekeeper pending_approval
code = code.replace(
  /await pool\.query\(\`\s*UPDATE host_marketing_campaigns\s*SET status = \$1,\s*admin_feedback = \$2,\s*rejected_fields = \$3,\s*policy_cleared = \$4,\s*admin_approved = \$5\s*WHERE id = \$6\s*\`, \[updatedStatus, null, '{}', false, false, id\]\);/g,
  `await transitionCampaignState({ campaignId: Number(id), to: updatedStatus as any, reason: 'AI Gatekeeper pre-check completed and transitioned to pending_approval or similar.' });
    await pool.query(\`
      UPDATE host_marketing_campaigns
      SET admin_feedback = $1,
          rejected_fields = $2,
          policy_cleared = $3,
          admin_approved = $4
      WHERE id = $5
    \`, [null, '{}', false, false, id]);`
);

// 2. Line ~5631 Meta reconciliation worker -> META_API_PUSH
code = code.replace(
  /await pool\.query\('UPDATE host_marketing_campaigns SET status = \$1 WHERE id = \$2', \['META_API_PUSH', campaignId\]\);/g,
  `await transitionCampaignState({ campaignId: Number(campaignId), to: 'META_API_PUSH', reason: 'Async dispatch started', actorType: 'system' });`
);

// 3. Line ~5639 Meta reconciliation worker -> CAMPAIGN_LIVE
code = code.replace(
  /await pool\.query\('UPDATE host_marketing_campaigns SET status = \$1 WHERE id = \$2', \['CAMPAIGN_LIVE', campaignId\]\);/g,
  `await transitionCampaignState({ campaignId: Number(campaignId), to: 'CAMPAIGN_LIVE', reason: 'Meta API Push Success', actorType: 'system' });`
);

// 4. Line ~5643 Meta reconciliation worker -> failed
code = code.replace(
  /await pool\.query\('UPDATE host_marketing_campaigns SET status = \$1, admin_feedback = \$2 WHERE id = \$3', \['failed', 'Meta API Push Failed', campaignId\]\);/g,
  `await transitionCampaignState({ campaignId: Number(campaignId), to: 'failed', reason: 'Meta API Push Failed', actorType: 'system' });
                   await pool.query('UPDATE host_marketing_campaigns SET admin_feedback = $1 WHERE id = $2', ['Meta API Push Failed', campaignId]);`
);

// 5. Line ~7056 executeMetaRollback -> failed_publish
code = code.replace(
  /await pool\.query\(\`\s*UPDATE host_marketing_campaigns\s*SET status = 'failed_publish', admin_feedback = \$1\s*WHERE id = \$2\s*\`, \[feedbackMsg, campaignId\]\);/g,
  `await transitionCampaignState({ campaignId: Number(campaignId), to: 'failed_publish', reason: 'Fallback to DLQ after publish error', actorType: 'system' });
    await pool.query(\`
      UPDATE host_marketing_campaigns 
      SET admin_feedback = $1 
      WHERE id = $2
    \`, [feedbackMsg, campaignId]);`
);

// 6. Line ~7692 AI Gatekeeper score < 8 -> rejected
code = code.replace(
  /await pool\.query\(\`\s*UPDATE host_marketing_campaigns\s*SET status = 'rejected', admin_feedback = \$1\s*WHERE id = \$2\s*\`, \[\`\[AI Gatekeeper Auto-Reject\] Score: \$\{gatekeeperScore\}\/10\. \$\{gatekeeperFeedback\}\`, campaign\.id\]\);/g,
  `await transitionCampaignState({ campaignId: Number(campaign.id), to: 'rejected', reason: 'AI Gatekeeper Score < 8', actorType: 'system' });
      await pool.query(\`
        UPDATE host_marketing_campaigns 
        SET admin_feedback = $1 
        WHERE id = $2
      \`, [\`[AI Gatekeeper Auto-Reject] Score: \${gatekeeperScore}/10. \${gatekeeperFeedback}\`, campaign.id]);`
);

// 7. Line ~7758 Internal wallet checkout -> pending
code = code.replace(
  /await pool\.query\(\`\s*UPDATE host_marketing_campaigns\s*SET subscription_active = true,\s*status = 'pending',\s*payment_status = 'paid',\s*payment_gateway = 'internal_wallet',\s*spent = COALESCE\(spent, 0\) \+ \$1,\s*last_pacing_calc_at = NOW\(\)\s*WHERE id = \$2\s*\`, \[adSpendPool, id\]\);/g,
  `await transitionCampaignState({ campaignId: Number(id), to: 'pending', reason: 'Internal Wallet Paid, awaiting admin approval' });
      await pool.query(\`
        UPDATE host_marketing_campaigns
        SET subscription_active = true,
            payment_status = 'paid',
            payment_gateway = 'internal_wallet',
            spent = COALESCE(spent, 0) + $1,
            last_pacing_calc_at = NOW()
        WHERE id = $2
      \`, [adSpendPool, id]);`
);

// 8. Line ~8498 Admin Reject -> rejected
code = code.replace(
  /await pool\.query\(\`\s*UPDATE host_marketing_campaigns\s*SET status = 'rejected', admin_feedback = \$1, rejected_fields = \$2\s*WHERE id = \$3\s*\`, \[feedback \|\| 'Ad does not meet media guidelines\.', JSON\.stringify\(rejected_fields \|\| \{\}\), id\]\);/g,
  `await transitionCampaignState({ campaignId: Number(id), to: 'rejected', reason: 'Admin Rejected', actorType: 'admin', actorId: req.user?.id });
    await pool.query(\`
      UPDATE host_marketing_campaigns
      SET admin_feedback = $1, rejected_fields = $2
      WHERE id = $3
    \`, [feedback || 'Ad does not meet media guidelines.', JSON.stringify(rejected_fields || {}), id]);`
);

// 9. Line ~8723 User Cancel -> cancelled
code = code.replace(
  /await pool\.query\(\`\s*UPDATE host_marketing_campaigns\s*SET status = 'cancelled', admin_feedback = 'Cancelled by user\.'\s*WHERE id = \$1\s*\`, \[id\]\);/g,
  `await transitionCampaignState({ campaignId: Number(id), to: 'cancelled', reason: 'Cancelled by user', actorType: 'host', actorId: req.user?.id });
    await pool.query(\`
      UPDATE host_marketing_campaigns
      SET admin_feedback = 'Cancelled by user.'
      WHERE id = $1
    \`, [id]);`
);

fs.writeFileSync('server.ts', code);
console.log('Replaced many direct updates.');
