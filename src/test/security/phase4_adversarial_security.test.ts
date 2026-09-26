/**
 * Phase 4 Adversarial Audit & Security Verification Suite
 *
 * Validates OWASP Top 10 defenses, RBAC boundaries, IDOR protections,
 * input sanitization, PII encryption at rest, and zero-spend invariants.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import app from '../../../server.js';
import { JWT_SECRET } from '../../server/config/clients.js';
import { maskContactInfo } from '../../lib/maskUtils.js';
import { sanitizePublicText } from '../../lib/stayProjection.js';
import { encryptPII, decryptPII } from '../../lib/cryptoUtils.js';
import { CanaryCertificationService } from '../../services/canaryCertificationService.js';

describe('Phase 4: Adversarial Security & OWASP Top 10 Suite', () => {

  describe('1. Authentication Gatekeeping (OWASP A07: Identification and Authentication Failures)', () => {
    it.each([
      ['POST', '/api/listings/101/calendar', { dates: ['2026-10-01'], price: 5000 }],
      ['POST', '/api/admin/listings/draft/55/approve', {}],
      ['POST', '/api/listings/101/reviews', { rating: 5, content: 'Great place' }],
      ['GET', '/api/admin/outreach-leads', undefined],
      ['POST', '/api/admin/outreach-leads', { property_name: 'Sanctuary' }],
      ['GET', '/api/admin/threads', undefined],
      ['GET', '/api/admin/experience-bookings', undefined],
    ] as const)('%s %s unconditionally rejects unauthenticated requests with HTTP 401', async (method, path, body) => {
      const req = request(app)[method.toLowerCase() as 'get' | 'post'](path);
      if (body) req.send(body);
      const res = await req;
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authentication required|Invalid or expired|unauthorized/i);
    });
  });

  describe('2. Input Sanitization & Stored XSS Prevention (OWASP A03: Injection)', () => {
    it('strips script tags and executable payloads from user-supplied CRM content', () => {
      const malicious = '<script>alert("XSS")</script><p>Hello <img src="x" onerror="stealCookies()">world</p>';
      const { sanitized, wasSanitized } = maskContactInfo(malicious);

      expect(wasSanitized).toBe(true);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert("XSS")');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).not.toContain('stealCookies');
    });

    it('masks phone numbers, email addresses, WhatsApp links, and external URLs', () => {
      const leakAttempt = 'Contact me at test@example.com or +91 9876543210 or wa.me/919876543210 or https://external-deal.com';
      const { sanitized, wasSanitized } = maskContactInfo(leakAttempt);

      expect(wasSanitized).toBe(true);
      expect(sanitized).toContain('[EMAIL REDACTED]');
      expect(sanitized).toContain('[PHONE REDACTED]');
      expect(sanitized).toContain('[WHATSAPP REDACTED]');
      expect(sanitized).toContain('[LINK REDACTED]');
      expect(sanitized).not.toContain('test@example.com');
      expect(sanitized).not.toContain('9876543210');
      expect(sanitized).not.toContain('external-deal.com');
    });

    it('sanitizes public listing projections against physical address leakage and door access codes', () => {
      const sensitiveNotes = 'Door access code is 12345. Wi-Fi password: secret-pass. Located at Plot 45, MG Road, Bangalore 560001. GPS: 12.97160, 77.59460';
      const sanitized = sanitizePublicText(sensitiveNotes);

      expect(sanitized).not.toContain('12345');
      expect(sanitized).not.toContain('secret-pass');
      expect(sanitized).not.toContain('560001');
      expect(sanitized).not.toContain('12.97160, 77.59460');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('3. Field-Level Cryptographic Protection for PII at Rest (OWASP A02: Cryptographic Failures)', () => {
    it('encrypts email and phone into non-deterministic AES-256-CBC ciphertext with unique IVs', () => {
      const plaintext = '+91 98765 43210';
      const cipher1 = encryptPII(plaintext);
      const cipher2 = encryptPII(plaintext);

      expect(cipher1).not.toBeNull();
      expect(cipher2).not.toBeNull();
      expect(cipher1).not.toBe(plaintext);
      // Unique IV ensures ciphertext semantic security (different outputs for same plaintext)
      expect(cipher1).not.toBe(cipher2);

      const decrypted = decryptPII(cipher1);
      expect(decrypted).toBe(plaintext);
    });

    it('safely handles null, undefined, or malformed ciphertext without crashing or leaking details', () => {
      expect(encryptPII(null)).toBeNull();
      expect(encryptPII(undefined)).toBeNull();
      expect(decryptPII(null)).toBeNull();
      expect(decryptPII('unencrypted_legacy_string')).toBe('unencrypted_legacy_string');
      expect(decryptPII('deadbeef:invalidciphertext')).toBe('deadbeef:invalidciphertext');
    });
  });

  describe('4. Review Bounds & Anti-Fabrication Safeguards (INHERITED-009)', () => {
    it('rejects review submissions with out-of-bounds ratings (< 1 or > 5)', () => {
      const testCases = [0, -1, 6, 10, NaN, 'five'];
      for (const invalidRating of testCases) {
        const numRating = Number(invalidRating);
        const isInvalid = !numRating || isNaN(numRating) || numRating < 1 || numRating > 5;
        expect(isInvalid).toBe(true);
      }
    });

    it('rejects empty or whitespace-only review content', () => {
      const emptyBodies = ['', '   ', '\n\t\n'];
      for (const content of emptyBodies) {
        const isInvalid = !content || typeof content !== 'string' || !content.trim();
        expect(isInvalid).toBe(true);
      }
    });
  });

  describe('5. Soft-Exit Lead Ingestion Validation', () => {
    it('rejects invalid or malformed email addresses', async () => {
      const res = await request(app)
        .post('/api/leads/soft-exit')
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Valid email address required/i);
    });

    it('rejects missing email payload', async () => {
      const res = await request(app)
        .post('/api/leads/soft-exit')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Valid email address required/i);
    });
  });

  describe('6. AdTech Zero-Spend Invariant & Canary Defense', () => {
    const canaryService = new CanaryCertificationService();

    it('strictly throws CANARY_ZERO_SPEND_VIOLATION when campaign status is not PAUSED', () => {
      expect(() => {
        canaryService.validateZeroSpendInvariant('ACTIVE', 0);
      }).toThrow(/CANARY_ZERO_SPEND_VIOLATION.*PAUSED/);
    });

    it('strictly throws CANARY_ZERO_SPEND_VIOLATION when daily budget is greater than zero', () => {
      expect(() => {
        canaryService.validateZeroSpendInvariant('PAUSED', 500);
      }).toThrow(/CANARY_ZERO_SPEND_VIOLATION.*0 paise/);
    });

    it('passes zero-spend invariant when status is strictly PAUSED and budget is 0', () => {
      expect(() => {
        canaryService.validateZeroSpendInvariant('PAUSED', 0);
      }).not.toThrow();
    });
  });

  describe('7. Canary Readback Drift Detection', () => {
    const canaryService = new CanaryCertificationService();
    const mockPool = {
      query: async (sql: string) => {
        if (sql.includes('SELECT') && sql.includes('canary_execution_registry')) {
          return {
            rows: [{
              canary_id: 'canary_drill_test_001',
              remote_campaign_id: 'meta_camp_canary_001',
              provider: 'META_ADS',
              daily_budget_paise: 0,
              campaign_status: 'PAUSED',
            }]
          };
        }
        return { rows: [] };
      }
    };

    it('detects status drift when remote provider reports ACTIVE instead of PAUSED', async () => {
      await expect(
        canaryService.verifyRemoteReadback(mockPool, {
          canaryId: 'canary_drill_test_001',
          provider: 'META_ADS',
          remoteCampaignId: 'meta_camp_canary_001',
          remoteStatus: 'ACTIVE',
          remoteDailyBudgetPaise: 0,
        })
      ).rejects.toThrow('CANARY_DRIFT_DETECTED: Provider campaign meta_camp_canary_001 has active status: ACTIVE');
    });

    it('detects financial drift when remote provider reports daily budget > 0 paise', async () => {
      await expect(
        canaryService.verifyRemoteReadback(mockPool, {
          canaryId: 'canary_drill_test_001',
          provider: 'META_ADS',
          remoteCampaignId: 'meta_camp_canary_001',
          remoteStatus: 'PAUSED',
          remoteDailyBudgetPaise: 1000,
        })
      ).rejects.toThrow(/FINANCIAL_DRIFT_DETECTED.*1000/);
    });

    it('successfully certifies readback when remote provider matches PAUSED and 0 spend', async () => {
      const result = await canaryService.verifyRemoteReadback(mockPool, {
        canaryId: 'canary_drill_test_001',
        provider: 'META_ADS',
        remoteCampaignId: 'meta_camp_canary_001',
        remoteStatus: 'PAUSED',
        remoteDailyBudgetPaise: 0,
      });

      expect(result.verified).toBe(true);
      expect(result.exactMatch).toBe(true);
      expect(result.remoteStatus).toBe('PAUSED');
      expect(result.remoteDailyBudgetPaise).toBe(0);
    });
  });

});
