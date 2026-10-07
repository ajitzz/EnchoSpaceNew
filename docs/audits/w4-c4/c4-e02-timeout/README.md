# C4-E02 executable reviewer acceptance pack

This pack specifies and tests the remaining **E/F/G timeout-harness repair**. It does not implement that repair, accept W4-C4, authorize another phase, or establish production readiness. C4-E01/E03/E04/E05 are closed and remain preserved. Existing A–D, C3, replay, rollback, inventory and role regressions remain authoritative.

The reviewer controls were authored/adapted by **GPT-6**. Earlier `/tmp` reviewer artifacts remain historical evidence; this checked-in portable adaptation is not a raw transcript or a verbatim copy of those artifacts. Each run generates a short temporary directory for disposable fixtures and Unix sockets. It does not depend on fixed retained `/tmp` files.

## Frozen identities and scope

| Item | Required identity |
| --- | --- |
| Baseline subject HEAD | `764b9eadd5947dccf8e3ceb1333fd36c32a59f0f` |
| Subject source | `scripts/testing/w4c4-composition-finalizer-lock-hardening.mjs` |
| Baseline source SHA-256 | `54ec2fc9686a150b2882b698542eaad0166f6729e47cbff2122b02d408ca015e` |
| Frozen migration | `src/migrations/060_canonical_payment_composition_lock_order_hardening.sql` |
| Migration 060 SHA-256 | `0823b6d434ebad6a6bce11196671a6ad8ff0a567049ca001fc7f4c3e9708548c` |
| Runtime/dependencies | Node 24; installed `pg@8.23.0` and `pg-pool@3.14.0`; no upgrade |
| Pack commit | `PACK_COMMIT` — replace with the actual full committed SHA in the final handoff |

The worker may edit only:

1. `scripts/testing/w4c4-composition-finalizer-lock-hardening.mjs`
2. `docs/implementation/receipts/W4_C4_COMPOSITION_FINALIZER_LOCK_HARDENING_LOCAL_2026_10_07.json`

Do not repair SQL 060, change domain services, alter the canonical worker files or broaden the modification/payment/public-ingress boundary. Receipt changes must retain historical evidence and distinguish new runs from carry-forward results.

## Lifecycle acceptance contract

The harness must preserve three independent facts: **the caller's wait**, **the actual resource's settlement**, and **verified terminal disposition**. Rejecting a deadline wrapper does not settle its query, connect, cancellation or terminal operation.

| Phase | Required ownership and evidence |
| --- | --- |
| Before dispatch | Register acquisition/query/control work and its owner before calling `pool.connect()` or `client.query()`. Keep the underlying settlement promise independently of the caller-facing deadline. |
| Caller deadline | Reject the caller within its declared budget without awaiting cancellation in the timer callback. The raw operation remains tracked until it really resolves or rejects. |
| Acquisition/PID initialization | A timed-out connect remains pending. Account for a later returned client and its real terminal action; bound and track PID initialization as a query. Never erase an acquisition because its wrapper timed out. |
| Query/control settlement | Cancellation is separately owned, tracked and bounded work. Its timeout is not query settlement. Stop adapter dispatch and reject queued work when the case expires or cleanup begins; keep the active raw query owned until settlement. |
| Clean release | Release into the pool only after every owned query settles and the transaction is clean. A timeout, active query or open/failed transaction prohibits clean release. |
| Discard/termination | Record attempted terminal actions, but mark success only after the release/disconnect API actually succeeds and required backend verification completes. Throws, rejections and unknown outcomes remain failures or unresolved evidence. |
| Final account | Bound cleanup and verification, aggregate the original scenario error with cleanup/verification failures, and produce the final resource account **after** all verification operations are themselves accounted for. |

Use finite escalation within one cleanup deadline: separately bounded cancel, settlement observation, terminal action and backend verification. A cancellation operation must not recursively launch another cancellation chain against itself. When the available budget cannot prove settlement or termination, fail with unresolved evidence; do not manufacture a successful terminal state. Pool draining, process exit and elapsed time alone do not prove case-local cleanup.

### Ownership inside fixture setup

`setupPaymentAttemptFixture(offsetDays, nights, ownerClient)` spans multiple owners. Passing `observerConn` as `ownerClient` covers only that explicit client's payable-authority insert. It does not own the other service calls.

| Actual call | Actual resource owner that must be covered |
| --- | --- |
| `createItineraryQuote(stays, ...)`, `acquireHold(stays, ...)` | `stays` service pool, including hidden acquisition and query/transaction lifecycle |
| `createPaymentAttempt(paymentWorker, ...)`, `ingestProviderEvent(paymentWorker, ...)` | `paymentWorker` service pool, including attempt and evidence work |
| `ownerClient.query(...)` payable-authority insert | The explicit owner client, including `observerConn` when supplied |

The same rule applies to case setup, direct queries, observations, rollback, cancellation, cleanup controls and backend verification. A high-level wrapper around fixture setup must not conceal work dispatched by its service pools.

### Library semantics

The current [node-postgres pool API](https://node-postgres.com/apis/pool) documents that a truthy argument to `client.release(destroy)` destroys the pooled client, and `pool.end()` drains active clients and shuts down pool timers. The [client API](https://node-postgres.com/apis/client) documents query and disconnect promises. Verify any relied-on behavior against the installed versions above; current online documentation is not permission to adopt a newer API.

[Node timers](https://nodejs.org/api/timers.html) schedule callbacks and allow timer cancellation; they do not cancel PostgreSQL work. The harness must explicitly own its underlying work and clear its own timers. These are harness requirements, not claims that the library automatically provides them.

## Executable controls

| Control | Decisive boundary |
| --- | --- |
| **P1 — Deferred acquisition** | Caller expiry cannot hide a still-pending connect or falsely finalize a late returned client. |
| **P2 — PID initialization** | A timed-out PID query remains owned until its underlying work settles or the client is truthfully terminated. |
| **P3 — Delayed cancellation/control** | A delayed cancellation/control operation cannot extend the caller deadline or become invisible at cleanup. |
| **P4 — Terminal action failure** | A failing release/discard/disconnect cannot produce successful terminal accounting. |
| **P5 — Complete lifecycle/existing regressions** | Preserve the ordinary focused 1/1 result and separately observe ownership at actual service connect/query dispatch and settlement within the scoped setup, `runOperation` and `performFiniteCleanup` paths. |

P1–P4 exercise the actual subject helpers against generated PostgreSQL fixtures. The helpers are inline in a Node test rather than exported. That makes the optional `subject-loader.mjs` necessary for this source layout: it verifies the subject hash and exact extraction boundaries/class names, then evaluates the actual inline bytes. It does not copy or reimplement the algorithms or manually manufacture harness state. A source layout that exposes the real helpers may make extraction unnecessary; adapting the loader requires independent reviewer inspection while assertions and expected outcomes remain frozen.

For P5, `buildP5Preload` inserts one transparent observational hook after the inline class definitions and before the scoped E/F/G case callers. It preserves the actual class/method bodies, fixture/service callers and SQL, wraps their real methods to establish asynchronous observation scopes, and wraps `pg` connect/query calls to record dispatch ownership and underlying settlement. The source-hashed observation covers the actual `setup_fixture`, `setup_c2_fixture`, `setup_c3_fixture`, `runOperation` and `performFiniteCleanup` scopes; it does not claim universal coverage of every repository operation. The runner reports the ordinary focused test result separately from this scoped lifecycle evidence.

The known baseline preserves ordinary focused **1/1 PASS**, including responsive observer, expiry, immediate cancellation, real SQL C3, aggregation and gate restoration. P5 nevertheless **FAILS overall** because its scoped observer exposes incomplete G ownership. Complete G requires this observation plus P1–P4's hidden-work and truthful-terminal checks. `READY` requires a clean committed subject and complete all-five GREEN with the G assertions satisfied. Missing, skipped, unknown, supervisor-terminated or partially selected controls cannot support it.

## Running the pack

Use an explicit subject checkout, full HEAD and actual source hash. The JSON output must be an absolute path outside the subject and reviewer Git roots.

```text
node <pack>/reviewer-controls.mjs \
  --subject-root <explicit-root> \
  --subject-sha <full-HEAD> \
  --source-sha256 <actual-file-hash> \
  --expect baseline|acceptance \
  --output <absolute-path-outside-repos.json> \
  [--probes P1,P2,P4] [--allow-dirty]
```

The baseline identity is the frozen SHA/hash above and requires a clean subject and **all five** probes. For a correction, obtain the full subject HEAD and SHA-256 of the actual source file; never reuse the baseline hash for changed bytes. `--probes` permits bounded staged checkpoints only with `--expect acceptance`. A partial run is reported as partial and cannot establish readiness. `--allow-dirty` is available only for acceptance-mode diagnosis; it must be visible in the evidence and does not turn dirty bytes into a committed subject.

| Mode/result | Exit code | Meaning |
| --- | --- | --- |
| Baseline: P1–P4 FAIL; P5 overall FAIL with ordinary focused 1/1 PASS | **1** | Expected overall semantic **RED**. Baseline self-consistency may PASS; implementation acceptance still fails. |
| Acceptance: every requested control passes | **0** | Requested controls are GREEN. `READY` additionally requires a clean committed subject, complete P1–P5 and satisfied G assertions. |
| Invalid identity/import/infrastructure/supervisor result, or wrong baseline pattern | **2** | Evidence is unusable; never translate it into a semantic PASS or expected RED. |
| Acceptance: a requested semantic control fails | **1** | Correction remains RED. |

All fixtures are generated, disposable PostgreSQL clusters with explicit Unix-socket configuration and a child environment allowlist. Do not read `.env`, inherit ambient `DATABASE_URL`/`PG*` targets, connect to Neon or reuse an application database. The supervisor may clean only paths generated by its own run. Supervisor termination is infrastructure failure, never proof of successful cleanup.

## Regression and delivery evidence

Historical Command B remains **UNKNOWN / OWNER FOLLOW-UP**. This pack neither reconnects to that target nor converts the unknown into a safety PASS.

Historical carry-forward total **107 = 56 + 38 + 13**:

- W3-B composition: 56 (`28 BASELINE_054 + 28 POST_060`), `src/test/harvo/w3b_canonical_composition_pg.test.ts`.
- Payment evidence: 38, `src/test/harvo/w3b_canonical_payment_pg.test.ts`.
- W3-A reservation: 13, `src/test/harvo/w3_canonical_reservation_pg.test.ts`.

Keep diagnostic W4-C4 **1 Node test**, W4-B **52**, and W4-C2 **1 Node test** separate. These are carry-forward records, not newly rerun tests and not added into 107. The ordinary focused portion of fresh P5 is **1 Node test**, with its labeled scenarios reported separately from the Node-test count and its scoped lifecycle assertions reported separately from that ordinary test result.

The final handoff must include the actual pack commit, worker subject full SHA/hash, baseline RED JSON, complete acceptance JSON, focused test evidence, scoped lint, JSON validation, `git diff --check`, exact two-path diff and unchanged migration-060 hash. Preserve failures and state what was actually rerun.

The current `.github/workflows/ci.yml` triggers on pushes to `main`/`master` and pull requests targeting those branches. A worker/reviewer branch push alone has no CI run under that workflow. An external preview is unknown unless separately observed and is never acceptance evidence for this pack. No production, deployment, SQL-060 repair or broader milestone acceptance follows from this documentation.
