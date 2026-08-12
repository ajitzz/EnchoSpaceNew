import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const tableStr = `
    CREATE TABLE IF NOT EXISTS lead_inquiries (
      id SERIAL PRIMARY KEY,
      campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      lead_name VARCHAR(255),
      lead_source VARCHAR(50), 
      lead_intent_score VARCHAR(20) DEFAULT 'COLD',
      masked_contact_info TEXT, 
      raw_inquiry TEXT,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`;

const anchor = "CREATE TABLE IF NOT EXISTS host_marketing_campaigns";
const pos = code.indexOf(anchor);
if (pos !== -1) {
  // Find the end of host_marketing_campaigns create statement
  const endPos = code.indexOf(');', pos) + 2;
  code = code.slice(0, endPos) + "\\n  `);\\n  await pool.query(`" + tableStr + code.slice(endPos);
  fs.writeFileSync('server.ts', code);
  console.log("Patched successfully");
} else {
  console.log("Anchor not found");
}
