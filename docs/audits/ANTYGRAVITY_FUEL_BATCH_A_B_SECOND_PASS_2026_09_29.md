# Antygravity fuel Batch A/B — second independent source review

**Disposition: `CHANGES_REQUESTED`.** The second pass improves presentation and passes focused local tests, but it does not resolve the production telemetry contract. This is a source and local-test review, not release or provider certification.

## Source identity and verification

The supplied response is `/Users/ajit/.codex/attachments/1ed02ee6-2ba1-4e51-af0d-717a208466f3/Pasted text.txt`. Implementation was inspected in Antigravity's separate uncommitted worktree `/Users/ajit/.gemini/antigravity/worktrees/EnchoSpaceNew/setup_and_start_dev`, HEAD `dd99de66a36657729a016a8a11a8de478bd87a83`, index tree `06d1dd05b8fc1fb45d07e62dad032fbe1e6172ed`, with 152 status paths. The four-path unstaged fuel diff SHA-256 was `00236c3a40512c21fddff89a26179e44e301a5f964bd986dd9784704808429e8`; re-review if it changes. The primary checkout does not contain these uncommitted implementation changes.

Independent Node 24.12.0 verification: `node scripts/testing/run.mjs src/test/harvo/monitoring_ui.test.ts src/test/cr1_legacy_boundary.test.ts --reporter=dot` exited 0 with **44/44 tests in two files**. `npm run typecheck` exited 0 for client and server configurations; scoped `git diff --check` exited 0. No full regression, browser, PostgreSQL, provider, payment or deployed verification was run in this second pass.

## Improvements credited

- The card meter continues to use media allocation, with captured charge and refundable/pending-refund amounts separated. Reported zero is now qualified as a delayed, windowed provider observation.
- When `dataAsOf` is absent, the copy says network-data currency is unknown. On a refresh error it retains prior spend as labeled historical evidence; an unknown report status fails closed.
- `CampaignStudio` now mounts a status badge that ages ACTIVE observations and distinguishes status-check errors and requested pauses. Its test mounts the actual component with four fixtures, improving on the earlier four-meter wrapper.
- The handoff now separates the unrelated canary-service diff from fuel scope. A single snapshot cannot establish its claim that those bytes were untouched during Antigravity's session.

## Open findings

| Priority | Evidence | Consequence and correction |
|---|---|---|
| P1 | `src/lib/marketing/engine.ts:154–177` requests telemetry from flight start through **today**; `components/marketing/StudioShared.tsx:392–395` requires report `dateEnd` to equal the scheduled campaign `endDate`. | Valid spend on every ordinary in-progress flight ending later can display as `MISMATCH`. Validate a report *observation window* instead of equating it to a future flight end. Test a future-ended live flight and account-timezone boundaries. |
| P1 | `StudioShared.tsx:379–396` checks provider source only when present and revision only when present. `components/marketing/types.ts:31–34`, `src/lib/marketing/workflow.ts:205` and `engine.ts:174` project no telemetry revision. `monitoring_ui.test.ts:438–445` invents one with `as any`. | Claimed strict report binding is absent in the real runtime contract. Add server-owned campaign/revision/provider-account/window/budget-basis evidence or qualify the display and fail closed when required identity is missing. Test the actual projected shape. |
| P1 | `StudioShared.tsx:268–307` returns historical spend on refresh `ERROR` before source, currency, window or revision checks. | Retain historical numbers only with a compatible last-successful receipt; otherwise show unavailable/mismatch without numeric utilization. |
| P1 | `StudioShared.tsx:868–875` returns “Paused at network” before checking observation age. `:894–895` renders green ACTIVE without requiring `deliveryConfirmed` or explicit `ELIGIBLE` readiness. | An old pause can appear current, and the handoff's “fresh, eligible, confirmed” claim exceeds the code. Age every provider state; distinguish observed ACTIVE from verified impression delivery. Test stale PAUSED, unknown readiness and unconfirmed ACTIVE. |
| P2 | `monitoring_ui.test.ts:516–600` mounts `CampaignStudio` but mocks `marketingRequest` with fabricated campaign objects. | This proves component rendering, not “four server-projected flights” or tenant safety. Exercise the authenticated workspace route, pagination, host switching, independent pause and booking deduplication under R6-02. |
| P2 | Antigravity's handoff says rollback is scoped but section 6 still instructs `git checkout --` on four dirty files. | Do not execute it: it discards all unstaged changes on those paths. Freeze a pre-batch patch and use a reviewed scoped reverse patch after ownership reconciliation. |

F0 remains `CHANGES_REQUESTED`; F2 has a mounted fixture, not an independently verified four-flight host journey. No R6-02/R6-04, original CR1 package, paid control, canary, external gate or release claim advances. The next engineering slice should first correct the report-window regression, then introduce server-owned report identity and test a real host-scoped workspace/pause integration path. Keep canary review separate.
