# HOST LISTING BUILDER — DECISION REGISTER
> All decisions are OPEN until explicitly marked APPROVED by the product owner.
> Format: [STATUS] Decision — Rationale — Options

---

## ARCHITECTURE DECISIONS

[OPEN] ADR-001: Room Type Identity Model
  Question: Should room types use fixed keys (suites/deluxe/executive) or free-form names?
  Proposed: Free-form names with tier classification (e.g., "Ocean Bungalow" with tier=suites)
  Options:
    A. Keep fixed 3-tier system (suites/deluxe/executive) — simple, backward compatible
    B. Free-form room type names with tier tag for gallery routing — flexible, requires migration
    C. Fully custom (no tier concept, just room name) — max flexibility, gallery routing complex
  Recommendation: Option B — host defines "Ocean Bungalow Suite" but classifies it as tier=suites
  Risk: Existing bookings reference tier names — need migration adapter
  AWAITING APPROVAL

[OPEN] ADR-002: Media Storage Architecture
  Question: Use listings.photos JSONB or media_assets table as primary store?
  Proposed: media_assets as PRIMARY (with tier + room_type_id columns added)
  Options:
    A. Keep listings.photos JSONB as primary — simple, no join needed
    B. Elevate media_assets to primary — proper relational, supports moderation
    C. Hybrid: JSONB for display (fast), media_assets for admin/moderation
  Recommendation: Option C (Hybrid) — JSONB for fast API response, media_assets for admin
  AWAITING APPROVAL

[OPEN] ADR-003: Pricing Authority
  Question: Who is the authoritative source for per-room prices sent to checkout?
  Proposed: Server-side validation of room price before payment processing
  Required Change: New endpoint GET /api/listings/:id/rooms/:roomTypeId/price
  Booking API must reject requests where client_price != server_price
  AWAITING APPROVAL

[OPEN] ADR-004: Neighborhood POI Source
  Question: Should POIs be host-defined (form input) or AI-generated from coordinates?
  Proposed: Host defines POIs in HostForm (replaces hardcoded Wayanad data)
  Options:
    A. Host manually enters nearby points — most control, host burden
    B. AI auto-generates from lat/lng — zero host burden, API cost
    C. Hybrid: AI generates but host can edit/approve
  Recommendation: Option C — auto-generate on location save, host can edit
  AWAITING APPROVAL

[OPEN] ADR-005: Gallery Category Labels
  Question: Should GALLERY_CATEGORIES tabs show host-defined room names or fixed tier labels?
  Proposed: Dynamic tab labels derived from listing.rooms[].name
  Required Change: GALLERY_CATEGORIES becomes dynamic from listing.rooms[] not hardcoded constant
  AWAITING APPROVAL

[OPEN] ADR-006: AI Gatekeeper Implementation
  Question: Should the AI Gatekeeper use real Gemini API or remain simulated?
  Proposed: Real Gemini API call, score stored in listings_drafts.ai_score
  Required: GEMINI_API_KEY in environment, rate limiting (5 evaluations/host/hour per AGENTS.md)
  AWAITING APPROVAL

[OPEN] ADR-007: Draft Autosave Strategy
  Question: How frequently should HostForm autosave?
  Proposed: Debounced 5-second autosave to /api/listings-drafts/:id PATCH
  Options:
    A. Manual save only — safest for API, worst UX
    B. 5-second debounce — industry standard (Airbnb, Notion)
    C. On-step-change only — balanced
  Recommendation: Option B with local storage fallback
  AWAITING APPROVAL

[OPEN] ADR-008: HostForm Step Count
  Question: 6 steps or 11 steps?
  Current: 6 steps (Basics, Location, Spaces, Amenities, Pricing, SEO)
  Proposed: 8 steps (Identity, Location, Room Types Builder, Property Media, Amenities, Policies, Pricing, SEO+AI)
  AWAITING APPROVAL

---

## DATABASE DECISIONS

[OPEN] DB-001: Add tier column to media_assets
  SQL: ALTER TABLE media_assets ADD COLUMN tier VARCHAR(50) DEFAULT 'common';
  Risk: LOW — additive column
  Backward compat: YES — DEFAULT 'common' backfills existing rows
  AWAITING APPROVAL

[OPEN] DB-002: Add room_type_id to media_assets
  SQL: ALTER TABLE media_assets ADD COLUMN room_type_id INT REFERENCES room_types(id) ON DELETE SET NULL;
  Risk: LOW — nullable FK, additive
  AWAITING APPROVAL

[OPEN] DB-003: Add moderation_status to media_assets
  SQL: ALTER TABLE media_assets ADD COLUMN moderation_status VARCHAR(50) DEFAULT 'approved';
  AWAITING APPROVAL

[OPEN] DB-004: Add ai_score to listings_drafts
  SQL: ALTER TABLE listings_drafts ADD COLUMN ai_score DECIMAL;
  AWAITING APPROVAL

[OPEN] DB-005: Add nearby to listings (already exists per schema)
  Status: Column ALREADY EXISTS. HostForm saves to it. Guest UI ignores it.
  Fix required: ListingDetailsNew must read listing.nearby and use it instead of hardcoded POIs
  AWAITING APPROVAL

[OPEN] DB-006: Expand spatial categories
  Question: Add restaurant, lobby, spa, gym, activity_area, view categories?
  Impact: types.ts SpatialCategory type, PhotoUpload SPATIAL_CATEGORIES array
  AWAITING APPROVAL

---

## MIGRATION DECISIONS

[OPEN] MIG-001: Migrate from hardcoded ROOM_TIER_CONFIG to listing.rooms[]
  Strategy: EXPAND → DUAL-READ → CUTOVER → RETIRE
    Phase 1: ListingDetailsNew reads listing.rooms[] when present, falls back to ROOM_TIER_CONFIG
    Phase 2: All new listings use listing.rooms[]
    Phase 3: Retire ROOM_TIER_CONFIG constant
  Risk: Existing bookings reference "Presidential Panorama Suite" — keep room names consistent
  AWAITING APPROVAL

[OPEN] MIG-002: Migrate from positional photo array to tier-tagged photos
  Strategy: EXPAND → DUAL-READ → CUTOVER
    Phase 1: ListingDetailsNew reads listing.photos[] for slide collections when present
    Phase 2: Falls back to positional image_urls for legacy listings
  Risk: LOW — additive logic
  AWAITING APPROVAL


---
## APPROVALS LOG (2026-08-29)

ADR-001: APPROVED — Free-form room names + tier classification. Hosts can create any room type (suites, deluxe, executive, triplux, honeymoon, etc.)
ADR-003: APPROVED — Implement server-side price validation. Checkout must reject if client_price != server_price.
ADR-004: APPROVED — Hybrid: AI-generate POIs from coordinates, host can edit/add/remove.
ADR-005: APPROVED — Gallery tabs show host-defined free-form room type names.
ADR-006: APPROVED — Real Gemini API for AI Gatekeeper. Rate-limited 5/host/hour per AGENTS.md.
ADR-008: APPROVED — 8-step proposed HostForm architecture.
MIG-001: APPROVED — Expand → Dual-Read → Cutover strategy for ROOM_TIER_CONFIG.
MIG-002: APPROVED — Expand → Dual-Read → Cutover for photo migration to tagged photos[].
