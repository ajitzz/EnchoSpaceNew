const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const imports = `import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';`;

content = content.replace(/import cors from 'cors';/, imports);

const middlewares = `app.use(cors());

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabling CSP for development/vite compatibility
  crossOriginEmbedderPolicy: false
}));

// HTTP Request Logging
app.use(morgan('combined', {
  skip: (req) => req.path === '/api/health' || req.path.startsWith('/assets/')
}));

// Global Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
// Apply rate limiter to all API routes
app.use('/api/', apiLimiter);

`;

content = content.replace(/app\.use\(cors\(\)\);/, middlewares);

// Global Error Handler
const errorHandler = `
// Global Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message });
});
`;

// Insert just before startServer()
content = content.replace(/async function startServer\(\) \{/, errorHandler + '\nasync function startServer() {');

// Graceful Shutdown
const gracefulShutdown = `
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(\`Server running on http://0.0.0.0:\${PORT}\`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(\`\n\${signal} received. Shutting down gracefully...\`);
    server.close(async () => {
      console.log('HTTP server closed.');
      if (pool) {
        await pool.end();
        console.log('Database pool closed.');
      }
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
`;

content = content.replace(/app\.listen\(PORT,\s*'0\.0\.0\.0',\s*\(\)\s*=>\s*\{[\s\S]*?\}\);/g, gracefulShutdown);


fs.writeFileSync('server.ts', content);
