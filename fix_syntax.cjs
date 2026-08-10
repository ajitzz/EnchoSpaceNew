const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

content = content.replace(/'Review and approve campaign in the Admin Moderation Console.\`/g, "'Review and approve campaign in the Admin Moderation Console.'");
content = content.replace(/'Review Preflight Diagnostics in Admin Console.\`/g, "'Review Preflight Diagnostics in Admin Console.'");

const badBlock = `    // Prevent circular reference crashes when persisting error
    const rawErrorPayload = error.metaData || error.response || { error: { message: error.message, diagnosticReport: error.diagnosticReport } };
    const classification = classifyMetaError(rawErrorPayload);
      } catch (e) {
        return JSON.stringify({ error: { message: rawErrorPayload?.message || 'Circular reference in error payload' }});
      }
    })();`;

const goodBlock = `    // Prevent circular reference crashes when persisting error
    const rawErrorPayload = error.metaData || error.response || { error: { message: error.message, diagnosticReport: error.diagnosticReport } };
    const classification = classifyMetaError(rawErrorPayload);
    const safeErrorPayload = (() => {
      try {
        return JSON.stringify(rawErrorPayload);
      } catch (e) {
        return JSON.stringify({ error: { message: rawErrorPayload?.message || 'Circular reference in error payload' }});
      }
    })();`;

content = content.replace(badBlock, goodBlock);

fs.writeFileSync('server.ts', content);
