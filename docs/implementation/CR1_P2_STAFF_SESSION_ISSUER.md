# CR1 P2 — Isolated Google identity and workforce session issuance

Status: locally implemented and verified. Design/impact was recorded before
implementation. No production identity policy, real provider login, session or
MFA acceptance is claimed.

## Verified gap and bounded design

The existing operations reader resolves opaque staff sessions but cannot create
them. Consumer Google verification lacks a server nonce and is not a workforce
issuer. A consumer JWT, browser email, account admin flag or Google `amr` field
must not establish staff authority or fabricate AAL2.

Implement a separate Google OIDC verifier, isolated EXECUTE-only session issuer,
versioned identity policy, one-use login challenge and immutable identity receipt.
Start returns a public Google nonce/client ID plus a separate private random
browser binding for an HttpOnly cookie. Only hashes are stored. Complete verifies
the signed ID token outside database locks, then atomically consumes the challenge
and creates an AAL1 `wfs_` session after current account `google_id`, exact email,
organization, membership, grants and policy checks. No account auto-creation or
email-based account linking occurs. The existing account must already be linked
through its canonical verified identity flow.

Google OIDC validates issuer, audience, expiry, signature and subject; Encho adds
required nonce/browser binding, short token age and strict environment/policy
binding. Google identity proves neither independent MFA nor a new Google login
time: `iat` is token issuance, not authentication. See [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect).
Email authority is limited to Gmail or verified Google Workspace identities;
non-Google-hosted addresses need separate verification and are denied here.
See [Google ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Impact, permissions and risk

- Own new `staffSessionIssuer.ts`, Google verifier, deployment readiness, focused
  tests and this document. Coordinate only the unpublished migration036 append;
  parent owns HTTP operations composition and frontend.
- All added tables FORCE RLS. Dedicated issuer role gets bounded EXECUTE only,
  never raw table writes, migration-owner membership or broad runtime privilege.
- Explicit workforce Google client configuration must match a current reviewed
  identity policy. No fallback to consumer OAuth config. Production additionally
  requires the current IAM operational policy and identity policy to be approved.
- Lifetime, allowed hosted domains/Gmail policy and login quotas are versioned;
  seeds cannot claim founder approval. Google-only sessions remain AAL1; existing
  protected commands still require independent action-bound factor evidence.
- Own logout revokes exactly the presented session and its pending factor/action
  evidence, serialized with membership/offboarding fences. Guest/host identity and
  other staff sessions remain separate.
- HTTP integration must use same-origin POST, CSRF protection, account/IP limits,
  no-store responses and separate Secure/HttpOnly/SameSite cookies. No tokens in
  URLs, logs, localStorage or public response projections.
- No real Google token/JWKS request runs in tests. RSA-signed fixtures and bounded
  fake HTTP transport test actual cryptographic verification.

## Verification and rollback plan

Test signature/issuer/audience/nonce/time/email authority, algorithm confusion,
unknown/rotated keys and cache coalescing, malformed/oversized/failed JWKS; test
real non-BYPASSRLS roles for challenge replay/expiry, browser mismatch, suspended
membership, changed policy, concurrent completion, hash-only token storage,
independent AAL1, logout, audit rollback and unknown commit outcomes.

Disable issuer HTTP configuration and revoke its function grants for rollback;
retain identity/session evidence and use audited revocation for issued sessions.
The full P2 release sweep and actual production identity/MFA rollout remain
separate gates.

## Integration contract and current evidence

`StaffSessionIssuer` uses a dedicated pool and an independently configured
`GoogleWorkforceIdentity(clientId)`. Configuration is server-only:
`environment`, `organizationId`, `googleClientId`. The HTTP composition must use
an explicit workforce client ID distinct from the consumer login client ID.

| Method | Input | Public result | Private transport result |
| --- | --- | --- | --- |
| `begin()` | Server-fixed configuration | Challenge UUID, Google nonce, client ID, expiry | Browser verifier for a separate HttpOnly cookie |
| `complete()` | Challenge UUID, browser verifier cookie, Google ID token, correlation ID | Session/member/organization/account IDs, AAL1, authentication/expiry timestamps | Opaque `wfs_` session credential for the workforce cookie |
| `logout()` | Workforce cookie credential, correlation ID | `LOGGED_OUT` | None |

Never serialize the complete method result; only `.public` is response data.
Do not log credential inputs. Authentication never upgrades the session itself
to AAL2. Existing privileged-action checks still require a separate verified,
action-bound factor. `providerAuthenticatedAt` is null when Google omits
`auth_time`; token issuance time is not silently substituted.

`staffSessionIssuerGrants(role)` emits only schema usage and four exact function
EXECUTEs. `verifyStaffSessionIssuerCatalog(client)` checks the connected role,
raw-table/column privilege absence, FORCE RLS, exact owner-only policies, bounded
non-bypass definers and immutable evidence. Base IAM readiness also recognizes
and verifies the three narrow issuer owner policies. The migration owner needs
only the documented user identity column read grants and row-lock grant; the
issuer must not inherit that owner or use the shared runtime connection.

Invitation subject hashes and login receipt subject hashes use SHA-256 of the
exact UTF-8 Google `sub`. Email hashes use normalized lowercase trimmed email.
Missing or ambiguous canonical account identity fails closed; no implicit
linking or account creation occurs. An accepted invitation must match its
persisted independent identity receipt.

Logout briefly holds the exclusive IAM-policy fence before the member fence,
preventing deadlocks across checker-linked authorizations. It revokes one
session, expires that session's unused factors and cancels its outstanding
maker/checker actions with an immutable session receipt; other sessions remain
separate. A lost commit acknowledgement returns `OUTCOME_UNKNOWN`; it never
returns a fabricated credential or replays a consumed challenge. An orphaned
credential cannot be recovered and expires at its bounded session deadline.

Verified locally on 24 September 2026:

- Final targeted Google cryptographic verifier + issuer run: **35/35** (19
  verifier and 16 real-PostgreSQL issuer tests), zero skipped. The verifier uses
  RSA-signed fixtures and fake fixed-endpoint JWKS, including actual key rotation.
- Prior combined issuer/invitation/bootstrap/lifecycle compatibility run:
  **57/57** (the issuer subsequently gained the null/ambiguous identity test).
- Core IAM, assignments and privileged actions with the issuer appendix:
  **40/40**. Tests execute the actual unpublished migration 036 under disposable
  local PostgreSQL, not remote Neon.
- Scoped strict TypeScript and ESLint passed for the issuer, verifier, readiness
  and focused tests; the parent owns the complete P2 release sweep.

Remaining boundaries: no production policy is auto-approved or seeded; no live
Google login was attempted; no enrollment/recovery or independent-factor
adapter is claimed by this slice. This contract signs in an already accepted,
prelinked workforce member. Invitation UI/verified acceptance composition is a
separate integration. No session refresh or idle extension is provided; login
expires conservatively at the earliest configured idle/absolute/member bound.
Challenge/evidence retention still requires the approved security retention
policy. New identity policies affect future logins; immediate staff removal uses
the audited lifecycle/revocation path.
