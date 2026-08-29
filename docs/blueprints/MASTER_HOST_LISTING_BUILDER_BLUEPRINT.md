# ENCHO MASTER HOST LISTING BUILDER BLUEPRINT
> Status: DISCOVERY COMPLETE — AWAITING APPROVAL
> Date: 2026-08-29 | Version: 1.0 | ZERO CODE MODIFIED

---

## 1. EXECUTIVE ARCHITECTURAL DIAGNOSIS

The Encho platform suffers a **critical Host → Guest data lineage break**.
The Guest pages (ListingDetailsNew.tsx, SanctuaryGalleryModal.tsx) were built
for a single fictional hardcoded property. The HostForm was built AROUND this
hardcoded schema, creating a dangerous illusion: the form APPEARS to capture data
that the Guest UI IGNORES.

### The Core P0 Defect:
The Guest landing page renders ROOM_TIER_CONFIG — a hardcoded JavaScript constant —
not the Host's database-stored room data. Every price, every room name, every spec
shown to the Guest is FABRICATED IN THE BROWSER regardless of what the Host saved.

---

## 2. HARDCODED CONSTANTS FORENSIC MAP

### ListingDetailsNew.tsx — Lines 52-87: ROOM_TIER_CONFIG
EVERY guest sees these hardcoded values regardless of what host configured:
  suites:    price=18500, name='Presidential Panorama Suite', capacity=2
  deluxe:    price=11500, name='Deluxe Garden Double Room',   capacity=2
  executive: price=7500,  name='Executive Studio Sanctuary',  capacity=1

### ListingDetailsNew.tsx — Lines 361-453: slideCollections
Photos displayed by POSITIONAL INDEX (pool[0-3]=Suites, pool[4-7]=Deluxe, pool[8-11]=Executive)
NOT by photo.tier or photo.category tags that the host assigned.

### ListingDetailsNew.tsx — Lines 113-136: images[] (24 Unsplash URLs)
When host has fewer than 12 photos, Unsplash luxury hotel images are shown.

### ListingDetailsNew.tsx — Lines 230-341: curatedNeighborhoodPOIs
ALL 6 POIs (Chembra Peak, Soochipara Waterfalls, Banasura Sagar Dam, Edakkal Caves,
Wilton Bistro, 1980s Restaurant) are hardcoded for Wayanad, Kerala — applied to
EVERY property on the platform regardless of location.

### SanctuaryGalleryModal.tsx — Lines 40-77: GALLERY_CATEGORIES
Tab headlines hardcoded ('Presidential Panorama Suites', 'Deluxe Garden Sanctuaries',
'Executive Work & Rest Enclaves') regardless of host's room names.

---

## 3. DATABASE SCHEMA CURRENT STATE

### listings table (production)
  id, user_id, title, description, price (one base price), currency, type,
  address, city, image_url (TEXT), image_urls (JSONB flat), photos (JSONB structured),
  max_guests, bedrooms, beds, bathrooms, amenities, video_url, rental_mode,
  rooms (JSONB), lat, lng, dynamic_pricing, hero_video_url, hero_fallback_url,
  dominant_color_hex, raw_rules, curated_guidelines, experience_tags,
  seo_title, seo_description, seo_keywords, seo_image_url, amenity_clusters,
  child_safety_specs, nearby, created_at

### room_types table (EXISTS but ORPHANED — never queried by guest API)
  id, listing_id, name, base_price, currency, max_occupancy, inventory_count,
  features (JSONB), amenities (JSONB), created_at, updated_at

### media_assets table (EXISTS but ORPHANED — never queried by guest API)
  id, entity_type, entity_id, url, category, title, description, specs,
  lighting_time, is_hero, order_index, created_at
  MISSING: tier, room_type_id, mime_type, width, height, file_size, moderation_status

---

## 4. HOST → DATABASE → API → GUEST DEPENDENCY GRAPH

HOST INPUT                SAVED TO DB           API RETURNS         GUEST SEES
──────────────────────────────────────────────────────────────────────────────
title                  → listings.title       → listing.title     → ✅ RENDERED
description            → listings.description → listing.desc      → ✅ (with fallback)
hero_video_url         → listings.hero_video  → listing.hero_v    → ✅ RENDERED
dominant_color_hex     → listings.dom_color   → listing.dom_c     → ✅ RENDERED
experience_tags        → listings.exp_tags    → listing.exp_tags  → ✅ (with fallback)
curated_guidelines     → listings.guidelines  → listing.guidel    → ✅ (with fallback)
child_safety_specs     → listings.child_s     → listing.child_s   → ✅ RENDERED
price (base)           → listings.price       → listing.price     → 🟡 MUTATED by * 1.35/0.65
seo_title/desc/kw      → listings.seo_*       → listing.seo_*     → ✅ RENDERED
rooms[].name           → listings.rooms JSONB → listing.rooms[]   → ❌ IGNORED (ROOM_TIER_CONFIG used)
rooms[].price          → listings.rooms JSONB → listing.rooms[]   → ❌ IGNORED (hardcoded prices)
rooms[].capacity       → listings.rooms JSONB → listing.rooms[]   → ❌ IGNORED (hardcoded capacity)
rooms[].features       → listings.rooms JSONB → listing.rooms[]   → ❌ IGNORED
rooms[].description    → listings.rooms JSONB → listing.rooms[]   → ❌ IGNORED
photos[tier, cat]      → listings.photos JSONB→ listing.photos[]  → ✅ SanctuaryGallery ONLY
                                                                    ❌ ListingDetailsNew ignores
amenities[]            → listings.amenities   → listing.amenities → ❌ NOT RENDERED IN DETAIL PAGE
amenity_clusters       → listings.am_clusters → listing.am_cl     → ❌ NOT RENDERED
nearby[]               → listings.nearby      → listing.nearby    → ❌ IGNORED (hardcoded POIs)

---

## 5. MISMATCH MATRIX

HOST CAN ADD                           GUEST SEES                    STATUS
──────────────────────────────────────────────────────────────────────────────
Room name "Ocean Bungalow Suite"    → "Presidential Panorama Suite"  ❌ MISMATCH
Room price ₹25,000                  → ₹18,500 (hardcoded)           ❌ MISMATCH
Room description                    → Not shown                     ❌ GAP
Room features/specs                 → Hardcoded spec string         ❌ MISMATCH
Room capacity 3 guests              → 2 (hardcoded)                 ❌ MISMATCH
Photo tagged [suites+bedroom]       → Shown by index 0-3           ❌ POSITIONAL
Photo tagged [deluxe+bathroom]      → May show under wrong room     ❌ MISMATCH
Property description                → ✅ with hardcoded fallback    🟡 PARTIAL
Experience tags                     → ✅ with hardcoded fallback    🟡 PARTIAL
Amenities list                      → ❌ Not shown on detail page   ❌ GAP
Neighborhood POIs                   → ❌ Wayanad POIs shown instead  ❌ MISMATCH
AI Gatekeeper score                 → Never stored (simulation only)❌ FAKE

---

## 6. MEDIA ARCHITECTURE ANALYSIS

Current Dual (Conflicting) Systems:
  System A (Legacy): listings.image_url + listings.image_urls (flat, no metadata)
  System B (Modern): listings.photos JSONB + media_assets table (both ORPHANED in guest API)

System A consumed by: ListingDetailsNew (primary), AdminDashboard, HostMarketing
System B consumed by: SanctuaryGalleryModal (primary)

Safe Migration Path Required: Expand-then-cutover
1. Add tier to media_assets
2. Update API to return photos[] alongside image_urls[]
3. Update ListingDetailsNew to use photos[] when available
4. Update Marketing Engine to read photos[]
5. Deprecate image_urls (keep for backward compat)

---

## 7. PRICING DOMAIN ANALYSIS — P0 SECURITY DEFECT

Current: Browser calculates and sends price to checkout
Required: Server validates price before payment processing

Current formula (browser):
  suites_price    = listing.price * 1.35   (hardcoded multiplier)
  executive_price = listing.price * 0.65   (hardcoded multiplier)
  deluxe_price    = listing.price           (base)

Required formula:
  suites_price    = listing.rooms.find(r => r.type === 'suites').price    (HOST SET)
  deluxe_price    = listing.rooms.find(r => r.type === 'deluxe').price    (HOST SET)
  executive_price = listing.rooms.find(r => r.type === 'executive').price (HOST SET)
  
  Server must re-validate: POST /api/bookings must reject if price != server_price

---

## 8. ADVERTISING ENGINE PROTECTION MATRIX

Listing Field       Meta Consumer     Google Consumer   Risk If Changed
──────────────────────────────────────────────────────────────────────
imageUrls[0]        Creative image    Display image     HIGH — maintain
imageUrls[]         Carousel/DCO      DCO assets        HIGH — maintain
price               Ad copy           Bid strategy      HIGH — maintain
title               Headline          Headline          LOW
city                Geo targeting     Location          MEDIUM
hero_video_url      Video creative    N/A               LOW
photos[]            NOT YET USED      NOT YET USED      SAFE TO CHANGE

SAFETY RULE: listings.image_urls must NOT be removed until Marketing Engine
is updated to read listings.photos[]. Dual-write must persist during migration.

---

## 9. PROPOSED HOST FORM INFORMATION ARCHITECTURE

Step 1: Property Identity
  - Title, Property Type, Category (Resort/Villa/Hotel/Boutique)
  - Short tagline, Full description

Step 2: Location & Map
  - Address, City, Country
  - Map pin placement (lat/lng)
  - Nearby points of interest (HOST DEFINED, replacing hardcoded Wayanad POIs)

Step 3: Room Types Builder
  FOR EACH room type:
    - Room type name (free-form, NOT forced to "Suite/Deluxe/Executive")
    - Tier classification (common/suites/deluxe/executive) for gallery routing
    - Description (shown on guest page)
    - Price per night (HOST AUTHORITATIVE)
    - Max occupancy
    - Inventory count
    - Features/specs (free-form tags)
    - Amenities specific to this room type
    - Room Media (photos tagged to this specific room type by spatial category)

Step 4: Property-Level Media
  - Hero video loop
  - Property-wide photos (exterior, pool, restaurant, gym, garden)
  - Tagged as tier=common

Step 5: Property Amenities
  - Flat amenity list (displayed in "What this place offers" section)
  - Amenity clusters (vibe, comfort, work, culinary)
  - Child safety specs

Step 6: Policies & Rules
  - Check-in/check-out times (replaces hardcoded "After 2PM")
  - House rules (curated_guidelines)
  - Cancellation policy

Step 7: Pricing & Availability
  - Weekend multiplier, seasonal multiplier
  - Minimum stay nights
  - Advance booking window

Step 8: SEO & Discovery
  - SEO title, description, keywords
  - OG image

Step 9: AI Pre-Flight Check (REAL — not simulation)
  - Call Gemini API to evaluate listing quality
  - Return actual score stored in DB

Step 10: Preview
  - Render SAME ListingDetailsNew.tsx and SanctuaryGalleryModal.tsx
  - No fake preview component

Step 11: Publish
  - Submit for Admin Review → APPROVED → Published

---

## 10. P0/P1/P2/P3 GAP REGISTER

P0 CRITICAL (Fix before ANY new feature):
  P0-001: Browser is price authority — server does not validate booking price
  P0-002: ROOM_TIER_CONFIG hardcoded — every host gets wrong room names/prices shown
  P0-003: slideCollections hardcoded — photos shown by position not by tier tag

P1 HIGH (Core experience broken):
  P1-001: listing.photos[] not read by ListingDetailsNew hero section
  P1-002: GALLERY_CATEGORIES labels hardcoded regardless of host room names
  P1-003: Neighborhood POIs hardcoded for Wayanad — applies to all properties
  P1-004: room_types table populated but never queried by guest API
  P1-005: media_assets missing tier column — room-media linkage impossible
  P1-006: Amenities not rendered in listing detail page
  P1-007: HostForm has no room-specific media upload workflow

P2 MEDIUM (Quality and reliability):
  P2-001: AI Gatekeeper is client-side simulation, not real Gemini API call
  P2-002: No autosave/draft recovery in HostForm
  P2-003: No concurrency protection (two browser tabs)
  P2-004: Missing IDOR check on room/media ownership
  P2-005: Photo upload has no retry/failure state
  P2-006: No room inventory enforcement at booking
  P2-007: Marketing Engine reads imageUrls not structured photos

P3 LOW (Enhancements):
  P3-001: No per-room SEO
  P3-002: No floor plan upload
  P3-003: No video per room type

---

## 11. CURRENT VS TARGET ARCHITECTURE SCORE

Domain               Current   Target   Gap
─────────────────────────────────────────────
Data Model              4/10    9/10    rooms[] not read by guest UI
Guest Presentation      3/10   10/10    Hardcoded ROOM_TIER_CONFIG
Host Builder            5/10    9/10    No room-linked media builder
Media Architecture      4/10    9/10    Dual systems, no tier in media_assets
Room Domain Model       3/10    9/10    room_types table orphaned
Pricing                 2/10   10/10    Browser is price authority
Security                5/10    9/10    IDOR risk on room ownership
Testing                 1/10    8/10    No tests exist
Migration               3/10    9/10    No migration strategy
─────────────────────────────────────────────
OVERALL:               4.6/10  9.1/10

---

## 12. PROTECTED COMPONENTS — DO NOT MODIFY WITHOUT MIGRATION PLAN

  Financial Ledger / Escrow
  Campaign FSM (Meta)
  Google Ads provider
  Stripe/Razorpay webhook handlers
  /api/bookings endpoint
  bookings table (existing reservations)
  users table (authentication)
  listings.image_urls column (Marketing Engine dependency)
  listings.rooms JSONB (existing bookings may reference room names)

