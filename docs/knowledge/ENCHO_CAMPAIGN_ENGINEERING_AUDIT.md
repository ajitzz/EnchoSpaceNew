# ENCHO Campaign Engineering Audit (Phase 2 & 3 Upgrade)

## Verified Engineering Discoveries

1. **Meta Policy Intelligence Engine**
   - **Discovery:** Meta policies are expansive and change frequently. Hardcoding policy rules directly into API controllers creates fragility.
   - **Solution Implemented:** Extracted all policies to a Markdown-based knowledge layer (`docs/meta/*.md`). The server dynamically concatenates and injects these into the AI Prompt. This decouples logic from policy text, making it extremely easy to adapt when Meta changes rules.

2. **Campaign Quality Score & Confidence Engine**
   - **Discovery:** Users need explainability, not just a binary pass/fail. The AI model returns a structured breakdown (Media, Copy, Targeting, etc.). 
   - **Solution Implemented:** Modified the Copilot return schema to include a `confidenceEngine` array, scoring `approval`, `ctr`, `leadQuality`, `policy`, `creative`, and `targeting`.

3. **AI Rewrite Engine**
   - **Discovery:** AI-suggested rewrites are useless if the Host has to manually copy-paste them.
   - **Solution Implemented:** Added state mutation functions (`applyFix`) on the frontend to allow One-Click Apply for Title, Description, Audience, Budget, and CTA simultaneously.

4. **Media Intelligence**
   - **Discovery:** Analyzing images is mandatory for avoiding Meta's 20% text rule and low-resolution rejection. 
   - **Solution Implemented:** Hooked up a mock integration for Media Analysis inside `server.ts` that provides metrics (blur score, resolution, text percentage) to the Copilot context. *Next step for production is to use a Vision model to process these.*

5. **Landing Page Inspector**
   - **Discovery:** Ad rejections often happen because the destination URL fails (404, missing HTTPS). 
   - **Solution Implemented:** The Copilot now performs an asynchronous HTTP fetch (with a 3000ms timeout) to the `landing_url` to capture `status` and `speed`, passing this directly to the AI for evaluation.

6. **Budget & Audience Engineering**
   - **Discovery:** Hosts do not understand how Meta's Learning Phase requires minimum budget velocity. 
   - **Solution Implemented:** The Copilot now returns `budgetEngineering` estimates (CPL, daily budget required to exit learning in 7 days). Added a dedicated "Apply Recommended Budget" button to the UI.

7. **Learning Engine 2.0**
   - **Discovery:** The AI needs historical context to avoid repeating mistakes.
   - **Solution Implemented:** Added SQL queries to `meta_api_traces` to feed the last 5 rejections (http_status >= 400) and last 2 successes into the prompt context for real-time Retrieval-Augmented Generation (RAG).

## Governance Document Updates
- `ENCHO_ENGINEERING_CONSTITUTION.md` and `AI_OPERATING_PROTOCOL.md` should dictate that no Meta policies be hardcoded in TypeScript, and must always reside in `docs/meta/`.
