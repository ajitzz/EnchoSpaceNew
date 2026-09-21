-- Disposable benchmark prerequisites only. This is not a production schema.
-- Canonical room/media/inventory contracts come from complete migrations 003–007.
CREATE TABLE users (id INT PRIMARY KEY);
CREATE TABLE listings (
  id INT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
  slug TEXT, publication_status TEXT NOT NULL
);
CREATE TABLE room_calendar_blocks (
  id SERIAL PRIMARY KEY,
  listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
  room_tier_key VARCHAR(100) NOT NULL,
  room_name VARCHAR(255),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  block_source VARCHAR(50) DEFAULT 'manual',
  guest_name VARCHAR(255),
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
