import {z} from 'zod';

/** Matches executionContext's diagnostic alphabet; importing this file is browser-safe. */
export const diagnosticIdSchema = z.string().min(1).max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const retryabilitySchema = z.enum([
  'DO_NOT_RETRY', 'AFTER_CORRECTION', 'AFTER_AUTHENTICATION',
  'AFTER_DELAY', 'AFTER_RECONCILIATION',
]);

// Public detail values are bounded structure, never raw validation inputs,
// provider messages, SQL details, URLs, credentials or guest/host identities.
export const publicErrorDetailsSchema = z.object({
  fieldErrors: z.array(z.object({
    field: z.enum([
      'request', 'query', 'body', 'header', 'idempotencyKey', 'version',
      'state', 'amount', 'dates', 'file', 'permission', 'scope',
    ]),
    issue: z.enum(['REQUIRED', 'INVALID', 'OUT_OF_RANGE', 'UNSUPPORTED', 'CONFLICT']),
  }).strict()).max(20).optional(),
  retryAfterSeconds: z.number().int().min(1).max(86400).optional(),
  currentVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();

const errorDefinitions = {
  AUTHENTICATION_REQUIRED: {status: 401, message: 'Sign in to continue.', retryability: 'AFTER_AUTHENTICATION'},
  ACCESS_DENIED: {status: 403, message: 'You do not have access to this action.', retryability: 'DO_NOT_RETRY'},
  RESOURCE_NOT_FOUND: {status: 404, message: 'The requested resource is unavailable.', retryability: 'DO_NOT_RETRY'},
  INVALID_REQUEST: {status: 422, message: 'Review the highlighted inputs and try again.', retryability: 'AFTER_CORRECTION'},
  VERSION_CONFLICT: {status: 409, message: 'This item changed. Refresh it before submitting again.', retryability: 'AFTER_CORRECTION'},
  IDEMPOTENCY_CONFLICT: {status: 409, message: 'This request key was already used for different inputs.', retryability: 'AFTER_CORRECTION'},
  RATE_LIMITED: {status: 429, message: 'Too many requests. Wait before trying again.', retryability: 'AFTER_DELAY'},
  DEPENDENCY_UNAVAILABLE: {status: 503, message: 'A required service is temporarily unavailable.', retryability: 'AFTER_DELAY'},
  OPERATION_OUTCOME_UNKNOWN: {status: 409, message: 'The operation outcome is being checked. Do not submit it again.', retryability: 'AFTER_RECONCILIATION'},
  FEATURE_UNAVAILABLE: {status: 503, message: 'This action is not available yet.', retryability: 'DO_NOT_RETRY'},
  INTERNAL_ERROR: {status: 500, message: 'The request could not be completed. Use the reference when contacting support.', retryability: 'DO_NOT_RETRY'},
} as const;

export const publicErrorCodeSchema = z.enum([
  'AUTHENTICATION_REQUIRED', 'ACCESS_DENIED', 'RESOURCE_NOT_FOUND', 'INVALID_REQUEST',
  'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'RATE_LIMITED', 'DEPENDENCY_UNAVAILABLE',
  'OPERATION_OUTCOME_UNKNOWN', 'FEATURE_UNAVAILABLE', 'INTERNAL_ERROR',
]);
export type PublicErrorCode = z.infer<typeof publicErrorCodeSchema>;
export type PublicErrorDetails = z.infer<typeof publicErrorDetailsSchema>;

export const publicApiErrorSchema = z.object({
  code: publicErrorCodeSchema,
  message: z.string().min(1).max(200),
  correlationId: diagnosticIdSchema,
  operationId: diagnosticIdSchema,
  retryability: retryabilitySchema,
  details: publicErrorDetailsSchema,
}).strict().superRefine((error, context) => {
  const definition = errorDefinitions[error.code];
  if (error.message !== definition.message || error.retryability !== definition.retryability) {
    context.addIssue({code: 'custom', message: 'Public error does not match its safe catalog definition.'});
  }
});
export type PublicApiError = z.infer<typeof publicApiErrorSchema>;

/**
 * Only create after the application has classified the outcome. In particular,
 * DEPENDENCY_UNAVAILABLE requires evidence that repeating the command is safe;
 * a timeout after a possible external write is OPERATION_OUTCOME_UNKNOWN.
 * Internal diagnostics belong in a separately sanitized server log.
 */
export class PlatformDomainError extends Error {
  readonly code: PublicErrorCode;
  readonly details: Readonly<PublicErrorDetails>;

  constructor(code: PublicErrorCode, details: PublicErrorDetails = {}) {
    const parsedCode = publicErrorCodeSchema.parse(code);
    super(errorDefinitions[parsedCode].message);
    this.name = 'PlatformDomainError';
    this.code = parsedCode;
    const parsedDetails = publicErrorDetailsSchema.parse(details);
    if (parsedDetails.fieldErrors) {
      parsedDetails.fieldErrors.forEach(Object.freeze);
      Object.freeze(parsedDetails.fieldErrors);
    }
    this.details = Object.freeze(parsedDetails);
    Object.freeze(this);
  }
}

const publicTraceContextSchema = z.object({
  correlationId: diagnosticIdSchema,
  operationId: diagnosticIdSchema,
});

/**
 * Use a server-owned execution context, never the request body. Unknown thrown
 * objects (including lookalike {code, message} objects) receive a safe 500.
 * This additive mapper does not silently change legacy HTTP response contracts.
 */
export function toPublicApiError(
  error: unknown,
  executionContext: {correlationId: string; operationId: string},
): Readonly<{status: number; body: PublicApiError}> {
  const context = publicTraceContextSchema.parse(executionContext);
  const code = error instanceof PlatformDomainError ? error.code : 'INTERNAL_ERROR';
  const definition = errorDefinitions[code];
  return {
    status: definition.status,
    body: publicApiErrorSchema.parse({
      code,
      message: definition.message,
      correlationId: context.correlationId,
      operationId: context.operationId,
      retryability: definition.retryability,
      details: error instanceof PlatformDomainError ? error.details : {},
    }),
  };
}
