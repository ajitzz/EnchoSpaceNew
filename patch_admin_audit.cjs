const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Patch approve
code = code.replace(
  "    // 1. Mark as approved by admin",
  `    // Fetch previous state for audit log
    const prevCheck = await pool.query('SELECT status, admin_approved FROM host_marketing_campaigns WHERE id = $1', [id]);
    const prevState = prevCheck.rows[0];

    // 1. Mark as approved by admin`
);

code = code.replace(
  "    console.log(`[ADMIN APPROVAL] Admin approved Campaign #${id}. Querying current payment status...`);",
  `    console.log(\`[ADMIN APPROVAL] Admin approved Campaign #\${id}. Querying current payment status...\`);
    
    // Log Audit Trail
    await pool.query(\`
      INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    \`, [req.user.id, 'marketing_campaign', id, 'approve_campaign', JSON.stringify(prevState), JSON.stringify({status: 'pending/active', admin_approved: true}), req.ip || req.socket.remoteAddress]);`
);

// Patch reject
code = code.replace(
  "    const { feedback, rejected_fields } = req.body;",
  `    const { feedback, rejected_fields } = req.body;

    const prevCheck = await pool.query('SELECT status, admin_approved FROM host_marketing_campaigns WHERE id = $1', [id]);
    const prevState = prevCheck.rows[0];`
);

code = code.replace(
  "    broadcastDbEvent(req, 'marketing');",
  `    // Log Audit Trail
    await pool.query(\`
      INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    \`, [req.user.id, 'marketing_campaign', id, 'reject_campaign', JSON.stringify(prevState), JSON.stringify({status: 'rejected', admin_feedback: feedback}), req.ip || req.socket.remoteAddress]);

    broadcastDbEvent(req, 'marketing');`
);

fs.writeFileSync('server.ts', code);
console.log('Patched Admin Audit logs');
