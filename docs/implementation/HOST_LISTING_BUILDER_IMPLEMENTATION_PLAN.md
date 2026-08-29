# HOST LISTING BUILDER — IMPLEMENTATION PLAN
> DO NOT BEGIN IMPLEMENTATION UNTIL BLUEPRINT IS APPROVED
> Every milestone must be reviewed before proceeding to the next.

---

## MILESTONE 0 — FORENSIC BASELINE (COMPLETE)
Status: DONE
Deliverables:
  - MASTER_HOST_LISTING_BUILDER_BLUEPRINT.md
  - HOST_LISTING_BUILDER_DECISION_REGISTER.md
  - GUEST_PROPERTY_PRESENTATION_CONTRACT.md
  - This implementation plan

---

## MILESTONE 1 — DOMAIN MODEL HARDENING
Prerequisites: ADR-001, ADR-003 APPROVED
Scope: ZERO UI CHANGES. Backend and types only.
Files affected:
  - types.ts: Extend Room interface (description, min_stay, check_in_time, spatial_media)
  - types.ts: Extend SpatialPhoto (room_type_id link)
  - server.ts: GET /api/listings/:id — populate rooms from room_types table
  - server.ts: New endpoint GET /api/listings/:id/rooms/:roomTypeId/price (server-authoritative price)
  - server.ts: POST /api/bookings — add server-side price validation
Regression tests: Booking price validation test

---

## MILESTONE 2 — MEDIA ARCHITECTURE UPGRADE
Prerequisites: ADR-002, DB-001, DB-002, DB-003 APPROVED
Scope: Database migrations + API changes only.
Files affected:
  - server.ts: ALTER TABLE media_assets ADD COLUMN tier, room_type_id, moderation_status
  - server.ts: GET /api/listings/:id — include media_assets in response
  - types.ts: Extend SpatialPhoto with room_type_id
Backward compat: listings.image_urls maintained as-is
Regression tests: Marketing Engine still reads imageUrls

---

## MILESTONE 3 — HOST FORM ROOM TYPE BUILDER
Prerequisites: M1, M2, ADR-008 APPROVED
Scope: HostForm.tsx rebuild of Step 3 (Room Types)
New component: RoomTypeBuilder.tsx (isolated, composable)
Features:
  - Add/remove room types dynamically
  - Each room type: name (free-form), tier classification, price, capacity, inventory, features, description
  - Room-specific amenities
  - Room-specific photo upload (photos inherit tier from parent room type)
Files affected:
  - components/HostForm.tsx
  - components/RoomTypeBuilder.tsx (NEW)
  - components/PhotoUpload.tsx (room_type context prop)
Regression tests: Form saves correct room[] payload, photos correctly tagged

---

## MILESTONE 4 — HOST FORM PROPERTY MEDIA UPGRADE
Prerequisites: M3 APPROVED
Scope: HostForm Step 4 — Property-wide media (tier=common only)
Features:
  - Hero video
  - Property photos by spatial category (exterior, pool, restaurant, etc.)
  - Explicit "Property Level" label so host understands this vs room media
Files affected:
  - components/HostForm.tsx
  - components/PhotoUpload.tsx (tier locked to 'common' when used for property media)

---

## MILESTONE 5 — GUEST PROJECTION FIX (P0 DEFECT RESOLUTION)
Prerequisites: M1, M2, ADR-005, MIG-001, MIG-002 APPROVED
Scope: Fix ListingDetailsNew.tsx to read live data.
THIS IS THE MOST CRITICAL MILESTONE.
Changes:
  1. Remove hardcoded ROOM_TIER_CONFIG as source-of-truth
     Keep as fallback only for listings with no rooms[]
  2. slideCollections driven by listing.rooms[] (when available)
     Each room maps to a collection with its name, description, photos (filtered by tier)
  3. uniqueMediaPool replaced by listing.photos[] (structured) with fallback to listing.imageUrls
  4. curatedNeighborhoodPOIs driven by listing.nearby[] (with fallback to empty state, not Wayanad data)
  5. Room prices: shown from listing.rooms[].price, not hardcoded * 1.35 / 0.65
  6. Room names: shown from listing.rooms[].name
  7. Room specs: shown from listing.rooms[].features
  8. Room capacity: shown from listing.rooms[].capacity
Files affected:
  - components/ListingDetailsNew.tsx (surgical, not full rewrite)
Regression tests:
  - Proof-of-lineage test: Suite photo A appears only under Suite, never under Deluxe
  - Price shown = rooms[].price, not listing.price * multiplier

---

## MILESTONE 6 — GALLERY MODAL DYNAMIC LABELS
Prerequisites: M5 APPROVED
Scope: SanctuaryGalleryModal.tsx — dynamic category labels from listing.rooms
Changes:
  1. GALLERY_CATEGORIES derived from listing.rooms[] + common tier
  2. Tab headline = room.name (host defined)
  3. Tab description = room.description (host defined)
  4. Fallback to current hardcoded values for legacy listings
Files affected:
  - components/SanctuaryGalleryModal.tsx

---

## MILESTONE 7 — AMENITIES SECTION IN GUEST PAGE
Prerequisites: M5 APPROVED
Scope: Add "What this place offers" section to ListingDetailsNew.tsx
Changes:
  - Read listing.amenities[] and listing.amenity_clusters
  - Render with icon mapping (existing amenityIcon helper)
  - Filter view: show first 6, expand to full list
Files affected:
  - components/ListingDetailsNew.tsx

---

## MILESTONE 8 — ADMIN REVIEW WORKFLOW
Prerequisites: M3, M4, M6 APPROVED
Scope: Admin Dashboard can review new room structure and media
Changes:
  - AdminDashboard: Show room types with photos in review panel
  - Admin can see per-room prices
  - Admin can flag specific rooms/photos for rejection
Files affected:
  - components/AdminDashboard.tsx

---

## MILESTONE 9 — AI GATEKEEPER (REAL IMPLEMENTATION)
Prerequisites: ADR-006 APPROVED, GEMINI_API_KEY available
Scope: Replace simulation with real Gemini API evaluation
Changes:
  - New API endpoint POST /api/listings-drafts/:id/ai-evaluate
  - Gemini evaluates: photo count, description length, room count, pricing completeness
  - Returns score 0-10 with specific improvement recommendations
  - Score stored in listings_drafts.ai_score
  - Rate limit: 5 evaluations per host per hour (per AGENTS.md directive)
Files affected:
  - server.ts (new endpoint)
  - components/HostForm.tsx (Step 9 calls real API)

---

## MILESTONE 10 — MARKETING ENGINE SYNC
Prerequisites: M2, ADR-007 APPROVED
Scope: HostMarketing reads listing.photos[] for structured media
Changes:
  - HostMarketing.tsx: Build media_urls from listing.photos where isHero=true first
  - DCO: Use top 3 photos by spatial category for A/B testing (per AGENTS.md)
Files affected:
  - components/HostMarketing.tsx

---

## MILESTONE 11 — FULL REGRESSION SUITE
Prerequisites: M10 APPROVED
Scope: Manual + automated regression tests
Test cases:
  - Property creation: host sets suite price ₹25,000 → guest sees ₹25,000
  - Photo isolation: suite bedroom photo never appears in deluxe gallery
  - Booking price: checkout receives server-validated price
  - Marketing: ad creative uses listing photos not imageUrls
  - Admin: can see room types in review panel
  - Security: IDOR test on room/media ownership

---

## MILESTONE 12 — PRODUCTION READINESS
Prerequisites: M11 PASSED
Scope: Performance, monitoring, documentation
Changes:
  - Engineering Constitution updated
  - ADR updated with final decisions
  - Incident history updated
  - Monitoring alerts configured

---

## SEQUENCING NOTE
M0 (Done) → M1 → M2 → M3 → M4 → M5* → M6 → M7 → M8 → M9 → M10 → M11 → M12
                                    ↑
                    M5 is highest risk — requires explicit approval before execution

