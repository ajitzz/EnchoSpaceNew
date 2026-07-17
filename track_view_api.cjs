const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `// ==========================================
// Gap 11: Database Death by Analytics (Time-Series Rollups)
// ==========================================`;

const replacement = `// ==========================================
// Gap 15: Cross-Platform Retargeting (The Sticky Web)
// ==========================================
app.post('/api/marketing/track/view', async (req, res) => {
  try {
    const { listingId } = req.body;
    if (listingId) {
      // Simulate tracking a ViewContent event via server-side pixel for GDN Retargeting
      dispatchConversionsAPI({ id: 'page_view' }, Number(listingId), 'ViewContent');
      console.log(\`[STICKY WEB] Fired 'ViewContent' CAPI pixel for Listing #\${listingId} to enable Google Display Network retargeting.\`);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to track view' });
  }
});

// ==========================================
// Gap 11: Database Death by Analytics (Time-Series Rollups)
// ==========================================`;

code = code.replace(target, replacement);

fs.writeFileSync('server.ts', code);
console.log('Track view API added');
