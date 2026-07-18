const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetImports = `const apiLimiter = rateLimit({`;

const replaceImports = `// Strict limiters for Auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10, // max 10 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' }
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // max 5 OTP requests per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests, please try again later' }
});

const apiLimiter = rateLimit({`;

code = code.replace(targetImports, replaceImports);

const targetOtp = `app.post('/api/auth/otp/send', async (req, res) => {`;
const replaceOtp = `app.post('/api/auth/otp/send', otpLimiter, async (req, res) => {`;
code = code.replace(targetOtp, replaceOtp);

const targetLogin = `app.post('/api/auth/login', async (req, res) => {`;
const replaceLogin = `app.post('/api/auth/login', authLimiter, async (req, res) => {`;
code = code.replace(targetLogin, replaceLogin);

const targetRegister = `app.post('/api/auth/register', async (req, res) => {`;
const replaceRegister = `app.post('/api/auth/register', authLimiter, async (req, res) => {`;
code = code.replace(targetRegister, replaceRegister);

fs.writeFileSync('server.ts', code);
