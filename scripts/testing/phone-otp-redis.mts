/** Disposable real-Redis exercise for the shared phone OTP Lua contract.
 * Invoke under a credential-free environment; this script never contacts
 * Upstash, WhatsApp, Neon or the production server. Requires redis-server/cli. */
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { RedisPhoneOtpChallenge, type OtpEvalPort } from '../../src/server/auth/phoneOtpChallenge.js';

const execFileAsync = promisify(execFile);
const redisServer = 'redis-server';
const redisCli = 'redis-cli';
const directory = await mkdtemp(join(tmpdir(), 'encho-otp-redis-'));
const socket = join(directory, 'redis.sock');
const server = spawn(redisServer, ['--port', '0', '--unixsocket', socket, '--unixsocketperm', '700',
  '--save', '', '--appendonly', 'no', '--dir', directory], { stdio: 'ignore', env: { PATH: process.env.PATH || '/usr/bin:/bin' } });

try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(redisCli, ['-s', socket, 'PING'], { timeout: 1000 });
      if (stdout.trim() === 'PONG') { ready = true; break; }
    } catch { /* The local socket may not exist during startup. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready, 'Disposable Redis did not start');

  const port: OtpEvalPort = {
    async eval<T>(script: string, keys: string[], args: (string | number)[]): Promise<T> {
      const { stdout } = await execFileAsync(redisCli, ['-s', socket, '--raw', 'EVAL', script,
        String(keys.length), ...keys, ...args.map(String)], { timeout: 3000, maxBuffer: 1024 * 1024 });
      return Number(stdout.trim()) as T;
    },
  };
  const key = randomBytes(32);
  const first = new RedisPhoneOtpChallenge(port, key, 'encho:test:otp:v2');
  const second = new RedisPhoneOtpChallenge(port, key, 'encho:test:otp:v2');
  const phone = '+919199900123';
  assert.ok(await first.issue(phone, '192.0.2.1', '123456'));
  const phoneHash = createHmac('sha256', key).update('phone').update('\0').update(phone).digest('hex');
  const phoneTag = `{${phoneHash}}`;
  const ttl = async (suffix: string) => Number((await execFileAsync(redisCli,
    ['-s', socket, 'TTL', `encho:test:otp:v2:${phoneTag}:${suffix}`])).stdout.trim());
  assert.ok((await ttl('challenge')) > 0 && (await ttl('challenge')) <= 300);
  assert.ok((await ttl('issue')) > 0 && (await ttl('issue')) <= 3600);
  assert.deepEqual((await Promise.all([
    first.verify(phone, '192.0.2.2', '123456'), second.verify(phone, '192.0.2.3', '123456'),
  ])).sort(), ['INVALID', 'VERIFIED']);

  const old = await first.issue(phone, '192.0.2.4', '111111');
  assert.ok(old);
  assert.ok(await second.issue(phone, '192.0.2.5', '222222'));
  await first.revoke(phone, old.generation);
  assert.equal(await second.verify(phone, '192.0.2.6', '222222'), 'VERIFIED');
  assert.ok(await first.issue(phone, '192.0.2.7', '333333'));
  for (let i = 0; i < 4; i += 1) {
    assert.equal(await second.verify(phone, `192.0.2.${i + 8}`, '000000'), 'INVALID');
  }
  assert.equal(await first.verify(phone, '192.0.2.12', '333333'), 'INVALID');
  assert.ok(await first.issue(phone, '192.0.2.13', '444444'));
  assert.equal(await second.verify(phone, '192.0.2.14', '444444'), 'VERIFIED');
  assert.equal(await first.issue(phone, '192.0.2.15', '555555'), null);
  process.stdout.write('Disposable Redis OTP issue/consume/revoke/rate-limit checks passed\n');
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
  await rm(directory, { recursive: true, force: true });
}
