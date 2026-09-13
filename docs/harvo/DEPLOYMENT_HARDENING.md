# HARVO deployment/runtime hardening

13 September 2026. Authorized local execution only. No hosting, remote database migration, payment or provider operation is part of this change.

## Impact and implementation plan

Category: infrastructure, security and runtime reliability. Constitution section 20 and the current HARVO/runbook remain controlling; deployment fixes do not complete booking, accounting or provider acceptance.

Verified root causes: Vite assets and TypeScript server output share public `dist`; the worker container starts the legacy worker, which imports the application server; Node 20 images are obsolete; `.env.local` is present but excluded neither by `.dockerignore` nor `COPY . .`; web background-loop disabling also removes canonical hold expiry; existing process health does not prove worker progress or migrated schema.

Plan:

1. Keep Vite public output in `dist`, move server compilation to private `build/server`, and update every current runtime/build consumer. Preserve API and canonical SEO routes. Deny accidental backend artifacts inside the static root and verify the built public tree.
2. Use supported Node 24 LTS images, a compiled web entry and the actual compiled HARVO worker. Exclude environment/private-key variants from Docker context. Define explicit Render web and background services without supplying invented account, region, policy or secret values.
3. Keep legacy loops disabled in the web deployment. Give canonical expired-hold sweeping an explicit supervised owner using the existing transactional inventory service. Record actual worker-cycle progress and bounded shutdown; never treat a process heartbeat as ad delivery or financial readiness.
4. Provide genuine web health and worker progress checks, retain detailed operator migration/account checks, and fail startup on unsafe runtime configuration. A deployment must not silently manufacture migrations, account authorization or financial evidence.
5. Test static exposure, Docker/entrypoint wiring, progress/failure/shutdown behavior and isolated compiled startup. Build without loading ambient environment files. No test starts against Neon or calls a provider.

Affected files: Dockerfiles, `.dockerignore`, TypeScript/build scripts, package entry scripts, Vercel/Render configuration, narrow server static/start/shutdown/health regions, dedicated marketing worker and deployment helper modules/tests. Database impact is limited to explicit canonical hold expiry using its existing service; no schema mutation is introduced. Host/admin/API payload semantics remain unchanged. The web static root remains `dist`, so asset URLs and SEO lookup paths remain compatible.

Risks: compiled ESM paths, shared legacy server side effects, stale jobs during termination, native Sharp/ffmpeg support under Node 24, and accidentally disabling canonical inventory maintenance. Mitigation: source-backed ownership checks, isolated actual-runtime tests, bounded drain and retained database/provider fencing. Rollback is deployment configuration/code rollback with workers drained; keep ledger/provider/audit evidence and never reactivate the old paid engine.

Validation and remaining external acceptance will be appended with exact observed evidence. No container or platform success is assumed from a source edit.

## Implemented deployment contract

Public Vite files remain in `dist/`; private server modules and exact migration SQL are in `build/server/`. The public build validator rejects symlinks, dotfiles, source maps, source/SQL/private-key files, and backend output directories. Express rejects those paths even if a forbidden file appears after startup. Production source maps are disabled. Vercel still publishes only `dist` and includes that directory for existing SEO functions; it cannot own the continuously running worker. `npm ci --include=dev` explicitly installs the build compiler regardless of a platform's production environment.

Both Dockerfiles use Node `24.21.0` on Debian Bookworm slim, install production dependencies independently, and run as `node`. They copy no raw application source or environment files into the final image. Native dependency install scripts remain enabled. Environment file variants, npm credential files, SSH directories and private key extensions are excluded from the build context. The application starts with `node build/server/server.js`; the worker starts with `node build/server/src/server/marketing/worker.js`. The old root `worker.ts` is not a supported production entrypoint.

The production web process cannot enable legacy interval loops, even if `DISABLE_BACKGROUND_WORKERS=false` is accidentally supplied. Its former canonical hold interval has moved to the actual HARVO worker. `HARVO_HOLD_SWEEPER_ENABLED=true` explicitly assigns that worker ownership; existing inventory row locks and guarded decrements remain authoritative. The worker must have a configured real service administrator and a migrated database role without superuser/BYPASSRLS privileges. It uses the existing durable campaign engine, a 60-second hold maintenance task, a five-minute observation scheduler, and an optional sequential maintenance hook for the conversion consumer. Maintenance failures are recorded and retried while durable pause/refund jobs can still progress; they are never presented as successful cleanup.

The worker writes a private atomic progress file, recording completed database checks, completed queue polls, individual maintenance outcomes and drain state. It does not describe an idle poll as a successful campaign job. `npm run marketing:worker:health` fails for old progress, errors, startup or draining state. A local watchdog exits unsuccessfully when healthy actual progress stops, supporting background hosts that do not execute HTTP health checks. SIGTERM stops new polls and allows the in-flight job to drain; the application deadline is 60 seconds, inside the Blueprint's 90-second platform shutdown allowance. An interrupted external write still requires the existing provider reconciliation/fencing rules; a process restart is not proof that no provider action occurred.

`/api/health/live` is process-only and becomes 503 during drain. `/api/health/ready` and `/api/encho/health` are read-only structural database probes: they check required tables (including migrations 012–016), selected required FORCE RLS flags and the effective database role. They do not certify provider configuration, booking checkout, settlement or live delivery. The old fabricated `10/10`, reconciled-wallet and fixed-15%-fee health claims were removed. Production startup/lazy schema bootstrap no longer executes its former DDL. Other legacy route-specific schema helpers are outside this bounded change and remain a separate migration-hardening task.

`render.yaml` defines one web service and one background worker, each initially `1c-2g`, with automatic deploys off. These are infrastructure proposals until an operator reviews region/cost and creates services. No Render account/service was created. Provide the real `DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`, consistent `HARVO_MARKETING_CONFIG`, and the actual provider, payment, media and AI configuration documented in the operations runbook. Supply shared values through an operator-managed environment group or matching service settings; the Blueprint's secret prompts do not create real credentials. Do not invent acceptance references or turn on funding/activation to satisfy a health check.

Run migrations once through the separately authorized migration process before bringing the worker online. `npm run marketing:check -- --database` checks exact local migration checksums 009–016 and uses the trusted service actor for the RLS-protected job report. Migration SQL is copied into the private image for verification; image build/start never applies it. The Blueprint intentionally contains no automatic migration command or live activation command.

For a Vercel web deployment, retain `outputDirectory: dist`, select Node 24 in project settings, and operate the same dedicated background worker elsewhere. API/media execution limits and the provider/payment/booking gates remain independent constraints; a Vercel build does not replace the worker.

## Verification boundaries

The isolated verification commands use an empty inherited environment and `envDir:false`; they neither load workspace `.env` files nor start an app against Neon. The Node 24.21.0 macOS arm64 test runtime was downloaded from the official Node distribution and checked against its published SHA-256. This validates the observed macOS runtime only, not Linux native dependency installation.

Nineteen scoped tests have passed locally under Node 24, including actual HTTP static exposure refusal and active-response draining, symlink/dotfile/private artifact rejection, private/public output wiring, simulated structural database probe failures, actual worker progress bookkeeping and graceful stop behavior, and stalled-progress supervision. The probe test doubles are not real PostgreSQL acceptance evidence. Final source edits and exact build/smoke outcome are recorded below when complete.

Docker CLI availability was verified, but the local Docker daemon is absent. No container build, image boot, Render deployment, Vercel deployment, real database readiness acceptance, provider call or load test was performed. A deployment operator still must build/run both images on Linux, check Sharp/ffmpeg in the image, check the actual role/migration report, exercise readiness/drain on the platform, and run the separately gated real-provider/booking/settlement pilot.

Primary runtime references: [Node supported releases](https://nodejs.org/en/about/previous-releases), [Render Blueprint schema](https://render.com/docs/blueprint-spec), [Render background workers](https://render.com/docs/background-workers), [Render health checks](https://render.com/docs/health-checks). The Blueprint uses the documented worker type, explicit Dockerfile path, `autoDeployTrigger: off` and `maxShutdownDelaySeconds`; background workers have no web `healthCheckPath`.

## Observed local result

Twenty deployment tests pass under Node 24.21.0 after the final lifecycle correction. The additional regression covers a symlinked launch path: Node canonicalizes `import.meta.url`, so comparing it to unresolved `argv[1]` incorrectly skipped startup. The entry helper now compares real filesystem paths.

An environment-isolated Vite production build completed (34 public files; existing circular/manual-chunk and large-bundle warnings remain), and private server TypeScript compilation passed after removing the unnecessary blanket client-component include. Actual imported server/API dependencies are still compiled automatically. A later lifecycle-only emitted helper refresh was used for the smoke test; root's final integrated build/typecheck remains the acceptance record for all concurrent source changes.

The compiled Node smoke test passed web startup, liveness 200, structural readiness 503 without a configured database, canonical stay SPA routing, private backend/dotfile path 404s, and SIGTERM HTTP drain. The compiled worker rejected absent configuration and its import-only check exited without starting a worker. All child processes ran from a temporary directory with cleared environment and a preload guard refusing every outbound socket and fetch; parent requests only reached the local test server. One initial import-only subcheck failed without retained diagnostics; the instrumented repeat passed, so no cause is asserted for that first result.

Repeat using an isolated build directory returned by `scripts/verify-harvo-build.mjs`:

```sh
node scripts/deployment/smoke-runtime.mjs /absolute/path/to/isolated-build
```

The Docker tag is present in the [official Node image manifest](https://raw.githubusercontent.com/docker-library/official-images/master/library/node). This is tag availability evidence, not a Linux image build or deployment result.
