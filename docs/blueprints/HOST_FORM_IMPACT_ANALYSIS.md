# ENCHO HOST FORM REBUILD - SYSTEM IMPACT ANALYSIS

**STATUS: CRITICAL RISK ASSESSMENT**

Rebuilding the Host Form and moving from a monolithic/faked data model to a true relational (Property -> Room Type) and Draft/Publish model will send shockwaves through the entire Encho ecosystem. 

Here is the exact impact analysis and how we must upgrade the connected systems to maintain the 10/10 FAANG standard and prevent catastrophic failures.

## 1. The Marketing Engine (Meta/Google Ads & AI Gatekeeper)
* **The Crash Risk:** The Gemini AI Gatekeeper currently reads `listing.photos` and `listing.description` to grade campaigns and generate A/B test creatives (DCO). If we move to a Draft/Publish model, the AI might accidentally pull Draft data (incomplete photos) and generate rejected Meta Ads, burning our master account standing.
* **The 10/10 Upgrade:** We must strictly route the Marketing Engine to only read from the `Published` state projection. Furthermore, the new "Sanctuary Media Engine" (categorized photos) will allow the AI Gatekeeper to be much smarter—e.g., automatically guaranteeing that Ad Variant 1 uses a 'living_room' hero shot and Ad Variant 2 uses an 'exterior' hero shot.

## 2. Smart Auto-Pause Circuit Breaker
* **The Crash Risk:** Currently, the circuit breaker pauses Meta campaigns if a `listing_id` becomes fully booked. If we introduce real `room_types` with distinct inventory counts (e.g., 4 Suites, 8 Deluxe), the old circuit breaker will fail to calculate true 100% occupancy and will burn ad spend on unavailable dates.
* **The 10/10 Upgrade:** The `calendarCircuitBreaker.ts` must be rewritten. It must aggregate inventory `sum(available_units)` grouped by `room_type_id` for the target dates. It should only pause the Meta ad if the sum across all room types hits 0.

## 3. Dynamic Pricing Sync
* **The Crash Risk:** Meta ads must display accurate pricing. If we replace the faked frontend multiplier (`price * 1.35`) with real `room_types` pricing set by the host, the sync webhook will break, advertising the wrong price and causing massive bounce rates.
* **The 10/10 Upgrade:** The webhook must be updated to trigger on `room_types` table mutations. It must calculate the "Starting at $X" price based on the `MIN(base_price)` of available room types and push that to the Meta Catalog API instantly.

## 4. The Walled Garden CRM & Checkout Engine
* **The Crash Risk:** The checkout flow relies on the frontend `selectedRoomTier` string. If we rebuild the Host Form, the checkout will try to charge the fake multiplied price while the DB expects a real price, causing a Razorpay/Stripe hash mismatch or idempotency failure.
* **The 10/10 Upgrade:** The `CheckoutModal` and `POST /api/bookings` must be completely refactored to accept a `room_type_id`. The server must query the DB for the authoritative price of that specific room type, severing all reliance on frontend math.

## 5. Admin Dashboard & Audit Trails
* **The Crash Risk:** Admins currently edit the monolithic `listings` table. This will break if the data is split across tables.
* **The 10/10 Upgrade:** The Admin Console must be upgraded to support the CQRS (Draft vs Publish) flow. Admins need a "Pending Approvals" queue to audit the Host's draft before pushing it to the Published projection.

## 6. Database Migration Strategy (Zero Downtime)
* **The Crash Risk:** Running `ALTER TABLE` to drop the JSONB columns while live traffic is hitting the DB will cause immediate 500 errors for existing properties.
* **The 10/10 Upgrade:** 
    1. Create the new `room_types` and `listings_draft` tables.
    2. Run a background ETL script to parse the old `rooms` JSONB and insert it into `room_types`.
    3. Dual-write to both systems during the transition.
    4. Flip the read-path in the API.
    5. Drop the old columns safely.
