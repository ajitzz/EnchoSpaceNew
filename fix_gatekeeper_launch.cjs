const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetPrompt = `          Return a JSON object exactly matching this structure:
          {
            "score": 8.5,
            "feedback": "Detailed explanation of the score"
          }`;

const newPrompt = `          Return a JSON object exactly matching this structure:
          {
            "score": 8.5,
            "feedback": "Detailed explanation of the score",
            "rewritten_title": "The new AIDA-optimized title",
            "rewritten_ad_copy": "The new AIDA-optimized body copy"
          }`;

code = code.replace(targetPrompt, newPrompt);

const targetParse = `        if (reply) {
          const parsed = JSON.parse(reply);
          gatekeeperScore = parsed.score;
          gatekeeperFeedback = parsed.feedback;
        }`;

const newParse = `        if (reply) {
          const parsed = JSON.parse(reply);
          gatekeeperScore = parsed.score;
          gatekeeperFeedback = parsed.feedback;
          
          if (parsed.rewritten_title && parsed.rewritten_ad_copy) {
            await pool.query(
              "UPDATE host_marketing_campaigns SET title = $1, feed_description = $2, description = $2 WHERE id = $3",
              [parsed.rewritten_title, parsed.rewritten_ad_copy, campaign.id]
            );
            console.log(\`[AI GATEKEEPER] Successfully rewrote Campaign #\${campaign.id} to AIDA framework.\`);
          }
        }`;

code = code.replace(targetParse, newParse);

fs.writeFileSync('server.ts', code);
console.log('Upgraded Launch AI Gatekeeper for AIDA Rewriting');
