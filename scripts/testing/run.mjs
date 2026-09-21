import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {delimiter,dirname} from 'node:path';

if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Tests require Node 24, matching package.json and CI. No tests were started.');
  process.exit(1);
}

// An allowlist, not a blacklist: new provider secrets must not silently enter tests.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'CI', 'TERM', 'NO_COLOR', 'HARVO_POSTGRES_BIN']
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
Object.assign(env, {
  PATH: `${dirname(process.execPath)}${delimiter}${env.PATH || ''}`,
  NODE_ENV: 'test', ENCHO_TEST_SANDBOX: '1', TZ: 'UTC',
  // Legacy suites mock pg. This URL never names a real server/database.
  TEST_DATABASE_URL: 'postgresql://test:test@encho-test.invalid/encho_test',
  JWT_SECRET: 'encho-isolated-test-signing-key-not-a-production-secret',
});
const root = fileURLToPath(new URL('../../', import.meta.url));
const child = spawn(process.execPath, [fileURLToPath(new URL('../../node_modules/vitest/vitest.mjs', import.meta.url)), 'run', ...process.argv.slice(2)], {
  cwd: root, env, stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => {console.error('Could not start the isolated test process.'); process.exitCode = 1;});
child.on('exit', (code, signal) => {process.exitCode = signal ? 1 : (code ?? 1);});
