# HARVO — M7/M8 campaign experience implementation

Updated 13 September 2026. Evidence status: **SOURCE VERIFIED + TEST OBSERVED locally**. This report records the new host/admin surfaces and their HTTP contract checks; it does not accept a marketing milestone, certify the guest checkout, authorize spending, clear provider/legal gates, or establish a production-readiness score.

## Scope and reason

The previously inspected paid dashboard mixed simulated analytics and legacy funding/publication controls with social publishing. The new experience gives the host a revision-based campaign studio and the administrator an evidence-based review workspace over `/api/marketing/v2`. Every displayed amount, metric and delivery state comes from that API; missing evidence remains unavailable. The founder’s direction is profit markup on defined campaign costs, with a prospective introductory control of 3–5%, separate from booking commission.

Affected files: `components/marketing/CampaignStudio.tsx`, `AdminMarketingWorkspace.tsx`, `StudioShared.tsx`, `api.ts`, `types.ts`, `marketing.css`; mounts in `components/HostMarketing.tsx` and `components/AdminDashboard.tsx`. No property field, booking schema, guest presentation, payment authority, provider adapter or server-startup code is implemented by these UI changes. The additive backend and its migrations are recorded separately by the marketing execution track.

## Implemented host flow

1. Select an owned, published property from the API; choose Google Search or Meta; define an audience. Google uses explicitly resolved geo/language resources. Meta uses country codes permitted for the master account, not freeform city labels that would silently be ignored at dispatch.
2. Supply truthful creative and select one to six approved property media assets. Google primary copy is the first entry of the responsive asset arrays; exact/phrase keyword types survive editing. The Meta lead selector controls `mediaIds[0]`, which matches the provider request. A selected video requires a selected approved image for its thumbnail. Additional selected media support assessment and thumbnail preparation; the UI does not claim automatic creative experiments have run.
3. Define budget and advertising dates, plus a distinct guest stay window. Google shows a campaign total budget and an optional daily planning amount; total-budget flights require 3–90 inclusive days in the Google master account time zone. Meta shows its media/daily budgets with UTC flight dates. Stay nights use property local dates with checkout exclusive. Suggested advertising dates are editable planning inputs.
4. Confirm media rights, save a draft, request AI assessment and submit eligible content for review. Editing records an exact revision and requires fresh rights confirmation. Recommendations open the editor for deliberate revision; no model suggestion silently changes targeting, creative or money.
5. After exact-revision content approval, request an itemized quote. Monetary API values remain integer minor-unit strings; conversion to Number for formatting occurs only after safe-integer bounds checks. The quote displays supplied cost components, profit and statutory remittance tax once. A checkout URL is not captured money.
6. See independent AI, content, captured-funding, risk-release and provider-observation gates. Configured status, observed status and observation time remain separate. Impressions, clicks, CTR, profile visits, leads, bookings and spend show dashes when unavailable; counts never animate upward without evidence. Attribution is not presented as incremental booking lift.

## Implemented admin flow

The recent campaign journal supports search, review and exception filters. The workspace exposes creative, actual selected lead media, dates, budget, stay window, rights, countries and expandable Google copy/targeting before the decision controls. Approval requires both unchecked-by-default policy/media attestations and a meaningful note for the exact revision. A refreshed revision clears those attestations and notes. An unavailable AI assessment stays distinct from a pass and requires explicit human review.

Host refund requests use only the backend’s canonical `funding.refundableMinor`, with an explicit reason. There is no eligibility calculation from guessed spend or captured-minus-spend arithmetic. Pending and completed refund amounts remain distinct in both dashboards; a request does not mean settlement.

Hosts can request cancellation with an explicit reason before a provider identity exists, including a failed preflight that never created a provider claim. The server remains responsible for proving no provider operation, legacy entity or spend authorization exists before cancellation and release of a wholly unspent reservation. The UI submits the exact revision and stable intent key to `/campaigns/:id/cancel`, confirms the returned campaign identity and `CANCELLED` status, and removes the action for terminal or provider-created campaigns. Cancellation does not send a refund; the separate canonical refund eligibility controls any subsequent request.

Content approval, funding capture, risk clearance, paused provider creation and activation remain separate. There is no manual mark-paid control. “Send for provider review” requests paused creation; activation is a separate guarded action. Buttons reflect observed workflow eligibility while the backend remains authoritative. Configured account cost rules are read-only; the administrator changes only prospective markup with an expected policy version and reason. Existing quotes retain their terms.

## API and persistence contract

`GET /workspace` and `/admin/workspace` return projected listings, campaigns, a cost-policy summary and capability flags. Create/update calls submit host inputs only. Review includes revision, decision, note and explicit attestations. Quote, funding, publishing, activation and pause remain separate endpoints. UI create/action keys persist during uncertain retries and rotate after a confirmed user intent, allowing a legitimate pause → activation → pause cycle. Error responses retain safe support correlation IDs and actionable field paths.

The workspace refreshes every 30 seconds only while the document is visible, refreshes on visibility return, supports manual refresh and aborts superseded reads. It does not promise instant provider telemetry. Lists are labelled recent because the current backend bounds campaign/property results; complete pagination remains backend/product follow-up.

The legacy host social studio remains separately accessible. Its paid campaign/wallet/geo-router calls, paid success-query handling, paid polling and boost entry are gated when mounted in social-only mode. The admin’s unrelated social/SEO/operations controls remain reachable separately; the new paid workspace does not run the legacy campaign-list fetch. Preserving these branches is not proof that every legacy social/operations interaction has been browser-tested.

## Local verification

`docs/harvo/m7_m8_ui_qa.mjs` builds only the new components with the existing esbuild and Playwright dependencies. It starts a temporary loopback server, intercepts the versioned API with clearly labelled isolated fixtures, blocks external network requests, uses no application server/real customer media/credentials, and closes the browser and server in `finally`.

- **29 browser checks passed:** rights gating; Meta creation monetary strings; Google total-budget submission with omitted daily planning; 3-day minimum; explicit keyword match types and stay dates; null metrics; disabled unconfigured funding/publication; keyboard-operated creative layout; host widths 320/390/900/1440 and admin widths 320/390/768/1024/1440 without horizontal overflow; exact-revision approval; cleared attestations after revision refresh; same request key on an uncertain pause retry and a fresh key for the next confirmed pause intent; refund controls hidden without canonical eligibility, full available refund amount sent as a string and pending status without claiming settlement; cancellation reason gating, exact revision/body, retry key retention, terminal concealment and no cancellation button for a provider-created campaign; no browser runtime errors.
- Screenshots inspected: host creative desktop, Google budget desktop and admin review mobile. Latest generated directory: `/Users/ajit/Documents/EnchoSpaceNew/docs/harvo/artifacts/m7-m8`. Screenshots and the verification manifest are durable local QA evidence, not production property assets.
- Targeted TypeScript check passed for the new components and both mounts. The root integration owner records the complete application build and full-suite result separately.
- `src/test/harvo/router_contract.test.ts`: **13/13 HTTP contract tests passed** with the real Express router, workflow, financial services and an isolated PostgreSQL cluster. Tests cover persisted-account roles including demotion/promotion, tenant isolation, strict authority-field rejection, actionable errors, concurrent creation idempotency, Google explicit settings, revision invalidation, unavailable AI, review attestations, cost-plus strings, checkout-not-capture, one paused-publication job, prospective policy isolation and refund authorization/pending-settlement/idempotency contracts. Auth and AI/payment transports are injected test doubles; no real gateway/provider call is made. A first run timed out in local `initdb` during machine contention before tests ran; the clean rerun passed. One initial assertion expected zero where the real API correctly returned null before capture; the assertion was corrected to preserve missing-evidence semantics.

Reproduce from this workspace:

```sh
env -i PATH="$PATH" node docs/harvo/m7_m8_ui_qa.mjs
env -i PATH="$PATH" node node_modules/vitest/vitest.mjs run --config vitest.marketing-m1.config.ts src/test/harvo/router_contract.test.ts
env -i PATH="$PATH" node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --jsx react-jsx --esModuleInterop --skipLibCheck components/marketing/CampaignStudio.tsx components/marketing/AdminMarketingWorkspace.tsx components/HostMarketing.tsx components/AdminDashboard.tsx
```

## Limits, risks and rollback

These checks establish local UI behavior and selected server contracts. They do not establish merchant onboarding, provider permissions, successful live payment, successful Meta/Google delivery, real telemetry latency, conversion lift, representative production load or full guest booking acceptance. Google location lookup and finer-grained Meta targeting require further supported API work; no universal “best audience” is invented. The present initial Meta request uses one selected lead asset, not an empirically proven DCO optimizer. Core booking/legal/provider clearance and the root execution gates still control spending.

UI rollback can detach the new mounts while preserving the components and all durable v2 evidence. Do not reactivate unsafe legacy paid publishing or synthetic success as a rollback. This report supersedes any claim that the new surfaces need simulated metrics, automatic payment confirmation or dopamine counters to look complete. It does not rewrite historical accepted contracts or replace the controlling decision register.
