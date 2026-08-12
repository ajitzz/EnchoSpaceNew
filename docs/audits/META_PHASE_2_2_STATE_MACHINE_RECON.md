# Phase 2.2 — State Machine Reconnaissance (Current Source)

## A. Observed Campaign States
- `draft`
- `pending_webhook`
- `pending_approval` / `pending`
- `rejected`
- `escrow`
- `ASSET_PREP`
- `META_API_PUSH`
- `CAMPAIGN_LIVE` / `active`
- `paused`
- `cancelled`
- `killed`
- `failed_publish` / `failed`

## B. Observed State Transitions & Locations
The current source already implements a centralized Finite State Machine (`transitionCampaignState`) with the following graph defined in `VALID_TRANSITIONS`:
1. `draft` -> `pending_approval`, `pending`, `rejected`, `pending_webhook`, `cancelled`
2. `pending_webhook` -> `pending_approval`, `pending`, `escrow`, `ASSET_PREP`, `failed`, `cancelled`
3. `pending_approval` / `pending` -> `rejected`, `escrow`, `ASSET_PREP`, `cancelled`
4. `rejected` -> `pending_approval`, `pending`, `cancelled`
5. `escrow` -> `ASSET_PREP`, `cancelled`, `failed`
6. `ASSET_PREP` -> `META_API_PUSH`, `failed`, `cancelled`, `paused`
7. `META_API_PUSH` -> `CAMPAIGN_LIVE`, `active`, `failed`, `failed_publish`, `cancelled`
8. `CAMPAIGN_LIVE` / `active` -> `paused`, `cancelled`, `killed`
9. `paused` -> `CAMPAIGN_LIVE`, `active`, `cancelled`, `killed`
10. `failed_publish` / `failed` -> `ASSET_PREP`, `cancelled`, `killed`

## C. Code Locations (Centralized Engine)
The single authoritative mutation function is located at:
`transitionCampaignState({ campaignId, expectedCurrentState, to, reason, actorType, actorId, correlationId, tenantId, client })` (around line ~53 in `server.ts`).

## D. Legitimacy
All transitions are mapped appropriately to business logic steps.

## E. Accidental / Unsafe Transitions
None observed. All transitions now pass through the FSM engine.

## F. Impossible Transitions
`cancelled` and `killed` are terminal states (no outgoing transitions allowed).

## G. Frontend Assumptions
Maps to `pending`, `active`, `paused`, `rejected`, `failed`.

## H. Database Constraints
The FSM holds a row-level lock (`SELECT ... FOR UPDATE`) during transitions and ensures a single transaction context for the campaign status update and `meta_publishing_events` insertion.

## I. Webhook-Driven Transitions
Handled safely via FSM idempotency. Webhook states mapped appropriately.

## J. Worker-Driven Transitions
Mapped via the `dispatchMetaCampaign` worker into `META_API_PUSH`, `CAMPAIGN_LIVE`, and `failed`.

## K. Rollback Transitions
`failed_publish` is correctly defined for when a rollback occurs.

## L. Payment Transitions
Mapped into `escrow` or `ASSET_PREP`.

## M. Meta Synchronization Transitions
`active` and `paused` correctly handled via explicit API reconciliation responses.

**Conclusion:** The read-only reconstruction confirms the centralized FSM is present and the direct `UPDATE` mutations have been successfully eliminated from the codebase.
