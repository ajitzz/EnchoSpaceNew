const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const badBlock = `  } catch (error: any) {
    console.error(\`[META ENGINE FAULT] Campaign \${campaignId} failed.\`, error);
    
    const rawErrorPayload = error.metaData || error.response || { error: { message: error.message } };
    const classification = classifyMetaError(rawErrorPayload);`;

const goodBlock = `  } catch (error: any) {
    console.error(\`[META ENGINE FAULT] Campaign \${campaignId} failed.\`, error);
    
    const rawErrorPayload = error.metaData || error.response || { error: { message: error.message, diagnosticReport: error.diagnosticReport } };
    const classification = classifyMetaError(rawErrorPayload);`;

content = content.replace(badBlock, goodBlock);

const badBlock2 = `    // Prevent circular reference crashes when persisting error
    const rawErrorPayload = error.metaData || error.response || { error: { message: error.message, diagnosticReport: error.diagnosticReport } };
    const classification = classifyMetaError(rawErrorPayload);
    const safeErrorPayload = (() => {`;

const goodBlock2 = `    // Prevent circular reference crashes when persisting error
    const safeErrorPayload = (() => {`;

content = content.replace(badBlock2, goodBlock2);

fs.writeFileSync('server.ts', content);
