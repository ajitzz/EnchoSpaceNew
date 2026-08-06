const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetPrompt = `          Return a JSON object exactly matching this structure:
          {
            "recommended_locations": "Metropolitan cities list (comma-separated)",
            "feeder_insights": "A professional, brutally honest explanation of why these metro areas are the absolute highest-converting feeder markets for this property type.",
            "default_audience": "Audience buckets list (e.g. Couples, Tech Professionals, Families)",
            "audience_reach_count": 9200000
          }`;

const newPrompt = `          Your recommendations will be fed directly into Meta's Advantage+ Broad Targeting AI. 
          Return a JSON object exactly matching this structure:
          {
            "recommended_locations": "Metropolitan cities list (comma-separated)",
            "feeder_insights": "A professional, brutally honest explanation of why these metro areas are the highest-converting feeder markets. Mention that Encho's Advantage+ Targeting will automatically find the highest-intent buyers within these broad geos.",
            "default_audience": "Advantage+ Broad Targeting (AI Managed)",
            "audience_reach_count": 9200000
          }`;

code = code.replace(targetPrompt, newPrompt);

fs.writeFileSync('server.ts', code);
console.log('Upgraded targeting recommendation for Advantage+');
