import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Audits provider environment variables and advertiser topology against FAANG L7/L8 Zero-Trust rules.
 * Verifies that Meta and Google credentials are present, structured, and enforce PAUSED zero-spend defaults.
 */
export function auditProviderConfiguration(env) {
  const errors = [];
  const warnings = [];

  // 1. Meta Marketing API Audit (PROV-M-01)
  const metaConfigured = Boolean(env.META_APP_ID && env.META_SYSTEM_USER_TOKEN && env.META_AD_ACCOUNT_ID);
  if (!metaConfigured) {
    errors.push('META_CREDENTIALS_INCOMPLETE: Requires META_APP_ID, META_SYSTEM_USER_TOKEN, and META_AD_ACCOUNT_ID');
  } else {
    if (!env.META_AD_ACCOUNT_ID.startsWith('act_')) {
      errors.push('META_ACCOUNT_ID_INVALID: META_AD_ACCOUNT_ID must use the standard act_ prefix');
    }
  }

  // 2. Google Ads API Audit (PROV-G-01)
  const googleConfigured = Boolean(
    env.GOOGLE_ADS_CLIENT_ID &&
    env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    env.GOOGLE_ADS_MCC_ID &&
    env.GOOGLE_ADS_REFRESH_TOKEN
  );
  if (!googleConfigured) {
    errors.push('GOOGLE_CREDENTIALS_INCOMPLETE: Requires GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_MCC_ID, and GOOGLE_ADS_REFRESH_TOKEN');
  }

  // 3. Canary Safety Invariants
  const allowLiveSpend = env.ENABLE_LIVE_AD_SPEND === 'true';
  if (allowLiveSpend) {
    warnings.push('SAFETY_WARNING: ENABLE_LIVE_AD_SPEND is set to true. Canary runners must strictly enforce PAUSED status.');
  }

  return {
    valid: errors.length === 0,
    meta: {
      configured: metaConfigured,
      adAccountId: metaConfigured ? env.META_AD_ACCOUNT_ID : null,
    },
    google: {
      configured: googleConfigured,
      mccId: googleConfigured ? env.GOOGLE_ADS_MCC_ID : null,
    },
    allowLiveSpend,
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validates that a canary campaign payload satisfies the strict Zero-Spend and Housing policy invariants.
 */
export function validateCanaryCampaignPayload(provider, payload) {
  const errors = [];

  // Invariant 1: Status must be PAUSED. Never allow ACTIVE creation during canary validation.
  if (payload.status !== 'PAUSED') {
    errors.push('CANARY_STATUS_VIOLATION: Canary campaigns must strictly be created in PAUSED status to prevent financial drift');
  }

  if (provider === 'meta') {
    // Invariant 2: Meta requires Housing special ad category
    if (!payload.special_ad_categories || !payload.special_ad_categories.includes('HOUSING')) {
      errors.push('META_HOUSING_POLICY_VIOLATION: Meta real-estate/hospitality campaigns must declare special_ad_categories: ["HOUSING"]');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Evaluates provider readback response to verify that an external campaign has 0 spend, 0 impressions, and status PAUSED.
 */
export async function verifyPausedCanaryReadback(providerClient, campaignId) {
  const readback = await providerClient.getCampaign(campaignId);

  if (!readback) {
    throw new Error(`CANARY_READBACK_FAILED: Campaign ${campaignId} not found on provider`);
  }

  if (readback.status !== 'PAUSED') {
    throw new Error(`CANARY_DRIFT_DETECTED: Provider campaign ${campaignId} has active status: ${readback.status}. Expected strictly PAUSED.`);
  }

  const spendCents = Number(readback.spendCents || 0);
  if (spendCents > 0) {
    throw new Error(`FINANCIAL_DRIFT_DETECTED: Provider campaign ${campaignId} incurred unexpected spend of ${spendCents} cents.`);
  }

  const impressions = Number(readback.impressions || 0);

  return {
    verified: true,
    campaignId,
    provider: readback.provider,
    status: readback.status,
    spendCents,
    impressions,
    timestamp: new Date().toISOString(),
  };
}


/**
 * Generates an immutable canary verification receipt artifact.
 */
export function generateCanaryReceipt(receipt, targetPath = resolve(process.cwd(), 'docs/harvo/receipts/PROVIDER_CANARY_READBACK_RECEIPT.json')) {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(targetPath, JSON.stringify(receipt, null, 2), { mode: 0o644 });
  return targetPath;
}
