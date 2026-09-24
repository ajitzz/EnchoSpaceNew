import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import type {IncomingHttpHeaders} from 'node:http';
import {z} from 'zod';

/**
 * Trace identifiers are diagnostic links, never authorization or idempotency
 * credentials. The restricted alphabet prevents header/log injection while
 * retaining provider-friendly UUID, trace and operation identifiers.
 */
export const executionTraceIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const executionContextSchema = z.object({
  correlationId: executionTraceIdSchema,
  causationId: executionTraceIdSchema.optional(),
  operationId: executionTraceIdSchema,
  source: z.enum(['HTTP', 'WORKER', 'WEBHOOK', 'SCHEDULER', 'SYSTEM']),
}).strict();

export type ExecutionContext = Readonly<z.infer<typeof executionContextSchema>>;
export type ExecutionContextSource = ExecutionContext['source'];

export const EXECUTION_CORRELATION_HEADER = 'x-correlation-id';
export const EXECUTION_CAUSATION_HEADER = 'x-causation-id';

const storage = new AsyncLocalStorage<ExecutionContext>();

function freezeContext(value: z.infer<typeof executionContextSchema>): ExecutionContext {
  return Object.freeze(value);
}

function optionalInboundTraceId(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = executionTraceIdSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Creates a new trust boundary. Invalid external identifiers are discarded and
 * replaced; malformed observability metadata must not make a legitimate request
 * unavailable.
 */
export function createInboundExecutionContext(
  headers: IncomingHttpHeaders | Readonly<Record<string, string | string[] | undefined>>,
  source: ExecutionContextSource = 'HTTP',
): ExecutionContext {
  const normalized = new Map<string, string | string[] | undefined>();
  for (const [name, value] of Object.entries(headers)) normalized.set(name.toLowerCase(), value);

  return freezeContext(executionContextSchema.parse({
    correlationId: optionalInboundTraceId(normalized.get(EXECUTION_CORRELATION_HEADER)) ?? randomUUID(),
    causationId: optionalInboundTraceId(normalized.get(EXECUTION_CAUSATION_HEADER)),
    operationId: randomUUID(),
    source,
  }));
}

/** Creates an internal root context for scheduled/system work. */
export function createRootExecutionContext(input: {
  source: ExecutionContextSource;
  correlationId?: string;
  causationId?: string;
  operationId?: string;
}): ExecutionContext {
  return freezeContext(executionContextSchema.parse({
    correlationId: input.correlationId ?? randomUUID(),
    causationId: input.causationId,
    operationId: input.operationId ?? randomUUID(),
    source: input.source,
  }));
}

/**
 * Starts a child operation without changing the end-to-end correlation. The
 * immediate parent's operation becomes the child's causation identifier.
 */
export function createChildExecutionContext(
  parent: ExecutionContext,
  source: ExecutionContextSource = parent.source,
): ExecutionContext {
  const trustedParent = executionContextSchema.parse(parent);
  return freezeContext(executionContextSchema.parse({
    correlationId: trustedParent.correlationId,
    causationId: trustedParent.operationId,
    operationId: randomUUID(),
    source,
  }));
}

/** Runs synchronous or asynchronous work in an isolated execution context. */
export function runWithExecutionContext<T>(context: ExecutionContext, work: () => T): T {
  const trusted = freezeContext(executionContextSchema.parse(context));
  return storage.run(trusted, work);
}

export function currentExecutionContext(): ExecutionContext | undefined {
  return storage.getStore();
}

/**
 * Propagation identifies the current operation as the cause of the downstream
 * operation. Consumers create their own operationId on receipt.
 */
export function executionPropagationHeaders(
  context: ExecutionContext = requireExecutionContext(),
): Readonly<Record<typeof EXECUTION_CORRELATION_HEADER | typeof EXECUTION_CAUSATION_HEADER, string>> {
  const trusted = executionContextSchema.parse(context);
  return Object.freeze({
    [EXECUTION_CORRELATION_HEADER]: trusted.correlationId,
    [EXECUTION_CAUSATION_HEADER]: trusted.operationId,
  });
}

export class ExecutionContextUnavailableError extends Error {
  readonly code = 'EXECUTION_CONTEXT_UNAVAILABLE';

  constructor() {
    super('This operation requires an execution context.');
    this.name = 'ExecutionContextUnavailableError';
  }
}

export function requireExecutionContext(): ExecutionContext {
  const context = currentExecutionContext();
  if (!context) throw new ExecutionContextUnavailableError();
  return context;
}
