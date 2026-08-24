# ENCHO "GOD LEVEL" UI & VERTICAL SYSTEM ARCHITECTURE
**Document Status:** Locked for Execution (Phase 2 Complete)
**Target:** `ListingDetailsNew.tsx` and all connected vertical systems.
**Standard:** 10.0/10 Aman Resorts / Casa Angelina (FAANG Industrial Grade)

## 1. THE CORE PHILOSOPHY
The standard OTA (Online Travel Agency) grid layout is a 4.5/10. It is a transaction. Encho is building a **Psychological Conversion Engine**. We recognize two distinct traffic sources:
*   **The Instagram Scroller:** High-dopamine, visual-first, impulse buyer. Requires cinematic immersion, frictionless flow, and emotional sensory triggers.
*   **The Google Searcher:** High-intent, comparative, analytical buyer. Requires verifiable trust anchors, hard data (WiFi speeds), and structured details.

The UI must dynamically adapt (Polymorphic Routing) to cater to both, while stroking the Host's ego and trapping bounced traffic into a Walled Garden CRM.

## 2. THE FRONTEND MASTERPIECE (`ListingDetailsNew.tsx`)

*   **The Cinematic Hero & Chameleon UI:** An auto-playing 5s `.webm` video (with `.webp` graceful fallback for 3G/Battery Save). The UI dynamically extracts the dominant color from the media to tint the frosted glass components.
*   **The "Breath" (Scroll Physics):** Content reveals itself with a 0.6s ease-out curve. No jarring scroll snaps.
*   **Sensory Deck & Atmosphere Quotes:** Moving away from bulleted amenities to high-contrast "Experience Tags" (e.g., "Ocean Sounds") and massive, emotive review quotes.
*   **Analytical Trust Anchor:** Verified hard data (speed tests, interactive floorplans) pushed higher for Google traffic.
*   **The FOMO Engine:** WebSocket-driven `liveViewers` translated into psychological scarcity (e.g., "High demand for your dates").
*   **Floating Glass Concierge:** A `backdrop-filter` bottom dock housing a custom `react-day-picker`. It uses the Visual Viewport API to dodge mobile keyboards and implements a "Skeletal Handoff" (loading state) to mask network latency during booking.
*   **Editorial Host Signature:** Treating the host like a curator ("Curated by Alexander") rather than a landlord.

## 3. THE BLAST RADIUS (System-Wide Synchronization)
Because we are upgrading the UI to "God Level," all connected systems must be upgraded to support the new data structures.

1.  **Database (Neon Postgres):**
    *   Add `heroVideoUrl`, `heroFallbackUrl`, `dominantColorHex` to Listings.
    *   Expand `ExperienceTags` enum.
    *   Add `rawRules` and `curatedGuidelines`.
    *   Provision `Leads` table for exit-intent email capture.
2.  **Host Listing Form & Dashboard:**
    *   Build the "Cinematic Asset Studio" to enforce 5s video uploads.
    *   Implement AI Rule Abstraction: Intercept aggressive host rules and rewrite them into polite "Guidelines" via Gemini.
    *   Add a "Warm Leads" tab in the Host CRM for captured bounce traffic.
3.  **Admin & AI Gatekeeper:**
    *   AI must scan photos to verify "Sensory Tags" (e.g., flag "Ocean View" if in a desert).
4.  **Master Marketing Engine (Meta/Google):**
    *   Edge CDN automatically crops the 16:9 Cinematic Hero to 9:16 for Meta Reels Ads.
    *   Captured "Soft Exit" emails are hashed and piped via CAPI to Meta Retargeting Audiences.

## 4. VERTICAL EXECUTION MILESTONES (Phase 3 Plan)
Do not build the frontend first. Execute in this strict vertical order:

*   **Milestone 1 (Database & Schema):** Update schemas to support video, tags, guidelines, and leads.
*   **Milestone 2 (The Host Input):** Upgrade the Host Listing Form to capture the new God Level assets and AI-curated rules.
*   **Milestone 3 (The Admin & AI Gatekeeper):** Update moderation queues for the new data.
*   **Milestone 4 (The Frontend UI):** Build the actual `ListingDetailsNew.tsx` God Level UI.
*   **Milestone 5 (The Marketing Sync):** Wire the assets and leads to the Ad Networks.
