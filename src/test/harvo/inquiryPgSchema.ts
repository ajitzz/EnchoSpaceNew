import type pg from 'pg';
/** Minimum real PostgreSQL inbox contract, isolated from server startup and customer data. */
export async function installInquirySchema(pool:pg.Pool){
 await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Fixture participant';
 CREATE TABLE IF NOT EXISTS experiences(id INT PRIMARY KEY,host_id INT NOT NULL REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS threads(id SERIAL PRIMARY KEY,listing_id INT REFERENCES listings(id),experience_id INT REFERENCES experiences(id),guest_id INT NOT NULL REFERENCES users(id),host_id INT NOT NULL REFERENCES users(id),last_message TEXT,updated_at TIMESTAMPTZ DEFAULT now(),unread_count_guest INT DEFAULT 0,unread_count_host INT DEFAULT 0);
 CREATE TABLE IF NOT EXISTS messages(id SERIAL PRIMARY KEY,thread_id INT NOT NULL REFERENCES threads(id),sender_id INT NOT NULL REFERENCES users(id),receiver_id INT NOT NULL REFERENCES users(id),content TEXT NOT NULL,is_sanitized BOOLEAN NOT NULL DEFAULT false,is_read BOOLEAN NOT NULL DEFAULT false,created_at TIMESTAMPTZ DEFAULT now());`);
}
