# Phase 4.5: The Split-Layout Spatial Tour Architecture

I have reviewed the screenshot. This changes everything for the better. You don't just want a flat grid of photos with tiny category badges on them. You want an **Airbnb-style Sticky Split Layout**.

## The Architecture (Based on your Screenshot)
When a guest is inside the "Executive" tab, the scrollable view is divided into distinct **Sub-Classification Blocks** (Bedroom, Full Bathroom, Balcony).

For each block, the screen is split into two columns:
- **The Left Column (Context):** A sticky or static text block displaying the Sub-classification name (e.g., "Executive Bedroom") and the rich text description/amenities provided by the host (e.g., "Queen bed · Air conditioning · Balcony access").
- **The Right Column (Media):** A beautifully arranged Bento/Masonry grid containing *only* the images tagged for that specific space.

And exactly as you commanded, at the bottom of the Executive tab, there will be additional blocks for the **Common Amenities** (e.g., Left Column: "Shared Infinity Pool", Right Column: Pool Images), so the guest never misses the shared value.

## How to Implement This Without Crashing the System

### 1. The Guest Gallery (`SanctuaryGalleryModal.tsx`)
We will rewrite the `bento` view renderer. Instead of looping over a single grid, we will:
1. Group the photos by their Spatial Tag (e.g., all `bedroom` photos for `executive`).
2. Map over these groups to render a Split-Screen Block:
   - `<div className="w-1/3">` -> Renders the Sub-classification Title and the Description (extracted from the photos).
   - `<div className="w-2/3">` -> Renders the responsive image grid for those photos.
3. Automatically append the `common` tier groups to the bottom of the scroll.

### 2. The Host Form (`PhotoUpload.tsx`)
Because we want to maintain our 10/10 stable database schema (`types.ts`) without crashing the admin dashboards, we will use a **Smart Aggregation** technique. 
When the host tags photos as `[Executive] + [Bedroom]` in the Host Form, they can add a description to one of the photos. The Gallery will dynamically extract that description and use it as the main text for the Left Column of the "Bedroom" block. We will update the Host Form UI to make this intuitively clear to the host (e.g., "Add a description for this space").
