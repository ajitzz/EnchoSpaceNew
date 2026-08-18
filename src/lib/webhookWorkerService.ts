import { Pool } from 'pg';
import { LeadAlertingCrmService } from './leadAlertingCrmService';

export class WebhookWorkerService {
  /**
   * Process pending webhooks from the inbound_webhooks queue.
   * This is a unified durable queue for all webhooks (Meta, Payments, CRM).
   */
  static async processInboundWebhooks(pool: Pool, handleVerifiedPaymentFn: any) {
    try {
      // 1. Check for pending webhooks (with SKIP LOCKED for basic concurrency safety before M3)
      const res = await pool.query(`
        UPDATE inbound_webhooks 
        SET status = 'processing', attempts = attempts + 1
        WHERE webhook_id IN (
          SELECT webhook_id FROM inbound_webhooks 
          WHERE status = 'pending' AND next_retry_at <= CURRENT_TIMESTAMP
          ORDER BY received_at ASC
          LIMIT 50
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *;
      `);

      if (res.rows.length === 0) return { processed: 0, failed: 0 };

      let processedCount = 0;
      let failedCount = 0;

      for (const row of res.rows) {
        try {
          // Dispatch to business logic based on provider and event_type
          await this.dispatchWebhook(pool, row, handleVerifiedPaymentFn);

          // Mark completed
          await pool.query(`
            UPDATE inbound_webhooks 
            SET status = 'completed', processed_at = CURRENT_TIMESTAMP 
            WHERE webhook_id = $1
          `, [row.webhook_id]);
          
          processedCount++;
        } catch (err: any) {
          console.error(`[WEBHOOK WORKER ERROR] Failed to process webhook ${row.webhook_id}:`, err);
          
          const maxAttempts = 3;
          if (row.attempts >= maxAttempts) {
            await pool.query(`
              UPDATE inbound_webhooks 
              SET status = 'dead_letter', error_state = $1
              WHERE webhook_id = $2
            `, [err.message || String(err), row.webhook_id]);

            try {
              const { MetricsRegistry } = await import('./observability/metricsRegistry.js');
              const { AlertService } = await import('./observability/alertService.js');
              MetricsRegistry.recordWebhookDlq();
              AlertService.emitAlert(
                'DLQ_GROWTH',
                'HIGH',
                `Webhook Moved to Dead Letter Queue (ID #${row.webhook_id})`,
                `Webhook failed after max retries (${row.attempts}). Error: ${err.message}`,
                'Inspect webhook payload and error reason in inbound_webhooks table.',
                { webhookId: row.webhook_id, provider: row.provider, attempts: row.attempts, error: err.message }
              );
            } catch (e) {
              // Ignore
            }
          } else {
            // Exponential backoff
            const backoffMinutes = Math.pow(2, row.attempts);
            await pool.query(`
              UPDATE inbound_webhooks 
              SET status = 'pending', error_state = $1, next_retry_at = CURRENT_TIMESTAMP + interval '${backoffMinutes} minutes'
              WHERE webhook_id = $2
            `, [err.message || String(err), row.webhook_id]);

            try {
              const { MetricsRegistry } = await import('./observability/metricsRegistry.js');
              MetricsRegistry.recordWebhookRetry();
            } catch (e) {
              // Ignore
            }
          }
          failedCount++;
        }
      }

      return { processed: processedCount, failed: failedCount };
    } catch (err) {
      console.error('[WEBHOOK WORKER FATAL ERROR]', err);
      return { processed: 0, failed: 0 };
    }
  }

  private static async dispatchWebhook(pool: Pool, row: any, handleVerifiedPaymentFn: any) {
    const { provider, event_type, payload, correlation_id } = row;

    if (provider === 'stripe' || provider === 'razorpay') {
      let txId, campaignId, paymentIntentId;

      if (provider === 'stripe') {
        paymentIntentId = event_type === 'checkout.session.completed' ? payload.data.object.payment_intent : payload.data.object.id;
        const metadata = payload.data.object.metadata || {};
        txId = metadata.transaction_id;
        campaignId = metadata.campaign_id;
      } else if (provider === 'razorpay') {
        paymentIntentId = payload.payload?.payment?.entity?.order_id || payload.payload?.order?.entity?.id || payload.order_id;
        const notes = payload.payload?.payment?.entity?.notes || payload.payload?.order?.entity?.notes || {};
        txId = notes.transaction_id;
        campaignId = notes.campaign_id;
      }

      await handleVerifiedPaymentFn(txId, campaignId, paymentIntentId, provider, { body: payload });
    } 
    else if (provider === 'meta' && (event_type === 'leadgen' || event_type === 'new_lead')) {
      const leadRes = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
        headers: {}, 
        rawBody: typeof payload === 'string' ? payload : JSON.stringify(payload),
        payload: payload,
        poolOrClient: pool,
        correlationId: correlation_id || `corr_wh_queue_${row.webhook_id}`,
        reqIp: 'internal-worker',
        userAgent: 'webhook-worker'
      });

      if (!leadRes.success && !leadRes.is_duplicate) {
        throw new Error(`Lead ingestion failed: ${leadRes.error_message || leadRes.error_code}`);
      }
    } 
    else if (provider === 'whatsapp') {
      // Import dynamically to avoid circular dependencies if needed, or pass it in.
      // Wait, since we are in src/lib and server is at root, we can require it dynamically to break cycle
      const { processWhatsAppWebhookPayload } = await import('../../server.js');
      await processWhatsAppWebhookPayload(payload);
      console.log('[WEBHOOK WORKER] Processed WhatsApp webhook:', payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id);
    }
    else {
      // Metrics or ad-network updates
      if (payload.event === 'metrics_update' || payload.event === 'ad_performance') {
        await pool.query(`
            UPDATE campaign_metrics 
            SET impressions = impressions + $1, clicks = clicks + $2 
            WHERE campaign_id = $3 AND date = CURRENT_DATE
        `, [payload.impressions || 0, payload.clicks || 0, payload.campaign_id]);
      } else {
        console.warn(`[WEBHOOK WORKER] Unhandled webhook provider/event: ${provider}/${event_type}`);
      }
    }
  }
}
