import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {phoneOtpEnrollmentSchemaReady} from '../../server/auth/phoneOtpSchemaReadiness.js';
import {createLocalPostgresFixture} from './postgres.js';

describe('phone-only enrollment against disposable PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture({schema: 'empty'});
  }, 30000);
  afterAll(async () => { await fixture?.close(); });

  it('fails closed for absent, constrained and incomplete users schemas, then recognizes a nullable email', async () => {
    const pool = fixture.pool;
    expect(await phoneOtpEnrollmentSchemaReady(pool)).toBe(false);
    await pool.query('CREATE TABLE public.users (id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL, phone TEXT)');
    expect(await phoneOtpEnrollmentSchemaReady(pool)).toBe(false);
    await pool.query('ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL');
    expect(await phoneOtpEnrollmentSchemaReady(pool)).toBe(true);
    await pool.query('ALTER TABLE public.users DROP COLUMN phone');
    expect(await phoneOtpEnrollmentSchemaReady(pool)).toBe(false);
  });
});
