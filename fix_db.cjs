const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetLine = "CREATE TABLE IF NOT EXISTS wallet_transactions (";
if (code.includes(targetLine)) {
    code = code.replace(
        "reference_id VARCHAR(255),",
        "reference_id VARCHAR(255) UNIQUE,"
    );
    // Also inject an ALTER TABLE just in case it already exists but lacks the constraint
    const alterLine = "await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);`);";
    code = code.replace(alterLine, alterLine + "\n  await pool.query(`ALTER TABLE wallet_transactions ADD CONSTRAINT unique_reference_id UNIQUE (reference_id);`).catch(e => console.log('Constraint already exists or ignored'));");
    
    fs.writeFileSync('server.ts', code);
    console.log("wallet_transactions schema patched for strict idempotency");
} else {
    console.log("Could not find table schema");
}
