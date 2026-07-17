const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      google_id VARCHAR(255) UNIQUE,
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`;

const replacement1 = `    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      google_id VARCHAR(255) UNIQUE,
      role VARCHAR(50) DEFAULT 'user',
      wallet_balance DECIMAL(10, 2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`;

code = code.replace(target1, replacement1);

const target2 = `        ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
      END IF;`;

const replacement2 = `        ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='wallet_balance') THEN
        ALTER TABLE users ADD COLUMN wallet_balance DECIMAL(10, 2) DEFAULT 0;
      END IF;`;

code = code.replace(target2, replacement2);

const target3 = `        ALTER TABLE users ADD COLUMN phone VARCHAR(50);
      END IF;
    END $$;
  \`);`;

const replacement3 = `        ALTER TABLE users ADD COLUMN phone VARCHAR(50);
      END IF;
    END $$;
  \`);

  await pool.query(\`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      amount DECIMAL(10, 2) NOT NULL,
      type VARCHAR(50) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  \`);`;

code = code.replace(target3, replacement3);

fs.writeFileSync('server.ts', code);
console.log('Wallet schema added');
