# Encho control-plane branch index

Git is the source of truth for commits and branch heads. This directory is a compact navigation index, not a substitute for [HARVO](../../HARVO.md), the [integration ledger](../implementation/AGENT_INTEGRATION_LEDGER.md), or the underlying source and receipts.

## Branch authority

- `main` is the explicit release/promoted branch. A development push never promotes code to `main` or proves deployment.
- `codex/canonical-development` is the accepted development and audit mirror. Push it after reviewed integration so the exact accepted line is remotely inspectable.
- Antigravity work lives on separate `worker/antigravity/<task-slug>` branches. Start each branch from the exact reported `NEXT ANTIGRAVITY BASE`.
- Use one writer and one worktree per branch. Push each coherent worker commit before GPT-6 review, and report its remote branch and full remote SHA.
- After handing off a SHA, never amend, rebase, or force-push it. A `CHANGES_REQUESTED` result adds repair commits. Interrupted work may use an explicitly named checkpoint commit; a checkpoint is never accepted without GPT-6 review.
- A worker does not merge or cherry-pick into canonical. GPT-6 reviews and integrates locally after `PASS`, updates the integration ledger and `CURRENT_STATE.json`, commits, verifies canonical, pushes `codex/canonical-development`, checks local and remote SHAs match, and reports the next Antigravity base. `main` requires a separate explicit promotion decision.

## Evidence and safety

Keep local tests, isolated integration tests, staging evidence, and production/external-provider evidence distinct. A pushed branch, receipt, or passing local test does not establish deployment or production readiness. Do not commit secrets, private keys, customer exports, provider credentials, or production database dumps. Inspect files before pushing.

[`CURRENT_STATE.json`](CURRENT_STATE.json) records compact navigation facts at the time of an accepted integration. Its `canonicalHead` is the accepted slice's head when the index was written; the index commit itself necessarily has a later SHA. For the current branch tip, use `git rev-parse codex/canonical-development` or the verified remote ref rather than treating a SHA stored inside a commit as self-referential.
