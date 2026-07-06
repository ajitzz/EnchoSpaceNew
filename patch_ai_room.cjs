const fs = require('fs');
let file = fs.readFileSync('server.ts', 'utf-8');

const newEndpoint = `app.post('/api/ai/suggest-room', authenticateToken, async (req: AuthRequest, res) => {
  if (!ai) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { propertyType, city, propertyAmenities, rentalMode, existingRooms } = req.body;
    const systemInstruction = \`You are a professional hospitality copywriter.
Suggest a creative, luxurious name and an astonishing, premium description for ONE new inventory unit (room/villa/suite) for this property.

Property Details:
Type: \${propertyType}
Location: \${city}
Amenities: \${(propertyAmenities || []).join(', ')}

Return ONLY a valid JSON object in this exact format, with no markdown code blocks around it:
{"name": "your suggested unit name", "description": "your suggested description"}
Do NOT include any empty placeholders. Make the description 2-3 sentences long, evoking exclusivity and wanderlust.\`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "Generate a name and description for a new unit.",
      config: {
        systemInstruction,
        temperature: 0.8,
        responseMimeType: "application/json"
      }
    });

    const output = JSON.parse(response?.text || '{}');
    res.json({ name: output.name || '', description: output.description || '' });
  } catch (error) {
    console.error('Room AI generation error:', error);
    res.status(500).json({ error: 'Failed to generate room details' });
  }
});

`;

file = file.replace(
    "app.post('/api/ai/suggest-listing'",
    newEndpoint + "app.post('/api/ai/suggest-listing'"
);

fs.writeFileSync('server.ts', file);
console.log('Added suggest-room endpoint');
