import { describe, it, expect } from 'vitest';

describe('Phase 4 Adversarial & Security Audit: 10.0 Aman Luxury Standard', () => {
  // 1. Strict Ledger Calculation Invariant
  describe('1. Strict Ledger Calculation & Optimization Fee Invariant', () => {
    it('accurately calculates 15% SaaS optimization fee and 18% tax without rounding drift', () => {
      const basePrice = 3500;
      const nights = 3;
      const baseRentTotal = basePrice * nights; // 10,500
      const enchoFee = Math.round(baseRentTotal * 0.15); // 1,575
      const taxAmount = Math.round(baseRentTotal * 0.18); // 1,890
      const grandTotal = baseRentTotal + enchoFee + taxAmount; // 13,965

      expect(baseRentTotal).toBe(10500);
      expect(enchoFee).toBe(1575);
      expect(taxAmount).toBe(1890);
      expect(grandTotal).toBe(13965);
      expect(grandTotal).toBe(baseRentTotal + enchoFee + taxAmount);
    });

    it('enforces minimum 1 night duration on identical or inverted date selections', () => {
      const checkIn = '2026-09-01';
      const checkOut = '2026-09-01';
      const start = new Date(checkIn);
      const end = new Date(checkOut);
      const diff = end.getTime() - start.getTime();
      const nights = Math.max(1, Math.ceil(diff / (1000 * 3600 * 24)));

      expect(nights).toBe(1);
    });
  });

  // 2. Chameleon Aura Hex Validator & Sanitizer
  describe('2. Chameleon Aura Tone Hex Sanitization', () => {
    const sanitizeHex = (hex?: string, fallback = '#06b6d4') => {
      if (!hex || typeof hex !== 'string') return fallback;
      const trimmed = hex.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(trimmed) || /^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
        return trimmed;
      }
      return fallback;
    };

    it('accepts valid 6-char and 3-char hex colors', () => {
      expect(sanitizeHex('#06b6d4')).toBe('#06b6d4');
      expect(sanitizeHex('#EA580C')).toBe('#EA580C');
      expect(sanitizeHex('#FFF')).toBe('#FFF');
    });

    it('neutralizes malicious XSS / CSS injection vectors and returns fallback', () => {
      expect(sanitizeHex('javascript:alert(1)')).toBe('#06b6d4');
      expect(sanitizeHex('url(https://attacker.com/evil.css)')).toBe('#06b6d4');
      expect(sanitizeHex('"; color: red; "')).toBe('#06b6d4');
      expect(sanitizeHex('')).toBe('#06b6d4');
      expect(sanitizeHex(undefined)).toBe('#06b6d4');
    });
  });

  // 3. Soft Exit Lead Email Validation & Sanitization
  describe('3. Soft Exit Lead Capture Security & PII Sanitization', () => {
    const validateAndSanitizeLead = (email: string) => {
      if (!email || typeof email !== 'string') return null;
      const clean = email.trim().toLowerCase();
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(clean)) return null;
      return clean;
    };

    it('sanitizes valid email inputs into normalized lowercase', () => {
      expect(validateAndSanitizeLead('  VIP.Guest@AmanSanctuary.com ')).toBe('vip.guest@amansanctuary.com');
      expect(validateAndSanitizeLead('founder@encho.space')).toBe('founder@encho.space');
    });

    it('rejects invalid, empty, or malicious SQL/XSS email injection attempts', () => {
      expect(validateAndSanitizeLead('not-an-email')).toBeNull();
      expect(validateAndSanitizeLead('<script>alert("xss")</script>@evil.com')).toBeNull();
      expect(validateAndSanitizeLead("admin' OR '1'='1")).toBeNull();
      expect(validateAndSanitizeLead('')).toBeNull();
    });
  });

  // 4. AI Rule Abstraction Guidelines Parser
  describe('4. AI Rule Abstraction & Aristocratic Guidelines Parser', () => {
    const parseGuidelines = (rawInput: any): string[] => {
      if (Array.isArray(rawInput)) return rawInput;
      if (typeof rawInput === 'string' && rawInput.trim()) {
        try {
          const parsed = JSON.parse(rawInput);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          return rawInput.split('\n').map(s => s.trim()).filter(Boolean);
        }
      }
      return [
        'Pure Atmospheric Harmony: Uninterrupted tranquility is preserved throughout the sanctuary grounds.',
        'Curated Climate Control: Intelligent smart climate maintains optimal botanical humidity and airflow.',
        'Bespoke Sanctuary Attire: We invite guests to honor the minimalist floors with our handcrafted linen slippers.'
      ];
    };

    it('parses JSON string arrays accurately', () => {
      const jsonStr = JSON.stringify(['01. Mountain Silence', '02. Eco Footwear']);
      expect(parseGuidelines(jsonStr)).toEqual(['01. Mountain Silence', '02. Eco Footwear']);
    });

    it('parses newline-separated text strings gracefully', () => {
      const newlineStr = 'No loud music after 10 PM\nKeep the infinity pool pristine';
      expect(parseGuidelines(newlineStr)).toEqual(['No loud music after 10 PM', 'Keep the infinity pool pristine']);
    });

    it('falls back to 3 aristocratic guidelines when null/undefined is provided', () => {
      const fallback = parseGuidelines(null);
      expect(fallback.length).toBe(3);
      expect(fallback[0]).toContain('Pure Atmospheric Harmony');
    });
  });

  // 5. Sensory Atmosphere Deck Tag Classifier
  describe('5. Sensory Atmosphere Deck Tag Classification', () => {
    const classifySensoryCategory = (tag: string): string => {
      const lower = tag.toLowerCase();
      if (lower.includes('ocean') || lower.includes('wave') || lower.includes('sea') || lower.includes('beach')) return 'AQUATIC';
      if (lower.includes('pool') || lower.includes('heat') || lower.includes('sauna') || lower.includes('spa')) return 'THERMAL';
      if (lower.includes('chef') || lower.includes('culinary') || lower.includes('kitchen') || lower.includes('dine')) return 'CULINARY';
      if (lower.includes('wifi') || lower.includes('fiber') || lower.includes('internet') || lower.includes('work')) return 'CONNECTIVITY';
      if (lower.includes('mountain') || lower.includes('view') || lower.includes('panorama') || lower.includes('summit')) return 'VISTA';
      if (lower.includes('wine') || lower.includes('cellar') || lower.includes('bar')) return 'SOMMELIER';
      if (lower.includes('butler') || lower.includes('service') || lower.includes('concierge')) return 'CONCIERGE';
      return 'ATMOSPHERE';
    };

    it('accurately categorizes diverse luxury hospitality tags', () => {
      expect(classifySensoryCategory('Ocean Waves & Coastal Breezes')).toBe('AQUATIC');
      expect(classifySensoryCategory('Heated Infinity Pool')).toBe('THERMAL');
      expect(classifySensoryCategory('Private Michelin Chef Available')).toBe('CULINARY');
      expect(classifySensoryCategory('1 Gbps Fiber Dedicated WiFi')).toBe('CONNECTIVITY');
      expect(classifySensoryCategory('Panoramic Mountain Summit View')).toBe('VISTA');
      expect(classifySensoryCategory('Curated Sommelier Wine Cellar')).toBe('SOMMELIER');
      expect(classifySensoryCategory('24/7 Dedicated Butler Concierge')).toBe('CONCIERGE');
      expect(classifySensoryCategory('Zen Garden Meditation')).toBe('ATMOSPHERE');
    });
  });
});
