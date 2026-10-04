/** Mandatory, isolated W2 built-artifact gate. No inherited database/provider secrets. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('W2 built verification requires Node 24.');
  process.exit(1);
}

const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT',
  'CI', 'TERM', 'NO_COLOR', 'HARVO_POSTGRES_BIN']
  .filter(key => process.env[key] !== undefined)
  .map(key => [key, process.env[key]]));
Object.assign(env, { NODE_ENV: 'test', ENCHO_TEST_SANDBOX: '1', TZ: 'UTC' });

const checks = [
  'scripts/testing/w2-hold-without-quote.mjs',
  'scripts/testing/w2-quote-hold.mjs',
];
const results = [];
for (const script of checks) {
  const exitCode = await new Promise(resolve => {
    const child = spawn(process.execPath, ['--import', 'tsx', script], { env, stdio: 'inherit' });
    child.once('error', () => resolve(1));
    child.once('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
  results.push({ script, exitCode });
  if (exitCode !== 0) break;
}
await mkdir('test-results', { recursive: true });
await writeFile('test-results/w2-built-summary.json', `${JSON.stringify({
  evidenceLayer: 'local-disposable-postgres-built-artifact',
  checks: results,
}, null, 2)}\n`);
if (results.length !== checks.length || results.some(result => result.exitCode !== 0)) process.exitCode = 1;
