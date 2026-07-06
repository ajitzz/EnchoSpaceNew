const fs = require('fs');
let file = fs.readFileSync('server.ts', 'utf-8');

const newEndpoint = `app.post('/api/ai/suggest-experience', authenticateToken, async (req: AuthRequest, res) => {
  if (!ai) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { category, city, languages, difficulty } = req.body;
    const systemInstruction = \`You are an expert travel experience curator.
Create a captivating title, a compelling description, and a bulleted list of "What you will do" for a new experience.

Details provided:
Category: \${category}
Location: \${city}
Languages: \${(languages || []).join(', ')}
Difficulty: \${difficulty}

Return ONLY a valid JSON object in this exact format, with no markdown code blocks around it:
{"title": "your suggested title", "description": "your suggested description (2 paragraphs)", "what_to_expect": "Bulleted list of activities..."}
Do NOT include any empty placeholders.\`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "Generate experience details.",
      config: {
        systemInstruction,
        temperature: 0.8,
        responseMimeType: "application/json"
      }
    });

    const output = JSON.parse(response?.text || '{}');
    res.json({ title: output.title || '', description: output.description || '', what_to_expect: output.what_to_expect || '' });
  } catch (error) {
    console.error('Exp AI generation error:', error);
    res.status(500).json({ error: 'Failed to generate exp details' });
  }
});

`;

file = file.replace(
    "app.post('/api/ai/suggest-listing'",
    newEndpoint + "app.post('/api/ai/suggest-listing'"
);

fs.writeFileSync('server.ts', file);
console.log('Added suggest-experience endpoint');
