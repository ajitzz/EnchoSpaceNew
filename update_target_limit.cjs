const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `app.post('/api/marketing/grade-targeting', authenticateToken, async (req: AuthRequest, res) => {`;
const replacement = `app.post('/api/marketing/grade-targeting', authenticateToken, aiGatekeeperLimiter, async (req: AuthRequest, res) => {`;
code = code.replace(target, replacement);

fs.writeFileSync('server.ts', code);
console.log('Target limiting updated');
