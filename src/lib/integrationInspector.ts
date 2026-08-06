import { Request, Response, NextFunction } from 'express';

export interface KeyInspectionResult {
  key: string;
  category: string;
  status: 'CONFIGURED' | 'DUMMY' | 'MISSING' | 'INVALID_FORMAT';
  maskedValue: string;
  details: string;
  actionRequired?: string;
}

export interface ServiceInspectionResult {
  service: string;
  category: string;
  isFullyOperational: boolean;
  keys: KeyInspectionResult[];
}

// Map of integration keys with validation logic and diagnostic instructions
const INTEGRATION_DEFINITIONS: Array<{
  key: string;
  service: string;
  category: string;
  validator?: (val: string) => { valid: boolean; reason?: string };
  actionIfIssue: string;
}> = [
  // Database
  {
    key: 'DATABASE_URL',
    service: 'Neon Postgres DB',
    category: 'Database & Persistence',
    validator: (val) => {
      if (!val.startsWith('postgres://') && !val.startsWith('postgresql://')) {
        return { valid: false, reason: 'Must be a valid postgresql:// connection string' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Set DATABASE_URL to a valid Neon PostgreSQL connection string.',
  },
  // JWT & Admin
  {
    key: 'JWT_SECRET',
    service: 'Authentication Engine',
    category: 'Security & Auth',
    validator: (val) => {
      if (val === 'fallback_secret_key_12345' || val === 'fallback_secret') {
        return { valid: false, reason: 'Using insecure default fallback JWT secret' };
      }
      if (val.length < 16) {
        return { valid: false, reason: 'JWT_SECRET should be at least 16 characters for production security' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Set JWT_SECRET to a strong random string (32+ chars).',
  },
  {
    key: 'ADMIN_EMAIL',
    service: 'Admin Moderation',
    category: 'Security & Auth',
    validator: (val) => {
      if (!val.includes('@')) return { valid: false, reason: 'Must be a valid email address' };
      return { valid: true };
    },
    actionIfIssue: 'Set ADMIN_EMAIL to the system administrator email address.',
  },
  {
    key: 'WEBHOOK_SIGNING_SECRET',
    service: 'Webhook Verification',
    category: 'Security & Auth',
    validator: (val) => {
      if (val.includes('nestpick_marketing_webhook') || val.includes('dummy')) {
        return { valid: false, reason: 'Using default sample signing secret' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Set WEBHOOK_SIGNING_SECRET to a unique cryptographically safe secret.',
  },
  {
    key: 'PII_ENCRYPTION_KEY_HEX',
    service: 'PII Data Encryption',
    category: 'Security & Auth',
    validator: (val) => {
      if (!/^[0-9a-fA-F]{64}$/.test(val)) {
        return { valid: false, reason: 'Must be a 64-character hex string (32 bytes)' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Set PII_ENCRYPTION_KEY_HEX to a 64-char hex string (e.g. crypto.randomBytes(32).toString("hex")).',
  },

  // AI Service
  {
    key: 'GEMINI_API_KEY',
    service: 'Google Gemini AI Engine',
    category: 'AI & Intelligence',
    validator: (val) => {
      if (!val.startsWith('AIza')) {
        return { valid: false, reason: 'Google Gemini API keys typically start with "AIza"' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Obtain a Gemini API key from Google AI Studio and set GEMINI_API_KEY.',
  },

  // Stripe
  {
    key: 'STRIPE_SECRET_KEY',
    service: 'Stripe Payment Gateway',
    category: 'Payments & Revenue',
    validator: (val) => {
      if (!val.startsWith('sk_test_') && !val.startsWith('sk_live_') && !val.startsWith('rk_test_') && !val.startsWith('rk_live_')) {
        return { valid: false, reason: 'Stripe secret key must start with sk_test_ or sk_live_' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Get secret key from Stripe Dashboard (Developers -> API keys) and set STRIPE_SECRET_KEY.',
  },
  {
    key: 'STRIPE_WEBHOOK_SECRET',
    service: 'Stripe Webhook Listener',
    category: 'Payments & Revenue',
    validator: (val) => {
      if (!val.startsWith('whsec_')) {
        return { valid: false, reason: 'Stripe webhook secret must start with whsec_' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Create a Stripe Webhook endpoint pointing to /api/webhooks/stripe and set STRIPE_WEBHOOK_SECRET.',
  },

  // Razorpay
  {
    key: 'RAZORPAY_KEY_ID',
    service: 'Razorpay Payment Gateway',
    category: 'Payments & Revenue',
    validator: (val) => {
      if (!val.startsWith('rzp_test_') && !val.startsWith('rzp_live_')) {
        return { valid: false, reason: 'Razorpay key ID must start with rzp_test_ or rzp_live_' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Generate Key ID from Razorpay Dashboard (Settings -> API Keys) and set RAZORPAY_KEY_ID.',
  },
  {
    key: 'RAZORPAY_KEY_SECRET',
    service: 'Razorpay Payment Gateway',
    category: 'Payments & Revenue',
    validator: (val) => {
      if (val.length < 10 || val.includes('dummy')) {
        return { valid: false, reason: 'Razorpay key secret looks invalid or dummy' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Generate Key Secret from Razorpay Dashboard and set RAZORPAY_KEY_SECRET.',
  },
  {
    key: 'RAZORPAY_WEBHOOK_SECRET',
    service: 'Razorpay Webhook Listener',
    category: 'Payments & Revenue',
    validator: (val) => {
      if (val.length < 8 || val.includes('dummy')) {
        return { valid: false, reason: 'Razorpay webhook secret must be configured' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Set RAZORPAY_WEBHOOK_SECRET to match secret configured in Razorpay Webhooks tab.',
  },

  // Meta Ads / Marketing
  {
    key: 'META_ACCESS_TOKEN',
    service: 'Meta Ads & Graph API',
    category: 'Marketing Engine',
    validator: (val) => {
      if (val.startsWith('EAAkr7Y9S') || val.length < 30) {
        return { valid: false, reason: 'Using sample/placeholder Meta Access Token' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Generate a long-lived User/Page Access Token in Meta for Developers and set META_ACCESS_TOKEN.',
  },
  {
    key: 'META_AD_ACCOUNT_ID',
    service: 'Meta Ads & Graph API',
    category: 'Marketing Engine',
    validator: (val) => {
      if (!val.startsWith('act_') && !/^\d+$/.test(val)) {
        return { valid: false, reason: 'Meta Ad Account ID must be numerical or formatted like act_123456789' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Copy Ad Account ID from Meta Ads Manager (e.g. act_1234567890) and set META_AD_ACCOUNT_ID.',
  },
  {
    key: 'META_PAGE_ID',
    service: 'Meta Page Integration',
    category: 'Marketing Engine',
    validator: (val) => {
      if (!/^\d+$/.test(val)) {
        return { valid: false, reason: 'Meta Page ID must be a numeric string' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Copy Facebook Page ID from Page Settings and set META_PAGE_ID.',
  },
  {
    key: 'META_INSTAGRAM_ACCOUNT_ID',
    service: 'Meta Instagram Ads',
    category: 'Marketing Engine',
    validator: (val) => {
      if (!/^\d+$/.test(val)) {
        return { valid: false, reason: 'Instagram Account ID must be a numeric string' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Copy Instagram Business Account ID from Meta Business Suite and set META_INSTAGRAM_ACCOUNT_ID.',
  },

  // Google Ads
  {
    key: 'GOOGLE_ADS_DEVELOPER_TOKEN',
    service: 'Google Ads API',
    category: 'Marketing Engine',
    validator: (val) => {
      if (val.length < 10) return { valid: false, reason: 'Developer token string too short' };
      return { valid: true };
    },
    actionIfIssue: 'Apply for Developer Token in Google Ads Manager Center and set GOOGLE_ADS_DEVELOPER_TOKEN.',
  },
  {
    key: 'GOOGLE_ADS_CLIENT_ID',
    service: 'Google Ads API',
    category: 'Marketing Engine',
    validator: (val) => {
      if (!val.endsWith('.apps.googleusercontent.com')) {
        return { valid: false, reason: 'OAuth Client ID must end with .apps.googleusercontent.com' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Create OAuth 2.0 Credentials in Google Cloud Console and set GOOGLE_ADS_CLIENT_ID.',
  },
  {
    key: 'GOOGLE_ADS_CLIENT_SECRET',
    service: 'Google Ads API',
    category: 'Marketing Engine',
    actionIfIssue: 'Set GOOGLE_ADS_CLIENT_SECRET from Google Cloud Console credentials.',
  },
  {
    key: 'GOOGLE_ADS_REFRESH_TOKEN',
    service: 'Google Ads API',
    category: 'Marketing Engine',
    actionIfIssue: 'Generate OAuth Refresh Token using Google OAuth Playground and set GOOGLE_ADS_REFRESH_TOKEN.',
  },

  // AWS S3 Storage
  {
    key: 'AWS_ACCESS_KEY_ID',
    service: 'AWS S3 Cloud Storage',
    category: 'Infrastructure & Storage',
    validator: (val) => {
      if (!/^[A-Z0-9]{16,32}$/.test(val)) {
        return { valid: false, reason: 'AWS Access Key ID must be uppercase alphanumeric (16-32 chars)' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Create IAM User in AWS Console with S3 permissions and set AWS_ACCESS_KEY_ID.',
  },
  {
    key: 'AWS_SECRET_ACCESS_KEY',
    service: 'AWS S3 Cloud Storage',
    category: 'Infrastructure & Storage',
    validator: (val) => {
      if (val.length < 20) return { valid: false, reason: 'AWS Secret Access Key string too short' };
      return { valid: true };
    },
    actionIfIssue: 'Set AWS_SECRET_ACCESS_KEY corresponding to AWS_ACCESS_KEY_ID.',
  },
  {
    key: 'AWS_S3_BUCKET_NAME',
    service: 'AWS S3 Cloud Storage',
    category: 'Infrastructure & Storage',
    actionIfIssue: 'Create an S3 bucket in AWS and set AWS_S3_BUCKET_NAME.',
  },

  // Upstash Redis
  {
    key: 'UPSTASH_REDIS_REST_URL',
    service: 'Upstash Redis Cache & Lock',
    category: 'Infrastructure & Storage',
    validator: (val) => {
      if (!val.startsWith('https://')) return { valid: false, reason: 'Must be an https:// REST URL' };
      return { valid: true };
    },
    actionIfIssue: 'Create database in Upstash Redis Console and set UPSTASH_REDIS_REST_URL.',
  },
  {
    key: 'UPSTASH_REDIS_REST_TOKEN',
    service: 'Upstash Redis Cache & Lock',
    category: 'Infrastructure & Storage',
    actionIfIssue: 'Set UPSTASH_REDIS_REST_TOKEN from Upstash database REST API section.',
  },

  // WhatsApp
  {
    key: 'PHONE_NUMBER_ID',
    service: 'WhatsApp Cloud API',
    category: 'Notifications & Messaging',
    validator: (val) => {
      if (val === '982841698238647' || !/^\d+$/.test(val)) {
        return { valid: false, reason: 'Using sample or invalid WhatsApp Phone Number ID' };
      }
      return { valid: true };
    },
    actionIfIssue: 'Set PHONE_NUMBER_ID from Meta WhatsApp App Dashboard.',
  },
];

/**
 * Mask secret string for safe console logging
 */
function maskSecret(val: string | undefined): string {
  if (!val) return '[NOT DEFINED]';
  if (val.length <= 8) return val.substring(0, 2) + '****';
  return val.substring(0, 4) + '...' + val.substring(val.length - 4);
}

/**
 * Inspect a single environment variable key
 */
export function inspectKey(keyName: string): KeyInspectionResult {
  const def = INTEGRATION_DEFINITIONS.find((d) => d.key === keyName);
  const rawVal = process.env[keyName];

  const category = def ? def.category : 'General Environment';
  const actionRequired = def ? def.actionIfIssue : `Configure process.env.${keyName}`;

  if (!rawVal || rawVal.trim() === '') {
    return {
      key: keyName,
      category,
      status: 'MISSING',
      maskedValue: '[ABSENT]',
      details: `Environment variable '${keyName}' is not set or empty.`,
      actionRequired,
    };
  }

  const lowerVal = rawVal.toLowerCase();
  const isDummy =
    lowerVal.includes('dummy') ||
    lowerVal.includes('placeholder') ||
    lowerVal.includes('fallback') ||
    rawVal === 'EAAkr7Y9S2qYBQfHTNZASIugAzOi8b2MZCBct4z4jZBHSmQ2KGlFduuDQQGEYC9NRDtZBUdhMPdeJ06OjYUiJYGfFkZCAxzyh4TdidN7ZA10K3XPOVEiQh01jo22xLsQjXrEtMHc5ZCHZBbRZAyA5d0pl26Jsg3IuNKY272QYmqEjHghf11OKJmbUZBfJLe5EvHzl48gAZDZD' ||
    rawVal === 'rzp_test_encho2026' ||
    rawVal === 'nestpick_marketing_webhook_secure_token_2026' ||
    rawVal === '982841698238647' ||
    rawVal === 'fallback_secret_key_12345';

  if (isDummy) {
    return {
      key: keyName,
      category,
      status: 'DUMMY',
      maskedValue: maskSecret(rawVal),
      details: `Environment variable '${keyName}' is set to a dummy or fallback value ('${rawVal.substring(0, 20)}...').`,
      actionRequired,
    };
  }

  if (def && def.validator) {
    const check = def.validator(rawVal);
    if (!check.valid) {
      return {
        key: keyName,
        category,
        status: 'INVALID_FORMAT',
        maskedValue: maskSecret(rawVal),
        details: check.reason || `Value for '${keyName}' does not pass structural format validation.`,
        actionRequired,
      };
    }
  }

  return {
    key: keyName,
    category,
    status: 'CONFIGURED',
    maskedValue: maskSecret(rawVal),
    details: 'Key is properly configured and valid.',
  };
}

/**
 * Perform full system inspection audit across all known integrations
 */
export function runFullIntegrationAudit() {
  const serviceMap = new Map<string, { category: string; keys: KeyInspectionResult[] }>();

  for (const def of INTEGRATION_DEFINITIONS) {
    const result = inspectKey(def.key);
    if (!serviceMap.has(def.service)) {
      serviceMap.set(def.service, { category: def.category, keys: [] });
    }
    serviceMap.get(def.service)!.keys.push(result);
  }

  const serviceResults: ServiceInspectionResult[] = [];
  for (const [service, data] of Array.from(serviceMap.entries())) {
    const isFullyOperational = data.keys.every((k) => k.status === 'CONFIGURED');
    serviceResults.push({
      service,
      category: data.category,
      isFullyOperational,
      keys: data.keys,
    });
  }

  return serviceResults;
}

/**
 * Print formatted ASCII Integration Inspection report to stdout
 */
export function printStartupIntegrationReport() {
  const audit = runFullIntegrationAudit();

  console.log('\n================================================================================');
  console.log('         🔍 ENCHO INTEGRATION INSPECTION & MONITORING REPORT                    ');
  console.log('================================================================================');

  let configuredCount = 0;
  let dummyCount = 0;
  let missingCount = 0;
  let invalidCount = 0;

  audit.forEach((srv) => {
    const statusIcon = srv.isFullyOperational ? '🟢 OPERATIONAL' : '⚠️ PARTIAL / DUMMY';
    console.log(`\n📦 Service: ${srv.service} [${srv.category}] -> ${statusIcon}`);

    srv.keys.forEach((k) => {
      let icon = '🟢';
      if (k.status === 'CONFIGURED') {
        configuredCount++;
        icon = '🟢 [VALID]        ';
      } else if (k.status === 'DUMMY') {
        dummyCount++;
        icon = '⚠️ [DUMMY/FALLBACK]';
      } else if (k.status === 'MISSING') {
        missingCount++;
        icon = '❌ [MISSING]      ';
      } else if (k.status === 'INVALID_FORMAT') {
        invalidCount++;
        icon = '🛑 [INVALID FORMAT]';
      }

      console.log(`   ${icon} ${k.key.padEnd(28)} Value: ${k.maskedValue.padEnd(16)} -> ${k.details}`);
      if (k.status !== 'CONFIGURED') {
        console.log(`      💡 FIX INSTRUCTION: ${k.actionRequired}`);
      }
    });
  });

  console.log('\n--------------------------------------------------------------------------------');
  console.log(`📊 SUMMARY: 🟢 ${configuredCount} Valid | ⚠️ ${dummyCount} Dummy/Fallback | ❌ ${missingCount} Missing | 🛑 ${invalidCount} Invalid`);
  console.log('--------------------------------------------------------------------------------');
  console.log('ℹ️  Note: When endpoints invoke an integration with missing/dummy keys,');
  console.log('   detailed [INTEGRATION INSPECTION MONITORING] logs will print in real-time.\n');
}

/**
 * Check integration keys on-demand during API route or feature execution.
 * Prints clear informative logs in console if key is missing, dummy, or invalid.
 */
export function checkIntegrationKeys(
  serviceName: string,
  keyNames: string[],
  contextMessage?: string
): { isOk: boolean; issues: KeyInspectionResult[] } {
  const issues: KeyInspectionResult[] = [];

  for (const keyName of keyNames) {
    const res = inspectKey(keyName);
    if (res.status !== 'CONFIGURED') {
      issues.push(res);

      let severityTag = 'ℹ️ [INTEGRATION INSPECTION INFO - MOCK MODE ACTIVE]';
      let icon = 'ℹ️';
      let logFn: (...args: any[]) => void = console.info;

      if (res.status === 'DUMMY') {
        severityTag = '⚠️ [INTEGRATION INSPECTION WARNING - USING DUMMY KEY]';
        icon = '⚠️';
        logFn = console.warn;
      } else if (res.status === 'INVALID_FORMAT') {
        severityTag = '🛑 [INTEGRATION INSPECTION NOTICE - INVALID KEY FORMAT]';
        icon = '🛑';
        logFn = console.warn;
      } else if (res.status === 'MISSING') {
        severityTag = 'ℹ️ [INTEGRATION INSPECTION INFO - MOCK MODE ACTIVE]';
        icon = 'ℹ️';
        logFn = console.info;
      }

      logFn(`\n${severityTag}`);
      logFn(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      logFn(`${icon} Service/Feature : ${serviceName}`);
      logFn(`📍 Trigger Context: ${contextMessage || 'Application Feature Execution'}`);
      logFn(`🔑 Variable Name  : ${res.key}`);
      logFn(`📊 Key Status    : ${res.status}`);
      logFn(`🔍 Masked Value  : ${res.maskedValue}`);
      logFn(`📝 Issue Details : ${res.details}`);
      logFn(`🛠️  Action Needed : ${res.actionRequired}`);
      logFn(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }
  }

  return {
    isOk: issues.length === 0,
    issues,
  };
}

/**
 * Express middleware to automatically monitor integration keys when relevant endpoints are accessed
 */
export function integrationInspectionMiddleware(req: Request, res: Response, next: NextFunction) {
  const path = req.path.toLowerCase();

  // Payment routes
  if (path.includes('/stripe') || path.includes('/checkout')) {
    checkIntegrationKeys('Stripe Payment Gateway', ['STRIPE_SECRET_KEY'], `HTTP ${req.method} ${req.originalUrl}`);
  }
  if (path.includes('/razorpay')) {
    checkIntegrationKeys('Razorpay Payment Gateway', ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'], `HTTP ${req.method} ${req.originalUrl}`);
  }

  // Marketing routes
  if (path.includes('/campaigns') || path.includes('/meta') || path.includes('/ads')) {
    checkIntegrationKeys('Meta Marketing API', ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'], `HTTP ${req.method} ${req.originalUrl}`);
  }
  if (path.includes('/google-ads')) {
    checkIntegrationKeys('Google Ads API', ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID'], `HTTP ${req.method} ${req.originalUrl}`);
  }

  // AI routes
  if (path.includes('/ai') || path.includes('/evaluate') || path.includes('/gemini')) {
    checkIntegrationKeys('Gemini AI Engine', ['GEMINI_API_KEY'], `HTTP ${req.method} ${req.originalUrl}`);
  }

  // Upload/S3 routes
  if (path.includes('/upload') || path.includes('/s3') || path.includes('/media')) {
    checkIntegrationKeys('AWS S3 Storage', ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME'], `HTTP ${req.method} ${req.originalUrl}`);
  }

  next();
}
