const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const limitersToAdd = `
// Milestone 4.4 Hardening: Anti-Spam & Abuse Limiters
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // max 10 bookings per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many bookings created from this IP, please try again after an hour.' }
});

const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 messages per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Message rate limit exceeded. Please wait before sending more.' }
});
`;

// Insert after aiGatekeeperLimiter
const insertPoint = `const aiGatekeeperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // max 5 campaign evaluations per host per hour
  keyGenerator: (req) => {
    // Attempt to rate limit by user ID if authenticated, else IP
    return (req as any).user?.id ? \`ai_limit_user_\${(req as any).user.id}\` : req.ip || 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI Evaluation limit reached. You can only evaluate 5 campaigns per hour to prevent budget drain.' }
});`;

code = code.replace(insertPoint, insertPoint + limitersToAdd);

// Add to booking route
code = code.replace(`app.post('/api/bookings', authenticateToken, async (req: AuthRequest, res) => {`, `app.post('/api/bookings', authenticateToken, bookingLimiter, async (req: AuthRequest, res) => {`);
code = code.replace(`app.post('/api/experience-bookings', authenticateToken, async (req: AuthRequest, res) => {`, `app.post('/api/experience-bookings', authenticateToken, bookingLimiter, async (req: AuthRequest, res) => {`);

// Add to message route
code = code.replace(`app.post('/api/threads/:id/messages', authenticateToken, async (req: AuthRequest, res) => {`, `app.post('/api/threads/:id/messages', authenticateToken, messageLimiter, async (req: AuthRequest, res) => {`);
code = code.replace(`app.post('/api/messages', authenticateToken, async (req: AuthRequest, res) => {`, `app.post('/api/messages', authenticateToken, messageLimiter, async (req: AuthRequest, res) => {`);

fs.writeFileSync('server.ts', code);
console.log('Limiters added');
