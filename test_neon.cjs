const { Pool } = require('pg');

const pool = new Pool({
  host: 'ep-small-smoke-a1vjxk25-pooler.ap-southeast-1.aws.neon.tech',
  user: 'neondb_owner',
  password: 'npg_4cbpQjKtym9n',
  database: 'neondb',
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('Error:', err.message);
  else console.log('Success:', res.rows[0]);
  pool.end();
});
