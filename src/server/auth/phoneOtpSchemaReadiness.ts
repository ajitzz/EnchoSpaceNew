import type pg from 'pg';

// Read-only deployment check. A legacy users table can have `phone` while
// retaining `email NOT NULL`; sending an OTP there would consume a paid
// message for a phone-only identity the database cannot enroll.
export async function phoneOtpEnrollmentSchemaReady(pool: Pick<pg.Pool, 'query'>): Promise<boolean> {
  const result = await pool.query<{ column_name: string; is_nullable: string }>(
    `/* cr1-phone-otp-schema-readiness */
     SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'
       AND column_name IN ('email', 'phone')`);
  const columns = new Map(result.rows.map(row => [row.column_name, row.is_nullable]));
  return columns.get('email') === 'YES' && columns.has('phone');
}
