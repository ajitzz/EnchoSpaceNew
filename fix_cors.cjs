const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const origCors = `app.use(cors());`;

const newCors = `// Hardened CORS policy
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'https://localhost:3000'];
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));`;

code = code.replace(origCors, newCors);
fs.writeFileSync('server.ts', code);
console.log('CORS updated');
