const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const origSocketCors = `  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });`;

const newSocketCors = `  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: function(origin, callback) {
        const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'https://localhost:3000'];
        if (!origin || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ["GET", "POST"],
      credentials: true
    }
  });`;

code = code.replace(origSocketCors, newSocketCors);
fs.writeFileSync('server.ts', code);
console.log('Socket CORS updated');
