import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const serverTs = fs.readFileSync('server.ts', 'utf8');
const regex = /pool\.query\(\`([\s\S]*?)\`\)/g;
let match;
let queries = [];
while ((match = regex.exec(serverTs)) !== null) {
  if (match[1].includes('CREATE TABLE')) {
    queries.push(match[1]);
  }
}

async function run() {
  let failed = 0;
  for (let i=0; i<queries.length; i++) {
    try {
      await pool.query(queries[i]);
    } catch(e) {
      console.log(`Query ${i} failed:`, e.message);
      failed++;
    }
  }
  console.log(`Dry run complete. Failed: ${failed}`);
  pool.end();
}
run();
