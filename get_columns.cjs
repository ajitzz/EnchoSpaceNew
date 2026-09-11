const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'listings\'', (err, res) => {
  if (err) console.error(err);
  else console.log(res.rows);
  pool.end();
});
