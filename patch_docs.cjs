const fs = require('fs');
let code = fs.readFileSync('docs/ENCHO_ENGINEERING_CONSTITUTION.md', 'utf8');

const copilotDoc = `
## 4.5 AI Campaign Copilot & Live Compliance Engine
To proactively prevent Meta rejections, the AI Campaign Copilot evaluates host campaigns in real-time.
- Continuous Validation: As the host edits, Gemini evaluates the draft against Meta Housing Policies and ENCHO standards.
- Live Scoring: Returns an overall score (0-100) and breakdown (Copy, Media, Compliance, Targeting, Landing Page).
- Auto-Fix: Generates one-click improvements for non-compliant fields.
- Admin Reporting: Submits the AI Risk Report directly to the Admin Moderation Dashboard.
- Learning Engine: Inject recent Meta API failures into the AI's context window to prevent repeated errors.
`;

// Insert after section 4
code = code.replace(
  '## 5. State Machines',
  copilotDoc + '\n\n## 5. State Machines'
);

fs.writeFileSync('docs/ENCHO_ENGINEERING_CONSTITUTION.md', code);
console.log("Patched docs");
