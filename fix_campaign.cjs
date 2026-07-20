const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace("listing_id: z.number().int().positive(),", "listing_id: z.coerce.number().int().positive(),");
code = code.replace("budget: z.number().min(5),", "budget: z.coerce.number().min(5),");
code = code.replace("req.ip || req.socket.remoteAddress", "req.ip || req.socket?.remoteAddress || null");
fs.writeFileSync('server.ts', code);
