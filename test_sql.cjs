const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const fs = require('fs');

async function test() {
  const code = fs.readFileSync('server.ts', 'utf8');
  const match = code.match(/try \{\s*await pool\.query\(`([\s\S]*?)`\);/);
  if (match) {
    console.log("Found query, running...");
    try {
      await pool.query(match[1]);
      console.log("Success");
    } catch (e) {
      console.error(e.message);
      console.error("Position:", e.position);
      console.error(match[1].substring(parseInt(e.position)-20, parseInt(e.position)+20));
    }
  }
  process.exit();
}
test();
