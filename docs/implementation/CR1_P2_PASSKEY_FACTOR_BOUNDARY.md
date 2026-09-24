# CR1 P2 — Action-bound workforce passkey boundary

Status: cryptographic verifier and narrow durable proof chain implemented and
locally verified. Design/impact was recorded before implementation. Production
policy, trusted enrollment and recovery remain unresolved; no live enrollment or
production factor is claimed.

## Verified gap

Migration 036 and `PrivilegedActions` require a persisted, fresh, action-bound,
single-use `internal_step_up_challenges` receipt. Shared runtime can read its own
receipt and consume one through protected transitions; it cannot verify a factor.
The new Google issuer establishes AAL1 only. Treating a Google token's issuance
time or `amr` as independent MFA would bypass the intended boundary.

The boardroom requires independent step-up and recommends passkeys. It does not
approve a specific production relying party/origin, authenticator enrollment and
recovery workflow, synced-passkey policy or initial owner credential evidence.
An enrollment route that turns any submitted public key into an active privileged
factor would create a new takeover path and is explicitly excluded.

## Bounded implementation plan

1. Add an exact pinned `@simplewebauthn/server` dependency after checking its
   official API and Node compatibility. Do not implement WebAuthn cryptography,
   CBOR or signature conversion by hand in production code.
2. Build a strictly validated verifier requiring exact origin/RP ID, server
   challenge, credential ownership, user presence and user verification, with
   signature-counter and device/backup policy checks. Reject cross-origin/iframe
   and unknown extension behavior unless separately approved.
3. Bind each pending ceremony to current membership, workforce session,
   environment, current IAM/factor policy and exact privileged command hash.
   Persist only challenge/evidence hashes, never authenticator private material.
4. Use a dedicated EXECUTE-only writer for durable challenge creation and atomic
   acceptance. Revalidate current session/membership and reviewed credential,
   consume the nonce once, compare-and-swap the stored credential counter and
   create the existing privileged-action factor receipt in the same transaction.
   A cryptographically valid response alone must never mutate broad role/session
   authority or bypass maker/checker.
5. Keep enrollment/recovery unavailable without an independently reviewed trusted
   registration receipt and current approved policy. Synthetic signing fixtures
   may provision credentials in disposable PostgreSQL for tests only. They must
   never become a runtime fallback, seeded identity or production acceptance.
6. If this cannot be implemented without inventing enrollment authority, retain
   only the cryptographic verifier and fail-closed integration contracts until
   the missing reviewed chain exists. Document the remaining gap honestly.

## Impact and integration

Own new `src/lib/iam/factors/`, focused tests/readiness and this document. Any
unpublished 036 appendix is coordinated after the workforce review helper;
parent owns HTTP/UI composition, and another agent owns migration 038. Existing
consumer identity, finance/provider commands and session assurance stay intact.
The frontend must get action options only from the server and send the browser
assertion unchanged; browser-declared assurance is never input authority.

Expected risks: credential recovery bypass, stale policy/session between verify
and commit, two simultaneous assertions racing the same counter, cloned counter,
replayed nonce, unsafe synced credential assumptions and leaked enrollment PII.
Use current policy hashes, member/policy fences, exact counter CAS, one-use
challenge and safe public errors; keep recovery fail-closed.

## Validation and rollback

Use actual signed ES256 authenticator fixtures against the maintained verifier:
wrong signature/key/challenge/origin/RP, missing UP/UV, cross-origin, unexpected
credential, counter replay, expired ceremony, changed command/session/policy,
revocation and malformed/oversized data. If the durable writer is implemented,
exercise actual FORCE-RLS PostgreSQL with an isolated role, concurrent replay,
revoked session, immutable audit failure and maker/checker consumption.

Disable the factor issuer and revoke only its function grants for rollback;
retain immutable evidence. Existing privileged operations stay blocked without a
valid factor. Full P2 release and real device/browser enrollment remain separate.

Primary references: [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server)
for expected challenge/origin/RP verification and persisted counter update;
[W3C WebAuthn](https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion)
for signed authenticator data, user verification and replay validation. A UV
assertion proves local authenticator verification; it does not prove device
ownership, attestation provenance or an approved enrollment by itself.

## Delivered boundary and exact integration

Pinned `@simplewebauthn/server` 14.0.2 performs ES256 signature verification.
Encho additionally rejects cross-origin responses even where the library has a
Safari compatibility allowance; requires exact configured secure origin/RP,
UP+UV, immutable reviewed enrollment, current environment and bounded ceremony;
and validates synced-device policy, unchanged backup eligibility and counters.
No biometric template or private key reaches Encho. Raw assertions are verified
in memory and only digests enter the receipt/audit tables.

`WorkforceStepUp(factorPool, environment)` is the isolated backend adapter:

| Method | Trusted input | Result |
| --- | --- | --- |
| `begin` | Workforce cookie credential, reviewed enrollment UUID, exact server `PrivilegedActions.fingerprint` hash, correlation ID | Challenge UUID/expiry and WebAuthn request options with `userVerification: required` |
| `complete` | Same workforce cookie, challenge UUID, unchanged browser assertion JSON, correlation ID | Existing `StepUpReceipt`; use `challengeId` as `context.evidence.stepUpReceiptId` |

The HTTP layer must load/select approved credential metadata server-side,
protect same-origin POSTs against CSRF, bound body/rate limits and avoid logging
assertions/cookies. It must never accept policy, public key, membership, assurance
or command authority from browser JSON. The action fingerprint belongs to the
server's actual domain command; successful passkey verification does not itself
approve that command or satisfy an independent checker.

The unpublished migration 036 adds six FORCE-RLS tables: factor policy versions
and current pointer, immutable reviewed enrollment evidence, counter/revocation
state, immutable ceremony bindings and immutable proof receipts. No approved
policy or credential is seeded. There is deliberately **no enrollment/state
INSERT policy** and no enrollment/import/recovery endpoint or helper: neither
shared runtime nor isolated factor writer can import a public key. Only local
disposable test administrator fixtures provide reviewed registration evidence.
A future independently reviewed enrollment adapter must prove registration,
fresh verified identity, approval, recovery and credential revocation before
production can use this foundation.

Each ceremony binds membership, session, environment, credential snapshot,
current IAM/factor policy and command hash. The isolated writer rechecks all
current state after cryptographic verification, atomically performs credential
counter/version CAS, emits immutable evidence and marks the existing challenge
verified. Consuming a privileged action uses the existing one-use transition;
it never upgrades the session's AAL1. A policy release or credential revocation
invalidates tracked unused proof even after action approval.

`workforceFactorGrants(role)` exposes three exact function EXECUTEs only.
`verifyWorkforceFactorCatalog(client)` checks actual role isolation, NOLOGIN and
non-bypass definer ownership, FORCE RLS, exact narrow policies, no raw table or
column privileges, and immutable evidence. Base IAM readiness validates the two
additional conditioned owner policies. Counter updates use the existing shared
policy/member fences; credential revocation takes the exclusive policy barrier.
No source procedure exports enrollment or credential-recovery authority.

## Local verification and limits

On 24 September 2026, a combined targeted run passed **61/61**: 19 cryptographic
assertion tests, 14 real-PostgreSQL proof-chain tests, 16 core IAM tests and 12
privileged-action tests. Strict TypeScript and ESLint passed for the slice.
The test chain starts with a real RSA-signed Google fixture establishing AAL1,
then a separately generated ES256 authenticator, then the real SQL receipt and
`PrivilegedActions`/`PostgresWorkforceAuthorization` command consumption. It
covers concurrent nonce completion/counter CAS, unrelated session/action,
revocation before and after verification/approval, policy release, expiry,
durable quota, RLS, audit rollback and lost commit acknowledgement.

The test fixtures are not enrolled staff or operating approval. No production
OAuth, browser device enrollment, recovery-code flow, remote database or live
factor was exercised. A subsequent compatibility sweep passed **70/70**: issuer 16, invitations 18,
lifecycle 13, owner bootstrap 11 and assignments 12, using the same factor
appendix. Existing fixture evidence remains explicitly local-only.
The library currently emits a Node 24 experimental WebCrypto capability-probe
warning while loading; tests use only ES256 and do not activate experimental
post-quantum algorithms. Full P2 release remains the parent's milestone gate.
