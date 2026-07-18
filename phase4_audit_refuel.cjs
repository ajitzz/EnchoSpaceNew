const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const orig = `    const { amount, gateway } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ error: 'Minimum refuel amount is $10' });`;

const repl = `    const parseResult = walletRefuelSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.errors });
    }
    const { amount, gateway } = parseResult.data;`;

code = code.replace(orig, repl);
fs.writeFileSync('server.ts', code);
console.log('Done refuel validation');
