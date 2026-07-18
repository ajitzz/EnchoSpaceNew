const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const indexQueries = `
  // Milestone 4.5: Database Query Optimization (Indexes)
  await pool.query(\`CREATE INDEX IF NOT EXISTS idx_async_webhook_status ON async_webhook_queue(status);\`);
  await pool.query(\`CREATE INDEX IF NOT EXISTS idx_webhook_dlq_retry ON webhook_dlq(retry_count, next_retry_at);\`);
  await pool.query(\`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);\`);
  await pool.query(\`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions(status);\`);
  await pool.query(\`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON admin_audit_logs(entity_type, entity_id);\`);
  await pool.query(\`CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);\`);
  await pool.query(\`CREATE INDEX IF NOT EXISTS idx_bookings_listing_id ON bookings(listing_id);\`);
`;

const insertPoint = `await pool.query(\`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON host_marketing_campaigns(status);\`);`;

if (code.includes(insertPoint)) {
  code = code.replace(insertPoint, insertPoint + "\\n" + indexQueries);
  fs.writeFileSync('server.ts', code);
  console.log('Indexes added');
} else {
  console.log('Insert point not found');
}
