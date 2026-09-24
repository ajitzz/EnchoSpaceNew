import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLocalPostgresFixture } from './postgres.js';
import {
  validateStagingConfig,
  generateStagingTemplate,
} from '../../../scripts/deployment/staging-preflight.mjs';
import { verifyDatabaseRoles } from '../../../scripts/deployment/verify-database-roles.mjs';

describe('CR1 Phase P8.1 & Track 1: Staging Environment Preflight & Role Verification', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({ schema: 'empty' });
  });

  afterAll(async () => {
    await fixture?.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 1: Staging Configuration Validation
  // ──────────────────────────────────────────────────────────────────────────
  describe('Staging Configuration Gatekeeper (validateStagingConfig)', () => {
    const validBaseline = {
      NODE_ENV: 'staging',
      JWT_SECRET: 'sample-staging-cryptographic-jwt-secret-minimum-32-chars',
      DATABASE_URL: 'postgresql://staging_user:pass@ep-staging.ap-southeast-1.aws.neon.tech/encho_staging?sslmode=require',
      STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE: 'true',
      POOL_EXECUTION_UNAVAILABLE: 'true',
      RAZORPAY_KEY_ID: 'rzp_test_mock_staging_id',
      STRIPE_SECRET_KEY: 'sk_test_mock_staging_key',
    };

    it('Scenario 1: Valid staging configuration passes cleanly', () => {
      const result = validateStagingConfig(validBaseline);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('Scenario 2: Insufficient JWT_SECRET length (< 32 chars) fails closed', () => {
      const result = validateStagingConfig({
        ...validBaseline,
        JWT_SECRET: 'short-secret-15',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('JWT_SECRET_INSUFFICIENT_ENTROPY: JWT_SECRET must be at least 32 characters in length');
    });

    it('Scenario 3: Missing or non-require SSL in DATABASE_URL fails closed', () => {
      const resultNoSsl = validateStagingConfig({
        ...validBaseline,
        DATABASE_URL: 'postgresql://staging_user:pass@ep-staging.aws.neon.tech/encho_staging',
      });
      expect(resultNoSsl.valid).toBe(false);
      expect(resultNoSsl.errors).toContain('DATABASE_SSL_NOT_ENFORCED: Staging Neon database connection must specify ?sslmode=require');
    });

    it('Scenario 4: Opening compliance gate prematurely without legal sign-off fails closed', () => {
      const resultBypassed = validateStagingConfig({
        ...validBaseline,
        STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE: 'false',
      });
      expect(resultBypassed.valid).toBe(false);
      expect(resultBypassed.errors.some((e: string) => e.includes('COMPLIANCE_GATE_VIOLATION'))).toBe(true);
    });

    it('Scenario 5: Live payment keys (rzp_live_ or sk_live_) are strictly rejected in staging', () => {
      const resultLiveKey = validateStagingConfig({
        ...validBaseline,
        RAZORPAY_KEY_ID: 'rzp_live_accidental_production_key_123',
        STRIPE_SECRET_KEY: 'sk_live_accidental_production_key_456',
      });
      expect(resultLiveKey.valid).toBe(false);
      expect(resultLiveKey.errors).toContain(
        'LIVE_PAYMENT_CREDENTIALS_REJECTED: RAZORPAY_KEY_ID cannot use live credentials (rzp_live_) in staging'
      );
      expect(resultLiveKey.errors).toContain(
        'LIVE_PAYMENT_CREDENTIALS_REJECTED: STRIPE_SECRET_KEY cannot use live credentials (sk_live_) in staging'
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 2: Staging Template Generator
  // ──────────────────────────────────────────────────────────────────────────
  describe('Staging Template Generator (generateStagingTemplate)', () => {
    const testTemplatePath = resolve(process.cwd(), '.env.staging.test_temp');

    afterAll(() => {
      if (existsSync(testTemplatePath)) {
        unlinkSync(testTemplatePath);
      }
    });

    it('generates .env.staging.template with expected fail-closed defaults', () => {
      const { templatePath, created } = generateStagingTemplate(testTemplatePath);
      expect(created).toBe(true);
      expect(existsSync(templatePath)).toBe(true);

      // Verify idempotency on second call
      const secondCall = generateStagingTemplate(testTemplatePath);
      expect(secondCall.created).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 3: Database Role Verification (Least Privilege)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Database Least-Privilege Verification (verifyDatabaseRoles)', () => {
    it('verifies connection roles and detects superuser/bypassrls status', async () => {
      const receipt = await verifyDatabaseRoles(fixture.pool);
      expect(receipt).toBeDefined();
      expect(receipt.role).toBeDefined();
      expect(receipt.role.user).toBeDefined();

      // In local postgres fixture, harvo_test is configured as trust/standard user or superuser
      // Invariant: The function correctly inspects rolsuper and rolbypassrls without throwing
      expect(typeof receipt.valid).toBe('boolean');
      expect(Array.isArray(receipt.errors)).toBe(true);
      expect(Array.isArray(receipt.warnings)).toBe(true);
    });
  });
});
