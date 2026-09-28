# R1-01 impact and verification plan

Status: IN_PROGRESS; implementation evidence only, not independent acceptance.

Baseline: HEAD 0e4c6fec2fe86f1b793760c5f7a3daf08bbf7508 plus existing staged work. This change preserves the index and canonical SQL IAM contracts.

## Scope and root cause

The Operations runtime falls back to generic database credentials, disables remote TLS verification and infers workforce origin. The separate session runtime defaults to owner/general DB, advertising OAuth audience and a fixed organization. Session issuance and both readiness readers independently permit owner authority; completion conditionally enrolls consumer identity by email. These are R1-01/A02/A03 defects, not proof of an observed production exploit.

## Source of truth and change boundary

Reuse canonical IAM migrations, invitation/subject-binding authority, login challenge/session SQL functions, secure workforce cookies, session reader, audit transactions and uncertain-commit handling. Modify only runtime/session configuration, issuer/runtime role predicates, corresponding readiness and focused tests. No new property field, provider operation, finance or migration change is intended. Missing configuration disables the workforce path; it must not silently restore shared-owner functionality.

## Security and compatibility

Require explicitly configured workforce database, identity database, origin, organization and OAuth audience; staging/production require validated HTTPS/TLS. Existing consumer credentials and advertising OAuth remain outside staff identity. Reject actual owner, superuser/BYPASSRLS, inherited/SET ROLE escalation and unauthorized table/column grants. Session issuance requires prelinked subject identity; existing reviewed invitation enrollment remains authoritative. Readiness fails closed on incorrect role grants. This intentionally makes unsafe deployments unavailable until isolated credentials/configuration are supplied.

## Verification and rollback

First reproduce the existing Operations failures under Node 24 via scripts/testing/run.mjs; retain failing evidence. Run Operations configuration/HTTP tests and isolated session issuer tests against disposable Unix-socket PostgreSQL LOGIN roles. Add hostile production-flag, NOINHERIT owner-membership/raw-column access, explicit configuration and no-enrollment cases; preserve challenge replay, revocation, audit atomicity and lost-COMMIT coverage. Run only targeted suites plus affected-file lint/type checks as appropriate. No remote URL, credential, paid operation or external provider is used.

Rollback is feature containment (disable Operations login/commands), never restoring owner exceptions or disabled TLS. No schema rollback or applied-migration edit is planned. Parent maintains consolidated HARVO, DECISIONS, package state and evidence register.

## Acceptance predicates tracked for review

| Predicate | Evidence required |
|---|---|
| R1-01.AC01 | Original Operations TLS/generic-DB and insecure staging-origin regressions reproduce before, pass without assertion edits after |
| R1-01.AC02 | Explicit construction requires workforce environment, organization, audience, origin and dedicated URLs; general/ad/hosting fallbacks denied |
| R1-01.AC03 | Actual owner/superuser LOGINs, NOINHERIT owner/column-write membership and privileged SET ROLE fail; approved narrow runtime/issuer LOGINs work |
| R1-01.AC04 | Runtime/readiness share denial logic; narrow issuer cannot access tables/sequences/unrelated security-definer functions |
| R1-01.AC05 | Session login cannot enroll consumer identity; foreign-organization completion rolls back before COMMIT |
| R1-01.AC06 | Real HTTP begin/complete/logout retains fixed origin, secure cookies, separate token hashes, replay/revocation/audit and unknown-commit behavior |
| R1-01.AC07 | Local PostgreSQL TLS handshake tests reject untrusted CA and trusted wrong hostname under production connection policy |

The read-only workforceEnvironment helper retains its conservative production default for compatibility with existing consumers/tests. Both runtime constructors validate an explicit environment before constructing any pool. No runtime identity authority is inferred by that helper default.

Related source correction: sessionRouter's generic public-origin allowlist widened the configured workforce origin. Its fallback was removed; public Encho/Vercel/localhost origins are denied unless they are the exact configured workforce origin.

Independent-review correction: current and reachable REPLICATION roles were missing from the privilege predicate. Both issuer and runtime now reject them; direct and NOINHERIT ancestor cases are verified through actual disposable PostgreSQL LOGIN connections. The latest issuer/assignment run passes 35 tests. Across latest relevant runs, 75 distinct targeted tests pass; this remains a review handoff, not release acceptance.

Independent review addendum: database ownership and reachable database CREATE are now denied even when public schema belongs to another role. Actual LOGIN tests cover both issuer and runtime; 33 targeted tests pass (24 issuer, 9 Operations). The compile error for optional principal organizationId was repaired by explicitly accepting undefined and denying it against configured organization identity. No deployed evidence was inferred. Transcripts are preserved as tracked-eligible `.txt` copies; historical `.log` failures also remain.
