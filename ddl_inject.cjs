const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const anchor = "CREATE TABLE IF NOT EXISTS messages (";
const newTable = `    CREATE TABLE IF NOT EXISTS lead_inquiries (
      id SERIAL PRIMARY KEY,
      campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      lead_name VARCHAR(255),
      lead_source VARCHAR(50), -- e.g. 'META_LEAD_ADS', 'GOOGLE_ADS'
      lead_intent_score VARCHAR(20) DEFAULT 'COLD', -- 'HOT', 'WARM', 'COLD'
      masked_contact_info TEXT, -- Walled Garden CRM Requirement
      raw_inquiry TEXT,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  \`);
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS messages (`;

if (code.includes(anchor) && !code.includes("CREATE TABLE IF NOT EXISTS lead_inquiries")) {
    code = code.replace(anchor, newTable);
    fs.writeFileSync('server.ts', code);
    console.log("Lead inquiries table schema injected.");
} else {
    console.log("Anchor not found or table already exists.");
}
