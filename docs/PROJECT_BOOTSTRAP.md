# PROJECT_BOOTSTRAP

This document defines the mandatory startup sequence that every AI session must execute before performing any engineering work.

The purpose is to eliminate architectural drift and ensure every session begins with the same understanding of the project.

---

## Startup Checklist

Before writing code, modifying code, debugging, refactoring, or redesigning anything, always execute this sequence:

### Phase 1 — Load Context

Read in this order:

1. `AGENTS.md`
2. `docs/ENCHO_ENGINEERING_CONSTITUTION.md`
3. `docs/AI_OPERATING_PROTOCOL.md`
4. `docs/INCIDENT_HISTORY.md` (or Constitution Incident section)
5. `docs/ARCHITECTURE_DECISIONS.md` (or ADR section)
6. `docs/knowledge/` (Relevant Engineering Knowledge Base documents only)
7. Current Development Phase
8. Current Sprint
9. Open Technical Debt

Do not rely on conversation memory if these documents contain the required information.

---

### Phase 2 — Inspect Current System

Before making changes:

* Inspect relevant source files.
* Understand the current implementation.
* Verify architecture matches documentation.
* Identify dependencies.
* Identify risks.

Never redesign code that has not been inspected.

---

### Phase 3 — Classify the Task

Every request must be classified as one of:

* Bug Fix
* Feature
* Refactor
* Performance
* Reliability
* Security
* Infrastructure
* Documentation
* Testing
* Production Incident

The classification determines the engineering workflow.

---

### Phase 4 — Produce an Engineering Plan

Before coding:

* State the objective.
* Identify root cause (if debugging).
* List affected components.
* Assess regression risks.
* Define verification steps.

No production code should be written without a clear plan.

---

### Phase 5 — Implementation Rules

During implementation:

* Preserve architectural consistency.
* Follow the Engineering Constitution.
* Follow AI Operating Protocol.
* Respect ADR decisions.
* Preserve logging, tracing, security, and idempotency.
* Do not modify unrelated systems.

---

### Phase 6 — Verification

After implementation:

Verify:

* Build passes.
* No regression.
* State machine remains valid.
* Logging intact.
* Documentation synchronized.
* Definition of Done updated if applicable.

---

### Phase 7 — Knowledge Synchronization

If architecture changed:

* Update Constitution.
* Update ADR.
* Update Incident History.
* Update Technical Debt.
* Update Development Phase.

No architectural change is complete until documentation matches the implementation.

---

## AI Startup Confirmation

At the beginning of each engineering session, silently execute this bootstrap internally.

When complete, begin work using the synchronized project context rather than relying on conversational memory.



## Latest Addition: AI Campaign Copilot & Preflight Engine
Added real-time validation via Gemini to catch Meta policy violations before they happen. It features an auto-fix UI for hosts and a preflight engine that halts execution of invalid payloads.


## Meta Campaign Engineering Brain
The AI Campaign Copilot has been upgraded to a full Meta Campaign Engineering Brain. It now includes:
- Live Meta Policy Intelligence (`/docs/meta` layer).
- Landing Page & Media Inspector simulations.
- Audience & Budget Engineering (Estimates for size, CPL, etc.).
- Learning Engine 2.0 (Injects recent 200 OK and 400+ trace logs into the AI prompt).
- Strict Pre-flight validation enforcing 15-mile radiuses and 18-65 age gates for Housing.
