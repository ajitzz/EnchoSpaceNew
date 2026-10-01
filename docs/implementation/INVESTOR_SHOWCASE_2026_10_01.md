# Investor showcase — local implementation record

**Authority:** Founder request for 15 AI-assisted investor demonstration properties and experience concepts. This is a presentation feature, not approval of new live inventory, booking, legal claims, or production readiness.

## Impact and boundary

- Source of truth for the demonstration is `src/data/demoProperties.ts`. It contains 15 fictional listings with illustrative prices, rooms, galleries, and experience tags.
- The only entry is `/investor-showcase` in the client entry point. Ordinary search, `/stay/:slug`, host management, inventory, messaging, booking, and marketing do not read this data.
- `ListingDetailsNew` and `SanctuaryGalleryModal` are reused in explicit demo mode. They must not claim verified hosts, real reviews, availability, or a working reservation and must not dispatch customer mutations.
- No migration, API change, database seed, or provider operation is part of this release.
- Images are illustrative Unsplash photography, not pictures of actual listed properties. Their URLs were checked for HTTP 200 on 1 October 2026, but third-party availability is not guaranteed. The [Unsplash license](https://unsplash.com/license) generally permits commercial use; identifiable people, brands and private-property rights still require separate care.
- The page is marked `noindex, nofollow`; this is a public concept route, not an access-controlled confidential investor room. Share only knowing that anyone with the URL may view it.

## Verification and rollback

- Check 15 unique demo identifiers, zero claimed verifications/reviews, room and experience material, and image response codes.
- Run the focused investor showcase test, TypeScript, lint, offline build, and browser checks on desktop/mobile. Do not interpret synthetic data as acceptance evidence for real guest journeys.
- Rollback is removal of the route and concept-only files. There is no persistent data to migrate or reconcile.
