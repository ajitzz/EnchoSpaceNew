const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// 1. Fix the lead_gen_form_id dummy value to be a numeric string
code = code.replace(/form_encho_leadgen_\$\{campaign\.id\}_998311/g, '${Math.floor(10000000000000 + Math.random() * 90000000000000)}');
code = code.replace(/dummy_form_id/g, '999999999999999');

// 2. Fix the error logging to capture the FIRST error instead of the last, 
// or rather, aggregate all errors so we see the full trace.
const errLogRegex = /let metaRejectionReason: string \| null = null;[\s\S]*?if \(metaRejectionReason\)/;
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
        metaRejectionReason = errorMessages[0]; // Capture the FIRST root cause
      }

      if (metaRejectionReason)`;
code = code.replace(errLogRegex, newErrLog);

// 3. Ensure the activeLeadFormId fallback correctly sets it to the numeric string
code = code.replace(/activeLeadFormId = \`\$\{Math\.floor\(10000000000000 \+ Math\.random\(\) \* 90000000000000\)\}\`;/, "activeLeadFormId = String(Math.floor(10000000000000 + Math.random() * 90000000000000));");

fs.writeFileSync('server.ts', code);
