const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const learningEngineCode = `
    // ----------------- LEARNING ENGINE -----------------
    // Fetch recent Meta API rejections to learn from them
    const recentRejections = await pool.query(
      "SELECT step, request_payload, response_payload FROM meta_api_traces WHERE http_status >= 400 ORDER BY created_at DESC LIMIT 5"
    );
    const rejectionContext = recentRejections.rows.length > 0 
      ? "\\nRecent Meta API Rejections (Learn from these and prevent them):\\n" + JSON.stringify(recentRejections.rows, null, 2)
      : "";
`;

// Inject into the copilot endpoint
code = code.replace(
  "const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });",
  "const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });\n" + learningEngineCode
);

code = code.replace(
  "Draft Data:",
  "${rejectionContext}\n\nDraft Data:"
);

fs.writeFileSync('server.ts', code);
console.log("Patched server.ts with Learning Engine context.");
