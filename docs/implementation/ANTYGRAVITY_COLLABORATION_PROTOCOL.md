# Antygravity–Codex collaboration protocol (proposal; 29 September 2026)

**Purpose:** Use direct source inspection, independent tests and narrow handoffs to turn Antygravity implementation work into reviewable Encho changes. This protocol is engineering guidance, not a release approval or a new acceptance ledger.

## Verified checkout reality

At this observation, the primary checkout is `/Users/ajit/Documents/EnchoSpaceNew` at `b801bd5`, with Codex's review-document edits only. Antygravity's reported implementation is in `/Users/ajit/.gemini/antigravity/worktrees/EnchoSpaceNew/setup_and_start_dev`, also at `b801bd5` but with 365 changed/untracked paths. Git worktrees share repository objects and refs, **not uncommitted file contents**. Codex can inspect Antygravity's worktree directly; copying or merging is a separate, deliberate action. The founder may later configure Antygravity to write the primary checkout, but that has not been observed here.

## Recommended operating loop

1. **Assign one bounded corrective card.** Give Antygravity a path/route/table ownership list, exact acceptance criteria, baseline commit and explicit forbidden files/actions. If it is editing, Codex reviews rather than concurrently editing those files.
2. **Freeze a batch for review.** Antygravity reports `git rev-parse HEAD`, `git write-tree`, staged and unstaged name/status/diff summaries, tests with exits, environment labels and open gates. It stops editing that batch until review completes. Do not bulk-stage existing changes.
3. **Independent inspection.** Codex reads actual source and both staged/unstaged diffs, traces mounted HTTP/worker/UI paths, compares to controlling decisions and applied schema history, reruns targeted tests, then checks full milestone exits as required. A report alone has no acceptance authority.
4. **Return precise findings.** Findings name source lines, violated invariant, reproduction, expected behavior and test. Antygravity repairs only those paths and submits a new frozen identity. Repeat until the batch is READY_FOR_INDEPENDENT_REVIEW, then independently reaccept exact criteria; do not infer 32/32, 48/48 or external clearance.
5. **Integrate surgically.** Once reviewed, move only the accepted scoped diff into the primary checkout via a reviewed commit/cherry-pick or explicit patch. Preserve rejected work and audit evidence in the Antygravity worktree. Re-run affected checks on the integrated tree before a normal push. No force push or paid/remote action follows from a local test pass.

## Concurrency boundary

Separate worktrees are preferable for parallel implementation and review: they prevent an agent from overwriting another's uncommitted source and keep test evidence attributable. If both tools must use `/Users/ajit/Documents/EnchoSpaceNew`, use a **single-writer rule**: Antygravity finishes and freezes a batch; Codex reviews/edits after Antygravity stops; neither stages, resets, commits or runs migrations over the other's active changes. Shared-path convenience is not a substitute for source identity.

## Current queue

The first review result is [ANTYGRAVITY_WORKTREE_REVIEW_2026_09_29.md](../audits/ANTYGRAVITY_WORKTREE_REVIEW_2026_09_29.md). Its highest-priority items are containment of the mounted paid commerce path and canary authorization bypass, restoration of truthful provider/notification states, and recovery of provenance and the failing full regression. The next copy-ready instruction is [ANTYGRAVITY_REPAIR_HANDOFF_2026_09_29.md](ANTYGRAVITY_REPAIR_HANDOFF_2026_09_29.md).

Codex can inspect the local worktree and produce prompts/reviews. It has no direct control channel to the external Antigravity session; the founder or its own operator must provide the handoff prompt. No provider, legal, staging, pilot or production evidence is created by this workflow.
