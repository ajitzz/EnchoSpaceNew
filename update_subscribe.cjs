const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetStr = "    const finalAmount = amount || campaign.budget || 2500;";

const gatekeeperLogic = `
    // AI Gatekeeper Check
    let gatekeeperScore = 10;
    let gatekeeperFeedback = "Looks good.";
    if (ai) {
      try {
        const prompt = \`
          You are the Encho Master Marketing Engine Gatekeeper AI. Your job is to strictly grade this property marketing ad campaign out of 10.
          If the campaign contains empty placeholders, copyright issues, discriminatory language (HEC), or poor targeting, grade it below 8.
          
          Campaign Details:
          Title: "\${campaign.title}"
          Ad Copy (Feed): "\${campaign.feed_description}"
          Target Locations: "\${campaign.target_locations}"
          Property Title: "\${campaign.listing_title}"

          Analyze the copy and targeting. 
          Return a JSON object exactly matching this structure:
          {
            "score": 8.5,
            "feedback": "Detailed explanation of the score"
          }
        \`;
        
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });
        
        const reply = response?.text?.trim();
        if (reply) {
          const parsed = JSON.parse(reply);
          gatekeeperScore = parsed.score;
          gatekeeperFeedback = parsed.feedback;
        }
      } catch (geminiError) {
        console.warn("Gatekeeper AI failed, defaulting to 10:", geminiError);
      }
    }

    if (gatekeeperScore < 8) {
      // Auto-reject
      await pool.query(\`
        UPDATE host_marketing_campaigns 
        SET status = 'rejected', admin_feedback = $1 
        WHERE id = $2
      \`, [\`[AI Gatekeeper Auto-Reject] Score: \${gatekeeperScore}/10. \${gatekeeperFeedback}\`, campaign.id]);
      
      return res.status(400).json({ 
        error: 'Campaign failed AI Gatekeeper Check.', 
        gatekeeper_score: gatekeeperScore, 
        gatekeeper_feedback: gatekeeperFeedback 
      });
    }
`;

code = code.replace(targetStr, targetStr + "\n" + gatekeeperLogic);
fs.writeFileSync('server.ts', code);
console.log('Updated subscribe endpoint with gatekeeper');
