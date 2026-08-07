const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const copilotEndpoint = `
// ----------------- AI CAMPAIGN COPILOT -----------------
app.post('/api/marketing/copilot', authenticateToken, async (req, res) => {
  try {
    const { formData } = req.body;
    
    // Validate with Gemini
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const prompt = \`
      You are the ENCHO AI Campaign Copilot. You must audit this draft marketing campaign against Meta's Housing Advertising Policies (Special Ad Category) and ENCHO's high standards.
      
      Draft Data:
      \${JSON.stringify(formData, null, 2)}
      
      Output a strict JSON object with this schema:
      {
        "overallScore": number (0-100),
        "breakdown": {
          "copy": number,
          "media": number,
          "metaCompliance": number,
          "targeting": number,
          "landingPage": number
        },
        "expectedApprovalConfidence": number (0-100),
        "issues": [
          { "field": string, "severity": "high"|"medium"|"low", "message": string, "autoFixSuggestion": string }
        ],
        "policyReport": string,
        "predictedReach": string,
        "predictedCTR": string,
        "predictedCPC": string
      }
    \`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const result = JSON.parse(response.text);
    res.json(result);
  } catch (error) {
    console.error('Copilot Error:', error);
    res.status(500).json({ error: 'Failed to analyze campaign' });
  }
});
`;

if (!code.includes('/api/marketing/copilot')) {
  // Insert before the campaign creation route
  code = code.replace("app.post('/api/marketing/campaigns'", copilotEndpoint + "\napp.post('/api/marketing/campaigns'");
  fs.writeFileSync('server.ts', code);
  console.log("Patched server.ts with copilot route.");
} else {
  console.log("Already patched.");
}
