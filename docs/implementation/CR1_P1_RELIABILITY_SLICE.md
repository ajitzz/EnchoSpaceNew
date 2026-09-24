# CR1 P1 Reliability Slice — Execution Correlation and Causation

**Status:** implemented and targeted-test verified

**Scope:** one additive Phase P1 shared reliability primitive

**Blueprint authority:** `docs/blueprints/ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md`, Phase P1, FR-P02, NFR-08

## Verified starting point

The repository already has mature domain-specific safety mechanisms:

- provider mutation stores retain idempotency and correlation evidence;
- marketing jobs use durable dedupe keys and database claims;
- conversion delivery has a purpose-built transactional outbox;
- campaign finance and provider operations preserve ambiguous outcomes rather than blindly retrying them.

Those implementations do not provide a shared asynchronous execution context. HTTP routes, workers, provider operations and webhook consumers create or pass identifiers independently. The missing primitive makes it difficult to preserve one correlation chain and the immediate causation link when work crosses asynchronous boundaries.

## Delivered contract

`src/lib/observability/executionContext.ts` now provides:

- strict Zod schemas for bounded correlation, causation and operation identifiers;
- an immutable `ExecutionContext` with an explicit source boundary;
- safe inbound header normalization that discards malformed/log-injection values and creates a UUID instead of failing a valid request;
- `AsyncLocalStorage` propagation across asynchronous work with concurrent-chain isolation;
- deterministic child semantics: correlation remains end-to-end, while the parent operation becomes the child's cause;
- outbound headers that propagate the current operation as downstream causation;
- an explicit typed failure when a safety-sensitive operation requires context but none is installed.

Trace identifiers are diagnostic only. The module explicitly does not treat them as authentication, authorization, financial identity or idempotency credentials.

## Compatibility and risk control

This slice is additive. It does not alter routes, provider payloads, database schemas, logging output or existing idempotency contracts. Existing callers therefore continue unchanged.

Global route and worker adoption is intentionally deferred to sequential vertical slices. Each adoption must map the canonical request/command identity and ensure durable database evidence receives the same correlation and causation semantics. Mounting the primitive everywhere without that audit would create the appearance of traceability while retaining semantic breaks.

## Verification

Focused test: `src/test/harvo/execution_context.test.ts`

The suite verifies:

1. valid inbound correlation and causation;
2. log/header injection rejection and bounded identifiers;
3. deterministic duplicate-header handling;
4. child causation linkage;
5. outbound propagation semantics;
6. asynchronous context survival;
7. concurrent-chain isolation;
8. nested context restoration;
9. required-context failure;
10. strict schema rejection of unknown fields.

## Follow-up integration order

1. Mount an HTTP adapter in the canonical `/api/v2` and `/api/marketing/v2` routers.
2. Persist correlation and causation on shared command/outbox receipts.
3. Adopt the context at worker claims and webhook ingress.
4. Enrich structured logs and metrics from the installed context.
5. Add a cross-boundary acceptance test from HTTP command through outbox claim and worker execution.

This document does not claim all of Phase P1 complete.
