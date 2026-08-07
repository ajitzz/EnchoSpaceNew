const fs = require('fs');
let code = fs.readFileSync('docs/ENCHO_ENGINEERING_CONSTITUTION.md', 'utf8');

const copilotUpdates = `
## 4.6 Meta Campaign Engineering Brain
The AI Campaign Copilot has been upgraded to a full Campaign Engineering Brain.
Capabilities include:
- **Meta Policy Intelligence Engine**: Real-time evaluation against HOUSING and CREATIVE policies defined in the \`/docs/meta\` knowledge layer.
- **Media Intelligence**: Pre-submission analysis of image resolution, blur, text overlay %, and aspect ratios.
- **Landing Page Inspector**: Validates the destination URL for 200 HTTP status and broken link prevention.
- **Audience & Budget Engineering**: Provides concrete estimates for Audience Size, Expected CPM, Recommended Daily Budget, Expected Leads, and CPL.
- **Confidence Engine**: Calculates expected Approval Confidence, CTR, CPC, and Lead Quality before submission.
- **Learning Engine 2.0**: Automatically injects recent Meta API successes (200 OK) and failures (400+ errors) into the AI's prompt context so it learns dynamically over time.
- **AI Rewrite Engine**: Offers 1-click apply fixes for Headings, Primary Text, Descriptions, and CTA that violate Meta policies or underperform.

## Architecture Decision Record (ADR) Additions
| Decision # | Date | Problem | Chosen Solution | Reason | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ADR-003 | 2026-08-07 | Meta API Policy Rejections | Live Preflight & AI Engineering Brain | Waiting for Meta to reject a payload hurts Master Ad Account standing. Preventing it client-side is safer. | Active |
`;

code = code + "\n\n" + copilotUpdates;

fs.writeFileSync('docs/ENCHO_ENGINEERING_CONSTITUTION.md', code);
console.log("Updated Governance Docs");
