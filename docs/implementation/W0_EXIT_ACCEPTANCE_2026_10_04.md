# W0 truthful public discovery — local acceptance receipt

**Source reviewed:** `codex/p0-public-truth-oct4`, frozen commit `95b495241f630940fdbf0ad3abe04c1a18de6dac`, based on `b63a7ae11c872732f567e892370b1103d7cd31bf`. The source diff covers the public projection, mounted routes, catalogue client, Guest components and focused tests. Four pre-existing untracked impact/review drafts were not included in the frozen commit.

**Independent disposition:** Read-only reviewer `/root/w0_independent_review` returned PASS on the frozen commit for the founder's W0 A–H exit contract, with no remaining concrete P0/P1 W0 finding. Three prior change requests were repaired before that pass: address-like public text/slug leakage, map photo mismatch after room selection, and mobile map detail navigation unavailable to keyboard users. The final reviewer made no edits.

**Implementation state:** Complete for W0's truthful public discovery contract on this isolated branch. Published catalogue, card, map, detail, refresh and SEO use canonical relational room identity, approved media and a withheld-price state. Catalogue ordering and cursor pages are bounded; public cache remains conservatively disabled. Authority outages are distinct from genuine empty results. Unknown room-media relationships, invalid coordinates, unpublished listings and unsafe legacy published fallbacks fail closed. The founder selected “withhold price until verified offer”; dated sellable offers and booking checkout are later work.

**Local verification:**

| Check | Result | Environment |
| --- | --- | --- |
| W0 real-route PostgreSQL tests | 19/19 pass | Fresh disposable PostgreSQL |
| M2 privacy, M3 room/media and public catalogue client | 65/65 pass | Credential-scrubbed test runner |
| Mounted public catalogue/map component tests | 15/15 pass | jsdom |
| Independent reviewer focused rerun | 39/39 pass | Reviewer rerun; includes W0/client/real-PG |
| TypeScript, scoped ESLint, `git diff --check` | Exit 0 | Node 24 |
| Offline production-shaped build | Exit 0; 44 public artifacts | Sanitized environment |
| Built direct HTTP and Chromium journey | PASS at 1280px and 360px | Fresh disposable PostgreSQL; service workers blocked |

The built journey exercised direct `/stay/:slug`, catalogue → detail, detail refresh, selected room, media and price parity, desktop and mobile keyboard navigation, missing-media presentation, publication negatives, safe slug redirects, bounded pagination, filtered room cards, and an authority-unavailable response. It did not use the primary Neon database or claim live traffic behavior.

**Compatibility and rollback:** No migration or booking/payment activation is included. Published URLs with unsafe stored slugs redirect to a stable public `_s-{id}` alias. Revert the W0 source range from this isolated branch if a subsequent integration discovers a regression; do not restore legacy published-room fallback or fabricated price as a shortcut.

**Deployment/external evidence:** Pending. The primary checkout contains unrelated uncommitted work and is at a different commit, so this branch was not merged or pushed in this acceptance step. Staging, deployed Guest behavior, primary Neon role readiness, real offer policy implementation and legally gated commerce remain separate evidence gates. W0 local acceptance does not certify those systems or the broader CR1 release.
