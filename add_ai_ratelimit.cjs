const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `// Apply rate limiter to all API routes
app.use('/api/', apiLimiter);`;

const replacement1 = `// Apply rate limiter to all API routes
app.use('/api/', apiLimiter);

// Gap 4: AI Rate Limiting & Fallback
const aiGatekeeperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // max 5 campaign evaluations per host per hour
  keyGenerator: (req) => {
    // Attempt to rate limit by user ID if authenticated, else IP
    return (req as any).user?.id ? \`ai_limit_user_\${(req as any).user.id}\` : req.ip || 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Strict AI Limit Exceeded: Maximum 5 campaign evaluations allowed per hour to prevent API abuse.' }
});`;

code = code.replace(target1, replacement1);

const target2 = `app.post('/api/marketing/campaigns/:id/ai-check', authenticateToken, async (req: AuthRequest, res) => {`;
const replacement2 = `app.post('/api/marketing/campaigns/:id/ai-check', authenticateToken, aiGatekeeperLimiter, async (req: AuthRequest, res) => {`;
code = code.replace(target2, replacement2);

fs.writeFileSync('server.ts', code);
console.log('AI Gatekeeper Rate Limiter added');
