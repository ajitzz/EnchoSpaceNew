require('dotenv').config({ override: true });
const pkg = require('pg');
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function verify() {
  try {
    await pool.query('CREATE TABLE test_jsonb2 (id serial, data jsonb)');
    
    try {
      await pool.query('INSERT INTO test_jsonb2 (data) VALUES ($1)', [['test1', 'test2']]);
      console.log('Successfully inserted JS array as JSONB');
    } catch (e) {
      console.error('Failed to insert JS array:', e.message);
    }
    
    try {
      await pool.query('INSERT INTO test_jsonb2 (data) VALUES ($1)', [JSON.stringify(['test1', 'test2'])]);
      console.log('Successfully inserted JSON string as JSONB');
    } catch (e) {
      console.error('Failed to insert JSON string:', e.message);
    }

    let res = await pool.query('SELECT data, jsonb_typeof(data) as type FROM test_jsonb2');
    console.log('Rows:', res.rows);
    
    await pool.query('DROP TABLE test_jsonb2');
  } finally {
    await pool.end();
  }
}
verify().catch(console.error);
