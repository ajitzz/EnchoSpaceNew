const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetJsonStructure = `"property_analysis": {
              "location_dna": "1-2 sentence breakdown of destination vibe and geography",
              "key_selling_points": ["Point 1", "Point 2", "Point 3"],
              "target_audience_appeal": "Explanation of universal reach strategy across groups, couples & families"
            },`;

const newJsonStructure = `"property_analysis": {
              "location_dna": "1-2 sentence breakdown of destination vibe and geography",
              "key_selling_points": ["Point 1", "Point 2", "Point 3"],
              "target_audience_appeal": "Explanation of universal reach strategy across groups, couples & families",
              "policy_evasion_engine": {
                 "hec_status": "PASSED or REJECTED",
                 "sanitized_terms": ["List of words removed (e.g. exclusive, cheap, gated)"],
                 "evasion_strategy": "Brief explanation of how the copy evades Meta's housing restrictions"
              }
            },`;

code = code.replace(targetJsonStructure, newJsonStructure);

fs.writeFileSync('server.ts', code);
console.log('Updated server.ts prompt');
