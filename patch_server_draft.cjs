const fs = require('fs');
let file = fs.readFileSync('server.ts', 'utf-8');

const newEndpoint = `app.post('/api/ai/draft-property', authenticateToken, async (req: AuthRequest, res) => {
  if (!ai) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { prompt } = req.body;
    const systemInstruction = \`You are an expert real-estate listing assistant.
The user will describe their property in natural language.
Your job is to draft all the key details for a property listing.

Return ONLY a valid JSON object matching this structure (with no markdown blocks):
{
  "title": "A catchy, premium title",
  "description": "A warm, inviting, 2-3 paragraph description.",
  "type": "Property Type (e.g. Villa, Apartment, House, Cabin)",
  "city": "City/Region name if mentioned",
  "rentalMode": "entire_place" or "private_rooms" or "hybrid",
  "price": 5000 (estimated base price per night in INR, make a reasonable guess),
  "maxGuests": 4,
  "bedrooms": 2,
  "beds": 2,
  "bathrooms": 2,
  "amenities": ["Wifi", "Pool", "Kitchen"] (array of strings, guess based on description)
}
If a detail is not mentioned, make a smart default or leave it empty, but provide a great title and description.\`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.8,
        responseMimeType: "application/json"
      }
    });

    const output = JSON.parse(response?.text || '{}');
    res.json(output);
  } catch (error) {
    console.error('Draft AI generation error:', error);
    res.status(500).json({ error: 'Failed to generate property draft' });
  }
});

`;

file = file.replace(
    "app.post('/api/ai/suggest-listing'",
    newEndpoint + "app.post('/api/ai/suggest-listing'"
);

fs.writeFileSync('server.ts', file);
console.log('Added draft-property endpoint');
