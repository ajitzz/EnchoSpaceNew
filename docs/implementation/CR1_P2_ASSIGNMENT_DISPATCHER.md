# CR1 P2 — Scoped service-case assignment dispatch

Status: design and impact review; local implementation in progress. This does not approve production IAM policy or activate staff enrollment.

## Verified gap and chosen boundary

The existing `AssignmentService` supports self-claim and self-release only. Service cases require a claimed, unexpired assignment before content access, so a legitimate new assistance request currently needs manually provisioned assignment data. Blueprint P2/P3 require delegated, auditable service assignment. The existing assignment transition trigger deliberately makes resource and assignment identity immutable.

Add a case-specific `AssignmentDispatcher`, not a generic resource-ID assignment endpoint. It accepts CREATE, REASSIGN or RELEASE commands bound to an actual participant-requested OPEN case, its exact version, organization and environment. Reassignment cancels the old assignment and creates a new ASSIGNED row; it does not rewrite the historical assignee or transfer guests to another property. Dispatch does not itself claim work, authorize message content, send replies, or resolve a case.

## Impact and integration

| Area | Planned change | Preserved boundary |
|---|---|---|
| Database | Add immutable dispatch receipt table and bounded command in additive migration 040; small metadata resolver added to unpublished038 | Existing assignment fences, transition rules and unique active-resource index remain unchanged |
| Service cases | Resolver returns case identity/version/disclosure only under existing NOLOGIN definer and STAFF binding | No new thread/message/contact grants or private content projection |
| IAM | Require actor `work.assignment.reassign` and `service.assign`; assignee `work.assignment.claim` and `service.read` | No role/grant creation, no consumer principal, no automatic escalation |
| Approval | Exact `PrivilegedActions` command fingerprint plus action-bound step-up; SQL consumes APPROVED authorization in the same transaction | Previously consumed or expired approval cannot be reused for new work |
| API/UI | Parent integrates explicit prepare/approve/execute and displays receipt/pending state | No optimistic success, no staff authentication bypass |
| Operations | DBA-applied narrow EXECUTE grants and catalog checks; no remote run | Runtime cannot grant its own database privileges |

## Transaction and concurrency design

Acquire shared policy fence, a resource dispatch fence, then actor/old-assignee/new-assignee member fences in deterministic UUID order before taking assignment row locks. Canonical case metadata is locked FOR SHARE until commit, serializing participant withdrawal. Revalidate permissions, session, membership, policy, exact case/assignment versions and active-state ownership after locks. The existing transition trigger rechecks and consumes the exact factor when the action is consumed. Receipt, assignment mutation and immutable IAM audit commit atomically.

CREATE refuses an already active assignment. REASSIGN and RELEASE require the exact old assignment ID/version/fence. A repeated identical authorization returns its immutable receipt only, never repeats state changes or renews a lease. A changed command cannot use the prior approval. Unknown COMMIT acknowledgement returns an explicit unknown outcome; retry uses the same authorization.

## Verification and rollback plan

Use disposable PostgreSQL and restricted workforce/consumer roles. Cover valid dispatch → claim → audited service read, reassignment fencing, stale version/fence, unknown/cross-tenant/withdrawn case, inactive or unauthorized assignee, actor/session/environment revocation, expired/consumed/changed approval, parallel create and reassign, audit failure rollback, immutable receipts and forbidden raw writes. Rerun existing service-case and assignment suites plus scoped TypeScript/lint.

No destructive down migration: disable dispatch routing/EXECUTE permission if rollback is needed, retain assignments and audit receipts. Existing self-claim/release and participant assistance request paths remain compatible. External enrollment, approved workforce policy and production runtime provisioning remain separate rollout gates.
