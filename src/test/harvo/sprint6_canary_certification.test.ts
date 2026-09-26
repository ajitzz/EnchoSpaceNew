/**
 * src/test/harvo/sprint6_canary_certification.test.ts
 *
 * Sprint 6 Adversarial Test Suite:
 * Live Paused Canary Execution, Zero-Spend Invariants, Readback Verification & Cryptographic Certification
 * Fulfills Blueprint Domain 7 (Sprint 6 Specification), Section 10 & 11, and Gate CANARY-01.
 */

import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  CanaryCertificationService,
  type CanaryDbClientPort,
  type CanaryExecutionInput,
  type RemoteReadbackInput,
  type CanaryReceiptData,
} from '../../services/canaryCertificationService.js';
import { createCanaryCertificationRouter } from '../../server/marketing/canaryCertificationRouter.js';

describe('Sprint 6: Live Paused Canary & Pilot Certification Adversarial Suite', () => {
  const service = new CanaryCertificationService();

  // ---------------------------------------------------------------------------
  // Test 1: Provider Topology Audit — Validates Meta and Google Credentials
  // ---------------------------------------------------------------------------
  it('Test 1: Provider topology audit detects missing credentials and validates act_ prefix', () => {
    // Case A: Missing credentials
    const emptyEnv: NodeJS.ProcessEnv = {};
    const auditA = service.auditProviderConfiguration(emptyEnv);
    expect(auditA.valid).toBe(false);
    expect(auditA.errors).toContain('META_CREDENTIALS_INCOMPLETE: Requires META_APP_ID, META_SYSTEM_USER_TOKEN, and META_AD_ACCOUNT_ID');
    expect(auditA.errors).toContain('GOOGLE_CREDENTIALS_INCOMPLETE: Requires GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_MCC_ID, and GOOGLE_ADS_REFRESH_TOKEN');

    // Case B: Invalid Meta account prefix (missing act_)
    const badMetaEnv: NodeJS.ProcessEnv = {
      META_APP_ID: 'app_12345',
      META_SYSTEM_USER_TOKEN: 'token_67890',
      META_AD_ACCOUNT_ID: '1029384756', // missing act_ prefix
      GOOGLE_ADS_CLIENT_ID: 'client_123',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'dev_token_456',
      GOOGLE_ADS_MCC_ID: '849-204-1192',
      GOOGLE_ADS_REFRESH_TOKEN: 'refresh_token_789',
    };
    const auditB = service.auditProviderConfiguration(badMetaEnv);
    expect(auditB.valid).toBe(false);
    expect(auditB.errors).toContain('META_ACCOUNT_ID_INVALID: META_AD_ACCOUNT_ID must use the standard act_ prefix');

    // Case C: Valid environment topology
    const validEnv: NodeJS.ProcessEnv = {
      META_APP_ID: 'app_12345',
      META_SYSTEM_USER_TOKEN: 'token_67890',
      META_AD_ACCOUNT_ID: 'act_1029384756',
      GOOGLE_ADS_CLIENT_ID: 'client_123',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'dev_token_456',
      GOOGLE_ADS_MCC_ID: '849-204-1192',
      GOOGLE_ADS_REFRESH_TOKEN: 'refresh_token_789',
    };
    const auditC = service.auditProviderConfiguration(validEnv);
    expect(auditC.valid).toBe(true);
    expect(auditC.meta.configured).toBe(true);
    expect(auditC.meta.adAccountId).toBe('act_1029384756');
    expect(auditC.google.configured).toBe(true);
    expect(auditC.google.mccId).toBe('849-204-1192');
  });

  // ---------------------------------------------------------------------------
  // Test 2: Zero-Spend Invariant Enforcement — Rejects ACTIVE or Budget > 0
  // ---------------------------------------------------------------------------
  it('Test 2: Zero-spend invariant strictly fails closed on ACTIVE status or daily budget > 0', () => {
    // Attempting ACTIVE status
    expect(() => service.validateZeroSpendInvariant('ACTIVE', 0)).toThrow('CANARY_ZERO_SPEND_VIOLATION');

    // Attempting budget > 0
    expect(() => service.validateZeroSpendInvariant('PAUSED', 1000)).toThrow('CANARY_ZERO_SPEND_VIOLATION');

    // Legitimate PAUSED zero-spend succeeds
    expect(service.validateZeroSpendInvariant('PAUSED', 0)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Transactional Atomicity & Rollback Safety on Connection Drop
  // ---------------------------------------------------------------------------
  it('Test 3: Connection drop midway through audit write triggers full atomic rollback with 0 zombie records', async () => {
    const executedQueries: string[] = [];
    let rolledBack = false;

    const mockFailingClient: CanaryDbClientPort = {
      async query(sql: string) {
        executedQueries.push(sql);
        if (sql.includes('platform_audit_log')) {
          throw new Error('ECONNRESET: Database socket terminated unexpectedly during canary audit write');
        }
        if (sql === 'ROLLBACK') {
          rolledBack = true;
        }
        return { rows: [] };
      },
    };

    const input: CanaryExecutionInput = {
      listingId: '1',
      provider: 'META_ADS',
      remoteCampaignId: 'meta_camp_canary_wayanad_001',
      campaignStatus: 'PAUSED',
      dailyBudgetPaise: 0,
      idempotencyKey: 'idemp_canary_fail_001',
      operatorId: 'operator_sre_lead_01',
    };

    await expect(service.registerCanaryExecution(mockFailingClient, input)).rejects.toThrow('ECONNRESET');

    expect(executedQueries).toContain('BEGIN');
    expect(executedQueries).toContain('ROLLBACK');
    expect(rolledBack).toBe(true);
    expect(executedQueries.filter((q) => q === 'COMMIT')).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Concurrent Burst Deduplication (200ms Window)
  // ---------------------------------------------------------------------------
  it('Test 4: 5 concurrent clicks in 200ms deduplicate to exactly 1 write and 4 replays', async () => {
    let writeCount = 0;
    const client: CanaryDbClientPort = {
      async query(sql: string) {
        if (sql.includes('INSERT INTO canary_execution_registry')) {
          writeCount++;
        }
        return { rows: [] };
      },
    };

    const input: CanaryExecutionInput = {
      listingId: '1',
      provider: 'GOOGLE_ADS',
      remoteCampaignId: 'goog_camp_canary_wayanad_002',
      campaignStatus: 'PAUSED',
      dailyBudgetPaise: 0,
      idempotencyKey: 'idemp_canary_burst_key_999',
      operatorId: 'operator_sre_lead_01',
    };

    const promises = Array.from({ length: 5 }, () =>
      service.registerCanaryExecution(client, input)
    );

    const results = await Promise.all(promises);

    expect(writeCount).toBe(1);
    expect(results).toHaveLength(5);
    const nonReplays = results.filter((r) => !r.isReplay);
    const replays = results.filter((r) => r.isReplay);
    expect(nonReplays).toHaveLength(1);
    expect(replays).toHaveLength(4);
    expect(nonReplays[0].status).toBe('PAUSED');
    expect(nonReplays[0].dailyBudgetPaise).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Exact Remote Readback Verification — Detects Remote Status Drift
  // ---------------------------------------------------------------------------
  it('Test 5: Remote provider readback detects status drift or non-zero budget and fails closed', async () => {
    const client: CanaryDbClientPort = {
      async query() {
        return { rows: [] };
      },
    };

    // Case A: Remote status is ACTIVE instead of PAUSED -> throws CANARY_DRIFT_DETECTED
    const driftInput: RemoteReadbackInput = {
      canaryId: 'canary_test_01',
      provider: 'META_ADS',
      remoteCampaignId: 'meta_camp_123',
      remoteStatus: 'ACTIVE',
      remoteDailyBudgetPaise: 0,
    };
    await expect(service.verifyRemoteReadback(client, driftInput)).rejects.toThrow('CANARY_DRIFT_DETECTED');

    // Case B: Remote daily budget is non-zero -> throws FINANCIAL_DRIFT_DETECTED
    const spendInput: RemoteReadbackInput = {
      canaryId: 'canary_test_02',
      provider: 'GOOGLE_ADS',
      remoteCampaignId: 'goog_camp_456',
      remoteStatus: 'PAUSED',
      remoteDailyBudgetPaise: 50000, // 500 INR
    };
    await expect(service.verifyRemoteReadback(client, spendInput)).rejects.toThrow('FINANCIAL_DRIFT_DETECTED');

    // Case C: Exact match succeeds
    const exactInput: RemoteReadbackInput = {
      canaryId: 'canary_test_03',
      provider: 'META_ADS',
      remoteCampaignId: 'meta_camp_789',
      remoteStatus: 'PAUSED',
      remoteDailyBudgetPaise: 0,
    };
    const outcome = await service.verifyRemoteReadback(client, exactInput);
    expect(outcome.verified).toBe(true);
    expect(outcome.exactMatch).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 6: Cryptographic Receipt Generation with Deterministic Checksum
  // ---------------------------------------------------------------------------
  it('Test 6: Signed canary verification receipt generates valid SHA-256 checksum', () => {
    const receiptData: CanaryReceiptData = {
      schemaVersion: '1.0.0',
      type: 'ENCHO_PROVIDER_CANARY_RECEIPT',
      receiptId: 'receipt_canary_test_999',
      targetGate: 'CANARY-01',
      packageTarget: 'P8.3',
      status: 'PAUSED_CANARY_VERIFIED_ZERO_SPEND',
      clearedAt: '2026-09-26T18:00:00.000Z',
      canaryTarget: {
        listingId: '1',
        listingName: 'Wayanad Sanctuary (Listing 1)',
        operatorId: 'operator_sre_lead_01',
        executionDate: '2026-09-26T18:00:00.000Z',
      },
      metaCanaryExecution: {
        adAccountId: 'act_1029384756',
        remoteCampaignId: 'meta_camp_canary_wayanad_001',
        campaignStatus: 'PAUSED',
        dailyBudgetPaise: 0,
        specialAdCategory: 'HOUSING',
        readbackVerification: {
          httpStatus: 200,
          remoteStatus: 'PAUSED',
          spendRupees: 0,
          verified: true,
          exactMatch: true,
          timestamp: '2026-09-26T18:00:00.000Z',
        },
      },
      googleCanaryExecution: {
        mccCustomerId: '849-204-1192',
        remoteCampaignId: 'goog_camp_canary_wayanad_002',
        campaignStatus: 'PAUSED',
        dailyBudgetPaise: 0,
        readbackVerification: {
          httpStatus: 200,
          remoteStatus: 'PAUSED',
          costMicros: 0,
          verified: true,
          exactMatch: true,
          timestamp: '2026-09-26T18:00:00.000Z',
        },
      },
      reliabilityGuarantees: {
        atomicOutboxTransactionVerified: true,
        concurrencyBurstDeduplication200ms: true,
        monotonicSequenceFencingVerified: true,
        zeroSpendInvariantEnforced: true,
        rowLevelSecuritySealed: true,
      },
      complianceGateStatus: {
        CANARY_01: 'CLEARED',
        STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE: 'true (Preserved fail-closed)',
        POOL_EXECUTION_UNAVAILABLE: 'true (Preserved fail-closed)',
      },
    };

    const signed = service.generateCryptographicCanaryReceipt(receiptData);
    expect(signed.verificationChecksum).toBeDefined();
    expect(signed.verificationChecksum).toHaveLength(64); // Valid SHA-256 hex string
    expect(signed.status).toBe('PAUSED_CANARY_VERIFIED_ZERO_SPEND');
  });

  // ---------------------------------------------------------------------------
  // Test 7: Express API Endpoints Integration & RBAC Failsafe
  // ---------------------------------------------------------------------------
  it('Test 7: Express router GET /status, POST /execute-drill, and POST /verify-readback enforce RBAC', async () => {
    const mockPool: any = {
      async query(sql: string) {
        if (sql.includes('SELECT * FROM canary_execution_registry')) {
          return { rows: [{ id: 'canary_test_01', status: 'READBACK_VERIFIED' }] };
        }
        if (sql.includes('SELECT * FROM canary_readback_verifications')) {
          return { rows: [{ id: 'rb_test_01', verified: true, exact_match: true }] };
        }
        return { rows: [] };
      },
    };

    const app = express();
    app.use(express.json());
    app.use('/api/marketing/v2/canary', createCanaryCertificationRouter(mockPool));

    // A. Public/authenticated GET /status
    const statusRes = await request(app).get('/api/marketing/v2/canary/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.certified).toBe(true);
    expect(statusRes.body.invariants.status).toBe('PAUSED');
    expect(statusRes.body.invariants.dailyBudgetPaise).toBe(0);

    // B. POST /execute-drill without admin headers -> 403 Forbidden
    const unauthDrill = await request(app)
      .post('/api/marketing/v2/canary/execute-drill')
      .send({ listingId: '1' });
    expect(unauthDrill.status).toBe(403);
    expect(unauthDrill.body.error).toBe('CANARY_ADMIN_AUTH_REQUIRED');

    // C. POST /execute-drill with admin bypass -> 201 Created
    const authDrill = await request(app)
      .post('/api/marketing/v2/canary/execute-drill')
      .set('x-admin-bypass', 'true')
      .send({
        listingId: '1',
        provider: 'META_ADS',
        operatorId: 'operator_sre_01',
      });
    expect(authDrill.status).toBe(201);
    expect(authDrill.body.status).toBe('PAUSED');
    expect(authDrill.body.dailyBudgetPaise).toBe(0);

    // D. POST /verify-readback with exact match -> 200 OK
    const authReadback = await request(app)
      .post('/api/marketing/v2/canary/verify-readback')
      .set('x-admin-bypass', 'true')
      .send({
        canaryId: authDrill.body.canaryId,
        provider: 'META_ADS',
        remoteCampaignId: authDrill.body.remoteCampaignId,
        remoteStatus: 'PAUSED',
        remoteDailyBudgetPaise: 0,
      });
    expect(authReadback.status).toBe(200);
    expect(authReadback.body.verified).toBe(true);
    expect(authReadback.body.exactMatch).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 8: Readback Drift via Express Router returns HTTP 409
  // ---------------------------------------------------------------------------
  it('Test 8: Readback drift submitted to router returns HTTP 409 PROVIDER_CANARY_DRIFT', async () => {
    const mockPool: any = {
      async query() {
        return { rows: [] };
      },
    };

    const app = express();
    app.use(express.json());
    app.use('/api/marketing/v2/canary', createCanaryCertificationRouter(mockPool));

    const res = await request(app)
      .post('/api/marketing/v2/canary/verify-readback')
      .set('x-admin-bypass', 'true')
      .send({
        canaryId: 'canary_drift_test',
        provider: 'META_ADS',
        remoteCampaignId: 'meta_camp_drift_001',
        remoteStatus: 'ACTIVE', // DRIFT!
        remoteDailyBudgetPaise: 0,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PROVIDER_CANARY_DRIFT');
  });
});
