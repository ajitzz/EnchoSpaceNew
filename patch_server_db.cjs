const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const updateCopilot = `
    if (req.body.ai_copilot_data) {
      await pool.query('UPDATE host_marketing_campaigns SET ai_copilot_data = $1 WHERE id = $2', [JSON.stringify(req.body.ai_copilot_data), campaignId]);
    }
`;

// In POST /api/marketing/campaigns, it returns the inserted row. 
// "const newCampaign = await pool.query("
// Let's look for the return statement `res.status(201).json(` or `res.json(result.rows[0])`
code = code.replace(
  "res.status(201).json([newCampaign.rows[0]]);",
  "const campaignId = newCampaign.rows[0].id;\n" + updateCopilot + "\nres.status(201).json([newCampaign.rows[0]]);"
);

// In PUT /api/marketing/campaigns/:id
code = code.replace(
  "res.json(updatedCampaign.rows[0]);",
  "const campaignId = req.params.id;\n" + updateCopilot + "\nres.json(updatedCampaign.rows[0]);"
);

fs.writeFileSync('server.ts', code);
console.log("Patched server.ts with DB update.");
