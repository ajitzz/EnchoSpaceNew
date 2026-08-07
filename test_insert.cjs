require('dotenv').config({ override: true });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(`
INSERT INTO meta_api_traces (
  correlation_id, campaign_id, host_id, step, endpoint, request_payload, response_payload, http_status, fbtrace_id, meta_error_code, meta_error_subcode, meta_error_message, meta_error_type, meta_error_is_transient, meta_error_user_title, meta_error_user_msg, latency_ms
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
`, ['corr', 1, 1, 'step', 'endpoint', '{}', '{}', 200, null, null, null, null, null, null, null, null, 100])
.then(() => { console.log('Insert success'); process.exit(0); })
.catch(e => { console.error('Insert failed', e); process.exit(1); });
