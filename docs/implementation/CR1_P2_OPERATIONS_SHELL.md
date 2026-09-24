# CR1 P2 Operations Shell — Impact and Delivery Design

**Date:** 24 September 2026  
**Authority:** Founder CR1 execution; Discussion 037-H1/L; blueprint FR-A01/A02/A15, P2/E3/E11; IAM technical design §12  
**Scope:** Additive presentation contracts, Operations Shell components and isolated component/browser tests. The parallel integration slice owns the secured workspace API, opaque staff-session resolution and application route integration.

## Verified starting point and problem

Existing marketing, AdTech, settlement and recovery workspaces exist, but the legacy Admin Dashboard assumes broad account-level admin status. The accepted workforce architecture requires a separate active organization membership/session, resource-scoped capabilities, assigned work and fresh execution-time checks. A new shell must not translate `users.role=admin` into staff privileges or fabricate production work to populate the design.

## Proposed implementation and impact

| Area | Additive change | Boundary and regression control |
|---|---|---|
| Shared contract | `src/shared/iam/workspace.ts`: strict Zod projection and action request types | Reject unknown fields, duplicates, invalid leases and assignments pointing outside projected desks. No tokens, raw provider identities or guest message bodies. |
| UI | `components/operations/OperationsShell.tsx` and scoped CSS | Explicit loading, denied, unavailable, stale-session, malformed/error and ready states. Responsive navigation, My Work, assignment evidence and audit/workforce summaries. |
| Navigation | Fixed server-projected desk IDs with `/operations` deep links | No role inference. Unauthorized direct desk requests render an access-denied state. Root supplies navigation and secured data. |
| Assignment actions | Callback commands carry assignment ID, expected version/fence and stable per-attempt idempotency identity | Only server-projected actions are offered. Expired authority/lease, terminal work or pending request blocks action. No optimistic completion or production network implementation in this slice. |
| Evidence | Server order, source timestamp, lease expiry, blocker reasons and correlation identifier | Do not invent SLA ranking, live delivery, overdue significance or confidence. Page totals and pagination must be server-provided. |
| Accessibility | Semantic landmark/navigation/headings, visible focus, descriptive buttons, status messages, reduced-motion and 360px layout | Component behavior tests and isolated desktop/mobile browser verification; integrated identity and domain-API testing remains separate. |

The initial secured workspace projection may deliberately contain no executable assignment actions while the corresponding command endpoints are still absent. Displaying an authorized navigation entry is not authorization for its nested domain APIs.

## Validation and rollback

Run only the shell/shared-contract focused suite, focused lint and TypeScript while iterating. Test missing/extra permissions, invalid projection, stale session/evidence, lease expiry, callback deduplication, claim receipts, failure recovery, inaccessible deep links, empty state and keyboard-accessible controls. Root performs full P2 exit checks after integration. Rollback hides the additive `/operations` route and disables the workspace feature; canonical workforce and audit records are preserved. No existing marketing desk or database authority is replaced by this presentation slice.

## Remaining operational gates

The component does not bootstrap owners, invite staff, accept a grant, provide MFA, waive checker policy, or establish production readiness. Live assignment mutation requires independent API authorization and transaction-fenced services. The exact staffing, support and owner-policy approvals remain in the external gate register.

## Delivered local evidence — 24 September 2026

- `src/shared/iam/workspace.ts` defines the strict bounded projection and fenced action request. Correlation identifiers use the common principal-trace schema; no consumer account role, provider credential or message body is accepted by this contract.
- `OperationsShell` renders only projected desks/assignments. Session/member revocation or expiry removes private work; stale workspace evidence removes executable affordances. An assignment callback retains its idempotency identity even after an accepted receipt until refreshed version evidence changes the logical request. Unknown results preserve that identity; membership changes discard stale callback results. No command changes assignment state optimistically.
- The initial read-only API integration intentionally emits no assignment commands. Claim/release/handoff callbacks are presentation contracts, not evidence that live mutation endpoints or staff identity issuance are complete. The isolated browser fixture is explicitly test-only and never supplies production data.
- **24/24 targeted component and contract tests passed.** Focused ESLint, strict isolated TypeScript and whitespace checks passed. This is not a complete repository regression sweep.
- **16/16 Chromium scenarios passed** across 1440px desktop and 360px mobile. Checks cover first-tab skip-link focus, permitted desk navigation, version/fence callback, canonical refresh, stale evidence, empty/denied states, clock-driven session expiry and horizontal overflow. Desktop/mobile ready-state screenshots were visually inspected. The harness blocks all non-local network requests and never imports `server.ts`, `.env` or a database runtime.

Reproduce:

```sh
npx -y node@24 scripts/testing/run.mjs src/test/cr1_operations_shell.test.tsx --reporter=dot
npx -y node@24 scripts/testing/cr1-operations-browser/run.mjs
```

The browser runner prints its disposable artifact directory containing screenshots and `receipt.json`. Evidence covers the Operations Shell presentation slice only; it does not accept all of Phase P2, certify WCAG compliance, verify staff sign-in delivery, or grant production authorization.
