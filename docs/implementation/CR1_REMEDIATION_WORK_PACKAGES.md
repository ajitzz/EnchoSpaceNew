# CR1 corrective work packages and acceptance ledger

**Status:** specification delivered, implementation not performed by this document.  
**Control:** docs/blueprints/CR1_ENGINEERING_REMEDIATION_BLUEPRINT.md; original CR1 scope/DoD and 48-package ledger remain controlling.  
**Baseline:** audit CR1-045; HEAD 0e4c6fe plus existing worktree changes must be reverified.

## Operating instructions

- Each card is a coherent deliverable with bounded responsibilities. XL cards must be split into small code-review batches while retaining their acceptance contract.
- Every card starts PLANNED. Existing equivalent correct work is reused and can be reaccepted with current evidence; do not rebuild it.
- Dependencies govern integrated acceptance. Local interface/fixture work may proceed while an external gate is blocked, but may not be called externally verified.
- A dependency without a suffix means current LOCAL/integrated acceptance for software work. `.LOCAL` is explicit where a card also has external predicates; `.EXTERNAL` means authentic target-specific evidence. R3-02 and R5-01 must keep these states separate. R7-02.STAGING and R7-02.PROD are separately accepted deployment subgates inside one card, not extra completion units.
- Cards R4-01/R4-02 and provider capability research can proceed alongside commerce after their own dependencies; a pending tax opinion must not stall unrelated CRM/security work.
- S/M/L/XL are relative complexity, not promises of days. Estimate concrete changes after source reconciliation.
- P0/P1 in the priority column mean urgency; original CR1 P0–P8 identifiers appear separately in traceability.
- Record card state, implementer, independent reviewer, acceptance criterion IDs, subject digest, evidence references, failed/not-run checks, external gates and next action.
- Each paragraph in “Acceptance” is mandatory. Assign subcriteria such as R1-01.AC01 in the handoff register before implementation; do not shrink criteria to fit the code.
- Do not calculate CR1 completion from the number of new classes, tests or corrective cards.
- Full-sweep checkpoints: R2-04 = P2 reacceptance; R3-04 = P4; R5-04 = P6; R7-01 = P8 software verification. External P8 gates remain distinct.

## Dependency overview

~~~mermaid
flowchart LR
  R0[Baseline and evidence R0] --> R1[Identity and offline repair R1]
  R0 --> R2[Durability build and P2 exit R2]
  R1 --> R2
  R2 --> Offers[Offers and commerce R3-01 to R3-03]
  R2 --> CRM[CRM and service R4-01 to R4-02]
  Offers --> P4[Integrated P4 exit R3-04]
  CRM --> P4
  Offers --> Creative[Creative and revision binding R4-03 to R4-04]
  Creative --> R5[Programs providers finance R5]
  Offers --> R5
  R5 --> R6[Host portfolio and operations R6]
  CRM --> R6
  P4 --> R6
  R6 --> R7[Artifact staging canary pilot R7]
~~~

The diagram is stage-level; exact card dependencies below control. For example, CRM does not depend on completed paid commerce.

## Ledger

Execution now proceeds under the founder remediation instruction. States below describe work in progress or a handoff, not card acceptance. See [current execution and exact evidence](CR1_REMEDIATION_EXECUTION.md). Full-card acceptance remains 0/32; the original register remains 0/48 independently reaccepted. R4 safety corrections may proceed in parallel; the P2 exit dependency still controls integrated acceptance.

| Card | Deliverable | Primary owner | Effort | Priority | Execution state (29 Sep) |
|---|---|---|---|---|---|
| R0-01 | Reconcile source, index, deployment and migration identities | Release engineer + DBA | M | P0 | IN_PROGRESS |
| R0-02 | Quarantine synthetic clearance and specify evidence collection | Release engineer + independent reviewer | M | P0 | READY_FOR_REVIEW |
| R0-03 | Reaccept the original 48-package ledger | Senior reviewer + product lead | M | P0 | IN_PROGRESS |
| R0-04 | Install review, acceptance and evidence validation workflow | Engineering lead + release engineer | M | P0 | IN_PROGRESS |
| R1-01 | Repair workforce configuration, issuer and actual-role isolation | Identity/security engineer | L | P0 | READY_FOR_REVIEW |
| R1-02 | Unify workforce administration with canonical IAM commands | IAM backend + staff frontend | XL | P0 | IN_PROGRESS |
| R1-03 | Remove generic privileged offline replay and migrate old queues | Frontend platform + security QA | L | P0 | CHANGES_REQUESTED — browser containment locally tested; server-side logout/cutover proof absent |
| R1-04 | Make audit history correct across every IAM writer | Security/database engineer | L | P0 | IN_PROGRESS |
| R2-01 | Replace process-local hardening authority with durable commands | Platform backend | L | P0 | IN_PROGRESS |
| R2-02 | Separate credential-free builds from exact deployment verification | Release/DBA | M | P0 | IN_PROGRESS |
| R2-03 | Enforce canonical composition and strict boundary contracts | Platform architect + integration engineer | M | P1 | IN_PROGRESS |
| R2-04 | Reaccept the P2 foundation exit | Independent security/release reviewer | M | P0 | PLANNED |
| R3-01 | Establish canonical room-offer versions across three surfaces | Guest commerce + host/admin product | L | P0 | PLANNED |
| R3-02 | Implement approved policy contracts without fabricated tax authority | Commerce/finance engineer + professional policy owner | L | P0 | PLANNED |
| R3-03 | Connect quote, hold, verified capture and booking | Commerce/payments backend | XL | P0 | IN_PROGRESS — retired development mutations contained locally; canonical payable journey not delivered |
| R3-04 | Complete trip/refund support and reaccept P4 | Commerce/frontend + independent reviewer | L | P0 | PLANNED |
| R4-01 | Complete durable inbox and notification delivery | CRM backend + notification engineer | L | P0 | IN_PROGRESS |
| R4-02 | Complete scoped Service Desk and grounded assistance | CRM/workforce + privacy/product reviewer | L | P1 | IN_PROGRESS |
| R4-03 | Integrate external Creative Packages with exact-byte review | Media/creative backend + review UX | L | P1 | PLANNED |
| R4-04 | Bind offer/property subjects, intent and creative to campaign revisions | Marketing workflow engineer | L | P0 | PLANNED |
| R5-01 | Establish compliant account and versioned capability authority | Provider operations + integration engineer | L | P0 | PLANNED |
| R5-02 | Complete expert program studios and provider-resolved geography | AdTech backend + staff UX | XL | P1 | PLANNED |
| R5-03 | Unify paused publication, exact readback and recovery | Provider/worker engineer + reviewer | L | P0 | PLANNED |
| R5-04 | Integrate Finance Desk/top-up and reaccept P6 | Finance/payments + independent reviewer | XL | P0 | PLANNED |
| R6-01 | Deliver bounded one-click host setup | Host product/frontend + marketing backend | L | P1 | PLANNED |
| R6-02 | Complete four-flight monitoring and canonical outcome deduplication | Analytics/marketing backend + host frontend | L | P1 | PLANNED |
| R6-03 | Finish three-sided UX, inquiry alerts and accessibility | Design/frontend + accessibility QA | L | P1 | PLANNED |
| R6-04 | Complete observability, operational capacity and recovery preparation | SRE/platform + domain operators | L | P0 | PLANNED |
| R7-01 | Freeze and independently verify the complete release artifact | Release lead + independent QA/security | L | P0 | PLANNED |
| R7-02 | Verify isolated staging and disaster recovery with actual roles | DBA/SRE + release reviewer | L | P0 | PLANNED |
| R7-03 | Execute approved PAUSED provider canary | Provider operator + independent reviewer | M | P0 | PLANNED |
| R7-04 | Operate a bounded paid pilot and independently decide release | Founder/product + finance/provider/support operations + release reviewer | XL | P0 | PLANNED |

## Detailed work cards

### R0-01 — Reconcile source, index, deployment and migration identities

| Field | Contract |
|---|---|
| Owner / effort / priority | Release engineer + DBA · M · P0 |
| Dependencies | None; startup source verification |
| Original CR1 / audit | P0.2, P0.4, P1.5 · A12 |
| Source anchors to reverify | git state; server.ts; src/migrations; scripts/cr1/verify-inventory.mjs; deployment manifests |

**Objective and engineering tasks:** Capture HEAD, index, worktree and intended artifact independently without changing the index. Classify all pre-existing removals as intentional/replaced/accidental with owner and rationale. Trace current routes, workers, tables, callers and tests. Read authorized deployment identities/history separately; keep them UNKNOWN when unavailable. Do not allocate migration numbers until existing/applied history is reconciled.

**Acceptance:** A reviewed change-disposition register and current route/schema/worker map exist. Every deletion has an owner and compatibility decision. Applied SQL is preserved with its original checksum; no unknown version is silently accepted.

**Validation:** Reproduce inventory failure; add missing route ownership through the correct registry. Compare source, packaged and observed database migration manifests; run locally with simulated extra/missing/changed history.

**Rollback / containment:** Documentation/inventory changes only initially. Never reset user changes or delete remote migration history.

**Deliverable:** Baseline/change-disposition report and manifest digests.

### R0-02 — Quarantine synthetic clearance and specify evidence collection

| Field | Contract |
|---|---|
| Owner / effort / priority | Release engineer + independent reviewer · M · P0 |
| Dependencies | R0-01 |
| Original CR1 / audit | P0.3, P0.5, P8.1, P8.3, P8.4 · A01, A10, A15 |
| Source anchors to reverify | scripts/compliance/*; scripts/deployment/run-staging-deployment.mjs; provider-canary-runner.mjs; docs/harvo/receipts |

**Objective and engineering tasks:** Inventory every producer and consumer of clearance. Preserve invalid historical receipts with explicit qualification records. Restrict example generators to fixtures and remove any path from fixture output to production acceptance. Separate collectors, formatters and validators. Never author accountant identity, provider IDs, safe-role results or pilot outcomes as real evidence.

**Acceptance:** No generator can clear an external gate merely by emitting status text or a hash. Missing database/provider observations remain UNKNOWN. Every external receipt has authenticated provenance and applicable subject scope.

**Validation:** Negative tests for fixture receipts, absent dbClient, missing spend, invented attestation, wrong environment/account, stale hash and untrusted signer; verify alternative deployment scripts are covered.

**Rollback / containment:** Keep old evidence for history, but never roll back to accepting it as real clearance.

**Deliverable:** Evidence schema, collector/validator boundary and fixture quarantine register.

### R0-03 — Reaccept the original 48-package ledger

| Field | Contract |
|---|---|
| Owner / effort / priority | Senior reviewer + product lead · M · P0 |
| Dependencies | R0-01, R0-02 |
| Original CR1 / audit | P0.1 and all 48 package acceptance records · A01, A06, A12, A15 |
| Source anchors to reverify | CR1_EXECUTION_PLAN.md; controlling blueprint; HARVO.md; DECISIONS.md |

**Objective and engineering tasks:** For each original package map criteria to current source, mounted route/worker, schema, UI and required evidence level. Retain proven prior work. Mark unreviewed, partially integrated and externally blocked dimensions explicitly. Record open policy decisions and responsible real-world owners. Reject proposals silently promoted to approvals.

**Acceptance:** All 48 packages have a disposition and criterion-level evidence references; no new percentage is calculated from unchecked claims. Current-source defects and external unknowns are separate.

**Validation:** Machine-check that every original package appears exactly once in the reacceptance register and all criterion/evidence references resolve.

**Rollback / containment:** Append superseding decisions; do not erase historical ledger rows or invent lower/higher completion.

**Deliverable:** CR1 package reacceptance matrix and external-gate ownership register.

### R0-04 — Install review, acceptance and evidence validation workflow

| Field | Contract |
|---|---|
| Owner / effort / priority | Engineering lead + release engineer · M · P0 |
| Dependencies | R0-02, R0-03 |
| Original CR1 / audit | P0.1, P1.7, phase exits · A01, A15 |
| Source anchors to reverify | CI workflow; proposed evidence validator; package handoff records |

**Objective and engineering tasks:** Implement strict receipt schemas, independent-review dispositions and dependency invalidation. Capture exact source/artifact identity, commands, exit codes, failed/skipped counts and redacted evidence locations. Define owners for shared files and migration allocation. Set explicit review coverage; do not award acceptance for a test name.

**Acceptance:** Only validated evidence at the required level can satisfy a predicate. Implementer cannot approve protected changes alone. Changed relevant artifacts invalidate downstream acceptance.

**Validation:** Reject stale, missing, tampered, skipped-required, same-author protected approval and fixture-as-production evidence; accept properly scoped local evidence only as local.

**Rollback / containment:** If validator fails, keep promotion blocked; do not bypass it with a handwritten certificate.

**Deliverable:** Review template, executable validation contract and acceptance ledger workflow.

### R1-01 — Repair workforce configuration, issuer and actual-role isolation

| Field | Contract |
|---|---|
| Owner / effort / priority | Identity/security engineer · L · P0 |
| Dependencies | R0-01 |
| Original CR1 / audit | P0.4, P2.3, P2.7 · A02, A03 |
| Source anchors to reverify | src/server/operations/runtime.ts; sessionRuntime.ts; src/lib/iam/staffSessionIssuer.ts; runtimeBoundary.ts |

**Objective and engineering tasks:** Remove owner and generic database fallbacks from normal staff authentication. Require explicit issuer/runtime URLs, organization, OAuth audience, environment and HTTPS origin for staging/production. Restore validated remote TLS. Remove privilege-dependent identity enrollment from session issuance. Preserve nonce, token hash, secure cookie and uncertain-commit handling.

**Acceptance:** Existing Operations security tests pass without weakened assertions. Owner/inherited privilege/raw-table roles fail; narrow issuer/runtime logins work. Advertising OAuth or default organization cannot supply staff identity configuration.

**Validation:** cr1_operations_api and staff-session issuer suites first; then actual LOGIN-role tests, production-flag cases, wrong audience/organization, hostile grants, wrong CA/hostname and missing configuration.

**Rollback / containment:** Disable affected workforce operations on failure; never restore insecure TLS or owner exceptions.

**Deliverable:** Explicit configuration contract and actual-role identity receipt.

### R1-02 — Unify workforce administration with canonical IAM commands

| Field | Contract |
|---|---|
| Owner / effort / priority | IAM backend + staff frontend · XL · P0 |
| Dependencies | R1-01, R0-04 |
| Original CR1 / audit | P2.3, P2.4, P2.5, P2.6 · A04 |
| Source anchors to reverify | workforceAdminService.ts; src/server/admin/workforceRouter.ts; AdminStaffCommandCenter.tsx; ownerBootstrap/workforceInvitations/workforceLifecycle/privilegedActions |

**Objective and engineering tasks:** Contain unsupported direct mutations and adapt UI to existing scoped services. Separate reviewed bootstrap, invitation, verified identity acceptance, grants and command-bound step-up/checker. Replace automatic consumer-admin promotion and immediate ACTIVE hiring. Implement missing resume/quota/freeze command contracts only after explicit policy/atomicity design; otherwise show unavailable.

**Acceptance:** A scoped staff user completes an assigned task without global admin. Consumer admin status alone cannot mint owner authority. Revocation, stale version, wrong organization/environment, self-checker and reused factor are denied at the correct boundary.

**Validation:** Mounted HTTP through actual restricted roles; existing owner/bootstrap/invitation/lifecycle/step-up/privileged-action suites; concurrent revoke-execute and lost-COMMIT reconciliation.

**Rollback / containment:** Disable new command adoption, preserve memberships/grants/revocations and existing safe Operations reads; never restore direct bypass.

**Deliverable:** Canonical workforce command/UI mapping and role-matrix acceptance.

### R1-03 — Remove generic privileged offline replay and migrate old queues

| Field | Contract |
|---|---|
| Owner / effort / priority | Frontend platform + security QA · L · P0 |
| Dependencies | R0-01 |
| Original CR1 / audit | P1.4, P1.7, P3.6 · A05 |
| Source anchors to reverify | vite.config.ts; lib/syncService.ts; AuthContext; service-worker registration and IndexedDB lifecycle |

**Objective and engineering tasks:** Remove generic API POST background sync; define a reviewed allowlist of offline intents. Never persist bearer credentials. Keep privilege/payment/activation commands dependent on fresh user intent. Add upgrade/activation/logout cleanup for old api-syncQueue, including waiting workers and multi-tab races. Preserve inquiry client-event reconciliation.

**Acceptance:** Previously installed workers/queues cannot replay old actor credentials or commands after logout/account switch. Correct allowed inquiry retry remains idempotent and visibly pending/unknown when appropriate.

**Validation:** Existing actor-scoped-sync suite plus production-built service-worker browser tests: offline, reconnect, token expiry, new actor, two tabs, interrupted update and server-committed-but-response-lost.

**Rollback / containment:** Fall back to online-only submission with explicit errors, not generic replay. Do not discard unresolved server effects without reconciliation.

**Deliverable:** Credential-free offline intent policy and browser evidence.

### R1-04 — Make audit history correct across every IAM writer

| Field | Contract |
|---|---|
| Owner / effort / priority | Security/database engineer · L · P0 |
| Dependencies | R1-02 |
| Original CR1 / audit | P2.5, P2.6, P8.2 · A13 |
| Source anchors to reverify | workforceAdminService.ts hash/verify functions; canonical IAM SQL writers; additive audit schema/helpers |

**Objective and engineering tasks:** Specify versioned canonical event envelopes and honest integrity guarantees. Serialize per-scope append-head updates with the protected command. Include actor/environment/policy/evidence and all security fields. Support legacy/null-hash events through explicit coverage boundaries; do not rewrite immutable history. Define protected export anchoring and access.

**Acceptance:** All new event writers use the same verified contract. Concurrent append is consistent. Mutation of protected fields is detectable; legitimate sequence gaps are not false tamper alarms. UI stops calling a linear chain Merkle.

**Validation:** Multi-connection append/rollback, field tamper, missing/reordered export, legacy mixed history, anchor verification and audit-write-failure rollback.

**Rollback / containment:** Retain history and append corrective format/version records; never disable immutable triggers to rewrite evidence.

**Deliverable:** Audit-format ADR, additive migration if needed and integrity coverage receipt.

### R2-01 — Replace process-local hardening authority with durable commands

| Field | Contract |
|---|---|
| Owner / effort / priority | Platform backend · L · P0 |
| Dependencies | R0-04, R1-01 |
| Original CR1 / audit | P1.3, P1.7, P6.5 · A07, A08 |
| Source anchors to reverify | src/lib/platform/durableOutbox.ts; compliance/creative/portfolio prototype engines; command adapters |

**Objective and engineering tasks:** Classify prototypes as fixtures, retired or integrated adapters. Replace authoritative Maps with scoped DB identity, canonical request fingerprints and durable sequence/CAS state. Parameterize all SQL. Use one held client per transaction; keep external writes outside transaction locks. Preserve explicit unknown outcomes.

**Acceptance:** Separate instances/processes and restarts cannot lose dedupe/sequence authority. Conflicting payload replays fail. Cross-tenant keys remain isolated. No raw input becomes SQL syntax.

**Validation:** Real PostgreSQL multi-process same/conflicting key, stale fence, restart, quotes/Unicode/injection values, audit failure and connection loss around COMMIT; convert offline audit reproductions into regressions.

**Rollback / containment:** Disable affected new workers/commands and keep reconciliation records; do not revive process-memory authority.

**Deliverable:** Durable command adoption map and adversarial database receipts.

### R2-02 — Separate credential-free builds from exact deployment verification

| Field | Contract |
|---|---|
| Owner / effort / priority | Release/DBA · M · P0 |
| Dependencies | R0-01, R0-02 |
| Original CR1 / audit | P0.4, P8.1, P8.2 · A11, A12 |
| Source anchors to reverify | package.json; verify-schema-sync.mjs; migration executor/runner; recoveryReadiness; CI/Docker |

**Objective and engineering tasks:** Make build compile/package/check artifacts without loading .env or querying a database. Extract/reuse pure exact history comparison; do not invoke a DDL-capable runner as read-only preflight. Add explicit target/environment read-only preflight and separate migration apply. Check unknown/missing/changed history and grants.

**Acceptance:** Build has no runtime secret/database dependency. Explicit preflight rejects checksum drift, extra migration, wrong role/environment and missing predecessor authority. Source SQL, packaged SQL and applied history agree.

**Validation:** Offline build with network blocked after dependency installation; unusable DB URL cannot cause access. Manifest negative cases; actual restricted-role readiness and disposable migration lock/unknown-COMMIT tests.

**Rollback / containment:** Keep prior compatible artifact and additive schema; never weaken checksums or use a live DB merely to compile.

**Deliverable:** Build artifact manifest, explicit deployment commands and schema verification contract.

### R2-03 — Enforce canonical composition and strict boundary contracts

| Field | Contract |
|---|---|
| Owner / effort / priority | Platform architect + integration engineer · M · P1 |
| Dependencies | R0-01, R2-01, R2-02 |
| Original CR1 / audit | P0.2, P1.1, P1.2, P1.5, P1.6, P1.7 · A06, A08, A12, A15 |
| Source anchors to reverify | server.ts composition; route inventory; src/shared contracts; public error adapters; CI lint/type scope |

**Objective and engineering tasks:** Trace every retained feature into mounted routes/workers; classify unused engines. Restore route ownership inventory, canonical errors/correlation and legacy containment. Add strict Zod input/output/persisted schemas for new boundaries and targeted TypeScript strictness. Keep new business logic out of server.ts; extract only touched slices.

**Acceptance:** Inventory is clean; no feature is credited solely through direct class tests. New inputs cannot supply principal/environment/provider approval. Logs redact secrets/PII and errors preserve useful correlation.

**Validation:** Mounted route/auth/error contracts, inaccessible retired route cases, malformed payload and output validation, compiler/lint for touched modules, public artifact leakage check.

**Rollback / containment:** Turn off new route adoption while retaining canonical state and old compatible projections; no full root rewrite.

**Deliverable:** Updated authority/route map and boundary contract tests.

### R2-04 — Reaccept the P2 foundation exit

| Field | Contract |
|---|---|
| Owner / effort / priority | Independent security/release reviewer · M · P0 |
| Dependencies | R1-04, R1-03, R2-03 |
| Original CR1 / audit | P2.7; P0/P1/P2 evidence refresh · A02–A08, A11–A15 |
| Source anchors to reverify | CI, identity/outbox/conversation foundations, browser workforce/offline journeys |

**Objective and engineering tasks:** Review exact integrated tree and all R0–R2 evidence. Run full regression, repository typecheck/lint and isolated build once; run workforce/offline browser and actual-role checks. Record prior failures separately from passing repair evidence. Resolve new failures at their source.

**Acceptance:** No unresolved critical/high foundation defect; formerly failing Operations assertions pass unchanged in intent; inventory/build/role/session tests are clean and reviewer signs the exact scope.

**Validation:** P2 exit full sweep plus actual staff invite/login/step-up/revoke and browser logout/queue matrix; sanitized logs and artifact identity.

**Rollback / containment:** Reject exit and continue focused repair; do not skip failing tests or count partial pass as phase acceptance.

**Deliverable:** P2 reacceptance receipt and original package disposition updates.

### R3-01 — Establish canonical room-offer versions across three surfaces

| Field | Contract |
|---|---|
| Owner / effort / priority | Guest commerce + host/admin product · L · P0 |
| Dependencies | R2-03 |
| Original CR1 / audit | P4.1, P4.2 · A06 |
| Source anchors to reverify | src/lib/offers; relational rooms/media/inventory; ListingDetailsNew.tsx; actual host editor and admin moderation owner |

**Objective and engineering tasks:** Specify server-owned rate/occupancy/date/minimum-stay/conditions authority. Create immutable accepted offer versions using existing equivalent entities where possible. Keep observations, offers, quotes and holds distinct. Update guest presentation, host editing and admin moderation together; include truthful conditional from-price logic.

**Acceptance:** Budget room and premium suite remain independently identifiable and priced. Foreign-host, unpublished, missing-basis and changed-condition inputs fail safely. No client price establishes authority.

**Validation:** Existing offer/room authority suite plus mixed-resort three-surface HTTP/browser cases; changed price/date/currency/occupancy and retained historical version tests.

**Rollback / containment:** Keep read-only observations available and disable accepted-offer consumption; do not rewrite accepted snapshots.

**Deliverable:** Offer ADR/schema/contract, three projections and canonical fixtures.

### R3-02 — Implement approved policy contracts without fabricated tax authority

| Field | Contract |
|---|---|
| Owner / effort / priority | Commerce/finance engineer + professional policy owner · L · P0 |
| Dependencies | R3-01, R0-02 |
| Original CR1 / audit | P4.3, P6.4 · A10 |
| Source anchors to reverify | quote/policy authority; statutoryTaxVerificationEngine; compliance receipts; guest decision registers |

**Objective and engineering tasks:** Extract policy inputs for effective date, supplier status, commission plan, tax/withholding basis, rounding, cancellation and refund. Retire duplicate fixed-rate production authority. Integrate authentic approval document references and review; keep synthetic examples visibly local. Resolve cost/markup rules separately from booking commission.

**Acceptance:** All policy inputs are versioned and approved for the intended live transaction; no regex or filename unlocks payment. Local contract implementation may pass while LEGAL/COMM gates remain blocked.

**Evidence levels:** R3-02.LOCAL accepts versioned contracts and clearly synthetic branch/recovery tests only. R3-02.EXTERNAL additionally requires authentic applicable approved policy and its example vectors. Downstream local checkout/finance tests may consume LOCAL fixtures; live transactions cannot.

**Validation:** Approved example vectors when supplied; local synthetic vectors for branches, effective-date transitions, Growth/Flex, rounding/refunds and forged/expired/mismatched approval rejection.

**Rollback / containment:** Retain existing legal checkout gate and historical policy versions; do not substitute guessed statutory constants.

**Deliverable:** Policy interface/test vectors and explicit legal/commercial gate record.

### R3-03 — Connect quote, hold, verified capture and booking

| Field | Contract |
|---|---|
| Owner / effort / priority | Commerce/payments backend · XL · P0 |
| Dependencies | R3-01, R3-02.LOCAL, R2-04 |
| Original CR1 / audit | P4.4 · A06, A07, A10 |
| Source anchors to reverify | inventoryHoldService.ts; canonical quote/order/webhook services; mounted stays routes; guest CheckoutPage |

**Objective and engineering tasks:** Wire server quote to atomic inventory hold and idempotent payment order. Verify raw-body provider signature and bind event to exact account/order/quote/amount/currency. Confirm only through canonical capture reconciliation. Implement late capture/expired hold and lost-acknowledgement recovery; never use browser success redirect as payment proof.

**Acceptance:** No oversold capacity or duplicate captured booking in the defined contention/replay suite. Client totals cannot change price. Late/ambiguous payments retain explicit recovery and no false confirmation.

**Validation:** Actual PostgreSQL restricted roles, 100-contender inventory case, forged redirect/signature, duplicate/out-of-order events, changed total, lost COMMIT, worker restart and gateway sandbox separately.

**Rollback / containment:** Disable new checkout/order creation; retain verified webhook ingestion, reconciliation, existing booking access and refund obligations.

**Deliverable:** Mounted guest booking vertical slice and state/recovery receipts.

### R3-04 — Complete trip/refund support and reaccept P4

| Field | Contract |
|---|---|
| Owner / effort / priority | Commerce/frontend + independent reviewer · L · P0 |
| Dependencies | R3-03, R4-01, R4-02 |
| Original CR1 / audit | P4.1, P4.5, P4.6 · A06, A10, A15 |
| Source anchors to reverify | guest confirmation/trip/cancellation UI; canonical refund/journal services; conversation booking context |

**Objective and engineering tasks:** Show only verified confirmation; implement own-trip view, versioned cancellation and idempotent refund/reconciliation. Link support to canonical booking. Complete guest mobile/accessibility/price truth checks. Run P4 full regression/type/lint/isolated build and gateway integration acceptance.

Implement verified-review eligibility from the controlling guest decision register and canonical fulfillment. Keep cancelled/refunded/non-fulfilled cases explicit; possession of a booking ID never grants review authority. This integrated P4 exit waits for the R4-01/R4-02 support slice even though commerce preparation can run earlier.

**Acceptance:** Guest can finish and manage a stay under an approved executable policy. Cancellation/refund status agrees with journal and provider receipts. Local fixtures never clear legal or gateway external gates.

**Validation:** End-to-end quote/pay/confirm/manage/cancel, duplicate refund, partial/unknown refund, other-user trip denial, mobile/keyboard, plus full P4 sweep.

Include foreign-user, duplicate, non-fulfilled and cancelled/refunded review cases against the approved policy; do not invent exceptions to make fixtures pass.

**Rollback / containment:** Disable new checkout while preserving manage-trip, evidence and servicing obligations; retain compatible schemas.

**Deliverable:** P4 exit receipt, trip/support journey and legal/gateway evidence classification.

### R4-01 — Complete durable inbox and notification delivery

| Field | Contract |
|---|---|
| Owner / effort / priority | CRM backend + notification engineer · L · P0 |
| Dependencies | R2-04 |
| Original CR1 / audit | P3.1, P3.2, P3.3 · A06, A15 |
| Source anchors to reverify | src/lib/conversations; router.ts; notificationRouter.ts; notificationRuntimeAdapter.ts; inbox consumers |

**Objective and engineering tasks:** Preserve canonical conversation/history identity and ordered writes. Trace/mount preference and receipt APIs with auth. Finish worker attempts, backoff/DLQ and channel receipts. Replace readiness-failure zero unread counts with explicit unavailable state. Keep read-cursor mutations explicit and preserve history through migration.

Implement approved privacy retention/export/erasure handling for messages, attachments and receipts. Recheck notification consent at dispatch/retry; queued consent withdrawal must suppress delivery. Preserve legally required evidence with reviewed redaction/tombstones and report incomplete erasure accurately.

**Acceptance:** Every accepted message has one durable notification intent. Duplicate event IDs return stable messages. Saved/queued/delivered/read and unavailable/zero counts remain distinct across API/UI.

**Validation:** Conversation delivery/preferences/notification worker suites, unreachable-route regression, unavailable counts, lost socket, duplicate command, worker failure and consented sandbox channel tests.

**Rollback / containment:** Disable failing notification channel while keeping durable messages/intents; never replace unknown counts with zero.

**Deliverable:** Reachable inbox/notification vertical slice and receipt projection.

### R4-02 — Complete scoped Service Desk and grounded assistance

| Field | Contract |
|---|---|
| Owner / effort / priority | CRM/workforce + privacy/product reviewer · L · P1 |
| Dependencies | R4-01, R1-02 |
| Original CR1 / audit | P3.4, P3.5, P3.6 · A04, A06 |
| Source anchors to reverify | serviceCases.ts; serviceRouter.ts; serviceRuntime.ts; Operations Service Desk; conversationAssistanceBoundary |

**Objective and engineering tasks:** Implement assigned dispatch/reassignment and disclosed staff replies through canonical commands. Commit content-access evidence before authorized reads; recheck session/assignment/consent. Keep internal notes private. Enable grounded AI draft/translation only through schemas, approved context and human send confirmation.

Apply the same approved export/erasure/retention boundaries to case notes, AI context and generated drafts. Test withdrawal during in-flight inference, retry and reassignment; stale results must not restore access or trigger sending.

**Acceptance:** Revoked/unassigned staff cannot read or reply; delayed browser results do not restore access. Guests see staff identity. AI never invents availability, pricing or refund authority.

**Validation:** Service-case RLS/access/revocation, consent withdrawal, assignment races, note-leak and impersonation tests; AI prompt-injection/malformed/timeout evaluations; offline/mobile Service Desk journey.

**Rollback / containment:** Return to assigned read/draft-only or human-only assistance with clear unavailable states; preserve records and messages.

**Deliverable:** Scoped assistance journey, AI evaluation set and disclosure/retention gate references.

### R4-03 — Integrate external Creative Packages with exact-byte review

| Field | Contract |
|---|---|
| Owner / effort / priority | Media/creative backend + review UX · L · P1 |
| Dependencies | R3-01, R1-02, R2-01 |
| Original CR1 / audit | P5.2 · A06, A08 |
| Source anchors to reverify | creativeWorkflow.ts; creativeContract.ts; media ingestion/renditions; CreativeWorkspace and host uploads |

**Objective and engineering tasks:** Accept image/carousel/video outside the listing only with owned subject, rights, secure ingestion, immutable original and derivative lineage. Validate real media type, resource limits, remote URL fetch policy and metadata privacy. Bind review to exact assets/claims/transcripts. Keep campaign assets separate from gallery publication.

**Acceptance:** Unsupported, unsafe, unowned or unreviewed media cannot publish. Changed bytes invalidate approval. Pending video processing remains pending. All three surfaces project consistent media authority.

Organic distribution and paid pool execution remain unavailable/deferred under existing gates. Include regression evidence that this integration cannot unlock brand-account organic posting, pooled checkout or pooled spend.

**Validation:** MIME spoof/decompression/SSRF/oversize/rights cases; derivative idempotency, expired signed asset, changed digest, worker restart and reviewer independence; actual supported rendering/browser fixtures.

**Rollback / containment:** Disable new ingestion/publication; retain accepted assets, lineage and safely served previous versions.

**Deliverable:** Creative Package contract, ingestion/review worker and three-surface tests.

### R4-04 — Bind offer/property subjects, intent and creative to campaign revisions

| Field | Contract |
|---|---|
| Owner / effort / priority | Marketing workflow engineer · L · P0 |
| Dependencies | R3-01, R4-03 |
| Original CR1 / audit | P5.1, P5.3, P5.4, P5.5 · A06 |
| Source anchors to reverify | workflow.ts; campaign revision/strategy bindings; portfolio facts/story; CampaignStudio and review UI |

**Objective and engineering tasks:** Add exact offer-version and Creative Package references to canonical revisions atomically. Keep property discovery distinct with conditioned claims. Derive economics tier from selected offer; compose GuestFitIntent separately. Preserve deterministic and AI/human review independence. Material edits require new revision and applicable reacceptance.

Implement deterministic preflight for missing facts, inventory, creative, economics assumptions, aggregate portfolio exposure, eligibility and policy. Assess concurrent flights sharing offer/dates/keywords/geography without elevating approved shadow/advisory overlap analysis into automatic blocking or consolidation. Enforce approved hard financial exposure limits separately; these must still block unauthorized funding/activation. Bind canonical inventory/offer changes to durable campaign-protection intents; R5-03 owns dispatch/readback.

**Acceptance:** A mixed resort cannot substitute cheap-room price for premium creative. Worker reads bound snapshot, not current ambient profile. Host and reviewer see the same landing facts/assets.

**Validation:** Room/host substitution, stale offer/program, changed media, two concurrent edits, revision CAS, bounded host override, unsupported relationship/demographic mapping and three-surface golden slice.

Test overlapping flights, fragmented budget guidance, sold-out inventory, host blocks and material price/conditions changes. Advisory conflicts must not silently modify funding or publication authority.

**Rollback / containment:** Disable adoption of new subject types; never revert to a publisher that ignores their binding.

**Deliverable:** Offer-led/discovery revision contracts and current mounted-path evidence.

### R5-01 — Establish compliant account and versioned capability authority

| Field | Contract |
|---|---|
| Owner / effort / priority | Provider operations + integration engineer · L · P0 |
| Dependencies | R0-02, R1-02 |
| Original CR1 / audit | P6.1 · A01, A09, A15 |
| Source anchors to reverify | adtech/capabilities.ts; provider account bindings; Meta/Google adapters; financeBridge.ts |

**Objective and engineering tasks:** Bind exact advertiser/account scope, API version, permissions, feature support and policy evidence. Separate zero-Host-OAuth UX from serving-account permission. Eliminate format-only credential clearance and universal policy-category assumptions. Trace the same account binding through compile, dispatch, finance authorization and observations.

**Acceptance:** Each executable feature has supported schema, eligible account, compile/readback and approval evidence. Missing topology/access keeps external execution blocked. Account identity cannot drift to an environment default.

**Evidence levels:** R5-01.LOCAL establishes typed capability/account contracts, denial rules and compile/readback requirements against labeled fixtures. R5-02/R5-03 implement and locally verify those requirements. R5-01.EXTERNAL requires authentic account eligibility/access evidence; R7-03 supplies real operation/readback proof. Never make LOCAL acceptance depend on a downstream canary or imply it authorizes one.

**Validation:** Wrong provider/account/version, unsupported capability, changed secret reference, revoked permission and account-health denial; local fixtures separated from authenticated external probes.

**Rollback / containment:** Disable new provider operations for affected capability/account; preserve safety pause and historical reconciliation.

**Deliverable:** Account/capability register and explicit provider gate evidence.

### R5-02 — Complete expert program studios and provider-resolved geography

| Field | Contract |
|---|---|
| Owner / effort / priority | AdTech backend + staff UX · XL · P1 |
| Dependencies | R4-04, R5-01.LOCAL |
| Original CR1 / audit | P6.2, P6.3 · A06, A09 |
| Source anchors to reverify | AdtechWorkspace.tsx; registry/corridor/bindings/compilers; scoped strategy release commands |

**Objective and engineering tasks:** Expose only verified Meta/Google controls with input schema, eligibility, compiler mapping, normalization, materiality and readback definition. Compose economics/intent/destination/creative independently. Release immutable program/corridor versions through CAS and checker. Resolve local-feeder conflicts and approved suppression without invented IDs or silent national widening.

**Acceptance:** Admin profile edits affect future revisions only. Staff operate within assigned scopes; host cannot alter protected provider settings. Unresolved exclusion fails closed. Native-only billing/verification/appeal steps are clearly external tasks.

**Validation:** CAS publish collision, author-checker conflict, destination/feeder overlap, invalid radius/coordinates, unsupported controls, late profile update, missing exclusion, accessible keyboard map alternative.

**Rollback / containment:** Repoint future drafts to a prior accepted release; retain historical bindings and do not mutate active approved revisions.

**Deliverable:** Capability-bounded Strategy Labs, program release and corridor evidence.

### R5-03 — Unify paused publication, exact readback and recovery

| Field | Contract |
|---|---|
| Owner / effort / priority | Provider/worker engineer + reviewer · L · P0 |
| Dependencies | R5-02, R2-01 |
| Original CR1 / audit | P6.2, P6.5, P8.3 local prerequisites · A07, A09 |
| Source anchors to reverify | MetaAdProvider/GoogleAdsProvider; worker jobs; normalized readback; recovery UI |

**Objective and engineering tasks:** Create supported resources paused through durable fenced commands. Compare exact provider/account/hierarchy/revision/assets/geo/bid/budget/attribution/schedule. Keep absent metrics/spend UNKNOWN. Reauthorize at execution. Reconcile timeouts/partial resources before retry; preserve remote IDs and emergency pause authority.

Consume R4-04 inventory/offer protection intents. Request the approved safety pause for sellout, host block or invalidated advertised facts, verify observed pause and track spend through confirmation. Cancellation/reopened inventory never auto-resumes: revalidate current inventory, immutable accepted facts, funding, account and revision before a separately authorized resume.

**Acceptance:** Wrong provider/account, activated child, changed targeting or unknown writes cannot appear verified. No blind duplicate create after lost response. Zero spend is observed separately from valid provider budget configuration.

**Validation:** Recorded fixture normalization plus restart-after-remote-write, partial create, stale fence, lost readback, 401/403/429, account restriction and pause-priority fault tests; authenticated canary reserved for R7-03.

Exercise concurrent booking/sellout, host block, material rate change, duplicated protection events, cancellation/reopen, worker restart and delayed/failed provider pause. Prove no lost protection intent, duplicate unsafe mutation or requested-pause-as-confirmed UI claim.

**Rollback / containment:** Stop new creates/activation; pause and reconcile known resources. Never delete history or rotate accounts to evade restrictions.

**Deliverable:** Exact readback/recovery contract and local provider failure receipt.

### R5-04 — Integrate Finance Desk/top-up and reaccept P6

| Field | Contract |
|---|---|
| Owner / effort / priority | Finance/payments + independent reviewer · XL · P0 |
| Dependencies | R3-02.LOCAL, R5-03 |
| Original CR1 / audit | P6.4, P6.5, P7.1 funding prerequisite · A10, A14, A15 |
| Source anchors to reverify | financeService/financeQuote/financeBridge/settlementService; Finance Desk; canonical top-up API |

**Objective and engineering tasks:** Specify accepted incremental quote, risk and allocation semantics; remove legacy refuel as a candidate backend. Require verified funds before provider budget mutation and exact readback before applied UI state. Align account/revision binding with spend authorization. Complete invoice/variance/refund/chargeback evidence and approved commercial policy. Run P6 full exit.

**Acceptance:** No forged rail, double click, concurrent withdrawal or response loss produces unfunded spend/duplicate debit. Journals balance and pending reconciliation retains obligations. COMM/legal unknowns stay gated.

**Validation:** Finance suites plus top-up conflict/capture replay/reservation/overspend/partial refund/provider rejection/unknown outcome; full P6 regression/type/lint/isolated build and scoped desk browser cases.

**Rollback / containment:** Disable top-up/new funding; continue capture/refund/settlement reconciliation for existing obligations.

**Deliverable:** Finance/top-up contract and P6 exit receipt.

### R6-01 — Deliver bounded one-click host setup

| Field | Contract |
|---|---|
| Owner / effort / priority | Host product/frontend + marketing backend · L · P1 |
| Dependencies | R4-04, R5-02, R5-04 |
| Original CR1 / audit | P7.1 · A06 |
| Source anchors to reverify | CampaignStudio.tsx; targeting defaults; canonical offer/program/creative APIs |

**Objective and engineering tasks:** Replace mandatory expert provider fields with owned subject, approved creative, guest intent, dates and accepted cost. Load server defaults from bound program. Add optional bounded locations/radius with accessible alternatives. Explain unavailable gates and risks without exposing account credentials or private coordinates.

**Acceptance:** A host can prepare a valid campaign without native ad expertise. Client changes cannot bypass program constraints. Submission clearly separates draft, AI review, staff approval, funding and observed delivery.

Surface server preflight facts and advisory portfolio overlap/budget fragmentation in plain language. Show approved hard financial exposure limits separately and enforce their funding/activation blocks. Explain unavailable inventory without inventing guaranteed returns or silently changing approved conflict authority.

**Validation:** Budget/comfort/premium mixed offers, discovery mode, missing evidence, defaults unavailable, city/radius bounds, stale revision, duplicate submission and mobile/keyboard usability.

**Rollback / containment:** Keep safe draft/read-only monitoring; do not expose raw provider controls to bypass missing defaults.

**Deliverable:** Host task-completion journey and bounded control contract.

### R6-02 — Complete four-flight monitoring and canonical outcome deduplication

| Field | Contract |
|---|---|
| Owner / effort / priority | Analytics/marketing backend + host frontend · L · P1 |
| Dependencies | R6-01, R4-01, R3-03 |
| Original CR1 / audit | P7.2 · A06, A15 |
| Source anchors to reverify | workspace/outcomes projections; observation engine; StudioShared; portfolio/detail and budget meter |

**Objective and engineering tasks:** Give each campaign independent desired/observed state, subject, provider, schedule, spend authorization, actual metrics window/freshness and canonical outcomes. Model calibration, stale, unavailable and corrected data separately. Deduplicate booking totals by canonical booking identity; keep attributed contribution distinct from causal lift.

Connect consented opaque attribution to canonical inquiry, booking/capture and fulfillment events. Separate visits, inquiries, provider-reported conversions, captured bookings and fulfilled stays. Any policy-approved browser/server conversion export uses the same stable event UUID and durable deduplication; valid attribution alone is not Purchase authority.

**Acceptance:** Four simultaneous flights remain distinguishable; one booking cannot become four bookings. Missing data never becomes zero/live. Top-up/paused/refund-pending states match receipts. Cross-host rollups leak nothing.

**Validation:** Four-flight fixture: progressing, review-pending, stale/unknown, paused/refund-pending; shared booking touchpoints, delayed correction, timezone/currency, pagination and hostile tenant access.

Include forged/expired attribution, withdrawn consent, late capture, duplicate browser/server event, cancelled/non-fulfilled booking and redirect-only/synthetic purchase rejection. A disabled export remains explicitly unavailable rather than silently dropping accepted conversion work.

**Rollback / containment:** Serve last valid scoped observations marked stale; disable unsupported metrics, never fabricate values.

**Deliverable:** Four-flight golden path and source-aware aggregate contract.

### R6-03 — Finish three-sided UX, inquiry alerts and accessibility

| Field | Contract |
|---|---|
| Owner / effort / priority | Design/frontend + accessibility QA · L · P1 |
| Dependencies | R3-04, R4-02, R6-02 |
| Original CR1 / audit | P3.6, P4.1, P5.5, P7.3 · A06, A15 |
| Source anchors to reverify | Guest listing/gallery/checkout/trip; Host inbox/campaign; Operations desks; shared tokens/status components |

**Objective and engineering tasks:** Unify status vocabulary and design tokens. Finish inquiry alerts linking to the correct canonical conversation. Explain disabled prerequisites and unknown outcomes. Validate 360px and desktop, keyboard/focus/screen-reader, contrast/zoom/reduced motion. Keep map controls usable without dragging and remove pressure/dark-pattern spend cues.

**Acceptance:** Guest, host and each scoped staff role complete their agreed journey with understandable errors and no hidden authority. No fake viewer count or fabricated notification delivery. Accessibility defects in critical journeys are closed.

**Validation:** Production-built browser journey matrix, slow/offline/account-switch flows, automated accessibility plus manual keyboard/screen-reader review and role-denial cases.

**Rollback / containment:** Reduce motion/visual complexity or disable incomplete actions; do not remove truthful state/error disclosures.

**Deliverable:** Three-surface browser/a11y/usability evidence and design-state inventory.

### R6-04 — Complete observability, operational capacity and recovery preparation

| Field | Contract |
|---|---|
| Owner / effort / priority | SRE/platform + domain operators · L · P0 |
| Dependencies | R5-04, R6-02, R4-02 |
| Original CR1 / audit | P1.2, P8.2 local preparation, P8.4 readiness · A15 |
| Source anchors to reverify | metrics/logs/traces; worker supervision; alerts; read projections; runbooks |

**Objective and engineering tasks:** Instrument command acceptance/claim/dispatch/observation, queue age, stale metrics, notification receipts, safety pause, exposure and journal drift. Define named workload/targets and measure indexed projections with seeded data. Prepare provider restriction, capture ambiguity, compromised staff, backlog, restore and support escalation drills.

**Acceptance:** Every alert has owner/runbook and actionable evidence; no secrets/message content leak. Safety work cannot starve behind optimization. Performance claims identify actual workload; proposed RPO/RTO remain unverified until drill.

**Validation:** Local fault/load/query-plan checks, redaction scan, queue fairness/backpressure, bounded shutdown and alert exercise using sinks; avoid real customer notifications.

**Rollback / containment:** Reduce admission/concurrency and stop new risky work while preserving safety/reconciliation lanes.

**Deliverable:** Operational dashboards, measured local capacity profile and drill runbooks.

### R7-01 — Freeze and independently verify the complete release artifact

| Field | Contract |
|---|---|
| Owner / effort / priority | Release lead + independent QA/security · L · P0 |
| Dependencies | R0-04, R2-04, R3-04, R4-02, R4-04, R5-04, R6-03, R6-04 |
| Original CR1 / audit | P8.2; P8 full software exit · A01–A15 |
| Source anchors to reverify | CI; build manifests; source/migration ownership; evidence validator; all critical journeys |

**Objective and engineering tasks:** Select exact candidate and resolve all affected-package reviews. Run final full regression/typecheck/lint/isolated client/server build, secret/dependency/public-artifact checks and three-sided browser security/a11y tests. Record coverage/exclusions accurately. Obtain independent review of all audit repairs and required product predicates.

**Acceptance:** No unresolved critical/high implementation defect or failed required local predicate; complete current package-to-evidence mapping; required checks pass with no hidden skips. Artifact/manifest hashes match reviewed source. Findings requiring R7-02–R7-04 external proof remain open at that evidence level and block release, not this prerequisite local exit. Local readiness is not mislabeled external readiness.

**Validation:** Complete final software sweep and negative evidence controls; rerun affected checks if candidate changes and propagate invalidation.

**Rollback / containment:** Reject promotion and return to named failing cards; retain the old passing/failing evidence separately.

**Deliverable:** Exact-artifact local/integrated release receipt and unresolved external gate list.

### R7-02 — Verify isolated staging and disaster recovery with actual roles

| Field | Contract |
|---|---|
| Owner / effort / priority | DBA/SRE + release reviewer · L · P0 |
| Dependencies | R7-01 |
| Original CR1 / audit | P0.4, P0.5, P8.1, P8.2 · A01, A11, A12 |
| Source anchors to reverify | Explicit deployment preflight/runbook; isolated branch; migration/grant manifests; deployed web/worker/client |

**Objective and engineering tasks:** Use named authorized isolated environment and dedicated secrets. Deploy exact artifact, verify source/packaged/applied migrations and actual app/worker/issuer logins. Execute three-role HTTP/browser journeys. Perform authorized backup restore/queue replay/rollback drill and measure agreed RPO/RTO. Do not reuse generic primary .env as staging.

**Acceptance:** Actual deployed identities/roles and observed drill results match receipts. Absent staging or credentials means BLOCKED_EXTERNAL, not certified. No test touches customer data without explicit applicable authorization.

**R7-02.STAGING subgate:** Accept the named isolated environment, actual roles, artifact and restoration evidence above. Map these predicates to ENV-01/DB-01; a STAGE-01 alias never erases either gate.

**R7-02.PROD subgate:** After STAGING acceptance, verify applicable authority for the exact production target. Perform read-only schema/grant/artifact/configuration preflight, execute reviewed additive migrations/grants if needed under existing migration authority, then verify actual restricted web/worker/issuer logins and web/worker/client artifact identity. Observe the predefined production shadow window with mutation gates and stop predicates. Shadow must not duplicate provider calls, payment creation, notifications or worker ownership. Capture rollback readiness and production-specific observations separately. Staging success does not clear PROD.

**Validation:** Authenticated read-only catalog/role checks; hostile RLS, deployed golden path, restore/replay and compatibility rollback under scoped synthetic cohort.

**Rollback / containment:** Disable new adoption; restore only compatible artifact/state through rehearsed plan and reconcile outstanding effects.

**Deliverable:** Authentic staging/readiness/restore evidence and independent disposition.

Attach separately reviewed STAGING and PROD receipts. The card is not externally complete until both applicable rollout subgates pass; retain partial states without inflating counts.

### R7-03 — Execute approved PAUSED provider canary

| Field | Contract |
|---|---|
| Owner / effort / priority | Provider operator + independent reviewer · M · P0 |
| Dependencies | R7-02.STAGING; R7-02.PROD for a production-target canary; R5-01.EXTERNAL; R5-03 |
| Original CR1 / audit | P8.3 · A01, A09 |
| Source anchors to reverify | Actual provider adapters/account bindings; approved canary runner; immutable revision and observation evidence |

**Objective and engineering tasks:** Confirm exact authorized property/offer, account, operator and limits. Create only paused resources through canonical workflow. Collect authenticated normalized readback across hierarchy and independent observed-spend/reporting window. Exercise safe containment and retain actual remote identifiers privately. Do not activate live spend.

**Acceptance:** Required identity/configuration/readback predicates pass against the correct provider/account/revision. Missing/delayed reporting remains unknown until evidence suffices. No handcrafted response or zero-budget assertion clears the gate.

Bind evidence to its deployment target. A staging-only canary cannot certify a different production artifact/configuration/account binding; repeat the required target-specific readback before production pilot acceptance.

**Validation:** Actual approved paused operations plus negative wrong-account/revision/missing-observation verification and containment receipts; no live-spend test implied.

**Rollback / containment:** Maintain PAUSED/quarantine and reconcile known resources; never recreate blindly or activate for convenience.

**Deliverable:** Authenticated provider canary receipt and exact limitations.

### R7-04 — Operate a bounded paid pilot and independently decide release

| Field | Contract |
|---|---|
| Owner / effort / priority | Founder/product + finance/provider/support operations + release reviewer · XL · P0 |
| Dependencies | R7-02.PROD, R7-03 with production-relevant evidence, R3-02.EXTERNAL, R5-01.EXTERNAL, R5-04, R6-04 |
| Original CR1 / audit | P8.4 and complete CR1 §18 · A01, A10, A15 |
| Source anchors to reverify | Approved pilot charter; gate registry; real cohort dashboards/journal/support records |

**Objective and engineering tasks:** Require authentic legal/commercial/provider/privacy clearance and explicit cohort/spend/loss/time/support approval. Operate live only within that authorization. Reconcile provider bills, captures/refunds, fulfilled outcomes, support/review effort and host feedback. Evaluate commercial evidence honestly; missing bookings or profitability is an outcome, not a successful simulation.

**Acceptance:** All CR1 §18 predicates have current authentic evidence and independent go/no-go. Any unmet condition remains blocked/incomplete. Expansion requires explicit decision; technical pilot success does not manufacture product-market fit.

Machine-check every applicable original gate ID: ENV-01, DB-01, LEGAL-01, PROV-G-01, PROV-M-01, COMM-01, IAM-01, OPS-01, PRIV-01 and PILOT-01, plus CANARY-01 and production deployment predicates. An aggregate seven-gate summary cannot hide unresolved workforce, support or privacy approval. The pilot must first have authorized entry criteria; PILOT-01 outcome acceptance follows observed execution, never precedes it as a fabricated clearance.

**Validation:** Real bounded observations, daily reconciliation, stop/incident escalation exercise, fulfillment/refund/support evidence and independent acceptance review.

**Rollback / containment:** Stop new activation/funding, request and verify provider pauses, service existing bookings/refunds, preserve evidence and communicate through approved operators.

**Deliverable:** Pilot outcome report and bounded release/hold decision; no automatic 10/10 certificate.

## Original 48-package coverage

This is a dependency/coverage mapping, not an acceptance claim. A card's acceptance only closes the original package criteria it actually proves.

| Original packages | Corrective cards |
|---|---|
| P0.1 | R0-03, R0-04 |
| P0.2 | R0-01, R2-03 |
| P0.3 | R0-02, R0-03 |
| P0.4 | R0-01, R1-01, R2-02, R7-02 |
| P0.5 | R0-02, R7-02 |
| P1.1, P1.2 | R2-03, R6-04 |
| P1.3 | R2-01, R2-04 |
| P1.4 | R1-03 |
| P1.5, P1.6 | R0-01, R2-03 |
| P1.7 | R0-04, R1-03, R2-01, R2-03 |
| P2.1, P2.2 | R1-01, R1-02, R2-04; retain and reverify original SQL policy evidence |
| P2.3, P2.4 | R1-01, R1-02 |
| P2.5, P2.6 | R1-02, R1-04 |
| P2.7 | R2-04 |
| P3.1, P3.2, P3.3 | R4-01 |
| P3.4, P3.5 | R4-02 |
| P3.6 | R1-03, R4-02, R6-03 |
| P4.1 | R3-01, R3-04, R6-03 |
| P4.2 | R3-01 |
| P4.3 | R3-02 |
| P4.4 | R3-03 |
| P4.5, P4.6 | R3-04 |
| P5.1 | R4-04 |
| P5.2 | R4-03 |
| P5.3, P5.4, P5.5 | R4-04, R6-03 |
| P6.1 | R5-01 |
| P6.2 | R5-02, R5-03 |
| P6.3 | R5-02 |
| P6.4 | R3-02, R5-04 |
| P6.5 | R5-03, R5-04 |
| P7.1 | R6-01 |
| P7.2 | R6-02 |
| P7.3 | R6-03 |
| P8.1 | R7-02 |
| P8.2 | R6-04, R7-01, R7-02 |
| P8.3 | R7-03 |
| P8.4 | R7-04 |

## Audit closure matrix

| Finding | Primary corrective cards | Required closure evidence |
|---|---|---|
| A01 Synthetic external clearance | R0-02, R0-04, R7-02–R7-04 | Fixture rejection + authenticated external observations/approval |
| A02 Owner issuer bypass | R1-01 | Production-flag and actual-role negative tests |
| A03 Workforce TLS/config | R1-01 | Explicit config, certificate validation, existing failures repaired |
| A04 Competing workforce authority | R1-02 | Mounted scoped commands, independent checker and real restricted roles |
| A05 Generic offline queue | R1-03 | Production service-worker upgrade/logout/account-switch evidence |
| A06 Disconnected product engines | R2-03, R3, R4, R5, R6 | Mounted three-sided vertical journeys |
| A07 Process-memory authority | R2-01, R5-03 | Multi-process/restart/unknown-outcome database proof |
| A08 SQL interpolation | R2-01, R2-03 | Parameterized SQL plus hostile input tests |
| A09 Incomplete readback | R5-01, R5-03, R7-03 | Exact account/provider/hierarchy/revision verification |
| A10 Tax/attestation | R3-02, R5-04 | Authentic approved policy and consistent calculations |
| A11 Schema checker/build coupling | R2-02 | Offline build and exact explicit-target preflight |
| A12 Snapshot/migration mismatch | R0-01, R2-02, R7-01 | Source/index/artifact/schema reconciliation |
| A13 Audit chain integrity | R1-04 | All-writer concurrency/coverage and immutable history tests |
| A14 Unsafe legacy refuel | R5-04 | Canonical incremental finance command + provider readback |
| A15 Overstated testing | R0-04, all exit cards | Exact-subject evidence, negative controls and independent review |

## Handoff record template

For each implementation batch provide:

1. Card and acceptance subcriteria addressed.
2. Baseline commit/tree and exact changed paths.
3. Existing authority preserved; why the change is necessary.
4. API/schema/UI/worker/security impacts and compatibility.
5. Tests executed with commands, exit codes and scoped results.
6. Failure injections and durable state assertions.
7. Evidence references, simulation labels and external unknowns.
8. Rollback/containment procedure and remaining risks.
9. Reviewer decision: ACCEPTED at a named evidence level, REJECTED with required corrections, or BLOCKED_EXTERNAL with missing input.
10. Original CR1 package predicates affected; no automatic package promotion.

## First implementation batch

Begin with R0-01/R0-02 and independently repair R1-01 after inspecting current files. The first technical receipt must reproduce and then repair the two Operations boundary regressions without weakening tests, prove owner-role rejection under production flags, and preserve existing user changes. Continue R1-03 in a disjoint frontend slice when file ownership is clear.

Do not begin by running the remote-capable build, applying guessed migrations, restoring every staged deletion or generating another certificate.
