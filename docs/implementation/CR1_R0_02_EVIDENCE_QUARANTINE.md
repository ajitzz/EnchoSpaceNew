# R0-02 evidence quarantine and R0-04 validation foundation

28 September 2026 — **READY_FOR_REVIEW**, local code only. This is not acceptance of an external gate or the complete R0-04 review workflow.

## Scope and preserved authority

The historical CR1 certificates and clearance documents remain unchanged and qualified by CR1-045. None is automatically imported as trusted evidence. No database, provider, customer or deployment was contacted. No migration, live account, payment, runtime route or customer UI changed in this slice. Correct canonical finance, provider operation and outbox services were preserved.

The two reproduced regressions were: absent provider spend became verified zero, and a source-only formatter produced a certified 48/48 dossier. Before logs retain both failures; repaired tests reject both behaviors.

## Producer and consumer disposition

| Producer / consumer | Verified former behavior | Current boundary |
|---|---|---|
| `scripts/compliance/generate-staging-preflight-receipt.mjs` | Fake URL, fixed safe role flags and 35-migration success | Temporary FIXTURE / NOT_EVIDENCE; no database connection |
| `generate-tax-clearance-receipt.mjs` | Authored signatory/opinion/attestation and changed digest history | No opinion, authority or historical writes; only unaccepted fixture |
| `generate-google-mcc-clearance-receipt.mjs`, `generate-meta-hec-clearance-receipt.mjs` | Authored provider identities/readback/clearance | No credentials, IDs or provider clearance fabricated |
| `generate-adtech-markup-clearance-receipt.mjs` | Authored commercial ratification | No approval/fee/tax authority |
| `generate-provider-canary-receipt.mjs` | Authored paused provider success | No provider activity or clearance |
| `generate-cr1-rc-dossier.mjs` | Seven gates CLEARED and 48/48 from source constants | Unaccepted dossier example; completion unknown |
| `generate-ca-tax-packet.mjs` | Digest coupled to asserted statutory interpretation | Byte digest only, professional review remains unknown |
| `simulate-pilot-stop-loss.mjs` | Fixed ROI/bookings/privacy/tax and board GO | Labeled local threshold example; no pilot outcomes |
| `Cr1ReleaseCertificateEngine` | Map-based self-certification, interpolated SQL, arbitrary attestation and history writes | Compatibility methods fail closed before writes; read-only assessment leaves all original gates UNKNOWN |
| `PilotStopLossEngine` receipt formatter | Simulation overwrote history and asserted GO/tax/privacy | In-memory FIXTURE / NOT_EVIDENCE; no output-path write, tax/privacy unknown |
| `run-staging-deployment.mjs` | Missing client still generated CERTIFIED receipt | Missing client fails; partial role observation cannot certify or write historical evidence |
| `verify-database-roles.mjs` | Missing tables tolerated; CLI general-DB fallback and insecure TLS | Expected tables/ENABLE+FORCE checked; explicitly incomplete role probe; CLI NOT_RUN without connections |
| `provider-canary-runner.mjs` | Missing spend zero; universal HOUSING | Explicit integer zero spend/impressions, exact provider/account/campaign and fresh observation; category matches supplied capability; formatter remains fixture-only |
| `pilot-tranche-monitor.mjs` | Caller data CERTIFIED; raw SQL / Map handler side effects | Untrusted in-memory assessment; side-effect helpers fail closed; CLI states NOT_RUNNING |
| Other `src/lib/compliance` demonstration engines | Unmounted direct-class assertions, format-based authority and synthetic scenarios | Not accepted production evidence; their schemas cannot satisfy the new boundary. Further domain replacement remains assigned to later cards |
| Existing historical receipts/documents | Historical claims, including claimed external clearance | Preserved, not trusted inputs or acceptance predicates |
| New `src/lib/release/evidence.ts` | No prior canonical validator found in the scoped source scan | Strict Zod schemas and dependency/content/subject checks; independent trust boundary required; **no production trust implementation configured** |

The source/reference scan found no mounted production caller consuming the retired certificate engine. A repository import scan is not universal proof about deployed artifacts; deployed identity remains R0-01/R7 work.

## Exact acceptance boundary

The validator binds commit, full source-tree digest, worktree delta, lockfile, artifact/migration/configuration manifests, environment identity, provider/account, package/finding/run identity, collection method/tool/window, actual contact flags, privacy policy references, commands, predicates, artifacts and dependency digests.

It rejects fixture-as-evidence, missing/malformed fields, missing or changed required dependencies, subject mismatch, expired/future data, failed/skipped-required commands, unknown/not-run predicates, invalid provider scope, duplicate/ambiguous inputs, revoked/stale/insufficient reviewer proofs and protected self-review. No local SHA-256, `authenticated: true`, supplied CA identifier, account syntax or formatting status authenticates an authority.

`EvidenceTrustBoundary` must be supplied by trusted release composition, not by an HTTP body or receipt. It must independently verify collector/reviewer provenance and actual artifact bytes. The repository deliberately has no default production implementation. Tests supply explicit local doubles to validate the contract; they are not external approval. A real collector registry, append-only reviewer workflow, authorization and CI promotion integration remain R0-04/R7 work.

Fixture scripts write exclusively under the OS temporary `encho-cr1-evidence-fixtures` root with an explicit warning, owner-only file mode, exclusive creation and symlink escape checks. Passing a historical receipt path fails before writing. CLI examples have no production clearance semantics.

## Validation and compatibility

Use the adjacent machine-readable local test receipt for exact commands, source hashes and logs. Final applicable targeted runs cover **80 passing tests across seven files**; these are local unit/contract tests, not real PostgreSQL/provider/deployment verification. Strict compilation of the three affected TypeScript library modules, scoped ESLint and Node 24 syntax checks pass. No full-suite or release build was run for this slice.

Historical tests that asserted fake certification or wrote/deleted tracked receipt paths were changed to assert containment and byte preservation. Their previous implementation remains in Git; the fail-before reproduction remains separately retained. Other arithmetic simulation tests are not relabeled as integrated production evidence.

Unsafe tooling compatibility changes are intentional: certificate issuance/attestation now throws; generation functions no longer certify or overwrite historical paths; provider readback requires expected provider/account identity and timestamped metrics; paused Meta category validation needs released capability input. These modules were unmounted tooling/prototypes, not established customer API contracts. Rollback must keep release gates closed rather than resurrect generated clearance.

## Remaining blockers

Authentic ENV/DB/LEGAL/PROV/COMM/IAM/OPS/PRIV/CANARY/PILOT evidence, independent review and deployment identity remain unavailable. The limited role probe is not a full catalog/grant/policy/trigger or actual LOGIN acceptance harness. No card or original CR1 package is independently accepted by this implementation note.
