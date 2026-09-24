import { afterAll, describe, expect, it, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
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

  afterAll(() => {
    if (existsSync(receiptPath)) {
      try {
        unlinkSync(receiptPath);
      } catch {
        // Clean up test receipt
      }
    }
  });

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
      return { rows: [] };
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
    expect(existsSync(receiptPath)).toBe(false);
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

  it('Scenario 3: Successfully completes staging orchestration and writes immutable receipt', async () => {
    const result = await executeStagingDeploymentRunbook({
      env: validStagingEnv,
      dbClient: validMockDbClient as any,
      gitCommit: 'a2d31c6',
    });

    expect(result.success).toBe(true);
    expect(result.receipt).toBeDefined();
    expect(result.receipt.status).toBe('CERTIFIED');
    expect(existsSync(receiptPath)).toBe(true);
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

    expect(receipt.status).toBe('CERTIFIED');
    expect(receipt.verificationChecksum).toBeDefined();
    expect(receipt.verificationChecksum.length).toBe(64); // SHA-256 length
  });
});
