/**
 * Disposable real-Redis test for the notification preference rate limiter Lua script.
 * Validates the atomic fixed-window counter with TTL expiration.
 * Runs in a credential-free environment; never contacts Upstash or production servers.
 * Requires local redis-server and redis-cli binaries.
 */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  NOTIFICATION_PREFERENCE_LIMITER_SCRIPT,
  RedisNotificationPreferenceCounter,
  type EvalPort,
} from '../../src/server/conversations/notificationPreferenceLimiter.js';

const execFileAsync = promisify(execFile);
const redisServer = 'redis-server';
const redisCli = 'redis-cli';

const directory = await mkdtemp(join(tmpdir(), 'encho-notif-pref-redis-'));
const socket = join(directory, 'redis.sock');
const server = spawn(
  redisServer,
  ['--port', '0', '--unixsocket', socket, '--unixsocketperm', '700', '--save', '', '--appendonly', 'no', '--dir', directory],
  { stdio: 'ignore', env: { PATH: process.env.PATH || '/usr/bin:/bin:/opt/homebrew/bin' } },
);

try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(redisCli, ['-s', socket, 'PING'], { timeout: 1000 });
      if (stdout.trim() === 'PONG') {
        ready = true;
        break;
      }
    } catch {
      // Socket not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready, 'Disposable Redis did not start');

  const port: EvalPort = {
    async eval<T>(script: string, keys: string[], args: (string | number)[]): Promise<T> {
      const { stdout } = await execFileAsync(
        redisCli,
        ['-s', socket, '--raw', 'EVAL', script, String(keys.length), ...keys, ...args.map(String)],
        { timeout: 3000, maxBuffer: 1024 * 1024 },
      );
      const lines = stdout.trim().split('\n').map(line => Number(line.trim()));
      return lines as T;
    },
  };

  const counterA = new RedisNotificationPreferenceCounter(port, 900, 20, 'encho:test:pref_limiter');
  const counterB = new RedisNotificationPreferenceCounter(port, 900, 20, 'encho:test:pref_limiter');

  const actor1 = 101;
  const actor2 = 102;

  // 1. Account 101: 20 mutations across instance A and B in fixed window
  for (let i = 1; i <= 20; i += 1) {
    const counter = i % 2 === 0 ? counterA : counterB;
    const result = await counter.checkAndIncrement(actor1);
    assert.equal(result.allowed, true, `Request ${i} for actor1 should be allowed`);
    assert.equal(result.count, i);
    assert.ok(result.remainingTtl > 0 && result.remainingTtl <= 900);
  }

  // 2. Request 21 for Account 101 is blocked
  const blocked = await counterA.checkAndIncrement(actor1);
  assert.equal(blocked.allowed, false, 'Request 21 for actor1 must be blocked');
  assert.equal(blocked.count, 21);
  assert.ok(blocked.remainingTtl > 0 && blocked.remainingTtl <= 900);

  // 3. Account 102 has independent quota
  const actor2First = await counterB.checkAndIncrement(actor2);
  assert.equal(actor2First.allowed, true, 'Actor 102 must have independent quota');
  assert.equal(actor2First.count, 1);

  // 4. Verify TTL on Redis key
  const ttlRaw = (await execFileAsync(redisCli, ['-s', socket, 'TTL', counterA.key(actor1)])).stdout.trim();
  const ttl = Number(ttlRaw);
  assert.ok(ttl > 0 && ttl <= 900, `Expected TTL between 0 and 900, got ${ttl}`);

  process.stdout.write('Disposable Redis notification preference limiter checks passed.\n');
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
  await rm(directory, { recursive: true, force: true });
}
