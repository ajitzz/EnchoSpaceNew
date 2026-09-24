# CR1 P1 HTTP Execution Context Delivery

**Status:** Implemented locally  
**Scope:** P1.1 request-boundary observability only

## Delivered

- Added an isolated Express middleware adapter over the shared execution-context primitive.
- Valid inbound `x-correlation-id` values remain stable across a request; invalid values are discarded and replaced with cryptographically generated UUIDs.
- Every request receives a new Encho-owned operation ID, exposed through the legacy-compatible `requestId` field and `x-request-id` response header. Caller-supplied request IDs are never trusted or reflected.
- Valid inbound causation is retained and reflected; absent or invalid causation is omitted.
- `AsyncLocalStorage` carries the execution context through asynchronous handlers without changing the existing handler contract.
- Existing API duration metrics and 5xx structured logging remain mounted at the same request boundary and now consume the validated context.

## Security and compatibility boundary

Correlation, causation and operation IDs are diagnostic metadata. They are not authentication, authorization, tenant-selection or idempotency evidence. Existing `req.correlationId`, `req.requestId`, `X-Correlation-ID` and `X-Request-ID` compatibility is preserved while canonical code can migrate to `requireExecutionContext()`.

## Verification

Focused tests cover invalid-header rejection, stable response/request correlation, asynchronous context propagation, completion-observer consistency and distinct operation IDs for concurrent requests sharing a correlation. A server-level contract test also verifies the middleware is mounted on the real Express application rather than existing only as an isolated helper.

- Node 24 targeted Vitest: 3 files, 16 tests passed.
- Focused ESLint: passed.
- Server TypeScript project (`tsconfig.server.json`, no emit): passed.
- `git diff --check`: passed.

This slice does not yet propagate the context into every domain command, job or provider call; those remain separate bounded P1 tasks.
