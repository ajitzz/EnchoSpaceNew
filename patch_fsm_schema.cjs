const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(
  /\[campaignId, eventCorrId, 'STATE_TRANSITION', currentState, to, actorType, String\(actorId\), reason\]/,
  `[campaignId, eventCorrId, currentState, to, actorType, String(actorId), reason]`
);
fs.writeFileSync('server.ts', code);
