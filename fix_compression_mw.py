import re

with open('server.ts', 'r') as f:
    content = f.read()

replacement = """app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  threshold: 1024 // Only compress payload > 1KB
}));

// Milestone 4.4: Chaos Engineering (Latency / Fault Injection)
app.use((req, res, next) => {
  if (process.env.CHAOS_ENGINEERING_ENABLED !== 'true') return next();
  
  // Only inject faults into non-critical read APIs (don't break payments/auth)
  if (req.method !== 'GET' || req.path.includes('/api/auth') || req.path.includes('/api/payments')) {
     return next();
  }

  const rand = Math.random();
  if (rand < 0.05) {
     // 5% chance of network partition/500 error
     console.error(`[CHAOS MONKEY] Injecting 500 Error for ${req.path}`);
     return res.status(500).json({ error: 'Chaos Engineering: Simulated Backend Failure' });
  } else if (rand < 0.15) {
     // 10% chance of random delay (500ms - 3000ms)
     const delay = Math.floor(Math.random() * 2500) + 500;
     console.warn(`[CHAOS MONKEY] Injecting ${delay}ms delay for ${req.path}`);
     return setTimeout(next, delay);
  }
  next();
});

// Cache Control Middleware for public APIs (Milestone 4.3)
const cacheControl = (maxAgeSeconds: number) => {
  return (req: any, res: any, next: any) => {
    if (req.method === 'GET') {
      res.set('Cache-Control', `public, max-age=${maxAgeSeconds}`);
    }
    next();
  };
};

app.use(express.json({ limit: '20mb' }));"""

content = content.replace("app.use(express.json({ limit: '20mb' }));", replacement)

with open('server.ts', 'w') as f:
    f.write(content)
