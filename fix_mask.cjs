const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetMask = `  // Phase 4.1: Stronger regex for complex masking and XSS prevention
  let sanitized = original.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[EMAIL REDACTED]');
  sanitized = sanitized.replace(/(\\+?\\d[\\d\\s\\-.()]{7,}\\d)/gi, '[PHONE REDACTED]');
  sanitized = sanitized.replace(/(wa\\.me\\/\\d+|api\\.whatsapp\\.com\\/send\\?phone=\\d+)/gi, '[WHATSAPP REDACTED]');
  sanitized = sanitized.replace(/(https?:\\/\\/[^\\s]+)/gi, '[LINK REDACTED]');`;

const newMask = `  // Phase 4.1: Walled Garden Lead Security (Data Masking)
  // Aggressively block and mask external phone numbers, email addresses, and WhatsApp links
  let sanitized = original.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[REDACTED_BY_ENCHO_WALLED_GARDEN]');
  sanitized = sanitized.replace(/(\\+?\\d[\\d\\s\\-.()]{7,}\\d)/gi, '[REDACTED_BY_ENCHO_WALLED_GARDEN]');
  sanitized = sanitized.replace(/(wa\\.me\\/\\d+|api\\.whatsapp\\.com\\/send\\?phone=\\d+)/gi, '[REDACTED_BY_ENCHO_WALLED_GARDEN]');
  sanitized = sanitized.replace(/(https?:\\/\\/[^\\s]+)/gi, '[REDACTED_BY_ENCHO_WALLED_GARDEN]');`;

code = code.replace(targetMask, newMask);
fs.writeFileSync('server.ts', code);
console.log('Fixed maskContactInfo');
