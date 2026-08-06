# ENCHO-META SLIPSTREAM ENGINE: MIDDLEWARE BLUEPRINT

## The Reality Check
We cannot just throw raw coordinates, raw images, and unverified payments at the Meta API. It will reject our payloads, ban our Master Account, and drain our budget. This middleware must be a **translation layer** that perfectly maps Encho's UI data to Meta's strict GraphQL/REST requirements.

## 4-Phase Implementation Pipeline

### Milestone 1: The Meta Target Mapper (Data Translation)
Meta doesn't understand "Quick Target Belts." It understands `geo_locations` (custom coordinates with radiuses in miles/km) and `flexible_spec` (interests/behaviors).
*   **Action**: Build the translation engine. Convert our `[lat, lng, radius_km]` array into Meta's required JSON. Map property amenities (e.g., "Luxury Pool") to Meta Interest IDs (e.g., "Luxury Resorts", "Travel & Leisure").
*   **Output**: A clean, Meta-compliant audience payload.

### Milestone 2: The Dynamic Media Pipeline (Asset Prep)
Meta placements (Stories, Feed, Explore) require strict aspect ratios. If we send a horizontal image for a Reel, our CPM skyrockets.
*   **Action**: Create a service (or mock pipeline for now) that takes the property's hero image and crops/resizes it into 1:1, 9:16, and 16:9 variants before passing the asset IDs to the Meta Ad Creative endpoint.

### Milestone 3: The "Refuel" Engine & Idempotent Launcher
When a host pays $100, we must charge them securely and ONLY launch the ad if the payment clears.
*   **Action**: Wrap the campaign launch sequence in a strict state machine: `PAYMENT_PENDING` -> `PAYMENT_SUCCESS` -> `ASSET_PREP` -> `META_API_PUSH` -> `CAMPAIGN_LIVE`. Use idempotency keys so a double-click doesn't double-charge or launch two campaigns.

### Milestone 4: Native Webhooks & The Walled Garden CRM
When a user on Instagram fills out the native Meta Lead form, Meta fires a webhook. We have exactly 5 seconds to respond 200 OK, or Meta throttles us.
*   **Action**: Build `/api/meta-webhooks`. Ingest the lead, sanitize the data (mask phone numbers/emails to enforce the walled garden), and inject it directly into the Encho Host Inbox table. Trigger the "Cold Start" SMS/Email alert to the host.

### Milestone 5: The Circuit Breaker (Smart Pause)
If the property gets booked for the targeted dates, we must stop spending money immediately.
*   **Action**: A listener on the booking calendar that fires a `PAUSE` request to Meta when occupancy hits 100%.

---
**Prepared by**: Your Brutally Honest Co-Founder.
**Status**: APPROVED FOR PHASE 3 EXECUTION.
