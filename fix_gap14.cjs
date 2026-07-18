const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target14 = `    await pool.query(\`
      UPDATE host_marketing_campaigns
      SET status = 'rejected', admin_feedback = $1, rejected_fields = $2
      WHERE id = $3
    \`, [feedback || 'Ad does not meet media guidelines.', JSON.stringify(rejected_fields || {}), id]);

    broadcastDbEvent(req, 'marketing');`;

const replacement14 = `    await pool.query(\`
      UPDATE host_marketing_campaigns
      SET status = 'rejected', admin_feedback = $1, rejected_fields = $2
      WHERE id = $3
    \`, [feedback || 'Ad does not meet media guidelines.', JSON.stringify(rejected_fields || {}), id]);

    // Gap 14: Immutable Admin Audit Trail
    await pool.query(\`
      INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    \`, [req.user.id, 'marketing_campaign', id, 'reject_campaign', JSON.stringify(prevState), JSON.stringify({status: 'rejected', admin_feedback: feedback}), req.ip || req.socket.remoteAddress]);

    broadcastDbEvent(req, 'marketing');`;

if(code.includes(target14)) {
  code = code.replace(target14, replacement14);
  fs.writeFileSync('server.ts', code);
  console.log('Gap 14 added to reject.');
} else {
  console.log('Gap 14 target not found.');
}

