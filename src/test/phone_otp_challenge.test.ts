import { describe, expect, it } from 'vitest';
import {
  createPhoneOtpChallengeFromEnv,
  normalizeOtpPhone,
  RedisPhoneOtpChallenge,
  type OtpEvalPort,
} from '../server/auth/phoneOtpChallenge.js';

type Challenge = { digest: string; generation: string; attempts: number; expiresAt: number };
type Counter = { value: number; expiresAt: number };

/** Local semantics fixture for independent service instances. It tests the
 * integration contract; exact Lua execution still requires isolated Redis. */
class SharedEvalFixture implements OtpEvalPort {
  readonly challenges = new Map<string, Challenge>();
  readonly counters = new Map<string, Counter>();
  now = 1_000_000;

  private increment(key: string, seconds: number): number {
    const old = this.counters.get(key);
    const current = old && old.expiresAt > this.now ? old : { value: 0, expiresAt: this.now + seconds * 1000 };
    current.value += 1;
    this.counters.set(key, current);
    return current.value;
  }

  async eval<T>(script: string, keys: string[], args: (string | number)[]): Promise<T> {
    let result: number;
    if (script.startsWith('-- encho-phone-otp-ip-counter-v2')) {
      result = Number(this.increment(keys[0], Number(args[0])) <= Number(args[1]));
    } else if (script.startsWith('-- encho-phone-otp-issue-v2')) {
      const phoneCount = this.increment(keys[1], Number(args[2]));
      if (phoneCount > Number(args[3])) result = 0;
      else {
        this.challenges.set(keys[0], {
          digest: String(args[0]), generation: String(args[1]), attempts: 0,
          expiresAt: this.now + Number(args[4]) * 1000,
        });
        result = 1;
      }
    } else if (script.startsWith('-- encho-phone-otp-verify-v2')) {
      const challenge = this.challenges.get(keys[0]);
      if (!challenge || challenge.expiresAt <= this.now) {
        this.challenges.delete(keys[0]);
        result = 0;
      } else {
        challenge.attempts += 1;
        result = challenge.attempts <= Number(args[1]) && challenge.digest === args[0] ? 1 : 0;
        if (result === 1 || challenge.attempts >= Number(args[1])) this.challenges.delete(keys[0]);
      }
    } else if (script.startsWith('-- encho-phone-otp-revoke-v1')) {
      const challenge = this.challenges.get(keys[0]);
      result = challenge?.generation === args[0] ? Number(this.challenges.delete(keys[0])) : 0;
    } else throw new Error('Unknown OTP script');
    return result as T;
  }
}

const key = Buffer.alloc(32, 7);

describe('shared phone OTP challenge authority', () => {
  it('normalizes explicit international numbers and rejects ambiguous local numbers', () => {
    expect(normalizeOtpPhone(' +91 (91999) 00123 ')).toBe('+919199900123');
    expect(() => normalizeOtpPhone('9199900123')).toThrow('PHONE_INVALID');
  });

  it('issues on one instance, verifies once on another, and never stores a raw phone or code in a key', async () => {
    const redis = new SharedEvalFixture();
    const a = new RedisPhoneOtpChallenge(redis, key);
    const b = new RedisPhoneOtpChallenge(redis, key);
    expect(await a.issue('+919199900123', '192.0.2.1', '123456')).toMatchObject({ phone: '+919199900123' });
    expect([...redis.challenges.keys()].join(' ')).not.toContain('919199900123');
    expect([...redis.challenges.values()][0].digest).not.toContain('123456');
    expect(await b.verify('+919199900123', '192.0.2.1', '123456')).toBe('VERIFIED');
    expect(await a.verify('+919199900123', '192.0.2.1', '123456')).toBe('INVALID');
  });

  it('bounds wrong guesses, expiry and cross-instance IP attempts', async () => {
    const redis = new SharedEvalFixture();
    const a = new RedisPhoneOtpChallenge(redis, key);
    const b = new RedisPhoneOtpChallenge(redis, key);
    await a.issue('+919199900123', '192.0.2.2', '123456');
    expect(await b.verify('+919199900123', '192.0.2.2', '000000')).toBe('INVALID');
    expect(await a.verify('+919199900123', '192.0.2.2', '000001')).toBe('INVALID');
    expect(await b.verify('+919199900123', '192.0.2.2', '000002')).toBe('INVALID');
    expect(await a.verify('+919199900123', '192.0.2.2', '123456')).toBe('VERIFIED');
    expect(await b.verify('+919199900123', '192.0.2.2', '123456')).toBe('INVALID');

    await a.issue('+919199900124', '192.0.2.3', '654321');
    redis.now += 301_000;
    expect(await b.verify('+919199900124', '192.0.2.4', '654321')).toBe('INVALID');
  });

  it('revokes only the failed delivery generation, preserving a newer concurrent issue', async () => {
    const redis = new SharedEvalFixture();
    const a = new RedisPhoneOtpChallenge(redis, key);
    const b = new RedisPhoneOtpChallenge(redis, key);
    const first = await a.issue('+919199900123', '192.0.2.5', '123456');
    const second = await b.issue('+919199900123', '192.0.2.5', '654321');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    await a.revoke('+919199900123', first!.generation);
    expect(await b.verify('+919199900123', '192.0.2.6', '654321')).toBe('VERIFIED');
  });

  it('has exactly one winner when independent instances verify concurrently', async () => {
    const redis = new SharedEvalFixture();
    const a = new RedisPhoneOtpChallenge(redis, key);
    const b = new RedisPhoneOtpChallenge(redis, key);
    await a.issue('+919199900123', '192.0.2.10', '654321');
    const results = await Promise.all([
      a.verify('+919199900123', '192.0.2.11', '654321'),
      b.verify('+919199900123', '192.0.2.12', '654321'),
    ]);
    expect(results.sort()).toEqual(['INVALID', 'VERIFIED']);
  });

  it('enforces shared issue limits and fails closed on a store outage', async () => {
    const redis = new SharedEvalFixture();
    const a = new RedisPhoneOtpChallenge(redis, key);
    const b = new RedisPhoneOtpChallenge(redis, key);
    for (let n = 0; n < 5; n += 1) {
      expect(await (n % 2 ? a : b).issue('+919199900123', `192.0.2.${n + 20}`, '123456')).not.toBeNull();
    }
    expect(await b.issue('+919199900123', '192.0.2.30', '123456')).toBeNull();
    const unavailable = new RedisPhoneOtpChallenge({ eval: async () => { throw new Error('store outage'); } }, key);
    await expect(unavailable.issue('+919199900124', '192.0.2.31', '654321')).rejects.toThrow('store outage');
    await expect(unavailable.verify('+919199900124', '192.0.2.31', '654321')).rejects.toThrow('store outage');
  });

  it('uses separate IP budgets and a common phone hash slot for issue scripts', async () => {
    const redis = new SharedEvalFixture();
    const authority = new RedisPhoneOtpChallenge(redis, key);
    await authority.issue('+919199900123', '192.0.2.41', '123456');
    const [challenge, issue] = [...redis.challenges.keys(), ...redis.counters.keys()].filter(k => k.includes('{'));
    expect(challenge.match(/\{[^}]+\}/)?.[0]).toBe(issue.match(/\{[^}]+\}/)?.[0]);
    expect([...redis.counters.keys()].some(k => k.includes(':ip:issue:'))).toBe(true);
    await authority.verify('+919199900123', '192.0.2.41', '123456');
    expect([...redis.counters.keys()].some(k => k.includes(':ip:verify:'))).toBe(true);
  });

  it('fails closed without separate canonical shared-store credentials', () => {
    expect(createPhoneOtpChallengeFromEnv({})).toBeNull();
    expect(createPhoneOtpChallengeFromEnv({
      PHONE_OTP_REDIS_REST_URL: 'http://redis.invalid',
      PHONE_OTP_REDIS_REST_TOKEN: 'fixture',
      PHONE_OTP_HMAC_KEY: key.toString('base64url'),
    })).toBeNull();
    expect(createPhoneOtpChallengeFromEnv({
      PHONE_OTP_REDIS_REST_URL: 'https://redis.invalid',
      PHONE_OTP_REDIS_REST_TOKEN: 'fixture',
      PHONE_OTP_HMAC_KEY: 'short',
    })).toBeNull();
  });
});
