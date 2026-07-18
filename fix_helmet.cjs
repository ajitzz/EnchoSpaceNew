const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const origHelmet = `// Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabling CSP for development/vite compatibility
  crossOriginEmbedderPolicy: false
}));`;

const newHelmet = `// Security Headers (Hardened for Production)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https:", "http:", "wss:", "ws:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"]
    }
  },
  crossOriginEmbedderPolicy: false, // Needed false for external images usually
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow loading cross-origin images
}));`;

code = code.replace(origHelmet, newHelmet);
fs.writeFileSync('server.ts', code);
console.log('Helmet config updated');
