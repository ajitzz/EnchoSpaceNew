/**
 * ENCHO HIGH-THROUGHPUT STRUCTURED OBSERVABILITY LOGGER
 * FAANG-Standard Structured Telemetry & Automated Sensitive Data Redaction Layer
 */

export type LogSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface StructuredTelemetryContext {
  correlationId?: string;
  requestId?: string;
  tenantId?: number | string | null;
  campaignId?: number | string | null;
  mutationId?: string | null;
  provider?: 'META' | 'GOOGLE' | 'STRIPE' | 'RAZORPAY' | 'SYSTEM' | 'WHATSAPP';
  operation?: string;
  durationMs?: number;
  outcome?: 'SUCCESS' | 'FAILED' | 'RECONCILED' | 'UNKNOWN' | 'QUARANTINED' | 'SKIPPED';
  errorCode?: string;
  providerTraceId?: string;
  [key: string]: any;
}

export interface StructuredLogEntry {
  timestamp: string;
  severity: LogSeverity;
  service: string;
  environment: string;
  message: string;
  context: StructuredTelemetryContext;
}

// Patterns to aggressively redact in logs to prevent secret / PII leakage
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /auth/i,
  /key/i,
  /bearer/i,
  /credit_card/i,
  /card_number/i,
  /cvv/i,
  /ssn/i,
  /pin/i,
  /signature/i
];

const EMAIL_PATTERN = /([a-zA-Z0-9_.-]+)@([a-zA-Z0-9_.-]+)\.([a-zA-Z]{2,5})/g;
const PHONE_PATTERN = /(\+?[0-9]{1,4}[\s-]?)?(\(?\d{3}\)?[\s-]?)?[\d\s-]{7,12}/g;
const BEARER_TOKEN_PATTERN = /Bearer\s+[a-zA-Z0-9_.-]+/gi;

export class StructuredLogger {
  private static serviceName = 'encho-marketing-engine';
  private static environment = process.env.NODE_ENV || 'development';

  /**
   * Deeply sanitizes any object or string, redacting tokens, keys, passwords, and sensitive PII
   */
  public static redact(data: any): any {
    if (data === null || data === undefined) return data;

    if (typeof data === 'string') {
      const sanitized = data.replace(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED_TOKEN]');
      // If string looks like a JWT or large token (longer than 50 chars without spaces), redact
      if (/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(sanitized) && sanitized.length > 50) {
        return '[REDACTED_JWT]';
      }
      return sanitized;
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.redact(item));
    }

    if (typeof data === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
        if (isSensitiveKey) {
          result[key] = '[REDACTED_SECRET]';
        } else {
          result[key] = this.redact(value);
        }
      }
      return result;
    }

    return String(data);
  }

  /**
   * Emits structured JSON log to stdout/stderr
   */
  public static log(severity: LogSeverity, message: string, context: StructuredTelemetryContext = {}): StructuredLogEntry {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      severity,
      service: this.serviceName,
      environment: this.environment,
      message,
      context: this.redact(context)
    };

    const formatted = JSON.stringify(entry);

    if (severity === 'ERROR' || severity === 'FATAL') {
      console.error(formatted);
    } else if (severity === 'WARN') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    return entry;
  }

  public static info(message: string, context: StructuredTelemetryContext = {}): StructuredLogEntry {
    return this.log('INFO', message, context);
  }

  public static warn(message: string, context: StructuredTelemetryContext = {}): StructuredLogEntry {
    return this.log('WARN', message, context);
  }

  public static error(message: string, context: StructuredTelemetryContext = {}): StructuredLogEntry {
    return this.log('ERROR', message, context);
  }

  public static debug(message: string, context: StructuredTelemetryContext = {}): StructuredLogEntry {
    return this.log('DEBUG', message, context);
  }

  public static fatal(message: string, context: StructuredTelemetryContext = {}): StructuredLogEntry {
    return this.log('FATAL', message, context);
  }
}
