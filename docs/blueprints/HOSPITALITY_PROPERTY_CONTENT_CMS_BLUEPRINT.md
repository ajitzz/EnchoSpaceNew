# ENCHO HOSPITALITY PROPERTY CONTENT CMS BLUEPRINT

**STATUS: DISCOVERY COMPLETE. PENDING APPROVAL TO IMPLEMENT.**

## 1. The Guest View Data Contract (What we built)
The `ListingDetailsNew.tsx` and `SanctuaryGalleryModal.tsx` depend on a highly specific `Listing` and `SpatialPhoto` payload to render the "Apple/Award-winning" experience.

**The Sanctuary Gallery Contract (`SpatialPhoto`):**
Requires an array of photos, but not just URLs. Each photo must have:
- `url`: The image source.
- `category`: Must strictly be one of `['living_room', 'dining', 'bedroom', 'bathroom', 'garden', 'exterior', 'pool', 'details', 'other']`.
- `title` & `description`: For the cinematic lightbox text.
- `specs` & `lightingTime`: For the architectural metadata (e.g., "Golden Hour 17:30").
- `isHero`: Boolean to define the cover image.

**The Luxury Listing Contract (`Listing`):**
- `hero_video_url`, `dominant_color_hex`, `experience_tags`, `editorial_quote`.
- `rental_mode`: dictates if we render the whole place or individual rooms.
- **The Room Bottleneck:** Currently, `ListingDetailsNew.tsx` renders 'Suites', 'Deluxe', and 'Executive' from a hardcoded `ROOM_TIER_CONFIG` and calculates prices via multipliers (`price * 1.35`). 

## 2. Host Form Architecture (How we feed the Guest View)
To populate this without developer intervention, the `HostForm.tsx` must be rebuilt as a multi-stage authoring CMS:

**Step 1: Property Story (The Basics)**
- Title, Base Price, Location.
- Inputs for `editorial_quote` and `experience_tags`.

**Step 2: The Sanctuary Media Engine**
- A drag-and-drop interface where hosts don't just upload, they **categorize**. 
- The UI provides buckets: "Living Room", "Exterior", "Pool". 
- When an image is dropped in a bucket, it opens a metadata modal to add `title`, `description`, and `lightingTime`, mapping perfectly to the `SpatialPhoto` interface.

**Step 3: Room & Tier Pricing (Fixing the P0 Gap)**
- We must replace the hardcoded frontend math.
- The HostForm will force the host to explicitly set prices for "Suites", "Deluxe", and "Executive" (or define their own tiers), storing them in the `rooms: Room[]` or `dynamicPricing` JSON array.

**Step 4: Draft & Preview**
- The form saves to a `draft` state. 
- A "Preview" button loads `ListingDetailsNew.tsx` using the draft JSON so the host sees exactly what the guest will see.

## 3. Admin Control Architecture
- **Sanctuary Auditor:** Admin dashboard tab that allows admins to view the `SpatialPhoto` array for any property and edit the `lightingTime` or `editorial_quote` to Encho standards.
- **Publishing Gate:** Properties remain in "Pending Review" until Admin hits "Approve", which flips the `isVerified` flag and moves the Draft data to Production data.
