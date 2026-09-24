import type pg from 'pg';

export interface DrillExecutionRequest {
  drillId: string;
  drillType: 'SIMULATED_FAILOVER' | 'STOP_LOSS_ACTIVATION' | 'BULK_PAUSE' | 'RESTORE_VALIDATION';
  targetSystem: string;
  idempotencyKey: string;
  parameters: Record<string, string | number | boolean>;
}

export interface DrillExecutionReceipt {
  drillId: string;
  status: 'SCHEDULED' | 'EXECUTING' | 'COMPLETED' | 'HALTED' | 'FAILED';
  replayed: boolean;
}

export interface OperationalWebhookPayload {
  eventId: string;
  incidentId: string;
  eventType: 'incident.detected' | 'incident.mitigated' | 'incident.resolved';
  sequenceNumber: number;
}

export interface OperationalWebhookResult {
  status?: string;
  ignored?: boolean;
  currentStatus?: string;
}

export interface EmergencyKillSwitchResult {
  activated: boolean;
  haltedCampaignsCount: number;
  timestamp: string;
}

export class OperationalDrillEngine {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Idempotently schedules or submits an operational drill.
   * Guarantees that concurrent bursts (e.g. 5 clicks in 200ms) yield exactly 1 execution and 4 deduplicated replays.
   */
  async submitDrill(req: DrillExecutionRequest): Promise<DrillExecutionReceipt> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const insertRes = await client.query(
        `INSERT INTO test_operational_drills (
          id, drill_type, target_system, status, sequence_version, idempotency_key, parameters
        ) VALUES ($1, $2, $3, 'SCHEDULED', 1, $4, $5)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id, status`,
        [req.drillId, req.drillType, req.targetSystem, req.idempotencyKey, JSON.stringify(req.parameters)]
      );

      if (insertRes.rows.length > 0) {
        await client.query('COMMIT');
        return {
          drillId: insertRes.rows[0].id,
          status: insertRes.rows[0].status,
          replayed: false,
        };
      }

      // Conflict occurred: fetch existing drill record to return idempotent replay
      const existingRes = await client.query(
        `SELECT id, status FROM test_operational_drills WHERE idempotency_key = $1`,
        [req.idempotencyKey]
      );

      await client.query('COMMIT');

      if (existingRes.rows.length === 0) {
        throw new Error('IDEMPOTENCY_ANOMALY: Conflict reported but drill row missing');
      }

      return {
        drillId: existingRes.rows[0].id,
        status: existingRes.rows[0].status,
        replayed: true,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Socket may already be closed
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Multi-step drill execution with fault injection to verify transactional rollback upon socket drop.
   */
  async executeDrillWithFaultInjection(
    client: pg.PoolClient,
    req: DrillExecutionRequest & { simulateSocketDrop?: boolean }
  ): Promise<void> {
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO test_operational_drills (
          id, drill_type, target_system, status, sequence_version, idempotency_key, parameters
        ) VALUES ($1, $2, $3, 'EXECUTING', 1, $4, $5)`,
        [req.drillId, req.drillType, req.targetSystem, req.idempotencyKey, JSON.stringify(req.parameters)]
      );

      if (req.simulateSocketDrop) {
        // Abruptly sever socket stream mid-flight
        interface ClientWithStream {
          connection?: {
            stream?: {
              destroy: () => void;
            };
          };
        }
        (client as unknown as ClientWithStream).connection?.stream?.destroy();
        throw new Error('ECONNRESET: Network connection dropped during drill execution');
      }

      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Postmaster handles rollback when connection terminates
      }
      throw err;
    }
  }

  /**
   * Monotonic webhook processor for operational incidents and alerts.
   * Discards stale or out-of-order sequence payloads without regressing incident status.
   */
  async processOperationalWebhook(payload: OperationalWebhookPayload): Promise<OperationalWebhookResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check anti-replay idempotency table
      const eventCheck = await client.query(
        `SELECT event_id FROM test_operational_webhooks WHERE event_id = $1`,
        [payload.eventId]
      );
      if (eventCheck.rows.length > 0) {
        await client.query('COMMIT');
        return { ignored: true };
      }

      // Lock incident row for monotonic sequence evaluation
      const incidentRes = await client.query(
        `SELECT id, status, sequence_version FROM test_operational_incidents WHERE id = $1 FOR UPDATE`,
        [payload.incidentId]
      );

      if (incidentRes.rows.length === 0) {
        throw new Error(`INCIDENT_NOT_FOUND: ${payload.incidentId}`);
      }

      const currentIncident = incidentRes.rows[0];

      // Sequence guard: if incoming sequence <= current sequence, safely ignore
      if (payload.sequenceNumber <= currentIncident.sequence_version) {
        await client.query(
          `INSERT INTO test_operational_webhooks (event_id, incident_id, event_type, sequence_number)
           VALUES ($1, $2, $3, $4)`,
          [payload.eventId, payload.incidentId, payload.eventType, payload.sequenceNumber]
        );
        await client.query('COMMIT');
        return { ignored: true, currentStatus: currentIncident.status };
      }

      // Map event type to status
      let nextStatus = currentIncident.status;
      if (payload.eventType === 'incident.resolved') {
        nextStatus = 'RESOLVED';
      } else if (payload.eventType === 'incident.mitigated') {
        if (currentIncident.status !== 'RESOLVED') {
          nextStatus = 'MITIGATED';
        }
      } else if (payload.eventType === 'incident.detected') {
        if (currentIncident.status !== 'RESOLVED' && currentIncident.status !== 'MITIGATED') {
          nextStatus = 'DETECTED';
        }
      }

      await client.query(
        `UPDATE test_operational_incidents
         SET status = $1, sequence_version = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [nextStatus, payload.sequenceNumber, payload.incidentId]
      );

      await client.query(
        `INSERT INTO test_operational_webhooks (event_id, incident_id, event_type, sequence_number)
         VALUES ($1, $2, $3, $4)`,
        [payload.eventId, payload.incidentId, payload.eventType, payload.sequenceNumber]
      );

      await client.query('COMMIT');
      return { status: nextStatus, ignored: false };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Socket closed
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Emergency Kill-Switch & Stop-Loss Circuit Breaker drill.
   * Atomically pauses all active campaigns in a single transaction.
   */
  async triggerEmergencyKillSwitch(_reason: string): Promise<EmergencyKillSwitchResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const haltRes = await client.query(
        `UPDATE test_drill_campaign_mock
         SET status = 'PAUSED'
         WHERE status = 'ACTIVE'
         RETURNING id`
      );

      await client.query('COMMIT');

      return {
        activated: true,
        haltedCampaignsCount: haltRes.rows.length,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Socket closed
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
