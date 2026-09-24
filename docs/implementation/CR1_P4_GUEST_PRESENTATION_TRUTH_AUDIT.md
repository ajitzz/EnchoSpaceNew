# CR1 P4.1 — Guest presentation truth follow-up

Status: scoped implementation in progress; this is not M6A independent acceptance or a P4 release exit.

## Authority and impact

Guest Booking Decision Register decisions 38–40, the Guest Property Presentation Contract, and the M6A implementation plan require truthful supplied media, room-specific prices, no unverified social proof, location privacy, and a closed checkout until M5/M6B legal and quote gates are satisfied. Existing hero video, room-first galleries and grayscale neighborhood behavior must remain intact.

This follow-up changes only guest display helpers, the listing/gallery components, and their tests. No schema, provider, payment, booking, tax, rate-plan or public API authority changes are introduced. Existing room IDs remain internal to the supplied view model; presentation keys are local UI keys, never booking or public URL authority.

## Verified findings and corrections

| Finding | Source evidence | Correction and validation |
|---|---|---|
| Room classification is used as identity | `ListingDetailsNew` indexes configurations by `room.type`, but availability chooses the first matching room; migration 003 does not make `type` unique | Select distinct supplied room IDs where present; otherwise use local display keys with no availability authority. Duplicate-tier tests must keep price, capacity and photography isolated. |
| Ambiguous tier media is presented as a particular room | `ListingRoomGallery` and `classifyListingPhotos` match tier alone | Prefer explicit supplied room/media association; legacy tier association is usable only when unambiguous. Ambiguous media remains property-level gallery evidence, never evidence for both rooms. |
| Invalid or stale response can become availability truth | Listing page accepts `payload.rooms` without schema, listing/date binding or observed timestamp validation | Strict bounded Zod public contract; match listing and exact dates; reject duplicates, negative counts, malformed timestamps and stale evidence. Hide old evidence while hidden and after expiry; fence overlapping responses. |
| Closed checkout advertises instant confirmation | Mobile footer says “Instant Confirmation” although `checkoutAvailable=false` | All booking entry points explicitly say booking is being prepared; positive inventory is an observation, not confirmation. |
| Unverified social proof leaks through similar cards | Similar cards render `sim.rating` without verified-review evidence | Suppress rating badge until verified review authority exists; preserve property navigation through a keyboard-operable button. |
| Room prices lose paise | Inline room gallery uses `maximumFractionDigits:0` | Preserve supplied non-negative finite prices to two fractional digits; test a fractional-rupee room. No quote/tax arithmetic. |
| Unsupported generic property claims | Static private-room copy promises complete privacy/shared sanctuary; SEO asserts luxury for every stay | Use neutral supplied-stay language. Do not fabricate amenities or privacy claims. |

## Compatibility and rollback

No existing host/admin input field changes: this corrects guest rendering of existing facts. Existing props and gallery source order remain supported. Exact room references take priority over ambiguous legacy labels. If canonical identity is missing, the UI can display the room but cannot bind it to inventory. Rollback is limited to these display components/helpers; checkout remains closed in either revision.

## Upstream findings outside this slice

The public stay reader currently omits canonical room IDs/media association by its privacy contract and catches relational read errors before retaining legacy JSON (`server.ts` canonical stay route). This must not be “fixed” by exposing private IDs or guessing that a room label is an identity. Parent engineering owns a fail-closed relational read correction and any future opaque public room-key contract. Public aggregate availability currently includes numeric room IDs; an accepted end-to-end public identity contract remains necessary before canonical guest reservation work.

## Verification

Pending targeted presentation regressions, strict TypeScript/lint and browser checks where an isolated fixture is available. No remote migration or production readiness claim.
