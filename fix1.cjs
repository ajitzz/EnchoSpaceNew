const fs = require('fs');
let code = fs.readFileSync('server.bak.ts', 'utf8');

// Fix 1: broadcastDbEvent
code = code.replace(
`  if (!targetUserIds || targetUserIds.length === 0) {
  } else {
      targetUserIds.forEach(id => {
  }
}`,
`  if (!targetUserIds || targetUserIds.length === 0) {
      io.emit('db_changed', { type });
  } else {
      targetUserIds.forEach(id => {
          if (id) io.to(\`user_\${id}\`).emit('db_changed', { type });
      });
      io.to('admin_room').emit('db_changed', { type });
  }
}`
);

// Fix 2: Pool constructor and catch block
code = code.replace(
`  ssl: isDbConfigured ? { rejectUnauthorized: false } : undefined
let dbConnectionError: string | null = null;
if (isDbConfigured) {
  pool.query('SELECT 1').catch((err: any) => {
    dbConnectionError = (err as Error).message || String(err);
    console.error("CRITICAL DB STARTUP ERROR:", dbConnectionError);
}`,
`  ssl: isDbConfigured ? { rejectUnauthorized: false } : undefined
});
let dbConnectionError: string | null = null;
if (isDbConfigured) {
  pool.query('SELECT 1').catch((err: any) => {
    dbConnectionError = (err as Error).message || String(err);
    console.error("CRITICAL DB STARTUP ERROR:", dbConnectionError);
  });
}`
);

fs.writeFileSync('server.ts', code);
