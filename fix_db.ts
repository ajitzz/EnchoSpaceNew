import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  await pool.query(`
    UPDATE host_marketing_campaigns 
    SET meta_campaign_id = '120249837681030673',
        meta_adset_id = '120249837681220673'
    WHERE id = 7107
  `);
  pool.end();
}
run();
