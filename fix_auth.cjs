const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacements = [
  {
    search: "app.post('/api/upload-url', async (req, res) => {",
    replace: "app.post('/api/upload-url', authenticateToken, async (req, res) => {"
  },
  {
    search: "app.put('/api/listings/:id', async (req, res) => {",
    replace: "app.put('/api/listings/:id', authenticateToken, async (req: AuthRequest, res) => {"
  },
  {
    search: "app.put('/api/listings/:id/mode', async (req, res) => {",
    replace: "app.put('/api/listings/:id/mode', authenticateToken, async (req: AuthRequest, res) => {"
  },
  {
    search: "app.post('/api/listings', async (req, res) => {",
    replace: "app.post('/api/listings', authenticateToken, async (req: AuthRequest, res) => {"
  },
  {
    search: "app.put('/api/host/reservations/:id/status', async (req: AuthRequest, res) => {",
    replace: "app.put('/api/host/reservations/:id/status', authenticateToken, async (req: AuthRequest, res) => {"
  },
  {
    search: "app.post('/api/messages', async (req, res) => {",
    replace: "app.post('/api/messages', authenticateToken, async (req: AuthRequest, res) => {"
  },
  {
    search: "app.delete('/api/listings/:id', async (req, res) => {",
    replace: "app.delete('/api/listings/:id', authenticateToken, async (req: AuthRequest, res) => {"
  },
  {
    search: "app.put('/api/user/bookings/:id/cancel', async (req: AuthRequest, res) => {",
    replace: "app.put('/api/user/bookings/:id/cancel', authenticateToken, async (req: AuthRequest, res) => {"
  },
  {
    search: "app.post('/api/settings/whatsapp', async (req, res) => {",
    replace: "app.post('/api/settings/whatsapp', authenticateToken, async (req: AuthRequest, res) => {"
  },
  {
    search: "app.post('/api/settings/call', async (req, res) => {",
    replace: "app.post('/api/settings/call', authenticateToken, async (req: AuthRequest, res) => {"
  },
  {
    search: "app.post('/api/create-payment-intent', async (req, res) => {",
    replace: "app.post('/api/create-payment-intent', authenticateToken, async (req: AuthRequest, res) => {"
  }
];

replacements.forEach(r => {
  code = code.replace(r.search, r.replace);
});

fs.writeFileSync('server.ts', code);
console.log('Added missing authenticateToken');
