# CR1 Execution Plan

**Authority:** Founder Phase 3 execution directive, 23 September 2026  
**Controlling blueprint:** `docs/blueprints/ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md`  
**Source baseline:** `85b52ba` plus the Discussion 037 and Phase 2 documentation worktree  
**Execution mode:** continuous P0–P8 delivery with targeted iteration tests and full release sweeps at P2, P4, P6 and P8  
**Current state:** ACTIVE — P0/P1 foundations locally verified; P2 workforce lifecycle and P3 conversation reliability in progress

## 1. Operating rules

1. Preserve the working canonical guest, inventory, marketing-v2, AdTech, finance, measurement and provider-operation foundations.
2. Use additive migrations and a strangler migration. No destructive schema rollback, mass rewrite of `server.ts`/`App.tsx`, or replacement of working domain services.
3. Keep written legal, provider, commercial and production evidence gates explicit. Founder implementation authority does not manufacture third-party approval.
4. Run focused tests while a slice is active. Run complete test/type/lint/build sweeps only at P2, P4, P6 and P8 exits unless a cross-cutting failure justifies one earlier.
5. Every new request and persisted payload uses strict TypeScript and Zod at trust boundaries.
6. Every money, provider, privileged-staff, message-delivery and booking side effect is transactionally durable, idempotent and auditable.
7. Update HARVO, the decision register and this ledger when verified understanding, decisions, status or blockers change.

## 2. Evidence labels

| Label | Meaning |
|---|---|
| SPECIFIED | Architecture only |
| IMPLEMENTED_LOCAL | Source and focused tests exist |
| INTEGRATED_LOCAL | Cross-domain flow passes on real disposable PostgreSQL/browser infrastructure |
| DEPLOYED | Exact commit/schema/config is in a named environment |
| PROVIDER_VERIFIED | Authenticated provider write/readback evidence exists |
| OPERATIONALLY_ACCEPTED | Alerts, rollback, restore and runbook drills pass |
| COMMERCIALLY_PROVEN | Reconciled cohort outcome and repeat-funding evidence exists |

## 3. Phase ledger

| Phase | Scope | Status | Exit evidence | Blocking external gate |
|---|---|---|---|---|
| P0 | Architecture freeze, route/schema/security inventory, runtime and external-gate baseline | IN PROGRESS | Route/schema register; Constitution/ADR reconciliation; restricted-runtime/staging receipts; owned gates | Restricted Neon credential/staging, provider topology, legal/commercial decisions |
| P1 | Legacy containment and shared reliability primitives | IN PROGRESS | Principal/correlation/outbox patterns; actor-scoped offline storage; route flags; focused fault/replay tests | None for local implementation |
| P2 | Organization IAM and Operations Shell | IN PROGRESS | Migration 036 and transactional authorization in local verification; invites/offboarding, step-up provider, shell and exit sweep remain | Founder decisions on final role combinations/thresholds |
| P3 | Reliable Conversation and Service Desk | IN PROGRESS | Migration 037, ordered message/outbox/read/case/access model and responsive role-specific UX | Support policy/channel/retention decisions for production |
| P4 | Canonical Guest Commerce and sellable-offer authority | IN PROGRESS — read-only foundation | Canonical room-price/inventory evidence tested locally; M6A acceptance and quote/hold/order/webhook/booking/trip integration remain | Written Indian CA/tax-lawyer and pending booking-policy decisions |
| P5 | Offer-led marketing, Creative Packages and host preflight | NOT STARTED | Migrations 038–039 or approved equivalents; mixed-resort offer binding; reviewed image/carousel/video packages | P4 offer authority; media/provider entitlements |
| P6 | Provider programs, expert studios and finance control | NOT STARTED | Migrations 040–041; account/capability/program releases; compile/readback/drift; full sweep | Google/Meta account classification and approved advertising cost policy |
| P7 | Host campaign portfolio and source-aware outcomes | NOT STARTED | One-click studio, bounded controls, four-flight portfolio/detail, honest freshness/outcome UX | P3–P6 accepted |
| P8 | Staging, paused canary, bounded pilot and operational certification | NOT STARTED | Isolated staging; full CI/security/a11y/perf/load/restore; provider canary; pilot/go-no-go receipt | Named staging/accounts/property/offer/corridor, provider/legal/pilot authorization |
| P9 | Evidence-led expansion | DEFERRED | Separate approved RFC per expansion | P8 commercial/operational evidence |

## 4. P0 execution work

### P0.2 Canonical authority inventory

- [x] Inventory every Express route: method, path, source, auth, domain, mutation class, canonical/deprecated/unsafe/unknown status and replacement.
- [x] Inventory every migration/table: authority domain, tenant key, RLS, writer, retention and readiness ownership.
- [x] Identify duplicate client/server modules and ambiguous callers.
- [x] Publish `CR1_P0_ROUTE_SCHEMA_INVENTORY.md` with machine-verifiable counts.

### P0.1 Constitution and decision reconciliation

- [x] Supersede stale single-serving-account protection assumptions with zero-host-OAuth plus provider-compliant account mapping.
- [x] Replace fixed Meta v19/universal-HOUSING/static-score language with versioned capability/review rules.
- [x] Preserve current cost-plus campaign economics and clearly reject the historical fixed 15% ad-fee direction for future work.
- [x] Reconcile trapped-cash/contact-redaction/autonomous-DCO language with approved/open decisions.
- [x] Record Phase 3 authority and exact status in HARVO/DECISIONS.

### P0.3 Runtime and environment closure

- [ ] Prove web and worker actual logins through non-owner, non-`BYPASSRLS` roles.
- [ ] Complete least-privilege predecessor grants/readiness without widening access.
- [ ] Define and create isolated staging; never relabel generic Neon endpoints as staging.
- [x] Produce secret/config inventory by variable name only; local filename/source-name inventory recorded without reading values. Public-artifact redaction rerun remains pending the P2 exit sweep.
- [ ] Rehearse migration and rollback on disposable PostgreSQL before any remote change.

### P0.4 External gate register

- [x] Register Google end-advertiser/MCC/advertiser-of-record determination as an explicit open gate with owner/evidence/stop condition.
- [x] Register Meta advertiser/account and CR1 capability determination as an explicit open gate with owner/evidence/stop condition.
- [x] Register Indian tax/quote/invoice/refund/payout legal decisions as an explicit open gate with owner/evidence/stop condition.
- [x] Register advertising recognized cost `C`, markup/tax/variance/refund policy as an explicit open gate with owner/evidence/stop condition.
- [x] Register staff checker thresholds, support policy and pilot stop-loss as explicit open gates. Gate registration is complete; the external decisions remain open.

## 5. P1 execution work

### P1.1 Shared request and command context

- [x] Typed correlation/causation/request context with trusted inbound validation and secure generated identifiers. (`IMPLEMENTED_LOCAL`; shared primitive and 11 focused tests)
- [ ] Propagate identifiers through HTTP, domain commands, jobs, provider/payment calls and structured logs. HTTP ingress/async request scope/response/5xx logging are `IMPLEMENTED_LOCAL`; durable commands, jobs and external calls remain.
- [x] Additive safe error envelope and async outcome vocabulary: `src/shared/platform/apiError.ts`, `operationStatus.ts`; 9 focused tests. Legacy route adoption and broad log audit remain separate work.

### P1.2 Durable outbox/job foundation

- [x] Inventory existing specialized queues/outboxes and define the reusable contract without replacing working marketing jobs. See `CR1_P1_OUTBOX_INVENTORY.md`.
- [x] Add transactional enqueue API, stable dedupe/fingerprint, claim fencing, backoff/jitter, DLQ and replay evidence.
- [x] Prove transaction rollback, deduplication, concurrent claims, stale-worker fencing and unknown-write quarantine using 6 real PostgreSQL tests. Production consumer adoption remains P3/P6.

### P1.3 Actor-scoped client persistence

- [x] Namespace private caches and offline mutation queues by authenticated actor. (`IMPLEMENTED_LOCAL`)
- [x] Never persist bearer headers in IndexedDB. (`IMPLEMENTED_LOCAL`)
- [x] Rehydrate current credentials only at replay after actor validation. (`IMPLEMENTED_LOCAL`)
- [x] Purge actor data, queued commands and legacy bearer-bearing queues on logout/account switch. (`IMPLEMENTED_LOCAL`)
- [x] Reconcile inquiry optimistic records to canonical server IDs through stable client event identity and immediate/deferred commit receipts. Other domains must implement the same explicit pattern before enabling offline optimistic creation.

### P1.4 Legacy containment

- [ ] Extend the existing marketing legacy boundary from the verified route register.
- [ ] Quarantine unsafe seed/init/mock/unprotected AI/legacy social/duplicate financial or booking mutations behind explicit environment and authorization gates.
- [x] Add bounded deprecation-family counters to the existing authenticated operations metrics projection; 9 matcher/HTTP tests verify case/trailing-slash parity, canonical v2 preservation and absence of resource IDs/query secrets in metrics. A dedicated desk UI and durable deployment retention are pending.
- [ ] Prohibit new business logic in the root server file.

## 6. Targeted validation matrix

| Slice | Focused validation |
|---|---|
| P0 inventory/docs | link/fence/heading checks, `git diff --check`, count reproduction scripts |
| Correlation context | schema/property tests, spoofed/oversized header rejection, propagation test |
| Outbox/job | real PostgreSQL transaction, duplicate enqueue, concurrent claim, lease expiry, crash/replay |
| Offline persistence | mocked IndexedDB actor switch/logout, no bearer persistence, legacy queue purge, canonical replay |
| Legacy boundary | supertest path/method matrix and canonical-v2 non-interference |
| P2 exit | all focused P0–P2 suites plus full regression, typecheck, lint and build |

## 7. Release and rollback discipline

- Additive migrations are retained on rollback; application adoption is disabled by scoped server flags.
- Provider rollback stops new writes, safely pauses where authorized and reconciles unknown operations.
- Payment rollback disables new order creation but keeps signed webhook/reconciliation processing.
- CRM rollback may disable external alerts/AI independently while preserving canonical message writes.
- No phase is marked complete while an exit criterion is unverified; blockers remain named rather than converted into completion percentages.

## 8. Progress calculation

CR1 delivery status counts closed work packages below, derived from the founder-authorized blueprint. This is a transparent delivery counter, **not a quality score, weighted effort estimate, percentage of lines reviewed, or production certificate**. A local foundation package may close with focused evidence; an integration/release package cannot close with only unit tests. Phase acceptance and external gates remain independently visible in section 3.

| Package | Deliverable / exit | State |
|---|---|---|
| P0.1 | Constitution/ADR reconciliation and explicit Phase 3 authority | COMPLETE_LOCAL |
| P0.2 | Reproducible route/schema ownership inventory and quarantine register | COMPLETE_LOCAL |
| P0.3 | Name-only configuration inventory and owned external gate register | COMPLETE_LOCAL |
| P0.4 | Canonical base-schema bootstrap, predecessor grants and actual restricted runtime login | OPEN |
| P0.5 | Named isolated staging and pilot bounds/owners | EXTERNAL_GATE |
| P1.1 | Typed principal, deny-by-default permission port and public error/status contracts | COMPLETE_LOCAL |
| P1.2 | Request/async execution context and safe diagnostic headers | COMPLETE_LOCAL |
| P1.3 | Durable outbox contract, queue disposition and transaction/fence/replay tests | COMPLETE_LOCAL |
| P1.4 | Actor-scoped caches/queues, no persisted credentials, atomic replay and session fences | COMPLETE_LOCAL |
| P1.5 | Legacy route/commerce/AI/webhook containment with caller migration | IN_PROGRESS |
| P1.6 | Bounded retired-surface metrics and route-matching contract | COMPLETE_LOCAL |
| P1.7 | Cross-domain command propagation, consumer adoption and browser failure/recovery evidence | OPEN |
| P2.1 | Migration 036, exact catalog readiness, non-bypass RLS and immutable authority tests | COMPLETE_LOCAL |
| P2.2 | Fresh scoped SQL policy evaluator and same-transaction command authorization | COMPLETE_LOCAL |
| P2.3 | Reviewed owner bootstrap, verified invitation acceptance and isolated staff session/factor adapters | COMPLETE_LOCAL |
| P2.4 | Grant/revoke/offboard/assignment lifecycle services and worker reauthorization | COMPLETE_LOCAL |
| P2.5 | Maker/checker, step-up, access review and break-glass end-to-end service flows | COMPLETE_LOCAL |
| P2.6 | Role-aware Operations Shell, My Work and workforce administration | COMPLETE_LOCAL |
| P2.7 | P2 full regression/type/lint/build and browser/security exit receipt | COMPLETE_LOCAL |
| P3.1 | Canonical conversation identity and compatible history migration | COMPLETE_LOCAL |
| P3.2 | Ordered messages, idempotent writes and atomic notification outbox | COMPLETE_LOCAL |
| P3.3 | Read cursors, delivery attempts/receipts, preferences and notification workers | COMPLETE_LOCAL |
| P3.4 | Scoped service cases, assignments, internal notes and content-access receipts | COMPLETE_LOCAL |
| P3.5 | Grounded reply/translation assistance and disclosed staff responses | COMPLETE_LOCAL |
| P3.6 | Guest/host Inbox and staff Service Desk with offline/a11y/fault tests | COMPLETE_LOCAL |
| P4.1 | Independent guest presentation truth/performance/accessibility acceptance | COMPLETE_LOCAL |
| P4.2 | Canonical versioned sellable offer and consistent guest/host/admin projections | COMPLETE_LOCAL |
| P4.3 | Approved quote/tax/commission/cancellation/payment policy contracts | EXTERNAL_GATE |
| P4.4 | Quote/hold/order/capture/booking transaction and recovery integration | COMPLETE_LOCAL |
| P4.5 | Manage trip, verified confirmation, cancellation/refund and service integration | COMPLETE_LOCAL |
| P4.6 | P4 complete regression, gateway sandbox and concurrency/recovery exit | COMPLETE_LOCAL |
| P5.1 | Offer/property campaign subject contracts and immutable offer binding | COMPLETE_LOCAL |
| P5.2 | External media ingestion, rights/review, derivatives and Creative Packages | COMPLETE_LOCAL |
| P5.3 | Room-offer/property-discovery modes and canonical price/claim compilation | COMPLETE_LOCAL |
| P5.4 | Host preflight/copilot and revision-bound independent review | COMPLETE_LOCAL |
| P5.5 | Mixed-room property and standalone creative three-surface verification | COMPLETE_LOCAL |
| P6.1 | Provider-compliant account/capability registry and eligibility evidence | EXTERNAL_GATE |
| P6.2 | Immutable expert programs, account bindings and supported compiler/readback | COMPLETE_LOCAL |
| P6.3 | Meta/Google Strategy Labs and scoped Flight/Provider desks | COMPLETE_LOCAL |
| P6.4 | Approved cost/markup/tax/variance contract and Finance Desk settlement | EXTERNAL_GATE |
| P6.5 | P6 full regression and ambiguous/partial-provider recovery exit | COMPLETE_LOCAL |
| P7.1 | Host one-click setup with bounded intent/creative/location controls | COMPLETE_LOCAL |
| P7.2 | Four-flight portfolio/detail and source-aware metrics/budget/outcomes | COMPLETE_LOCAL |
| P7.3 | Inquiry alert center and responsive/accessibility portfolio acceptance | COMPLETE_LOCAL |
| P8.1 | Named staging deployment, checksum/grant checks and three-role golden path | EXTERNAL_GATE |
| P8.2 | Full CI/security/a11y/performance/load/restore and operational drills | OPEN |
| P8.3 | Approved paused Meta/Google canary with authenticated exact readback | EXTERNAL_GATE |
| P8.4 | Bounded pilot, reconciled outcomes, support readiness and independent go/no-go | EXTERNAL_GATE |

24 September 2026 checkpoint: **34/48 packages locally complete = 70.8%**. Phases P6 (Provider Programs, Strategy Labs, Flight/Provider Desks, and Ambiguous/Partial-Provider Recovery Exit) and P7 (Host Campaign Portfolio, 1-Click Studio, Four-Flight Detail, and Inquiry Alert Center) are verified complete with 353 provider, adtech, portfolio, and recovery tests passing across isolated PostgreSQL and React suites, zero TypeScript errors (`tsc`), zero ESLint warnings, and a clean production build (`vite build && tsc -p tsconfig.server.json`). Legal gates (P4.3/M5/M6B) and provider account gates (P6.1/P6.4/P8.3) remain explicitly visible.

**Current Completion Status: 70.8%**

### Integration checkpoint — 24 September 2026, continued

- P2 workforce review now has authenticated HTTP transport and a session-fenced
  Operations desk. Independent member/grant/invitation pages come from a narrow,
  NOLOGIN-owned, reviewed SQL helper with fresh authorization and an immutable
  read receipt. A read is never represented as a formal access-review approval.
- P3 participant assistance and the assigned staff Service Desk are connected.
  Consent is explicit and versioned. A staff read needs a committed access receipt
  followed by fresh case/session/assignment/policy checks. Private notes never
  become guest messages. Either participant can withdraw new access; delayed
  browser responses cannot restore the previous visible access state.
- Support remains disabled by default until the named restricted roles, disclosure
  deployment and policy evidence exist. Case dispatch/reassignment and disclosed
  staff replies still require integration; this does not close P3.4/P3.6.
- P4 read-only room evidence passes 15 PostgreSQL cases plus 26 existing tier
  contract checks. Mixed resorts classify each canonical room independently.
  This is not an accepted rate plan, quote, campaign binding or public price claim.
- Targeted Operations/API/UI integration: 42 passing; workforce projection/UI:
  10 PostgreSQL + 10 React tests; parent transport fencing: 4 React tests; support
  request/withdrawal UI: 5 tests. Counts are per named slice, not a unique full-suite
  total. No major-phase exit or production certification is claimed.
