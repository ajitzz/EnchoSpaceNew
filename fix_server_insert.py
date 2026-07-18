import re

with open('server.ts', 'r') as f:
    content = f.read()

pattern = re.compile(r"    const \{ property_name, instagram_username, facebook_url, owner_name, location, estimated_nightly_rate, status, notes, email, phone \} = req\.body;\n    const result = await pool\.query\(`\n      INSERT INTO host_outreach_leads \n       \(property_name, instagram_username, facebook_url, owner_name, location, estimated_nightly_rate, status, notes, email, phone, last_contacted_at\)\n      VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, CURRENT_TIMESTAMP\)\n      RETURNING \*\n    `, \[property_name, instagram_username \|\| '', facebook_url \|\| '', owner_name \|\| '', location \|\| '', estimated_nightly_rate \|\| 0, status \|\| 'discovered', notes \|\| '', email \|\| '', phone \|\| ''\]\);\n        \n    broadcastDbEvent\(req, 'outreach'\);\n    res\.json\(result\.rows\[0\]\);", re.MULTILINE)

replacement = """    const { property_name, instagram_username, facebook_url, owner_name, location, estimated_nightly_rate, status, notes, email, phone } = req.body;
    
    // Phase 4.1: Encrypt PII at rest
    const encryptedEmail = encryptPII(email || '');
    const encryptedPhone = encryptPII(phone || '');

    const result = await pool.query(`
      INSERT INTO host_outreach_leads 
       (property_name, instagram_username, facebook_url, owner_name, location, estimated_nightly_rate, status, notes, email, phone, last_contacted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      RETURNING *
    `, [property_name, instagram_username || '', facebook_url || '', owner_name || '', location || '', estimated_nightly_rate || 0, status || 'discovered', notes || '', encryptedEmail, encryptedPhone]);
        
    broadcastDbEvent(req, 'outreach');
    
    const savedRow = result.rows[0];
    savedRow.email = decryptPII(savedRow.email);
    savedRow.phone = decryptPII(savedRow.phone);
    res.json(savedRow);"""

content = content.replace("    const { property_name, instagram_username, facebook_url, owner_name, location, estimated_nightly_rate, status, notes, email, phone } = req.body;\n    const result = await pool.query(`\n      INSERT INTO host_outreach_leads \n       (property_name, instagram_username, facebook_url, owner_name, location, estimated_nightly_rate, status, notes, email, phone, last_contacted_at)\n      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)\n      RETURNING *\n    `, [property_name, instagram_username || '', facebook_url || '', owner_name || '', location || '', estimated_nightly_rate || 0, status || 'discovered', notes || '', email || '', phone || '']);\n        \n    broadcastDbEvent(req, 'outreach');\n    res.json(result.rows[0]);", replacement)

with open('server.ts', 'w') as f:
    f.write(content)
