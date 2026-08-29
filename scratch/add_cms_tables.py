import re

with open('server.ts', 'r') as f:
    content = f.read()

new_tables = """
    CREATE TABLE IF NOT EXISTS room_types (
      id SERIAL PRIMARY KEY,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      base_price DECIMAL NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      max_occupancy INT DEFAULT 2,
      inventory_count INT DEFAULT 1,
      features JSONB DEFAULT '[]'::jsonb,
      amenities JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INT NOT NULL,
      url TEXT NOT NULL,
      category VARCHAR(50) NOT NULL,
      title VARCHAR(255),
      description TEXT,
      specs VARCHAR(255),
      lighting_time VARCHAR(255),
      is_hero BOOLEAN DEFAULT false,
      order_index INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS listings_drafts (
      id SERIAL PRIMARY KEY,
      host_id INT REFERENCES users(id),
      published_listing_id INT REFERENCES listings(id) ON DELETE SET NULL,
      status VARCHAR(50) DEFAULT 'DRAFT',
      draft_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
"""

# Find the end of the CREATE TABLE listings statement inside ensureListingsTable
pattern = r'(CREATE TABLE IF NOT EXISTS listings \([\s\S]*?\);\n\s+`)'
match = re.search(pattern, content)
if match:
    # Insert new tables right after listings table creation
    new_content = content[:match.end()] + new_tables + content[match.end():]
    with open('server.ts', 'w') as f:
        f.write(new_content)
    print("Successfully added new tables to server.ts")
else:
    print("Could not find insertion point")
