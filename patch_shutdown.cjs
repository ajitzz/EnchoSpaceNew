const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const shutdownCode = `
// Graceful Shutdown Handlers
const shutdown = async (signal: string) => {
  console.log(\`\\n\${signal} received. Shutting down gracefully...\`);
  if (pool) {
    try {
      await pool.end();
      console.log('Database pool closed.');
    } catch (err) {
      console.error('Error closing DB pool', err);
    }
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
`;

if (!content.includes('Graceful Shutdown Handlers')) {
  content = content + '\\n' + shutdownCode;
  fs.writeFileSync('server.ts', content);
}
