# Maha — production certification and publishing contract

Updated: 2026-09-11. Status: acceptance plan adopted; release NOT approved. Category: Documentation / release planning. Active phase: Execution.

## Purpose and change impact

The blueprint defines features but does not yet provide release-specific, reproducible acceptance for every milestone. This contract closes that planning gap. It preserves the existing React/Vite, Express, Socket.IO, Postgres and worker architecture, all source changes, staged migrations and verified work. No application, database, API, UI, money, provider account or feature flag changes are made by adopting it. Rollback of this documentation change removes only this contract and its pointers, never earlier engineering evidence.

The six IDs refer to MAHA_BLUEPRINT.md, not the older six-step marketing playbook. This is internal engineering release acceptance, not an independent certification, a legal opinion or a guarantee of zero defects. Neither historical “Certified Green” labels nor a subjective 10/10 rating satisfies it.

## 1. Evidence and promotion rules

Every acceptance record must contain: gate ID; task dependencies; implementation status; acceptance status; source revision and dirty-diff digest if applicable; lockfile/build artifact digest; migration checksums; environment and non-secret flag manifest; actual command/scenario; timestamp; expected and observed results; sanitized artifact/log reference; reviewer; unresolved defects; rollback procedure and rehearsal evidence. Never copy tokens, customer PII or production database URLs into the record.

Statuses: todo → in_progress → implemented → verified_locally → verified_staging → release_approved → verified_production. blocked_external records the missing dependency separately from delivered work. Failed acceptance never advances. A relevant source, migration, configuration or provider-contract change invalidates affected acceptance and dependent gates, not unrelated verified work. A release candidate must be immutable and reproducible; uncommitted work must be preserved and captured deliberately before creating that candidate.

The engineer records reproducible evidence. The owner/Admin is the accountable release and operational-risk owner; initially one person may hold this role, with the limitation recorded. Domain specialists must supply applicable financial/legal/provider approvals. Routine tasks need no repeated permission; a gate without credentials, a named operator or an authorized bounded live transaction remains unresolved, not silently waived.

Full completion is six of six verified_production milestones for the documented full Maha scope. Report local, staging and production counts separately. Do not derive an overall implementation percentage from unequal milestone counts. A capability excluded from a pilot remains incomplete in full Maha.

## 2. Per-milestone acceptance matrix

All rows also require the cross-cutting gates in section 3. Current statuses below are the 2026-09-11 baseline, not new test results.

| Gate | Preserved implementation baseline | Required staging evidence | Required production acceptance |
| --- | --- | --- | --- |
| CERT-01 / MAHA-01 | Locally verified calendar mutation safety | Real application-role owner/Admin/outsider authorization; batch rollback and audit atomicity; concurrent calendar/checkout lock ordering; malformed and zero-stock input; post-commit failure visible and recoverable | Same reviewed schema/roles and artifact; controlled calendar change observed across Host/Admin/Guest; audit actor and failed-authorization checks verified without affecting customer bookings |
| CERT-02 / MAHA-02 | Property review/identity work partial | Complete 02D–F: draft resume/upload failure; stale/double approval; canonical/legacy room-media identity; archive/unpublish while preserving reservations/history; cache invalidation; price/content propagation to dependent campaigns; browser role/mobile acceptance | Approved controlled property version visible consistently; rejected drafts private; archived inventory unavailable for new sales; cache and media delivery verified; no unauthorized publication path |
| CERT-03 / MAHA-03 | Internal inventory, checkout and observation safeguards partial | Complete 03B–E: real schema and RLS; last-room races; full dated pricing or explicit blocking; lost/duplicate/reordered callbacks; unknown creation; late capture without stock; audited recovery; 72-hour local-time policy snapshot; refund timeout/retry/reconciliation; verified external mappings, freshness and reservation propagation | Bounded authorized booking/payment/refund reconciliation with exact integer amounts and one booking; provider-backed inventory propagation and outage behavior; no stranded unowned financial exception; all three roles see the persisted outcome |
| CERT-04 / MAHA-04 | Campaign safety foundations partial | Complete 04A–D: approved content/version wizard; AI rate limit and timeout/human fallback; below-threshold correction; explicit reviewer permissions/revocation; competing approvals and material edits; shared guards on every publish/resume entry point | Controlled proposal produces correct review evidence; unapproved, unfunded, escrow-held, stale-content or unknown-inventory proposal cannot deliver; actual actor/version and rejection notes visible |
| CERT-05 / MAHA-05 | Provider/money/CRM safety foundations partial | Complete 05A–F: current API/permission preflight; real Meta and Google Search create/control/reconcile/report flows; network-specific funding/fee/escrow ledger; durable retries/DLQ/restart; spend and price/inventory controls; genuine tenant-safe lead ingestion and notification receipt; asset and consent gates | Authorized, capped canary per network with observed status/spend/pause; wallet/fee/provider reconciliation; genuine lead and alert receipt with no PII leak; operational replay and price/availability stop observed; no mock or unsupported capability presented as live |
| CERT-06 / MAHA-06 | Local test/build evidence only | Isolated release candidate; migration and restore rehearsal; secure deployment/worker controls; full browser/security/accessibility/performance acceptance; alerts and runbooks exercised; all CERT-01–05 staging gates pass | Exact candidate deployed; health and role smoke checks; controlled capability rollout; evidence-backed observation window completed; restore/rollback readiness and named incident owner confirmed; all milestone production gates pass |

MAHA-05F creative experiments and retargeting retain their existing dependencies and remain separately gated; they must not delay proving core safety, nor be silently removed to claim full Maha complete. International Stripe funding remains unavailable until independently accepted; India-first launch does not certify international routing.

## 3. Cross-cutting publishing gates

### REL-ENV — reproducibility and isolation (MAHA-06A; start early)

- Pin a supported runtime and lockfile-based installation after compatibility inspection; build both frontend and server to a single identifiable release candidate. Review all pending/untracked changes; do not publish a working-directory accident.
- Use a Node-compatible staging service, isolated database, media storage/prefix, queue namespace and sandbox credentials. Preserve Express/Socket.IO/pg; static Vite output alone is not the application. Select the actual hosting account/region after access, WebSocket, worker, storage, cost and recovery validation; no provider account or billing readiness is currently established.
- Separate migration, web and worker startup. Disable seed/demo promotion and automatic production schema mutation. Verify readiness/liveness, graceful shutdown, connection pool limits, CORS/origins, TLS, WebSocket authorization and worker singleton/lease behavior.
- Browser/test startup must prove it targets disposable staging data before starting server.ts. Existing default test/dev startup is not presumed isolated; never run it with the configured production Neon URL to obtain acceptance.
- Default outbound provider operations off; allow only intended test destinations/accounts. Verify omitted secrets and missing migrations fail closed. No production data copied to staging without an explicit approved sanitization process.

### REL-DATA — migrations and recovery

- Inventory staged SQL, dependency order/checksums, actual production schema variants and application-role grants. Rehearse on a production-compatible sanitized fixture; inspect locks, timeouts, indexes and old room/booking history reconciliation.
- Separate application and migration privileges. Test tenant isolation under the actual non-owner application role and connection reuse; privileged server paths must be authorization- and query-scoped. A superuser fixture alone is insufficient.
- Restore a backup into an isolated environment and prove booking, payment, wallet and immutable audit consistency. Set and record business recovery objectives before rollout; initial planning targets are RPO ≤15 minutes and RTO ≤60 minutes, not achieved claims. External payment reconciliation must recover transactions after the restored point; database RPO is not permission to lose captured payments.
- Prefer additive expand/contract rollout. Never drop financial/audit tables or restore insecure legacy checkout as rollback. A backup restore is a controlled disaster-recovery action, not an automatic response to a code defect.

### REL-SEC — security and privacy

- Threat-model guest/host/Admin/API/worker boundaries. Verify server-enforced authorization, IDOR resistance, JWT/session lifecycle, privilege revocation, CSRF where cookie credentials apply, XSS, SQL injection, SSRF, file upload validation, rate limits, webhook signatures/replay and abuse controls.
- Scan dependencies and secrets; review historical credential exposure and prove rotation where required. Use stable managed PII encryption keys with a tested rotation/migration procedure, redacted logs and scoped storage access.
- Block release for unresolved critical/high security findings or any known tenant breach, approval bypass, duplicate charge, oversell or audit-loss defect regardless of severity label. Lower-risk exceptions require owner, mitigation, expiry and explicit acceptance; no blanket waiver of financial invariants.
- Verify consent and retention/deletion behavior, administrative access logging, customer-safe communications and contact-safe notifications. Obtain applicable policy/tax/payment terms review; code cannot provide that sign-off.

### REL-UX — complete journeys, not isolated screenshots

- Automated browser journeys for guest discovery → approved property → quote → payment → confirmation → cancellation/refund; Host draft → review → inventory → campaign → inbox/finance; Admin review → conflict → recovery → audit.
- Exercise authentication changes, stale tabs, slow/offline networks, upload failures, provider errors, duplicate clicks and denied permissions. Include keyboard-only operation, focus/error announcements, screen-reader sampling, 200% text zoom and reduced motion.
- Test representative mobile and desktop layouts and supported browser engines. Preserve approved ListingDetailsNew/gallery direction. Record accessibility issues and remedies; labels alone are not an accessibility certification.

### REL-PERF — measured launch capacity

- Keep blueprint web targets: p75 LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 on critical journeys. Record device/network, dataset, sample count, cold/warm cache and measurement method. Pre-release lab interaction checks are provisional; field p75 remains unverified until sufficient real observations exist.
- Establish a declared launch workload before load testing. Initial application-owned API target: p95 ≤500 ms for ordinary reads at that workload; third-party latency measured separately. Exercise twice the declared steady workload for 30 minutes with <1% unexpected application errors and zero financial/inventory invariant failures. These are proposed acceptance budgets, not current capacity claims.
- Measure DB plans/pool pressure, media loading, queue lag and dashboard rollups on representative data. Report provider freshness separately from UI render speed. Never claim sub-200 ms or real-time reporting from bundle size alone.

### REL-OPS — observability and rollback

- Route structured, redacted correlation/operation IDs through request, job, provider reference and audit. Dashboards/alerts must cover payment mismatches, unresolved holds, refund failures, stale inventory, dispatch failures, DLQ/oldest job age, unauthorized spend and provider status drift.
- Name primary and backup responders; test actual alert receipt and recovery instructions. If staffing cannot support continuous operation, restrict pilot hours/capabilities explicitly.
- Rehearse stop-admissions/disable-dispatch and application rollback. Keep signed webhook intake, payment/refund reconciliation and audit functioning for in-flight work. A disabled create flag must not strand captured payments.
- Pausing dispatch locally does not pause already-running network ads: verify provider-observed pause; if the API fails, escalate through the provider's emergency controls and retain incident evidence. Automatic resume stays disabled until its separate eligibility and manual-pause tests pass.

## 4. Dependency-ordered execution queue

| Order / task | Dependency | Concrete deliverable and completion check | Initial status |
| --- | --- | --- | --- |
| 1 / MAHA-03D-DETAIL | Existing durable observations | Admin scoped detail API/UI shows persisted observations and event history, no secret/contact leakage or implied financial resolution; route, UI and actual PG tests | verified_locally 2026-09-11; staging/browser acceptance open |
| 2 / MAHA-03D-RESOLVE | DETAIL plus explicit transition policy | Audited idempotent reconciliation with exact stored provider binding and locked inventory revalidation; unknown creation and late-capture conflict retain recoverable evidence; concurrency and outage tests | in_progress; current fulfillment prerequisite verified locally, resolution transition still todo |
| 3 / MAHA-03D-WEBHOOK | Shared reconciliation boundary | Signed durable event ingestion, replay/out-of-order handling and browser-independent recovery; no duplicate booking or unsafe release | todo |
| 4 / MAHA-03E | Shared recovery + stored cancellation contract | Local-time 72-hour policy, component refund arithmetic and durable refund lifecycle across Guest/Host/Admin; gateway retries and refund reconciliation | todo |
| Enabling / MAHA-06A-ISOLATE | No dependency on provider feature completion | Safe isolated server/browser harness, reproducible artifact, migration inventory and environment separation under REL-ENV; then provision staging when access is available | in_progress; local PG runner verified, full app/browser/staging isolation open |
| External / MAHA-03C-CONNECT | Verified provider access and direction | Configure trusted registry/worker; genuine room/stock observation and reservation/cancellation propagation; stale feed/revocation/ownership transfer acceptance | blocked_external for real access; local foundations preserved |
| 5 / MAHA-02D–F and CERT-01 | Inventory/recovery contracts for archive effects | Archive/cache/media/browser gaps closed; promote property and mutation acceptance on staging | todo acceptance; existing implementation retained |
| 6 / MAHA-04A–D | Approved property and stay/inventory contracts | End-to-end builder/AI/reviewer/version controls with every dispatch path tested | partial implementation; acceptance todo |
| 7 / MAHA-05A–F | Moderation, inventory, money and actual provider access | Per-network operations/ledger/CRM/asset acceptance; safe paused canaries before any bounded spending | partial implementation; external canaries blocked |
| 8 / MAHA-06B–F | All required staging gates | Restore, security, browser, load, failure drills, release decision and controlled rollout | todo |

For each code slice inspect source/schema/API/state machines first, record the impact and rollback, implement only that scope, verify, then update RESUME.md. If an external dependency blocks one branch, continue the next independent safe task and retain the blocker. Do not declare the blocked milestone complete or implement a fake integration.

## 5. Publication sequence and hard stops

1. **Candidate freeze:** all launch-scope implementation and staging gates pass; artifact/migration/flag manifest fixed, defects reviewed, recovery owners named. Record the release account, domain, database identity and provider account identifiers without secrets.
2. **Dark deployment:** back up and execute rehearsed migrations; deploy the exact artifact with new sales/ad dispatch disabled. Validate health, TLS/origins, tenant roles, audit and recovery. Existing insecure booking routes are never re-enabled.
3. **Controlled canaries:** approved accounts/properties only. Document the exact live payment/refund test amount, per-network spend cap, duration, kill switch and operator before enabling any real transaction. Paused network creation precedes active delivery. No invented “safe” monetary allowance.
4. **Restricted pilot:** expand only accepted capabilities, with declared host/room limits and observation coverage. Minimum internal planning window: 48 hours covering at least one complete payment/refund and provider control/reporting cycle, extended for provider settlement delays or sparse traffic. Time alone is not evidence.
5. **Public promotion:** require zero unexplained payment/ledger discrepancies, unresolved canary data-loss/oversell defects or failed hard gates. Record observed metrics, limitations, responder coverage and owner release decision. Field performance without adequate samples remains explicitly provisional.
6. **Production acceptance:** certify each milestone only after its production evidence is attached. Full Maha requires all six; a smaller pilot is not 100% completion. Reopen affected gates on drift, incidents or relevant changes.

Stop expansion immediately for tenant leakage, duplicate charge/booking, oversell, unapproved spend, missing audit, lost provider events or unsafe rollback. Stop new affected operations, preserve records and provider references, reconcile in-flight outcomes and alert the incident owner. Do not delete evidence or blindly retry.

## 6. Baseline evidence and unresolved dependencies

Recorded before this documentation change: 267 ordinary isolated tests passed; 33 opt-in PostgreSQL tests skipped in that run and passed separately as 23 inventory plus 10 checkout tests. Frontend/server build, TypeScript and scoped lint passed. These were not rerun for this document and do not establish full repository lint, production-schema compatibility, browser acceptance or a live provider canary.

All six staging/production acceptance records remain open. MAHA-01 alone is locally verified as a milestone. Checkout/recovery/provider-observation/inventory/scope flags remain off. No production migration, Neon write, payment/advertising operation or deployment occurred.

Open external dependencies: actual staging/deployment account and isolated resources; Channex integration direction/access and host mappings; verified Meta/Google/Razorpay permissions and canaries; Stripe access for international scope; notification delivery credentials; applicable financial/privacy/legal acceptance; bounded live-canary authorization and operating coverage. Owner-reported readiness is not verified access. Request secure setup only when the corresponding executable task needs it; never request secrets in chat.
