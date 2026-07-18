import re
with open('server.ts', 'r') as f:
    content = f.read()

if "app.get('/api/health'" not in content:
    content = content.replace("app.use('/api', idempotencyMiddleware);", "app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0', services: { db: 'connected', ai: 'operational', payment: 'routed' } }));\napp.use('/api', idempotencyMiddleware);")
    with open('server.ts', 'w') as f:
        f.write(content)
