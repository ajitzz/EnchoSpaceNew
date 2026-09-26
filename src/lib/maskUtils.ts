import xss from 'xss';

// Walled Garden Data Masking (Gap 5 & Milestone 4.2)
export function maskContactInfo(text: string): { sanitized: string; wasSanitized: boolean } {
  if (!text) return { sanitized: '', wasSanitized: false };
  const original = text;
  
  // 1. WhatsApp links and URLs first to prevent phone regex from corrupting web links
  let sanitized = original.replace(/(wa\.me\/\S+|api\.whatsapp\.com\/send\?\S+|whatsapp:\/\/\S+)/gi, '[WHATSAPP REDACTED]');
  sanitized = sanitized.replace(/(https?:\/\/[^\s]+)/gi, '[LINK REDACTED]');
  sanitized = sanitized.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[EMAIL REDACTED]');
  sanitized = sanitized.replace(/(\+?\d[\d\s\-.()]{7,}\d)/gi, '[PHONE REDACTED]');

  // Phase 4.2: Prevent XSS execution for injected scripts in CRM messages
  sanitized = xss(sanitized, {
    whiteList: {}, // strictly disallow all HTML tags in standard text parsing
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style']
  });

  return { sanitized, wasSanitized: sanitized !== original };
}
