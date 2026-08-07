# ENCHO AI Engineering Operating Protocol

## Mandatory Startup Procedure

Before performing any engineering task, debugging session, architectural redesign, feature implementation, refactor, migration, or production fix, the AI must execute the following protocol.

### Step 1 — Read the Engineering Constitution

Read and use `/docs/ENCHO_ENGINEERING_CONSTITUTION.md` as the primary source of truth.

Do not rely on conversation memory when architectural information exists in the Constitution.

---

### Step 2 — Verify Existing Architecture

Before proposing any change:

* Understand the existing implementation.
* Verify current architecture.
* Check existing database schema.
* Check existing API contracts.
* Check state machines.
* Check previous Architecture Decision Records (ADR).
* Check Incident History.

Never redesign a system without first understanding the existing implementation.

---

### Step 3 — Determine Change Scope

Classify the task as one of:

* Bug Fix
* Feature
* Refactor
* Performance
* Security
* Infrastructure
* Database
* Meta Integration
* Payment
* UI/UX
* Documentation

Only modify components required for that category.

Avoid unrelated code changes.

---

### Step 4 — Perform Impact Analysis

Before changing code, identify:

* Files affected
* Components affected
* Database impact
* API impact
* UI impact
* Security impact
* Performance impact
* Backward compatibility
* Regression risks

No implementation should begin without an impact analysis.

---

### Step 5 — Produce an Implementation Plan

Describe:

* Root cause
* Proposed solution
* Why it is correct
* Risks
* Testing strategy
* Rollback strategy

Do not write production code until the implementation plan is internally validated.

---

### Step 6 — Preserve Architecture

The AI must never:

* invent IDs
* bypass validation
* remove observability
* swallow exceptions
* remove audit logging
* remove idempotency
* break transactional boundaries
* silently change APIs
* silently change schemas

Architectural integrity takes priority over quick fixes.

---

### Step 7 — Validate the Result

After implementation verify:

* Build succeeds.
* Existing functionality still works.
* No regression introduced.
* Logging remains intact.
* State machine remains valid.
* Security unchanged unless intentionally modified.
* Documentation updated if architecture changed.

---

### Step 8 — Update Documentation

If architecture changes:

* Update Engineering Constitution.
* Update ADR.
* Update Incident History.
* Update Development Phase.
* Update Definition of Done (if applicable).

The documentation and codebase must never diverge.

---

## Incident Response Protocol

Whenever production fails:

1. Collect evidence.
2. Capture correlation ID.
3. Preserve logs.
4. Identify the first failing operation.
5. Prove root cause with evidence.
6. Implement permanent fix.
7. Add regression test.
8. Update Incident History.
9. Update ADR.
10. Close incident only after verification.

Never implement speculative fixes.

---

## Definition of Engineering Success

A task is complete only when:

* Root cause is proven.
* Code is correct.
* Regression risk is assessed.
* Documentation is synchronized.
* Testing is complete.
* Production readiness is verified.

The AI must optimize for long-term system reliability, maintainability, and architectural consistency rather than short-term fixes.
