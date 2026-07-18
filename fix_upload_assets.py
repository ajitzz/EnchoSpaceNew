import re

with open('server.ts', 'r') as f:
    content = f.read()

import_statement = "import { processMarketingAssets } from './src/lib/imageProcessor.js';\n"
if "processMarketingAssets" not in content:
    content = content.replace("import hpp from 'hpp';", "import hpp from 'hpp';\n" + import_statement)

# Now let's find the campaign endpoints
campaign_endpoints_pattern = r"(app\.post\('/api/marketing/campaigns'.*?)\n\s*// --"
# Actually we can just add a new endpoint for asset upload for campaigns
upload_endpoint = """
// Milestone 4.7: Dynamic Asset Pipeline (Upload and Format for Reels/Feed)
import multer from 'multer';
const upload = multer({ 
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for video/reels
  storage: multer.memoryStorage()
});

app.post('/api/marketing/assets/upload', authenticateToken, upload.single('media'), async (req: AuthRequest, res) => {
  if (!req.file) {
      return res.status(400).json({ error: 'No media file provided.' });
  }
  
  try {
      const processed = await processMarketingAssets(req.file.buffer, req.file.mimetype);
      if (!processed) {
          return res.status(500).json({ error: 'Asset processing failed.' });
      }
      return res.json({ status: 'success', urls: processed });
  } catch (err: any) {
      console.error('[ASSET UPLOAD] Error:', err);
      return res.status(500).json({ error: 'Internal server error during asset upload.' });
  }
});
"""

# add the upload endpoint somewhere before the AI Gatekeeper
content = content.replace("app.post('/api/marketing/campaigns/:id/ai-check'", upload_endpoint + "\napp.post('/api/marketing/campaigns/:id/ai-check'")

with open('server.ts', 'w') as f:
    f.write(content)
