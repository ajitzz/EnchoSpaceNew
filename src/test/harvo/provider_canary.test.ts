import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  auditProviderConfiguration,
  validateCanaryCampaignPayload,
  verifyPausedCanaryReadback,
  generateCanaryReceipt,
} from '../../../scripts/deployment/provider-canary-runner.mjs';

describe('CR1 Phase P8.3 & Track 3: Provider Canary Readback & Audit Runner', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 1: Provider Configuration Auditor (auditProviderConfiguration)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Provider Configuration Auditor', () => {
    it('Scenario 1: Fails closed when Meta and Google credentials are missing', () => {
      const result = auditProviderConfiguration({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'META_CREDENTIALS_INCOMPLETE: Requires META_APP_ID, META_SYSTEM_USER_TOKEN, and META_AD_ACCOUNT_ID'
      );
      expect(result.errors).toContain(
        'GOOGLE_CREDENTIALS_INCOMPLETE: Requires GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_MCC_ID, and GOOGLE_ADS_REFRESH_TOKEN'
      );
    });

    it('Scenario 2: Rejects Meta account ID without act_ prefix', () => {
      const result = auditProviderConfiguration({
        META_APP_ID: 'meta_app_123',
        META_SYSTEM_USER_TOKEN: 'token_xyz',
        META_AD_ACCOUNT_ID: '9876543210', // Missing act_ prefix
        GOOGLE_ADS_CLIENT_ID: 'client_123',
        GOOGLE_ADS_DEVELOPER_TOKEN: 'dev_token',
        GOOGLE_ADS_MCC_ID: '123-456-7890',
        GOOGLE_ADS_REFRESH_TOKEN: 'refresh_token',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'META_ACCOUNT_ID_INVALID: META_AD_ACCOUNT_ID must use the standard act_ prefix'
      );
    });

    it('Scenario 3: Accepts properly structured Meta and Google configurations', () => {
      const result = auditProviderConfiguration({
        META_APP_ID: 'meta_app_123',
        META_SYSTEM_USER_TOKEN: 'token_xyz',
        META_AD_ACCOUNT_ID: 'act_9876543210',
        GOOGLE_ADS_CLIENT_ID: 'client_123',
        GOOGLE_ADS_DEVELOPER_TOKEN: 'dev_token',
        GOOGLE_ADS_MCC_ID: '123-456-7890',
        GOOGLE_ADS_REFRESH_TOKEN: 'refresh_token',
      });
      expect(result.valid).toBe(true);
      expect(result.meta.configured).toBe(true);
      expect(result.google.configured).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 2: Canary Campaign Payload Validator (validateCanaryCampaignPayload)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Canary Payload Invariants', () => {
    it('Scenario 1: Strictly rejects ACTIVE campaign payloads during canary testing', () => {
      const result = validateCanaryCampaignPayload('meta', {
        name: 'Accidental Live Campaign',
        status: 'ACTIVE', // Dangerous live leak!
        special_ad_categories: ['HOUSING'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'CANARY_STATUS_VIOLATION: Canary campaigns must strictly be created in PAUSED status to prevent financial drift'
      );
    });

    it('Scenario 2: Enforces Meta Housing special category for hospitality ads', () => {
      const result = validateCanaryCampaignPayload('meta', {
        name: 'Malibu Villa Canary',
        status: 'PAUSED',
        // Missing special_ad_categories: ['HOUSING']
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'META_HOUSING_POLICY_VIOLATION: Meta real-estate/hospitality campaigns must declare special_ad_categories: ["HOUSING"]'
      );
    });

    it('Scenario 3: Valid PAUSED housing canary payload passes cleanly', () => {
      const result = validateCanaryCampaignPayload('meta', {
        name: 'Malibu Villa Canary',
        status: 'PAUSED',
        special_ad_categories: ['HOUSING'],
      });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 3: Provider Readback Verification (verifyPausedCanaryReadback)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Provider Readback Verification & Zero-Drift Protection', () => {
    it('Scenario 1: Correctly verifies PAUSED status with zero spend and zero impressions', async () => {
      const mockClient = {
        getCampaign: async (id: string) => ({
          provider: 'meta',
          campaignId: id,
          status: 'PAUSED',
          spendCents: 0,
          impressions: 0,
        }),
      };

      const receipt = await verifyPausedCanaryReadback(mockClient, 'meta_camp_123');
      expect(receipt.verified).toBe(true);
      expect(receipt.status).toBe('PAUSED');
      expect(receipt.spendCents).toBe(0);
      expect(receipt.impressions).toBe(0);
    });

    it('Scenario 2: Throws CANARY_DRIFT_DETECTED if provider reports ACTIVE status', async () => {
      const mockClient = {
        getCampaign: async (id: string) => ({
          provider: 'google',
          campaignId: id,
          status: 'ACTIVE', // Unplanned drift!
          spendCents: 0,
          impressions: 0,
        }),
      };

      await expect(verifyPausedCanaryReadback(mockClient, 'goog_camp_456')).rejects.toThrow(
        /CANARY_DRIFT_DETECTED/
      );
    });

    it('Scenario 3: Throws FINANCIAL_DRIFT_DETECTED if provider incurs unexpected spend', async () => {
      const mockClient = {
        getCampaign: async (id: string) => ({
          provider: 'meta',
          campaignId: id,
          status: 'PAUSED',
          spendCents: 1500, // Unexpected financial leakage!
          impressions: 120,
        }),
      };

      await expect(verifyPausedCanaryReadback(mockClient, 'meta_camp_789')).rejects.toThrow(
        /FINANCIAL_DRIFT_DETECTED/
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 4: Canary Receipt Generator (generateCanaryReceipt)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Canary Receipt Artifact Generation', () => {
    const testReceiptPath = resolve(process.cwd(), 'docs/harvo/receipts/test_canary_receipt.json');

    afterAll(() => {
      if (existsSync(testReceiptPath)) {
        unlinkSync(testReceiptPath);
      }
    });

    it('generates immutable receipt JSON on disk', () => {
      const receipt = {
        verified: true,
        campaignId: 'canary_7107',
        provider: 'meta',
        status: 'PAUSED',
        spendCents: 0,
        impressions: 0,
        timestamp: new Date().toISOString(),
      };

      const path = generateCanaryReceipt(receipt, testReceiptPath);
      expect(existsSync(path)).toBe(true);
    });
  });
});
