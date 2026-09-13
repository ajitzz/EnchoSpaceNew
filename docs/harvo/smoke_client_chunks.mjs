import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { init, parse } from 'es-module-lexer';

const after = JSON.parse(readFileSync('docs/harvo/artifacts/client-chunks/after-build.json', 'utf8'));
const root = resolve(after.directory, 'client');
const beforeRoot = '/tmp/harvo-release-build-AK9K6P/client';
await init;
function measure(directory) {
  const html = readFileSync(join(directory, 'index.html'), 'utf8');
  const entry = [...html.matchAll(/<script[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)].map(match => match[1].replace(/^\//, ''));
  const visited = new Set(); let bytes = 0, gzipBytes = 0;
  function visit(file) { if (visited.has(file)) return; visited.add(file); const content = readFileSync(join(directory, file)); bytes += content.length; gzipBytes += gzipSync(content).length;
    for (const imported of parse(content.toString('utf8'))[0]) if (imported.d === -1 && imported.n?.startsWith('.')) { const target = resolve(directory, file, '..', imported.n); visit(target.slice(directory.length + 1)); }
  }
  entry.forEach(visit); return { files: [...visited], bytes, gzipBytes };
}
const requestCounts = { local: 0, externalBlocked: 0 };
const blockedOrigins = new Set();
const server = createServer((req, res) => {
  requestCounts.local++;
  if (req.url === '/smoke') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><title>HARVO production module check</title></head><body><div id="root"></div></body></html>'); return; }
  if (req.url?.startsWith('/api/')) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"ISOLATED_IMPORT_SMOKE_NO_BACKEND"}'); return; }
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + '/') || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const base = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ headless: true });
const imported = [], failures = [], pageErrors = [];
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => { if (route.request().url().startsWith(base + '/')) return route.continue(); requestCounts.externalBlocked++; blockedOrigins.add(new URL(route.request().url()).origin); return route.abort(); });
  const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(base + '/smoke');
  for (const chunk of [...after.chunks].sort((a, b) => Number(b.file.includes('vendor-react')) - Number(a.file.includes('vendor-react')))) {
    const error = await page.evaluate(async file => { try { await import('/' + file); return null; } catch (error) { return error?.message || String(error); } }, chunk.file);
    if (error) failures.push({ file: chunk.file, error }); else imported.push(chunk.file);
  }
  const before = measure(beforeRoot), current = measure(root);
  const expectedUnavailableIntegrations = pageErrors.filter(error => error === 'Failed to load Stripe.js' && blockedOrigins.has('https://js.stripe.com'));
  const unexpectedPageErrors = pageErrors.filter(error => !expectedUnavailableIntegrations.includes(error));
  const result = { node: process.version, directory: after.directory, noLiveBackend: true, requests: requestCounts, blockedExternalOrigins: [...blockedOrigins], imported, failures, pageErrors, expectedUnavailableIntegrations, unexpectedPageErrors, beforeInitialStaticJs: before, afterInitialStaticJs: current, staticChunkCycles: after.cycles };
  writeFileSync('docs/harvo/artifacts/client-chunks/import-smoke.json', JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
  if (failures.length || unexpectedPageErrors.length || after.cycles.length) throw new Error('HARVO_PRODUCTION_MODULE_IMPORT_FAILED');
} finally { await browser.close(); await new Promise(resolveClose => server.close(resolveClose)); }
