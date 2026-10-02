# Public listing price currency incident — 2 October 2026

## Verified source and impact

The public card projection returns rupee values in `price` but writes the display symbol `₹` to `currency`. `CurrencyContext.formatPrice` accepts ISO codes and silently treats an unknown source as USD. The observed card amount ₹960,250 is exactly ₹11,500 × 83.5; the map amount ₹1,544,750 is exactly ₹18,500 × 83.5. `MapSidebar` also calls `formatPrice` without the listing's source currency in its markers, panels and cluster average. The source contract is broken between the public API and browser formatter. This does not establish that the underlying room price or bookable quote is ₹960,250.

Affected files: `src/lib/stayProjection.ts`, `server.ts` owner/admin listing response, `components/MapSidebar.tsx`, and focused guest price tests. API shape remains `{price: number, currency: string}`; currency becomes the ISO `INR` identifier expected elsewhere instead of the display glyph. No table, migration, finance, booking, provider or host authoring command changes. Existing browser consumers using `listing.currency === 'USD' ? '$' : '₹'` keep the same INR display, while consumers using `formatPrice` stop multiplying rupees by the USD/INR placeholder rate. Currency conversion rates themselves are outside this incident repair.

## Repair and validation

Keep raw numerical values unchanged. Emit ISO `INR` from the current India stay projections. Pass the listing source currency into every map formatter call; clustered prices only average same-currency markers, otherwise show a count without a misleading aggregate price. Add a focused API-to-card render regression for 11,500 INR and map price formatting evidence for 18,500 INR, preserving an explicit source currency at every call. Run the focused tests, TypeScript and diff check. Verify the live deployment separately if this commit is later deployed.

Rollback: revert this scoped source commit. Existing cached public catalogue entries can retain the old glyph for up to their server-side Redis TTL (3,600 seconds). This repair increments the public catalogue cache namespace from v3 to v4 so new deploys do not read those entries; an edge response may still live for up to 60 seconds. Do not rewrite cached customer amounts in the database.

## Separate public-truth finding

`ListingCard` also still derives unsupported room/privacy summaries and stock media from category/text, while public catalogue fields can differ from stricter stay detail authority. This scope is recorded as a separate guest truth defect. A price formatting repair does not certify public listing claims, available sellable offers, checkout or investor readiness.
