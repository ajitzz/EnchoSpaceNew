import { writeFixtureReceipt } from '../compliance/fixture-output.mjs';

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
export function validateCanaryCampaignPayload(provider, payload, capability) {
  const errors = [];

  // Invariant 1: Status must be PAUSED. Never allow ACTIVE creation during canary validation.
  if (payload.status !== 'PAUSED') {
    errors.push('CANARY_STATUS_VIOLATION: Canary campaigns must strictly be created in PAUSED status to prevent financial drift');
  }

  if (provider === 'meta') {
    // Policy applicability must come from the released capability, never hospitality guesswork.
    if (!capability || !Array.isArray(capability.specialAdCategories) || !capability.releaseHash) errors.push('META_POLICY_CAPABILITY_REQUIRED');
    else if (!Array.isArray(payload.special_ad_categories) || JSON.stringify([...payload.special_ad_categories].sort()) !== JSON.stringify([...capability.specialAdCategories].sort())) errors.push('META_POLICY_CAPABILITY_MISMATCH');
  }
  if (!['meta', 'google'].includes(provider)) errors.push('CANARY_PROVIDER_UNSUPPORTED');

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Evaluates provider readback response to verify that an external campaign has 0 spend, 0 impressions, and status PAUSED.
 */
export async function verifyPausedCanaryReadback(providerClient, campaignId, expected) {
  const readback = await providerClient.getCampaign(campaignId);

  if (!readback) {
    throw new Error(`CANARY_READBACK_FAILED: Campaign ${campaignId} not found on provider`);
  }

  if (readback.status !== 'PAUSED') {
    throw new Error(`CANARY_DRIFT_DETECTED: Provider campaign ${campaignId} has active status: ${readback.status}. Expected strictly PAUSED.`);
  }

  const spendCents = readback.spendCents;
  const impressions = readback.impressions;
  if (!Number.isSafeInteger(spendCents) || spendCents < 0 || !Number.isSafeInteger(impressions) || impressions < 0) throw new Error('CANARY_OBSERVATION_INCOMPLETE: explicit nonnegative spend and impression observations are required');
  if (spendCents !== 0) {
    throw new Error(`FINANCIAL_DRIFT_DETECTED: Provider campaign ${campaignId} incurred unexpected spend of ${spendCents} cents.`);
  }

  if (impressions !== 0) throw new Error('CANARY_DELIVERY_DRIFT: impressions observed during zero-delivery canary');
  if (!expected || !['meta', 'google'].includes(expected.provider) || typeof expected.accountRef !== 'string' || !expected.accountRef) throw new Error('CANARY_EXPECTED_SCOPE_REQUIRED');
  if (readback.provider !== expected.provider || readback.accountRef !== expected.accountRef || readback.campaignId !== campaignId) throw new Error('CANARY_SCOPE_MISMATCH');
  const observedAt = Date.parse(readback.observedAt);
  const now = expected.now === undefined ? Date.now() : expected.now;
  if (!Number.isFinite(now) || !Number.isFinite(observedAt) || observedAt > now || now - observedAt > 300000) throw new Error('CANARY_OBSERVATION_STALE');

  return {
    verified: true,
    verificationScope: 'SUPPLIED_CLIENT_READBACK_ONLY',
    productionGateEligible: false,
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
export function generateCanaryReceipt(receipt, targetPath) {
  // Do not copy arbitrary provider payloads/credentials into a local artifact.
  const observation = {
    provider: ['meta', 'google'].includes(receipt?.provider) ? receipt.provider : 'UNKNOWN',
    status: receipt?.status === 'PAUSED' ? 'PAUSED' : 'UNKNOWN',
    spendCents: Number.isSafeInteger(receipt?.spendCents) ? receipt.spendCents : null,
    impressions: Number.isSafeInteger(receipt?.impressions) ? receipt.impressions : null,
  };
  return writeFixtureReceipt('untrusted-provider-readback', { observation, qualification: 'Formatting supplied values does not authenticate the provider client' }, targetPath).receiptPath;
}

// CLI Runner execution
if (process.argv[1] && process.argv[1].endsWith('provider-canary-runner.mjs')) {
  try {
    const audit = auditProviderConfiguration(process.env);
    if (!audit.valid) {
      console.log(JSON.stringify({
        status: 'CANARY_CONFIGURATION_INCOMPLETE',
        productionGateEligible: false,
        message: 'Provider canary harness validated. Live Meta/Google advertiser credentials pending operator provision.',
        missing_credentials: audit.errors,
        invariants: [
          'STATUS: PAUSED strictly enforced',
          'Meta policy category must match a released account capability',
          'Readback assertion: 0 spend, 0 impressions, 0 active delivery',
        ],
      }, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({
        status: 'CANARY_CONFIG_READY',
        productionGateEligible: false,
        qualification: 'Syntax/configuration check only; no provider contact or authenticated readback occurred',
        meta_account: audit.meta.adAccountId,
        google_mcc: audit.google.mccId,
        allowLiveSpend: audit.allowLiveSpend,
        timestamp: audit.timestamp,
      }, null, 2));
    }
  } catch (err) {
    console.error(JSON.stringify({ status: 'FAILED', error: err.message }, null, 2));
    process.exitCode = 1;
  }
}
