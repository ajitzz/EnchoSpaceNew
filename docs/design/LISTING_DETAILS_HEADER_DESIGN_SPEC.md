# ENCHO SPACE: Listing Details Header Design Specification (v2.0)

## 1. Diagnosis of the Current (Legacy) Header
The current iteration (judged at ~1/10) failed because it treated the header as a utilitarian row of buttons rather than an **editorial frame**. 
- **Crowded & Claustrophobic:** Elements were stuffed into a narrow floating pill without proper breathing room or optical alignment.
- **Over-engineered Materials:** The heavy `bg-white/85` with massive drop shadows competed directly with the cinematic 75vh video rather than framing it.
- **Lack of Hierarchy:** The Back button, Title, and Wishlist competed with equal visual weight, causing eye fatigue.
- **Inconsistent Animation:** Basic CSS transitions clashed with the platform's high-end Framer Motion physics engine.

## 2. The ENCHO Design DNA
ENCHO is a luxury hospitality brand. The UI must reflect quiet confidence, not screaming SaaS functionality.
- **Colors:** Zinc (not pure black/white) for depth. `zinc-950` for heavy contrast, `zinc-100` for soft elevation. `amber-500` strictly reserved for the pulsing dynamic accent.
- **Typography:** `Plus Jakarta Sans` for display (titles, structural wayfinding). `Inter` for functional micro-copy. `font-serif` strictly for the ENCHO brand mark.
- **Materials:** Transparent at the very top (letting the video shine). Morphing into a subtle, ultra-thin frosted glass (`backdrop-blur-2xl bg-white/40 dark:bg-zinc-900/40`) *only* when scrolling out of the hero zone.

## 3. The 10/10 UX Principles
- **Invisibility over Functionality:** The header exists to serve the media. If the user isn't actively navigating, the header should feel like it's barely there.
- **Optical Centering:** Elements are aligned by their visual mass, not just their bounding boxes.
- **Anticipatory State:** The header reacts to where the user is looking. At the top, it's a transparent overlay. Below the fold, it morphs into a high-contrast utility bar.

## 4. Desktop Header Architecture & Layout
**Structure:** Full-width grid spanning the `max-w-[1400px]` container, suspended 24px (`top-6`) from the viewport edge.
- **Left Zone (25% width):** `[< Chevron] ENCHO` — Brand anchor.
- **Center Zone (50% width):** `✦ THUSHARA` (Property Title) — Centered optically. Hidden on load, fades in when scrolling past the hero video.
- **Right Zone (25% width):** `[♥] [Share] [☰ Menu]` — Action cluster, right-aligned.

## 5. Mobile Header Architecture & Layout
**Structure:** Tight, thumb-friendly layout locked to the top safe area (`top-0`, padded via `pt-safe`). 
- No heavy floating pill on mobile. The header bleeds to the edges to maximize the 75vh video impact.
- **Left:** Circular icon button for Back (ultra-minimal).
- **Center:** Truncated title fading in dynamically on scroll.
- **Right:** Circular Wishlist and Share buttons.

## 6. Interaction Design & Micro-interactions
- **Hover:** Zero scaling on structural elements. Instead, we use opacity shifts and sub-pixel translations (e.g., Chevron moves `-2px` left on hover).
- **Active State:** A brief, spring-dampened 0.95 scale down for tactile feedback.
- **Haptics:** All buttons trigger `uiAudio.playClick()` or `playPop()` for sensory reinforcement.

## 7. Scroll Behavior & State Machine
The header utilizes a `framer-motion` `useScroll` hook to map opacity and background blurs.
- **0px - 100px (Hero Zone):** `bg-transparent`, text dropshadow for legibility, Center Title `opacity-0`.
- **100px - 400px (Transition):** Background interpolates to `bg-white/60 dark:bg-zinc-900/60` with `backdrop-blur-2xl`. Title translates up and fades to `opacity-100`.
- **400px+ (Reading Zone):** Solidified frosted glass. Text flips to high contrast (Zinc 900 / White).

## 8. Typography & Spacing Math
- **Brand Mark:** `font-serif text-[11px] tracking-[0.25em] uppercase`.
- **Property Title:** `font-display text-sm font-semibold tracking-wide uppercase`.
- **Spacing:** Based on an 8px base grid. Inter-element gaps are exactly `gap-2` (8px) or `gap-3` (12px).

## 9. Glassmorphism & Materials Spec
We abandon the heavy `bg-white/85`.
**New Spec:**
```css
background: rgba(255, 255, 255, 0.3); /* dark: rgba(24, 24, 27, 0.4) */
backdrop-filter: blur(24px) saturate(120%);
border-bottom: 1px solid rgba(255, 255, 255, 0.15);
box-shadow: 0 4px 30px rgba(0, 0, 0, 0.05);
```
On dark videos, text must utilize CSS `text-shadow` or a subtle gradient underlay rather than suffocating the video in a solid header pill.

## 10. The Wishlist Button Micro-interaction
- **Idle:** Minimalist line icon (`stroke-zinc-900 dark:stroke-white`).
- **Hover:** Heart interior fills slightly with a muted rose tint.
- **Click:** Heart fills with `#e51d53` (Rose 600), triggering a localized Framer spring burst (`scale: [1, 1.3, 0.9, 1]`) and `playPop()` audio.

## 11. The Menu / Share Interactions
- **Share:** A minimalist `Share` or `ArrowUpRight` icon. Opens native share sheet or copies to clipboard with a subtle toast.
- **Menu (☰):** Introduces a new trigger for a global Encho off-canvas nav, designed to keep users in the walled garden.

## 12. Accessibility (A11y) & Touch Targets
- All interactive elements must have a minimum bounding box of `44x44px` on mobile, even if the visible icon is `16x16px`.
- `aria-label` strictly defined for every icon-only button ("Go back", "Add to wishlist", "Share listing").
- High contrast fallback modes for users with reduced transparency preferences.

## 13. Z-Index Management Layering
- **Video Surface:** `z-0`
- **Gradient Overlays:** `z-10`
- **Floating Content (Capsules):** `z-40`
- **Header:** `z-50`
- **Modals/Drawers:** `z-60`

## 14. Dark Mode / Light Mode Contrast Handling
Since the background is a video, light/dark mode applies to the *system* UI. However, the top of the video could be bright or dark. We will inject a subtle `bg-gradient-to-b from-black/40 to-transparent` strictly behind the header zone on initial load to guarantee icon legibility regardless of the video content.

## 15. Animation Timings & Physics (Framer Motion)
```javascript
const springConfig = { type: "spring", stiffness: 400, damping: 30, mass: 0.8 };
const transitionSoft = { duration: 0.4, ease: [0.16, 1, 0.3, 1] };
```

## 16. Phase 19 Implementation Plan
**Steps to Code:**
1. Rip out the current `div.sticky` header in `ListingDetailsNew.tsx`.
2. Implement a `framer-motion` `useScroll` hook bound to the top of the page.
3. Build the transparent-to-glass morphing container.
4. Build the 3-zone layout grid.
5. Re-implement the `<button>` clusters using the new interaction specs.
6. Verify responsive bounds (Desktop vs. Mobile bleed).
7. Execute Visual QA.
