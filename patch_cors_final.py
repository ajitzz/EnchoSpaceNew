import re
with open('server.ts', 'r') as f:
    content = f.read()

target = """app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production' || (origin && origin.endsWith('.vercel.app'))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));"""

replacement = """app.use(cors({
  origin: function(origin, callback) {
    // Allow Vercel deployments, localhost, or dynamically specified allowed origins
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production' || (origin && origin.endsWith('.vercel.app'))) {
      callback(null, true);
    } else {
      // Instead of throwing an error which causes a 500, we simply disallow CORS.
      callback(null, false);
    }
  },
  credentials: true
}));"""

if target in content:
    content = content.replace(target, replacement)
    with open('server.ts', 'w') as f:
        f.write(content)
    print("Patched CORS final")
else:
    print("CORS target not found")
