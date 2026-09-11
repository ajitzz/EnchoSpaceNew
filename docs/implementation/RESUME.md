# Encho continuation entry point

Updated: 2026-09-11. Active phase: Execution. Owner explicitly authorized the plan named Maha and delegated routine implementation choices.

## First incomplete task

Current execution checkpoint (2026-09-11; supersedes next-task text in historical paragraphs below): MAHA-03D-DETAIL is implemented and locally verified. Preserve stayRecoveryDetails.ts, StayRecoveryDetails.tsx and queue mount: Admin-only persisted observation/event history with independent scoped cursors/redaction/read-only snapshot, no financial actions. RESOLVE prerequisite also fixed: currentStayInventory plus current calendar checks under the listing lock prevent capture confirmation using old quote stock; contracted price stays unchanged. Next first incomplete task: implement a shared audited/idempotent capture-resolution boundary with exact locked payment/quote binding, then Admin resolution, signed webhook/browser-abandonment recovery and refunds. Do not infer failed payment or release unknown holds. No resolution API exists yet.

Early MAHA-06A now has scripts/maha-postgres-acceptance.mjs and npm run test:maha:postgres: fresh private TCP-disabled fixtures, no inherited DB/provider credentials, structured test receipts and shutdown. Full app/browser/staging isolation remains incomplete; do not use default dev/test/e2e commands with configured Neon. Current evidence: 288 ordinary tests passed / 37 opt-in PG skipped (38412); corrected runner (11944) separately passed all 37 (14 checkout + 23 inventory), retaining /private/tmp/encho-stay-test.dPkIMu/acceptance.json and /private/tmp/encho-inventory-test.w3abbc/acceptance.json. Both stopped; D5jiFr/gRBTND/wAzH78 also stopped/retained. Initial runner failed only its colored-console acceptance parser after tests passed; replaced with JSON reporter and reran successfully. Full typecheck 39177 exited 0; scoped source/test lint passed, final runner lint 75081 exited 0; full frontend/server build 84847 exited 0; diff check passed. No commands pending. No production migration, Neon/provider/payment/deployment write; flags remain off. No staging/browser/provider certification. Details in MAHA_03D_CHECKOUT_RECOVERY.md and MAHA_06A_LOCAL_ACCEPTANCE.md.

Production-certification planning update (2026-09-11): read MAHA_BLUEPRINT.md and MAHA_PRODUCTION_CERTIFICATION.md after the Constitution. The owner now requires evidence-backed staging and production acceptance of every milestone for publishing. The contract defines dependencies, acceptance records, hard stops and rollout/rollback; adopting it does not promote any milestone. This was a documentation-only change; prior test results below are retained, not fresh runs. First implementation remains MAHA-03D-DETAIL (Admin persisted-observation details), followed by RESOLVE, WEBHOOK and 03E refunds. Prepare MAHA-06A isolated acceptance infrastructure early; real external access remains a separate gate. No application/flag/provider/database/deployment changes or pending commands from the planning update.

Autonomous continuation advanced through MAHA-03C Admin authorization history/API, staging-only Channex identity reader and transaction-safe attestation ingestion, then MAHA-03D Admin recovery queue and durable payment observations. Preserve InventoryAuthorizationHistory, channexBindingReader, inventoryBindingIngestion, StayRecoveryQueue, stayRecovery, stayPaymentObservation, server mounts and staged stay_payment_observations migration. First incomplete executable task: Admin checkout details showing persisted observations, then audited provider reconciliation/resolution, signed webhook/browser-abandonment recovery and refunds. Never infer failed payment from an empty fetch or release unknown holds. Real Channex credentials/connection/access and OTA/PMS certification remain external gates; reader has no configured resolver or worker and only uses staging. No production provider calls occurred. Checkout/recovery/provider-observation/inventory/scope flags all remain off.

Latest evidence: final isolated suite 267 passed / 33 opt-in PG skipped (65719); 23 inventory PostgreSQL tests passed (37797), ten checkout PostgreSQL tests passed on fresh RkL0M2 fixture, including concurrent observation replay, no booking-state mutation, missing-order refusal and actual Admin queue. Both current clusters 37TAqO/RkL0M2 stopped and retained; all older clusters remain stopped. Final frontend TypeScript/scoped fixture lint passed (90872), other scoped new-code lint passed in the recorded suite calls, and final frontend/server build exited 0 (17345). Diff check passed. No commands pending. No production migration, Neon/provider/payment/deployment write. Details and limits: MAHA_03C_EXTERNAL_INVENTORY.md and MAHA_03D_CHECKOUT_RECOVERY.md. Browser/accessibility, provider canaries, cancellation/refunds and broader milestones remain incomplete; no 100% or 10/10 certification.

## Read order after a reset

1. AGENTS.md and docs/ENCHO_ENGINEERING_CONSTITUTION.md.
2. This file.
3. docs/implementation/PLATFORM_TRANSFORMATION.md and PLATFORM_RELEASE_GATES.md.
4. Inspect git status and only the source/tests relevant to the first incomplete task.

Conversation ratings (including the previous 68% estimate) are subjective, not acceptance evidence. Two different six-milestone taxonomies exist: the original marketing playbook in AGENTS.md and the connected platform ledger. Keep them explicitly distinguished.

## Confirmed owner requirements

- Stays first; preserve the approved guest ListingDetailsNew/gallery visual direction.
- Redesign the Host workspace and Admin operations together, including listing creation/editing, inventory, campaigns, inbox and finance.
- Hosts use Encho's managed advertising accounts, without host OAuth. Admin review must precede advertising publication.
- Every affected property contract must remain consistent across Host forms, guest views and Admin moderation.
- The owner accepted the proposed short-stay cancellation default: full refund including service fees at least 72 hours before local check-in; later cancellation/no-show retains the first night's accommodation and refunds remaining nights, service fees and unused extras; host cancellation receives a full refund. Implementation and tax treatment remain open.
- Owner delegated selection of an isolated staging option. No staging resources have been provisioned; no deployment or production migration has occurred.
- Current request explicitly asks for boardroom understanding before execution of the expanded Host/Admin redesign.
- Owner accepted recommended launch defaults: India-first/INR, reviewed property publication, Meta ads plus Google Search, controlled campaign edits and separate admin permissions. Organic posting, additional Google formats and custom domains are not established launch requirements.
- Target hosts already accept bookings through Airbnb, Booking.com or other channels. External inventory synchronization is therefore a launch dependency; exact channels and existing channel-manager/PMS use remain to be identified.
- Initially the admin alone reviews campaigns. Later the admin assigns review duties to staff; permissions and audit attribution must support this delegation.
- Owner reports Meta Business/Page/Instagram, Google Ads API and Razorpay ready. This is owner-reported account readiness, not verified API permissions or successful canary evidence. Stripe readiness was not reported.
- Owner does not know target hosts' PMS/channel-manager use and delegated the technical choice. Inspection found internal calendar_prices read/write endpoints and booking-based auto-pause, but no iCalendar importer/exporter or named PMS/channel-manager connector in src, lib, components, server.ts or package.json. Code cannot establish what external software prospective hosts use.
- Selected direction: provider-neutral room/date inventory adapters, with Channex as the first API connectivity candidate pending commercial/access validation (https://docs.channex.io/about-channex-and-faq). Accommodate existing host systems via supported adapters and explicit room mapping; do not force switching. iCalendar is a limited fallback for individually mapped units, not sufficient evidence for synchronized pooled room inventory or instant booking. Airbnb documents a three-hour automatic calendar refresh (https://www.airbnb.com/help/article/99). Unknown/stale external availability requires request-to-book or separately allocated Encho inventory. No connector was implemented or purchased in this boardroom step.

## Preserved engineering checkpoint

The connected platform ledger's milestone 1 is locally validated. Milestones 2–6 remain incomplete. Detailed delivered changes and evidence are in PLATFORM_RELEASE_GATES.md. Existing local source edits include secure staged stay checkout, inventory locking, truthful campaign readiness, provider guards and CRM safety changes. Checkout remains disabled by default.

Before the boardroom request, the next engineering item was admin checkout reconciliation: src/server/stayCheckout.ts still lacks admin review/reconcile endpoints and there is no Admin checkout recovery panel. Resume that item only within the agreed execution order. Refunds, real Google publication/control, full Meta entry-point validation, notification adapters, identity linking and release verification remain open.

Previous continuation reported 61 ordinary isolated tests passing and 7 opt-in PostgreSQL tests skipped; the separate earlier PostgreSQL run passed all 65 tests then present. Some ledgers still record 59 ordinary tests. Reconcile evidence from retained outputs before revising counts; do not claim a fresh test run. Type check, build and scoped lint were reported passing. No browser E2E, live payment or advertising canary has passed in this work.

## Checkpoint protocol

Give each agreed task a stable ID, dependency, status (todo/in_progress/implemented/verified/blocked), affected files and acceptance checks. Only verified tasks count as complete. Save after each coherent change and before handoff: current task, exact next action, files changed, tests/results, pending commands, decisions and blockers. Never store credentials.

After interruption, inspect the in-progress diff and any pending process before editing. Resume remaining acceptance checks; rerun completed tests only if changed code or unresolved evidence warrants it. Never repeat external writes with unknown outcomes: reconcile persisted provider references and idempotency records first. Local checkpoints persist through conversation interruption but are not remote backups or automatic resumption guarantees.

Suggested restart prompt: Read docs/implementation/RESUME.md and the Engineering Constitution. Continue the first incomplete task in the recorded phase. Preserve existing changes and verified work. Reconcile any interrupted operation before retrying it.

## Boardroom decisions pending

- Funding and fee recognition when campaigns are rejected, paused or never launched.
- Moderation turnaround expectations; reviewer ownership and future delegation are confirmed above.
- Verify reported provider readiness during integration work; do not ask for secrets in chat.
- Collect each property's external channels and current PMS during host onboarding; owner-wide PMS knowledge is not a planning blocker. Verify the chosen connectivity provider's access, coverage and terms before integration commitment.

Documentation-only update: no API, schema, UI, financial or deployment mutation. Rollback is removal of this checkpoint and its Constitution pointer; preserve all implementation work.
