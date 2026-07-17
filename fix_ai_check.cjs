const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const aiCheckBlockStart = code.indexOf("// Run AI check on a draft");
const aiCheckBlockEnd = code.indexOf("res.json(aiResults);", aiCheckBlockStart);

const aiCheckBlock = code.substring(aiCheckBlockStart, aiCheckBlockEnd);

const oldPromptMatch = aiCheckBlock.match(/const prompt = `[\s\S]*?`;/);

const properAiCheckPrompt = `const prompt = \`
          You are the Encho Master Marketing Engine Gatekeeper AI. Your job is to strictly grade this property marketing ad campaign out of 10.
          If the campaign contains empty placeholders, copyright issues, discriminatory language (HEC), or poor targeting, grade it below 8.
          
          Campaign Details:
          Title: "\${campaign.title}"
          Ad Copy (Feed): "\${campaign.feed_description}"
          Target Locations: "\${campaign.target_locations}"
          Property Title: "\${campaign.listing_title}"
          Property Description: "\${campaign.listing_description}"

          Analyze the copy, media formats, and targeting. 
          Return a JSON object exactly matching this structure:
          {
            "score": 8.5,
            "checks": [
              { "name": "Housing Equality (HEC Rules)", "passed": true, "feedback": "Feedback here" },
              { "name": "Ad Megaphone Readability", "passed": true, "feedback": "Feedback here" },
              { "name": "Targeting Precision", "passed": true, "feedback": "Feedback here" }
            ],
            "suggestions": "High-impact suggestion for the host to improve ROAS."
          }
        \`;`;

const newAiCheckBlock = aiCheckBlock.replace(oldPromptMatch[0], properAiCheckPrompt);

code = code.substring(0, aiCheckBlockStart) + newAiCheckBlock + code.substring(aiCheckBlockEnd);

fs.writeFileSync('server.ts', code);
console.log('Fixed ai-check prompt');
