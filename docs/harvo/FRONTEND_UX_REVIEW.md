# HARVO — Frontend experience review of Gemini's suggestions

Date: 20 September 2026. Baseline: `main` at `e832db6` plus the existing dirty worktree. Status: **source-backed review and selective plan refinement; no production UI or financial implementation**.

The founder requests independent evaluation, discussion and incorporation of useful ideas, not automatic adoption of Gemini's audit. Encho remains the complete host interface for managed advertising. A compelling interface must help the host understand and control their investment; activity graphics cannot confer financial, delivery or measurement authority.

Controlling records: [Constitution](../ENCHO_ENGINEERING_CONSTITUTION.md), [HARVO](../../HARVO.md), [decisions](DECISIONS.md), [remediation plan](../implementation/HARVO_PRODUCTION_REMEDIATION_PLAN.md), [telemetry assessment](TELEMETRY_OBSERVATION_REVIEW.md). This review does not certify the financial core, provider integrations, browser accessibility or production readiness.

## 1. Claim-by-claim verdict

| Gemini suggestion/claim | Verified implementation and qualification | Engineering verdict |
|---|---|---|
| Cream/green visual language, serif type, responsive columns and alternate previews form a good base | `marketing.css` contains the cited colors, Georgia headings, breakpoints, focus outlines and reduced-motion rules. `CreativePreview` switches 4:5/9:16 layouts and labels them previews | Preserve and extend the existing design system. Code presence is not a measured contrast, mobile, keyboard or rendered-layout pass. |
| Investment card is tabular and there is no spend gauge | `QuoteCard` in `StudioShared.tsx:33` itemizes accepted costs, markup and total. `CampaignPlanDetails` separately displays media allocation. No consumption gauge appears in these components | Add an evidence-based media-budget meter alongside the quote, not in place of financial disclosure. |
| Turn the gauge amber below 20% | No such threshold exists in the inspected UI | Accept as a candidate presentation threshold, not a financial stop rule or guaranteed runway. Confirm comprehension in UI testing; never imply that a green gauge guarantees safe spend. |
| Add an active-campaign Refuel action | No top-up action exists in the inspected v2 router/studio. Provider adapters have `updateBudget`, but `financeBridge.ts:140` rejects amounts above immutable campaign allocation | Valid product extension, deferred behind a separate funding-amendment contract. Provider mutation support is not an end-to-end authorized top-up workflow. |
| Five static progress gates need clearer feedback | Actual component is `CampaignProgress`, not `CampaignProgressGates`. It uses complete/not-complete booleans; unsuccessful gates share a clock icon. It explicitly labels the gates independent | Accept richer per-gate states and plain language. Do not introduce a fictional sequential progress percentage or one permanently pulsing “current step.” |
| Display generic 12–24h estimates | The host funding type exposes `released`, not a risk-release timestamp. Provider review completion is not established by current UI data | Reject a universal duration. Add specific timestamps or qualified estimates only from authoritative, applicable evidence. |
| Budget sliders should forecast ROI/clicks/inquiries | Current budget controls are decimal text inputs, not sliders. No outcome forecast is computed in this creation path | Defer forecasting; the report supplies no validated model or benchmark dataset. Planning arithmetic may be shown without claiming results. |
| One-click listing prefill is missing | `CampaignGuidance` already requests listing-based suggestions, presents exact citations and requires an unchecked accuracy confirmation before applying. Server validates ownership/publication and grounding; route enforces request budget | Correct the audit. Improve this existing flow rather than building a competing AI/prefill service. Structured amenity inputs are not part of its current title/city/description source contract. |
| Green live beacon and calibration state | `MetricsPanel` honestly distinguishes unavailable from zero, but lacks granular freshness/report states. Current delivery adapters do not establish serving for enabled campaigns; see telemetry review | Accept evidence-driven status and metric empty states after T1–T4. Reject a green beacon based on local LIVE, configured ACTIVE or lifetime impressions alone. |
| Admin buttons disable silently | Generic blockers, capability reasons, funding records and action explanations already exist. Individual disabled actions do not consistently identify their exact unmet prerequisites | Partly valid. Add server-derived, per-action reasons with accessible inline explanations; do not rebuild the operations console. |
| Add reconciliation controls | Existing operations/readiness and provider control mechanisms exist, but recovery UX needs the evidence classification already planned in R6 | Reuse R6 safe recovery. Reject clear-lock/reset-to-APPROVED shortcuts, duplicated reservations and automatic uncertain retries. |

Source scope: host/admin studios, shared components/types/API/CSS, guidance service/contract/router and tests, financial authorization/checkout, provider budget-control paths and current monitoring plan. This is targeted semantic review of those boundaries, not a line-by-line certification of the entire repository. No live provider response or production database was inspected.

## 2. Budget presentation: allocation, reported spend and available funds differ

Proposed component: `CampaignBudgetMeter`, using existing `--mkt-` tokens, beside the retained `QuoteCard`. Its denominator is the effective authorized media allocation for the exact campaign/provider/account/budget version. Its numerator is reported media spend for a compatible currency and flight/report window. Total checkout charge includes other costs and markup and is not the media denominator. A selected partial-date report must not be subtracted from the full-flight allocation as if it were cumulative spend.

Use integer minor-unit arithmetic. A bounded percentage is a display calculation only. If reported spend exceeds allocation, show the actual excess explicitly even if the bar itself stops at 100%. Missing currency, incomparable windows, missing baseline or stale/unknown reporting renders a qualified unavailable/last-known state. Retain late corrections, including valid decreases; do not force a visually increasing counter.

Labels should distinguish “Media allocation,” “Reported ad spend,” “Estimated unspent allocation,” and “Available to refund.” The third is provisional when reports lag; the fourth comes exclusively from financial records. No front-end subtraction grants a refund, funds a new campaign or authorizes more provider spend. Never animate spend between samples or calculate hours remaining from a daily planning amount as if it were constant provider burn.

Low-budget status may use amber plus text/icon. Safety pauses can occur well before 20% because of stale evidence, risk, inventory or other protection rules. Display their actual reason. Keep pause, refund eligibility and support visible; omit artificial countdowns and guaranteed-growth copy. An engaging meter must not hide a failed observation or push funding while a policy/account incident is unresolved.

## 3. Progress, status and outcomes use separate evidence

Extend the shared server projection with per-gate states such as complete, queued, processing, waiting, blocked, failed and unknown/stale, each bound to the current relevant revision and evidence time. These are proposed presentation states, not unreviewed new workflow transition authority. The API continues to revalidate every action transactionally.

Suggested host wording, conditional on actual evidence:

| Evidence | Host presentation |
|---|---|
| Exact-revision review approved | Content approved |
| Signed payment capture accepted; risk hold unresolved | Payment received · safety checks pending |
| Known risk-release deadline, checks still required | Eligible for the next check after [date/time]; further checks may still block launch |
| Publication only queued | Preparing your ad |
| Provider creation confirmed paused | Ad created · paused |
| Review explicitly pending at provider | Ad network review pending |
| Recent, appropriately scoped delivery evidence | Delivery recorded during [window]; last checked [time] |
| No initial report; status read succeeded | Performance report not available yet · status checked [time] |
| Observation failed or worker overdue | We could not update this campaign · showing last known information |
| Pause requested but not read back | Pause requested · confirmation pending |

Do not call absent reporting “calibration” unless the provider actually establishes that state. A historical impression establishes historical delivery, not current serving. A successful status check does not freshen an old spend report. Internal confirmed bookings/inquiries and provider metrics retain distinct provenance and completeness under T3. No host needs an external ad-manager login to resolve these states; Encho owns operational follow-through.

Only animate a genuine bounded operation. A queued request is not a worker actively processing, and an elapsed timer does not prove progress. Stop transient animation on success, error, staleness or timeout. Preserve existing reduced-motion support; prefer static indicators for long waits. Routine metric refreshes should not repeatedly interrupt screen readers or move keyboard focus. Let users freeze the visual feed/read last-known data without stopping backend observation or safety controls, and label the frozen view.

## 4. Admin action clarity and safe recovery

Proposed shared `ActionAvailability` projection: action identifier, permitted/not-permitted, current revision, reason codes with safe text, observation age and supported next action. It should derive from the same checks used by the mutation path, avoiding an independently drifting UI policy. Recheck at execution because eligibility can change after rendering.

Show unmet prerequisites beside each affected action. A hover tooltip on a disabled, non-focusable button is insufficient. Preserve exact-revision review checkboxes, written rationale, authorization, idempotency, fencing and append-only audit. Client-side builder validation still supplies field-level input help; the server remains authority.

Host copy explains business impact and Encho's next step. Admin diagnostics may add sanitized provider error class, operation/job/request correlation, timestamp, original account binding and recovery case. Raw tokens, payloads and cross-host records stay excluded. Preview the expected safe recovery action; never call uncertainty “retry available” simply because a button can be enabled. R6's no-dispatch, rejected, partial/unknown and confirmed-success classifications remain controlling.

## 5. Top-ups require an amendment lifecycle

**Deferred design extension; not an implemented or founder-approved financial contract.** Existing quotes, captures, reservation identities and campaign revisions must remain intact. Adding money cannot be implemented by raising `mediaBudgetMinor`, rewriting the original quote or deleting the spend-authorization dedupe key.

A future contract must specify:

1. An immutable proposed amendment linked to the original campaign/account and expected budget version, including incremental media, applicable cost/markup/tax treatment, expiry, and host acceptance of the exact additional charge. Resolve fixed-cost duplication and commercial/legal treatment explicitly.
2. Idempotent checkout and verified capture for the amendment, with refunds, chargebacks and risk holds correctly scoped. Browser payment success never makes additional funds spendable. New funds do not silently bypass risk review or alter the original capture's history.
3. A transactional allocation/authorization model supporting aggregate authorized budgets and existing settlement semantics. Concurrent amendments, cancellation, pause, refund and provider observations must serialize correctly. Existing one-quote/one-revision authorization cannot merely be relaxed.
4. Durable provider operations pinned to the original account, currency, budget kind and flight. Check the exact old amount, apply the authorized new amount, and verify readback. Unknown outcome retains its operation identity and quarantines further changes until reconciled. Never route it to another account or send another blind increase.
5. An explicit activity policy: initial design should prefer confirmed pause before amendment, verified budget change, fresh inventory/content/risk/account checks and explicit reactivation. Validate provider constraints and stop exposure before choosing any truly uninterrupted flow. A successful top-up must not auto-resume an independently paused campaign.
6. A visible amendment lifecycle: awaiting payment, captured/held, eligible, provider update pending, verified effective, failed or reconciliation required. The gauge uses the newly effective allocation only when its budget version is confirmed; pending cash remains separately visible.

Required proof includes duplicate capture, concurrent clicks/operators, lost provider response after success, partial amendment, expired flight, invalid currency/account, stale budget readback, refund/chargeback races, overrun and settlement invariants. Until then, do not expose an actionable Refuel button or redirect ordinary full-quote funding into a supposed top-up.

## 6. Prefill and forecasts

Keep `CampaignGuidance` as the single reviewed-copy flow. Its current server uses bounded title/city/description source phrases, rejects unsupported claims, binds a listing evidence hash and requests human review; the UI discards asynchronous responses after property/channel switches. Preserve these safeguards. Improvement candidates are better discovery, previewing which fields will be replaced, and preserving user-edited copy unless replacement is explicitly accepted. Revalidate changed listing evidence before final assessment/approval. A separate exact-title shortcut, if useful, must obey channel length limits and the same draft-validation boundary.

Adding structured amenities requires an authoritative allowlisted listing projection and provenance; do not scrape arbitrary client text or have the model invent missing amenities. Draft convenience never approves media rights, location targeting, spend or performance.

Defer ROI/inquiry/delivery forecasts until there is a defined target metric, provider/channel/geo/date/currency-compatible input source, enough representative data, versioned method, evaluation against actual outcomes, uncertainty interval and freshness/coverage policy. Click estimates do not establish incremental bookings or profit. An LLM-generated range is not statistical evidence. Show no forecast when evidence is insufficient. Simple allocation and flight arithmetic can help hosts plan but must be labelled as planning, especially Google's optional daily planning amount.

## 7. Delivery sequence, impact and acceptance

Add U1–U5 to remediation plan section 10 under R5–R8. R0–R2 safety/privacy containment still comes first. T1–T3 supply the authority for U1–U3; a UI mock must never become a substitute data source.

| Surface | Proposed impact | Validation/rollback |
|---|---|---|
| Shared UI/CSS | Budget meter, gate details, evidence state, action explanations; retained quote/refund disclosures | Empty/zero/stale/overrun/long-copy/mobile/zoom/keyboard/screen-reader/reduced-motion tests. Roll back presentation while retaining honest unavailable states. |
| API/types | Add scoped budget provenance, freshness, per-gate/action reason contract and relevant hold deadline | Contract tests for host/admin parity, tenant isolation, stale revisions and omitted/unknown fields. Missing fields default unavailable, never permission. |
| Observation persistence | Reuse T1/T2 evidence and R6 recovery records; no duplicate UI authority store | Review actual ADR/migration before implementation; preserve snapshots and operation history. |
| Financial system | No change for display-only work; future top-up needs a separate ADR/schema/API and settlement analysis | No enabling feature switch until financial/provider fault tests and existing legal gates pass; rollback never deletes new financial events. |
| Forecasting/prefill | Reuse existing guidance; optional source-contract extension only when justified | Property/channel switch, unsupported claim, overwrite, evidence staleness and quota tests; no forecast without validated data. |

Accessibility acceptance uses text/shape alongside color, programmatic status messages and control of nonessential movement/auto-updating content. These are requirements to verify, not an accessibility certification from reading CSS. Sources: [W3C use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [W3C pause/stop/hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), [W3C status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

## 8. Observed verification and limits

On 20 September 2026, ran the existing `campaign_draft_guidance.test.ts` and `campaign_guidance_ui.test.ts` with `vitest.marketing-m1.config.ts` and `--configLoader runner`: **48 tests passed across two files**. Fixtures exercise ownership, bounded grounded suggestions, unavailable output, explicit review and stale selection handling. They do not verify new budget/telemetry UX, deployed model behavior, provider budgets, browser rendering or end-to-end production safety.

Only review/plan/memory documents changed. No production application code, schema, provider state, payment, commit or deployment changed. R0–R8 remain pending; this review adds no completed remediation milestone.
