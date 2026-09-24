import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const output = await mkdtemp(join(tmpdir(), 'encho-cr1-operations-'));
await build({ entryPoints: ['scripts/testing/cr1-operations-browser/entry.tsx'], outdir: output, bundle: true, format: 'esm', platform: 'browser', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"test"' }, logLevel: 'silent' });
await writeFile(join(output, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated CR1 operations verification</title><link rel="stylesheet" href="/entry.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/entry.js"></script></body></html>');
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const name = pathname === '/entry.js' ? 'entry.js' : pathname === '/entry.css' ? 'entry.css' : 'index.html';
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(join(output, name)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const scenarios = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
try {
  for (const width of [1440, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 980 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const record = name => scenarios.push({ viewport: width, name });
    const checkOverflow = async label => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: page overflow at ${width}px`);
    await page.goto(origin);
    await page.getByRole('heading', { name: 'My work', exact: true }).waitFor();
    assert(await page.getByRole('navigation', { name: 'Operations desks' }).getByRole('link').count() === 3, 'Unprojected desk appeared');
    await checkOverflow('ready');
    await page.screenshot({ path: join(output, `ready-${width}.png`), fullPage: true }); record('ready projection and viewport');
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.activeElement?.textContent === 'Skip to assigned work'), 'Skip link is not the first focus target');
    await page.keyboard.press('Enter');
    assert(await page.evaluate(() => document.activeElement?.tagName === 'MAIN'), 'Skip link did not focus main content'); record('keyboard skip and focus');
    await page.getByRole('link', { name: 'Creative & policy', exact: true }).click();
    await page.getByRole('heading', { name: 'Creative & policy', exact: true }).waitFor();
    assert(await page.getByRole('heading', { name: 'Review assigned guest inquiry' }).count() === 0, 'Unrelated desk assignment leaked into filtered view'); record('permitted desk navigation');
    await page.getByRole('button', { name: 'Claim work: Review exact campaign creative' }).click();
    await page.getByText('Claimed', { exact: true }).waitFor();
    const receipt = JSON.parse(await page.getByTestId('fixture-receipt').textContent());
    assert(receipt.request.expectedFence === '7' && receipt.request.expectedVersion === 3 && receipt.request.action === 'CLAIM' && receipt.refreshes === 1, 'Claim lost its canonical version/fence');
    await checkOverflow('claim'); record('fenced claim callback and refreshed result');
    await page.goto(`${origin}/?scenario=stale`);
    await page.getByText('Workspace evidence is stale').waitFor();
    assert(await page.getByRole('button', { name: 'Claim work: Review exact campaign creative' }).isDisabled(), 'Stale evidence permits claim');
    await checkOverflow('stale'); record('stale evidence denies action');
    await page.goto(`${origin}/?scenario=empty`);
    await page.getByRole('heading', { name: 'No assigned work in this view' }).waitFor();
    assert(await page.getByRole('button', { name: /Claim work:/ }).count() === 0, 'Empty state fabricated actions');
    await checkOverflow('empty'); await page.screenshot({ path: join(output, `empty-${width}.png`), fullPage: true }); record('truthful empty state');
    await page.goto(`${origin}/?scenario=denied`);
    await page.getByRole('heading', { name: 'This desk is outside your access' }).waitFor();
    assert(await page.getByRole('heading', { name: 'Review exact campaign creative' }).count() === 0, 'Denied view contains private work');
    await checkOverflow('denied'); await page.screenshot({ path: join(output, `denied-${width}.png`), fullPage: true }); record('denied state privacy');
    await page.goto(`${origin}/?scenario=expiry`);
    await page.getByRole('heading', { name: 'My work', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Your workforce session needs renewal' }).waitFor({ timeout: 7000 });
    assert(await page.getByRole('heading', { name: 'Review exact campaign creative' }).count() === 0, 'Expired session retains private work'); record('clock-driven session expiry');
    assert(errors.length === 0, errors.join('\n')); await page.close();
  }
  const receipt = { scenariosPassed: scenarios.length, viewports: [1440, 360], externalNetwork: 'blocked', source: 'isolated esbuild fixture; no server/env/database import', artifacts: output, scenarios };
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
