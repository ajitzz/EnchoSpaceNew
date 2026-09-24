import {z} from 'zod';
import {workforcePrincipalSchema} from './contracts.js';

/**
 * Request/operation trace identifiers are diagnostic linkage only. They never
 * establish identity, permission, idempotency or resource ownership.
 */
export const principalTraceIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

/**
 * Shared authenticated identity passed into CR1 application services.
 *
 * Effective permissions and legacy account roles are intentionally absent.
 * Permission must be resolved from current IAM authority for every protected
 * operation. The operation ID prevents an ambient correlation ID from being
 * mistaken for the local authorization attempt.
 */
export const principalContextSchema = workforcePrincipalSchema.extend({
  correlationId: principalTraceIdSchema,
  operationId: principalTraceIdSchema,
}).strict();

export type PrincipalContext = Readonly<z.infer<typeof principalContextSchema>>;

/** Parse and freeze a principal at the application-service trust boundary. */
export function parsePrincipalContext(input: unknown): PrincipalContext {
  return Object.freeze(principalContextSchema.parse(input));
}
