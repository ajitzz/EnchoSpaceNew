const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetImports = `import jwt from 'jsonwebtoken';`;
const newImports = `import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';`;

const rateLimitConfig = `
// Phase 4: Security & Rate Limiting
const aiGatekeeperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // Limit each IP to 5 AI evaluation requests per windowMs
  message: 'Too many campaign evaluations from this IP, please try again after an hour.',
  standardHeaders: true, // Return rate limit info in the \`RateLimit-*\` headers
  legacyHeaders: false, // Disable the \`X-RateLimit-*\` headers
});
`;

if (!code.includes('import rateLimit from')) {
    code = code.replace(targetImports, newImports);
    
    // Insert config after Express init
    const expressInit = `const app = express();`;
    code = code.replace(expressInit, expressInit + '\\n' + rateLimitConfig);
}

const targetAiRoute = `app.post('/api/marketing/evaluate', authenticateToken, async (req: AuthRequest, res) => {`;
const newAiRoute = `app.post('/api/marketing/evaluate', authenticateToken, aiGatekeeperLimiter, async (req: AuthRequest, res) => {`;

code = code.replace(targetAiRoute, newAiRoute);

fs.writeFileSync('server.ts', code);
console.log('Fixed Rate Limits');
