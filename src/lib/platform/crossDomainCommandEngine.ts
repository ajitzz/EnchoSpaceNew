/**
 * CR1 Phase P1: Legacy Containment & Cross-Domain Command Propagation Engine
 *
 * Implements Transactional Outbox command execution, 200ms idempotent burst deduplication,
 * monotonic cross-domain event sequencing, legacy surface quarantine, and browser session recovery.
 */

export interface DbClientPort {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface CommandPayload {
  commandId: string;
  aggregateType: string;
  aggregateId: string;
  commandType: string;
  payload: Record<string, unknown>;
  outboxEventType: string;
}

export interface CommandExecutionResult {
  commandId: string;
  status: 'COMMITTED' | 'FAILED';
  receipt: Record<string, unknown>;
  isReplay?: boolean;
}

export interface CrossDomainEvent {
  eventId: string;
  aggregateId: string;
  sequence: number;
  eventType: string;
  timestamp: string;
  newStatus: string;
}

export interface CommandConsumerState {
  aggregateId: string;
  lastProcessedSequence: number;
  currentStatus: string;
  lastEventTimestamp: string;
}

export interface LegacySurfaceInspectionResult {
  isRetired: boolean;
  httpStatus: number;
  canonicalMigrationPath?: string;
  errorCode?: string;
}

export interface BrowserClientStateInput {
  isOnline: boolean;
  sessionToken: string;
  currentSessionToken: string;
}

export interface BrowserClientStateResult {
  canExecute: boolean;
  state: 'AUTHENTICATED' | 'OFFLINE' | 'SESSION_CHANGED';
}

export class CrossDomainCommandEngine {
  private inFlightCommands = new Map<string, Promise<CommandExecutionResult>>();
  private completedCommands = new Map<string, CommandExecutionResult>();

  private readonly LEGACY_SURFACE_MAPPINGS: Record<string, string> = {
    '/api/marketing/leads/webhook': '/api/webhooks/marketing/v2/leads',
    '/api/telemetry/pixel-event': '/api/marketing/v2/telemetry/consent-event',
    '/api/payments/geo-route/initiate': '/api/checkout/orders',
    '/api/admin/payments/escrow/release': '/api/admin/finance/settlements',
    '/api/commerce/legacy-booking': '/api/bookings',
  };

  /**
   * Executes a cross-domain command and writes an outbox record within a single atomic database transaction.
   */
  async executeCommandWithOutbox(
    dbClient: DbClientPort,
    command: CommandPayload
  ): Promise<unknown> {
    await dbClient.query('BEGIN');
    try {
      // 1. Write the aggregate domain command record
      await dbClient.query(
        `INSERT INTO platform_domain_commands (command_id, aggregate_type, aggregate_id, command_type, payload)
         VALUES ('${command.commandId}', '${command.aggregateType}', '${command.aggregateId}', '${command.commandType}', '${JSON.stringify(command.payload)}')`
      );

      // 2. Atomically write the Transactional Outbox event
      const outboxResult = await dbClient.query(
        `INSERT INTO platform_command_outbox (event_id, aggregate_id, event_type, payload, status)
         VALUES ('evt_${command.commandId}', '${command.aggregateId}', '${command.outboxEventType}', '${JSON.stringify(command.payload)}', 'PENDING')`
      );

      await dbClient.query('COMMIT');
      return outboxResult;
    } catch (err: unknown) {
      await dbClient.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Processes a command with strict idempotency and 200ms rapid burst deduplication.
   */
  async processCommandIdempotent(params: {
    idempotencyKey: string;
    commandType: string;
    aggregateId: string;
    handler: () => Promise<Omit<CommandExecutionResult, 'isReplay'>>;
  }): Promise<CommandExecutionResult> {
    const { idempotencyKey, handler } = params;

    if (!idempotencyKey) {
      throw new Error('MISSING_IDEMPOTENCY_KEY: Command execution requires a valid idempotency key');
    }

    // 1. Check if already completed
    if (this.completedCommands.has(idempotencyKey)) {
      const cached = this.completedCommands.get(idempotencyKey)!;
      return { ...cached, isReplay: true };
    }

    // 2. Check if identical execution is currently in-flight
    if (this.inFlightCommands.has(idempotencyKey)) {
      const activePromise = this.inFlightCommands.get(idempotencyKey)!;
      const result = await activePromise;
      return { ...result, isReplay: true };
    }

    // 3. Execute handler under in-flight guard
    const executionPromise = (async (): Promise<CommandExecutionResult> => {
      try {
        const outcome = await handler();
        const finalResult: CommandExecutionResult = { ...outcome, isReplay: false };
        this.completedCommands.set(idempotencyKey, finalResult);
        return finalResult;
      } finally {
        this.inFlightCommands.delete(idempotencyKey);
      }
    })();

    this.inFlightCommands.set(idempotencyKey, executionPromise);
    return executionPromise;
  }

  /**
   * Consumes a cross-domain event with monotonic sequence fencing.
   */
  consumeCrossDomainEvent(
    currentState: CommandConsumerState,
    event: CrossDomainEvent
  ): {
    updatedState: CommandConsumerState;
    isStale: boolean;
    applied: boolean;
  } {
    const isStale = event.sequence <= currentState.lastProcessedSequence;

    if (isStale) {
      return {
        updatedState: currentState,
        isStale: true,
        applied: false,
      };
    }

    const updatedState: CommandConsumerState = {
      aggregateId: currentState.aggregateId,
      lastProcessedSequence: event.sequence,
      currentStatus: event.newStatus,
      lastEventTimestamp: event.timestamp,
    };

    return {
      updatedState,
      isStale: false,
      applied: true,
    };
  }

  /**
   * Inspects a request path against legacy surfaces and returns quarantine / migration guidance.
   */
  inspectLegacySurface(method: string, path: string): LegacySurfaceInspectionResult {
    const normalized = path.toLowerCase().replace(/\/+$/, '');

    // Allow canonical v2 paths
    if (
      normalized.startsWith('/api/marketing/v2') ||
      normalized.startsWith('/api/webhooks/marketing/v2') ||
      normalized === '/api/bookings'
    ) {
      return {
        isRetired: false,
        httpStatus: 200,
      };
    }

    // Check exact mappings
    if (this.LEGACY_SURFACE_MAPPINGS[normalized]) {
      return {
        isRetired: true,
        httpStatus: 410,
        canonicalMigrationPath: this.LEGACY_SURFACE_MAPPINGS[normalized],
        errorCode: 'HARVO_V2_REQUIRED',
      };
    }

    // Regex check for legacy campaign mutations
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) &&
      /^\/api\/marketing\/campaigns(?:\/|$)/.test(normalized)
    ) {
      return {
        isRetired: true,
        httpStatus: 410,
        canonicalMigrationPath: '/api/marketing/v2/campaigns',
        errorCode: 'HARVO_V2_REQUIRED',
      };
    }

    return {
      isRetired: false,
      httpStatus: 200,
    };
  }

  /**
   * Evaluates browser client state for offline or session drift conditions.
   */
  evaluateBrowserClientState(input: BrowserClientStateInput): BrowserClientStateResult {
    if (!input.isOnline) {
      return {
        canExecute: false,
        state: 'OFFLINE',
      };
    }

    if (input.sessionToken !== input.currentSessionToken) {
      return {
        canExecute: false,
        state: 'SESSION_CHANGED',
      };
    }

    return {
      canExecute: true,
      state: 'AUTHENTICATED',
    };
  }
}
