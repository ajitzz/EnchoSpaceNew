# P2 session and workspace boundary

Status: implementation in progress, local only. Authority: CR1 Phase 3 directive and blueprint FR-A01–A20.

## Impact and design

The existing consumer JWT and binary admin role cannot establish workforce authority. A new read-only operations API uses a separate opaque staff-session credential, stored only as a SHA-256 digest in migration 036. A narrowly scoped SQL authentication function resolves an exact digest to an active session, active membership and active organization. It returns no emails, invitation tokens, factor proofs or provider credentials. Possession of a valid session still does not grant a permission.

The authentication function is owned by the non-bypass migration role, has a fixed search path, runs with row security enabled, is revoked from PUBLIC and is explicitly granted to the restricted workforce runtime role. Workspace queries establish transaction-local principal context, take the same authority fence used for commands, and apply RLS. Revoked/expired sessions cannot refresh a workspace. Desk affordances are projections of effective scoped grants, not authorization receipts. Assignment commands remain unavailable until their transactional services exist.

The API is additive at `/api/operations/v1/workspace`. A dedicated `CR1_WORKFORCE_DATABASE_URL` must identify a tested non-owner runtime login. No fallback to generic production database credentials is allowed. Staff session issuance, verified identity enrollment and step-up proof generation are separate adapters; a user role, browser claim or manually entered email cannot mint them. The UI must show unavailable/sign-in/error states truthfully when these adapters are not deployed.

## Validation and rollback

- Real PostgreSQL: active token resolution; wrong digest, expiry, revoked session, suspended membership and organization return no principal; consumer/admin role cannot substitute for a staff session.
- HTTP: missing/malformed bearer returns 401 without logging the credential; missing dedicated runtime returns 503; tenant/session data must not leak in errors.
- Workspace: only current member assignments and safe labels; permission expiry/revocation removes desk affordances; no provider/internal financial payloads.
- Rollback: disable the operations route configuration, retaining additive schema and immutable evidence. Existing consumer/marketing routes retain their compatibility contract. Deployment must apply migration036 before checksum-based readiness can accept the new application manifest.

No production login, MFA provider, staging deployment or full P2 acceptance is claimed by this boundary.
