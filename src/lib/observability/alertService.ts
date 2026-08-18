/**
 * ENCHO ACTIONABLE ALERT SERVICE
 * Evaluates production thresholds and broadcasts actionable operational alerts
 */

import { StructuredLogger } from './structuredLogger.js';

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface OperationalAlert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  alertType: 
    | 'LEDGER_IMBALANCE' 
    | 'WEBHOOK_BACKLOG_SPIKE' 
    | 'DLQ_GROWTH' 
    | 'PROVIDER_5XX_SPIKE' 
    | 'PROVIDER_RATE_LIMIT_429' 
    | 'WORKER_STARVATION' 
    | 'PAYMENT_RECONCILIATION_MISMATCH' 
    | 'AUTH_FAILURE_SPIKE'
    | 'PROVIDER_SCHEMA_DRIFT';
  title: string;
  description: string;
  context: Record<string, any>;
  actionRequired: string;
}

export class AlertService {
  private static alertHistory: OperationalAlert[] = [];
  private static maxHistory = 500;
  private static listeners: ((alert: OperationalAlert) => void)[] = [];

  /**
   * Subscribes a callback to incoming operational alerts
   */
  public static subscribe(listener: (alert: OperationalAlert) => void) {
    this.listeners.push(listener);
  }

  /**
   * Emits an actionable operational alert
   */
  public static emitAlert(
    alertType: OperationalAlert['alertType'],
    severity: AlertSeverity,
    title: string,
    description: string,
    actionRequired: string,
    context: Record<string, any> = {}
  ): OperationalAlert {
    const alert: OperationalAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      severity,
      alertType,
      title,
      description,
      actionRequired,
      context: StructuredLogger.redact(context)
    };

    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.maxHistory) {
      this.alertHistory.pop();
    }

    // Emit structured log
    StructuredLogger.log(
      severity === 'CRITICAL' ? 'FATAL' : (severity === 'HIGH' ? 'ERROR' : 'WARN'),
      `🚨 [OPERATIONAL ALERT: ${alertType}] ${title}`,
      {
        alertId: alert.id,
        severity,
        alertType,
        actionRequired,
        ...context
      }
    );

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(alert);
      } catch (err) {
        console.error('[ALERT SERVICE] Error in alert listener:', err);
      }
    }

    return alert;
  }

  public static getRecentAlerts(limit = 50): OperationalAlert[] {
    return this.alertHistory.slice(0, limit);
  }

  public static clearHistory() {
    this.alertHistory = [];
  }
}
