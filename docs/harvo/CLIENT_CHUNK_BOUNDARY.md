# HARVO — production client chunk boundaries

13 September 2026. Scope: Vite/Rollup bundle classification and local build/import verification only. No application, PWA caching, API, database or deployment change.

## Verified root cause and impact plan before code

The current first `manualChunks` condition matches every installed path containing `react`. It captures `lucide-react`, `react-leaflet`, Google Maps React adapters and `@mux/mux-player-react`, assigning unrelated feature packages and their transitive dependencies to the React runtime chunk. The previous isolated artifact `/tmp/harvo-release-build-AK9K6P/client` contains a 1,443,048-byte React chunk (411,936 gzip bytes) and a maps/react cycle. Shared CommonJS helpers can also be allocated into a feature chunk and become a backwards runtime dependency.

Classify the final installed package segment, including scoped/nested installations and normalized Windows paths. Keep only actual React runtime packages and shared CommonJS helpers in the core group; place icons, maps, animation and integrations in their correct groups. Leave unrelated dependencies to Rollup's graph. Preserve source-map refusal, the 500 KB warning threshold, public environment definitions, HARVO mutation replay exclusion and all image caching policies.

Test actual package boundaries and virtual helper classification. Build only the client into a fresh temporary directory using Node24, empty environment and `envDir:false`. Capture generated chunk import edges, sizes and warnings; inspect the resulting graph for cycles and load the production modules in an isolated browser without permitting external requests. Code splitting changes module evaluation order, so build completion alone cannot establish runtime correctness. [Rollup manual chunk documentation](https://rollupjs.org/configuration-options/#output-manualchunks) is the primary reference; installed Rollup is 4.62.4. Roll back the classifier if production import verification fails.

## Results

The isolated Node24 client build completed at `/tmp/harvo-client-chunks-EzbXrA/client`. Its generated static import graph has **zero chunk cycles**. Nineteen package-boundary regression tests passed. All 24 production JavaScript chunks imported successfully in Chromium with no module/reference errors. The smoke blocks external requests and records the expected unavailable Stripe script separately; it does not claim a working payment/provider integration.

| Observed bytes | Before | After |
|---|---:|---:|
| React runtime chunk | 1,443,048 | 200,079 |
| React chunk gzip | 411,936 | 62,500 |
| Initial static JavaScript dependency closure | 2,242,408 | 1,179,941 |
| Initial static JavaScript gzip | 648,684 | 348,384 |

The initial dependency measurement parses the actual emitted files rather than assuming renamed chunks reduced download cost. It shows about a 47% raw / 46% gzip reduction in that static closure. These are local artifact sizes, not measured customer latency or a full performance score. `ListingDetailsNew` still has a roughly 1.82 MB lazy chunk and `HostMarketing` a roughly 555 KB lazy chunk; their 500 KB warnings remain visible. Further route/media splitting would be a separate application change. All existing service-worker mutation exclusions and image-cache configuration remain unchanged.

Reproduce with `docs/harvo/verify_client_chunks.mjs` (client-only build with `envDir:false`) followed by `docs/harvo/smoke_client_chunks.mjs`, using the verified Node24 binary and an empty inherited environment. Evidence is stored in `docs/harvo/artifacts/client-chunks/after-build.json` and `import-smoke.json`. The smoke uses temporary local HTTP and a fresh browser context, refuses all external requests and exercises module evaluation only; it does not run a live backend or represent browser import as full customer journey acceptance.
