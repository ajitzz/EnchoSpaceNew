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
console.log("Q36:", queries[36]);
console.log("Q37:", queries[37]);
