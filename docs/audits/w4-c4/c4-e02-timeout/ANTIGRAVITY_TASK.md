# Antigravity task — C4-E02 E/F/G harness correction

Implement the remaining E/F/G timeout-harness correction against the frozen reviewer controls. This task does not accept W4-C4 or authorize SQL, domain, production or phase changes. Read `docs/ENCHO_ENGINEERING_CONSTITUTION.md`, `HARVO.md` and relevant `docs/harvo/` records before engineering, then use `docs/audits/w4-c4/c4-e02-timeout/README.md` and `acceptance-contract.json` as the bounded reviewer contract.

## Frozen starting point

- Worker subject baseline: `764b9eadd5947dccf8e3ceb1333fd36c32a59f0f`.
- Source: `scripts/testing/w4c4-composition-finalizer-lock-hardening.mjs`.
- Baseline source SHA-256: `54ec2fc9686a150b2882b698542eaad0166f6729e47cbff2122b02d408ca015e`.
- Frozen SQL 060 SHA-256: `0823b6d434ebad6a6bce11196671a6ad8ff0a567049ca001fc7f4c3e9708548c`.
- Reviewer pack commit: **`PACK_COMMIT`**. The final dispatch/handoff must supply the actual full committed pack SHA; this token is not an executable identity.
- Node 24, installed `pg@8.23.0`, `pg-pool@3.14.0`; no package upgrade.

Only these worker paths may change:

1. `scripts/testing/w4c4-composition-finalizer-lock-hardening.mjs`
2. `docs/implementation/receipts/W4_C4_COMPOSITION_FINALIZER_LOCK_HARDENING_LOCAL_2026_10_07.json`

Preserve C4-E01/E03/E04/E05 closures, A–D and C3 behavior, canonical worker/service files, migration 060, role boundaries, existing replay/rollback/inventory evidence and historical receipt context. Preserve the existing branch and commit history; no amend, rebase, force-push or canonical merge. Do not edit the reviewer controls or weaken their assertions/expectations. The optional loader is needed while the actual helpers remain inline in the Node test. It extracts verified actual source bytes for P1–P4 and adds one observational hook after the classes for P5, with transparent `pg` wrappers; no copied algorithms or manually manufactured harness state. A necessary loader adaptation must be independently reviewed against the actual changed source bytes.

## Required repair

Separate the caller-facing deadline from actual acquisition/query/control settlement and from verified terminal disposition. Register ownership before dispatch. Keep the raw settlement promise alive after caller timeout. Own cancellation as separate bounded work so a slow cancellation cannot delay the caller's rejection. Account for late connects and PID initialization; stop queued dispatch on expiry/cleanup. A clean pool release requires settled work and a clean transaction. Record terminal success after the actual API succeeds and required backend verification completes. Preserve/aggregate original errors with cleanup and verification failures, and produce the final resource account after verification work is accounted for.

Cover all work inside `setupPaymentAttemptFixture`: `stays` quote/hold service calls, `paymentWorker` attempt/evidence calls and explicit `ownerClient` payable setup. Supplying `observerConn` as the owner argument does not own the other service pools. Cover observations, rollback and cleanup/verification calls as well. Escalation must be finite inside one deadline; cancellation controls cannot recursively spawn cancellation chains. Unknown or unresolved lifecycle evidence is a failed gate.

## Staged execution

Complete stages in order. Do not start with a full broad rewrite.

### A — Reproduce the unchanged baseline

Use the reviewer pack from its actual committed SHA without editing controls. Verify the frozen subject SHA, source hash and migration hash. Run all P1–P5 with `--expect baseline` and an output path outside both Git roots. Preserve the JSON and exit code.

Required pattern: P1–P4 **FAIL**; P5 **FAILS overall**, while its ordinary focused **1/1 PASS** is preserved. P5's source-hashed observer exposes incomplete G ownership at actual setup service connect/query dispatch and settlement within the `runOperation`/`performFiniteCleanup` scopes. Overall acceptance remains **RED / exit 1**. Baseline requires all five probes on the clean frozen subject; partial diagnostics are acceptance-mode only. A baseline self-consistency PASS is not implementation acceptance. Infrastructure/import/supervisor failure or a different baseline pattern is **exit 2**: stop to identify the cause before editing.

### B — Map owners and proposed tests

Before implementation, record the affected acquisition, PID, query, adapter queue, cancellation/control, terminal action and verification owners. Include the hidden service-pool work in fixture setup. State root cause, smallest solution, failure risks, verification and rollback within the two allowed paths. The rollback preserves receipt history and restores only the new worker patch; it must not discard pre-existing work.

### C — Repair acquisition, PID and terminal accounting

Implement only the bounded lifecycle changes needed for **P1 Deferred acquisition**, **P2 PID initialization**, and **P4 Terminal action failure**. Run the unchanged controls with `--expect acceptance --probes P1,P2,P4`, actual current source hash and explicit subject identity. A partial GREEN is a checkpoint only. Retain pending/late outcomes, real terminal API errors and minimal traces; do not turn a timeout into settlement or an attempted discard into success.

### D — Repair deadline and control ownership

Repair **P3 Delayed cancellation/control** and rerun **P5 Complete lifecycle/existing regressions**. Cancellation must be independently registered and bounded; the caller deadline cannot await a slow cancel callback. Prevent further adapter dispatch after expiry/cleanup while retaining active raw work until settlement. Prove that any finite fallback covers its own control work, backend state, errors and final accounting. P5 separately reports the ordinary focused result and scoped observation of actual service acquisition/query ownership and settlement; preserve responsive-observer, expiry, immediate-cancellation, real SQL C3, aggregation and gate-restoration regressions.

### E — Run the complete acceptance gate

Run all **P1–P5** with `--expect acceptance`, with no skipped/missing/unknown control and no supervisor termination. Run the complete focused hardening test against the same subject. P5's ordinary focused portion is one Node test with labeled scenarios; its PASS alone does not close G. P5's transparent source-hashed observer must also pass for actual setup service connects/queries and scoped `runOperation`/`performFiniteCleanup` dispatch and settlement. P1–P4 additionally prove their hidden-work and truthful-terminal boundaries. These scoped checks do not establish universal repository coverage.

Only a clean committed subject with complete all-five GREEN and satisfied G assertions may support `READY`. A partial selected probe set, dirty diagnostic result, timeout/infrastructure error or unresolved acquisition/query/control/terminal outcome cannot support it. Carry forward **107 = composition 56 (28 BASELINE_054 + 28 POST_060) + payment evidence 38 + reservation 13** accurately. Keep W4-C4 diagnostic 1 Node test, W4-B 52 and W4-C2 1 Node test separate; they need no rerun for this bounded task and must not be described as fresh results.

### F — Freeze receipt and handoff

Update the existing receipt without erasing earlier findings/runs. Record exact committed subject SHA, actual source SHA-256, reviewer pack SHA, commands, selected probes, raw exits, semantic results, fixture isolation, focused Node-test/scenario counts, timing/terminal evidence and remaining limits. Validate the JSON, scoped lint and `git diff --check`. Verify the diff has exactly the two allowed worker paths and migration 060 still hashes to the frozen value.

After a committed correction, rerun complete controls against that actual committed HEAD/hash. Retain the earlier baseline RED, failed attempts and final complete JSON outside Git roots. Hand off a minimal trace for each repaired boundary and the exact source/receipt diff. Preserve branch history and report all limitations. No implementation acceptance or production claim is authorized by your own handoff.

## Commands and stop rule

```text
node <pack>/reviewer-controls.mjs \
  --subject-root <explicit-root> \
  --subject-sha <full-HEAD> \
  --source-sha256 <actual-file-hash> \
  --expect baseline|acceptance \
  --output <absolute-path-outside-repos.json> \
  [--probes P1,P2,P4] [--allow-dirty]
```

`--allow-dirty` permits transparent intermediate acceptance-mode diagnosis only; final readiness requires the clean committed subject. Baseline mode requires all five probes. `--probes` partial checkpoints are acceptance-mode only and never grant readiness. Exit **1** is expected semantic RED for the frozen baseline (P1–P5 overall FAIL, ordinary focused 1/1 PASS); exit **0** means all requested acceptance controls pass; exit **2** means invalid evidence, including infrastructure/supervisor failure or wrong baseline pattern.

**After two repair attempts fail the same unchanged reviewer control, STOP.** Preserve the failing JSON, exact SHA/hash, owner/operation timing and terminal API trace, and report the smallest demonstrated blocker. Do not rewrite assertions, copy algorithms into the pack, widen the edit scope or continue speculative cancellation chains.

Use only generated disposable PostgreSQL fixtures in short generated temporary directories, with explicit Unix sockets and an allowlisted child environment. There is no dependency on fixed retained `/tmp` files. Do not load `.env`, inherit ambient database targets, use Neon, upgrade dependencies or change SQL 060. The supervisor may clean only its own generated run paths.

Allowed verification is the reviewer runner, `node --import tsx --test scripts/testing/w4c4-composition-finalizer-lock-hardening.mjs`, scoped ESLint, receipt JSON validation, SHA-256 checks, and Git identity/diff/status checks. Use Node 24 and the same allowlisted fixture-only environment for database tests. Additive worker checkpoint commits and ordinary pushes are permitted by the future repair handoff; no other engineering commands or database targets follow from this pack. Historical Command B remains **UNKNOWN / OWNER FOLLOW-UP**; do not reconnect to identify it.

The current CI workflow runs only for `main`/`master` pushes and pull requests targeting them, so a worker/reviewer branch push alone has no CI run under that workflow. External preview status is unknown unless separately observed and cannot clear this acceptance gate. Do not claim deployment, production readiness, broader W4-C4 acceptance, legal/provider clearance or a phase transition.
