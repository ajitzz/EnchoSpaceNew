const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const maskingFn = `
// Walled Garden Data Masking (Gap 5)
function maskContactInfo(text: string): { sanitized: string, wasSanitized: boolean } {
  if (!text) return { sanitized: '', wasSanitized: false };
  let original = text;
  
  // Mask Emails
  let sanitized = original.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)/gi, '[EMAIL REDACTED]');
  
  // Mask Phones (+1 555-0199, 555-0199, etc)
  sanitized = sanitized.replace(/(\\+?\\d[\\d\\s\\-\\.()]{7,}\\d)/gi, '[PHONE REDACTED]');
  
  // Mask WhatsApp Links (wa.me/...)
  sanitized = sanitized.replace(/(wa\\.me\\/\\d+|api\\.whatsapp\\.com\\/send\\?phone=\\d+)/gi, '[WHATSAPP REDACTED]');
  
  // Mask URLs to prevent bypassing
  sanitized = sanitized.replace(/(https?:\\/\\/[^\\s]+)/gi, '[LINK REDACTED]');

  return { sanitized, wasSanitized: sanitized !== original };
}
`;

const importsIdx = code.indexOf("const app = express();");
code = code.substring(0, importsIdx) + maskingFn + "\n" + code.substring(importsIdx);

fs.writeFileSync('server.ts', code);
console.log('Masking function added');
