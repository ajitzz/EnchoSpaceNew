import pkg from 'pg';
import dotenv from 'dotenv';
import { metaGraphClient } from './src/lib/metaGraphClient.js';
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
    console.log("Checking Gate 14...");
    const readiness = await metaGraphClient.checkExternalMetaReadiness(pool, 'canary-verify', true);
    console.log(JSON.stringify(readiness, null, 2));
    await pool.end();
}
run();
