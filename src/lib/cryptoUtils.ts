import crypto from 'crypto';

// Phase 4.1: Field-Level Encryption for PII at Rest
// Note: In a real FAANG system, ENCRYPTION_KEY would be loaded from AWS KMS or HashiCorp Vault.
const ENCRYPTION_KEY_HEX = process.env.PII_ENCRYPTION_KEY_HEX || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

export function encryptPII(text: string | null | undefined): string | null {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY_HEX, 'hex'), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptPII(text: string | null | undefined): string | null {
  if (!text) return null;
  const textParts = text.split(':');
  if (textParts.length !== 2) return text; // Probably not encrypted or legacy data
  try {
     const iv = Buffer.from(textParts[0], 'hex');
     const encryptedText = Buffer.from(textParts[1], 'hex');
     const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY_HEX, 'hex'), iv);
     let decrypted = decipher.update(encryptedText);
     decrypted = Buffer.concat([decrypted, decipher.final()]);
     return decrypted.toString();
  } catch (e) {
     return text; // Fallback to raw text if decryption fails
  }
}
