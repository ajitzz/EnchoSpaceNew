const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Gap 12: Real lead scoring endpoint
const gap12Route = `

// Gap 12: AI Lead Intent Scoring (Visual Badging)
app.post('/api/marketing/threads/:id/score-intent', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    
    // Check if user is host
    const threadCheck = await pool.query('SELECT host_id FROM threads WHERE id = $1 AND host_id = $2', [id, req.user?.id]);
    if (threadCheck.rows.length === 0) {
       return res.status(403).json({ error: 'Unauthorized to score this lead' });
    }
    
    const messages = await pool.query('SELECT content, sender_id, created_at FROM messages WHERE thread_id = $1 ORDER BY created_at ASC', [id]);
    
    if (messages.rows.length === 0) {
      return res.json({ score: '🧊 COLD', confidence: 'high' });
    }
    
    let intent_score = "🌤️ WARM";
    if (ai) {
      try {
        const msgText = messages.rows.map((m:any) => m.content).join("\\n");
        const prompt = \`Analyze this conversation between a host and a prospective guest. 
Rate the guest's buying intent.
Respond with EXACTLY ONE of these strings: "🔥 HOT LEAD", "🌤️ WARM", "🧊 COLD", or "🏆 CONVERTED".

Conversation:
\${msgText.substring(0, 2000)}\`;
        
        const aiResult = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        
        const text = aiResult.text?.trim() || '';
        if (text.includes('HOT')) intent_score = "🔥 HOT LEAD";
        if (text.includes('COLD')) intent_score = "🧊 COLD";
        if (text.includes('CONVERTED')) intent_score = "🏆 CONVERTED";
      } catch (err) {
         console.error('[AI INTENT SCORING FALLBACK]', err);
      }
    }
    
    await pool.query('UPDATE threads SET lead_intent_score = $1 WHERE id = $2', [intent_score, id]);
    
    res.json({ success: true, intent_score });
  } catch(e) {
    res.status(500).json({ error: 'Failed to score lead' });
  }
});

`;

const target = `app.get('/api/admin/outreach-leads'`;
code = code.replace(target, gap12Route + target);

fs.writeFileSync('server.ts', code);
console.log('Gap 12 Added');
