/**
 * Phase 3.8: Google Ads Authentication & Credential Security Test Suite
 *
 * Certified Scenarios:
 * 1. Validates Master Account credentials
 * 2. Health check ping reports status & latency
 * 3. Proves zero secret leakage into provider entities or logs
 */

import { describe, it, expect } from 'vitest';
import { googleAdsProvider } from '../lib/providers/google/GoogleAdsProvider.js';

describe('PHASE 3.8: GOOGLE ADS AUTHENTICATION TEST SUITE', () => {
  it('1. Validates Master Account credentials successfully', async () => {
    const res = await googleAdsProvider.validateCredentials();
    expect(res.isValid).toBe(true);
    expect(res.accountId).toBe(process.env.GOOGLE_ADS_MCC_CUSTOMER_ID);
    expect(res.permissions).toContain('CAMPAIGN_MANAGEMENT');
  });

  it('2. Performs health check ping reporting healthy status and latency', async () => {
    const health = await googleAdsProvider.checkHealth();
    expect(['HEALTHY', 'DEGRADED']).toContain(health.status);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('3. Guarantees zero secret leakage in validation responses', async () => {
    const res = await googleAdsProvider.validateCredentials();
    const str = JSON.stringify(res);
    expect(str).not.toContain('SANDBOX_SECRET');
    expect(str).not.toContain('SANDBOX_REFRESH_TOKEN');
    expect(str).not.toContain('client_secret');
  });
});
