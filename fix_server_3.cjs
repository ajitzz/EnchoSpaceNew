const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// The replacement was incomplete last time, let's fix it by completely rewriting the rate limiter section
const rateLimiterOrig = `// Prevent express-rate-limit IPv6 validation errors by providing standard ipKeyGenerator if we fall back
import { ipKeyGenerator } from 'express-rate-limit';

const aiGatekeeperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per host per hour
  message: { error: 'Rate limit exceeded. Maximum 5 campaign AI evaluations per hour.' },
  keyGenerator: (req, res) => {
    if (req.user?.id) {
       return \`ai_gate_\${req.user.id}\`;
    }
    return ipKeyGenerator(req, res);
  }
});`;

const rateLimiterNew = `const aiGatekeeperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per host per hour
  message: { error: 'Rate limit exceeded. Maximum 5 campaign AI evaluations per hour.' },
  keyGenerator: (req) => {
    return req.user?.id ? \`ai_gate_\${req.user.id}\` : req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  }
});`;

code = code.replace(rateLimiterOrig, rateLimiterNew);

// Fix RLS again
code = code.replace(/CREATE OR REPLACE FUNCTION current_app_user_id\(\) RETURNS integer AS \$\$ SELECT NULLIF\(current_setting\('app.current_user_id', true\), ''\)::integer; \$\$ LANGUAGE sql STABLE;/g, "CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS integer AS 'SELECT NULLIF(current_setting(''app.current_user_id'', true), '''')' LANGUAGE sql STABLE;");

fs.writeFileSync('server.ts', code);
console.log('Fixed server.ts errors again');
