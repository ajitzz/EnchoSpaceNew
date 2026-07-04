const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Add imports
if (!code.includes("import { logger }")) {
  code = code.replace(
    "import helmet from 'helmet';",
    "import helmet from 'helmet';\nimport pinoHttp from 'pino-http';\nimport { logger } from './src/lib/logger/index.js';\nimport { globalErrorHandler } from './src/lib/middleware/errorHandler.js';"
  );
}

// Replace morgan with pino-http
if (code.includes("app.use(morgan('combined', {")) {
  code = code.replace(
    /app\.use\(morgan\('combined', \{[\s\S]*?\}\)\);/g,
    "app.use(pinoHttp({ logger }));"
  );
}

// Replace global error handler
if (code.includes("app.use((err: Error, req: Request, res: Response, next: NextFunction) => {")) {
  code = code.replace(
    /app\.use\(\(err: Error, req: Request, res: Response, next: NextFunction\) => \{[\s\S]*?\}\);/g,
    "app.use(globalErrorHandler);"
  );
}

fs.writeFileSync('server.ts', code);
