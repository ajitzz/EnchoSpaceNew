import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = [
  { name: 'checkout', prefix: 'encho-stay-test.', port: 55439, user: 'encho_test', database: 'postgres', variable: 'ENCHO_STAY_TEST_SOCKET', test: 'src/test/platform-stay-postgres.test.ts', migrations: ['20260909_stay_checkout.sql', '20260911_stay_payment_observations.sql'] },
  { name: 'inventory', prefix: 'encho-inventory-test.', port: 55440, user: 'encho_inventory_test', database: 'inventory_fixture', variable: 'ENCHO_INVENTORY_TEST_SOCKET', test: 'src/test/platform-external-inventory-postgres.test.ts', migrations: ['20260911_external_inventory_evidence.sql', '20260911_external_inventory_lifecycle.sql', '20260911_inventory_connection_registry.sql', '20260911_inventory_grant_idempotency.sql'] },
];
const mode = process.argv[2] ?? '--plan';
if (process.argv.length > 3 || !['--plan', '--run'].includes(mode)) throw new Error('Use --plan or --run only. Custom database targets are not accepted.');
if (mode === '--plan') {
  console.log(JSON.stringify({ scope: 'Local macOS synthetic PostgreSQL acceptance only; not staging or production certification', fixtures: fixtures.map(({ name, test, port }) => ({ name, test, port, tcp: false })), retainsFixtures: true, loadsDotenv: false }, null, 2));
} else {
  if (process.platform !== 'darwin' || await realpath('/private/tmp') !== '/private/tmp') throw new Error('This runner supports the existing macOS private Unix-socket fixture contract only.');
  // Deliberate allowlist: no DATABASE_URL, provider keys, PG service settings,
  // NODE_OPTIONS preload or caller-supplied fixture sockets can reach children.
  const environment = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TZ'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const abort = new AbortController();
  const interrupted = () => abort.abort();
  process.on('SIGINT', interrupted); process.on('SIGTERM', interrupted);
  function command(binary, args, env = environment, interruptible = true) {
    return new Promise((done, fail) => {
      const child = spawn(binary, args, { cwd: root, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, ...(interruptible ? { signal: abort.signal } : {}) });
      let output = '';
      const collect = chunk => { output += chunk.toString(); if (output.length > 2_000_000) { child.kill(); fail(new Error('Acceptance command output exceeded its limit.')); } };
      child.stdout.on('data', collect); child.stderr.on('data', collect);
      child.on('error', error => fail(new Error(`Acceptance command could not run: ${binary} (${error.name})`)));
      child.on('close', code => code === 0 ? done(output) : fail(Object.assign(new Error(`Acceptance command failed: ${binary}, exit ${code}`), { output })));
    });
  }
  try {
    const pgVersion = await command('pg_ctl', ['--version']);
    if (!/PostgreSQL\) 18\./.test(pgVersion)) throw new Error('PostgreSQL 18 is required for the currently accepted fixture baseline.');
    for (const fixture of fixtures) {
      if (abort.signal.aborted) throw new Error('Acceptance interrupted.');
      const directory = await mkdtemp(`/private/tmp/${fixture.prefix}`);
      const data = join(directory, 'data');
      const receipt = { fixture: fixture.name, startedAt: new Date().toISOString(), scope: 'synthetic_local_only', node: process.version, postgres: pgVersion.trim(), directory, test: fixture.test, status: 'in_progress', stopped: false, fingerprints: {} };
      let startAttempted = false;
      let failure;
      try {
        const sources = [fixture.test, 'vitest.platform.config.ts', 'package-lock.json', ...fixture.migrations.map(file => `docs/migrations/${file}`)];
        for (const file of sources) receipt.fingerprints[file] = createHash('sha256').update(await readFile(join(root, file))).digest('hex');
        receipt.head = (await command('git', ['rev-parse', 'HEAD'])).trim();
        receipt.trackedDiffSha256 = createHash('sha256').update(await command('git', ['diff', 'HEAD', '--', '.'])).digest('hex');
        const untracked = (await command('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', 'lib', 'src/server', 'components', 'src/test', 'scripts', 'docs/migrations'])).split('\0').filter(Boolean).sort();
        for (const file of untracked) receipt.fingerprints[file] = createHash('sha256').update(await readFile(join(root, file))).digest('hex');
        await command('initdb', ['-D', data, '-U', fixture.user, '-A', 'trust', '--no-locale', '--encoding=UTF8']);
        startAttempted = true;
        await command('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -p ${fixture.port} -c listen_addresses=''`, '-w', 'start']);
        if (fixture.database !== 'postgres') await command('createdb', ['-h', directory, '-p', String(fixture.port), '-U', fixture.user, fixture.database]);
        const reportPath = join(directory, 'tests.json');
        const output = await command(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.platform.config.ts', '--reporter=json', `--outputFile=${reportPath}`, fixture.test], { ...environment, [fixture.variable]: directory });
        await writeFile(join(directory, 'tests.log'), output, { mode: 0o600 });
        const report = JSON.parse(await readFile(reportPath, 'utf8'));
        if (report.success !== true || !Number.isInteger(report.numTotalTests) || report.numTotalTests < 1 || report.numPassedTests !== report.numTotalTests || report.numFailedTests !== 0 || report.numPendingTests !== 0 || report.numTodoTests !== 0) throw new Error('Fixture did not report a fully executed passing test set.');
        receipt.testsPassed = report.numPassedTests;
        receipt.status = 'verified_locally'; console.log(`${fixture.name}: ${report.numPassedTests} PostgreSQL tests passed.`);
      } catch (error) {
        receipt.status = 'failed'; receipt.error = error.message; failure = error;
        if (error.output) await writeFile(join(directory, 'failure.log'), error.output, { mode: 0o600 });
      } finally {
        if (startAttempted) {
          try { await command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], environment, false); receipt.stopped = true; }
          catch { receipt.status = 'cleanup_required'; receipt.error = 'Could not verify private cluster shutdown; inspect its exact data directory.'; failure = new Error(receipt.error); }
        } else receipt.stopped = true;
        receipt.finishedAt = new Date().toISOString();
        await writeFile(join(directory, 'acceptance.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
        console.log(`Maha ${fixture.name}: ${receipt.status}; stopped=${receipt.stopped}; retained evidence: ${join(directory, 'acceptance.json')}`);
      }
      if (failure) throw failure;
    }
  } finally { process.off('SIGINT', interrupted); process.off('SIGTERM', interrupted); }
}
