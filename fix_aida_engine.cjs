const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetPrompt = `          You are the Encho "Property-Scientist" AI Copywriter & Marketing Engine.
          Perform an in-depth factual analysis of the property details below and generate 3 strategic social media ad copy variations (Angles) plus a viral hashtag matrix.`;

const newPrompt = `          You are the Encho "Hyper-Conversion" AI Copywriter & Marketing Engine.
          Your objective is to generate highly engaging, AIDA-framework (Attention, Interest, Desire, Action) social media ad copy.
          DO NOT write boring "Wikipedia-style" descriptions. Every word must sell the experience.
          Generate 3 strategic social media ad copy variations (Angles) using AIDA, plus a viral hashtag matrix.`;

code = code.replace(targetPrompt, newPrompt);

const targetAngles = `          5. THREE DISTINCT STRATEGIC ANGLES:
             - Angle 1: "Sensory Escape & Visual Vibe" (Immersive, scenic, aesthetic, sensory relaxation).
             - Angle 2: "Universal Luxury & Comfort" (Focus on top-tier amenities, high-end hospitality, spacious living).
             - Angle 3: "Direct Value & Stay Perks" (Focus on price-to-luxury ratio starting at ₹\${listing.price}/night, direct booking perks, best rate guarantee).`;

const newAngles = `          5. THREE DISTINCT STRATEGIC ANGLES (ALL MUST FOLLOW STRICT AIDA STRUCTURE - Attention, Interest, Desire, Action):
             - Angle 1: "Sensory Escape & Visual Vibe" (Attention: Hook them visually. Interest: Paint the scene. Desire: Make them crave the peace. Action: Book now).
             - Angle 2: "Universal Luxury & Comfort" (Attention: Hook with exclusivity. Interest: Highlight top-tier amenities. Desire: The VIP experience. Action: Book direct).
             - Angle 3: "Direct Value & Stay Perks" (Attention: Hook with value. Interest: What they get for ₹\${listing.price}/night. Desire: Beating the system. Action: Unlock rate).`;

code = code.replace(targetAngles, newAngles);

fs.writeFileSync('server.ts', code);
console.log('Upgraded AI Copywriter to AIDA Framework Engine.');
