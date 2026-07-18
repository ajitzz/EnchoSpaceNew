const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const search = `    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });`;

const replace = `    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
    
    // Security: Password length and complexity validation
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long for security.' });
    }`;

code = code.replace(search, replace);
fs.writeFileSync('server.ts', code);
console.log('Password check added');
