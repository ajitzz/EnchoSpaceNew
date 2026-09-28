import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  executeStagingDeploymentRunbook,
  generateStagingReceipt,
} from '../../../scripts/deployment/run-staging-deployment.mjs';

describe('CR1 Phase P8.1 & Track 1: Staging Deployment Orchestrator & Runbook', () => {
  const receiptPath = resolve(
    process.cwd(),
    'docs/harvo/receipts/CR1_STAGING_DEPLOYMENT_RECEIPT.json'
  );

  const validStagingEnv = {
    NODE_ENV: 'staging',
    PORT: '8080',
    DATABASE_URL: 'postgresql://encho_staging:secret@neon.tech/encho_staging?sslmode=require',
    JWT_SECRET: 'super-secure-production-grade-secret-key-32-chars-long',
    STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE: 'true',
    POOL_EXECUTION_UNAVAILABLE: 'true',
    RAZORPAY_KEY_ID: 'rzp_test_mockKey123',
    RAZORPAY_KEY_SECRET: 'testSecretKeyMock',
    STRIPE_SECRET_KEY: 'sk_test_mockStripeKey123',
  };

  const validMockDbClient = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('pg_roles')) {
        return {
          rows: [
            {
              current_user: 'encho_staging_app',
              rolname: 'encho_staging_app',
              rolsuper: false,
              rolbypassrls: false,
            },
          ],
        };
      }
      return { rows: ['host_marketing_campaigns', 'conversations', 'campaign_financial_contracts'].map(relname => ({ relname, relrowsecurity: true, relforcerowsecurity: true })) };
    }),
  };

  it('Scenario 1: Fails closed when staging environment preflight fails', async () => {
    const invalidEnv = { ...validStagingEnv, JWT_SECRET: 'short' };
    const result = await executeStagingDeploymentRunbook({
      env: invalidEnv,
      dbClient: validMockDbClient as any,
      gitCommit: 'a2d31c6',
    });

    expect(result.success).toBe(false);
    expect(result.stepFailed).toBe('PREFLIGHT');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.receipt).toBeNull();
  });

  it('Scenario 2: Fails closed when database user has superuser privileges', async () => {
    const superuserDbClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('pg_roles')) {
          return {
            rows: [
              {
                current_user: 'postgres',
                rolname: 'postgres',
                rolsuper: true, // Superuser forbidden!
                rolbypassrls: false,
              },
            ],
          };
        }
        return { rows: [] };
      }),
    };

    const result = await executeStagingDeploymentRunbook({
      env: validStagingEnv,
      dbClient: superuserDbClient as any,
      gitCommit: 'a2d31c6',
    });

    expect(result.success).toBe(false);
    expect(result.stepFailed).toBe('DATABASE_ROLES');
    expect(result.errors).toContain('Database user postgres must not be a superuser');
  });

  it('Scenario 3: reports a supplied client observation without certification or historical artifact writes', async () => {
    const before = existsSync(receiptPath) ? readFileSync(receiptPath) : null;
    const result = await executeStagingDeploymentRunbook({
      env: validStagingEnv,
      dbClient: validMockDbClient as any,
      gitCommit: 'a2d31c6',
    });

    expect(result.success).toBe(true);
    expect(result.receipt).toBeDefined();
    expect(result.receipt.status).toBe('REQUIRES_INDEPENDENT_REVIEW');
    expect(result.receipt.productionGateEligible).toBe(false);
    expect(existsSync(receiptPath) ? readFileSync(receiptPath) : null).toEqual(before);
  });

  it('Scenario 4: generateStagingReceipt formats compliant receipt with SHA256 checksum', () => {
    const receipt = generateStagingReceipt({
      gitCommit: 'a2d31c6',
      environment: 'staging',
      roleVerification: {
        roleName: 'encho_staging_app',
        rolsuper: false,
        rolbypassrls: false,
      },
      preflightPassed: true,
      complianceGatesEnforced: true,
    });

    expect(receipt.status).toBe('REQUIRES_INDEPENDENT_REVIEW');
    expect(receipt.productionGateEligible).toBe(false);
    expect(receipt.verificationChecksum).toBeDefined();
    expect(receipt.verificationChecksum.length).toBe(64); // SHA-256 length
  });
  it('rejects absent database client instead of fabricating safe role flags', async () => {
    const result = await executeStagingDeploymentRunbook({ env: validStagingEnv, dbClient: undefined, gitCommit: 'a'.repeat(40) });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('DATABASE_OBSERVATION_REQUIRED');
    expect(result.receipt).toBeNull();
  });
  it('rejects missing expected tables and disabled FORCE RLS', async () => {
    const dbClient = { query: vi.fn(async (sql: string) => sql.includes('pg_roles') ? { rows: [{ current_user: 'app', rolname: 'app', rolsuper: false, rolbypassrls: false }] } : { rows: [{ relname: 'conversations', relrowsecurity: true, relforcerowsecurity: false }] }) };
    const result = await executeStagingDeploymentRunbook({ env: validStagingEnv, dbClient, gitCommit: 'a'.repeat(40) });
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toContain('REQUIRED_TABLE_NOT_OBSERVED');
    expect(result.errors.join(' ')).toContain('RLS_NOT_FORCED');
  });

});
