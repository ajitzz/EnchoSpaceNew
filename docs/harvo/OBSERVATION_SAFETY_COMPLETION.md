# HARVO observation safety and scheduling — bounded correction

13 September 2026. Scope: engine safety/reliability and isolated regression tests. This impact plan precedes implementation; no provider, payment, remote database or guest/legal authority changes.

## Reverified source and root cause

The current worker already schedules a conservative pause after a thrown provider observation for LIVE/PROVIDER_REVIEW campaigns. That existing catch-side protection is preserved. However, listing/current-price and inventory validation occurs only after both external provider reads complete, delaying independently knowable local safety action and omitting its specific evidence when those reads fail. The observation scheduler selects the oldest 100 workflow `updated_at` values; persistently failing rows retain those old values and can starve later campaigns indefinitely. Failed future-flight reporting is one possible trigger, not assumed provider activity.

## Implementation and impact

Change `src/lib/marketing/engine.ts` only, with a separate `safety_observation.test.ts`. Before external observation, take the existing campaign/fence transaction and check current listing/media/price and canonical stay inventory. If a known invalidation needs containment, persist a revision-bound PAUSE job and audit immediately; do not wait on reporting or invent provider pause success. Recheck local authority again before persisting successful observations to cover changes during network I/O. Preserve unknown metrics and timestamps on unavailable reporting and all existing job/operation fencing.

Schedule at most 100 observations per invocation using durable observation-job history, separate from successful workflow updates. Suppress another observation while the same campaign revision has active PENDING/RUNNING/RETRY work, and select the least recently scheduled eligible revisions first. The creation key remains campaign/time-window bound. This continues across engine restarts, does not increase the SQL limit, and never replays a provider mutation.

Risks: overwriting a host's newer pause/activation, stale worker audit, duplicate scheduled observations and expensive history scanning. Use the existing parent lock, lease/fence and current revision checks; preserve current pending actions. Aggregate observation history once per sweep rather than query it separately for every campaign. No schema or API change is required. Rollback retains jobs/audits and restores only scoped engine code; never delete an unknown provider outcome.

## Verification plan

Run under verified Node24 with an empty inherited environment and the isolated HARVO test configuration. Real disposable PostgreSQL must prove local invalidation is recorded before a blocked/failed report is called, a newer manual pause is preserved, unavailable reporting does not fabricate statistics, more than 100 unsuccessful campaigns cannot starve later work, active jobs are not multiplied and a restarted scheduler continues from committed history. Existing workflow/activation/provider guards remain under independent regression ownership. Root reruns private server TypeScript and compiled-runtime smoke after source freeze.

## Observed result

The isolated Node24 run passed **21/21 tests** (7 new observation-safety tests and 14 current workflow-engine tests) in 96.60 seconds. Focused strict TypeScript passed. The real local PostgreSQL scheduler fixture contained 205 campaigns, including 100 with older persistent failures; three bounded sweeps across new engine instances scheduled every campaign once, and a repeated sweep did not multiply active work. Existing observation retries retained their original job ownership.

Both sold-out inventory and changed listing price queued a revision-bound protective pause before a never-resolving report function was called. Tests retained prior metrics/provider status, verified post-network local invalidation, preserved a host pause and rejected stale-fence writes. No external HTTP, payment, ad mutation or remote database was used. A queued PAUSE is not a verified provider pause. Fair selection is not a throughput or production latency guarantee; total campaign volume, worker count, queue age and provider delays still need representative operating acceptance. No schema/API change was introduced.
