const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const t = `    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id SERIAL PRIMARY KEY,
      wallet_id INT REFERENCES host_wallets(id) ON DELETE CASCADE,
      amount DECIMAL NOT NULL,
      type VARCHAR(50) NOT NULL,
      reference_id VARCHAR(255),
      status VARCHAR(50) DEFAULT 'completed',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`;

const r = `    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id SERIAL PRIMARY KEY,
      wallet_id INT REFERENCES host_wallets(id) ON DELETE CASCADE,
      amount DECIMAL NOT NULL,
      type VARCHAR(50) NOT NULL,
      reference_id VARCHAR(255) UNIQUE,
      status VARCHAR(50) DEFAULT 'completed',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  \`);
  await pool.query(\`ALTER TABLE wallet_transactions ADD CONSTRAINT unique_reference_id UNIQUE (reference_id) EXCLUDE USING btree (reference_id WITH =) WHERE (reference_id IS NOT NULL)\`).catch(()=>true); // ignore if exists`;

code = code.replace(t, r);
fs.writeFileSync('server.ts', code);
console.log('Fixed schema init in server.ts');
