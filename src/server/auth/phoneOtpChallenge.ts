import { createHmac, randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { z } from 'zod';

// The Redis scripts are the cross-instance authority. A local limiter remains
// useful for load shedding, but cannot replace these atomic shared counters.
const IP_COUNTER_SCRIPT = `-- encho-phone-otp-ip-counter-v2
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
if count > tonumber(ARGV[2]) then return 0 end
return 1`;

// Both phone keys have the same Redis hash tag. The independent IP limiter is
// a separate single-key operation so this script works in clustered stores.
const ISSUE_SCRIPT = `-- encho-phone-otp-issue-v2
local count = redis.call('INCR', KEYS[2])
if count == 1 then redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3])) end
if count > tonumber(ARGV[4]) then return 0 end
redis.call('HSET', KEYS[1], 'digest', ARGV[1], 'generation', ARGV[2], 'attempts', 0)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[5]))
return 1`;

const VERIFY_SCRIPT = `-- encho-phone-otp-verify-v2
local saved = redis.call('HGET', KEYS[1], 'digest')
if not saved then return 0 end
local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
if attempts > tonumber(ARGV[2]) then redis.call('DEL', KEYS[1]); return 0 end
if saved == ARGV[1] then redis.call('DEL', KEYS[1]); return 1 end
if attempts >= tonumber(ARGV[2]) then redis.call('DEL', KEYS[1]) end
return 0`;

const REVOKE_SCRIPT = `-- encho-phone-otp-revoke-v1
if redis.call('HGET', KEYS[1], 'generation') == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

const codeSchema = z.string().regex(/^\d{6}$/);
const ipSchema = z.string().min(1).max(128);
const evalResult = z.number().int();

export class PhoneOtpInputError extends Error {
  constructor() { super('PHONE_INVALID'); }
}

export function normalizeOtpPhone(value: unknown): string {
  const raw = z.string().trim().min(8).max(32).parse(value);
  const normalized = raw.replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new PhoneOtpInputError();
  return normalized;
}

export interface OtpEvalPort {
  eval<T = unknown>(script: string, keys: string[], args: (string | number)[]): Promise<T>;
}

export class RedisPhoneOtpChallenge {
  private readonly secret: Buffer;

  constructor(private readonly redis: OtpEvalPort, key: Buffer, private readonly namespace = 'encho:auth:otp:v1') {
    if (key.length !== 32 || !/^[a-z0-9:-]+$/i.test(namespace)) throw new Error('OTP_CONFIG_INVALID');
    this.secret = Buffer.from(key);
  }

  private digest(kind: string, value: string): string {
    return createHmac('sha256', this.secret).update(kind).update('\0').update(value).digest('hex');
  }

  private phoneTag(phone: string): string { return `{${this.digest('phone', phone)}}`; }
  private challengeKey(phone: string): string { return `${this.namespace}:${this.phoneTag(phone)}:challenge`; }
  private phoneIssueKey(phone: string): string { return `${this.namespace}:${this.phoneTag(phone)}:issue`; }
  private ipKey(kind: 'issue' | 'verify', ip: string): string { return `${this.namespace}:ip:${kind}:${this.digest('ip', ip)}`; }
  private codeDigest(phone: string, code: string): string { return this.digest('code', `${phone}\0${code}`); }

  async issue(phoneInput: unknown, ipInput: unknown, codeInput: unknown): Promise<{ generation: string; phone: string } | null> {
    const phone = normalizeOtpPhone(phoneInput);
    const ip = ipSchema.parse(ipInput);
    const code = codeSchema.parse(codeInput);
    const generation = randomUUID();
    const allowedIp = evalResult.parse(await this.redis.eval(IP_COUNTER_SCRIPT, [this.ipKey('issue', ip)], [3600, 100]));
    if (allowedIp === 0) return null;
    if (allowedIp !== 1) throw new Error('OTP_STORE_INVALID_RESULT');
    const result = evalResult.parse(await this.redis.eval(ISSUE_SCRIPT,
      [this.challengeKey(phone), this.phoneIssueKey(phone)],
      [this.codeDigest(phone, code), generation, 3600, 5, 300]));
    if (result === 1) return { generation, phone };
    if (result === 0) return null;
    throw new Error('OTP_STORE_INVALID_RESULT');
  }

  async verify(phoneInput: unknown, ipInput: unknown, codeInput: unknown): Promise<'VERIFIED' | 'INVALID' | 'RATE_LIMITED'> {
    const phone = normalizeOtpPhone(phoneInput);
    const ip = ipSchema.parse(ipInput);
    const code = codeSchema.parse(codeInput);
    const allowedIp = evalResult.parse(await this.redis.eval(IP_COUNTER_SCRIPT, [this.ipKey('verify', ip)], [3600, 300]));
    if (allowedIp === 0) return 'RATE_LIMITED';
    if (allowedIp !== 1) throw new Error('OTP_STORE_INVALID_RESULT');
    const result = evalResult.parse(await this.redis.eval(VERIFY_SCRIPT,
      [this.challengeKey(phone)],
      [this.codeDigest(phone, code), 4]));
    if (result === 1) return 'VERIFIED';
    if (result === 0) return 'INVALID';
    throw new Error('OTP_STORE_INVALID_RESULT');
  }

  async revoke(phoneInput: unknown, generation: string): Promise<void> {
    const phone = normalizeOtpPhone(phoneInput);
    z.string().uuid().parse(generation);
    const result = evalResult.parse(await this.redis.eval(REVOKE_SCRIPT, [this.challengeKey(phone)], [generation]));
    if (result !== 0 && result !== 1) throw new Error('OTP_STORE_INVALID_RESULT');
  }
}

/** Dedicated credentials keep ephemeral auth challenges out of the public-cache
 * Redis identity. Missing or malformed configuration disables phone OTP. */
export function createPhoneOtpChallengeFromEnv(env: NodeJS.ProcessEnv = process.env): RedisPhoneOtpChallenge | null {
  const url = env.PHONE_OTP_REDIS_REST_URL;
  const token = env.PHONE_OTP_REDIS_REST_TOKEN;
  const encodedKey = env.PHONE_OTP_HMAC_KEY;
  if (!url || !token || !encodedKey || !/^https:\/\//.test(url)) return null;
  const key = Buffer.from(encodedKey, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== encodedKey) return null;
  try { return new RedisPhoneOtpChallenge(new Redis({ url, token }), key); }
  catch { return null; }
}
