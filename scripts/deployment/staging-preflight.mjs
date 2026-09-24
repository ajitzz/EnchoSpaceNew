import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Validates a staging environment configuration dictionary against FAANG L7/L8 Zero-Trust rules.
 * Enforces sandbox payment credentials, fail-closed compliance gates, and strict database SSL.
 */
export function validateStagingConfig(config) {
  const errors = [];
  const warnings = [];

  // 1. Environment & Port
  if (!config.NODE_ENV || !['staging', 'production'].includes(config.NODE_ENV)) {
    errors.push('NODE_ENV_INVALID: Staging configuration must declare NODE_ENV=staging or production');
  }

  // 2. JWT Secret Entropy (server.ts mandates >= 32 chars)
  if (!config.JWT_SECRET || typeof config.JWT_SECRET !== 'string' || config.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET_INSUFFICIENT_ENTROPY: JWT_SECRET must be at least 32 characters in length');
  }

  // 3. Database URL & SSL Requirement
  if (!config.DATABASE_URL) {
    errors.push('DATABASE_URL_MISSING: Staging environment requires a valid DATABASE_URL');
  } else {
    try {
      const dbUrl = new URL(config.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol)) {
        errors.push('DATABASE_URL_PROTOCOL_INVALID: DATABASE_URL must use postgresql:// protocol');
      }
      const sslmode = dbUrl.searchParams.get('sslmode');
      if (sslmode !== 'require') {
        errors.push('DATABASE_SSL_NOT_ENFORCED: Staging Neon database connection must specify ?sslmode=require');
      }
    } catch {
      errors.push('DATABASE_URL_MALFORMED: DATABASE_URL is not a valid URI');
    }
  }

  // 4. Fail-Closed Compliance Gates (Must remain true until Track 2 legal sign-off)
  if (config.STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE !== 'true') {
    errors.push(
      'COMPLIANCE_GATE_VIOLATION: STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE must be "true" until formal Indian CA sign-off is obtained'
    );
  }
  if (config.POOL_EXECUTION_UNAVAILABLE !== 'true') {
    errors.push('POOL_GATE_VIOLATION: POOL_EXECUTION_UNAVAILABLE must be "true" in staging');
  }

  // 5. Payment Gateway Sandbox Sanity (Never allow live payment keys in staging)
  if (config.RAZORPAY_KEY_ID) {
    if (config.RAZORPAY_KEY_ID.startsWith('rzp_live_')) {
      errors.push('LIVE_PAYMENT_CREDENTIALS_REJECTED: RAZORPAY_KEY_ID cannot use live credentials (rzp_live_) in staging');
    } else if (!config.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
      warnings.push('RAZORPAY_KEY_NON_STANDARD: Key ID does not match expected rzp_test_ format');
    }
  }

  if (config.STRIPE_SECRET_KEY) {
    if (config.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
      errors.push('LIVE_PAYMENT_CREDENTIALS_REJECTED: STRIPE_SECRET_KEY cannot use live credentials (sk_live_) in staging');
    } else if (!config.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      warnings.push('STRIPE_KEY_NON_STANDARD: Secret key does not match expected sk_test_ format');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generates an isolated staging configuration template file (.env.staging.template).
 */
export function generateStagingTemplate(targetPath = resolve(process.cwd(), '.env.staging.template')) {
  const content = `# ==============================================================================
# ENCHO STAGING ENVIRONMENT CONFIGURATION TEMPLATE
# DO NOT COMMIT ACTUAL SECRETS. Store in a secure staging vault (Infisical / Doppler).
# ==============================================================================
NODE_ENV=staging
PORT=3000
JWT_SECRET=REPLACE_WITH_MINIMUM_32_CHAR_CRYPTOGRAPHIC_RANDOM_SECRET

# Staging Database: Must be a dedicated Neon staging branch with sslmode=require
DATABASE_URL=postgresql://staging_app_user:REPLACE_WITH_PASSWORD@ep-staging-xxxx.ap-southeast-1.aws.neon.tech/encho_staging?sslmode=require

# Compliance & Risk Fail-Closed Flags
STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE=true
POOL_EXECUTION_UNAVAILABLE=true
DISABLE_BACKGROUND_WORKERS=false

# Sandbox Payment Gateways (Must strictly use test credentials)
RAZORPAY_KEY_ID=rzp_test_REPLACE_WITH_STAGING_KEY_ID
RAZORPAY_KEY_SECRET=REPLACE_WITH_STAGING_KEY_SECRET
STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_STAGING_SECRET

# AdTech Sandbox & Paused Mode
META_APP_ID=REPLACE_WITH_STAGING_APP_ID
META_SYSTEM_USER_TOKEN=REPLACE_WITH_STAGING_TOKEN
GOOGLE_ADS_CLIENT_ID=REPLACE_WITH_STAGING_CLIENT_ID
GOOGLE_ADS_DEVELOPER_TOKEN=REPLACE_WITH_STAGING_DEV_TOKEN
`;

  let created = false;
  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, content, { mode: 0o644 });
    created = true;
  }

  return {
    templatePath: targetPath,
    created,
  };
}

// CLI Runner execution
if (process.argv[1] && process.argv[1].endsWith('staging-preflight.mjs')) {
  try {
    const res = generateStagingTemplate();
    console.log(JSON.stringify({ status: 'SUCCESS', action: res.created ? 'TEMPLATE_CREATED' : 'TEMPLATE_EXISTS', path: res.templatePath }));
  } catch (err) {
    console.error(JSON.stringify({ status: 'FAILED', error: err.message }));
    process.exitCode = 1;
  }
}
