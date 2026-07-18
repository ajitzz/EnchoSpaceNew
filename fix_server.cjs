const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Fix RLS Syntax error
code = code.replace(/\\$\\$/g, '$$$$');

// Fix Express Rate Limit IPv6 error
code = code.replace(`const aiGatekeeperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per host per hour
  message: { error: 'Rate limit exceeded. Maximum 5 campaign AI evaluations per hour.' },
  keyGenerator: (req) => {
    return req.user?.id ? \`ai_gate_\${req.user.id}\` : req.ip;
  }
});`, `const aiGatekeeperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per host per hour
  message: { error: 'Rate limit exceeded. Maximum 5 campaign AI evaluations per hour.' },
  keyGenerator: (req) => {
    return req.user?.id ? \`ai_gate_\${req.user.id}\` : req.ip || '0.0.0.0';
  }
});`);

fs.writeFileSync('server.ts', code);
console.log('Fixed server.ts errors');
