import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StructuredLogger } from '../lib/observability/structuredLogger';
import { MetricsRegistry } from '../lib/observability/metricsRegistry';
import { AlertService, OperationalAlert } from '../lib/observability/alertService';
import { 
  ProviderDriftDetector,
  MetaCampaignResponseSchema,
  MetaAdSetResponseSchema,
  MetaErrorPayloadSchema,
  GoogleAdsCampaignResponseSchema,
  StripeWebhookPayloadSchema
} from '../lib/providers/schemas';
import { DoubleEntryLedgerService } from '../lib/doubleEntryLedgerService';

describe('Milestone 5 — Production Observability & Provider Contract Hardening', () => {
  beforeEach(() => {
    MetricsRegistry.reset();
    AlertService.clearHistory();
  });

  // =========================================================================
  // 1. STRUCTURED OBSERVABILITY & SENSITIVE DATA REDACTION
  // =========================================================================
  describe('1. Structured Observability & Redaction Layer', () => {
    it('redacts sensitive API tokens, secret keys, passwords, and PII in structured logs', () => {
      const rawContext = {
        correlationId: 'corr_test_obs_101',
        accessToken: 'mock_test_token_val',
        apiKey: 'mock_api_key_test_123',
        userPassword: 'mock_password_test_123',
        authHeader: 'Bearer mock_jwt_token_sample',
        normalField: 'harmless_metadata',
        campaignId: 4422
      };

      const sanitized = StructuredLogger.redact(rawContext);

      expect(sanitized.correlationId).toBe('corr_test_obs_101');
      expect(sanitized.campaignId).toBe(4422);
      expect(sanitized.normalField).toBe('harmless_metadata');
      expect(sanitized.accessToken).toBe('[REDACTED_SECRET]');
      expect(sanitized.apiKey).toBe('[REDACTED_SECRET]');
      expect(sanitized.userPassword).toBe('[REDACTED_SECRET]');
      expect(sanitized.authHeader).toBe('[REDACTED_SECRET]');
    });

    it('emits structured JSON telemetry with standard fields', () => {
      const logEntry = StructuredLogger.info('Campaign dispatch initiated', {
        correlationId: 'corr_meta_disp_991',
        tenantId: 10,
        campaignId: 552,
        provider: 'META',
        operation: 'DISPATCH_CAMPAIGN',
        durationMs: 142,
        outcome: 'SUCCESS'
      });

      expect(logEntry.severity).toBe('INFO');
      expect(logEntry.service).toBe('encho-marketing-engine');
      expect(logEntry.context.correlationId).toBe('corr_meta_disp_991');
      expect(logEntry.context.tenantId).toBe(10);
      expect(logEntry.context.campaignId).toBe(552);
      expect(logEntry.context.provider).toBe('META');
      expect(logEntry.context.durationMs).toBe(142);
      expect(logEntry.context.outcome).toBe('SUCCESS');
    });
  });

  // =========================================================================
  // 2. STRICT PROVIDER CONTRACTS & DRIFT DETECTION
  // =========================================================================
  describe('2. Strict Provider Contracts & Drift Detection', () => {
    it('accepts valid Meta campaign responses and permits additive harmless fields', () => {
      const validMetaPayload = {
        id: 'meta_camp_123456',
        name: 'Encho Space - Kyoto Villa (Campaign #552)',
        status: 'PAUSED',
        objective: 'OUTCOME_AWARENESS',
        extra_future_meta_field: 'safe_additive_data'
      };

      const result = ProviderDriftDetector.validate(
        'META',
        'CAMPAIGN_CREATE',
        MetaCampaignResponseSchema,
        validMetaPayload,
        'corr_drift_01'
      );

      expect(result.success).toBe(true);
      expect(result.driftDetected).toBe(false);
      expect(result.data?.id).toBe('meta_camp_123456');
    });

    it('rejects malformed provider payloads and triggers PROVIDER_SCHEMA_DRIFT alert', () => {
      const capturedAlerts: OperationalAlert[] = [];
      AlertService.subscribe(alert => capturedAlerts.push(alert));

      // Missing required 'id' field
      const malformedPayload = {
        name: 'Invalid Campaign with missing ID',
        status: 'UNKNOWN_STATUS_ENUM'
      };

      const result = ProviderDriftDetector.validate(
        'META',
        'CAMPAIGN_CREATE',
        MetaCampaignResponseSchema,
        malformedPayload,
        'corr_drift_bad_01'
      );

      expect(result.success).toBe(false);
      expect(result.driftDetected).toBe(true);
      expect(result.errors?.length).toBeGreaterThan(0);

      // Verify alert emission
      const driftAlert = capturedAlerts.find(a => a.alertType === 'PROVIDER_SCHEMA_DRIFT');
      expect(driftAlert).toBeDefined();
      expect(driftAlert?.severity).toBe('HIGH');
      expect(driftAlert?.context.provider).toBe('META');
    });

    it('validates Google Ads and Stripe response contracts strictly', () => {
      const validGooglePayload = {
        resourceName: 'customers/9904998948/campaigns/552',
        id: '552',
        name: 'Encho Space - Kyoto Villa',
        status: 'PAUSED'
      };

      const gResult = ProviderDriftDetector.validate(
        'GOOGLE',
        'CAMPAIGN_MUTATE',
        GoogleAdsCampaignResponseSchema,
        validGooglePayload
      );
      expect(gResult.success).toBe(true);

      const validStripePayload = {
        id: 'evt_stripe_12345',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_12345',
            amount: 10000,
            currency: 'usd',
            status: 'succeeded'
          }
        }
      };

      const sResult = ProviderDriftDetector.validate(
        'STRIPE',
        'WEBHOOK_INGEST',
        StripeWebhookPayloadSchema,
        validStripePayload
      );
      expect(sResult.success).toBe(true);
    });
  });

  // =========================================================================
  // 3. METRICS REGISTRY SNAPSHOTS & LATENCY QUANTILE CALCULATION
  // =========================================================================
  describe('3. Metrics Registry & Latency Histograms', () => {
    it('computes p50, p95, p99 latencies accurately across API and Provider requests', () => {
      // Simulate 100 requests with latencies 1ms to 100ms
      for (let i = 1; i <= 100; i++) {
        MetricsRegistry.recordApiRequest('GET', '/api/listings', 200, i);
        MetricsRegistry.recordProviderCall('META', 'campaign_creation', i < 95 ? 200 : 500, i);
      }

      const snapshot = MetricsRegistry.getSnapshot();

      expect(snapshot.api.totalRequests).toBe(100);
      expect(snapshot.api.latencyStats.p50).toBe(51);
      expect(snapshot.api.latencyStats.p95).toBe(96);
      expect(snapshot.api.latencyStats.p99).toBe(100);

      const metaStats = snapshot.providers['META'];
      expect(metaStats).toBeDefined();
      expect(metaStats.requestCount).toBe(100);
      expect(metaStats.successCount).toBe(94);
      expect(metaStats.error5xxCount).toBe(6);
      expect(metaStats.successRatePercent).toBe(94);
      expect(metaStats.latencyStats.p95).toBe(96);
    });
  });

  // =========================================================================
  // 4. ACTIONABLE ALERTING & FINANCIAL INVARIANT VIOLATION
  // =========================================================================
  describe('4. Actionable Alerting Rules', () => {
    it('emits CRITICAL alert immediately when double-entry ledger is unbalanced', async () => {
      const capturedAlerts: OperationalAlert[] = [];
      AlertService.subscribe(alert => capturedAlerts.push(alert));

      const mockClient: any = {
        query: vi.fn(async () => ({ rows: [] }))
      };

      // Unbalanced transaction: DEBIT 100 != CREDIT 80
      await expect(
        DoubleEntryLedgerService.recordTransaction(mockClient, {
          transactionRef: 'TX_UNBALANCED_TEST_101',
          eventType: 'AD_SPEND_DEDUCTION',
          description: 'Unbalanced spend test',
          lines: [
            { accountType: 'HOST_WALLET', entryType: 'DEBIT', amount: 100, currency: 'USD' },
            { accountType: 'AD_SPEND_ESCROW', entryType: 'CREDIT', amount: 80, currency: 'USD' }
          ]
        })
      ).rejects.toThrow('LEDGER UNBALANCED');

      const imbalanceAlert = capturedAlerts.find(a => a.alertType === 'LEDGER_IMBALANCE');
      expect(imbalanceAlert).toBeDefined();
      expect(imbalanceAlert?.severity).toBe('CRITICAL');
      expect(imbalanceAlert?.context.transactionRef).toBe('TX_UNBALANCED_TEST_101');

      const snapshot = MetricsRegistry.getSnapshot();
      expect(snapshot.financial.ledgerImbalanceEvents).toBe(1);
    });

    it('emits HIGH alert on provider HTTP 429 rate limit errors', () => {
      const alert = AlertService.emitAlert(
        'PROVIDER_RATE_LIMIT_429',
        'HIGH',
        'Meta API Rate Limit Exceeded',
        'Meta API returned 429 Too Many Requests.',
        'Backoff request rate and check app tier limits.',
        { provider: 'META', campaignId: 101 }
      );

      expect(alert.severity).toBe('HIGH');
      expect(alert.alertType).toBe('PROVIDER_RATE_LIMIT_429');
      expect(AlertService.getRecentAlerts().length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 5. SYNTHETIC INCIDENT TRACEABILITY TEST
  // =========================================================================
  describe('5. Synthetic Incident Traceability Test', () => {
    it('provides full forensic traceability for an injected provider outage', () => {
      const correlationId = 'corr_trace_synthetic_incident_8877';
      const tenantId = 42;
      const campaignId = 8877;
      const provider = 'META';
      const step = 'adset_creation';

      // 1. Ingress log
      StructuredLogger.info('Host submitted campaign for dispatch', {
        correlationId,
        tenantId,
        campaignId,
        operation: 'CAMPAIGN_DISPATCH_REQUEST'
      });

      // 2. Injected failure at provider boundary
      MetricsRegistry.recordProviderCall('META', step, 503, 310);
      const alert = AlertService.emitAlert(
        'PROVIDER_5XX_SPIKE',
        'HIGH',
        'Meta AdSet Creation 503 Service Unavailable',
        'Meta API returned 503 during adset creation.',
        'Retry after backoff or route to queue.',
        { correlationId, tenantId, campaignId, step, status: 503 }
      );

      // 3. Worker catches failure, marks quarantine/unknown outcome
      StructuredLogger.error('AdSet creation failed at provider; quarantine activated', {
        correlationId,
        tenantId,
        campaignId,
        provider,
        operation: step,
        outcome: 'QUARANTINED',
        errorCode: 'PROVIDER_503_ERROR',
        durationMs: 310
      });

      // Assert complete diagnostic traceability
      expect(alert.context.correlationId).toBe(correlationId);
      expect(alert.context.tenantId).toBe(tenantId);
      expect(alert.context.campaignId).toBe(campaignId);
      expect(alert.context.step).toBe('adset_creation');

      const snapshot = MetricsRegistry.getSnapshot();
      expect(snapshot.providers['META'].error5xxCount).toBe(1);
    });
  });
});
