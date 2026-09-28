# Copy-ready Antygravity engineering handoff

The block below is the instruction to paste into the Antygravity 2.0 engineering workspace. It refers to the **shared local checkout** at `/Users/ajit/Documents/EnchoSpaceNew`. It is an instruction to perform authorized local engineering, not a representation that any external gate has cleared. Keep the report from Antygravity and return it to Codex for independent source/diff review. Do not paste passwords, `.env` values or provider tokens into its report.

~~~text
MISSION: ANTYGRAVITY — ENCHO HOST/ADMIN OPERATING PLATFORM

You are the implementation engineering team in a shared checkout at /Users/ajit/Documents/EnchoSpaceNew. Founder has authorized dependency-ready local CR1 remediation and implementation. Build the connected, release-verifiable Host/Admin managed-marketing operation; do not generate a “10/10” certificate or a parallel demo platform. Codex will audit your code, Git diff and evidence after your handoff. You cannot act as your own independent release approver.

READ IN THIS ORDER BEFORE CODING:
1. AGENTS.md and docs/ENCHO_ENGINEERING_CONSTITUTION.md.
2. HARVO.md (especially current §§54–55 and corrective qualifications) and docs/harvo/DECISIONS.md (RMD-001–004 and controlling domain decisions).
3. docs/harvo/BOARDROOM_DISCUSSION_038_HOST_ADMIN_REALITY.md.
4. docs/blueprints/ANTYGRAVITY_HOST_ADMIN_MISSION_BLUEPRINT.md.
5. docs/blueprints/ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md and docs/implementation/CR1_EXECUTION_PLAN.md.
6. docs/audits/CR1_ENGINEERING_QUALITY_AUDIT_2026_09_28.md; docs/audits/ENCHO_PRODUCT_AND_RELEASE_REALITY_REVIEW_2026_09_29.md.
7. docs/blueprints/CR1_ENGINEERING_REMEDIATION_BLUEPRINT.md; docs/implementation/CR1_REMEDIATION_WORK_PACKAGES.md; docs/implementation/CR1_REMEDIATION_EXECUTION.md; docs/implementation/CR1_PACKAGE_REACCEPTANCE_REGISTER.md.

STARTUP / SHARED-WORKSPACE SAFETY:
- Run git status --short, git rev-parse HEAD, git write-tree (read-only identity; do not stage), and capture scoped staged/unstaged diff summaries. Current HEAD was last observed as 0e4c6fe, but reverify; a large mixed worktree already exists. Do not reset, restore, rebase, bulk-stage, overwrite or delete someone else's changes. No force push. Do not operate on .env secrets except where specifically authorized by a currently applicable, bounded instruction. Previous read-only Neon history inspection did not authorize migration apply.
- Identify the current first dependency-ready corrective card and exactly which existing module it reuses. Do not repeat already reviewed work merely to make a new commit. Claim file ownership before parallel engineering; serialize edits to server.ts, HARVO.md, DECISIONS.md, migrations and package manifests.
- The historical 48/48 CR1 completion claim is disputed. The last corrective record had 0/32 full-card acceptance and 0/48 independent reacceptance. Preserve history. No invented replacement percentage.

ENGINEERING ORDER:
A. Finish/review R0–R2 foundation using current execution records, especially source/index/deployed schema identity, evidence quarantine, workforce IAM, actor-scoped offline replay, durable commands, explicit target preflight and P2 exit. Original applied SQL 041–047 is missing from current source; 047 original is unrecovered and 045 differs from remote history. Do not allocate a new migration number, alter applied bytes, patch checksums or call the migration runner until identity is reconciled and exact apply authority exists. Keep build offline and credential-free.
B. Implement R3-01 canonical sellable offer across Guest view, Host editor and Admin moderation. Use existing room/inventory authority. Separate observed price, immutable offer, dated quote, hold, capture and booking. A mixed-price resort is tiered by selected sellable room offer; a property “from” ad is a separately labeled discovery subject. Material edits invalidate old approval/campaign facts. Continue R3-02–04 only to approved local contracts; do not remove guest checkout compliance gate without authentic written financial/legal approval.
C. Finish R4-01/02 canonical inbox, durable notifications, scoped Service Desk and grounded AI assistance. A socket event is not channel delivery, and delivery is not read. Staff identity/revocation must fence every protected effect. Continue R4-03/04 reviewed creative packages (including host-originated video only if rights, immutable bytes and adapter support are proven) and exact offer/creative/program campaign binding.
D. Finish R5-01–04 account/capability authority, expert program controls, provider-resolved geography, paused-first publication/readback/reconciliation and canonical finance. Hosts do not get direct raw provider controls; AI makes proposals, never approvals. Provider account topology and advertiser-of-record must remain UNKNOWN until current applicable provider evidence. Do not send paid traffic or assume a universal serving account. Keep organic brand publishing and paid pools separately gated.
E. Finish R6-01–04: simple Host default flow; per-flight and deduplicated four-campaign portfolio; exception-led Admin/Staff desk; accessible responsive UI; observability, support operations and recovery runbook. Exercise one truthful offer→approved creative→revision→quote→paused provider fixture/readback→inquiry/outcome local vertical slice, then second provider and concurrent flights. Local adapter fixtures are simulations, never a live canary.
F. R7-01 freezes and independently verifies the software candidate. R7-02 staging/production identity, R7-03 genuine paused provider canary and R7-04 bounded paid pilot are distinct external gates. Do not self-certify them, invent legal/account/staff signatures, or perform live spend without exact current authorization and safeguards.

NONNEGOTIABLE CONTRACTS:
- Preserve canonical financeService, durableOutbox, conversation authority, room/inventory authority, IAM commands, existing marketing v2/adtech bindings and migration runner. Add adapters/strangler slices; do not wholesale rewrite server.ts or produce another wallet/outbox/review engine.
- Every new trust boundary is typed and Zod-validated; SQL parameterized; one held connection per transaction; external calls outside long DB transactions; audit/outbox/domain changes atomic where required. Account/tenant/workforce authority default-deny and test with actual non-BYPASSRLS LOGIN roles.
- Idempotency is durable across processes. Test restart, replay, stale lease/fence, revocation and unknown COMMIT. A possibly successful provider write must be read/reconciled before retry.
- Host consent and approval bind exact offer, creative, strategy, quote and revision. No caller-supplied price, provider approval or identity. Missing provider spend/report/readiness = UNKNOWN, never zero. Requested pause/activation != observed provider state.
- Host guest-fit labels (couples, families, friends, workation) are intents; don't translate them into unsupported or discriminatory provider demographics. Geographic exclusions must be provider-resolved and evidence-bound; no invented geo IDs or national fallback. Show unsupported controls as blockers, not silent omission.
- Any added listing/room/media field must be represented in Guest view, Host create/edit and Admin review. Material change invalidates dependent campaign approval. Guest checkout remains gated until legal/commercial acceptance, and no unauthenticated provider/guest/finance data leaks through Host projection.
- The host sees individual campaign states/metrics and deduplicated portfolio outcomes with source/freshness. Do not call provider telemetry real-time when it is delayed. No fake scarcity, viewers, guaranteed conversion, “risk-free” fee or automatic refund.

WORK EACH CARD THIS WAY:
1. Write a short impact note before code: source of truth, current mounted path, intended change, files/routes/tables/UI/workers, API/schema/security/performance/compatibility effects, targeted tests, rollback and unresolved policy/external predicates.
2. Reproduce the defect or missing mounted journey. Implement the smallest coherent slice. Keep old/new compatibility explicit and avoid speculative rewrites.
3. Run one or two relevant suites with Node 24 scripts/testing/run.mjs and compact output during iteration. Use actual disposable PostgreSQL and separate LOGIN roles for RLS/transaction claims. Preserve failed-before and repaired-after evidence. Run full regression/typecheck/lint/credential-free build only at R2-04/P2, R3-04/P4, R5-04/P6 and R7-01/P8, or when a new broad regression concern justifies it.
4. Test mounted POST/worker/browser paths, not only direct class methods. Test offline worker old queue, logout/account switch; provider ambiguity, payment replay, campaign stale revision, four simultaneous flights, customer message/notification delivery and admin revocation. Verify accessibility on 360px mobile and desktop.
5. Submit READY_FOR_REVIEW with original CR1 and corrective card criterion IDs, exact source/index/artifact identity, scoped diff/commit, commands and exit codes, durable-state assertions, failed/skipped checks, API/schema compatibility, rollback and remaining gates. Do not mark RELEASE_ACCEPTED. A test count or generated JSON receipt is not independent acceptance.
6. Continue dependency-ready work without routine permission questions. If a material founder/provider/legal policy is unresolved, present precise options and recommendation, then continue independent work. Never promote your proposal into DECISIONS.md as founder approval.

DECISIONS TO LEAVE OPEN:
- First/material listing publication: mandatory Admin release (recommended for initial operating model) versus controlled host self-publication after approved facts/media. Do not silently flip live authority.
- Exact pilot room/entire-stay offer and location; no synthetic paid pilot identity.
- Host-exposed format/feeder/guest-intent versus age/demographic controls; only account-supported and approved mappings execute.
- Staff review hours and customer first-response SLA; no unstaffed promise.
- Google/Meta advertiser-of-record and serving-account topology; zero Host OAuth is UX, not permission to combine unrelated advertisers.
- Exact ads cost/tax/refund/variance policy and lawful checkout contracts.

GIT / REPORTING:
- You may make scoped, reviewed commits only for your owned changes, preserving all pre-existing staged/unstaged work. Do not push or force-push the mixed tree as a way of claiming completion. Founder will return your report and repository changes to Codex for an independent diff/acceptance audit; any later GitHub push will be based on that review and an explicit push request.
- Keep a machine-readable handoff with baseline HEAD/index tree, new commits, touched paths, migration IDs (if legitimately allocated), test commands/results, blockers, evidence environment labels and open source diffs. State exactly whether a result was LOCAL_FIXTURE, DISPOSABLE_POSTGRES, STAGING or PRODUCTION. Never include secrets/customer PII.
- Update HARVO/DECISIONS only for verified source facts or explicit founder decisions; preserve historical false or superseded claims with qualification rather than deleting history.

REPORT FORMAT AFTER EACH COHERENT BATCH:
Batch and corrective/original criteria:
Starting and ending HEAD/index tree, owned diff/commits:
Source behavior changed and original authority preserved:
Tests actually run (commands, exits, counts, durable assertions):
Current LOCAL/INTEGRATED/EXTERNAL evidence and reviewer status:
Compatibility and rollback:
Open findings, founder policy questions and external gates:
Next dependency-ready work:
Current Completion Status: evidence-based reacceptance in progress; historical 48/48 remains disputed until independently verified.

Begin now with source/status reconciliation and the earliest dependency-ready cards. Do not ask for routine approval between local tasks. Do not declare industrial production readiness until the Definition of Done and authentic external gates in the Antygravity blueprint are actually satisfied.
~~~
