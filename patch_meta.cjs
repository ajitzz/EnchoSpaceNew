const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// 1. Fix dummy lead form ID
code = code.replace(/form_encho_leadgen_\$\{campaign\.id\}_998311/g, '${Math.floor(10000000000000 + Math.random() * 90000000000000)}');
code = code.replace(/'dummy_form_id'/g, "'999999999999999'");

// 2. Fix error overwriting 
const errLogRegex = /let metaRejectionReason: string \| null = null;\s*for \(const stepLog of syncLogs\.steps\) \{\s*if \(stepLog\.error\) \{\s*metaRejectionReason = stepLog\.error;\s*\} else if \(stepLog\.response && stepLog\.response\.error\) \{\s*metaRejectionReason = stepLog\.response\.error\.message \|\| JSON\.stringify\(stepLog\.response\.error\);\s*\}\s*\}\s*if \(metaRejectionReason\)/m;

const newErrLog = `let metaRejectionReason: string | null = null;
      const errorMessages: string[] = [];
      for (const stepLog of syncLogs.steps) {
        if (stepLog.error) {
          errorMessages.push(\`[\${stepLog.step}] \${stepLog.error}\`);
        } else if (stepLog.response && stepLog.response.error) {
          errorMessages.push(\`[\${stepLog.step}] \${stepLog.response.error.message || JSON.stringify(stepLog.response.error)}\`);
        }
      }
      
      if (errorMessages.length > 0) {
        metaRejectionReason = errorMessages.join(' | '); // Capture all errors to see the full trace
      }

      if (metaRejectionReason)`;

code = code.replace(errLogRegex, newErrLog);

fs.writeFileSync('server.ts', code);
